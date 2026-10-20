/**
 * The stage, drawn with octant blocks: each terminal cell is 2x4 pixels, so the 16x32 explorer
 * fills 8 columns by 8 rows. A cell holds at most two colors (fg + bg); see octantLines.
 */
import { FRAMES, PALETTE } from './frames'
import type { FrameName } from './frames'
import { OCTANT } from './octants'

export type Action = 'idle' | 'run' | 'jump' | 'sit'
export type Segment = { text: string; color?: string; backgroundColor?: string }
/** A frame on the stage: x is the body's left edge, lift raises the feet off the floor. */
export type Pose = { frame: FrameName; x: number; lift: number; flip: boolean; label: string }

export const SPRITE_H = 32
/** Stage rows wanted: 8 for the explorer, 2 more of headroom for the jump arc and the "!". */
export const STAGE_ROWS = 10
export const TICK_MS = 120
/** Even, so the sprite never straddles a 2-px octant cell (odd x re-quantizes every frame and shimmers).
 * Matches tools/rig.py STEP: the planted foot slides back exactly this far per frame. */
export const RUN_PX = 4

/** Each action's loop, one frame name per tick. jump[1..8] is the airborne arc hooks/jungle.ts plays. */
export const LOOPS: Record<Action, readonly FrameName[]> = {
  idle: [...Array<FrameName>(5).fill('idle'), ...Array<FrameName>(5).fill('idle2')],
  sit: ['sit'],
  run: ['run1', 'run2', 'run3', 'run4', 'run5', 'run6'],
  jump: ['tuck', 'launch', 'air1', 'air1', 'air2', 'air2', 'air2', 'fall', 'land', 'land'],
}

export function mirror(rows: readonly string[]): string[] {
  return rows.map(r => [...r].reverse().join(''))
}

export function blank(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array<string>(w).fill('.'))
}

/** Paint a pose onto a grid, bottom-aligned to the floor. */
export function paint(grid: string[][], pose: Pose) {
  const h = grid.length
  const w = grid[0]?.length ?? 0
  const art = pose.flip ? mirror(FRAMES[pose.frame]) : FRAMES[pose.frame]
  const top = h - SPRITE_H - pose.lift
  // Facing left, the body (x 0-15) moves to the frame's right edge: keep it on the same spot.
  // x snaps to even so every sprite lands on whole octant cells.
  const x0 = pose.x - (pose.x & 1)
  const left = pose.flip ? x0 - (art[0]!.length - 16) : x0
  art.forEach((row, dy) => {
    const line = grid[top + dy]
    if (!line) return
    for (let dx = 0; dx < row.length; dx++) {
      const x = left + dx
      const p = row[dx]!
      if (p !== '.' && x >= 0 && x < w) line[x] = p
    }
  })
}

/** Fill a rectangle with one palette letter (the "!"). */
export function fill(grid: string[][], x: number, y: number, w: number, h: number, p: string) {
  for (let yy = Math.max(0, y); yy < Math.min(grid.length, y + h); yy++) {
    const line = grid[yy]!
    for (let xx = Math.max(0, x); xx < Math.min(line.length, x + w); xx++) line[xx] = p
  }
}

/** One pose on an empty stage (tests). */
export function canvas(w: number, h: number, pose: Pose): string[] {
  const grid = blank(w, h)
  paint(grid, pose)
  return grid.map(r => r.join(''))
}

/** Pixel rows (height a multiple of 4) into octant lines, adjacent same-style cells merged.
 * `back` is an optional backdrop the same size, drawn behind the sprites (see layered). */
export function octantLines(rows: readonly string[], back?: readonly string[]): Segment[][] {
  const out: Segment[][] = []
  const w = rows[0]?.length ?? 0
  for (let y = 0; y + 3 < rows.length; y += 4) {
    const line: Segment[] = []
    for (let x = 0; x < w; x += 2) {
      const px: string[] = []
      const bk: string[] = []
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          px.push(rows[y + dy]?.[x + dx] ?? '.')
          bk.push(back?.[y + dy]?.[x + dx] ?? '.')
        }
      }
      push(line, back ? layered(px, bk) : cell(px))
    }
    out.push(line)
  }
  return out
}

/** A cell with a backdrop: the sprite keeps its exact shape in its main color and the
 * backdrop's main color fills the rest. Sprite second colors drop out where they overlap scenery. */
function layered(px: string[], bk: string[]): Segment {
  if (px.every(p => p === '.')) return cell(bk)
  const under = bk.filter((_, i) => px[i] === '.')
  const shown = under.filter(b => b !== '.')
  if (shown.length === 0 || shown.length < under.length - shown.length) return cell(px)
  const fg = top(px.filter(p => p !== '.'))
  const bg = top(shown)
  let mask = 0
  px.forEach((p, i) => {
    if (p !== '.') mask |= 1 << i
  })
  if (fg === bg) return { text: OCTANT[255] ?? ' ', color: PALETTE[fg] }
  return { text: OCTANT[mask] ?? ' ', color: PALETTE[fg], backgroundColor: PALETTE[bg] }
}

function top(ps: string[]): string {
  const counts = new Map<string, number>()
  for (const p of ps) counts.set(p, (counts.get(p) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
}

/** One 2x4 cell. fg = most common color; bg = the runner-up, unless the cell has empty pixels. */
function cell(px: string[]): Segment {
  const counts = new Map<string, number>()
  for (const p of px) counts.set(p, (counts.get(p) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
  const fg = ranked.find(c => c !== '.')
  if (!fg) return { text: ' ' }
  const other = ranked.find(c => c !== fg)
  const bg = other && other !== '.' && !counts.has('.') ? other : undefined
  let mask = 0
  px.forEach((p, i) => {
    // With no bg, every colored pixel joins fg; with one, a third color falls to bg.
    if (p === fg || (!bg && p !== '.')) mask |= 1 << i
  })
  return { text: OCTANT[mask] ?? ' ', color: PALETTE[fg], ...(bg ? { backgroundColor: PALETTE[bg] } : {}) }
}

function push(line: Segment[], seg: Segment) {
  const last = line[line.length - 1]
  if (last && last.color === seg.color && last.backgroundColor === seg.backgroundColor) last.text += seg.text
  else line.push(seg)
}
