// A bot opponent for solo play. It runs on the server inside the room, follows
// the same rules (including the minimum stare) and gives readable-but-unreliable
// tells when it's the target.
import { PHASE, TIMING, BOT_NAMES } from './constants.js';
import { randomAvatar } from './avatar.js';

const TELLS = {
  loaded: ['sweating', 'won\'t meet your eyes', '"…don\'t."', 'jaw clenched'],
  empty: ['"go on then."', 'half a smile', 'stone face', 'leans in'],
};

/** A new bot, named so it doesn't clash with anyone already at the table. */
export function makeBot(id, rng = Math.random, takenNames = new Set()) {
  const free = BOT_NAMES.filter((n) => !takenNames.has(n));
  const name = free.length ? free[Math.floor(rng() * free.length)] : `Bot ${takenNames.size + 1}`;
  return { id, name, avatar: randomAvatar(rng), isBot: true };
}

/** A tell for the bot's own chamber: honest ~65% of the time, a bluff otherwise. */
export function pickTell(loaded, rng = Math.random) {
  const honest = rng() < 0.65;
  const pool = honest === loaded ? TELLS.loaded : TELLS.empty;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Drive bots in a running match. Call after every state change.
 * @param runner MatchRunner
 * @param onTell (playerId, text) => void
 */
export function createBotDriver(runner, onTell, rng = Math.random) {
  let key = '';
  let timer = null;
  const drive = () => {
    const s = runner.state;
    const k = `${s.turn}:${s.phase}`;
    if (k === key) return;
    key = k;
    clearTimeout(timer);
    if (s.phase !== PHASE.DECISION) return;

    const target = s.players.find((p) => p.id === s.targetId);
    if (target?.isBot) {
      // the tell surfaces a little into the stare, not instantly
      const loaded = s.loaded;
      setTimeout(() => runner.state.turn === s.turn && onTell(target.id, pickTell(loaded, rng)), 1500 + rng() * 1500);
    }
    const shooter = s.players.find((p) => p.id === s.shooterId);
    if (shooter?.isBot) {
      // takes its time: past the minimum stare, then a few more agonising seconds
      let delay = TIMING.minStare + 3000 + rng() * 6000;
      const forced = typeof process !== 'undefined' ? process.env?.GUN_TEST_BOT : null; // test-only
      const choice = forced === 'shoot' || forced === 'pass' ? forced : rng() < 0.45 ? 'shoot' : 'pass';
      if (forced) delay = TIMING.minStare + 1000; // deterministic timing for staged tests
      timer = setTimeout(() => runner.act(shooter.id, choice), delay);
    }
  };
  return { drive, dispose: () => clearTimeout(timer) };
}
