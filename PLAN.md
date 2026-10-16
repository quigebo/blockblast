# Block Blast mod for Claude Code — plan (v2, after Opus + Sonnet review)

Goal: a Claude Code mod (function-hooks plugin, Claude Code 2.1.300 mod API) that lets people play a Block Blast clone in a pane while Claude works. Inspired by the Doom mod.

Types reference (authoritative): the plugin-authoring types file (`claude-code.d.ts`). After the engine loads the mod, the same types are also in `.claude-plugin/types/` with a tsconfig that the mod's `tsconfig.json` extends.

## Game rules (our own spec; exact Block Blast numbers are not public)
- 8x8 board, no gravity, no rotation.
- Tray of 3 pieces. Place them in any order; when all 3 are used, deal 3 new ones.
- **Shapes** (each orientation is a separate shape):
  - mono 1x1
  - lines of 2, 3, 4 and 5, each horizontal and vertical
  - square 2x2, square 3x3
  - rectangles 2x3 and 3x2
  - 3-cell corners, all 4 orientations
  - 4-cell L and J, all 4 orientations each
  - T, 4 orientations
  - S and Z, 2 orientations each
- **Deal:** random from a seeded RNG (mulberry32), re-rolled until at least one of the 3 fits the current board (cap 50 tries).
- **Clear:** after a placement, every full row and every full column clears at the same time.
- **Score per move:** `cells placed + 10 × L × L` where L = lines cleared in that move. Then add the combo bonus `10 × combo` when L>0 (the combo after the increment, so the first clear gets +10).
- **Combo:**
  - A move that clears lines does `combo += 1`.
  - A move that clears nothing increments `miss`. When `miss` reaches 3, `combo = 0`.
  - Any clear resets `miss` to 0.
- **Game over:** checked after every placement and every deal, when none of the remaining tray pieces fits anywhere. `r` restarts.
- Every formula above has a table-driven unit test.

## Architecture
- Mod folder = the git repo; run it with `claude --plugin-dir .`.
- Files:
  - `.claude-plugin/plugin.json`: name `blockblast`, `types: ./types/index.d.ts`, `userConfig.autoOpen` (boolean, default true; this is the one on/off mechanism).
  - `hooks/hooks.json` → `./register.tsx`.
  - `hooks/game.ts`: pure logic (shapes, rng, canPlace, place, clears, scoring, combo, deal, isGameOver, snapshot (de)serialize). No `$`, no DOM.
  - `hooks/board.tsx`: the `Client` surface module. Its game state lives in `surface.state`.
    - Seed it from props without calling `setState` in render: `const g = surface.state ?? fromProps(props)`.
    - Register `onKey` and `onPointer` once. Read `surface.state` fresh inside each handler.
    - It draws with `Box`/`Text` (Raster is not available in a Client). Each cell is 2 columns wide.
    - Use named colors that work in 16-color terminals.
  - `hooks/register.tsx`:
    - `/blockblast` opens the pane with `{ id:'blockblast', title:'Block Blast' }`. `closeOnEscape: true`: Esc closes the pane, and the next turn reopens it with the saved game. No `focus`, because focus does not reach a Client anyway.
    - A `ui.render` Pane hook draws a header line (Text), then `<Client key="game" module="./board.tsx" props={...}/>`, then a hint line ("click a piece, then the board - Esc closes").
  - `types/index.d.ts`: the `PluginState` contract.
  - `tests/*.test.ts`: run with `claude plugin test .`.
- **Input:**
  - Mouse:
    - Click a tray piece to select it.
    - Hovering the board moves the ghost.
    - Clicking a board cell places the piece there.
  - Keys, after a click focuses the board:
    - arrows move the ghost
    - 1/2/3 pick a piece
    - Enter or Space place it
    - `r` restarts
  - Esc never reaches the Client; it closes the pane.
- **Ghost:** shows whether the placement is valid (green or red), and highlights the lines that would clear.

## Vertical slices
Each slice ends with:
1. An E2E test that uses `$.ui.mount` on the Pane, then `ui.resize`, `ui.key`/`ui.pointer`, and `ui.find({in:'game'})`. The board tests loop over both the terminal and desktop surfaces; the turn and smoke tests run on the terminal.
2. `claude plugin validate .`, `tsc -p .` and `claude plugin test .`, all green.
3. A separate Opus code review, iterated until it reports no blocking issues.
4. A git commit.

**Slice 1: playable game behind `/blockblast`.**
1. **Spike first:** board.tsx imports one function from game.ts. Mount it and validate.
   - If the import is refused, keep game.ts as the single source and generate board.tsx by a small concat build script. Never hand-copy.
2. game.ts and its unit tests.
3. board.tsx with mouse and keys.
4. The command and the Pane hook.
5. E2E test, with a seeded deal passed in through props:
   - mount the pane
   - click a tray piece
   - click a cell; the board shows the piece and the score updates
   - a scripted sequence completes a row; it clears and the score matches the formula
   - a scripted fill reaches game over and shows "Game over"
   - `r` restarts
6. Manual check by the human: click focus actually delivers keys.

**Slice 2: "while Claude thinks".**
1. On `turn.start` with `agentId` absent and `options.autoOpen` on:
   - call `void $.ui.open({id, title})`, unasked and without focus
   - set state `working=true`
   - if the open reports `!isPlaced`, raise one toast per module load: "Claude is thinking - /blockblast to play"
2. On `turn.complete` with `agentId` absent, for every reason (answered, aborted or error):
   - set `working=false`
   - show `$.ui.toast('Claude is done')` only if the pane is focused
   - close the pane when `autoOpen` is on (the game is saved)
3. Both hooks `return next(e)` so the turn never waits on the mod.
4. The header reads "⏳ Claude is working..." or "✅ Claude is done - Esc to close".
5. E2E (with a test-level `ui.open` spy beneath the plugin):
   - a main `turn.start` opens the pane and the header says working
   - `turn.complete` makes it say done, and the pane stays open
   - a turn with an `agentId` changes nothing
   - `autoOpen:false` means no open

**Slice 3: persistence.**
1. After each move, the Client calls `surface.post(snapshot)`, with the RNG state included. It never posts during render.
2. A `ui.message` hook saves the snapshot to `$.state`, and saves the best score to `$.store` (one key).
3. The Pane hook passes the snapshot as the Client's props. The Client ignores resume props once it has local state, so a live board never flickers back.
4. Show the best score.
5. E2E:
   - play a move, unmount, mount again: the board is the same
   - a best score written in one test survives through `$.store`

**Slice 4: ship.**
- README covering what the mod is, controls, install line, and the autoOpen setting.
- `.claude-plugin/marketplace.json`.
- A final validate. GitHub publishing only if the user asks.

## Notes
- The "thinking" toast is once per module load (it resets on hot reload). "Claude is done" toasts only while the pane is focused. A close (Esc or the mark) lasts until the next turn; `autoOpen` off stops auto-open.
- The pane floor for an unasked open is 144 columns; below that the pane waits until opened. Once the person has asked for it, the floor is 110.
- No real-time element in the game, so nothing to pause.
- The width needed is about 16 board columns + 2 + a 3-piece tray of about 30, plus the pane border. Aim for 52 columns or fewer. If `surface.columns` < 50, stack the tray under the board.

## Manual checks (the test kit cannot raise `ui.close`)
1. Press Esc in the pane: it closes. Send a prompt: it reopens with the same game.
