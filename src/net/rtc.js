// Full WebRTC mesh (max 6 players = 15 links) using the "perfect negotiation"
// pattern, signalled through the game server. The living hear the living,
// ghosts hear everyone (see setVoiceRoute); video
// is only *sent* while you're the Shooter or Target, so idle players cost no
// upstream bandwidth.

import { useMedia } from './media.js';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

export class Mesh {
  constructor(socket, myId) {
    this.socket = socket;
    this.myId = myId;
    this.peers = new Map(); // id -> { pc, polite, makingOffer, ignoreOffer, stream }
    this.sendVideo = false;
    this.iAmGhost = false;
    this.ghostIds = new Set();
    this.voiceKey = '';
    this.onSignal = ({ from, data }) => this._handle(from, data);
    this.onLeft = ({ id }) => this.remove(id);
    socket.on('rtc:signal', this.onSignal);
    socket.on('rtc:peer-left', this.onLeft);
  }

  /** Keep links in step with the room roster. */
  sync(memberIds) {
    for (const id of memberIds) if (id !== this.myId && !this.peers.has(id)) this._create(id);
    for (const id of [...this.peers.keys()]) if (!memberIds.includes(id)) this.remove(id);
  }

  /** Called when the local stream changes (device switch, permission granted later). */
  refreshLocalTracks() {
    for (const peer of this.peers.values()) this._attachLocal(peer);
  }

  /**
   * Two voice channels. The living talk to everyone (ghosts listen in); a ghost
   * only talks to other ghosts. Enforced here, on the sending side: a ghost's
   * microphone simply isn't sent to living players.
   */
  setVoiceRoute(iAmGhost, ghostIds) {
    const key = `${iAmGhost}:${[...ghostIds].sort().join(',')}`;
    if (key === this.voiceKey) return;
    this.voiceKey = key;
    this.iAmGhost = iAmGhost;
    this.ghostIds = new Set(ghostIds);
    for (const peer of this.peers.values()) this._attachLocal(peer);
  }

  _sendsVoiceTo(id) {
    return !this.iAmGhost || this.ghostIds.has(id);
  }

  setSendingVideo(on) {
    if (this.sendVideo === on) return;
    this.sendVideo = on;
    for (const peer of this.peers.values()) this._attachLocal(peer);
  }

  remove(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    this.peers.delete(id);
    useMedia.setState((s) => {
      const remote = { ...s.remote };
      const remoteVideoLive = { ...s.remoteVideoLive };
      delete remote[id];
      delete remoteVideoLive[id];
      return { remote, remoteVideoLive };
    });
  }

  destroy() {
    this.socket.off('rtc:signal', this.onSignal);
    this.socket.off('rtc:peer-left', this.onLeft);
    for (const id of [...this.peers.keys()]) this.remove(id);
  }

  // ---- internals ----

  _send(to, data) {
    this.socket.emit('rtc:signal', { to, data });
  }

  _create(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer = {
      id,
      pc,
      polite: this.myId > id, // deterministic tie-break for offer collisions
      makingOffer: false,
      ignoreOffer: false,
      stream: new MediaStream(),
      senders: { audio: null, video: null },
    };
    this.peers.set(id, peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this._send(id, { description: pc.localDescription });
      } catch (e) {
        console.warn('[rtc] offer failed', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => candidate && this._send(id, { candidate });
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };
    pc.ontrack = ({ track }) => {
      if (!peer.stream.getTracks().includes(track)) peer.stream.addTrack(track);
      if (track.kind === 'video') {
        const mark = () =>
          useMedia.setState((s) => ({ remoteVideoLive: { ...s.remoteVideoLive, [id]: !track.muted } }));
        track.onmute = mark;
        track.onunmute = mark;
        mark();
      }
      // new object so subscribers re-render
      useMedia.setState((s) => ({ remote: { ...s.remote, [id]: peer.stream } }));
    };

    this._attachLocal(peer);
    return peer;
  }

  _attachLocal(peer) {
    const local = useMedia.getState().local;
    if (!local) return;
    for (const kind of ['audio', 'video']) {
      const track = local.getTracks().find((t) => t.kind === kind) || null;
      let wanted = track;
      if (kind === 'video' && !this.sendVideo) wanted = null;
      if (kind === 'audio' && !this._sendsVoiceTo(peer.id)) wanted = null;
      const sender = peer.senders[kind];
      if (sender) {
        if (sender.track !== wanted) sender.replaceTrack(wanted).catch(() => {});
      } else if (track) {
        // Add the sender once (triggers negotiation), then gate video with replaceTrack.
        peer.senders[kind] = peer.pc.addTrack(track, local);
        if (!wanted) peer.senders[kind].replaceTrack(null).catch(() => {});
      }
    }
  }

  async _handle(from, { description, candidate } = {}) {
    const peer = this.peers.get(from) || this._create(from);
    const { pc } = peer;
    try {
      if (description) {
        const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this._send(from, { description: pc.localDescription });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {
          if (!peer.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn('[rtc] signal error', e);
    }
  }
}
