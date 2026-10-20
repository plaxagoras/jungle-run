export type JungleOn = boolean

/** One sprite placed on the stage (hooks/art.ts Pose, frame kept as a plain string here). */
export type Placed = { frame: string; x: number; lift: number; flip: boolean; label: string }

/** Everything the band draws, rebuilt each tick. */
export type Scene = {
  visible: boolean
  hero: Placed
  fx: Placed[]
  /** Red "!" over the explorer's head. */
  bang: boolean
  caption: string
  alert: boolean
  tally: string | null
  /** The screen (hooks/jungle.ts Screen), its tick, and whether its treasure is taken. */
  jungle: { screen: { kind: string; n: number; w: number; at: number; seed: number; treasure: string | null; caption: string; camp?: number }; t: number; taken: boolean } | null
}

declare module 'claude-code' {
  interface PluginState {
    'jungle-run': {
      scene: Scene
      isOn: JungleOn
    }
  }
}
