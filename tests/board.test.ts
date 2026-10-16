import { test, expect, mock } from 'claude-code/testing'
import { N } from '../hooks/game.ts'

const mountFn = ($: any) => (surface: 'terminal' | 'desktop', blockblast: object) =>
  $.ui.mount({
    plugin: 'blockblast', surface, component: 'Pane', requestId: 'blockblast',
    props: {
      title: 'Block Blast', isFocused: false, bodyColumns: 52, placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 }, view: {}, blockblast: { seed: 1, ...blockblast },
    },
  })

const cell = (r: number, c: number) => ({ x: 2 * c, y: 1 + r }) // board cell -> region cell
const slot = (i: number) => ({ x: 18 + 11 * i, y: 2 }) // tray slot -> region cell (wide layout)
const board = (cells: [number, number][]) =>
  Array.from({ length: N * N }, (_, i) => (cells.some(([r, c]) => r * N + c === i) ? 1 : 0))
const checker = Array.from({ length: N * N }, (_, i) => ((Math.floor(i / N) + (i % N)) % 2 ? 0 : 1)) // free cells never touch

async function open($: any, surface: 'terminal' | 'desktop', blockblast: object) {
  const ui = await mountFn($)(surface, blockblast)
  await ui.resize({ columns: 52, rows: 12, in: 'game' })
  return ui
}
const click = (ui: any, p: { x: number; y: number }) => ui.pointer({ type: 'down', button: 'left', ...p })
const hover = (ui: any, p: { x: number; y: number }) => ui.pointer({ type: 'move', ...p })

// Move the ghost (of whatever piece is selected) to a corner so it hides nothing under test.
const park = (ui: any, r = 0, c = 0) => hover(ui, cell(r, c))

// Board row r as 2 characters per cell: '. ' empty, '##' filled, '~~' ghost (a background run of green/red).
async function boardRow(ui: any, r: number) {
  const flat = (n: any): string => (typeof n === 'string' ? n : (n.children ?? []).map(flat).join(''))
  const texts = (n: any): any[] => (typeof n === 'string' ? [] : n.type === 'Text' ? [n] : (n.children ?? []).flatMap(texts))
  const walk = (n: any): any => (n.props?.key === `row${1 + r}` ? n : (n.children ?? []).map((k: any) => typeof k === 'string' ? undefined : walk(k)).find(Boolean))
  return texts(walk(await ui.drawn({ in: 'game' })))
    .map(t => {
      const bg = t.props?.backgroundColor
      return bg ? flat(t).replace(/./g, /green|red/.test(bg) ? '~' : '#') : flat(t)
    })
    .join('').slice(0, 2 * N)
}
const ghostColors = async (ui: any) =>
  (await ui.findAll({ in: 'game', type: 'Text' })).map((t: any) => t.props?.backgroundColor).filter((c: string) => /green|red/.test(c ?? ''))

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: pane shows the hint and the game, placing a piece scores`, async ($, on) => {
  mock.store(on)
    const ui = await open($, surface, { debug: { tray: ['mono', 'h2', 'v2'] } })
    expect(await ui.find({ type: 'Text', text: /Esc closes/ })).toBeDefined()
    expect(await ui.find({ in: 'game', text: 'Score 0' })).toBeDefined()

    await click(ui, slot(1)) // pick the h2
    await hover(ui, cell(3, 3))
    expect(await boardRow(ui, 3)).toBe('. . . ~~~~. . . ')
    expect(await ghostColors(ui)).toEqual(['green'])

    await click(ui, cell(3, 3))
    await park(ui)
    expect(await boardRow(ui, 3)).toBe('. . . ####. . . ')
    expect(await ui.find({ in: 'game', text: 'Score 2' })).toBeDefined()
    expect(await ui.find({ in: 'game', text: '[2]' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: the ghost is red over a filled cell and a click there does nothing`, async ($, on) => {
  mock.store(on)
    const ui = await open($, surface, { debug: { board: board([[2, 2]]), tray: ['h2', 'mono', 'mono'] } })
    await hover(ui, cell(2, 1)) // h2 would cover (2,1) and (2,2)
    expect(await ghostColors(ui)).toEqual(['red'])
    await click(ui, cell(2, 1))
    expect(await ui.find({ in: 'game', text: 'Score 0' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: keys move, pick and place`, async ($, on) => {
  mock.store(on)
    const ui = await open($, surface, { debug: { tray: ['mono', 'h2', 'v2'] } })
    await ui.key({ key: '3', in: 'game' })
    await ui.key({ key: 'right' })
    await ui.key({ key: 'down' })
    await ui.key({ key: 'return' }) // v2 at (4,4)
    expect(await boardRow(ui, 5)).toBe('. . . . ##. . . ')
    await ui.key({ key: '2' })
    await ui.key({ key: ' ' }) // h2 at the same cursor: overlaps, so nothing happens
    expect(await ui.find({ in: 'game', text: 'Score 2' })).toBeDefined()
    await ui.key({ key: 'left' })
    await ui.key({ key: 'left' })
    await ui.key({ key: 'left' })
    await ui.key({ key: 'return' }) // h2 at (4,1)
    await park(ui)
    expect(await boardRow(ui, 4)).toBe('. ####. ##. . . ')
    await ui.unmount()
  })

  test(`${surface}: a row clear scores cells + 10*L^2 + combo bonus`, async ($, on) => {
  mock.store(on)
    const six = [0, 1, 2, 3, 4, 5].map((c): [number, number] => [7, c])
    const ui = await open($, surface, { debug: { board: board(six), tray: ['h2', 'mono', 'mono'] } })
    await click(ui, slot(0))
    await click(ui, cell(7, 6))
    await park(ui)
    expect(await boardRow(ui, 7)).toBe('. . . . . . . . ') // cleared
    // 2 cells + 10*1*1 + 10*combo(1) = 22
    expect(await ui.find({ in: 'game', text: 'Score 22   Combo x1' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: game over, then r restarts`, async ($, on) => {
  mock.store(on)
    const ui = await open($, surface, { debug: { board: checker, tray: ['mono', 'h2', 'h2'] } })
    expect(await ui.find({ in: 'game', text: /Game over/ })).toBeUndefined()
    await click(ui, slot(0))
    await click(ui, cell(0, 1)) // free cells never touch, so no h2 fits any more
    expect(await ui.find({ in: 'game', text: 'Game over - press r' })).toBeDefined()
    await click(ui, cell(2, 1)) // no more moves once the game is over
    expect(await ui.find({ in: 'game', text: 'Score 1' })).toBeDefined()

    await ui.key({ key: 'r' })
    expect(await ui.find({ in: 'game', text: /Game over/ })).toBeUndefined()
    expect(await ui.find({ in: 'game', text: 'Score 0   Combo x0' })).toBeDefined()
    expect(await boardRow(ui, 0)).toBe('. . . . . . . . ')
    await ui.unmount()
  })
}

test('narrow regions stack the tray under the board and clicks still land', async ($, on) => {
  mock.store(on)
  const ui = await mountFn($)('terminal', { debug: { tray: ['mono', 'h2', 'v2'] } })
  await ui.resize({ columns: 40, rows: 17, in: 'game' })
  await click(ui, { x: 11, y: 11 }) // slot 1 sits under the board now
  await click(ui, cell(0, 0))
  await park(ui, 7, 7)
  expect(await boardRow(ui, 0)).toBe('####. . . . . . ')
  await ui.unmount()
})

test('the ghost highlights the lines it would clear', async ($, on) => {
  mock.store(on)
  const six = [0, 1, 2, 3, 4, 5].map((c): [number, number] => [7, c])
  const ui = await open($, 'terminal', { debug: { board: board(six), tray: ['h2', 'mono', 'mono'] } })
  await hover(ui, cell(7, 6))
  expect(await ghostColors(ui)).toEqual(['greenBright'])
  expect(await boardRow(ui, 7)).toBe('~'.repeat(2 * N)) // the whole row lights up, filled cells included
  await hover(ui, cell(0, 0))
  expect(await ghostColors(ui)).toEqual(['green'])
  await ui.unmount()
})

test('picking a bigger piece re-clamps the cursor so the next arrow moves it', async ($, on) => {
  mock.store(on)
  const ui = await open($, 'terminal', { debug: { tray: ['mono', 'sq3', 'mono'] } })
  await hover(ui, cell(7, 7)) // mono fits at (7,7)
  await click(ui, slot(1)) // sq3 clamps to (5,5)
  await ui.key({ key: 'up', in: 'game' }) // (4,5)
  await ui.key({ key: 'return' })
  await park(ui)
  expect(await boardRow(ui, 4)).toBe('. . . . . ######')
  await ui.unmount()
})
