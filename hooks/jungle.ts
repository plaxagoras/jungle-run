/**
 * Jungle mode: a flip-screen jungle run in the idiom of early-80s home-console jungle games.
 * Pure, no engine: screens and their hazards, the autopilot's path across one, and the scenery.
 *
 * Coordinates are stage pixels. A screen is 40 px tall, stacked in flat bands like the originals:
 * canopy (y 0-8, stepped lower edge), light-green jungle with trunks, the ground lane (y 28-35;
 * the explorer's boots land on y 31, mid-lane) and a dirt band (y 36-39). Pits are stepped black
 * lenses cut into the lane. The hero's feet cover x+4 to x+14 of his pose.
 */
import { LOOPS, RUN_PX } from './art'
import type { Pose } from './art'
import type { FrameName } from './frames'

export type Kind = 'clear' | 'log' | 'logs' | 'pit' | 'quicksand' | 'vine' | 'crocs' | 'fire'
export type Screen = {
  kind: Kind
  /** logs: how many roll; crocs: how many heads. */
  n: number
  /** Width the screen was laid out for. */
  w: number
  /** The hazard's left edge. */
  at: number
  /** Trees and the treasure's look. */
  seed: number
  /** A finished task's name, lying on the ground as treasure, or null. */
  treasure: string | null
  caption: string
  /** A resting screen: where he stops to make camp, with a campfire just ahead. */
  camp?: number
}

const H = 40
const GROUND = 28
const DIRT = 36
/** First row under the boots of a hero standing in the lane. */
const LANE = 32
/** Lift that stands the hero in the ground lane; add it to every jungle pose's lift. */
export const STAND = 8
const FEET: readonly [number, number] = [4, 14]
/** Where the exit is: the hero's x past this flips to the next screen. */
export const exitX = (w: number) => w - 18
/** Treasure's left edge, near the right edge so it's picked up last. */
export const treasureX = (w: number) => w - 36
const HAZARD_FROM = 40

// Jump: 8 ticks after takeoff, RUN_PX each, the dojo jump's frames and arc.
const JUMP_TICKS = 8
const JUMP_LIFT = [0, 3, 6, 8, 8, 8, 7, 4, 0]
const JUMP_DX = JUMP_TICKS * RUN_PX
const CROC_LIFT = 4
const CROC_W = 12
const CROC_GAP = 32
const CROC_PERIOD = 40
const CROC_SHUT = 28
const PIT_W = 16
const LOG_W = 8
const LOG_SPEED = 2
const LOG_GAP = 44
const QUICK_MAX = 56
const QUICK_PERIOD = 64
// Vine: anchored far above the stage, so the arc is long and nearly flat.
export const VINE_L = 40
const VINE_A = (35 * Math.PI) / 180
export const VINE_PERIOD = 24
const VINE_PIT = 40
const SWING_LIFT = -2
/** Where the vine meets the fists in hang1/hang2 (frame x, frame row). */
export const HANG_HAND = { dx: 12, dy: 10 }
const SPRITE_H = 32
/** The campfire's left edge, from where he stops: past the poking stick's tip. */
const CAMPFIRE = 20

const SIZES: Record<Kind, (n: number) => number> = {
  clear: () => 0,
  log: () => LOG_W,
  fire: () => LOG_W,
  pit: () => PIT_W,
  quicksand: () => QUICK_MAX,
  // takeoff, 34 px to the pit's centre, the pit, the landing 22 px past the centre, the feet
  vine: () => 34 + 22 + 14,
  crocs: n => 20 + CROC_GAP * (n - 1) + 32,
  logs: () => 0,
}

const mult4 = (n: number) => Math.floor(n / 4) * 4

/** A small deterministic hash, so a seed always grows the same trees. */
export function hash(n: number): number {
  let t = (n + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Lay a screen out for a stage `w` px wide. A hazard that can't fit shrinks or becomes a pit. */
export function layout(kind: Kind, n: number, w: number, seed: number, treasure: string | null, caption: string): Screen {
  let k = kind
  let count = n
  const room = treasureX(w) - 12 - HAZARD_FROM
  if (k === 'crocs') while (count > 1 && SIZES.crocs(count) > room) count -= 1
  // Rolling logs need open ground between them to land on.
  if (k === 'logs') count = Math.max(1, Math.min(count, Math.floor(w / 70)))
  if (SIZES[k](count) > room) k = SIZES.pit(1) <= room ? 'pit' : 'clear'
  const size = SIZES[k](count)
  const at = mult4(HAZARD_FROM + (room - size) / 2)
  return { kind: k, n: count, w, at, seed, treasure, caption }
}

/** The vine screen: its takeoff spot is `at`, the pit and the vine's anchor centred 34 px on. */
function vine(s: Screen) {
  const cx = s.at + 34
  return { cx, pit: [cx - VINE_PIT / 2, cx + VINE_PIT / 2] as const }
}
export const vineAngle = (t: number) => -VINE_A * Math.cos((2 * Math.PI * t) / VINE_PERIOD)

const quickWidth = (t: number) => {
  const q = QUICK_MAX * Math.max(0, Math.sin((2 * Math.PI * t) / QUICK_PERIOD))
  return Math.round(q / 2) * 2
}
const crocShut = (t: number) => ((t % CROC_PERIOD) + CROC_PERIOD) % CROC_PERIOD < CROC_SHUT
const crocs = (s: Screen) => Array.from({ length: s.n }, (_, i) => s.at + 20 + i * CROC_GAP)
const pond = (s: Screen) => [s.at, s.at + SIZES.crocs(s.n)] as const

/** Left edges of the rolling logs on tick t; they roll left and come back round. */
export function logsAt(s: Screen, t: number): number[] {
  const loop = s.w + LOG_W * 2
  return Array.from({ length: s.n }, (_, i) => {
    const start = s.w - 20 + i * LOG_GAP
    return ((((start - LOG_SPEED * t) % loop) + loop) % loop) - LOG_W
  })
}

/** Holes in the ground on tick t, as [from, to) spans. */
function holes(s: Screen, t: number): (readonly [number, number])[] {
  switch (s.kind) {
    case 'pit':
      return [[s.at, s.at + PIT_W]]
    case 'quicksand': {
      const q = quickWidth(t)
      const c = s.at + QUICK_MAX / 2
      return q > 0 ? [[c - q / 2, c + q / 2]] : []
    }
    case 'vine':
      return [vine(s).pit]
    case 'crocs':
      return [pond(s)]
    default:
      return []
  }
}

/** Things standing on the ground on tick t that the feet can't share. */
function blocks(s: Screen, t: number): (readonly [number, number])[] {
  if (s.kind === 'log' || s.kind === 'fire') return [[s.at, s.at + LOG_W]]
  if (s.kind === 'logs') return logsAt(s, t).map(x => [x, x + LOG_W] as const)
  return []
}

/** Feet height for a stand at x on tick t, or null if he'd fall or be hit there. */
export function footing(s: Screen, x: number, t: number): number | null {
  const [f0, f1] = [x + FEET[0], x + FEET[1]]
  for (const [a, b] of blocks(s, t)) if (a < f1 && f0 < b) return null
  const hs = holes(s, t)
  if (!hs.some(([a, b]) => a < f1 && f0 < b)) return 0
  if (s.kind === 'crocs' && crocShut(t)) {
    // All of the feet on one closed head.
    for (const c of crocs(s)) if (f0 >= c && f1 <= c + CROC_W) return CROC_LIFT
  }
  return null
}

type Node = { x: number; t: number; lift: number; prev: Node | null; poses: Pose[] }

const pose = (frame: FrameName, x: number, lift: number, label: string): Pose => ({ frame, x, lift, flip: false, label })

/**
 * The autopilot: the quickest way from x on tick t to the exit, one Pose per tick after t.
 * A breadth-first search over run / wait / jump / swing, so it never lands in a hole or on a log.
 * `stopAt` ends the walk there instead of at the exit (a resting screen).
 */
export function plan(s: Screen, x0: number, t0: number, stopAt?: number): Pose[] {
  const goal = stopAt ?? exitX(s.w)
  const start: Node = { x: x0, t: t0, lift: footing(s, x0, t0) ?? 0, prev: null, poses: [] }
  const seen = new Set<number>([x0 * 4096 + t0])
  const queue: Node[] = [start]
  const v = s.kind === 'vine' ? vine(s) : null
  const takeoff = v ? v.cx - 34 : -1
  let runs = 0
  for (let head = 0; head < queue.length && head < 60_000; head++) {
    const n = queue[head]!
    if (n.x >= goal) return unwind(n)
    if (n.t - t0 > 600) continue
    const next = (x: number, t: number, lift: number, poses: Pose[]) => {
      const key = x * 4096 + t
      if (seen.has(key)) return
      seen.add(key)
      queue.push({ x, t, lift, prev: n, poses })
    }

    // Run: one step, clamped so a stop or a takeoff spot isn't overshot.
    const step = Math.min(RUN_PX, Math.max(0, goal - n.x), n.x < takeoff ? takeoff - n.x : RUN_PX)
    if (step > 0 && n.lift === 0) {
      const lift = footing(s, n.x + step, n.t + 1)
      if (lift === 0) next(n.x + step, n.t + 1, 0, [pose(LOOPS.run[runs++ % LOOPS.run.length]!, n.x + step, 0, 'run')])
    }
    // Jump: grounded at takeoff and landing only; the arc clears anything in between.
    // Only when running on would meet trouble: on open ground he runs, as in the originals.
    const useful = n.lift > 0 || Array.from({ length: JUMP_TICKS }, (_, i) => i + 1).some(k => footing(s, n.x + k * RUN_PX, n.t + k) !== 0)
    const land = useful ? footing(s, n.x + JUMP_DX, n.t + JUMP_TICKS) : null
    if (land !== null && n.x + JUMP_DX <= Math.max(goal, exitX(s.w))) {
      const poses = Array.from({ length: JUMP_TICKS }, (_, i) => {
        const k = i + 1
        const base = Math.round(n.lift + ((land - n.lift) * k) / JUMP_TICKS)
        return pose(LOOPS.jump[k]!, n.x + k * RUN_PX, JUMP_LIFT[k]! + base, 'jump')
      })
      next(n.x + JUMP_DX, n.t + JUMP_TICKS, land, poses)
    }
    // Swing: from the takeoff spot, when the vine is at the near end of its arc.
    if (v && n.x === takeoff && n.lift === 0 && (((n.t + 1) % VINE_PERIOD) + VINE_PERIOD) % VINE_PERIOD === 0) {
      const poses = swing(v.cx, n.t + 1)
      const last = poses[poses.length - 1]!
      if (footing(s, last.x, n.t + poses.length) === 0) next(last.x, n.t + poses.length, 0, poses)
    }
    // Wait a tick where he stands.
    const stay = footing(s, n.x, n.t + 1)
    if (stay !== null && stay === n.lift) next(n.x, n.t + 1, stay, [pose(n.lift ? 'idle' : (LOOPS.idle[(n.t + 1) % LOOPS.idle.length] ?? 'idle'), n.x, stay, 'wait')])
  }
  // No way across (a stage too narrow to lay out): walk through, he can't be hurt here anyway.
  const out: Pose[] = []
  for (let x = x0 + RUN_PX, i = 0; x <= goal + RUN_PX - 1; x += RUN_PX, i++) out.push(pose(LOOPS.run[i % LOOPS.run.length]!, Math.min(x, goal), 0, 'run'))
  return out
}

function unwind(n: Node): Pose[] {
  const chunks: Pose[][] = []
  for (let c: Node | null = n; c; c = c.prev) chunks.push(c.poses)
  return chunks.reverse().flat()
}

/** Where the fists are at vine angle a, as a hero pose's x and lift. */
export function onVine(cx: number, a: number): { x: number; lift: number } {
  const x = Math.round(cx + VINE_L * Math.sin(a) - HANG_HAND.dx)
  return { x: x - (x & 1), lift: Math.round(SWING_LIFT + VINE_L * (1 - Math.cos(a))) }
}

/** Grab on tick t (the near end), ride half a period to the far end, let go and drop. */
function swing(cx: number, t: number): Pose[] {
  const out: Pose[] = []
  const half = VINE_PERIOD / 2
  for (let k = 0; k <= half; k++) {
    const { x, lift } = onVine(cx, vineAngle(t + k))
    out.push(pose(k % 6 < 3 ? 'hang1' : 'hang2', x, lift, 'swing'))
  }
  const from = out[out.length - 1]!
  const land = cx + 22
  const drop: [FrameName, number][] = [['fall', 6], ['fall', 3], ['land', 0]]
  drop.forEach(([frame, lift], i) => {
    const x = Math.round(from.x + ((land - from.x) * (i + 1)) / drop.length)
    out.push(pose(frame, x - (x & 1), lift, 'swing'))
  })
  return out
}

/** The vine's top end (far above the stage) and its free end on tick t, in stage px. */
export function vineLine(s: Screen, t: number, h: number) {
  const { cx } = vine(s)
  const a = vineAngle(t)
  const hand = { x: cx + VINE_L * Math.sin(a), y: h - SPRITE_H - STAND - SWING_LIFT + HANG_HAND.dy + VINE_L * (Math.cos(a) - 1) }
  const top = { x: cx, y: hand.y - VINE_L * Math.cos(a) }
  return { top, hand }
}

type Grid = string[][]
function rect(g: Grid, x: number, y: number, w: number, h: number, p: string) {
  for (let yy = Math.max(0, y); yy < Math.min(g.length, y + h); yy++) {
    const line = g[yy]!
    for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(line.length, x + w); xx++) line[xx] = p
  }
}

/** A stepped lens cut into the lane from a to b: 2 rows at the tips, 4, then 6 in the middle. */
function lens(g: Grid, a: number, b: number, p: string) {
  for (let x = Math.floor(a); x < b; x += 2) {
    const edge = Math.min(x - a, b - 2 - x)
    const half = edge < 4 ? 1 : edge < 8 ? 2 : 3
    rect(g, x, LANE - half, 2, half * 2, p)
  }
}

/** The screen on tick t, `w` px wide and `h` (at most 40) tall, as palette rows. */
export function scenery(s: Screen, t: number, w: number, h: number, taken: boolean): string[] {
  const g: Grid = Array.from({ length: H }, () => Array<string>(w).fill('h'))
  // Canopy: a solid band whose lower edge steps down and back up in 4-px blocks, 2 rows a step.
  rect(g, 0, 0, w, 8, 'g')
  const phase = Math.floor(hash(s.seed * 977) * 8) * 4
  for (let x = 0; x < w; x += 4) {
    const k = ((x + phase) / 4) % 8
    rect(g, x, 8, 4, 2 * (k < 4 ? k : 8 - k), 'g')
  }
  // Trunks, 4 px wide with a stepped fork into the canopy, kept clear of the hazard and the treasure.
  const trees = 3 + Math.floor(hash(s.seed) * 2)
  const busy = s.kind === 'logs' || s.kind === 'clear' ? [] : [[s.at - 8, s.at + SIZES[s.kind](s.n) + 8]]
  if (s.treasure) busy.push([treasureX(w) - 6, treasureX(w) + 14])
  if (s.camp !== undefined) busy.push([s.camp, s.camp + CAMPFIRE + LOG_W + 6])
  for (let i = 0; i < trees; i++) {
    const x = mult4(((i + 0.5) / trees) * w + (hash(s.seed + i * 31) - 0.5) * 24)
    if (busy.some(([a, b]) => x + 6 > a! && x - 2 < b!)) continue
    rect(g, x, 8, 4, GROUND - 8, 't')
    rect(g, x - 2, 8, 8, 2, 't')
  }
  // Ground lane over a darker dirt band.
  rect(g, 0, GROUND, w, DIRT - GROUND, 'y')
  rect(g, 0, DIRT, w, H - DIRT, 'd')

  for (const [a, b] of holes(s, t)) if (s.kind !== 'crocs') lens(g, a, b, s.kind === 'quicksand' ? 'd' : 'k')
  if (s.kind === 'crocs') {
    const [a, b] = pond(s)
    lens(g, a, b, 'w')
    for (const c of crocs(s)) {
      // Head out of the water, flat on top so he can stand on it, an eye bump at the back.
      const top = LANE - CROC_LIFT
      if (crocShut(t)) {
        rect(g, c, top, CROC_W, CROC_LIFT + 1, 'g')
        rect(g, c + CROC_W - 4, top - 1, 2, 1, 'g')
      } else {
        rect(g, c + 6, top, 6, CROC_LIFT + 1, 'g')
        rect(g, c + CROC_W - 4, top - 1, 2, 1, 'g')
        // Upper jaw raised, wide open toward the hero; lower jaw at the waterline.
        for (let k = 0; k < 4; k++) rect(g, c + 6 - k * 2, top - k * 2, 2, 2, 'g')
        rect(g, c, LANE, 6, 1, 'g')
      }
    }
  }
  // A log is a short upright drum in the lane with a ring on its face.
  const log = (x: number, ring: number) => {
    rect(g, x, LANE - 6, LOG_W, 7, 'r')
    rect(g, x + ring, LANE - 4, 2, 2, 'd')
  }
  if (s.kind === 'log') log(s.at, 3)
  if (s.kind === 'logs') for (const x of logsAt(s, t)) log(x, (t >> 1) % 2 ? 2 : 4)
  if (s.kind === 'fire') {
    rect(g, s.at, LANE - 1, LOG_W, 2, 'r')
    for (let k = 0; k < LOG_W; k += 2) {
      const tall = 4 + Math.floor(hash(t * 7 + k) * 5)
      rect(g, s.at + k, LANE - 1 - tall, 2, tall, (t + k) % 4 < 2 ? 'o' : 'S')
    }
  }
  if (s.kind === 'vine') {
    const { top, hand } = vineLine(s, t, H)
    // Drawn from the top of the stage in a lighter olive, so it reads against the canopy too.
    for (let y = Math.max(0, Math.ceil(top.y)); y <= hand.y; y++) {
      const x = top.x + ((hand.x - top.x) * (y - top.y)) / (hand.y - top.y)
      rect(g, Math.round(x / 2) * 2, y, 2, 1, 'd')
    }
  }
  if (s.camp !== undefined) {
    // A campfire: two crossed sticks and low flames, a little smaller than the fire hazard.
    const fx = s.camp + CAMPFIRE
    rect(g, fx, LANE, LOG_W, 1, 'r')
    rect(g, fx + 2, LANE - 1, 4, 1, 'r')
    for (let k = 0; k < LOG_W; k += 2) {
      const tall = (k === 0 || k === LOG_W - 2 ? 1 : 2) + Math.floor(hash(t * 5 + k) * 3)
      rect(g, fx + k, LANE - 1 - tall, 2, tall, (t + k) % 4 < 2 ? 'o' : 'S')
    }
  }
  if (s.treasure && !taken) {
    const tx = treasureX(w)
    rect(g, tx, LANE - 4, 8, 4, hash(s.seed + 5) < 0.5 ? 'H' : 'n')
    if (t % 6 < 3) rect(g, tx + 6, LANE - 7, 2, 2, 'W')
  }
  return g.slice(Math.max(0, H - h)).map(r => r.join(''))
}

/** Which screen a tool call builds; null for calls that don't move the run along. */
export function screenFor(tool: string, args: Record<string, unknown>): { kind: Kind; n: number } | null {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  switch (tool) {
    case 'Read':
      return { kind: 'log', n: 1 }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return { kind: 'logs', n: 1 }
    case 'Bash': {
      const long = args.run_in_background === true || /\b(test|build|install|compile|deploy)\b/i.test(str(args.command) + ' ' + str(args.description))
      return { kind: long ? 'quicksand' : 'pit', n: 1 }
    }
    case 'Grep':
    case 'Glob':
    case 'Agent':
      return { kind: 'vine', n: 1 }
    case 'WebFetch':
    case 'WebSearch':
      return { kind: 'crocs', n: 3 }
    default:
      return tool.startsWith('mcp__') ? { kind: 'crocs', n: 2 } : null
  }
}

/** The caption a screen gets from the call that built it (the dojo caption, told in the jungle). */
export function jungleCaption(kind: Kind, detail: string): string {
  const what: Record<Kind, string> = {
    clear: 'runs on',
    log: 'hops a log',
    logs: 'leaps the rolling logs',
    pit: 'clears a tar pit',
    quicksand: 'times the quicksand',
    vine: 'swings across on a vine',
    crocs: 'crosses on the crocodiles',
    fire: 'jumps the fire',
  }
  return detail ? `${what[kind]}: ${detail}` : what[kind]
}
