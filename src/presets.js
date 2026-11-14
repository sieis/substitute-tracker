// Prebuilt game formats. Periods, minutes and players are editable on the setup screen.
// countdown: the clock runs down and stops at zero (basketball). Otherwise it runs up
// and keeps going until the coach ends the period (soccer, to allow stoppage time).
export const PRESETS = {
  basketball: { label: 'Basketball', detail: '5v5', periods: 4, minutes: 8, onField: 5, countdown: true, area: 'court' },
  soccer7: { label: 'Soccer', detail: '7v7', periods: 2, minutes: 25, onField: 7, countdown: false, area: 'field' },
  soccer9: { label: 'Soccer', detail: '9v9', periods: 2, minutes: 30, onField: 9, countdown: false, area: 'field' },
  soccer11: { label: 'Soccer', detail: '11v11', periods: 2, minutes: 35, onField: 11, countdown: false, area: 'field' },
};

export function periodName(count, index) {
  if (count === 2) return index === 0 ? '1st half' : '2nd half';
  if (count === 4) return `Q${index + 1}`;
  return `Period ${index + 1}`;
}
