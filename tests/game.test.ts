import { test, expect } from 'claude-code/testing'
import {
  N, NAMES, SHAPES, canPlace, clearLines, deal, isGameOver, move, moveScore, newGame, place, rand,
  type Game,
} from '../hooks/game.ts'

const empty = () => new Array<number>(N * N).fill(0)
const game = (over: Partial<Game> = {}): Game => ({ ...newGame(1), ...over })

test('shapes table: 33 orientations, sizes right', () => {
  expect(NAMES.length).toBe(33)
  const sizes: Record<string, number> = {
    mono: 1, h5: 5, v4: 4, sq2: 4, sq3: 9, r2x3: 6, r3x2: 6, c0: 3, L2: 4, J3: 4, T1: 4, S0: 4, Z1: 4,
  }
  for (const [name, n] of Object.entries(sizes)) expect(SHAPES[name]!.length).toBe(n)
  expect(SHAPES.L0).toEqual([[0, 0], [1, 0], [2, 0], [2, 1]])
})

test('mulberry32 is deterministic and in [0,1)', () => {
  const [a, s1] = rand(42)
  expect(rand(42)).toEqual([a, s1])
  expect(a).toBeGreaterThanOrEqual(0)
  expect(a).toBeLessThan(1)
  expect(rand(s1)[0]).not.toBe(a)
})

test('canPlace: bounds and overlap', () => {
  const b = place(empty(), 'sq2', 0, 0)
  for (const [name, r, c, ok] of [
    ['mono', 0, 0, false], ['mono', 2, 0, true], ['h3', 0, 6, false], ['h3', 0, 5, true],
    ['v3', 6, 0, false], ['v3', 5, 7, true], ['sq3', 5, 5, true], ['sq3', 6, 6, false], ['mono', -1, 0, false],
  ] as const) expect([name, r, c, canPlace(b, name, r, c)]).toEqual([name, r, c, ok])
})

test('clearLines: rows, columns, both at once', () => {
  const row = place(empty(), 'h5', 3, 0)
  expect(clearLines(place(row, 'h3', 3, 5)).lines).toBe(1)
  expect(clearLines(row).lines).toBe(0)
  let b = empty()
  for (let i = 0; i < N; i++) { b[2 * N + i] = 1; b[i * N + 5] = 1 }
  const out = clearLines(b)
  expect(out.lines).toBe(2) // row 2 and col 5, crossing cell counted once in the board
  expect(out.board.every(v => v === 0)).toBe(true)
})

test('moveScore table: cells + 10*L^2 + 10*combo', () => {
  for (const [cells, lines, combo, want] of [
    [4, 0, 0, 4], [4, 0, 3, 4], [1, 1, 1, 21], [5, 1, 2, 35], [3, 2, 1, 53], [9, 3, 4, 139],
  ] as const) expect(moveScore(cells, lines, combo)).toBe(want)
})

test('move: scoring, combo, miss', () => {
  // row 0 holds seven cells; a mono completes it
  const board = empty()
  for (let c = 0; c < 7; c++) board[c] = 1
  let g = game({ board, tray: ['mono', 'mono', 'h2'], score: 0 })
  g = move(g, 0, 0, 7)!
  expect(g.score).toBe(1 + 10 + 10) // cell + 10*1 + combo bonus 10*1
  expect(g.combo).toBe(1)
  expect(g.board.every(v => v === 0)).toBe(true)
  // three non-clearing moves reset the combo
  g = move(g, 1, 3, 3)!
  expect([g.combo, g.miss]).toEqual([1, 1])
  g = move({ ...g, tray: ['mono', 'mono', 'mono'] }, 0, 5, 5)!
  g = move(g, 1, 6, 6)!
  expect([g.combo, g.miss]).toEqual([0, 3])
  // a clear resets miss
  const b2 = empty()
  for (let c = 0; c < 7; c++) b2[c] = 1
  g = move({ ...g, board: b2, tray: ['mono', 'mono', 'mono'] }, 0, 0, 7)!
  expect([g.combo, g.miss]).toEqual([1, 0])
})

test('move: illegal placements return null; tray refills after three', () => {
  const g = game({ tray: ['mono', 'mono', 'mono'] })
  expect(move(g, 0, 8, 0)).toBeNull()
  expect(move({ ...g, tray: [null, 'mono', 'mono'] }, 0, 0, 0)).toBeNull()
  let h = move(g, 0, 0, 0)!
  h = move(h, 1, 0, 1)!
  expect(h.tray).toEqual([null, null, 'mono'])
  h = move(h, 2, 0, 2)!
  expect(h.tray.every(t => t !== null)).toBe(true)
})

test('deal: deterministic and always has a fitting piece', () => {
  expect(deal(empty(), 5)).toEqual(deal(empty(), 5))
  // only a 2x2 corner is free: every deal must contain a piece that fits it
  const b = new Array<number>(N * N).fill(1)
  for (const i of [0, 1, N, N + 1]) b[i] = 0
  for (let seed = 0; seed < 50; seed++) expect(isGameOver(b, deal(b, seed).tray)).toBe(false)
})

test('isGameOver', () => {
  const full = new Array<number>(N * N).fill(1)
  expect(isGameOver(full, ['mono', null, null])).toBe(true)
  expect(isGameOver(empty(), ['sq3', null, null])).toBe(false)
  expect(isGameOver(empty(), [null, null, null])).toBe(true)
  const one = [...full]; one[27] = 0
  expect(isGameOver(one, ['h2', 'sq2', 'mono'])).toBe(false)
  expect(isGameOver(one, ['h2', 'sq2', null])).toBe(true)
  // placing the last fitting piece without clearing ends the game
  const b = Array.from({ length: N * N }, (_, i) => ((Math.floor(i / N) + (i % N)) % 2 ? 0 : 1)) // free cells never touch
  expect(move(game({ board: b, tray: ['mono', 'h2', null] }), 0, 0, 1)!.over).toBe(true) // only h2 left, fits nowhere
  expect(move(game({ board: b, tray: ['mono', 'mono', null] }), 0, 0, 1)!.over).toBe(false) // a mono still fits
})

test('deal: when nothing can fit within 50 tries, the game is over', () => {
  const full = new Array<number>(N * N).fill(1)
  const d = deal(full, 7)
  expect(d.tray.length).toBe(3)
  expect(isGameOver(full, d.tray)).toBe(true)
  expect(newGame(7).over).toBe(false)
})

test('move: combo and miss table', () => {
  const row7 = empty()
  for (let c = 0; c < 7; c++) row7[c] = 1
  // [start combo, start miss, clears?, want combo, want miss]
  for (const [combo, miss, clears, wc, wm] of [
    [0, 0, true, 1, 0], [2, 2, true, 3, 0], [2, 0, false, 2, 1], [2, 1, false, 2, 2], [2, 2, false, 0, 3], [0, 2, false, 0, 3],
  ] as const) {
    const g = game({ board: clears ? row7 : empty(), tray: ['mono', 'mono', 'mono'], combo, miss })
    const h = move(g, 0, clears ? 0 : 4, clears ? 7 : 4)!
    expect([combo, miss, clears, h.combo, h.miss]).toEqual([combo, miss, clears, wc, wm])
  }
})
