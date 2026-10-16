// Pure Block Blast rules: no `$`, no DOM. Rules are in PLAN.md.
export const N = 8
export type Cell = [number, number] // [row, col]
export type Game = {
  board: number[] // N*N, 0 empty, else a color index 1..7
  tray: (string | null)[] // shape names, null once placed
  score: number
  combo: number
  miss: number
  over: boolean
  rng: number // mulberry32 state
}

// '#' filled, '/' row break. One entry per orientation.
const ART: Record<string, string> = {
  mono: '#',
  h2: '##', h3: '###', h4: '####', h5: '#####',
  v2: '#/#', v3: '#/#/#', v4: '#/#/#/#', v5: '#/#/#/#/#',
  sq2: '##/##', sq3: '###/###/###',
  r2x3: '###/###', r3x2: '##/##/##',
  c0: '##/#.', c1: '##/.#', c2: '#./##', c3: '.#/##',
  L0: '#./#./##', L1: '###/#..', L2: '##/.#/.#', L3: '..#/###',
  J0: '.#/.#/##', J1: '#../###', J2: '##/#./#.', J3: '###/..#',
  T0: '###/.#.', T1: '.#/##/.#', T2: '.#./###', T3: '#./##/#.',
  S0: '.##/##.', S1: '#./##/.#',
  Z0: '##./.##', Z1: '.#/##/#.',
}

export const NAMES = Object.keys(ART)
export const SHAPES: Record<string, Cell[]> = Object.fromEntries(
  NAMES.map(name => [
    name,
    ART[name]!.split('/').flatMap((row, r) =>
      [...row].flatMap((ch, c): Cell[] => (ch === '#' ? [[r, c]] : [])),
    ),
  ]),
)
export const colorOf = (name: string) => (NAMES.indexOf(name) % 7) + 1
export const size = (name: string) => {
  const cells = SHAPES[name]!
  return { h: Math.max(...cells.map(c => c[0])) + 1, w: Math.max(...cells.map(c => c[1])) + 1 }
}

// mulberry32 as a pure step so the state can ride in a snapshot.
export function rand(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

export const canPlace = (board: number[], name: string, r: number, c: number) =>
  SHAPES[name]!.every(([dr, dc]) => {
    const rr = r + dr, cc = c + dc
    return rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr * N + cc] === 0
  })

export const fitsAnywhere = (board: number[], name: string) => {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (canPlace(board, name, r, c)) return true
  return false
}

export const isGameOver = (board: number[], tray: (string | null)[]) =>
  !tray.some(name => name !== null && fitsAnywhere(board, name))

export function place(board: number[], name: string, r: number, c: number): number[] {
  const next = [...board]
  for (const [dr, dc] of SHAPES[name]!) next[(r + dr) * N + c + dc] = colorOf(name)
  return next
}

// Full rows and columns of a board.
export function fullLines(board: number[]) {
  const rows: number[] = [], cols: number[] = []
  for (let i = 0; i < N; i++) {
    if (board.slice(i * N, i * N + N).every(v => v)) rows.push(i)
    if (Array.from({ length: N }, (_, r) => board[r * N + i]).every(v => v)) cols.push(i)
  }
  return { rows, cols }
}

// All full rows and columns clear at once.
export function clearLines(board: number[]) {
  const { rows, cols } = fullLines(board)
  const next = board.map((v, i) => (rows.includes(Math.floor(i / N)) || cols.includes(i % N) ? 0 : v))
  return { board: next, lines: rows.length + cols.length }
}

// cells placed + 10*L*L, plus 10*combo (the combo after this move) when L > 0.
export const moveScore = (cells: number, lines: number, combo: number) =>
  cells + 10 * lines * lines + (lines > 0 ? 10 * combo : 0)

// Three random shapes; re-roll (up to 50 tries) until one fits the board.
export function deal(board: number[], rng: number): { tray: string[]; rng: number } {
  let tray: string[] = []
  for (let tries = 0; tries < 50; tries++) {
    tray = []
    for (let i = 0; i < 3; i++) {
      const [v, s] = rand(rng)
      rng = s
      tray.push(NAMES[Math.floor(v * NAMES.length)]!)
    }
    if (!isGameOver(board, tray)) break
  }
  return { tray, rng }
}

export function newGame(seed: number): Game {
  const board = new Array<number>(N * N).fill(0)
  const d = deal(board, seed)
  return { board, tray: d.tray, score: 0, combo: 0, miss: 0, over: isGameOver(board, d.tray), rng: d.rng }
}

// Place tray slot `slot` with its top-left at (r, c); null when it is illegal.
export function move(g: Game, slot: number, r: number, c: number): Game | null {
  const name = g.tray[slot]
  if (g.over || !name || !canPlace(g.board, name, r, c)) return null
  const cleared = clearLines(place(g.board, name, r, c))
  let { combo, miss, rng } = g
  if (cleared.lines > 0) { combo++; miss = 0 } else if (++miss >= 3) combo = 0
  let tray = g.tray.map((t, i) => (i === slot ? null : t))
  if (tray.every(t => t === null)) ({ tray, rng } = deal(cleared.board, rng))
  return {
    board: cleared.board, tray, combo, miss, rng,
    score: g.score + moveScore(SHAPES[name]!.length, cleared.lines, combo),
    over: isGameOver(cleared.board, tray),
  }
}

// A snapshot posted by the Client is input, not fact: accept it only if it is a playable Game.
export function parseGame(x: unknown): Game | null {
  const g = x as Partial<Game> | null
  const int = (v: unknown, max = Infinity): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max
  if (!g || typeof g !== 'object') return null
  const ok =
    Array.isArray(g.board) && g.board.length === N * N && g.board.every(v => int(v, 7)) &&
    Array.isArray(g.tray) && g.tray.length === 3 && g.tray.every(t => t === null || (typeof t === 'string' && Object.hasOwn(SHAPES, t))) &&
    int(g.score) && int(g.combo) && int(g.miss) && Number.isFinite(g.rng) && typeof g.over === 'boolean'
  return ok ? { board: [...g.board!], tray: [...g.tray!], score: g.score!, combo: g.combo!, miss: g.miss!, rng: g.rng!, over: g.over! } : null
}
