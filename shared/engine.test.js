import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';
import { PHASE, OUTCOME, LOAD_CHANCE } from './constants.js';
import { MatchRunner } from './runner.js';

const mk = (n) =>
  E.createMatch(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: {} })));

function toDecision(s, shooter, loaded) {
  E.beginTurn(s, shooter, loaded, 0);
  E.openDecision(s, 1);
}

test('shooter aims anti-clockwise at the next living player', () => {
  const s = mk(4);
  s.players[1].alive = false;
  E.beginTurn(s, 'p0', false, 0);
  assert.equal(s.targetId, 'p2');
  E.beginTurn(s, 'p3', false, 0);
  assert.equal(s.targetId, 'p0', 'wraps around');
});

test('pass hands the gun to the target', () => {
  const s = mk(3);
  toDecision(s, 'p0', true);
  assert.equal(E.decide(s, 'p0', 'pass', 9000), null);
  assert.equal(s.result.outcome, OUTCOME.PASS);
  E.finishResolve(s, false, 30000);
  assert.equal(s.shooterId, 'p1');
  assert.equal(s.targetId, 'p2');
  assert.equal(s.players[1].stats.bluffs, 1, 'survived a loaded chamber by talking');
});

test('loaded shot kills the target and the shooter keeps the gun', () => {
  const s = mk(3);
  toDecision(s, 'p0', true);
  E.decide(s, 'p0', 'shoot', 9000);
  assert.equal(s.result.outcome, OUTCOME.KILL);
  assert.equal(s.players[1].alive, false);
  E.finishResolve(s, false, 30000);
  assert.equal(s.shooterId, 'p0');
  assert.equal(s.targetId, 'p2', 'skips the dead player');
});

test('empty shot + loaded self-pull eliminates the shooter; target becomes shooter', () => {
  const s = mk(3);
  toDecision(s, 'p0', false);
  E.decide(s, 'p0', 'shoot', 9000, true);
  assert.equal(s.result.outcome, OUTCOME.MISFIRE);
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[1].stats.survivedMisfires, 1);
  E.finishResolve(s, false, 30000);
  assert.equal(s.shooterId, 'p1');
  assert.equal(s.targetId, 'p2');
});

test('last player standing wins', () => {
  const s = mk(2);
  toDecision(s, 'p0', true);
  E.decide(s, 'p0', 'shoot', 9000);
  E.finishResolve(s, false, 30000);
  assert.equal(s.phase, PHASE.GAMEOVER);
  assert.equal(s.winnerId, 'p0');
});

test('only the target sees the chamber, and only while deciding', () => {
  const s = mk(3);
  E.beginTurn(s, 'p0', true, 0);
  assert.equal(E.viewFor(s, 'p1').chamber, null, 'not during the aim');
  E.openDecision(s, 1);
  assert.equal(E.viewFor(s, 'p1').chamber, 'loaded');
  assert.equal(E.viewFor(s, 'p0').chamber, null);
  assert.equal(E.viewFor(s, 'p2').chamber, null);
  assert.equal('loaded' in E.viewFor(s, 'p0'), false, 'raw flag never serialised');
});

test('ghosts see the chamber during the decision, like the target', () => {
  const s = mk(4);
  s.players[3].alive = false;
  E.beginTurn(s, 'p0', false, 0);
  assert.equal(E.viewFor(s, 'p3').chamber, null, 'not during the aim');
  E.openDecision(s, 1);
  assert.equal(E.viewFor(s, 'p3').chamber, 'empty');
  assert.equal(E.viewFor(s, 'p2').chamber, null, 'living spectators still blind');
});

test('only the shooter can decide', () => {
  const s = mk(3);
  toDecision(s, 'p0', true);
  assert.equal(E.decide(s, 'p1', 'shoot', 9000), 'not-shooter');
});

test('forfeit by the target re-deals the turn', () => {
  const s = mk(3);
  toDecision(s, 'p0', true);
  assert.deepEqual(E.forfeit(s, 'p1', 2), { restartWith: 'p0' });
});

test('the shooter cannot act before the minimum stare', () => {
  const s = mk(3);
  toDecision(s, 'p0', true);
  assert.equal(E.decide(s, 'p0', 'shoot', 100), 'too-soon');
  assert.equal(E.decide(s, 'p0', 'timeout', 100), null, 'the clock can still expire');
});

test('empty shot + empty self-pull: nobody dies, the target takes the gun', () => {
  const s = mk(2);
  toDecision(s, 'p0', false);
  E.decide(s, 'p0', 'shoot', 9000, false);
  assert.equal(s.result.outcome, OUTCOME.SURVIVED);
  assert.deepEqual(s.result.eliminated, []);
  assert.equal(s.players[0].alive, true);
  assert.equal(s.players[0].stats.selfSurvived, 1);
  E.finishResolve(s, false, 30000);
  assert.equal(s.phase, PHASE.AIMING, 'game goes on');
  assert.equal(s.shooterId, 'p1');
  assert.equal(s.targetId, 'p0');
});

test('every pull is an independent 1-in-4, even after a run of empties', () => {
  const r = new MatchRunner({ players: [{ id: 'a' }, { id: 'b' }], onChange: () => {} });
  let loaded = 0;
  let afterFiveEmpty = 0;
  let afterFiveEmptyLoaded = 0;
  let streak = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const x = r.roll();
    if (streak >= 5) {
      afterFiveEmpty++;
      if (x) afterFiveEmptyLoaded++;
    }
    if (x) loaded++;
    streak = x ? 0 : streak + 1;
  }
  r.dispose();
  assert.equal(LOAD_CHANCE, 0.25);
  assert.ok(Math.abs(loaded / N - 0.25) < 0.01, `overall ${loaded / N}`);
  assert.ok(Math.abs(afterFiveEmptyLoaded / afterFiveEmpty - 0.25) < 0.015, `after 5 empties ${afterFiveEmptyLoaded / afterFiveEmpty}`);
});
