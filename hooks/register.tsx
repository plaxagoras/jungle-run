import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import type { Scene } from '../types'
import { FRAMES } from './frames'
import type { FrameName } from './frames'
import { STAGE_ROWS, TICK_MS, blank, fill, octantLines, paint } from './art'
import type { Pose } from './art'
import { detail, ending, newlyDone, readTodos, tally } from './story'
import { STAND, exitX, footing, hash, jungleCaption, layout, plan, scenery, screenFor, treasureX } from './jungle'
import { camp } from './idle'
import type { Kind, Screen } from './jungle'
import type { Todo } from './story'

const IDLE: Pose = { frame: 'idle', x: 0, lift: 0, flip: false, label: 'idle' }
const HIDDEN: Scene = { visible: false, hero: IDLE, fx: [], bang: false, caption: '', alert: false, tally: null, jungle: null }
const scene = atom({ plugin: 'jungle-run', key: 'scene' } as const, HIDDEN)
const isOn = atom({ plugin: 'jungle-run', key: 'isOn' } as const, false)

const HIDE_MS = 180_000
/** Picking up treasure: stoop for it, then hold it up. */
const PICKUP: [FrameName, number][] = [['tuck', 2], ['cheer', 9]]
/** A new task: he stops to mark it on the map. */
const NOTE: [FrameName, number][] = [['map', 12]]
/** Where the held-up treasure sits over the cheer pose's fist (frame x, lift over his). */
const HELD = { dx: 12, lift: 23 }
const QUEUE_MAX = 4
/** /jungle demo: one screen of every hazard, in this order. */
const DEMO: [Kind, number][] = [['log', 1], ['pit', 1], ['logs', 2], ['vine', 1], ['quicksand', 1], ['crocs', 3], ['fire', 1]]

// Stage state. Module variables: a reload starts the run over, which is fine for a toy.
let timer: Timer | null = null
let mode: 'hidden' | 'working' | 'done' = 'hidden'
let caption = ''
let alertText: string | null = null
/** The task list by id: TaskCreate ids, or `todo:<n>` for TodoWrite lists. */
let tasks = new Map<string, Todo>()
/** activeForm from TaskCreate, by subject, until the TaskCreated event gives the id. */
const activeBySubject = new Map<string, string>()
/** Finished tasks waiting to be laid down as treasure. */
let loot: string[] = []
let sparkles: { x: number; t: number }[] = []
/** New tasks waiting to be marked on the map, and the caption while he marks them. */
let notes: string[] = []
let noteText = ''
let doneAt = 0
let startedAt = 0
let found = 0
let stageW = 200
let tick = 0
let demoLeft = 0

// The run: tool calls queue screens, finished tasks become treasure, and the autopilot
// (hooks/jungle.ts plan) crosses each screen.
let screen: Screen | null = null
let t = 0
let path: Pose[] = []
let pi = 0
let x = 0
/** Where this screen's walk ends: the exit, or the camp spot on a resting screen. */
let stopAt: number | undefined
/** Ticks since he stopped at camp. */
let campT = 0
let taken = false
let seed = 0
let queue: { kind: Kind; n: number; caption: string }[] = []

const todoList = () => [...tasks.values()]
const pending = () => todoList().filter(t => t.status !== 'completed').length

async function begin($: EngineInterface) {
  if (mode !== 'working') {
    mode = 'working'
    startedAt = await $.clock.now()
    found = 0
  }
  ensure($)
}

function ensure($: EngineInterface) {
  if (timer) return
  timer = $.clock.every(TICK_MS, async () => step($))
}

function stop() {
  timer?.cancel()
  timer = null
}

/** Queue the screen a tool call builds; back-to-back edits pile more logs onto one screen. */
function queueScreen(kind: Kind, n: number, text: string) {
  const last = queue[queue.length - 1]
  if (last && last.kind === 'logs' && kind === 'logs') {
    last.n = Math.min(3, last.n + 1)
    last.caption = text
    return
  }
  queue.push({ kind, n, caption: text })
  if (queue.length > QUEUE_MAX) queue.shift()
}

/** The next screen: a queued one, an empty stretch while working, or a resting glade after. */
function flip(working: boolean) {
  const spec = queue.shift() ?? { kind: 'clear' as const, n: 1, caption: working ? 'runs on' : 'makes camp' }
  if (demoLeft > 0) demoLeft -= 1
  const resting = !working && spec.kind === 'clear'
  // Treasure waits for the next run: the camp spot is short of where it lies.
  screen = layout(spec.kind, spec.n, stageW, ++seed, resting ? null : (loot.shift() ?? null), spec.caption)
  t = 0
  x = 0
  taken = false
  stopAt = resting ? Math.floor(stageW / 2 / 4) * 4 - 8 : undefined
  if (stopAt !== undefined) screen.camp = stopAt
  campT = 0
  path = plan(screen, 0, 0, stopAt)
  pi = 0
  caption = screen.caption
}

const beat = (frames: [FrameName, number][], label: string): Pose[] =>
  frames.flatMap(([frame, n]) => Array.from({ length: n }, () => ({ frame, x, lift: 0, flip: false, label })))

/** Stop where he stands for a beat, then pick the walk back up. False if standing still here isn't safe. */
function pause(frames: Pose[]): boolean {
  const s = screen!
  if (frames.some((_, k) => footing(s, x, t + k + 1) !== 0)) return false
  path = [...frames, ...plan(s, x, t + frames.length, stopAt)]
  pi = 0
  return true
}

/** One tick: move along the path, flip at the edge, pick up treasure, then publish the scene. */
async function step($: EngineInterface) {
  tick += 1
  const now = await $.clock.now()
  sparkles = sparkles.map(p => ({ ...p, t: p.t + 1 })).filter(p => p.t < 6)
  const working = mode === 'working' || demoLeft > 0
  if (mode === 'done' && !alertText && demoLeft === 0 && now - doneAt >= HIDE_MS) mode = 'hidden'
  if (!screen) flip(working)
  t += 1
  let hero: Pose
  let props: Pose[] = []
  if (pi < path.length) {
    hero = path[pi++]!
  } else if (x >= exitX(screen!.w)) {
    flip(working)
    hero = path[pi++] ?? IDLE
  } else if (working) {
    path = plan(screen!, x, t)
    pi = 0
    hero = path[pi++] ?? { ...IDLE, x }
  } else {
    // Camped: idle bits standing, then sat by the fire, then dozing (hooks/idle.ts).
    ;({ hero, fx: props } = camp(x, campT++, now - doneAt, screen!.seed))
  }
  x = hero.x
  const s = screen!
  const grounded = hero.lift === 0 && (hero.label === 'run' || hero.label === 'wait')
  if (s.treasure && !taken && hero.x + 8 >= treasureX(s.w)) {
    taken = true
    found += 1
    caption = `picks up treasure: ${s.treasure}`
    sparkles.push({ x: treasureX(s.w) - 4, t: 0 })
    if (grounded) pause(beat(PICKUP, 'cheer'))
  } else if (notes.length > 0 && grounded && pause(beat(NOTE, 'note'))) {
    noteText = notes.length === 1 ? `marks a new task on the map: ${notes[0]}` : `marks ${notes.length} new tasks on the map`
    notes = []
  }
  if (hero.label === 'cheer' && hero.frame === 'cheer' && s.treasure) {
    // The same gold or silver it lay on the ground as (hooks/jungle.ts scenery).
    const frame: FrameName = hash(s.seed + 5) < 0.5 ? 'bar' : 'silver'
    props.push({ frame, x: hero.x + HELD.dx, lift: hero.lift + HELD.lift, flip: false, label: 'treasure' })
  }
  const visible = (await read($, isOn)) && (mode !== 'hidden' || alertText !== null || demoLeft > 0)
  const said = hero.label === 'note' ? noteText : caption
  const lying = loot.length + (s.treasure && !taken ? 1 : 0)
  await update($, scene, () => ({
    visible,
    hero: { ...hero, lift: hero.lift + STAND },
    fx: [
      ...props.map(p => ({ ...p, lift: p.lift + STAND })),
      ...sparkles.map(p => ({ frame: p.t < 3 ? 'poof1' : 'poof2', x: p.x, lift: STAND, flip: false, label: 'sparkle' })),
    ],
    bang: alertText !== null,
    caption: alertText ?? (demoLeft > 0 ? `${said} (demo)` : said),
    alert: alertText !== null,
    tally: tally(todoList(), lying),
    jungle: { screen: s, t, taken },
  }))
  if (!visible && !alertText) stop()
}

/** A task finished (TaskUpdate or the TaskCompleted hook, whichever comes first): queue its treasure. */
function complete(id: string, subject?: string) {
  const task = tasks.get(id) ?? (subject ? { content: subject, status: 'pending' } : undefined)
  if (!task || task.status === 'completed') return
  tasks.set(id, { ...task, status: 'completed' })
  loot.push(task.content)
}

function fromOtherMod(next: { origin: { plugin: string } }): boolean {
  return next.origin.plugin !== 'engine'
}

function topRow(frame: FrameName): number {
  const i = FRAMES[frame].findIndex(r => /[^.]/.test(r))
  return i < 0 ? 0 : i
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'jungle', description: 'Jungle run: on, off, demo' })
    // Every session starts off; /jungle on wakes it for this session only.
    await update($, isOn, () => false)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stop()
    return next(e)
  })

  on('command.run', { command: 'jungle' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await update($, isOn, () => arg === 'on')
      if (arg === 'off') {
        stop()
        await update($, scene, s => ({ ...s, visible: false }))
      }
      return { text: `Jungle run ${arg}.` }
    }
    if (arg === 'demo') {
      await update($, isOn, () => true)
      queue = DEMO.map(([kind, n]) => ({ kind, n, caption: jungleCaption(kind, '') }))
      demoLeft = DEMO.length + 1
      notes = ['a demo task']
      loot = ['a demo treasure']
      screen = null
      ensure($)
      return { text: 'Jungle demo: one screen of every hazard.' }
    }
    return { text: 'Usage: /jungle on|off|demo' }
  })

  on('turn.start', async ($, e, next) => {
    await begin($)
    return next(e)
  })

  // The dialog is about to show (not just an "ask" verdict auto mode may settle): stop and shout.
  on('classic.PermissionRequest', async ($, e, next) => {
    alertText = `needs you: allow ${e.tool_name}?`
    ensure($)
    return next(e)
  })

  on('classic.TaskCreated', async ($, e, next) => {
    if (!e.teammate_name) {
      tasks.set(e.task_id, { content: e.task_subject, status: 'pending', activeForm: activeBySubject.get(e.task_subject) })
      notes.push(e.task_subject)
      activeBySubject.delete(e.task_subject)
      await begin($)
    }
    return next(e)
  })

  on('classic.TaskCompleted', async ($, e, next) => {
    if (!e.teammate_name) complete(e.task_id, e.task_subject)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (fromOtherMod(next) || e.agentId) return next(e)
    const args = e as unknown as Record<string, unknown>
    await begin($)
    const hazard = screenFor(e.tool, args)
    if (hazard) queueScreen(hazard.kind, hazard.n, jungleCaption(hazard.kind, detail(e.tool, args)))
    if (e.tool === 'TodoWrite') {
      const list = readTodos(args)
      if (list.length > 0) {
        const known = new Set(todoList().map(t => t.content))
        notes.push(...list.filter(t => !known.has(t.content) && t.status !== 'completed').map(t => t.content))
        loot.push(...newlyDone(todoList(), list).map(t => t.content))
        tasks = new Map(list.map((t, i) => [`todo:${i}`, t]))
      }
    }
    if (e.tool === 'TaskCreate' && typeof args.subject === 'string' && typeof args.activeForm === 'string') {
      activeBySubject.set(args.subject, args.activeForm)
    }
    if (e.tool === 'TaskUpdate' && typeof args.taskId === 'string') {
      const task = tasks.get(args.taskId)
      const status = typeof args.status === 'string' ? args.status : undefined
      if (task && status === 'deleted') tasks.delete(args.taskId)
      else if (task && status === 'completed') complete(args.taskId)
      else if (task) {
        tasks.set(args.taskId, {
          content: typeof args.subject === 'string' ? args.subject : task.content,
          status: status ?? task.status,
          activeForm: typeof args.activeForm === 'string' ? args.activeForm : task.activeForm,
        })
      }
    }
    if (e.tool === 'AskUserQuestion') alertText = 'needs you: a question is waiting'
    if (e.tool === 'ExitPlanMode') alertText = 'needs you: approve the plan?'
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      alertText = null
    }
    if (result.deny !== undefined || result.isError) {
      queueScreen('fire', 1, jungleCaption('fire', `${e.tool} ${result.deny !== undefined ? 'was refused' : 'failed'}`))
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    // A helper's turn ends inside the main one.
    if (e.agentId) return next(e)
    if (mode === 'working') {
      const seconds = Math.round(((await $.clock.now()) - startedAt) / 1000)
      caption = ending(e.reason === 'error', found, seconds)
      mode = 'done'
      doneAt = await $.clock.now()
      notes = []
      if (tasks.size > 0 && pending() === 0) tasks = new Map()
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface === 'mobile' || e.props.hasSurvey || !(await read($, isOn))) return next(e)
    const s = await read($, scene)
    if (!s.visible) return next(e)
    const below = await next(e)
    const rows = Math.min(STAGE_ROWS, (e.props.maxRows ?? 12) - 1 - (s.tally ? 1 : 0))
    if (rows < 8) return below
    const { Box, Text } = $.ui.resolve(e)
    const cols = Math.max(30, e.props.bodyColumns ?? 80)
    stageW = cols * 2
    const tall = rows * 4
    const grid = blank(stageW, tall)
    for (const p of [s.hero, ...s.fx]) paint(grid, p as Pose)
    if (s.bang) {
      const head = tall - 32 - s.hero.lift + topRow(s.hero.frame as FrameName)
      // Beside the hat: there's no headroom above it in the lane.
      fill(grid, s.hero.x + 16, head, 2, 5, 'S')
      fill(grid, s.hero.x + 16, head + 6, 2, 2, 'S')
    }
    const back = s.jungle ? scenery(s.jungle.screen as Screen, s.jungle.t, stageW, tall, s.jungle.taken) : undefined
    const lines = octantLines(grid.map(r => r.join('')), back)
    return (
      <Box flexDirection="column">
        {lines.map((segs, i) => (
          <Text key={String(i)}>
            {segs.map((seg, j) => (
              <Text key={String(j)} color={seg.color} backgroundColor={seg.backgroundColor}>
                {seg.text}
              </Text>
            ))}
          </Text>
        ))}
        {s.alert ? (
          <Text color="#e5534b" bold>{`explorer ${s.caption}`}</Text>
        ) : (
          <Text dimColor>{`explorer ${s.caption}`}</Text>
        )}
        {s.tally ? <Text color="#c9a24a">{s.tally}</Text> : null}
        {below}
      </Box>
    )
  })
}
