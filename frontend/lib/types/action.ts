// Action domain types (spec #0005) — the owner's read of the async spine.
// Mirrors backend action/handler.go `actionDTO`: the generic Action plus
// worldTime on every read. The slice consumer is the running-scan indicator
// (#0006): a scan's params carry the frozen origin system and aim target, so
// the board can draw the committed beam until the eta passes.

import type { Hex } from '@/lib/hex'

export type ActionStatus = 'running' | 'done' | 'cancelled'

export interface GameAction {
  id: string
  type: string // dispatch key: 'burn' | 'lane-travel' | 'scan' | ...
  actor: string
  scope: string
  // Params are frozen at commit, per type. A scan pins {systemId, origin} —
  // origin is the EMISSION HEX the pulse grows from and the resolve mints
  // from (#0006 Decision #26); it does not ride the fleet.
  params?: {
    systemId?: string
    origin?: Hex
    target?: Hex
  } & Record<string, unknown>
  committedAt: number
  eta: number
  status: ActionStatus
  outcome?: string
  worldTime: number
}

export interface ActionList {
  actions: GameAction[]
  worldTime: number
}
