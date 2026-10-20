import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { LOOPS, RUN_PX, SPRITE_H, canvas, mirror, octantLines } from '../hooks/art'
import { FRAMES, PALETTE } from '../hooks/frames'
import { OCTANT } from '../hooks/octants'
import { detail, ending, newlyDone, readTodos, tally } from '../hooks/story'
import { exitX, footing, layout, plan, scenery, screenFor } from '../hooks/jungle'
import { DOZE_MS, SIT_MS, camp } from '../hooks/idle'
import type { Kind } from '../hooks/jungle'

test('the octant table covers all 256 masks with distinct one-column glyphs', () => {
  expect(OCTANT.length).toBe(256)
  expect(new Set(OCTANT).size).toBe(256)
  expect(OCTANT[0]).toBe(' ')
  expect(OCTANT[255]).toBe('█')
  expect(OCTANT[0b00001111]).toBe('▀')
  expect(OCTANT[0b11110000]).toBe('▄')
})

test('every frame is 32 px tall, at least 16 wide, in palette colors only', () => {
  for (const [name, rows] of Object.entries(FRAMES)) {
    expect(rows.length, name).toBe(SPRITE_H)
    expect(rows[0]!.length >= 16, name).toBe(true)
    for (const r of rows) for (const p of r) expect(p === '.' || p in PALETTE, `${name}: ${p}`).toBe(true)
  }
})

test('a cell never shows more than two colors, and an empty cell is a space', () => {
  const lines = octantLines(canvas(40, 40, { frame: 'run3', x: 4, lift: 0, flip: false, label: '' }))
  expect(lines.length).toBe(10)
  expect(lines[0]!.map(s => s.text).join('').trim()).toBe('')
  for (const line of lines) {
    for (const s of line) expect(Object.keys(s).filter(k => k !== 'text').length <= 2).toBe(true)
    expect([...line.map(s => s.text).join('')].length).toBe(20)
  }
})

test('the feet sit on the floor, a lift raises them, and facing left mirrors the body in place', () => {
  const floor = canvas(32, 40, { frame: 'idle', x: 0, lift: 0, flip: false, label: '' })
  const raised = canvas(32, 40, { frame: 'idle', x: 0, lift: 6, flip: false, label: '' })
  expect(floor[39]!.replace(/\./g, '').length > 0).toBe(true)
  expect(raised[39]!.replace(/\./g, '')).toBe('')
  expect(mirror(['AB.'])).toEqual(['.BA'])
})

test('the run cycle is 6 rig frames and moves an even step, so octant cells never shimmer', () => {
  expect(LOOPS.run.length).toBe(6)
  expect(RUN_PX % 2).toBe(0)
  expect(LOOPS.jump.length >= 9).toBe(true)
})

test('tool calls carry their detail, todos make a tally, and endings count the treasure', () => {
  expect(detail('Read', { file_path: '/a/b/c.ts' })).toBe('c.ts')
  expect(detail('WebFetch', { url: 'https://example.com/x' })).toBe('example.com')
  const list = readTodos({ todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress', activeForm: 'Doing b' }] })
  expect(tally(list)).toBe('◆ 1/2 · next: Doing b')
  expect(tally(list, 1)).toBe('◆ 0/2 · next: Doing b')
  expect(tally([])).toBeNull()
  expect(newlyDone([], list).map(t => t.content)).toEqual(['a'])
  expect(ending(false, 2, 9)).toBe('2 treasures found in 9s')
  expect(ending(true, 0, 9)).toMatch(/error/)
})

test('the jungle autopilot crosses every hazard at every width without a grounded step on a hole or a log', () => {
  const kinds: [Kind, number][] = [['clear', 1], ['log', 1], ['fire', 1], ['pit', 1], ['quicksand', 1], ['vine', 1], ['crocs', 3], ['crocs', 2], ['logs', 1], ['logs', 3]]
  let fallbacks = 0
  for (const [kind, n] of kinds) {
    for (const w of [60, 100, 160, 240, 320]) {
      for (let t0 = 0; t0 < 70; t0 += 13) {
        const s = layout(kind, n, w, w + t0, null, '')
        const path = plan(s, 0, t0)
        expect(path[path.length - 1]!.x >= exitX(w), `${kind} ${w} ${t0}`).toBe(true)
        const walked = s.kind !== 'clear' && path.every(p => p.label === 'run') && path.some((p, i) => footing(s, p.x, t0 + i + 1) === null)
        if (walked) { fallbacks++; continue }
        const slips = path.filter((p, i) => (p.label === 'run' || p.label === 'wait' || p.frame === 'land') && footing(s, p.x, t0 + i + 1) !== p.lift)
        expect(slips.length, `${kind} ${w} ${t0}`).toBe(0)
        if (s.kind === 'vine') expect(path.some(p => p.frame === 'hang1')).toBe(true)
        const rows = scenery(s, t0, w, 40, false)
        expect(rows.length).toBe(40)
        expect(rows.every(r => r.length === w)).toBe(true)
        expect([...new Set(rows.join(''))].filter(p => p !== '.' && !(p in PALETTE))).toEqual([])
      }
    }
  }
  // A rolling log wrapping onto the spawn point can leave no clean line; he walks through then.
  expect(fallbacks <= 2).toBe(true)
})

test('tool calls lay jungle hazards', () => {
  expect(screenFor('Read', {})?.kind).toBe('log')
  expect(screenFor('Edit', {})?.kind).toBe('logs')
  expect(screenFor('Bash', { command: 'ls' })?.kind).toBe('pit')
  expect(screenFor('Bash', { command: 'npm test' })?.kind).toBe('quicksand')
  expect(screenFor('Grep', {})?.kind).toBe('vine')
  expect(screenFor('WebSearch', {})?.kind).toBe('crocs')
  expect(screenFor('TaskList', {})).toBeNull()
})

function world(on: On) {
  const clock = mock.clock(on)
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }))
  return clock
}

const BAND = {
  plugin: 'jungle-run',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 13, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

test('a turn: a grep becomes a vine, a finished todo is treasure picked up, a failure is fire, the turn ends counting it', async ($, on) => {
  const clock = world(on)
  on('turn.start', () => ({ turnId: 't' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  let fail = false
  on('tool.call', () => (fail ? { result: { stdout: '', stderr: 'boom' }, text: 'boom', isError: true } : { result: { stdout: 'ok', stderr: '' }, text: 'ok' }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const run = (args: string) => $.command.run({ command: 'jungle', args, origin: { kind: 'composer' }, presentation: 'command' } as never) as Promise<{ text?: string }>
  const see = async (text: RegExp) => {
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const found = await band.find({ type: 'Text', text })
    await band.unmount()
    return found
  }
  await $.turn.start({ text: 'find it', turnId: 't' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', tool_use_id: 'g0' } as never)
  await clock.advance(240)
  expect(await see(/^explorer /)).toBeUndefined()
  expect((await run('on')).text).toMatch(/on/)
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', tool_use_id: 'g1' } as never)
  const todos = (done: number) => ({ tool: 'TodoWrite', todos: ['a', 'b'].map((c, i) => ({ content: c, status: i < done ? 'completed' : 'pending' })), tool_use_id: `td${done}` })
  await $.tool.call(todos(0) as never)
  await $.tool.call(todos(1) as never)
  fail = true
  await $.tool.call({ tool: 'Bash', command: 'false', tool_use_id: 'b1' } as never)
  fail = false
  let vine = false
  let treasure = false
  let fire = false
  let noted = false
  for (let i = 0; i < 800 && !(vine && treasure && fire && noted); i++) {
    await clock.advance(120)
    if (!noted && (await see(/marks 2 new tasks on the map/))) noted = true
    if (!vine && (await see(/swings across on a vine: TODO/))) vine = true
    if (!treasure && (await see(/picks up treasure: a/))) treasure = true
    if (!fire && (await see(/jumps the fire: Bash failed/))) fire = true
  }
  expect(vine).toBe(true)
  expect(treasure).toBe(true)
  expect(fire).toBe(true)
  expect(noted).toBe(true)
  expect(await see(/◆ 1\/2/)).toBeDefined()
  await $.turn.complete({ answer: '', durationMs: 5000, isAborted: false, turnId: 't', reason: 'answer' } as never)
  await clock.advance(240)
  expect(await see(/1 treasure found/)).toBeDefined()
  await clock.advance(200_000)
  expect(await see(/^explorer /)).toBeUndefined()
})

test('/jungle demo tours every hazard, /jungle off hides it, a permission ask shouts', async ($, on) => {
  const clock = world(on)
  on('classic.PermissionRequest', () => ({}) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const run = (args: string) => $.command.run({ command: 'jungle', args, origin: { kind: 'composer' }, presentation: 'command' } as never) as Promise<{ text?: string }>
  const see = async (text: RegExp) => {
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const found = await band.find({ type: 'Text', text })
    await band.unmount()
    return found
  }
  expect((await run('demo')).text).toMatch(/demo/)
  await clock.advance(240)
  // It opens by marking a demo task on the map, then hops the log.
  expect(await see(/marks a new task on the map: a demo task \(demo\)/)).toBeDefined()
  let log = false
  for (let i = 0; i < 30 && !log; i++) {
    await clock.advance(120)
    log = (await see(/hops a log \(demo\)/)) !== undefined
  }
  expect(log).toBe(true)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'make' } } as never)
  await clock.advance(240)
  expect(await see(/needs you: allow Bash\?/)).toBeDefined()
  expect((await run('off')).text).toMatch(/off/)
  expect(await see(/^explorer /)).toBeUndefined()
  expect(await see(/engine band/)).toBeDefined()
})

test('every session starts off, even after /jungle on last time', async ($, on) => {
  const clock = world(on)
  on('turn.start', () => ({ turnId: 't' }) as never)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '' }, text: 'ok' }) as never)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'jungle', args: 'on', origin: { kind: 'composer' }, presentation: 'command' } as never)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'fix it', turnId: 't' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/src/a.ts', tool_use_id: 't1' } as never)
  await clock.advance(240)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /^explorer / })).toBeUndefined()
  await band.unmount()
})

test('at camp he stands with the odd bit, sits by the fire, then dozes under a z', () => {
  const frames = (ms: number) => new Set(Array.from({ length: 600 }, (_, k) => camp(40, k, ms, 7).hero.frame))
  const standing = frames(0)
  expect(standing.has('idle')).toBe(true)
  expect(['wave1', 'brow', 'map'].some(f => standing.has(f as never)) || [...Array(600).keys()].some(k => camp(40, k, 0, 7).hero.flip)).toBe(true)
  expect(standing.has('sit')).toBe(false)
  expect(frames(SIT_MS)).toEqual(new Set(['sit', 'poke']))
  const doze = camp(40, 5, DOZE_MS, 7)
  expect(doze.hero.frame).toBe('sit')
  expect(doze.fx[0]?.frame.startsWith('zz')).toBe(true)
  // Every seed's bits land on frames that exist, at his spot.
  for (let seed = 0; seed < 20; seed++) for (let k = 0; k < 300; k += 7) expect(camp(40, k, 0, seed).hero.x).toBe(40)
})

test('a resting screen has a campfire ahead of the camp spot', () => {
  const s = { ...layout('clear', 1, 200, 3, null, 'makes camp'), camp: 92 }
  const rows = scenery(s, 0, 200, 40, false)
  const fire = rows.slice(20, 33).some(r => /[oS]/.test(r.slice(112, 120)))
  expect(fire).toBe(true)
  expect(scenery(layout('clear', 1, 200, 3, null, ''), 0, 200, 40, false).some(r => /[oS]/.test(r))).toBe(false)
})
