import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { PRESETS, periodName } from '../src/presets.js';

const MIN = 60_000;
const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const game = (key, n) => G.createGame({ ...PRESETS[key] }, names(n));
const byId = (s, id) => s.players.find((p) => p.id === id);

test('presets put the right number of starters on', () => {
  for (const [key, count] of [['basketball', 5], ['soccer7', 7], ['soccer9', 9], ['soccer11', 11]]) {
    assert.equal(G.onCount(game(key, 15)), count);
  }
  assert.equal(G.onCount(game('soccer11', 8)), 8);
});

test('playing time only accrues on the field while the clock runs', () => {
  const s = game('basketball', 7);
  G.start(s, 1000);
  assert.equal(G.played(s, byId(s, 0), 1000 + 2 * MIN), 2 * MIN);
  assert.equal(G.played(s, byId(s, 5), 1000 + 2 * MIN), 0);
  G.pause(s, 1000 + 2 * MIN);
  assert.equal(G.played(s, byId(s, 0), 1000 + 9 * MIN), 2 * MIN);
});

test('swap banks time for the player coming off', () => {
  const s = game('basketball', 7);
  G.start(s, 0);
  assert.ok(G.substitute(s, { inId: 5, outId: 0 }, 3 * MIN));
  assert.equal(G.played(s, byId(s, 0), 5 * MIN), 3 * MIN);
  assert.equal(G.played(s, byId(s, 5), 5 * MIN), 2 * MIN);
  assert.equal(G.stint(s, byId(s, 0), 5 * MIN), 2 * MIN);
  assert.equal(G.onCount(s), 5);
});

test('invalid substitutions are rejected', () => {
  const s = game('basketball', 7);
  assert.equal(G.substitute(s, { inId: 0, outId: 1 }, 0), false, 'both on');
  assert.equal(G.substitute(s, { inId: 5 }, 0), false, 'no open spot');
  assert.equal(G.substitute(s, { inId: 99, outId: 0 }, 0), false, 'unknown player');
  assert.ok(G.substitute(s, { outId: 0 }, 0));
  assert.ok(G.substitute(s, { inId: 5 }, 0));
});

test('undo restores time as if the sub never happened', () => {
  const s = game('basketball', 7);
  G.start(s, 0);
  G.substitute(s, { inId: 5, outId: 0 }, 3 * MIN);
  assert.ok(G.undo(s));
  assert.equal(G.played(s, byId(s, 0), 4 * MIN), 4 * MIN);
  assert.equal(G.played(s, byId(s, 5), 4 * MIN), 0);
  assert.equal(G.undo(s), false);
});

test('countdown clock stops at zero and will not restart', () => {
  const s = game('basketball', 5);
  G.start(s, 0);
  assert.equal(G.clockMs(s, 3 * MIN), 5 * MIN);
  assert.equal(G.clockMs(s, 20 * MIN), 0);
  assert.equal(G.played(s, byId(s, 0), 20 * MIN), 8 * MIN);
  assert.ok(G.settle(s, 20 * MIN));
  assert.equal(G.isRunning(s), false);
  assert.equal(G.start(s, 21 * MIN), false);
});

test('soccer clock counts up past the period length', () => {
  const s = game('soccer7', 9);
  G.start(s, 0);
  assert.equal(G.clockMs(s, 27 * MIN), 27 * MIN);
  assert.equal(G.settle(s, 27 * MIN), false);
  assert.equal(G.played(s, byId(s, 0), 27 * MIN), 27 * MIN);
});

test('periods advance and the game finishes after the last one', () => {
  const s = game('soccer7', 9);
  G.start(s, 0);
  G.endPeriod(s, 26 * MIN);
  assert.equal(s.period, 1);
  assert.equal(G.clockMs(s, 40 * MIN), 0);
  G.start(s, 40 * MIN);
  G.substitute(s, { inId: 7, outId: 0 }, 50 * MIN);
  G.endPeriod(s, 65 * MIN);
  assert.ok(s.finished);
  assert.equal(G.gameTime(s, 99 * MIN), 51 * MIN);
  assert.equal(G.played(s, byId(s, 0), 99 * MIN), 36 * MIN);
  assert.equal(G.played(s, byId(s, 7), 99 * MIN), 15 * MIN);
  assert.equal(G.substitute(s, { inId: 0, outId: 1 }, 99 * MIN), false);
});

test('bench sorts least played first, field sorts longest stint first', () => {
  const s = game('basketball', 7);
  G.start(s, 0);
  G.substitute(s, { inId: 5, outId: 0 }, 2 * MIN);
  const { on, bench } = G.sortedPlayers(s, 3 * MIN);
  assert.deepEqual(bench.map((p) => p.id), [6, 0]);
  assert.equal(on.at(-1).id, 5);
});

test('formatting', () => {
  assert.equal(G.formatClock(0), '0:00');
  assert.equal(G.formatClock(61_999), '1:01');
  assert.equal(G.formatClock(59_001, true), '1:00');
  assert.equal(periodName(4, 2), 'Q3');
  assert.equal(periodName(2, 1), '2nd half');
  assert.equal(periodName(3, 0), 'Period 1');
});
