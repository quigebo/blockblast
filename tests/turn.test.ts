import { test, expect, mock } from 'claude-code/testing'

const turn = (turnId: string, agentId?: string) => ({ text: 'hi', turnId, ...(agentId ? { agentId } : {}) })
const done = (turnId: string, agentId?: string, reason: 'answer' | 'aborted' = 'answer') => ({ turnId, answer: '', durationMs: 1, isAborted: reason === 'aborted', reason, ...(agentId ? { agentId } : {}) })

// Spies sit beneath the plugin: they stand for the engine.
function spies(on: any, isPlaced = true) {
  const s = { opens: [] as any[], closes: 0, toasts: [] as string[], panes: [] as any[], focused: false }
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.open', async (_$: any, e: any) => {
    s.opens.push(e)
    s.panes = [{ id: e.id, title: e.title, isShown: isPlaced, isFocused: s.focused, isPlaced }]
    return { value: { isPlaced } }
  })
  on('ui.close', async (_$: any, e: any) => { s.closes++; return { value: undefined } })
  on('ui.toast', async (_$: any, e: any) => { s.toasts.push(e.text); return { value: undefined } })
  on('ui.panes', async () => ({ value: s.panes }))
  return s
}

const mount = ($: any) =>
  $.ui.mount({
    plugin: 'blockblast', surface: 'terminal', component: 'Pane', requestId: 'blockblast',
    props: { title: 'Block Blast', isFocused: false, bodyColumns: 52, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
const header = async (ui: any) => ({
  working: await ui.find({ type: 'Text', text: /Claude is working/ }),
  done: await ui.find({ type: 'Text', text: /Claude is done/ }),
})

test('a main-loop turn.start opens the pane unfocused, the header says working; turn.complete closes it', async ($, on) => {
  mock.store(on)
  const s = spies(on)
  await $.turn.start(turn('t1'))
  expect(s.opens).toEqual([{ id: 'blockblast', title: 'Block Blast', closeOnEscape: true }]) // no focus
  const ui = await mount($)
  expect((await header(ui)).working).toBeDefined()
  s.focused = true
  s.panes = s.panes.map(p => ({ ...p, isFocused: true }))
  await $.turn.complete(done('t1'))
  const h = await header(ui)
  expect([h.working, h.done !== undefined]).toEqual([undefined, true])
  expect(s.closes).toBe(1)
  expect(s.toasts).toEqual(['Claude is done'])
  await ui.unmount()
})

test('no header before the first turn; turn.complete with no pane open does not toast', async ($, on) => {
  mock.store(on)
  const s = spies(on)
  const ui = await mount($)
  expect(await header(ui)).toEqual({ working: undefined, done: undefined })
  await ui.unmount()
  await $.turn.complete(done('t0'))
  expect(s.toasts).toEqual([])
})

test('a subagent turn changes nothing', async ($, on) => {
  mock.store(on)
  const s = spies(on)
  await $.turn.start(turn('t2', 'agent-1'))
  await $.turn.complete(done('t2', 'agent-1'))
  expect(s.opens).toEqual([])
  expect(s.toasts).toEqual([])
  const ui = await mount($)
  expect(await header(ui)).toEqual({ working: undefined, done: undefined })
  await ui.unmount()
})

test('autoOpen: false never opens, but the header still tracks the turn', { options: { autoOpen: false } }, async ($, on) => {
  mock.store(on)
  const s = spies(on)
  await $.turn.start(turn('t3'))
  expect(s.opens).toEqual([])
  const ui = await mount($)
  expect((await header(ui)).working).toBeDefined()
  await ui.unmount()
  await $.turn.complete(done('t3'))
  expect(s.closes).toBe(0) // a pane the person opened stays
})

test('an open that is not placed toasts once across two turns', async ($, on) => {
  mock.store(on)
  const s = spies(on, false)
  await $.turn.start(turn('a'))
  await $.turn.complete(done('a'))
  await $.turn.start(turn('b'))
  expect(s.opens.length).toBe(2)
  expect(s.toasts).toEqual(['Claude is thinking - /blockblast to play'])
})

test('turn.complete toasts only while the pane is focused, and an aborted turn still says done', async ($, on) => {
  mock.store(on)
  const s = spies(on)
  await $.turn.start(turn('f1'))
  await $.turn.complete(done('f1')) // open but unfocused
  expect(s.toasts).toEqual([])
  s.panes = s.panes.map(p => ({ ...p, isFocused: true }))
  await $.turn.start(turn('f2'))
  s.panes = s.panes.map(p => ({ ...p, isFocused: true }))
  await $.turn.complete(done('f2', undefined, 'aborted'))
  expect(s.toasts).toEqual(['Claude is done'])
  const ui = await mount($)
  expect((await header(ui)).done).toBeDefined()
  await ui.unmount()
})

