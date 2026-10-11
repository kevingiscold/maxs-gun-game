// Online session: socket lifecycle, room actions, ping, WebRTC mesh wiring.
import { io } from 'socket.io-client';
import { useStore } from '../store.js';
import { useMedia, acquireLocalMedia } from './media.js';
import { Mesh } from './rtc.js';
import { PHASE } from '../../shared/constants.js';
import { parseInvite } from './invite.js';
import { receiveGhost, clearGhosts } from '../three/Ghosts.jsx';
import { unlockPointer } from '../three/input.js';

let socket = null;
let socketServer = null; // null = the server this page was loaded from
let mesh = null;
let pingTimer = null;

function ensureSocket(server = null) {
  if (socket && socketServer === server) return socket;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    mesh?.destroy(); // peer links were signalled through the old server
    mesh = null;
  }
  socketServer = server;
  // server === null: same origin (Vite proxies /socket.io in dev; the desktop
  // app and production serve the client from the game server itself).
  const opts = { transports: ['websocket', 'polling'], autoConnect: false };
  socket = server ? io(server, opts) : io(opts);

  socket.on('room:state', (room) => {
    const st = useStore.getState();
    useStore.setState({ room, mode: 'online', roomServer: socketServer });
    st.setGame(room.game, room.you);
    // New turn: old tells are stale. New match (or back in the lobby): you're alive again.
    if (room.game?.phase === PHASE.AIMING) useStore.setState({ emotes: {} });
    if (!room.game || (room.game.turn === 1 && room.game.phase === PHASE.AIMING)) {
      useStore.setState({ deathAt: 0 });
      clearGhosts();
    }

    if (!mesh) mesh = new Mesh(socket, room.you);
    mesh.sync(room.members.filter((m) => !m.isBot).map((m) => m.id));
    const g = room.game;
    const inDuel =
      !!g && g.phase !== PHASE.GAMEOVER && (g.shooterId === room.you || g.targetId === room.you);
    mesh.setSendingVideo(inDuel);

    if (room.status === 'playing' && st.screen !== 'game') st.setScreen('game');
    if (room.status === 'lobby' && st.screen === 'game') st.setScreen('lobby');
  });

  // Other ghosts. The server only sends these to players who are dead.
  socket.on('ghost:pose', receiveGhost);

  socket.on('room:emote', ({ id, text } = {}) => {
    useStore.setState((s) => ({ emotes: { ...s.emotes, [id]: { text: String(text).slice(0, 40), at: Date.now() } } }));
  });

  socket.on('disconnect', () => {
    const st = useStore.getState();
    if (st.mode === 'online' && st.room) {
      st.showToast('Lost connection to the server.');
      teardown();
      st.setScreen('menu');
    }
  });

  return socket;
}

function startPing() {
  clearInterval(pingTimer);
  const tick = () => {
    const t0 = performance.now();
    socket?.emit('net:ping', 0, () => socket?.emit('net:report', performance.now() - t0));
  };
  tick();
  pingTimer = setInterval(tick, 3000);
}

function profilePayload() {
  const st = useStore.getState();
  return { name: st.displayName(), avatar: st.profile.avatar };
}

async function enterRoom(eventName, extra, server = null) {
  const s = ensureSocket(server);
  if (!s.connected) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        s.off('connect', ok);
        reject(new Error(server ? `Couldn't reach ${server.replace(/^https?:\/\//, '')}. Is the host still online?` : 'Game server unreachable.'));
      }, 15000);
      const ok = () => {
        clearTimeout(timer);
        resolve();
      };
      s.once('connect', ok);
      s.connect();
    });
  }
  const res = await new Promise((r) => s.emit(eventName, { ...profilePayload(), ...extra }, r));
  if (!res?.ok) throw new Error(res?.error || 'Could not join.');
  startPing();
  // Camera is optional: if it fails the player joins voice/video-less.
  const { camId, micId } = useStore.getState().settings;
  acquireLocalMedia({ camId, micId }).then(() => mesh?.refreshLocalTracks());
  useStore.getState().setScreen('lobby');
  return res.code;
}

export const session = {
  /** Host on the server this page came from (in the desktop app: this PC). */
  createRoom: () => enterRoom('room:create'),
  /** `input` is a bare room code or a full invite ("host/CODE"). */
  joinRoom(input) {
    const inv = parseInvite(input);
    if (!inv) return Promise.reject(new Error("That isn't a room code or invite."));
    return enterRoom('room:join', { code: inv.code }, inv.server);
  },
  update: (patch) => socket?.emit('player:update', patch),
  start: () => new Promise((r) => socket.emit('room:start', {}, r)),
  addBot: () => socket?.emit('room:addBot', {}),
  /** While you're a ghost: where you're floating (relayed to other ghosts only). */
  sendGhost: (p, yaw) => socket?.volatile.emit('ghost:pose', { p, yaw }),
  removeBot: (id) => socket?.emit('room:removeBot', { id }),
  act: (action) => new Promise((r) => socket.emit('game:action', { action }, r)),
  reset: () => socket?.emit('room:reset'),
  leave() {
    unlockPointer();
    socket?.emit('room:leave');
    teardown();
    useStore.getState().setScreen('menu');
  },
  refreshMedia: () => mesh?.refreshLocalTracks(),
  setVoiceRoute: (iAmGhost, ghostIds) => mesh?.setVoiceRoute(iAmGhost, ghostIds),
};

function teardown() {
  clearInterval(pingTimer);
  window.gunApp?.stopTunnel();
  useStore.setState({ tunnelUrl: null });
  mesh?.destroy();
  mesh = null;
  useMedia.getState().local?.getTracks().forEach((t) => t.stop());
  useMedia.setState({ local: null, remote: {}, remoteVideoLive: {} });
  useStore.setState({ room: null, mode: null, game: null, myId: null });
}
