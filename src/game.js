// Game state and rules. No DOM here: every function takes the current time so it can be tested.
//
// All playing time derives from one number, T: total game-clock time elapsed across all periods.
// A player on the field has played `banked + (T - changedAt)`. Nothing needs updating per tick,
// and a reload or a sleeping tab cannot drift because T comes from wall-clock timestamps.

const MINUTE = 60_000;

export function createGame(config, names) {
  return {
    config,
    players: names.map((name, id) => ({ id, name, on: id < config.onField, banked: 0, changedAt: 0 })),
    period: 0,
    periodStartT: 0,
    bankedT: 0,
    runningSince: null,
    finished: false,
    undo: null,
  };
}

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

export function endPeriod(s, now) {
  if (s.finished) return;
  pause(s, now);
  if (s.period + 1 >= s.config.periods) {
    s.finished = true;
  } else {
    s.period += 1;
    s.periodStartT = s.bankedT;
  }
}

export const played = (s, p, now) => p.banked + (p.on ? gameTime(s, now) - p.changedAt : 0);
// Time since the player last went on or came off.
export const stint = (s, p, now) => gameTime(s, now) - p.changedAt;
export const onCount = (s) => s.players.filter((p) => p.on).length;

// Swap (both ids), send in (inId only, needs an open spot) or take off (outId only).
export function substitute(s, { inId = null, outId = null }, now) {
  if (s.finished) return false;
  const find = (id) => (id === null ? null : s.players.find((p) => p.id === id));
  const pin = find(inId);
  const pout = find(outId);
  if (!pin && !pout) return false;
  if (pin === undefined || pout === undefined) return false;
  if (pin && pin.on) return false;
  if (pout && !pout.on) return false;
  if (pin && !pout && onCount(s) >= s.config.onField) return false;

  const t = gameTime(s, now);
  s.undo = s.players.map((p) => ({ ...p }));
  if (pout) {
    pout.banked += t - pout.changedAt;
    pout.on = false;
    pout.changedAt = t;
  }
  if (pin) {
    pin.on = true;
    pin.changedAt = t;
  }
  return true;
}

// Reverts the last substitution as if it never happened. The clock is untouched.
export function undo(s) {
  if (!s.undo) return false;
  s.players = s.undo;
  s.undo = null;
  return true;
}

// On the field: longest current stint first. Bench: least played first, then longest wait.
export function sortedPlayers(s, now) {
  const on = s.players.filter((p) => p.on).sort((a, b) => a.changedAt - b.changedAt || a.id - b.id);
  const bench = s.players
    .filter((p) => !p.on)
    .sort((a, b) => played(s, a, now) - played(s, b, now) || a.changedAt - b.changedAt || a.id - b.id);
  return { on, bench };
}

export function formatClock(ms, roundUp = false) {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
