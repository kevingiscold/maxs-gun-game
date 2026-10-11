// Murder! on the client: where everyone is looking, who's in your sights, and
// turning the server's cock/shot events into sound. The server already decides
// what you may know (in the dark the living get no names); this only renders it.
import * as THREE from 'three';
import { useStore } from '../store.js';
import { LOCAL, seatPoint } from './layout.js';
import { seatIndexMap } from './choreo.js';
import { fx } from './fx.js';
import { sfx } from '../audio/sfx.js';

const CHEST = new THREE.Vector3(0, 1.05, 0.02);

/** id -> { yaw, pitch, at } — where other living players are looking (relayed by the server). */
export const aims = new Map();

export function receiveAim({ id, yaw, pitch, at } = {}) {
  if (typeof id !== 'string') return;
  if (typeof at === 'string') aims.set(id, { at, t: performance.now() });
  else if (Number.isFinite(yaw) && Number.isFinite(pitch)) aims.set(id, { yaw, pitch, t: performance.now() });
}

export function clearAims() {
  aims.clear();
}

/** The player currently under your crosshair (updated every frame by the scene). */
export const sights = { targetId: null };

export function dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** World direction someone else is looking, or null if we haven't heard. */
export function lookDir(id, idx, n, out) {
  const a = aims.get(id);
  if (!a || !idx.has(id)) return null;
  if (a.at) {
    if (!idx.has(a.at)) return null;
    seatPoint(idx.get(a.at), n, LOCAL.head, _a);
    seatPoint(idx.get(id), n, LOCAL.eye, _b);
    return out.subVectors(_a, _b).normalize();
  }
  return dirFromYawPitch(a.yaw, a.pitch, out);
}

/**
 * Who you'd hit: the living player whose head or chest is closest to the
 * crosshair, within roughly a body's width. Positions are the seats, so this
 * works in the dark too — you aim from memory.
 */
export function pickTarget(camera, g, myId) {
  const idx = seatIndexMap(g.players);
  const n = g.players.length;
  camera.getWorldDirection(_fwd);
  let best = null;
  let bestScore = 1;
  for (const p of g.players) {
    if (p.id === myId || !p.alive) continue;
    for (const [local, radius] of [[LOCAL.head, 0.2], [CHEST, 0.3]]) {
      seatPoint(idx.get(p.id), n, local, _a).sub(camera.position);
      const dist = _a.length();
      const ang = _a.normalize().angleTo(_fwd);
      const score = ang / Math.atan(radius / dist);
      if (score < bestScore) {
        bestScore = score;
        best = p.id;
      }
    }
  }
  return best;
}

/** Stereo position of a player's seat relative to where you're facing (-1 left … 1 right). */
export function panFor(id) {
  const g = useStore.getState().game;
  if (!g) return 0;
  const idx = seatIndexMap(g.players);
  if (!idx.has(id)) return 0;
  seatPoint(idx.get(id), g.players.length, LOCAL.head, _a).sub(fx.cam.pos);
  _a.y = 0;
  if (_a.lengthSq() < 1e-4) return 0;
  _a.normalize();
  const right = Math.cos(fx.cam.yaw) * _a.x - Math.sin(fx.cam.yaw) * _a.z;
  return THREE.MathUtils.clamp(right * 0.85, -0.85, 0.85) || 0.001;
}

const nameOf = (id) => useStore.getState().game?.players.find((p) => p.id === id)?.name ?? 'Someone';

export function addFeed(text) {
  const now = performance.now();
  useStore.setState((s) => ({ murderFeed: [...s.murderFeed.filter((f) => now - f.at < 6000), { text, at: now, key: now + Math.random() }] }));
}

/** Someone else cocked or fired (your own clicks play locally the instant you click). */
export function onMurderFx(e) {
  const st = useStore.getState();
  if (!st.game || st.game.mode !== 'murder') return;
  if (e.type === 'cock') {
    // In the dark the living get no name: the click comes from nowhere in particular.
    sfx.cock({ pan: e.id ? panFor(e.id) : 0, level: 0.8 });
  }
  if (e.type === 'shot') {
    const now = performance.now();
    fx.shotAt = now;
    if (e.shooterId) fx.shots.set(e.shooterId, now);
    sfx.bang({ close: e.targetId === st.myId && e.killed, pan: e.shooterId ? panFor(e.shooterId) : 0 });
    if (!e.shooterId) addFeed('A shot. Somewhere in the dark.');
    else if (!e.killed) addFeed(`${nameOf(e.shooterId)} fires… and hits nothing.`);
  }
}

/**
 * Narrate what a new state reveals: the lights, new bodies, and who fired
 * (when you're allowed to know).
 */
export function onMurderState(prev, g, myId) {
  const st = useStore.getState();
  const fresh = !prev || prev.mode !== 'murder' || prev.startedAt !== g.startedAt;
  const patch = { clockOffset: g.serverNow - Date.now() };
  if (fresh) {
    clearAims();
    sights.targetId = null;
    fx.grips.clear();
    fx.shots.clear();
    Object.assign(patch, { murderFeed: [], myCocked: false, spentCycle: -1, lightsAt: performance.now(), roleAt: performance.now() });
    useStore.setState(patch);
    return;
  }
  useStore.setState(patch);
  if (prev.dark !== g.dark && g.phase === 'playing') {
    useStore.setState({ lightsAt: performance.now() });
    if (g.dark) {
      sfx.lightsOut();
      addFeed('The lights go out.');
    } else {
      sfx.lightsOn();
    }
  }
  const seen = new Set(prev.deaths.map((d) => d.id));
  const added = g.deaths.filter((d) => !seen.has(d.id));
  if (added.length && prev.dark && !g.dark) addFeed('The lights come back on…');
  for (const d of added) {
    if (d.id === myId) continue;
    const who = d.id === myId ? 'You' : nameOf(d.id);
    if (d.forfeit) addFeed(`${who} left the table.`);
    else if (d.by === myId) addFeed(`You shot ${who}.`);
    else if (d.by) addFeed(`${nameOf(d.by)} shot ${who}.`);
    else addFeed(`${who} is dead.`);
  }
  const me = g.players.find((p) => p.id === myId);
  if (st.myCocked && (!me?.alive || g.phase !== 'playing')) useStore.setState({ myCocked: false });
}
