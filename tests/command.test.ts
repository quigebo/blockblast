import { test, expect } from 'claude-code/testing'

test('/blockblast opens the pane, Esc-closable, without focus', async ($, on) => {
  const opened: unknown[] = []
  const registered: string[] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', async (_$, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(registered).toEqual(['blockblast'])
  const ran = await $.command.run({ command: 'blockblast', args: '' } as never)
  expect(opened).toEqual([{ id: 'blockblast', title: 'Block Blast', closeOnEscape: true }])
  expect(ran.text).toMatch(/opened/)
})
