import { PRESETS, periodName, periodShort } from './presets.js';
import * as G from './game.js';
import * as R from './report.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const fmt = G.formatClock;
const STORE = 'subtracker.v2';
const OLD_STORE = 'subtracker.v1';
const LEVELS = { low: 'Needs time', ok: '', high: 'Plenty' };

let team = []; // saved roster on the setup screen: { name, number, status: 'start' | 'bench' | 'away' }
let game = null; // current game state, or null on the setup screen
let view = 'live'; // 'live' or 'times'
let mode = 'swap'; // 'swap' substitutes at once, 'queue' lines subs up for the next stoppage
let selected = null; // id of the player tapped first
let pending = null; // a suggested swap waiting for a yes: { inId, outId }
let message = ''; // result of the last action, shown until the next tap
let timer = null;
let wakeLock = null;
let lastSecond = null;
const cards = new Map(); // player id -> card elements

/* ---------- storage ---------- */

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE));
    if (data) return data;
    // First run after the upgrade: carry over the roster and any game in progress.
    const old = JSON.parse(localStorage.getItem(OLD_STORE));
    if (!old) return {};
    const { roster = '', ...setup } = old.setup ?? {};
    const names = String(roster).split('\n').map((n) => n.trim()).filter(Boolean);
    return { setup: { ...setup, team: names.map((name) => ({ name, number: '', status: 'bench' })) }, game: old.game };
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

const settings = $('settings');
const spots = () => Math.max(1, Number(settings.onField.value) || 1);

function applyPreset(key) {
  const p = PRESETS[key];
  settings.periods.value = p.periods;
  settings.minutes.value = p.minutes;
  settings.onField.value = p.onField;
  settings.direction.value = p.countdown ? 'down' : 'up';
}

// Keeps the starting lineup the right size: trims from the bottom of the list, fills from the top.
function fixStarters() {
  const starters = team.filter((p) => p.status === 'start');
  for (const p of starters.slice(spots())) p.status = 'bench';
  let open = spots() - starters.length;
  for (const p of team) {
    if (open <= 0) break;
    if (p.status === 'bench') {
      p.status = 'start';
      open -= 1;
    }
  }
}

function saveSetup() {
  save({
    setup: {
      sport: settings.sport.value,
      periods: settings.periods.value,
      minutes: settings.minutes.value,
      onField: settings.onField.value,
      direction: settings.direction.value,
      team,
    },
  });
}

function renderTeamCount(note = '') {
  const here = team.filter((p) => p.status !== 'away').length;
  const starting = team.filter((p) => p.status === 'start').length;
  const away = team.length - here;
  $('team-count').textContent = note || (team.length
    ? `${here} here, ${starting} of ${spots()} starting${away ? `, ${away} away` : ''}`
    : '');
}

function renderTeam() {
  $('team').replaceChildren(...team.map((p, i) => {
    const who = p.name || 'this player';
    const role = el('select', { ariaLabel: `Role for ${who}` },
      el('option', { value: 'start', textContent: 'Starting' }),
      el('option', { value: 'bench', textContent: 'Bench' }),
      el('option', { value: 'away', textContent: 'Away' }));
    role.value = p.status;
    const row = el('li', { className: p.status === 'away' ? 'away' : '' },
      el('input', { className: 'number', value: p.number, maxLength: 3, inputMode: 'numeric', placeholder: '#',
        ariaLabel: `Jersey number for ${who}`, autocomplete: 'off' }),
      el('input', { className: 'name', value: p.name, maxLength: 40, ariaLabel: 'Player name', autocomplete: 'off',
        spellcheck: false }),
      role,
      el('button', { type: 'button', className: 'quiet remove', textContent: '✕', ariaLabel: `Remove ${who}` }));
    row.dataset.index = i;
    return row;
  }));
  renderTeamCount();
}

function parseEntry(line, number = '') {
  let name = line.trim().replace(/\s+/g, ' ');
  if (!number) {
    const m = name.match(/^#?(\d{1,3})[\s.):-]+(\S.*)$/);
    if (m) [, number, name] = m;
  }
  return name ? { name: name.slice(0, 40), number: number.trim().slice(0, 3), status: 'bench' } : null;
}

function addToTeam(entries) {
  const added = entries.filter(Boolean);
  if (!added.length) return;
  team.push(...added);
  fixStarters();
  $('setup-error').textContent = '';
  saveSetup();
  renderTeam();
}

function initSetup() {
  const saved = load().setup ?? {};
  const sport = saved.sport in PRESETS ? saved.sport : 'basketball';

  $('sports').append(
    ...Object.entries(PRESETS).map(([key, p]) => el('label', { className: 'sport' },
      el('input', { type: 'radio', name: 'sport', value: key, checked: key === sport }),
      el('span', { textContent: p.label }),
      el('small', { textContent: p.detail }))),
  );

  applyPreset(sport);
  for (const field of ['periods', 'minutes', 'onField', 'direction']) {
    if (saved[field]) settings[field].value = saved[field];
  }
  team = (Array.isArray(saved.team) ? saved.team : [])
    .filter((p) => p && typeof p.name === 'string')
    .map((p) => ({
      name: p.name,
      number: typeof p.number === 'string' ? p.number : '',
      status: ['start', 'bench', 'away'].includes(p.status) ? p.status : 'bench',
    }));
  fixStarters();
  renderTeam();

  settings.addEventListener('submit', (e) => e.preventDefault());
  settings.addEventListener('change', (e) => {
    if (e.target.name === 'sport') applyPreset(e.target.value);
    fixStarters();
    saveSetup();
    renderTeam();
  });

  const addForm = $('add-form');
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addToTeam([parseEntry(addForm.name.value, addForm.number.value)]);
    addForm.reset();
    addForm.name.focus();
  });
  addForm.name.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/[\r\n]/.test(text.trim())) return;
    e.preventDefault();
    addToTeam(text.split(/[\r\n]+/).map((line) => parseEntry(line)));
  });

  const list = $('team');
  const rowOf = (target) => team[Number(target.closest('li')?.dataset.index)];
  list.addEventListener('input', (e) => {
    const p = rowOf(e.target);
    if (!p || e.target.tagName !== 'INPUT') return;
    p[e.target.classList.contains('number') ? 'number' : 'name'] = e.target.value;
    saveSetup();
  });
  list.addEventListener('change', (e) => {
    const p = rowOf(e.target);
    if (!p || e.target.tagName !== 'SELECT') return;
    const full = e.target.value === 'start' && team.filter((x) => x.status === 'start').length >= spots();
    if (!full) p.status = e.target.value;
    if (p.status === 'away') fixStarters();
    saveSetup();
    const index = e.target.closest('li').dataset.index;
    renderTeam();
    if (full) renderTeamCount(`Only ${spots()} can start. Move a starter to the bench first.`);
    list.children[index]?.querySelector('select').focus();
  });
  list.addEventListener('click', (e) => {
    if (!e.target.closest('.remove')) return;
    team.splice(Number(e.target.closest('li').dataset.index), 1);
    fixStarters();
    saveSetup();
    renderTeam();
    addForm.name.focus();
  });

  $('start-game').addEventListener('click', () => {
    if (!settings.reportValidity()) return;
    team = team.filter((p) => p.name.trim());
    const here = team.filter((p) => p.status !== 'away');
    if (!here.length) {
      renderTeam();
      $('setup-error').textContent = 'Add at least one player.';
      addForm.name.focus();
      return;
    }
    const sportKey = settings.sport.value;
    const config = {
      sport: sportKey,
      periods: Number(settings.periods.value),
      minutes: Number(settings.minutes.value),
      onField: Number(settings.onField.value),
      countdown: settings.direction.value === 'down',
      area: PRESETS[sportKey].area,
    };
    game = G.createGame(config, here.map((p) => ({
      name: p.name.trim(),
      number: p.number.trim(),
      on: p.status === 'start',
    })));
    saveSetup();
    save({ game });
    resetGameView();
    render();
    window.scrollTo(0, 0);
    $('toggle').focus();
  });
}

/* ---------- game screen ---------- */

function resetGameView() {
  view = 'live';
  selected = null;
  pending = null;
  message = '';
  cards.clear();
  for (const id of ['on-list', 'bench-list', 'out-list']) $(id).replaceChildren();
}

function card(p) {
  let c = cards.get(p.id);
  if (!c) {
    const span = (className, ...children) => el('span', { className }, ...children);
    c = {
      btn: el('button', { type: 'button', className: 'player' }),
      number: span('number'),
      name: span('name'),
      tag: span('tag'),
      played: span('played'),
      stint: span('stint'),
      fill: span('fill'),
      level: span('level'),
    };
    c.btn.dataset.id = p.id;
    c.btn.append(
      span('who', c.number, c.name, c.tag),
      span('nums', c.played, c.stint),
      span('fair', span('bar', c.fill), c.level),
    );
    cards.set(p.id, c);
  }
  c.number.textContent = p.number;
  c.name.textContent = p.name;
  return c;
}

const byId = (id) => game.players.find((p) => p.id === id);
const currentPeriod = () => periodName(game.config.periods, game.period);

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
  const showTimes = game.finished || view === 'times';

  $('period-label').textContent = game.finished ? 'Final' : currentPeriod();
  document.querySelector('.controls').hidden = game.finished;
  $('views').hidden = game.finished;
  $('live').hidden = showTimes;
  $('times').hidden = !showTimes;
  for (const btn of $('views').children) {
    btn.setAttribute('aria-pressed', String(btn.dataset.view === (showTimes ? 'times' : 'live')));
  }

  const toggle = $('toggle');
  toggle.textContent = running ? 'Pause' : G.periodElapsed(game, now) > 0 ? 'Resume' : 'Start';
  toggle.disabled = expired;
  toggle.classList.toggle('primary', !expired);
  const end = $('end-period');
  end.textContent = last ? 'End game' : `End ${currentPeriod()}`;
  end.classList.toggle('primary', expired);

  if (!showTimes) renderLive(now);
  renderActionBar();
  lastSecond = null;
  tick();
}

function renderLive(now) {
  const { config } = game;
  const { on, bench, out } = G.sortedPlayers(game, now);
  const focused = document.activeElement?.dataset?.id;
  $('on-list').replaceChildren(...on.map((p) => card(p).btn));
  $('bench-list').replaceChildren(...bench.map((p) => card(p).btn));
  $('out-list').replaceChildren(...out.map((p) => card(p).btn));
  if (focused !== undefined) cards.get(Number(focused))?.btn.focus();

  for (const p of game.players) {
    const c = card(p);
    const chosen = p.id === selected || p.id === pending?.inId || p.id === pending?.outId;
    c.btn.setAttribute('aria-pressed', String(chosen));
    const q = G.queueIndex(game, p.id);
    c.tag.textContent = q < 0 ? '' : `${p.on ? 'Out' : 'In'} ${q + 1}`;
  }

  $('on-title').textContent = `On ${config.area}`;
  const count = $('on-count');
  const short = on.length < config.onField;
  count.textContent = `${on.length}/${config.onField}${short && bench.length ? ', spot open' : ''}`;
  count.classList.toggle('short', short);
  $('on-empty').hidden = on.length > 0;
  $('bench-empty').hidden = bench.length > 0;
  $('out-group').hidden = out.length === 0;

  for (const btn of $('modes').children) btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));

  const pairs = game.queue;
  $('queue-bar').hidden = pairs.length === 0;
  $('queue-list').replaceChildren(...pairs.map(({ inId, outId }) =>
    el('li', { textContent: `${byId(inId).name} in for ${byId(outId).name}` })));
  $('queue-go').textContent = `Make ${pairs.length} sub${pairs.length === 1 ? '' : 's'}`;

  const { target, count: squad } = G.fairness(game, now);
  $('fair-note').textContent = squad > config.onField
    ? `An even share is ${fmt(target)} each over the full game. Bars fill toward it.`
    : '';
}

function renderActionBar() {
  const live = !$('live').hidden;
  const sel = live ? byId(selected) : undefined;
  const offer = live ? pending : null;
  const open = G.onCount(game) < game.config.onField;
  let status = '';

  if (offer) {
    status = `Suggested: ${byId(offer.inId).name} in for ${byId(offer.outId).name}.`;
    $('apply').textContent = mode === 'queue' ? 'Queue it' : 'Swap';
  } else if (sel) {
    status = sel.on
      ? `${sel.name}: tap a bench player to swap.`
      : `${sel.name}: tap a player on the ${game.config.area} to swap.`;
    $('move').textContent = sel.on ? 'To bench' : 'Put in';
  } else if (game.finished) {
    status = message || 'Game over.';
  } else if (!live) {
    status = message;
  } else {
    status = message || (mode === 'queue'
      ? 'Tap one player on and one off to queue a sub.'
      : 'Tap a player to substitute.');
  }

  $('status').textContent = status;
  $('apply').hidden = !offer;
  $('move').hidden = !sel || (!sel.on && !open);
  $('sit-out').hidden = !sel;
  $('cancel').hidden = !sel && !offer;
  $('undo').hidden = !live || Boolean(sel || offer) || !G.canUndo(game);
  $('new-game').className = game.finished ? 'primary' : 'quiet';
}

function renderTimes(now) {
  const { periods } = game.config;
  const fair = G.fairness(game, now);
  $('kpi-time').textContent = fmt(G.gameTime(game, now));
  $('kpi-average').textContent = fmt(fair.average);
  $('kpi-spread').textContent = fmt(fair.spread);
  $('kpi-target').textContent = fmt(fair.target);

  const th = (textContent, className = '') => el('th', { scope: 'col', textContent, className });
  $('summary-head').replaceChildren(
    th('Player'),
    ...Array.from({ length: periods }, (_, i) => th(periodShort(periods, i), 'num')),
    th('Total', 'num'),
    th('Share', 'num'),
  );

  const where = { on: `on ${game.config.area}`, bench: 'bench', out: 'sitting out' };
  $('summary-body').replaceChildren(...R.rows(game, now, $('sort').value).map((r) => {
    const notes = [game.finished && r.status !== 'out' ? '' : where[r.status], LEVELS[r.level].toLowerCase()];
    const td = (textContent, className = 'num') => el('td', { textContent, className });
    const row = el('tr', {},
      el('th', { scope: 'row' },
        el('span', { textContent: r.number ? `#${r.number} ${r.name}` : r.name }),
        el('small', { textContent: notes.filter(Boolean).join(', ') })),
      ...r.periods.map((ms) => td(ms === null ? '' : fmt(ms))),
      td(fmt(r.ms), 'num total'),
      td(`${r.share}%`));
    row.dataset.level = r.level;
    return row;
  }));
}

// Updates the numbers only.
function tick() {
  if (!game) return;
  const now = Date.now();
  if (G.settle(game, now)) {
    message = `Time is up in ${currentPeriod()}.`;
    save({ game });
    render();
    return;
  }

  const { config } = game;
  const shown = game.finished ? fmt(G.gameTime(game, now)) : fmt(G.clockMs(game, now), config.countdown);
  const clock = $('clock');
  clock.textContent = shown;
  clock.classList.toggle('over', !game.finished && G.isExpired(game, now));
  $('adjust-clock').textContent = shown;

  const second = Math.floor(G.gameTime(game, now) / 1000);
  if (!$('times').hidden) {
    if (second !== lastSecond) renderTimes(now);
  } else {
    const { average, target } = G.fairness(game, now);
    for (const p of game.players) {
      const c = cards.get(p.id);
      if (!c) continue;
      const ms = G.played(game, p, now);
      const level = p.out ? 'ok' : G.fairnessLevel(ms, average);
      c.played.textContent = fmt(ms);
      c.stint.textContent = `${p.out ? 'out' : p.on ? 'on' : 'off'} ${fmt(G.stint(game, p, now))}`;
      c.btn.dataset.level = level;
      c.level.textContent = LEVELS[level];
      c.fill.style.inlineSize = `${target ? Math.min(100, (ms / target) * 100) : 0}%`;
    }
  }
  lastSecond = second;
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

function clearChoice() {
  selected = null;
  pending = null;
  message = '';
}

// Swaps now or queues, depending on the mode.
function makeSub(pin, pout) {
  if (mode === 'queue') {
    if (G.queueSub(game, { inId: pin.id, outId: pout.id })) message = `Queued: ${pin.name} in for ${pout.name}.`;
  } else if (G.substitute(game, { inId: pin.id, outId: pout.id }, Date.now())) {
    message = `${pin.name} in for ${pout.name}.`;
  }
  commit();
}

function tapPlayer(id) {
  const tapped = byId(id);
  const sel = byId(selected);
  clearChoice();
  if (tapped.out) {
    if (G.setOut(game, id, false, Date.now())) message = `${tapped.name} is back on the bench.`;
    commit();
  } else if (G.unqueue(game, id)) {
    message = 'Removed from the queue.';
    commit();
  } else if (!sel || sel.on === tapped.on) {
    selected = sel === tapped ? null : id;
    render();
  } else {
    const [pin, pout] = tapped.on ? [sel, tapped] : [tapped, sel];
    makeSub(pin, pout);
  }
}

let answer = null; // resolves the confirmation that is open

// The close event is asynchronous, so a new request can arrive before the last one has reported.
function settleConfirm() {
  const dialog = $('confirm');
  if (!answer || dialog.open) return;
  answer(dialog.returnValue === 'ok');
  answer = null;
}

function confirmDialog(title, text, okLabel) {
  const dialog = $('confirm');
  if (dialog.open) return Promise.resolve(false);
  settleConfirm();
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-ok').textContent = okLabel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => { answer = resolve; });
}

function downloadCsv() {
  const url = URL.createObjectURL(new Blob([R.csv(game, Date.now())], { type: 'text/csv;charset=utf-8' }));
  const d = new Date();
  const date = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
  const link = el('a', { href: url, download: `playing-time-${date}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initGame() {
  $('confirm').addEventListener('close', settleConfirm);

  $('live').addEventListener('click', (e) => {
    const btn = e.target.closest('.player');
    if (btn) tapPlayer(Number(btn.dataset.id));
  });

  $('views').addEventListener('click', (e) => {
    const next = e.target.closest('button')?.dataset.view;
    if (!next) return;
    view = next;
    clearChoice();
    render();
  });

  $('modes').addEventListener('click', (e) => {
    const next = e.target.closest('button')?.dataset.mode;
    if (!next) return;
    mode = next;
    save({ mode });
    message = '';
    render();
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
    const clock = fmt(G.clockMs(game, Date.now()), config.countdown);
    const ok = await confirmDialog(
      last ? 'End the game?' : `End ${currentPeriod()}?`,
      `The clock shows ${clock}. This can't be undone.`,
      last ? 'End game' : `End ${currentPeriod()}`,
    );
    if (!ok) return;
    G.endPeriod(game, Date.now());
    clearChoice();
    commit();
  });

  /* clock adjustment */

  $('adjust-open').addEventListener('click', () => {
    $('adjust-hint').textContent = `Match the scoreboard. Players on the ${game.config.area} gain or lose the same time.`;
    $('adjust').showModal();
  });
  $('adjust').addEventListener('click', (e) => {
    const seconds = Number(e.target.closest('button')?.dataset.seconds);
    if (!seconds) return;
    const applied = G.adjustClock(game, seconds * 1000, Date.now());
    commit();
    if (Math.abs(applied) < 1000) {
      $('adjust-hint').textContent = seconds < 0 === game.config.countdown
        ? 'The clock is at the end of the period.'
        : 'The clock cannot go back past the last lineup change or the start of the period.';
    }
  });

  /* substitutions */

  $('suggest').addEventListener('click', () => {
    clearChoice();
    pending = G.suggestSwap(game, Date.now());
    if (!pending) message = 'No swap would even things out right now.';
    render();
    if (pending) $('apply').focus();
  });

  $('apply').addEventListener('click', () => {
    if (!pending) return;
    const pin = byId(pending.inId);
    const pout = byId(pending.outId);
    clearChoice();
    makeSub(pin, pout);
  });

  $('move').addEventListener('click', () => {
    const sel = byId(selected);
    if (!sel) return;
    const wasOn = sel.on;
    clearChoice();
    if (G.substitute(game, wasOn ? { outId: sel.id } : { inId: sel.id }, Date.now())) {
      message = wasOn ? `${sel.name} to the bench.` : `${sel.name} in.`;
    }
    commit();
    cards.get(sel.id)?.btn.focus();
  });

  $('sit-out').addEventListener('click', () => {
    const sel = byId(selected);
    if (!sel) return;
    clearChoice();
    if (G.setOut(game, sel.id, true, Date.now())) message = `${sel.name} is sitting out. Tap them to bring them back.`;
    commit();
    cards.get(sel.id)?.btn.focus();
  });

  $('cancel').addEventListener('click', () => {
    const id = selected;
    clearChoice();
    render();
    cards.get(id)?.btn.focus();
  });

  $('undo').addEventListener('click', () => {
    clearChoice();
    if (G.undo(game)) message = 'Undone.';
    commit();
  });

  $('queue-clear').addEventListener('click', () => {
    G.clearQueue(game);
    clearChoice();
    commit();
  });

  $('queue-go').addEventListener('click', () => {
    clearChoice();
    const n = G.applyQueue(game, Date.now());
    if (n) message = `${n} sub${n === 1 ? '' : 's'} made.`;
    commit();
  });

  /* late arrivals */

  const late = $('late');
  const lateForm = $('late-form');
  $('add-open').addEventListener('click', () => {
    lateForm.reset();
    late.returnValue = '';
    late.showModal();
    lateForm.name.focus();
  });
  lateForm.querySelector('[value="cancel"]').addEventListener('click', (e) => {
    e.preventDefault();
    late.close('cancel');
  });
  late.addEventListener('close', () => {
    if (late.returnValue !== 'ok') return;
    const entry = parseEntry(lateForm.name.value, lateForm.number.value);
    if (!entry) return;
    clearChoice();
    const p = G.addPlayer(game, entry, Date.now());
    if (p) {
      message = `${p.name} added to the bench.`;
      team.push({ ...entry, status: 'bench' });
      saveSetup();
    }
    commit();
  });

  /* report */

  $('sort').addEventListener('change', () => renderTimes(Date.now()));

  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(R.text(game, Date.now()));
      message = 'Playing time copied.';
    } catch {
      message = 'Could not copy here. Try the CSV.';
    }
    renderActionBar();
  });

  $('csv').addEventListener('click', downloadCsv);

  $('new-game').addEventListener('click', async () => {
    if (!game.finished) {
      const ok = await confirmDialog('Start a new game?', "This game's playing times will be cleared. Your roster is kept.", 'New game');
      if (!ok) return;
    }
    game = null;
    save({ game: null });
    resetGameView();
    fixStarters();
    renderTeam();
    render();
    window.scrollTo(0, 0);
  });

  document.addEventListener('visibilitychange', () => {
    tick();
    syncWakeLock(Boolean(game) && G.isRunning(game));
  });

  // The same game open in another tab: follow it. Times come from timestamps, so nothing drifts.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE) return;
    const stored = load().game;
    const wasPlaying = Boolean(game);
    game = stored ? G.revive(stored) : null;
    if (Boolean(game) !== wasPlaying) resetGameView();
    else clearChoice();
    render();
  });
}

const stored = load();
mode = stored.mode === 'queue' ? 'queue' : 'swap';
initSetup();
initGame();
game = stored.game ? G.revive(stored.game) : null;
render();
