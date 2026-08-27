// Action domain types (spec #0005) — the owner's read of the async spine.
// Mirrors backend action/handler.go `actionDTO`: the generic Action plus
// worldTime on every read. The slice consumer is the running-scan indicator
// (#0006): a scan's params carry the frozen origin system and aim target, so
// the board can draw the committed beam until the eta passes.

import type { Cell, Target } from '@/lib/board'

export type ActionStatus = 'running' | 'done' | 'cancelled'

export interface GameAction {
  id: string
  type: string // dispatch key: 'burn' | 'lane-travel' | 'scan' | ...
  actor: string
  scope: string
  // Params are frozen at commit, per type. A scan pins {systemId, origin} —
  // origin is the EMISSION CELL the pulse grows from and the resolve mints
  // from (#0006 Decision #26); it does not ride the fleet.
  //
  // `target` is a burn's `board.Target` ({cell} | {featureId}), NOT a bare
  // coordinate — it was mistyped as a coordinate before the polar migration
  // (fleet/service.go:331 has always put a Target here).
  params?: {
    systemId?: string
    origin?: Cell
    target?: Target
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
