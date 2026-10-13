// Pure game rules. No timers, no I/O — MatchRunner (runner.js) drives these.
//
// Seat order is the players array order; "anti-clockwise" means the next index.
// The chamber (`state.loaded`) is secret: only viewFor() decides who sees it.

import { PHASE, OUTCOME, TIMING, CHAOS } from './constants.js';

const blankStats = () => ({ bluffs: 0, eliminations: 0, survivedMisfires: 0, selfSurvived: 0, passes: 0, shots: 0 });

/**
 * @param opts.variant 'classic' | 'chaos'
 * @param opts.reveal  everyone except the shooter sees the chamber
 */
export function createMatch(players, { variant = 'classic', reveal = false } = {}) {
  const chaos = variant === 'chaos';
  return {
    variant: chaos ? 'chaos' : 'classic',
    reveal: !!reveal,
    players: players.map((p) => ({
      lives: chaos ? CHAOS.lives : 1,
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: !!p.isBot,
      alive: true,
      forfeited: false,
      stats: blankStats(),
    })),
    phase: null,
    turn: 0,
    shooterId: null,
    targetId: null,
    loaded: false,
    phaseStartedAt: 0,
    deadline: 0,
    result: null,
    winnerId: null,
    log: [],
  };
}

export const getPlayer = (s, id) => s.players.find((p) => p.id === id);
export const livingPlayers = (s) => s.players.filter((p) => p.alive);

function stepLiving(s, fromId, dir) {
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.id === fromId);
  if (start < 0) return null;
  for (let k = 1; k < n; k++) {
    const p = s.players[(start + dir * k + n * n) % n];
    if (p.alive) return p.id;
  }
  return null;
}
export const nextLiving = (s, fromId) => stepLiving(s, fromId, +1);
export const prevLiving = (s, fromId) => stepLiving(s, fromId, -1);

function log(s, line) {
  s.log.push(line);
  if (s.log.length > 12) s.log.shift();
}

function setPhase(s, phase, now, duration = 0) {
  s.phase = phase;
  s.phaseStartedAt = now;
  s.deadline = duration ? now + duration : 0;
}

/** Start a turn: `shooterId` holds the gun and aims at the next living player. */
export function beginTurn(s, shooterId, loaded, now) {
  if (!getPlayer(s, shooterId)?.alive) shooterId = nextLiving(s, shooterId);
  const targetId = nextLiving(s, shooterId);
  if (!shooterId || !targetId) return endGame(s, now);
  s.turn += 1;
  s.shooterId = shooterId;
  s.targetId = targetId;
  s.loaded = !!loaded; // fresh, independent draw every turn
  s.result = null;
  setPhase(s, PHASE.AIMING, now, TIMING.aim);
  log(s, `${getPlayer(s, shooterId).name} aims at ${getPlayer(s, targetId).name}.`);
  return s;
}

export function openDecision(s, now, decisionMs = TIMING.decision) {
  if (s.phase !== PHASE.AIMING) return s;
  setPhase(s, PHASE.DECISION, now, decisionMs);
  return s;
}

/**
 * Shooter's choice. Returns an error string, or null on success.
 * action: 'pass' | 'shoot' | 'timeout' (server-generated)
 * selfLoaded: the shooter's own pull if their shot is empty — a fresh,
 *   independent draw (the runner rolls it; no one sees it in advance).
 */
export function decide(s, actorId, action, now, selfLoaded = false) {
  if (s.phase !== PHASE.DECISION) return 'not-deciding';
  if (actorId !== s.shooterId) return 'not-shooter';
  // The stare-down can't be skipped.
  if (action !== 'timeout' && now - s.phaseStartedAt < TIMING.minStare) return 'too-soon';
  if (s.variant === 'chaos') return decideChaos(s, action, now);
  const shooter = getPlayer(s, s.shooterId);
  const target = getPlayer(s, s.targetId);

  let outcome;
  let eliminated = [];
  let nextShooterId;

  if (action === 'pass' || action === 'timeout') {
    outcome = action === 'pass' ? OUTCOME.PASS : OUTCOME.TIMEOUT;
    shooter.stats.passes += 1;
    if (s.loaded) target.stats.bluffs += 1; // talked their way past a live round
    nextShooterId = target.id;
    log(s, `${shooter.name} ${action === 'pass' ? 'lowers the gun' : 'hesitates too long'} and passes it to ${target.name}.`);
  } else if (action === 'shoot') {
    shooter.stats.shots += 1;
    if (s.loaded) {
      outcome = OUTCOME.KILL;
      target.alive = false;
      shooter.stats.eliminations += 1;
      eliminated = [{ id: target.id, at: TIMING.trigger }];
      nextShooterId = shooter.id;
      log(s, `BANG. ${shooter.name} kills ${target.name}.`);
    } else {
      // Empty. The shooter now owes one pull on themselves: its own 1-in-4.
      target.stats.survivedMisfires += 1;
      target.stats.bluffs += 1; // baited the shooter into an empty chamber
      nextShooterId = target.id;
      if (selfLoaded) {
        outcome = OUTCOME.MISFIRE;
        shooter.alive = false;
        eliminated = [{ id: shooter.id, at: TIMING.selfShot }];
        log(s, `Click. Empty. ${shooter.name} turns the gun on themselves. BANG.`);
      } else {
        outcome = OUTCOME.SURVIVED;
        shooter.stats.selfSurvived += 1;
        log(s, `Click. Empty. ${shooter.name} turns the gun on themselves. Click. Still alive.`);
      }
    }
  } else {
    return 'bad-action';
  }

  s.result = {
    outcome,
    loaded: s.loaded,
    // revealed with the result; only meaningful when the first shot was empty
    selfLoaded: action === 'shoot' && !s.loaded ? !!selfLoaded : null,
    shooterId: shooter.id,
    targetId: target.id,
    eliminated,
    nextShooterId,
  };
  setPhase(s, PHASE.RESOLVING, now, TIMING.resolve[outcome]);
  return null;
}

/**
 * Chaos: the shooter calls the chamber.
 *  'shoot' — at the target. Loaded: the target loses a life. Empty: the shooter
 *            must turn it on themselves, and loses a life.
 *  'self'  — at their own head. Loaded: they lose a life. Empty: they're fine,
 *            and turn it on the target, who loses a life.
 *  'timeout' — too slow: the gun passes, nobody is hurt.
 * The gun then goes to the target, unless the target died (then the shooter
 * keeps it and aims at the next player), exactly as in Classic.
 */
function decideChaos(s, action, now) {
  const shooter = getPlayer(s, s.shooterId);
  const target = getPlayer(s, s.targetId);
  const hits = [];
  const eliminated = [];
  const hit = (p, at) => {
    p.lives = Math.max(0, p.lives - 1);
    hits.push({ id: p.id, at });
    if (p.lives === 0) {
      p.alive = false;
      eliminated.push({ id: p.id, at });
    }
  };
  let outcome;
  if (action === 'timeout') {
    outcome = OUTCOME.TIMEOUT;
    shooter.stats.passes += 1;
    log(s, `${shooter.name} hesitates too long and passes it to ${target.name}.`);
  } else if (action === 'shoot') {
    shooter.stats.shots += 1;
    if (s.loaded) {
      outcome = OUTCOME.KILL;
      hit(target, TIMING.trigger);
      log(s, `BANG. ${shooter.name} shoots ${target.name}.`);
    } else {
      outcome = OUTCOME.MISFIRE;
      target.stats.bluffs += 1;
      hit(shooter, TIMING.selfShot);
      log(s, `Click. Empty. ${shooter.name} has to shoot themselves.`);
    }
  } else if (action === 'self') {
    shooter.stats.shots += 1;
    if (s.loaded) {
      outcome = OUTCOME.SELF_HIT;
      target.stats.bluffs += 1;
      hit(shooter, TIMING.trigger);
      log(s, `${shooter.name} puts it to their own head. BANG.`);
    } else {
      outcome = OUTCOME.SELF_CLEAR;
      hit(target, TIMING.selfShot);
      log(s, `${shooter.name} puts it to their own head. Click. Then turns it on ${target.name}.`);
    }
  } else {
    return 'bad-action';
  }
  for (const e of eliminated) if (e.id !== shooter.id) shooter.stats.eliminations += 1;
  s.result = {
    outcome,
    loaded: s.loaded,
    selfLoaded: outcome === OUTCOME.MISFIRE ? true : null,
    shooterId: shooter.id,
    targetId: target.id,
    eliminated,
    hits,
    nextShooterId: target.alive ? target.id : shooter.id,
  };
  setPhase(s, PHASE.RESOLVING, now, TIMING.resolve[outcome]);
  return null;
}

/** After the resolution animation: next turn or game over. */
export function finishResolve(s, loaded, now) {
  if (s.phase !== PHASE.RESOLVING) return s;
  if (livingPlayers(s).length <= 1) return endGame(s, now);
  return beginTurn(s, s.result.nextShooterId, loaded, now);
}

function endGame(s, now) {
  const alive = livingPlayers(s);
  s.winnerId = alive.length === 1 ? alive[0].id : null;
  s.shooterId = null;
  s.targetId = null;
  setPhase(s, PHASE.GAMEOVER, now);
  log(s, s.winnerId ? `${getPlayer(s, s.winnerId).name} is the last one standing.` : 'Nobody walks out.');
  return s;
}

/**
 * A player left mid-match: they forfeit. Returns 'restart' if the current
 * duel lost a participant and the turn must be re-dealt, else null.
 */
export function forfeit(s, id, now) {
  const p = getPlayer(s, id);
  if (!p || !p.alive || s.phase === PHASE.GAMEOVER) return null;
  p.alive = false;
  p.forfeited = true;
  log(s, `${p.name} left the table.`);
  if (livingPlayers(s).length <= 1) {
    endGame(s, now);
    return 'over';
  }
  if (s.phase === PHASE.RESOLVING) {
    // Outcome already decided; just make sure the gun goes to someone alive.
    if (!getPlayer(s, s.result.nextShooterId).alive) {
      s.result.nextShooterId = nextLiving(s, s.result.nextShooterId);
    }
    return null;
  }
  if (id === s.shooterId) return { restartWith: s.targetId };
  if (id === s.targetId) return { restartWith: s.shooterId };
  return null;
}

/**
 * What a given player is allowed to see. The chamber is only included for the
 * target while the duel is live, and for everyone once it resolves.
 */
export function viewFor(s, viewerId) {
  const live = s.phase === PHASE.AIMING || s.phase === PHASE.DECISION;
  const { loaded, ...rest } = s;
  // The target sees the chamber, and so do the dead: ghosts watch every duel knowing.
  // (Only during DECISION, so someone killed mid-resolve can't learn anything early.)
  const viewer = s.players.find((p) => p.id === viewerId);
  // With the "reveal" option everyone except the shooter watches knowing.
  const knows = viewerId === s.targetId || (viewer && !viewer.alive) || (s.reveal && viewerId !== s.shooterId);
  return {
    ...rest,
    players: s.players.map((p) => ({ ...p, stats: { ...p.stats } })),
    log: [...s.log],
    chamber: live && knows && s.phase === PHASE.DECISION ? (loaded ? 'loaded' : 'empty') : null,
  };
}
