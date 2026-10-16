# Block Blast for Claude Code

A Block Blast clone that opens in a pane while Claude works, so a long turn is not dead time. Inspired by the Doom mod.

```
+- Block Blast ---------------------------------------+
| ⏳ Claude is working...                              |
| best 84                                              |
| Score 31   Combo x1                                  |
| . . . . . . . .        [1]      [2]      [3]         |
| . . . ## . . . .       ##       ####     ##          |
| . . . ## . . . .       ##                ##          |
| . . . . . . . .                                      |
| (8x8 board)      click a piece, then the board       |
+------------------------------------------------------+
```

Cells are drawn as coloured blocks; `##` above stands for a filled cell.

## Rules

- 8x8 board, no gravity, no rotation. You get a tray of 3 pieces and place them in any order; when all 3 are used you get 3 new ones.
- After a placement, every full row and every full column clears at the same time.
- Score per move: `cells placed + 10 x L x L`, where L is the lines cleared in that move. When L > 0, add a combo bonus of `10 x combo`, using the combo after the increment (the first clear gets +10).
- Combo: a move that clears lines adds 1 to the combo. A move that clears nothing counts a miss; at 3 misses the combo resets to 0. Any clear resets the miss count.
- Each deal is re-rolled (up to 50 tries) until at least one piece fits the board.
- Game over when none of the remaining pieces fits anywhere. Press `r` to restart. The best score is kept.
- The game is saved after every move and comes back when you reopen the pane or reload the mod.

## Controls

- **Mouse:** click a tray piece to pick it; hover the board to move the ghost; click a board cell to place the piece there.
  The ghost is green when the placement is valid and red when it is not; lines it would clear light up bright green.
- **Keys, after you click the board:** arrows move the ghost, `1` `2` `3` pick a piece, Enter or Space places it, `r` restarts.
- **Esc** closes the pane. It reopens the next time Claude works, with your game where you left it.

## Auto-open

On each main-loop turn (not subagents) the pane opens by itself, without taking the keyboard, and closes when Claude is done. Your game is saved and comes back on the next turn.

- Auto-open needs 144 columns. On a narrower terminal the pane waits closed and a toast says "Claude is thinking - /blockblast to play" (once per load). `/blockblast` opens it at any width; after you have opened it yourself once, auto-open needs only 110 columns.
- If you were playing when Claude finished, a "Claude is done" toast says why the pane closed.
- With `autoOpen` off, a pane you open with `/blockblast` stays open.
- Closing the pane (Esc or its close mark) hides it until the next turn. To stop auto-open for good, turn off `autoOpen`.

## Settings

`autoOpen` (default on) turns the auto-open off. Change it in the config menu (`/config`): the plugin's `autoOpen` row. Or set it in settings. An installed plugin is keyed `<name>@<marketplace>`, here `blockblast@blockblast`:

```json
{ "pluginConfigs": { "blockblast@blockblast": { "options": { "autoOpen": false } } } }
```

Under `claude --plugin-dir .` the key is plain `blockblast`.

With it off, `/blockblast` still opens the game, and the header still follows the turn.

## Install

At the prompt of a terminal session:

```
/plugin install blockblast --marketplace quigebo/blockblast
```

From a shell:

```
claude plugin install blockblast --marketplace quigebo/blockblast
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `quigebo/blockblast`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope. A private repository installs only for people who can read it on GitHub and whose machine holds a git credential for github.com.

## Development

```
claude --plugin-dir .          # run it from this folder; saves hot-reload
claude plugin validate .       # manifest, marketplace file and hooks module
npx -y -p typescript tsc -p .  # type check
claude plugin test .           # unit and end-to-end tests
```

The test kit cannot raise a close by the person, so check these by hand:

1. Press Esc in the pane: it closes. Send a prompt: it reopens with the same game.
2. Click the board, then use the keys: the keys reach the game.

Layout: `hooks/game.ts` is the pure rules, `hooks/board.tsx` the game surface, `hooks/register.tsx` the hooks (command, turn start and complete, saving, the pane), `types/index.d.ts` the shared state contract. `PLAN.md` has the design notes.
