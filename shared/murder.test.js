import test from 'node:test';
import assert from 'node:assert/strict';
import { createMurder, cock, lower, shoot, setDark, forfeitMurder, murderView, goalRange, clampGoal, WINNER } from './murder.js';
import { MURDER } from './constants.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: {} }));
const game = (n = 6, goal = 3, murdererId = 'p0') => createMurder(players(n), { killGoal: goal, murdererId, now: 0 });
const fire = (s, by, at, now = 1) => {
  cock(s, by);
  return shoot(s, by, at, now);
};

test('goal: at least 3, at most 8, never more than the other players', () => {
  assert.deepEqual(goalRange(5), { min: 3, max: 4 });
  assert.deepEqual(goalRange(12), { min: 3, max: 8 });
  assert.equal(clampGoal(20, 7), 6);
  assert.equal(clampGoal(1, 7), 3);
  assert.equal(game(5, 99).killGoal, 4);
});

test('a gun must be cocked before every shot', () => {
  const s = game();
  assert.equal(shoot(s, 'p1', 'p2', 1).error, 'not-cocked');
  assert.equal(cock(s, 'p1'), null);
  assert.equal(cock(s, 'p1'), 'already-cocked');
  assert.equal(shoot(s, 'p1', 'p2', 1).event.killed, true);
  assert.equal(shoot(s, 'p1', 'p3', 2).error, 'not-cocked', 'firing uncocks it');
  cock(s, 'p3');
  lower(s, 'p3');
  assert.equal(shoot(s, 'p3', 'p4', 3).error, 'not-cocked', 'lowering uncocks it');
});

test('innocents shooting innocents count for the murderer', () => {
  const s = game(6, 3);
  fire(s, 'p1', 'p2');
  fire(s, 'p3', 'p4');
  assert.equal(s.phase, 'playing');
  fire(s, 'p0', 'p5');
  assert.equal(s.phase, 'gameover');
  assert.equal(s.winner, WINNER.MURDERER);
});

test('killing the murderer wins it for the table', () => {
  const s = game(6, 3, 'p4');
  fire(s, 'p1', 'p2'); // a wrong guess costs a body…
  fire(s, 'p3', 'p4'); // …but this one is right
  assert.equal(s.winner, WINNER.TOWN);
  assert.equal(s.endedBy, 'p3');
});

test('the dead cannot shoot, and shooting a corpse wastes the round', () => {
  const s = game();
  fire(s, 'p1', 'p2');
  assert.equal(cock(s, 'p2'), 'dead');
  const r = fire(s, 'p3', 'p2');
  assert.equal(r.event.killed, false);
  assert.equal(s.deaths.length, 1);
  assert.equal(fire(s, 'p3', 'p3').event.killed, false, "can't shoot yourself");
});

test('lights: first blackout at 15 s, then 20 s of light between 10 s blackouts', () => {
  const s = game();
  assert.equal(s.nextAt, 15000);
  setDark(s, true);
  assert.equal(s.cycle, 1);
  assert.equal(s.nextAt, 25000);
  setDark(s, false);
  assert.equal(s.nextAt, 45000);
  setDark(s, true);
  assert.equal(s.nextAt, 55000);
  setDark(s, false);
  assert.equal(s.nextAt, 75000);
  assert.deepEqual([MURDER.first, MURDER.gap, MURDER.dark], [15000, 20000, 10000]);
});

test('one shot each per blackout; as many as you like in the light', () => {
  const s = game(8, 6, 'p0');
  for (const t of ['p1', 'p2', 'p3']) assert.equal(fire(s, 'p7', t).event.killed, true, 'light: no limit');
  setDark(s, true);
  assert.equal(fire(s, 'p0', 'p4').event.killed, true);
  assert.equal(cock(s, 'p0'), 'spent', "can't even cock again in this blackout");
  assert.equal(murderView(s, 'p0').spent, true);
  assert.equal(murderView(s, 'p5').spent, false);
  cock(s, 'p5');
  assert.equal(shoot(s, 'p5', 'p6', 2).event.killed, true);
  assert.equal(shoot(s, 'p5', 'p7', 3).error, 'spent');
  setDark(s, false);
  assert.equal(cock(s, 'p0'), null, 'lights on: free again');
  setDark(s, true);
  assert.equal(murderView(s, 'p0').spent, false, 'a new blackout, a new shot');
  assert.equal(murderView(s, 'p0').darkShots, undefined, "nobody sees who's fired in the dark");
});

test('in the dark the innocent do not see who died, who fired, or whose hammer is back', () => {
  const s = game(6, 3, 'p0');
  setDark(s, true);
  cock(s, 'p5');
  fire(s, 'p0', 'p1', 5);
  const living = murderView(s, 'p3');
  assert.equal(living.players.find((p) => p.id === 'p1').alive, true, 'body not seen yet');
  assert.equal(living.deaths.length, 0);
  assert.equal(living.bodies, 0);
  assert.deepEqual(living.cocked, {});
  assert.equal(living.murdererId, null);
  assert.equal(living.players[0].stats, null);
  // the murderer sees in the dark: the body, the raised hammer
  const killer = murderView(s, 'p0');
  assert.equal(killer.murdererId, 'p0');
  assert.equal(killer.players.find((p) => p.id === 'p1').alive, false);
  assert.equal(killer.cocked.p5, true);
  // the victim is a ghost: ghosts know everything
  const ghost = murderView(s, 'p1');
  assert.equal(ghost.murdererId, 'p0');
  assert.equal(ghost.deaths[0].by, 'p0');
  assert.equal(ghost.cocked.p5, true);

  setDark(s, false);
  const after = murderView(s, 'p3');
  assert.equal(after.players.find((p) => p.id === 'p1').alive, false, 'lights on: the body is there');
  assert.equal(after.deaths[0].by, null, 'but who fired in the dark is never revealed');
  assert.equal(after.bodies, 1);
  assert.equal(murderView(s, 'p0').deaths[0].by, 'p0', 'the shooter knows their own shot');
});

test('shots in the light are seen by everyone', () => {
  const s = game(6, 3, 'p0');
  fire(s, 'p2', 'p3');
  assert.equal(murderView(s, 'p4').deaths[0].by, 'p2');
});

test('game over reveals everything', () => {
  const s = game(6, 3, 'p5');
  setDark(s, true);
  fire(s, 'p1', 'p5');
  const v = murderView(s, 'p2');
  assert.equal(v.phase, 'gameover');
  assert.equal(v.murdererId, 'p5');
  assert.equal(v.dark, false);
  assert.equal(v.deaths[0].by, 'p1');
});

test('the murderer leaving hands the table the win; innocents leaving shrink an unreachable goal', () => {
  const a = game(6, 3, 'p0');
  forfeitMurder(a, 'p0', 1);
  assert.equal(a.winner, WINNER.TOWN);

  const b = game(5, 4, 'p0');
  fire(b, 'p0', 'p1');
  forfeitMurder(b, 'p2', 2);
  assert.equal(b.killGoal, 3, 'p1 dead + p3, p4 still killable');
  assert.equal(b.phase, 'playing');
  fire(b, 'p0', 'p3');
  fire(b, 'p0', 'p4');
  assert.equal(b.winner, WINNER.MURDERER);
});
