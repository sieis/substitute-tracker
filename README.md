# BenchFlow

**Smarter substitutions. Fairer playing time.**

BenchFlow tracks playing time and substitutions for youth sports from the sideline. Open `index.html` from the repository to run it offline with the bundled fonts. The app has no build step or runtime dependencies.

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

**Saved Teams**: coaching more than one team? Each sport keeps its own save slots. Type a team name and tap **Save Current Roster** to store what is on screen, or **New Blank Team** to start an empty one. Tap a slot to load that team's roster, settings and last-game starters. Edits to the loaded team save to its slot automatically. Switching teams mid-game asks first, since it resets the clock. Teams live in the browser alongside the game state; no account or database.

**Game**
- **Instant**: tap an active player and a bench player to swap them.
- **Whistle**: tap any number of bench players going in and active players coming out, in any order. **Apply Sub** appears once both counts match. BenchFlow pairs players in the order tapped.
- **Suggest Sub** previews the longest-playing active player coming out and the least-played bench player coming in. Tap **Apply Sub** to make the swap, or **Clear** to dismiss it. Whistle mode adds suggestions to the queue.
- Cards show jersey number, name, total played, current stint or bench wait, and playing-time balance. The progress bar tracks the full-game target. On the bench, players with the least playing time appear first.
- **Undo** reverses the last substitution. Open **Setup** to choose Instant or Whistle mode and to keep the screen awake where supported.
- On phones, **Start/Pause** and **Suggest Sub** stay at the bottom of the screen. Use the chevron to compact or expand the scoreboard. BenchFlow remembers the display preference.
- **Clock options** contains time adjustment, period advance, and period reset. Tap **Step** to cycle between 1 minute, 10 seconds, and 1 second.

**Game Summary**: totals, average, spread and per-player share, sortable. Copy as text or download a CSV.

**Starters**: whoever is in the active lineup when the clock first starts is recorded as a starter. They are tagged in the summary table, listed in the copied text, and get a `Started` column in the CSV. Resetting game timers clears them for the next game.

State is saved in the browser, so a reload does not lose the game.

## Running

```bash
npm start
```

Or open `index.html` directly, or host it on any static host.
