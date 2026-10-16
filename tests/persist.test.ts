import { test, expect, mock } from 'claude-code/testing'
import { N, deal, newGame } from '../hooks/game.ts'

const cell = (r: number, c: number) => ({ x: 2 * c, y: 1 + r })
const slot = (i: number) => ({ x: 18 + 11 * i, y: 2 })
const mountP = ($: any, blockblast: object = {}) =>
  $.ui.mount({
    plugin: 'blockblast', surface: 'terminal', component: 'Pane', requestId: 'blockblast',
    props: {
      title: 'Block Blast', isFocused: false, bodyColumns: 52, placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 }, view: {}, blockblast: { seed: 1, debug: { tray: ['mono', 'h2', 'v2'] }, ...blockblast },
    },
  })
async function open($: any, blockblast?: object) {
  const ui = await mountP($, blockblast)
  await ui.resize({ columns: 52, rows: 12, in: 'game' })
  return ui
}
// Board row r as 2 chars per cell: '. ' empty, '##' filled.
async function boardRow(ui: any, r: number) {
  const flat = (n: any): string => (typeof n === 'string' ? n : (n.children ?? []).map(flat).join(''))
  const texts = (n: any): any[] => (typeof n === 'string' ? [] : n.type === 'Text' ? [n] : (n.children ?? []).flatMap(texts))
  const walk = (n: any): any => (n.props?.key === `row${1 + r}` ? n : (n.children ?? []).map((k: any) => typeof k === 'string' ? undefined : walk(k)).find(Boolean))
  return texts(walk(await ui.drawn({ in: 'game' }))).map(t => (t.props?.backgroundColor ? flat(t).replace(/./g, '#') : flat(t))).join('').slice(0, 2 * N)
}
const click = (ui: any, p: { x: number; y: number }) => ui.pointer({ type: 'down', button: 'left', ...p })
const has = async (ui: any, text: string | RegExp, scope: object = { in: 'game' }) => (await ui.find({ ...scope, text })) !== undefined

test('a played move survives unmount and mount; best is stored and shown', async ($, on) => {
  mock.store(on)
  const ui = await open($)
  await click(ui, slot(1)) // h2
  await click(ui, cell(3, 3))
  expect(await has(ui, 'Score 2')).toBe(true)
  await ui.unmount()

  const again = await open($, { debug: undefined }) // no injected board: only the resumed snapshot
  expect(await has(again, 'Score 2')).toBe(true)
  expect(await boardRow(again, 3)).toBe('. . . ####. . . ') // the placed h2 came back
  expect(await has(again, 'best 2', {})).toBe(true)
  await again.unmount()
})

test('restart keeps best and posts a fresh snapshot', async ($, on) => {
  mock.store(on)
  const ui = await open($)
  await click(ui, slot(1))
  await click(ui, cell(3, 3))
  await ui.key({ key: 'r', in: 'game' })
  await ui.unmount()
  const again = await open($, { debug: undefined })
  expect(await has(again, 'Score 0   Combo x0')).toBe(true)
  expect(await has(again, 'best 2', {})).toBe(true)
  await again.unmount()
})

test('junk posts do not crash or change the game', async ($, on) => {
  mock.store(on)
  const ui = await open($)
  await click(ui, slot(1))
  await click(ui, cell(3, 3))
  for (const junk of [null, 5, 'x', [], { board: [1], tray: [], score: 'a' }, { ...{ board: new Array(64).fill(9), tray: ['nope', null, null], score: 1, combo: 0, miss: 0, rng: 1, over: false } }])
    await ui.post(junk as never)
  await ui.unmount()
  const again = await open($, { debug: undefined })
  expect(await has(again, 'Score 2')).toBe(true)
  await again.unmount()
})

test('a new snapshot (resume props) does not reset a live board', async ($, on) => {
  mock.store(on)
  const ui = await open($)
  await click(ui, slot(1))
  await click(ui, cell(3, 3))
  await ui.post({ board: new Array(64).fill(0), tray: ['mono', null, null], score: 99, combo: 0, miss: 0, rng: 1, over: false })
  expect(await has(ui, 'Score 2')).toBe(true) // the Pane redrew with resume=99, the Client kept its state
  await ui.unmount()
})

test('the RNG resumes: the deal after a remount is the uninterrupted one', async ($, on) => {
  mock.store(on)
  const ui = await open($, { debug: { tray: ['mono', 'mono', 'mono'] } })
  await click(ui, cell(0, 0))
  await click(ui, cell(0, 1))
  await ui.unmount()
  const again = await open($, { debug: undefined })
  await click(again, cell(0, 2)) // the last piece: a new tray is dealt
  await again.unmount()
  const board = new Array<number>(N * N).fill(0)
  for (const c of [0, 1, 2]) board[c] = 1
  const d = deal(board, newGame(1).rng) // what an uninterrupted game deals next
  const expected = await open($, { debug: undefined, resume: { board, tray: d.tray, score: 0, combo: 0, miss: 0, rng: d.rng, over: false } })
  const want = JSON.stringify(await expected.drawn({ in: 'game' }))
  await expected.unmount()
  const resumed = await open($, { debug: undefined }) // from the saved snapshot, props carry no resume
  expect(JSON.stringify(await resumed.drawn({ in: 'game' }))).toBe(want.replace(/Score \d+/, 'Score 3').replace(/Combo x\d/, 'Combo x0'))
  await resumed.unmount()
})

test('a finished game resumes as game over', async ($, on) => {
  mock.store(on)
  const ui = await open($)
  await ui.post({ board: new Array(N * N).fill(1), tray: ['mono', null, null], score: 7, combo: 0, miss: 0, rng: 1, over: true })
  await ui.unmount()
  const again = await open($, { debug: undefined })
  expect(await has(again, 'Game over - press r')).toBe(true)
  await again.unmount()
})
