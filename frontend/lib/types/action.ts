// Action domain types (spec #0005) — the owner's read of the async spine.
// Mirrors backend action/handler.go `actionDTO`: the generic Action plus
// worldTime on every read. The live consumer is the running-mine countdown.
//
// `params.origin`/`params.target` were typed by the deleted pre-continuous
// `Cell`/`Target` coordinate pair and are gone (openspec
// build-production-space-view,
// tasks.md 10.4): both were already dead against the live wire — a burn's
// `action.Params` carries only `state`, and nothing on the client read
// either. `params` stays an open record, which is what every real reader
// uses.

export type ActionStatus = 'running' | 'done' | 'cancelled'

export interface GameAction {
  id: string
  type: string // dispatch key: 'burn' | 'lane-travel' | 'scan' | ...
  actor: string
  scope: string
  // Params are frozen at commit, per type — an open record read only by
  // the verb that wrote it.
  params?: {
    systemId?: string
  } & Record<string, unknown>
  committedAt: number
  eta: number
  status: ActionStatus
  outcome?: string
  // Widened by add-scan-and-sightings-surface (task 4.3): the resolver's
  // structured classifier (`outOfRange`, `occluded`, `leftSystem`,
  // `laneTransit`, `hostUnresolved`, `alreadySettled`, ...), served ONLY
  // when the resolver set one (`json:"reasonCode,omitempty"` server-side).
  // ANY served code is a fizzle; its absence is filed records — the client
  // never parses `outcome` prose to make that call.
  reasonCode?: string
  // When this action settled, in world milliseconds — the settled-report's
  // own tie-break key (greatest `resolvedAt` wins; ETA breaks a tie).
  resolvedAt?: number
  // Set once the player has dismissed this action's settled report, so a
  // later refetch does not report the same sweep again.
  acknowledgedAt?: number
  worldTime: number
}

export interface ActionList {
  actions: GameAction[]
  worldTime: number
}
