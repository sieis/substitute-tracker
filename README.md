# FairShift

Playing time and substitution tracker for youth sports, built for a coach holding a phone on the sideline. One self-contained `index.html`: no build step, no dependencies, works offline.

## Presets

| Game | Periods | Active spots |
| --- | --- | --- |
| Basketball | 4 x 8 min | 5 |
| Soccer 7v7 | 4 x 10 min | 7 |
| Soccer 9v9 | 4 x 12 min | 9 |
| Soccer 11v11 | 4 x 12 min | 11 |

Active spots, minutes per period and number of periods can be edited on the Roster & Setup tab.

## Using it

**Roster & Setup**: add players one at a time or paste a comma-separated list (`Ben, Caleb, 12 Jed`). A leading number sets the jersey; players without one are numbered from 1, skipping numbers already taken. Mark players present or absent and set who starts. **Load Default Roster** restores the 9-player basketball roster (Ben, Caleb, Tristan, Noah, Gauge, Lawson, Myers, Jed, Jack).

**Court / Field & Bench**
- **Instant Swap**: tap an active player and a bench player to swap them.
- **Whistle Queue**: tap any number of bench players going in and active players coming out, in any order. The sub button unlocks once both counts match; players are paired in the order tapped.
- **Fair Sub Hint** suggests the longest-playing player out and the least-played bench player in.
- Cards show total time, current stint or bench wait, and a bar toward the fair share. The bench is sorted by least played.
- **Undo** reverses the last substitution. **Keep screen awake** holds the screen on where supported.
- The header clock has start/pause, −/+ adjust, period advance and period reset. Tap the clock to switch the adjust step between 1 minute, 10 seconds and 1 second.

**Game Summary**: totals, average, spread and per-player share, sortable. Copy as text or download a CSV.

State is saved in the browser, so a reload does not lose the game.

## Running

```bash
npm start
```

Or open `index.html` directly, or host it on any static host.
