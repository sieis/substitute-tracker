# Sub Tracker

A browser app for tracking playing time and substitutions in kids' sports. Built for a coach holding a phone on the sideline.

## Formats

| Game | Periods | Players on | Clock |
| --- | --- | --- | --- |
| Basketball 5v5 | 4 x 8 min | 5 | Counts down, stops at zero |
| Soccer 7v7 | 2 x 25 min | 7 | Counts up, runs until you end the half |
| Soccer 9v9 | 2 x 30 min | 9 | Counts up |
| Soccer 11v11 | 2 x 35 min | 11 | Counts up |
| Hockey | 3 x 15 min | 6 | Counts down |
| Lacrosse 10v10 | 4 x 12 min | 10 | Counts down |

Periods, minutes, players on and clock direction are editable before each game. Presets live in `src/presets.js`.

## Using it

**Before the game**

1. Pick a game.
2. Add players, with a jersey number if you like. Pasting a list of names adds them all (`12 Jordan` sets the number too).
3. Mark each player Starting, Bench or Away. The roster is saved for next time.

**During the game**

- **Swap now**: tap a player, then tap the player to swap with.
- **Queue**: line up several subs, then make them all at the next stoppage with one tap.
- **Suggest a sub** picks the swap that evens out playing time most.
- Each card shows total time, the current stint, and a bar filling toward an even share. Players well under the team average are marked "Needs time".
- The bench is sorted by least time played, so the next kid due is first.
- Tap a player for **To bench**, **Put in** (when a spot is open) or **Sit out** (hurt or left early). **Add player** handles late arrivals.
- **Undo** steps back through lineup changes, as if they never happened.
- **±** corrects the clock when it was started late or left running. Players on the field gain or lose the same time.

**Times** shows playing time by period, each player's share, the team average and the spread. Copy it as text or download a CSV. It is live during the game and becomes the final summary.

The game is saved in the browser, so a reload or a locked phone does not lose it, and the clock keeps running from timestamps. The screen stays awake while the clock runs where the browser supports it.

## Running

No build step and no dependencies. Serve the folder with any static server:

```bash
npm start
```

```bash
npm test
```

It can be hosted as is on GitHub Pages or any static host.

## Code

- `src/game.js`: game state and rules, no DOM, covered by tests
- `src/report.js`: playing time table, text summary and CSV
- `src/app.js`: the screens
