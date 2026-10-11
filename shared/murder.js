// Murder! — pure rules. No timers, no I/O: MurderRunner (runner.js) drives these.
//
// Everyone holds a gun and can shoot anyone, any time: one click cocks it, the
// next click fires. One secret player is the murderer. Every death of anyone
// who isn't the murderer counts towards the murderer's goal — including
// innocents shot by other innocents. Kill the murderer and the table wins.
// The lights go out MURDER.first after the start, then again after every
// MURDER.gap of light, for MURDER.dark each time. In the dark everyone gets one
// shot per blackout; in the light, as many as they like. The murderer sees in
// the dark; nobody else does.
//
// What the living may know is decided only by murderView().

import { MURDER, PHASE } from './constants.js';

export const MURDER_PHASE = { PLAYING: 'playing', GAMEOVER: PHASE.GAMEOVER };
export const WINNER = { TOWN: 'town', MURDERER: 'murderer' };

/** Allowed body counts for n players: at least 3, at most 8, never more than n-1. */
export function goalRange(n) {
  const max = Math.max(MURDER.goalMin, Math.min(MURDER.goalMax, n - 1));
  return { min: MURDER.goalMin, max };
}
export function clampGoal(goal, n) {
  const { min, max } = goalRange(n);
  const g = Math.round(Number(goal));
  return Number.isFinite(g) ? Math.min(max, Math.max(min, g)) : min;
}

export const getPlayer = (s, id) => s.players.find((p) => p.id === id);

/** Server time (relative to the start) at which blackout number k (1, 2, …) begins. */
export const darkStart = (s, k) => s.firstMs + (k - 1) * (s.gapMs + s.darkMs);

export function createMurder(players, { killGoal, murdererId, now, first = MURDER.first, gap = MURDER.gap, dark = MURDER.dark }) {
  return {
    mode: 'murder',
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: !!p.isBot,
      alive: true,
      forfeited: false,
      stats: { kills: 0, shots: 0 },
    })),
    phase: MURDER_PHASE.PLAYING,
    turn: 1, // constant: the client keys phase timing off turn:phase
    shooterId: null, // classic-mode fields, unused here
    targetId: null,
    murdererId,
    killGoal: clampGoal(killGoal, players.length),
    startedAt: now,
    firstMs: first,
    gapMs: gap,
    darkMs: dark,
    dark: false,
    cycle: 0, // how many blackouts have started
    nextAt: now + first, // server time of the next lights change
    cocked: {}, // playerId -> true while their hammer is back
    darkShots: {}, // playerId -> true once they've fired in the current blackout
    deaths: [], // { id, by, at, dark, cycle, forfeit }
    winner: null,
    endedBy: null, // who fired the shot that ended it (null: someone left)
    endedAt: 0,
  };
}

/** Bodies that count for the murderer: every death except the murderer's own, not counting people who left. */
export const bodyCount = (s, deaths = s.deaths) => deaths.filter((d) => d.id !== s.murdererId && !d.forfeit).length;

function end(s, winner, by, now) {
  s.phase = MURDER_PHASE.GAMEOVER;
  s.winner = winner;
  s.endedBy = by;
  s.endedAt = now;
  s.dark = false;
  s.cocked = {};
  return s;
}

function checkEnd(s, by, now) {
  if (s.phase !== MURDER_PHASE.PLAYING) return;
  const m = getPlayer(s, s.murdererId);
  if (!m || !m.alive) return end(s, WINNER.TOWN, by, now);
  if (bodyCount(s) >= s.killGoal) return end(s, WINNER.MURDERER, by, now);
  if (!s.players.some((p) => p.alive && p.id !== s.murdererId)) return end(s, WINNER.MURDERER, by, now);
}

const canAct = (s, id) => {
  if (s.phase !== MURDER_PHASE.PLAYING) return 'over';
  const p = getPlayer(s, id);
  if (!p) return 'not-playing';
  if (!p.alive) return 'dead';
  return null;
};

/** In the dark, one shot each per blackout. */
const spent = (s, id) => s.dark && !!s.darkShots[id];

/** First click: pull the hammer back. */
export function cock(s, id) {
  const err = canAct(s, id);
  if (err) return err;
  if (spent(s, id)) return 'spent';
  if (s.cocked[id]) return 'already-cocked';
  s.cocked[id] = true;
  return null;
}

/** Right click: ease the hammer down without firing. */
export function lower(s, id) {
  const err = canAct(s, id);
  if (err) return err;
  delete s.cocked[id];
  return null;
}

/**
 * Second click: fire. `targetId` is whoever was under the shooter's sights (or
 * null: a shot at nobody). Shooting someone already dead wastes the round.
 * Returns { error } or { event: { shooterId, targetId, killed, dark } }.
 */
export function shoot(s, id, targetId, now) {
  const err = canAct(s, id);
  if (err) return { error: err };
  if (spent(s, id)) return { error: 'spent' };
  if (!s.cocked[id]) return { error: 'not-cocked' };
  delete s.cocked[id];
  if (s.dark) s.darkShots[id] = true;
  const shooter = getPlayer(s, id);
  shooter.stats.shots += 1;
  const target = targetId != null && targetId !== id ? getPlayer(s, targetId) : null;
  const killed = !!target && target.alive;
  const dark = s.dark;
  if (killed) {
    target.alive = false;
    delete s.cocked[target.id];
    shooter.stats.kills += 1;
    s.deaths.push({ id: target.id, by: id, at: now, dark, cycle: s.cycle, forfeit: false });
    checkEnd(s, id, now);
  }
  return { event: { shooterId: id, targetId: target ? target.id : null, killed, dark } };
}

/** Lights out / lights on. Times are anchored to the start so the rhythm never drifts. */
export function setDark(s, dark) {
  if (s.phase !== MURDER_PHASE.PLAYING) return s;
  s.dark = dark;
  if (dark) {
    s.cycle += 1;
    s.darkShots = {};
    s.nextAt = s.startedAt + darkStart(s, s.cycle) + s.darkMs;
  } else {
    s.nextAt = s.startedAt + darkStart(s, s.cycle + 1);
  }
  return s;
}

/**
 * A player left. The murderer leaving hands the table the win. An innocent
 * leaving doesn't count as a body, so the goal shrinks if it's no longer reachable.
 */
export function forfeitMurder(s, id, now) {
  const p = getPlayer(s, id);
  if (!p || !p.alive || s.phase !== MURDER_PHASE.PLAYING) return s;
  p.alive = false;
  p.forfeited = true;
  delete s.cocked[id];
  s.deaths.push({ id, by: null, at: now, dark: s.dark, cycle: s.cycle, forfeit: true });
  if (id !== s.murdererId) {
    const reachable = bodyCount(s) + s.players.filter((x) => x.alive && x.id !== s.murdererId).length;
    s.killGoal = Math.min(s.killGoal, reachable);
  }
  checkEnd(s, null, now);
  return s;
}

/**
 * What one player is allowed to know.
 *  - The dead (and everyone once it's over) know everything, including who the murderer is.
 *  - The murderer knows they're the murderer, and sees in the dark.
 *  - In the dark, everyone else doesn't see who just died (they find out when
 *    the lights come back), whose hammer is back, or who fired.
 *  - Who fired a shot in the dark is never told to them, even later — except
 *    to the person who fired it.
 */
export function murderView(s, viewerId, now = Date.now()) {
  const viewer = getPlayer(s, viewerId);
  const over = s.phase === MURDER_PHASE.GAMEOVER;
  const omniscient = over || (viewer && !viewer.alive);
  const sees = omniscient || viewerId === s.murdererId; // can see in the dark
  const unseen = new Set();
  if (!sees && s.dark) {
    for (const d of s.deaths) if (d.dark && d.cycle === s.cycle && !d.forfeit) unseen.add(d.id);
  }
  const deaths = s.deaths
    .filter((d) => !unseen.has(d.id))
    .map((d) => ({ ...d, by: sees || !d.dark || d.by === viewerId ? d.by : null }));
  let cocked = {};
  if (sees || !s.dark) cocked = { ...s.cocked };
  else if (s.cocked[viewerId]) cocked = { [viewerId]: true };
  const { darkShots, ...rest } = s;
  return {
    ...rest,
    spent: spent(s, viewerId), // you've used your one shot in this blackout
    players: s.players.map((p) => ({
      ...p,
      alive: p.alive || unseen.has(p.id),
      stats: omniscient ? { ...p.stats } : null,
    })),
    murdererId: omniscient || viewerId === s.murdererId ? s.murdererId : null,
    cocked,
    deaths,
    bodies: bodyCount(s, deaths),
    serverNow: now,
  };
}
