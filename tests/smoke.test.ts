import { test, expect, mock } from 'claude-code/testing'

test('journey: a turn opens the pane, a move scores, the turn ends, a remount resumes', async ($, on) => {
  mock.store(on)
  const opens: unknown[] = []
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.open', async (_$: any, e: any) => { opens.push(e); return { value: { isPlaced: true } } })
  on('ui.toast', async () => ({ value: undefined }))
  on('ui.panes', async () => ({ value: [] }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(opens).toEqual([{ id: 'blockblast', title: 'Block Blast', closeOnEscape: true }])

  const mount = async () => {
    const ui = await ($ as any).ui.mount({
      plugin: 'blockblast', surface: 'terminal', component: 'Pane', requestId: 'blockblast',
      props: {
        title: 'Block Blast', isFocused: false, bodyColumns: 52, placement: 'dock',
        scroll: { offset: 0, bodyRows: 20 }, view: {}, blockblast: { seed: 1, debug: { tray: ['mono', 'h2', 'v2'] } },
      },
    })
    await ui.resize({ columns: 52, rows: 12, in: 'game' })
    return ui
  }
  const ui = await mount()
  expect(await ui.find({ type: 'Text', text: /Claude is working/ })).toBeDefined()
  await ui.pointer({ type: 'down', button: 'left', x: 29, y: 2 }) // tray slot 2: the h2
  await ui.pointer({ type: 'down', button: 'left', x: 6, y: 4 }) // board cell (3,3)
  expect(await ui.find({ in: 'game', text: 'Score 2' })).toBeDefined()

  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
  expect(await ui.find({ type: 'Text', text: /Claude is done/ })).toBeDefined()
  await ui.unmount()

  const again = await mount()
  expect(await again.find({ in: 'game', text: 'Score 2' })).toBeDefined()
  expect(await again.find({ type: 'Text', text: /Claude is done/ })).toBeDefined()
  await again.unmount()
})
