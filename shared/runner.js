// Drives the engine with timers: one per room on the server. Bots (shared/bot.js)
// act through the same act() call as people.

import { PHASE, TIMING, LOAD_CHANCE, CHAOS } from './constants.js';
import * as E from './engine.js';
import * as M from './murder.js';

export class MatchRunner {
  /**
   * @param {object} o
   * @param {Array} o.players  [{id, name, avatar, isBot}]
   * @param {(state) => void} o.onChange  called after every state change
   * @param {() => boolean} [o.roll]  chamber draw; default is an independent 1-in-4
   * @param {number} [o.decisionMs]
   */
  constructor({ players, onChange, roll, variant, reveal, decisionMs = TIMING.decision, now = () => Date.now() }) {
    this.state = E.createMatch(players, { variant, reveal });
    this.onChange = onChange;
    const chance = this.state.variant === 'chaos' ? CHAOS.loadChance : LOAD_CHANCE;
    this.roll = roll || (() => Math.random() < chance);
    this.decisionMs = decisionMs;
    this.now = now;
    this.timer = null;
  }

  start(firstShooterId) {
    const ids = this.state.players.map((p) => p.id);
    const first = firstShooterId ?? ids[Math.floor(Math.random() * ids.length)];
    E.beginTurn(this.state, first, this.roll(), this.now());
    this._afterChange();
  }

  act(playerId, action) {
    const allowed = this.state.variant === 'chaos' ? ['shoot', 'self'] : ['shoot', 'pass'];
    if (!allowed.includes(action)) return 'bad-action';
    // the shooter's own pull is rolled now, independently, in case it's needed
    const err = E.decide(this.state, playerId, action, this.now(), this.roll());
    if (!err) this._afterChange();
    return err;
  }

  removePlayer(id) {
    const r = E.forfeit(this.state, id, this.now());
    if (r && r.restartWith) E.beginTurn(this.state, r.restartWith, this.roll(), this.now());
    this._afterChange();
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
    this.onChange = null;
  }

  // ---- internals ----

  _emit() {
    this.onChange?.(this.state);
  }

  _afterChange() {
    clearTimeout(this.timer);
    this.timer = null;
    const s = this.state;
    if (s.phase === PHASE.AIMING) {
      this._at(s.deadline, () => E.openDecision(s, this.now(), this.decisionMs));
    } else if (s.phase === PHASE.DECISION) {
      this._at(s.deadline, () => E.decide(s, s.shooterId, 'timeout', this.now()));
    } else if (s.phase === PHASE.RESOLVING) {
      this._at(s.deadline, () => E.finishResolve(s, this.roll(), this.now()));
    }
    this._emit();
  }

  _at(when, fn) {
    this.timer = setTimeout(() => {
      fn();
      this._afterChange();
    }, Math.max(0, when - this.now()));
  }
}

/**
 * Murder!: the only timer is the lights. Everything else happens when a player
 * (or bot) cocks, lowers or fires. `onEvent` gets each cock / shot / lights
 * change so the server can route sounds (with or without the shooter's name).
 */
export class MurderRunner {
  constructor({ players, killGoal, murdererId, onChange, onEvent, first, gap, dark, now = () => Date.now() }) {
    this.now = now;
    const pick = murdererId ?? players[Math.floor(Math.random() * players.length)].id;
    this.state = M.createMurder(players, { killGoal, murdererId: pick, now: now(), first, gap, dark });
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.timer = null;
  }

  start() {
    this._schedule();
    this._emit();
  }

  cock(id) {
    const err = M.cock(this.state, id);
    if (!err) {
      this.onEvent?.({ type: 'cock', id });
      this._emit();
    }
    return err;
  }

  lower(id) {
    const err = M.lower(this.state, id);
    if (!err) this._emit();
    return err;
  }

  shoot(id, targetId) {
    const res = M.shoot(this.state, id, targetId, this.now());
    if (res.error) return res.error;
    this.onEvent?.({ type: 'shot', ...res.event });
    this._afterChange();
    return null;
  }

  removePlayer(id) {
    M.forfeitMurder(this.state, id, this.now());
    this._afterChange();
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
    this.onChange = null;
    this.onEvent = null;
  }

  _emit() {
    this.onChange?.(this.state);
  }

  _afterChange() {
    if (this.state.phase !== M.MURDER_PHASE.PLAYING) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._emit();
  }

  _schedule() {
    clearTimeout(this.timer);
    const s = this.state;
    if (s.phase !== M.MURDER_PHASE.PLAYING) return;
    this.timer = setTimeout(() => {
      if (this.state.phase !== M.MURDER_PHASE.PLAYING) return;
      M.setDark(s, !s.dark);
      this.onEvent?.({ type: 'lights', dark: s.dark });
      this._schedule();
      this._emit();
    }, Math.max(0, s.nextAt - this.now()));
  }
}
