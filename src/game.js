// Game state and rules. No DOM here: every function takes the current time so it can be tested.
//
// All playing time derives from one number, T: total game-clock time elapsed across all periods.
// A player on the field has played `banked + (T - changedAt)`. Nothing needs updating per tick,
// and a reload or a sleeping tab cannot drift because T comes from wall-clock timestamps.

const MINUTE = 60_000;
const HISTORY_LIMIT = 25;

function newPlayer(id, name, number, on, t = 0, periodsDone = 0) {
  return {
    id,
    name: String(name).trim(),
    number: String(number ?? '').trim(),
    on, // on the field
    out: false, // sitting out (hurt, left early): not on the field and not on the bench
    banked: 0,
    changedAt: t,
    marks: Array(periodsDone).fill(0), // total played at the end of each finished period
  };
}

// roster: names, or { name, number, on }. With no `on` flags the first names on the list start.
export function createGame(config, roster) {
  const entries = roster.map((r) => (typeof r === 'string' ? { name: r } : r));
  const explicit = entries.some((e) => typeof e.on === 'boolean');
  let spots = config.onField;
  const players = entries.map((e, id) => {
    const on = (!explicit || e.on === true) && spots > 0;
    if (on) spots -= 1;
    return newPlayer(id, e.name, e.number, on);
  });
  return {
    config,
    players,
    period: 0,
    periodStartT: 0,
    bankedT: 0,
    runningSince: null,
    finished: false,
    queue: [], // substitutions lined up for the next stoppage: { inId, outId }
    history: [], // undo stack
  };
}

/* ---------- clock ---------- */

export const periodLength = (s) => s.config.minutes * MINUTE;
export const isRunning = (s) => s.runningSince !== null;

export function gameTime(s, now) {
  const raw = s.bankedT + (isRunning(s) ? Math.max(0, now - s.runningSince) : 0);
  return s.config.countdown ? Math.min(raw, s.periodStartT + periodLength(s)) : raw;
}

export const periodElapsed = (s, now) => gameTime(s, now) - s.periodStartT;
export const isExpired = (s, now) => periodElapsed(s, now) >= periodLength(s);

// What the scoreboard shows: time remaining for countdown clocks, time elapsed otherwise.
export function clockMs(s, now) {
  const elapsed = periodElapsed(s, now);
  return s.config.countdown ? periodLength(s) - elapsed : elapsed;
}

export function start(s, now) {
  if (s.finished || isRunning(s) || (s.config.countdown && isExpired(s, now))) return false;
  s.runningSince = now;
  return true;
}

export function pause(s, now) {
  s.bankedT = gameTime(s, now);
  s.runningSince = null;
}

// Stops a countdown clock that has reached zero. Returns true if it stopped.
export function settle(s, now) {
  if (!isRunning(s) || !s.config.countdown || !isExpired(s, now)) return false;
  pause(s, now);
  return true;
}

// Moves the scoreboard clock by `displayDelta` ms, for a clock started late or left running.
// Game time itself shifts, so players on the field gain or lose the same amount. It cannot go
// back past the start of the period or the last lineup change. Returns the change applied.
export function adjustClock(s, displayDelta, now) {
  if (s.finished) return 0;
  const before = gameTime(s, now);
  s.bankedT = before;
  if (isRunning(s)) s.runningSince = now;

  const delta = s.config.countdown ? -displayDelta : displayDelta;
  const floor = Math.max(s.periodStartT, ...s.players.map((p) => p.changedAt));
  const ceiling = s.config.countdown ? s.periodStartT + periodLength(s) : Infinity;
  s.bankedT = Math.min(ceiling, Math.max(floor, before + delta));
  settle(s, now);
  const applied = s.bankedT - before;
  return s.config.countdown ? -applied : applied;
}

export function endPeriod(s, now) {
  if (s.finished) return;
  pause(s, now);
  for (const p of s.players) p.marks.push(played(s, p, now));
  s.history = [];
  if (s.period + 1 >= s.config.periods) {
    s.finished = true;
  } else {
    s.period += 1;
    s.periodStartT = s.bankedT;
  }
}

/* ---------- playing time ---------- */

export const played = (s, p, now) => p.banked + (p.on ? gameTime(s, now) - p.changedAt : 0);
// Time since the player last went on, came off or sat out.
export const stint = (s, p, now) => gameTime(s, now) - p.changedAt;
export const onCount = (s) => s.players.filter((p) => p.on).length;

// Time played in each period: a number for finished and current periods, null for ones to come.
export function periodTimes(s, p, now) {
  return Array.from({ length: s.config.periods }, (_, i) => {
    const before = i === 0 ? 0 : p.marks[i - 1];
    if (i < p.marks.length) return p.marks[i] - before;
    if (i === s.period && !s.finished) return played(s, p, now) - (before ?? 0);
    return null;
  });
}

// How evenly time is shared among everyone available to play.
// target: each player's share if the whole scheduled game were split evenly.
export function fairness(s, now) {
  const squad = s.players.filter((p) => !p.out);
  if (!squad.length) return { average: 0, target: 0, spread: 0, count: 0 };
  const times = squad.map((p) => played(s, p, now));
  const scheduled = s.config.periods * periodLength(s) * Math.min(s.config.onField, squad.length);
  return {
    average: times.reduce((a, b) => a + b, 0) / squad.length,
    target: scheduled / squad.length,
    spread: Math.max(...times) - Math.min(...times),
    count: squad.length,
  };
}

// 'low' needs time, 'high' has had plenty, 'ok' is within 15% of the average.
export function fairnessLevel(ms, average) {
  if (average < 15_000) return 'ok';
  const ratio = ms / average;
  return ratio < 0.85 ? 'low' : ratio > 1.15 ? 'high' : 'ok';
}

/* ---------- undo ---------- */

const copyPlayers = (players) => players.map((p) => ({ ...p, marks: [...p.marks] }));

function remember(s) {
  s.history.push({ players: copyPlayers(s.players), queue: s.queue.map((q) => ({ ...q })) });
  if (s.history.length > HISTORY_LIMIT) s.history.shift();
}

export const canUndo = (s) => s.history.length > 0;

// Reverts the last lineup change as if it never happened. The clock is untouched.
export function undo(s) {
  const last = s.history.pop();
  if (!last) return false;
  s.players = last.players;
  s.queue = last.queue;
  return true;
}

/* ---------- lineup changes ---------- */

const find = (s, id) => s.players.find((p) => p.id === id);

function takeOff(p, t) {
  p.banked += t - p.changedAt;
  p.on = false;
  p.changedAt = t;
}

function putOn(p, t) {
  p.on = true;
  p.changedAt = t;
}

// Swap (both ids), send in (inId only, needs an open spot) or take off (outId only).
export function substitute(s, { inId = null, outId = null }, now) {
  if (s.finished) return false;
  const pin = inId === null ? null : find(s, inId);
  const pout = outId === null ? null : find(s, outId);
  if (!pin && !pout) return false;
  if (pin === undefined || pout === undefined) return false;
  if (pin && (pin.on || pin.out)) return false;
  if (pout && !pout.on) return false;
  if (pin && !pout && onCount(s) >= s.config.onField) return false;

  const t = gameTime(s, now);
  remember(s);
  if (pout) takeOff(pout, t);
  if (pin) putOn(pin, t);
  pruneQueue(s);
  return true;
}

// Sits a player out (hurt, left early) or brings them back to the bench. Their time is kept.
export function setOut(s, id, out, now) {
  const p = find(s, id);
  if (s.finished || !p || p.out === out) return false;
  const t = gameTime(s, now);
  remember(s);
  if (p.on) takeOff(p, t);
  p.out = out;
  p.changedAt = t;
  pruneQueue(s);
  return true;
}

// A late arrival. Starts on the bench with no time played.
export function addPlayer(s, { name, number = '' }, now) {
  if (s.finished || !String(name).trim()) return null;
  remember(s);
  const id = s.players.reduce((max, p) => Math.max(max, p.id), -1) + 1;
  const p = newPlayer(id, name, number, false, gameTime(s, now), s.period);
  s.players.push(p);
  return p;
}

/* ---------- queue ---------- */

const queuedIds = (s) => new Set(s.queue.flatMap((q) => [q.inId, q.outId]));

// Position in the queue (0-based) of the pair this player is part of, or -1.
export const queueIndex = (s, id) => s.queue.findIndex((q) => q.inId === id || q.outId === id);

function pruneQueue(s) {
  const seen = new Set();
  s.queue = s.queue.filter(({ inId, outId }) => {
    const pin = find(s, inId);
    const pout = find(s, outId);
    if (!pin || !pout || pin.on || pin.out || !pout.on || seen.has(inId) || seen.has(outId)) return false;
    seen.add(inId).add(outId);
    return true;
  });
}

export function queueSub(s, { inId, outId }) {
  if (s.finished) return false;
  const pin = find(s, inId);
  const pout = find(s, outId);
  const taken = queuedIds(s);
  if (!pin || !pout || pin.on || pin.out || !pout.on || taken.has(inId) || taken.has(outId)) return false;
  s.queue.push({ inId, outId });
  return true;
}

export function unqueue(s, id) {
  const i = queueIndex(s, id);
  if (i < 0) return false;
  s.queue.splice(i, 1);
  return true;
}

export function clearQueue(s) {
  s.queue = [];
}

// Makes every queued substitution at the same moment. One undo reverses them all.
export function applyQueue(s, now) {
  if (s.finished) return 0;
  pruneQueue(s);
  const pairs = s.queue;
  if (!pairs.length) return 0;
  const t = gameTime(s, now);
  remember(s);
  s.queue = [];
  for (const { inId, outId } of pairs) {
    takeOff(find(s, outId), t);
    putOn(find(s, inId), t);
  }
  return pairs.length;
}

// The swap that evens things out most: most played on the field for least played on the bench.
// Skips queued players. Null when there is no one to swap or it would not help.
export function suggestSwap(s, now) {
  if (s.finished) return null;
  const taken = queuedIds(s);
  const free = s.players.filter((p) => !p.out && !taken.has(p.id));
  const out = free
    .filter((p) => p.on)
    .sort((a, b) => played(s, b, now) - played(s, a, now) || a.changedAt - b.changedAt || a.id - b.id)[0];
  const into = free
    .filter((p) => !p.on)
    .sort((a, b) => played(s, a, now) - played(s, b, now) || a.changedAt - b.changedAt || a.id - b.id)[0];
  if (!out || !into || played(s, into, now) >= played(s, out, now)) return null;
  return { inId: into.id, outId: out.id };
}

// On the field: longest current stint first. Bench: least played first, then longest wait.
export function sortedPlayers(s, now) {
  const on = s.players.filter((p) => p.on).sort((a, b) => a.changedAt - b.changedAt || a.id - b.id);
  const bench = s.players
    .filter((p) => !p.on && !p.out)
    .sort((a, b) => played(s, a, now) - played(s, b, now) || a.changedAt - b.changedAt || a.id - b.id);
  const out = s.players.filter((p) => p.out);
  return { on, bench, out };
}

/* ---------- storage ---------- */

// Checks a game loaded from storage and fills in anything an older version did not save.
// Returns null if it cannot be used.
export function revive(raw) {
  const time = (v) => Number.isFinite(v) && v >= 0;
  const count = (v) => Number.isInteger(v) && v >= 1;
  try {
    const c = raw.config;
    if (![c.periods, c.minutes, c.onField].every(count)) return null;
    if (![raw.period, raw.periodStartT, raw.bankedT].every(time)) return null;
    if (raw.runningSince !== null && !time(raw.runningSince)) return null;
    if (!Array.isArray(raw.players) || !raw.players.length) return null;

    const fixPlayer = (p) => {
      if (!Number.isInteger(p.id) || typeof p.name !== 'string' || !time(p.banked) || !time(p.changedAt)) {
        throw new Error('bad player');
      }
      const marks = Array.isArray(p.marks) ? p.marks.filter(time) : [];
      const done = raw.period + (raw.finished ? 1 : 0);
      while (marks.length < done) marks.push(marks.at(-1) ?? 0);
      return {
        id: p.id,
        name: p.name,
        number: typeof p.number === 'string' ? p.number : '',
        on: p.on === true && p.out !== true,
        out: p.out === true,
        banked: p.banked,
        changedAt: p.changedAt,
        marks: marks.slice(0, done),
      };
    };
    const fixQueue = (q) =>
      (Array.isArray(q) ? q : []).filter((x) => Number.isInteger(x?.inId) && Number.isInteger(x?.outId))
        .map(({ inId, outId }) => ({ inId, outId }));

    const s = {
      config: {
        sport: String(c.sport ?? ''),
        periods: c.periods,
        minutes: c.minutes,
        onField: c.onField,
        countdown: c.countdown === true,
        area: typeof c.area === 'string' ? c.area : 'field',
      },
      players: raw.players.map(fixPlayer),
      period: Math.min(raw.period, c.periods - 1),
      periodStartT: raw.periodStartT,
      bankedT: raw.bankedT,
      runningSince: raw.runningSince,
      finished: raw.finished === true,
      queue: fixQueue(raw.queue),
      history: (Array.isArray(raw.history) ? raw.history : []).slice(-HISTORY_LIMIT).map((h) => ({
        players: h.players.map(fixPlayer),
        queue: fixQueue(h.queue),
      })),
    };
    pruneQueue(s);
    return s;
  } catch {
    return null;
  }
}

export function formatClock(ms, roundUp = false) {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
