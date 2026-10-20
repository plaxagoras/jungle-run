/**
 * Camp: what the explorer does once the turn is over and he has stopped. Pure, no engine.
 * Standing, he now and then waves, wipes his brow, reads the map or looks back down the trail;
 * sat by the fire he pokes it; after a while he dozes off.
 */
import { LOOPS } from './art'
import type { Pose } from './art'
import type { FrameName } from './frames'
import { hash } from './jungle'

export const SIT_MS = 20_000
export const DOZE_MS = 75_000
/** Ticks per slot; a bit may start REST ticks into each one. */
const SLOT = 50
const REST = 14
const Z_PERIOD = 24

type Bit = { frames: [FrameName, number][]; flip?: boolean }
const STANDING: Bit[] = [
  { frames: [['wave1', 3], ['wave2', 3], ['wave1', 3], ['wave2', 3], ['wave1', 3]] },
  { frames: [['brow', 12]] },
  { frames: [['map', 24]] },
  { frames: [['idle', 14]], flip: true },
]
const POKE: Bit = { frames: [['poke', 4], ['sit', 3], ['poke', 4], ['sit', 3], ['poke', 4]] }

/** The frame a bit shows k ticks in, or null once it's over. */
function frameAt(bit: Bit, k: number): FrameName | null {
  for (const [frame, n] of bit.frames) {
    if (k < n) return frame
    k -= n
  }
  return null
}

/**
 * The camped explorer at x, `campT` ticks after he stopped and `ms` after the turn ended.
 * fx lifts are relative to his, like the hero's: the caller adds the stand lift to both.
 */
export function camp(x: number, campT: number, ms: number, seed: number): { hero: Pose; fx: Pose[] } {
  const pose = (frame: FrameName, label: string, flip = false): Pose => ({ frame, x, lift: 0, flip, label })
  if (ms >= DOZE_MS) {
    // A z drifts up and right off his hat, shrinking; the next one starts as it fades.
    const k = campT % Z_PERIOD
    const z: Pose = { frame: k < Z_PERIOD / 2 ? 'zz1' : 'zz2', x: x + 14 + Math.floor(k / 6) * 2, lift: 18 + Math.floor(k / 3), flip: false, label: 'z' }
    return { hero: pose('sit', 'doze'), fx: [z] }
  }
  const sitting = ms >= SIT_MS
  const slot = Math.floor(campT / SLOT)
  const k = (campT % SLOT) - REST
  if (slot > 0 && k >= 0) {
    const roll = hash(seed * 31 + slot)
    const bit = sitting ? (roll < 0.6 ? POKE : null) : STANDING[Math.floor(roll * STANDING.length)]!
    const frame = bit && frameAt(bit, k)
    if (bit && frame) return { hero: pose(frame, 'bit', bit.flip), fx: [] }
  }
  return { hero: sitting ? pose('sit', 'sit') : pose(LOOPS.idle[campT % LOOPS.idle.length]!, 'idle'), fx: [] }
}
