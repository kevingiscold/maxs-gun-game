// Drives the engine with timers: one per room on the server. Bots (shared/bot.js)
// act through the same act() call as people.

import { PHASE, TIMING, LOAD_CHANCE } from './constants.js';
import * as E from './engine.js';

export class MatchRunner {
  /**
   * @param {object} o
   * @param {Array} o.players  [{id, name, avatar, isBot}]
   * @param {(state) => void} o.onChange  called after every state change
   * @param {() => boolean} [o.roll]  chamber draw; default is an independent 1-in-4
   * @param {number} [o.decisionMs]
   */
  constructor({ players, onChange, roll, decisionMs = TIMING.decision, now = () => Date.now() }) {
    this.state = E.createMatch(players);
    this.onChange = onChange;
    this.roll = roll || (() => Math.random() < LOAD_CHANCE);
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
    if (action !== 'shoot' && action !== 'pass') return 'bad-action';
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
