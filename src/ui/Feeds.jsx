// Exactly two video feeds during a duel: Shooter (left) and Target (right).
// Everyone else's video isn't shown (and isn't even sent — see rtc.js).
//
// The video itself is drawn by the 3D renderer (three/FeedScreens.jsx) as a
// texture behind this transparent frame: a <video> layered over the WebGL
// canvas cost ~20 fps on integrated GPUs.
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { useMedia, makePlaceholderStream } from '../net/media.js';
import { FaceIcon } from './FaceIcon.jsx';
import { session } from '../net/session.js';
import { visiblyAlive } from '../three/choreo.js';
import { PHASE } from '../../shared/constants.js';

/** Hand the stream to the 3D layer for as long as this frame is on screen. */
function useGLFeed(role, stream, mirror) {
  useEffect(() => {
    useMedia.setState((s) => ({ feedGL: { ...s.feedGL, [role]: stream ? { stream, mirror } : null } }));
    return () => useMedia.setState((s) => ({ feedGL: { ...s.feedGL, [role]: null } }));
  }, [role, stream, mirror]);
}

const botCams = new Map();
function botCam(p) {
  if (!botCams.has(p.id)) botCams.set(p.id, makePlaceholderStream(p.name, 20 + botCams.size * 90));
  return botCams.get(p.id);
}

function useStreamFor(id) {
  const myId = useStore((s) => s.myId);
  const player = useStore((s) => s.game?.players.find((p) => p.id === id));
  const local = useMedia((s) => s.local);
  const remote = useMedia((s) => s.remote[id]);
  const live = useMedia((s) => s.remoteVideoLive[id]);
  if (!id) return null;
  if (player?.isBot) return botCam(player);
  if (id === myId) return local?.getVideoTracks().length ? local : null;
  return remote && live ? remote : null;
}

function Feed({ id, role }) {
  const game = useStore((s) => s.game);
  const myId = useStore((s) => s.myId);
  const stream = useStreamFor(id);
  useGLFeed(role, stream, id === myId);
  const p = game?.players.find((x) => x.id === id);
  if (!p) return null;
  return (
    <div className={`feed ${role}`}>
      <div className={`feed-frame ${stream ? 'gl' : ''}`}>
        {stream ? null : (
          <div className="feed-off">
            <FaceIcon avatar={p.avatar} size={84} />
            <span>no camera</span>
          </div>
        )}
        <div className="feed-scan" />
      </div>
      <div className="feed-label">
        <span className="feed-role">{role}</span>
        <span>
          {p.name}
          {id === myId ? ' (you)' : ''}
        </span>
      </div>
    </div>
  );
}

export function Feeds() {
  const game = useStore((s) => s.game);
  useEffect(
    () => () => {
      botCams.forEach((s) => s.stopPlaceholder?.());
      botCams.clear();
    },
    [],
  );
  if (!game || !game.shooterId) return null;
  const sId = game.result?.shooterId ?? game.shooterId;
  const tId = game.result?.targetId ?? game.targetId;
  return (
    <div className="feeds">
      <Feed id={sId} role="shooter" />
      <Feed id={tId} role="target" />
    </div>
  );
}

/**
 * Who is a ghost right now, by what's been SHOWN (the server marks a player dead
 * the moment the trigger is decided; going by that would cut their voice before
 * the bang and spoil the shot).
 */
function useGhostIds() {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    const tick = () => {
      const st = useStore.getState();
      const g = st.game;
      const live = g && g.phase !== PHASE.GAMEOVER;
      const el = performance.now() - st.phaseLocalStart;
      const now = live ? g.players.filter((p) => !p.isBot && !visiblyAlive(p, g, el)).map((p) => p.id) : [];
      setIds((prev) => (prev.join() === now.join() ? prev : now));
    };
    tick();
    const t = setInterval(tick, 150);
    return () => clearInterval(t);
  }, []);
  return ids;
}

/**
 * Hidden <audio> per remote peer, on two channels: the living hear only the
 * living; ghosts hear everyone. (Ghosts also stop *sending* to the living —
 * session.setVoiceRoute — this side just makes sure nothing leaks through.)
 */
export function RemoteAudio() {
  const remote = useMedia((s) => s.remote);
  const vol = useStore((s) => s.settings.voiceVolume);
  const myId = useStore((s) => s.myId);
  const ghostIds = useGhostIds();
  const iAmGhost = ghostIds.includes(myId);
  useEffect(() => {
    session.setVoiceRoute(iAmGhost, ghostIds);
  }, [iAmGhost, ghostIds]);
  useEffect(() => () => session.setVoiceRoute(false, []), []);
  return (
    <div style={{ display: 'none' }}>
      {Object.entries(remote).map(([id, stream]) => (
        <AudioEl key={id} stream={stream} volume={vol} muted={!iAmGhost && ghostIds.includes(id)} />
      ))}
    </div>
  );
}

function AudioEl({ stream, volume, muted }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);
  // set as a property: React's `muted` prop doesn't reliably reach the element
  useEffect(() => {
    if (ref.current) ref.current.muted = !!muted;
  }, [muted]);
  return <audio ref={ref} autoPlay />;
}
