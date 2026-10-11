// Turns (game view, elapsed phase time) into poses for avatars and the gun.
// Pure functions of time, so every client renders the same moment identically.
import * as THREE from 'three';
import { PHASE, OUTCOME, TIMING } from '../../shared/constants.js';
import { LOCAL, TABLE_HEIGHT, seat, seatPoint } from './layout.js';

export function seatIndexMap(players) {
  const m = new Map();
  players.forEach((p, i) => m.set(p.id, i));
  return m;
}

/** Is this player visibly alive at `elapsed` ms into the current phase? */
export function visiblyAlive(p, g, elapsed) {
  if (p.alive) return true;
  if (g?.phase === PHASE.RESOLVING) {
    const e = g.result?.eliminated.find((x) => x.id === p.id);
    if (e && elapsed < e.at) return true;
  }
  return false;
}

export function avatarPose(p, g, elapsed) {
  if (!g) return 'rest';
  if (!visiblyAlive(p, g, elapsed)) return 'dead';
  const isShooter = p.id === g.shooterId || p.id === g.result?.shooterId;
  if (g.phase === PHASE.AIMING || g.phase === PHASE.DECISION) {
    return p.id === g.shooterId ? 'aim' : 'rest';
  }
  if (g.phase === PHASE.RESOLVING && isShooter && p.id === g.result.shooterId) {
    const o = g.result.outcome;
    if (o === OUTCOME.MISFIRE) return elapsed < TIMING.selfAim ? 'aim' : 'self';
    if (o === OUTCOME.SURVIVED) return elapsed < TIMING.selfAim ? 'aim' : elapsed < TIMING.selfShot + 1400 ? 'self' : 'rest';
    if (o === OUTCOME.KILL) return 'aim';
    return elapsed < 1600 ? 'aim' : 'rest';
  }
  return 'rest';
}

export function flinching(p, g, elapsed) {
  if (g?.phase !== PHASE.RESOLVING) return false;
  const near = (t) => elapsed > t && elapsed < t + 260;
  if (g.result.outcome === OUTCOME.MISFIRE && p.id === g.result.targetId && near(TIMING.trigger)) return true;
  if (g.result.outcome === OUTCOME.KILL && near(TIMING.trigger)) return true;
  if (g.result.outcome === OUTCOME.MISFIRE && near(TIMING.selfShot)) return true;
  if (g.result.outcome === OUTCOME.SURVIVED && p.id === g.result.shooterId && near(TIMING.selfShot)) return true;
  return false;
}

/** Where should `p` be looking? */
export function lookTarget(p, g, idx, n, out) {
  if (!g || !g.shooterId) {
    if (g?.phase === PHASE.GAMEOVER && g.winnerId && p.id !== g.winnerId) {
      return seatPoint(idx.get(g.winnerId), n, LOCAL.head, out);
    }
    return null;
  }
  const s = idx.get(g.result?.shooterId ?? g.shooterId);
  const t = idx.get(g.result?.targetId ?? g.targetId);
  if (s === undefined || t === undefined) return null;
  if (p.id === g.shooterId) return seatPoint(t, n, LOCAL.head, out);
  if (p.id === g.targetId) return seatPoint(s, n, LOCAL.head, out);
  // spectators watch the target sweat
  return seatPoint(t, n, LOCAL.head, out);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const tableCenter = new THREE.Vector3(0, TABLE_HEIGHT, 0);

/**
 * Revolver pose. Returns {position, lookAt|rotation, spin, tremble, holderId}.
 * `holderId` is whose right hand grips it (their arm reaches for the grip with
 * IK in Avatar.jsx); null when it lies on the table.
 */
export function gunPose(g, players, elapsed, clock) {
  const n = players.length;
  const idx = seatIndexMap(players);
  const lying = (position, rotY) => ({ position, rotation: new THREE.Euler(0, rotY, Math.PI / 2), holderId: null });
  const center = () => lying(new THREE.Vector3(0, TABLE_HEIGHT + 0.035, 0), clock * 0.15);

  if (!g || !n) return center();

  if (g.phase === PHASE.GAMEOVER) {
    const w = idx.get(g.winnerId);
    if (w === undefined) return center();
    return lying(seatPoint(w, n, new THREE.Vector3(0.1, TABLE_HEIGHT + 0.035, 0.75)), seat(w, n).rotY + 0.6);
  }

  const r = g.result;
  const si = idx.get(r?.shooterId ?? g.shooterId);
  const ti = idx.get(r?.targetId ?? g.targetId);
  if (si === undefined || ti === undefined) return center();
  const shooterId = players[si].id;
  const targetId = players[ti].id;

  const aim = (extra = {}) => ({
    position: seatPoint(si, n, LOCAL.hand, _a.clone()),
    lookAt: seatPoint(ti, n, LOCAL.head, _b.clone()),
    holderId: shooterId,
    ...extra,
  });
  const toTemple = (extra = {}) => ({
    position: seatPoint(si, n, LOCAL.temple, _a.clone()),
    lookAt: seatPoint(si, n, LOCAL.templeAim, _b.clone()),
    holderId: shooterId,
    ...extra,
  });
  // gun lowered over the table in front of the target, barrel down at the felt
  const handedTo = () => ({
    position: seatPoint(ti, n, LOCAL.handLow, _a.clone()),
    lookAt: tableCenter.clone().setY(TABLE_HEIGHT - 0.4),
    holderId: targetId,
  });

  if (g.phase === PHASE.AIMING) return aim({ spin: Math.max(0, 1 - elapsed / 3400) });
  if (g.phase === PHASE.DECISION) return aim({ tremble: true });

  // RESOLVING
  switch (r.outcome) {
    case OUTCOME.KILL:
      return aim({ tremble: elapsed < TIMING.trigger });
    case OUTCOME.SURVIVED:
      if (elapsed < TIMING.selfAim) return aim({ tremble: elapsed < TIMING.trigger });
      if (elapsed < TIMING.selfShot + 1400) return toTemple({ tremble: elapsed < TIMING.selfShot });
      return handedTo();
    case OUTCOME.MISFIRE:
      if (elapsed < TIMING.selfAim) return aim({ tremble: elapsed < TIMING.trigger });
      if (elapsed < TIMING.selfShot + 250) return toTemple({ tremble: elapsed < TIMING.selfShot });
      // the hand goes slack; the gun drops to the table in front of the body
      return lying(seatPoint(si, n, new THREE.Vector3(-0.15, TABLE_HEIGHT + 0.035, 0.62)), seat(si, n).rotY + 2.2);
    default:
      // pass / timeout: lowered slowly, then slid across to the target
      if (elapsed < 1600) return aim();
      return handedTo();
  }
}
