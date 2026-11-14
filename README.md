# Sub Tracker

A browser app for tracking playing time and substitutions in kids' sports. Built for a coach holding a phone on the sideline.

## Formats

| Game | Periods | Players on | Clock |
| --- | --- | --- | --- |
| Basketball 5v5 | 4 x 8 min | 5 | Counts down, stops at zero |
| Soccer 7v7 | 2 x 25 min | 7 | Counts up, runs until you end the half |
| Soccer 9v9 | 2 x 30 min | 9 | Counts up |
| Soccer 11v11 | 2 x 35 min | 11 | Counts up |

Periods, minutes and players on are editable before each game. Presets live in `src/presets.js`.

## Using it

1. Pick a game and list your players, one per line. The first names on the list start.
2. Tap **Start**. Each player shows total time played and the length of their current stint on or off.
3. To substitute, tap a player, then tap the player to swap with. **Undo** reverses the last sub.
4. The bench is sorted by least time played, so the next kid due is first.
5. End each period. After the last one you get a playing time summary.

The game is saved in the browser, so a reload or a locked phone does not lose it. The screen stays awake while the clock runs where the browser supports it.

## Running

No build step and no dependencies. Serve the folder with any static server:

```bash
npm start
```

```bash
npm test
```

It can be hosted as is on GitHub Pages or any static host.
