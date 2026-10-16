import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { BoardProps } from './board.tsx'
import { parseGame } from './game.ts'

const PANE = 'blockblast'
const TITLE = 'Block Blast'
const OPEN = { id: PANE, title: TITLE, closeOnEscape: true } as const // Esc closes it; the next turn reopens it, the game saved

const working = atom({ plugin: 'blockblast', key: 'working' } as const, null) // null until the first turn
const game = atom({ plugin: 'blockblast', key: 'game' } as const, null) // the last posted snapshot

export const register: Register = (on, options) => {
  let toasted = false // one "thinking" toast per load
  const seed = Date.now() >>> 0 // a fresh game each load; tests pass `blockblast` props to fix it

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'blockblast', description: 'Play Block Blast in a pane' })
    return next(e)
  })

  // Not focused: focus does not reach a Client. A click on the board takes the keys.
  on('command.run', { command: 'blockblast' }, async $ => {
    const { isPlaced } = await $.ui.open(OPEN)
    return { text: isPlaced ? 'Block Blast opened.' : 'Block Blast could not be placed here (the terminal may be too narrow or panes are off).' }
  })

  // Main loop only. The open is not awaited, so the turn never waits on the mod.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await update($, working, () => true)
    if (options.autoOpen) {
      void $.ui.open(OPEN).then(r => {
        if (!r.isPlaced && !toasted) {
          toasted = true
          $.ui.toast('Claude is thinking - /blockblast to play')
        }
      }).catch(() => {}) // a refused open is not worth an unhandled rejection
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await update($, working, () => false)
    if ((await $.ui.panes()).some(p => p.id === PANE && p.isFocused)) $.ui.toast('Claude is done')
    if (options.autoOpen) await $.ui.close({ id: PANE }).catch(() => {}) // shown while Claude works, hidden after; the game is saved
    return next(e)
  })

  // The Client posts a snapshot after each move: keep it for a remount or reload, and the best score.
  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const g = parseGame(e.data)
    if (g) {
      await update($, game, () => g) // first, so a slow store write cannot let an older message win
      if (g.score > (Number(await $.store.get('best')) || 0)) await $.store.set('best', g.score)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text>Block Blast needs a terminal or desktop surface.</Text>
    }
    const { Box, Text, Client } = $.ui.resolve(e)
    // The engine never sets `blockblast`: it is the tests' way to fix the seed or inject a board.
    const best = Number(await $.store.get('best')) || 0
    const resume = await read($, game)
    const board: BoardProps = { seed, resume, ...(e.props as { blockblast?: Partial<BoardProps> }).blockblast }
    const busy = await read($, working)
    return (
      <Box flexDirection="column">
        {busy !== null && <Text>{busy ? '⏳ Claude is working...' : '✅ Claude is done - Esc to close'}</Text>}
        {best > 0 && <Text dimColor>best {best}</Text>}
        <Client key="game" module="./board.tsx" props={board} width="100%" />
        <Text dimColor>click a piece, then the board - Esc closes</Text>
      </Box>
    )
  })
}
