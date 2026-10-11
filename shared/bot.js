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

/**
 * Bots for Murder!. They go only on what a person at the table could know:
 *  - Suspicion: killing someone in the light is damning, firing at nothing is
 *    odd, cocking a gun in the light is a little threatening, and having your
 *    hammer back when the lights went out looks bad once a body turns up.
 *  - A bot shoots its top suspect only once suspicion passes a bar, and the bar
 *    drops as the bodies pile up (they get desperate). One bot moves at a time,
 *    with a pause after, so it never turns into a massacre.
 *  - A body turning up gives each innocent bot a gut read — the bot version of
 *    reading faces and voices: sometimes it lands on the real murderer, often
 *    on someone innocent (like Classic's tells, honest only part of the time).
 *  - A murderer bot kills in nearly every blackout (it can see in the dark),
 *    and in the light plays along like everyone else — any body counts for it.
 * Every shot is cock → a beat of staring → fire, like a person's two clicks.
 */
const READ_RIGHT = 0.32;
// How sure a bot must be before it shoots: BAR.start with no bodies, sliding to
// BAR.end as the murderer nears the goal. Suspicion fades by BAR.fade every 2.5 s.
// Tuned with scripts/murder-bots-sim.mjs.
const BAR = { start: 0.75, end: 0.4, fade: 0.985 };

export function createMurderBotDriver(runner, { aim }, rng = Math.random) {
  // test-only: GUN_TEST_BOT=idle — bots never shoot; =avenge — every bot shoots
  // straight back at anyone who kills in the light; =hunt — a murderer bot kills
  // a human in each blackout and nobody else ever shoots
  const testMode = typeof process !== 'undefined' ? process.env?.GUN_TEST_BOT : null;
  const idle = testMode === 'idle';
  const hunt = testMode === 'hunt';
  const avenge = testMode === 'avenge';

  const timers = new Set();
  let tick = null;
  const later = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (runner.state.phase === 'playing') fn();
    }, ms);
    timers.add(t);
  };
  const st = () => runner.state;
  const alive = (id) => st().players.find((p) => p.id === id)?.alive;
  const bots = () => st().players.filter((p) => p.isBot && p.alive);
  const pickFrom = (arr) => arr[Math.floor(rng() * arr.length)];
  const others = (id) => st().players.filter((p) => p.alive && p.id !== id);

  /** botId -> Map(playerId -> suspicion) */
  const sus = new Map();
  const suspect = (botId, targetId, amount) => {
    if (botId === targetId || !targetId) return;
    if (!sus.has(botId)) sus.set(botId, new Map());
    const m = sus.get(botId);
    m.set(targetId, Math.min(2, (m.get(targetId) || 0) + amount));
  };
  const topSuspect = (botId) => {
    let best = null;
    for (const [id, score] of sus.get(botId) || []) if (alive(id) && (!best || score > best.score)) best = { id, score };
    return best;
  };
  let busyUntil = 0; // one bot makes a move at a time
  let cockedAtDark = [];

  const attack = (botId, targetId, delay, force = false) => {
    if (idle || (hunt && !force)) return;
    busyUntil = Date.now() + delay + 7000;
    later(delay, () => {
      if (!alive(botId) || !alive(targetId)) return;
      aim(botId, { at: targetId });
      later(500 + rng() * 900, () => {
        if (!alive(botId) || !alive(targetId)) return;
        if (!st().cocked[botId] && runner.cock(botId)) return;
        later(400 + rng() * 900, () => alive(botId) && runner.shoot(botId, targetId));
      });
    });
  };

  // glancing round the table; a suspicious bot keeps looking back at its suspect
  const glance = (botId) => {
    later(1800 + rng() * 3500, () => {
      if (!alive(botId)) return;
      if (!st().cocked[botId]) {
        const top = topSuspect(botId);
        const o = others(botId);
        if (top && top.score > 0.4 && rng() < 0.6) aim(botId, { at: top.id });
        else if (o.length) aim(botId, { at: pickFrom(o).id });
      }
      glance(botId);
    });
  };

  // In the light, every couple of seconds: does any bot act on its suspicion?
  const think = () => {
    const s = st();
    if (s.phase !== 'playing') return;
    for (const m of sus.values()) for (const [id, v] of m) m.set(id, v * BAR.fade);
    if (s.dark || Date.now() < busyUntil) return;
    const bodies = s.deaths.filter((d) => d.id !== s.murdererId && !d.forfeit).length;
    const bar = BAR.start - (BAR.start - BAR.end) * Math.min(1, bodies / s.killGoal);
    const ready = bots()
      .map((b) => ({ b, top: topSuspect(b.id) }))
      .filter((x) => x.top && x.top.score >= bar);
    if (!ready.length || rng() > 0.45) return;
    const { b, top } = pickFrom(ready);
    attack(b.id, top.id, 300 + rng() * 1200);
    sus.get(b.id).set(top.id, 0.2);
  };

  return {
    start() {
      for (const b of bots()) glance(b.id);
      tick = setInterval(think, 2500);
    },
    event(e) {
      const s = st();
      if (e.type === 'cock' && !s.dark) for (const b of bots()) suspect(b.id, e.id, 0.08);
      if (e.type === 'shot' && !e.dark) {
        for (const b of bots()) if (b.id !== e.shooterId) suspect(b.id, e.shooterId, e.killed ? 0.6 : 0.15);
        if (avenge && e.killed && alive(e.shooterId)) {
          for (const b of bots()) if (b.id !== e.shooterId) attack(b.id, e.shooterId, 900 + rng() * 2500, true);
        }
      }
      if (e.type === 'lights' && e.dark) {
        cockedAtDark = Object.keys(s.cocked); // whose hammer was back as the lights died
        const m = s.players.find((p) => p.id === s.murdererId);
        if (m?.isBot && m.alive && (hunt || rng() < 0.9)) {
          const victims = others(m.id);
          const humans = victims.filter((p) => !p.isBot);
          const armed = victims.filter((p) => s.cocked[p.id]);
          const target = hunt ? humans[0] : armed.length && rng() < 0.5 ? pickFrom(armed) : pickFrom(victims);
          if (target) attack(m.id, target.id, hunt ? 1500 : 1200 + rng() * 4500, true);
        }
        // a very suspicious innocent may spend its one shot in the dark, from memory
        if (!hunt && rng() < 0.3) {
          const sure = bots()
            .filter((b) => b.id !== s.murdererId)
            .map((b) => ({ b, top: topSuspect(b.id) }))
            .filter((x) => x.top && x.top.score >= 1.3);
          if (sure.length) {
            const { b, top } = pickFrom(sure);
            attack(b.id, top.id, 2000 + rng() * 5000, true);
          }
        }
      }
      if (e.type === 'lights' && !e.dark) {
        const fresh = s.deaths.some((d) => d.dark && d.cycle === s.cycle && !d.forfeit);
        if (fresh) {
          for (const b of bots()) {
            if (b.id === s.murdererId) continue;
            for (const id of cockedAtDark) suspect(b.id, id, 0.3);
            const innocents = others(b.id).filter((p) => p.id !== s.murdererId);
            // the gut read: right READ_RIGHT of the time, otherwise someone innocent
            if (rng() < READ_RIGHT || !innocents.length) suspect(b.id, s.murdererId, 0.45);
            else suspect(b.id, pickFrom(innocents).id, 0.4);
          }
        }
      }
    },
    dispose() {
      clearInterval(tick);
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
