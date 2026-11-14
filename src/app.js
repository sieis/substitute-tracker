import { PRESETS, periodName } from './presets.js';
import * as G from './game.js';

const $ = (id) => document.getElementById(id);
const STORE = 'subtracker.v1';

let game = null; // current game state, or null on the setup screen
let selected = null; // id of the player tapped first
let message = ''; // result of the last substitution, shown until the next tap
let timer = null;
let wakeLock = null;
const buttons = new Map(); // player id -> button element

/* ---------- storage ---------- */

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) ?? {};
  } catch {
    return {};
  }
}

function save(patch) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...load(), ...patch }));
  } catch {
    // Private mode or full storage: the app still works for this session.
  }
}

/* ---------- setup screen ---------- */

const form = $('setup-form');
const rosterNames = () => form.roster.value.split('\n').map((n) => n.trim()).filter(Boolean);

function applyPreset(key) {
  const p = PRESETS[key];
  form.periods.value = p.periods;
  form.minutes.value = p.minutes;
  form.onField.value = p.onField;
  updateHint();
}

function updateHint() {
  const n = Number(form.onField.value) || 0;
  const count = rosterNames().length;
  $('roster-hint').textContent =
    `One name per line. The first ${n} start.` + (count ? ` ${count} listed.` : '');
}

function initSetup() {
  const saved = load().setup ?? {};
  const sport = saved.sport in PRESETS ? saved.sport : 'basketball';

  $('sports').append(
    ...Object.entries(PRESETS).map(([key, p]) => {
      const label = document.createElement('label');
      label.className = 'sport';
      const input = Object.assign(document.createElement('input'), {
        type: 'radio', name: 'sport', value: key, checked: key === sport,
      });
      const name = Object.assign(document.createElement('span'), { textContent: p.label });
      const detail = Object.assign(document.createElement('small'), { textContent: p.detail });
      label.append(input, name, detail);
      return label;
    }),
  );

  applyPreset(sport);
  for (const field of ['periods', 'minutes', 'onField']) {
    if (saved[field]) form[field].value = saved[field];
  }
  form.roster.value = saved.roster ?? '';
  updateHint();

  form.addEventListener('change', (e) => {
    if (e.target.name === 'sport') applyPreset(e.target.value);
  });
  form.addEventListener('input', () => {
    form.roster.setCustomValidity('');
    updateHint();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const names = rosterNames();
    if (!names.length) {
      form.roster.setCustomValidity('Add at least one player.');
      form.reportValidity();
      return;
    }
    const sportKey = form.sport.value;
    const { countdown, area } = PRESETS[sportKey];
    const config = {
      sport: sportKey,
      periods: Number(form.periods.value),
      minutes: Number(form.minutes.value),
      onField: Number(form.onField.value),
      countdown,
      area,
    };
    game = G.createGame(config, names);
    save({
      setup: { sport: sportKey, periods: config.periods, minutes: config.minutes, onField: config.onField, roster: names.join('\n') },
      game,
    });
    resetGameView();
    render();
    window.scrollTo(0, 0);
    $('toggle').focus();
  });
}

/* ---------- game screen ---------- */

function resetGameView() {
  selected = null;
  message = '';
  buttons.clear();
  $('on-list').replaceChildren();
  $('bench-list').replaceChildren();
}

function playerButton(p) {
  let btn = buttons.get(p.id);
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'player';
    btn.dataset.id = p.id;
    for (const cls of ['name', 'played', 'stint']) {
      btn.append(Object.assign(document.createElement('span'), { className: cls }));
    }
    btn.firstChild.textContent = p.name;
    buttons.set(p.id, btn);
  }
  return btn;
}

const nameOf = (id) => game.players.find((p) => p.id === id)?.name;

// Rebuilds structure. Runs on every state change, not on clock ticks.
function render() {
  $('setup').hidden = Boolean(game);
  $('game').hidden = !game;
  syncTimer();
  if (!game) return;

  const now = Date.now();
  const { config } = game;
  const running = G.isRunning(game);
  const expired = config.countdown && G.isExpired(game, now);
  const last = game.period + 1 >= config.periods;
  const name = periodName(config.periods, game.period);

  $('period-label').textContent = game.finished ? 'Final' : name;
  document.querySelector('.controls').hidden = game.finished;
  $('live').hidden = game.finished;
  $('summary').hidden = !game.finished;

  const toggle = $('toggle');
  toggle.textContent = running ? 'Pause' : G.periodElapsed(game, now) > 0 ? 'Resume' : 'Start';
  toggle.disabled = expired;
  toggle.classList.toggle('primary', !expired);
  const end = $('end-period');
  end.textContent = last ? 'End game' : `End ${name}`;
  end.classList.toggle('primary', expired);

  if (game.finished) {
    renderSummary(now);
  } else {
    const { on, bench } = G.sortedPlayers(game, now);
    const focused = document.activeElement?.dataset?.id;
    $('on-list').replaceChildren(...on.map(playerButton));
    $('bench-list').replaceChildren(...bench.map(playerButton));
    if (focused !== undefined) buttons.get(Number(focused))?.focus();
    for (const [id, btn] of buttons) btn.setAttribute('aria-pressed', String(id === selected));

    $('on-title').textContent = `On ${config.area}`;
    const count = $('on-count');
    count.textContent = `${on.length}/${config.onField}`;
    count.classList.toggle('short', on.length < config.onField);
    $('bench-empty').hidden = bench.length > 0;
  }

  renderActionBar();
  tick();
}

function renderActionBar() {
  const move = $('move');
  const sel = game.players.find((p) => p.id === selected);
  const open = G.onCount(game) < game.config.onField;
  let status = '';

  if (game.finished) {
    status = 'Game over.';
  } else if (sel) {
    status = sel.on
      ? `${sel.name}: tap a bench player to swap.`
      : `${sel.name}: tap a player on the ${game.config.area} to swap.`;
    move.textContent = sel.on ? 'To bench' : 'Put in';
  } else {
    status = message || 'Tap a player to substitute.';
  }

  $('new-game').className = game.finished ? 'primary' : 'quiet';
  $('status').textContent = status;
  move.hidden = !sel || (!sel.on && !open);
  $('cancel').hidden = !sel;
  $('undo').hidden = Boolean(sel) || !message || !game.undo || game.finished;
}

function renderSummary(now) {
  const total = G.gameTime(game, now);
  const rows = [...game.players]
    .sort((a, b) => G.played(game, b, now) - G.played(game, a, now) || a.id - b.id)
    .map((p) => {
      const ms = G.played(game, p, now);
      const tr = document.createElement('tr');
      const th = Object.assign(document.createElement('th'), { scope: 'row', textContent: p.name });
      const time = Object.assign(document.createElement('td'), { className: 'num', textContent: G.formatClock(ms) });
      const share = Object.assign(document.createElement('td'), {
        className: 'num',
        textContent: total ? `${Math.round((ms / total) * 100)}%` : '0%',
      });
      tr.append(th, time, share);
      return tr;
    });
  $('summary-body').replaceChildren(...rows);
}

// Updates the numbers only.
function tick() {
  if (!game) return;
  const now = Date.now();
  if (G.settle(game, now)) {
    save({ game });
    render();
    return;
  }

  const { config } = game;
  const clock = $('clock');
  clock.textContent = game.finished
    ? G.formatClock(G.gameTime(game, now))
    : G.formatClock(G.clockMs(game, now), config.countdown);
  clock.classList.toggle('over', !game.finished && G.isExpired(game, now));

  if (game.finished) return;
  for (const p of game.players) {
    const btn = buttons.get(p.id);
    if (!btn) continue;
    btn.children[1].textContent = G.formatClock(G.played(game, p, now));
    btn.children[2].textContent = `${p.on ? 'on' : 'off'} ${G.formatClock(G.stint(game, p, now))}`;
  }
}

function syncTimer() {
  const running = Boolean(game) && G.isRunning(game);
  if (running && !timer) timer = setInterval(tick, 250);
  if (!running && timer) {
    clearInterval(timer);
    timer = null;
  }
  syncWakeLock(running);
}

// Keep the screen on while the clock runs. Unsupported browsers just dim as usual.
async function syncWakeLock(running) {
  if (!('wakeLock' in navigator)) return;
  const want = running && document.visibilityState === 'visible';
  if (want && !wakeLock) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
      // Denied (low battery, for example).
    }
  } else if (!want && wakeLock) {
    wakeLock.release();
  }
}

function commit() {
  save({ game });
  render();
}

function tapPlayer(id) {
  const tapped = game.players.find((p) => p.id === id);
  const sel = game.players.find((p) => p.id === selected);
  message = '';
  if (!sel || sel.on === tapped.on) {
    selected = sel === tapped ? null : id;
    render();
    return;
  }
  const [pin, pout] = tapped.on ? [sel, tapped] : [tapped, sel];
  selected = null;
  if (G.substitute(game, { inId: pin.id, outId: pout.id }, Date.now())) {
    message = `${pin.name} in for ${pout.name}.`;
  }
  commit();
}

let confirming = false;

function confirmDialog(title, text, okLabel) {
  const dialog = $('confirm');
  // The close event is asynchronous, so ignore a second request until the first has resolved.
  if (confirming) return Promise.resolve(false);
  confirming = true;
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-ok').textContent = okLabel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const ok = dialog.returnValue === 'ok';
      dialog.returnValue = '';
      confirming = false;
      resolve(ok);
    }, { once: true });
  });
}

function initGame() {
  $('live').addEventListener('click', (e) => {
    const btn = e.target.closest('.player');
    if (btn) tapPlayer(Number(btn.dataset.id));
  });

  $('toggle').addEventListener('click', () => {
    const now = Date.now();
    if (G.isRunning(game)) G.pause(game, now);
    else G.start(game, now);
    commit();
  });

  $('end-period').addEventListener('click', async () => {
    const { config } = game;
    const last = game.period + 1 >= config.periods;
    const name = periodName(config.periods, game.period);
    const clock = G.formatClock(G.clockMs(game, Date.now()), config.countdown);
    const ok = await confirmDialog(
      last ? 'End the game?' : `End ${name}?`,
      `The clock shows ${clock}. This can't be undone.`,
      last ? 'End game' : `End ${name}`,
    );
    if (!ok) return;
    G.endPeriod(game, Date.now());
    selected = null;
    message = '';
    commit();
  });

  $('move').addEventListener('click', () => {
    const sel = game.players.find((p) => p.id === selected);
    if (!sel) return;
    const wasOn = sel.on;
    selected = null;
    if (G.substitute(game, wasOn ? { outId: sel.id } : { inId: sel.id }, Date.now())) {
      message = wasOn ? `${sel.name} to the bench.` : `${sel.name} in.`;
    }
    commit();
    buttons.get(sel.id)?.focus();
  });

  $('cancel').addEventListener('click', () => {
    const id = selected;
    selected = null;
    render();
    buttons.get(id)?.focus();
  });

  $('undo').addEventListener('click', () => {
    if (G.undo(game)) message = 'Substitution undone.';
    commit();
  });

  $('new-game').addEventListener('click', async () => {
    if (!game.finished) {
      const ok = await confirmDialog('Start a new game?', "This game's playing times will be cleared.", 'New game');
      if (!ok) return;
    }
    game = null;
    save({ game: null });
    resetGameView();
    render();
    window.scrollTo(0, 0);
  });

  document.addEventListener('visibilitychange', () => {
    tick();
    syncWakeLock(Boolean(game) && G.isRunning(game));
  });
}

initSetup();
initGame();
game = load().game ?? null;
render();
