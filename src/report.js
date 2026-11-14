// Playing time report: table rows, a plain-text summary and a CSV export. No DOM here.
import * as G from './game.js';
import { PRESETS, periodName, periodShort } from './presets.js';

const SORTS = {
  least: (a, b) => a.ms - b.ms,
  most: (a, b) => b.ms - a.ms,
  number: (a, b) => (parseInt(a.number, 10) || Infinity) - (parseInt(b.number, 10) || Infinity),
  name: (a, b) => a.name.localeCompare(b.name),
};

export function rows(s, now, sort = 'most') {
  const total = G.gameTime(s, now);
  const { average } = G.fairness(s, now);
  return s.players
    .map((p) => {
      const ms = G.played(s, p, now);
      return {
        id: p.id,
        number: p.number,
        name: p.name,
        status: p.out ? 'out' : p.on ? 'on' : 'bench',
        ms,
        share: total ? Math.round((ms / total) * 100) : 0,
        periods: G.periodTimes(s, p, now),
        level: p.out ? 'ok' : G.fairnessLevel(ms, average),
      };
    })
    .sort((a, b) => (SORTS[sort] ?? SORTS.most)(a, b) || a.id - b.id);
}

const sportName = (s) => {
  const preset = PRESETS[s.config.sport];
  return preset ? `${preset.label} ${preset.detail}` : 'Game';
};

const label = (r) => (r.number ? `#${r.number} ${r.name}` : r.name);

export function text(s, now) {
  const where = s.finished ? 'Final' : periodName(s.config.periods, s.period);
  return [
    `${sportName(s)} playing time (${where})`,
    `Game time ${G.formatClock(G.gameTime(s, now))}`,
    '',
    ...rows(s, now, 'most').map((r) => `${label(r)}: ${G.formatClock(r.ms)} (${r.share}%)`),
  ].join('\n');
}

// Quotes every cell and defuses values a spreadsheet would run as a formula.
function cell(value) {
  let t = String(value);
  if (/^\s*[=+\-@]/.test(t) || /^[\t\r\n]/.test(t)) t = `'${t}`;
  return `"${t.replaceAll('"', '""')}"`;
}

export function csv(s, now) {
  const { periods } = s.config;
  const heads = ['Number', 'Player', 'Status', ...Array.from({ length: periods }, (_, i) => periodShort(periods, i)),
    'Total', 'Total seconds', 'Share'];
  const status = { on: `On ${s.config.area}`, bench: 'Bench', out: 'Sitting out' };
  const lines = rows(s, now, 'most').map((r) => [
    r.number,
    r.name,
    status[r.status],
    ...r.periods.map((ms) => (ms === null ? '' : G.formatClock(ms))),
    G.formatClock(r.ms),
    Math.floor(r.ms / 1000),
    `${r.share}%`,
  ]);
  return [heads, ...lines].map((line) => line.map(cell).join(',')).join('\r\n');
}
