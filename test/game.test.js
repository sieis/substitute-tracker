import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import * as R from '../src/report.js';
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
  G.setOut(s, 6, true, 3 * MIN);
  const after = G.sortedPlayers(s, 3 * MIN);
  assert.deepEqual(after.bench.map((p) => p.id), [0]);
  assert.deepEqual(after.out.map((p) => p.id), [6]);
});

test('formatting', () => {
  assert.equal(G.formatClock(0), '0:00');
  assert.equal(G.formatClock(61_999), '1:01');
  assert.equal(G.formatClock(59_001, true), '1:00');
  assert.equal(periodName(4, 2), 'Q3');
  assert.equal(periodName(2, 1), '2nd half');
  assert.equal(periodName(3, 0), 'Period 1');
});

test('starters can be chosen by hand and never exceed the spots', () => {
  const roster = names(8).map((name, i) => ({ name, number: String(i + 1), on: i >= 2 }));
  const s = G.createGame({ ...PRESETS.basketball }, roster);
  assert.deepEqual(s.players.filter((p) => p.on).map((p) => p.id), [2, 3, 4, 5, 6]);
  assert.equal(byId(s, 7).on, false);
  assert.equal(byId(s, 2).number, '3');
});

test('undo goes back several steps', () => {
  const s = game('basketball', 7);
  G.start(s, 0);
  G.substitute(s, { inId: 5, outId: 0 }, 1 * MIN);
  G.substitute(s, { inId: 6, outId: 1 }, 2 * MIN);
  assert.ok(G.undo(s));
  assert.equal(byId(s, 1).on, true);
  assert.equal(byId(s, 5).on, true);
  assert.ok(G.undo(s));
  assert.equal(G.played(s, byId(s, 0), 4 * MIN), 4 * MIN);
  assert.equal(G.canUndo(s), false);
});

test('queued subs happen together and undo together', () => {
  const s = game('basketball', 8);
  G.start(s, 0);
  assert.ok(G.queueSub(s, { inId: 5, outId: 0 }));
  assert.ok(G.queueSub(s, { inId: 6, outId: 1 }));
  assert.equal(G.queueSub(s, { inId: 7, outId: 0 }), false, 'already queued');
  assert.equal(G.queueSub(s, { inId: 0, outId: 7 }), false, 'wrong sides');
  assert.equal(G.queueIndex(s, 6), 1);
  assert.equal(G.played(s, byId(s, 5), 2 * MIN), 0, 'nothing happens until applied');

  assert.equal(G.applyQueue(s, 2 * MIN), 2);
  assert.equal(G.onCount(s), 5);
  assert.equal(G.played(s, byId(s, 0), 3 * MIN), 2 * MIN);
  assert.equal(G.played(s, byId(s, 6), 3 * MIN), 1 * MIN);
  assert.equal(s.queue.length, 0);

  assert.ok(G.undo(s));
  assert.equal(s.queue.length, 2);
  assert.equal(G.played(s, byId(s, 0), 3 * MIN), 3 * MIN);
  assert.ok(G.unqueue(s, 0));
  assert.equal(s.queue.length, 1);
});

test('a direct sub drops queued pairs it makes impossible', () => {
  const s = game('basketball', 7);
  G.queueSub(s, { inId: 5, outId: 0 });
  G.substitute(s, { inId: 5, outId: 1 }, 0);
  assert.equal(s.queue.length, 0);
});

test('sitting out banks time and frees the spot', () => {
  const s = game('basketball', 7);
  G.start(s, 0);
  assert.ok(G.setOut(s, 0, true, 2 * MIN));
  assert.equal(G.onCount(s), 4);
  assert.equal(G.played(s, byId(s, 0), 5 * MIN), 2 * MIN);
  assert.equal(G.substitute(s, { inId: 0 }, 5 * MIN), false, 'cannot go in while out');
  assert.ok(G.setOut(s, 0, false, 5 * MIN));
  assert.ok(G.substitute(s, { inId: 0 }, 5 * MIN));
  assert.equal(G.fairness(s, 5 * MIN).count, 7);
});

test('a late arrival starts on the bench with empty earlier periods', () => {
  const s = game('basketball', 5);
  G.start(s, 0);
  G.endPeriod(s, 8 * MIN);
  const p = G.addPlayer(s, { name: ' Late ', number: '9' }, 8 * MIN);
  assert.equal(p.name, 'Late');
  assert.equal(p.id, 5);
  G.start(s, 10 * MIN);
  G.substitute(s, { inId: 5, outId: 0 }, 12 * MIN);
  assert.deepEqual(G.periodTimes(s, p, 13 * MIN), [0, 1 * MIN, null, null]);
  assert.deepEqual(G.periodTimes(s, byId(s, 0), 13 * MIN), [8 * MIN, 2 * MIN, null, null]);
  assert.equal(G.addPlayer(s, { name: '  ' }, 13 * MIN), null);
});

test('adjusting the clock moves playing time with it', () => {
  const s = game('basketball', 7);
  G.start(s, 0);
  G.substitute(s, { inId: 5, outId: 0 }, 2 * MIN);
  // Scoreboard is a minute behind ours: take a minute off the countdown clock.
  assert.equal(G.adjustClock(s, -MIN, 3 * MIN), -MIN);
  assert.equal(G.clockMs(s, 3 * MIN), 4 * MIN);
  assert.equal(G.played(s, byId(s, 5), 3 * MIN), 2 * MIN);
  assert.equal(G.played(s, byId(s, 0), 3 * MIN), 2 * MIN);
  // Adding time back stops at the last substitution.
  assert.equal(G.adjustClock(s, 5 * MIN, 3 * MIN), 2 * MIN);
  assert.equal(G.clockMs(s, 3 * MIN), 6 * MIN);
  assert.equal(G.played(s, byId(s, 5), 3 * MIN), 0);
  // Running it out stops the clock.
  G.adjustClock(s, -20 * MIN, 3 * MIN);
  assert.equal(G.clockMs(s, 9 * MIN), 0);
  assert.equal(G.isRunning(s), false);

  const up = game('soccer7', 9);
  assert.equal(G.adjustClock(up, 90_000, 0), 90_000);
  assert.equal(G.clockMs(up, 0), 90_000);
  assert.equal(G.played(up, byId(up, 0), 0), 90_000);
});

test('fair share, levels and the suggested swap', () => {
  const s = game('basketball', 8);
  assert.equal(G.fairness(s, 0).target, 20 * MIN);
  assert.equal(G.suggestSwap(s, 0), null, 'nothing to even out yet');
  G.start(s, 0);
  G.substitute(s, { inId: 5, outId: 0 }, 2 * MIN);
  const now = 6 * MIN;
  assert.deepEqual(G.suggestSwap(s, now), { inId: 6, outId: 1 });
  G.queueSub(s, { inId: 6, outId: 1 });
  assert.deepEqual(G.suggestSwap(s, now), { inId: 7, outId: 2 });
  const { average, spread } = G.fairness(s, now);
  assert.equal(average, (5 * 6 * MIN) / 8);
  assert.equal(spread, 6 * MIN);
  assert.equal(G.fairnessLevel(0, average), 'low');
  assert.equal(G.fairnessLevel(6 * MIN, average), 'high');
  assert.equal(G.fairnessLevel(4 * MIN, average), 'ok');
  assert.equal(G.fairnessLevel(0, 1000), 'ok', 'too early to judge');
});

test('a saved game survives a round trip, and an old or broken one is handled', () => {
  const s = game('basketball', 7);
  G.start(s, 0);
  G.substitute(s, { inId: 5, outId: 0 }, MIN);
  G.queueSub(s, { inId: 6, outId: 1 });
  const copy = G.revive(JSON.parse(JSON.stringify(s)));
  assert.deepEqual({ ...copy, config: s.config }, s);
  assert.equal(copy.config.countdown, true);

  const v1 = { config: { ...PRESETS.soccer7 }, period: 1, periodStartT: 25 * MIN, bankedT: 30 * MIN,
    runningSince: null, finished: false, undo: null,
    players: [{ id: 0, name: 'A', on: true, banked: 25 * MIN, changedAt: 25 * MIN }] };
  const revived = G.revive(v1);
  assert.equal(G.played(revived, revived.players[0], 0), 30 * MIN);
  assert.equal(revived.players[0].marks.length, 1);
  assert.deepEqual(revived.queue, []);

  assert.equal(G.revive(null), null);
  assert.equal(G.revive({ config: {}, players: [] }), null);
  assert.equal(G.revive({ ...v1, players: [{ id: 0, name: 'A', banked: -5, changedAt: 0 }] }), null);
});

test('report rows, text and csv', () => {
  const roster = [{ name: 'Ann', number: '7' }, { name: '=SUM(A1)', number: '' }, { name: 'Cy "C" Lee', number: '12' }];
  const s = G.createGame({ ...PRESETS.basketball, sport: 'basketball', onField: 2 }, roster);
  G.start(s, 0);
  G.substitute(s, { inId: 2, outId: 0 }, 2 * MIN);
  G.endPeriod(s, 8 * MIN);
  const now = 9 * MIN;

  const most = R.rows(s, now, 'most');
  assert.deepEqual(most.map((r) => r.name), ['=SUM(A1)', 'Cy "C" Lee', 'Ann']);
  assert.deepEqual(most.map((r) => r.share), [100, 75, 25]);
  assert.deepEqual(most[2].periods, [2 * MIN, 0, null, null]);
  assert.deepEqual(R.rows(s, now, 'number').map((r) => r.number), ['7', '12', '']);
  assert.deepEqual(R.rows(s, now, 'name').map((r) => r.id), [1, 0, 2]);

  assert.match(R.text(s, now), /^Basketball 5v5 playing time \(Q2\)\nGame time 8:00\n\n=SUM\(A1\): 8:00 \(100%\)\n#12 Cy/);
  const lines = R.csv(s, now).split('\r\n');
  assert.equal(lines[0], '"Number","Player","Status","Q1","Q2","Q3","Q4","Total","Total seconds","Share"');
  assert.equal(lines[1], '"","\'=SUM(A1)","On court","8:00","0:00","","","8:00","480","100%"');
  assert.equal(lines[2], '"12","Cy ""C"" Lee","On court","6:00","0:00","","","6:00","360","75%"');
});
