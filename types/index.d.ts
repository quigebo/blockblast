// The snapshot the Client posts: hooks/game.ts's Game.
export type Snapshot = {
  board: number[]
  tray: (string | null)[]
  score: number
  combo: number
  miss: number
  over: boolean
  rng: number
}
export type Working = boolean | null // null before the first turn, true while Claude works, false once a turn has completed

declare module 'claude-code' {
  interface PluginState {
    blockblast: { working: Working; game: Snapshot | null }
  }
}
