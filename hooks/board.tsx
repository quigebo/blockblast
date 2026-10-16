// The Client surface module: draws the game and handles mouse and keys.
// All game rules live in game.ts. State lives in surface.state, seeded from props.
import type { ClientModule, ClientPointerEvent, ClientSurface } from 'claude-code'
import {
  N, SHAPES, canPlace, colorOf, fullLines, isGameOver, move, newGame, place, size, type Game,
} from './game.ts'

export type BoardProps = { seed: number; resume?: Game | null; debug?: Partial<Game> } // debug: tests inject a board/tray
type UI = { g: Game; sel: number; r: number; c: number }
type Px = { ch: string; color?: string; bg?: string; dim?: boolean; bold?: boolean }

const PALETTE = ['cyan', 'blue', 'magenta', 'yellow', 'white', 'blueBright', 'magentaBright']
const SLOT_W = 11 // a tray slot: 5 cells * 2 columns + a gap
const SLOT_H = 6 // label row + 5 piece rows

const firstPiece = (g: Game) => g.tray.findIndex(t => t !== null)
const fresh = (g: Game): UI => ({ g, sel: firstPiece(g), r: 3, c: 3 })

function fromProps(p: BoardProps): UI {
  const g = { ...(p.resume ?? newGame(p.seed)), ...p.debug }
  return fresh({ ...g, over: isGameOver(g.board, g.tray) })
}

// Where the tray sits: right of the board when there is room, else under it.
const layout = (columns: number) =>
  columns === 0 || columns >= 50 ? { trayX: 18, trayY: 1, statusY: 9, height: 10 } : { trayX: 0, trayY: 10, statusY: 16, height: 17 }

// The piece's top-left cell for a hovered/cursor cell, kept on the board.
function anchor(ui: UI, r: number, c: number) {
  const name = ui.g.tray[ui.sel]
  const s = name ? size(name) : { h: 1, w: 1 }
  return { r: Math.max(0, Math.min(r, N - s.h)), c: Math.max(0, Math.min(c, N - s.w)) }
}

function draw(ui: UI, columns: number) {
  const { g } = ui
  const L = layout(columns)
  const width = L.trayX + 3 * SLOT_W
  const grid: Px[][] = Array.from({ length: L.height }, () => Array.from({ length: width }, () => ({ ch: ' ' })))
  const put = (y: number, x: number, text: string, style: Omit<Px, 'ch'> = {}) =>
    [...text].forEach((ch, i) => { if (grid[y]?.[x + i]) grid[y]![x + i] = { ch, ...style } })

  put(0, 0, `Score ${g.score}   Combo x${g.combo}`, { bold: true })

  // ghost: where the selected piece would land, and which lines it would clear
  const name = g.over ? null : g.tray[ui.sel] ?? null
  const a = anchor(ui, ui.r, ui.c)
  const ok = name !== null && canPlace(g.board, name, a.r, a.c)
  const clearing = ok ? fullLines(place(g.board, name, a.r, a.c)) : { rows: [], cols: [] }
  const ghost = new Set(name ? SHAPES[name]!.map(([dr, dc]) => (a.r + dr) * N + a.c + dc) : [])

  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N), c = i % N
    const willClear = clearing.rows.includes(r) || clearing.cols.includes(c)
    const v = g.board[i]!
    const y = 1 + r, x = 2 * c
    // filled cells are two spaces on a background: solid, and no glyph width to get wrong
    if (ghost.has(i)) put(y, x, '  ', { bg: willClear ? 'greenBright' : ok ? 'green' : 'red' })
    else if (v) put(y, x, '  ', { bg: willClear ? 'greenBright' : PALETTE[v - 1] })
    else put(y, x, '. ', { dim: true })
  }

  g.tray.forEach((t, i) => {
    const x = L.trayX + i * SLOT_W
    put(L.trayY, x, `[${i + 1}]`, i === ui.sel && !g.over ? { color: 'yellow', bold: true } : { dim: true })
    if (t) for (const [dr, dc] of SHAPES[t]!) put(L.trayY + 1 + dr, x + 2 * dc, '  ', { bg: PALETTE[colorOf(t) - 1] })
  })

  if (g.over) put(L.statusY, 0, 'Game over - press r', { color: 'red', bold: true })
  return grid
}

// Adjacent cells with the same style become one Text.
function rows(grid: Px[][], { Box, Text }: ClientSurface['elements']) {
  return grid.map((row, y) => {
    const runs: { text: string; px: Px }[] = []
    for (const px of row) {
      const last = runs[runs.length - 1]
      if (last && last.px.color === px.color && last.px.bg === px.bg && last.px.dim === px.dim && last.px.bold === px.bold) last.text += px.ch
      else runs.push({ text: px.ch, px })
    }
    return (
      <Box key={`row${y}`} flexDirection="row">
        {runs.map(({ text, px }) => (
          <Text color={px.color} backgroundColor={px.bg} dimColor={px.dim} bold={px.bold}>{text}</Text>
        ))}
      </Box>
    )
  })
}

const Board: ClientModule<BoardProps, UI> = (props, surface) => {
  const ui = surface.state ?? fromProps(props)

  // Handlers are registered once, on the first render, and read surface.state fresh.
  if (surface.state === undefined) {
    const now = () => surface.state ?? ui // `ui` is built from props once, so its `g` is a stable identity
    const put = (next: UI) => {
      const changed = next.g !== now().g
      surface.setState(next)
      if (changed) surface.post(next.g) // a move or a restart; never during render
    }
    const select = (cur: UI, sel: number) => { // a bigger piece must still fit under the cursor
      const next = { ...cur, sel }
      put({ ...next, ...anchor(next, cur.r, cur.c) })
    }
    const placeAt = (cur: UI, r: number, c: number) => {
      const a = anchor(cur, r, c)
      const g = move(cur.g, cur.sel, a.r, a.c)
      if (g) put({ ...cur, g, r: a.r, c: a.c, sel: firstPiece(g) })
    }

    surface.onKey(e => {
      const cur = now()
      const k = e.key
      if (k === 'r') return put(fresh(newGame(cur.g.rng)))
      if (k === '1' || k === '2' || k === '3') {
        if (cur.g.tray[Number(k) - 1]) select(cur, Number(k) - 1)
        return
      }
      if (k === 'return' || k === ' ' || k === 'space') return placeAt(cur, cur.r, cur.c)
      const d = ({ up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] } as const)[k as 'up']
      if (d) {
        const a = anchor(cur, cur.r + d[0], cur.c + d[1])
        put({ ...cur, ...a })
      }
    })

    surface.onPointer((e: ClientPointerEvent) => {
      const cur = now()
      const L = layout(surface.columns)
      const r = e.y - 1, c = e.x >> 1
      if (e.x >= 0 && r >= 0 && r < N && c < N) {
        if (e.type === 'down' && e.button === 'left') return placeAt(cur, r, c)
        if (e.type === 'move') {
          const a = anchor(cur, r, c)
          if (a.r !== cur.r || a.c !== cur.c) put({ ...cur, ...a })
        }
        return
      }
      const slot = Math.floor((e.x - L.trayX) / SLOT_W)
      if (e.type === 'down' && e.button === 'left' && e.x >= L.trayX && slot < 3 && e.y >= L.trayY && e.y < L.trayY + SLOT_H && cur.g.tray[slot])
        select(cur, slot)
    })
  }

  return <surface.elements.Box flexDirection="column">{rows(draw(ui, surface.columns), surface.elements)}</surface.elements.Box>
}

export default Board
