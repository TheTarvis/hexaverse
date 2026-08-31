// Fleet domain types (migrate-fleet-to-continuous-burns) — the wire shape of
// the fleet reads the roster panel and the reduced board consume.
//
// A fleet's kinematic state is now `space.ShipState` (burn | park | drift),
// carried under `state`, plus two fleet-owned fields that are relationships,
// not kinematics: `attachedTo` (a dock/host id) and `jump` (non-null while
// crossing a lane) — design.md Decision 4.
//
// THE WIRE IS MIXED-CASE, ON PURPOSE. `backend/space`'s types (`ShipState`,
// `Burn`, `Park`, `Drift`, `Vec3`, …) carry NO json tags by design — the
// package's own purity test asserts it — so they serialize under bare,
// capitalized Go field names (`Mode`, `Burn`, `Park`, `Drift`, `ArriveMs`,
// `DepartMs`, …). Only `fleetDTO`'s own top-level fields
// (id/corporationId/systemId/state/attachedTo/jump/position/own/worldTime)
// and `JumpTransit`'s fields are tagged camelCase, because those are
// `fleet` package types, not `space` ones. DO NOT "clean this up" into
// uniform camelCase — it would stop matching the wire.
//
// No TypeScript mirror of `backend/space`'s curve/orbit math exists, or ever
// will (design.md Decision 1): `Burn.Curve` is carried through untyped. Any
// derivation that needs more than "is this still burning" (an ArriveMs
// comparison) is a server question, not a client one.

import type { ResourceKind } from '@/lib/types/system-board'

// Vec3 — a bare `space.Vec3`, the position/velocity/anchor primitive
// throughout `state`. Untagged (space carries no json tags).
export interface Vec3 {
  X: number
  Y: number
  Z: number
}

// BurnTarget — exactly one of a body id or an explicit point (space.Target).
export interface BurnTarget {
  BodyId: string | null
  Point: Vec3 | null
}

// Burn — a solved, in-flight order. `Curve` is the six control points in
// whatever shape the codec chose (never `[][]float64`, design.md Decision
// 15) — opaque here; nothing on the client re-walks the curve.
export interface Burn {
  Origin: Vec3
  Target: BurnTarget
  Intercept: Vec3
  Curve: unknown
  Length: number
  DepartMs: number
  ArriveMs: number
  Accel: number
  InsertionPhase: number
}

// Park — a resting state (space.ParkKind: orbit | point | stationkeep). The
// numeric `Kind` is carried through opaquely; nothing on the client branches
// on which kind it is (a status label never needs to).
export interface Park {
  Kind: number
  BodyId: string
  Radius: number
  PeriodMs: number
  Phase: number
  EpochMs: number
  Offset: Vec3
  Point: Vec3
}

// Drift — a free, unpowered straight line: anchor + velocity*(t - epoch).
export interface Drift {
  Anchor: Vec3
  Velocity: Vec3
  EpochMs: number
}

// ShipMode — space.ShipMode: 0 = burn, 1 = parked, 2 = drift.
export type ShipMode = 0 | 1 | 2

export const SHIP_MODE_BURN: ShipMode = 0
export const SHIP_MODE_PARKED: ShipMode = 1
export const SHIP_MODE_DRIFT: ShipMode = 2

// ShipState — space.ShipState: exactly one of Burn/Park/Drift is non-null,
// selected by Mode.
export interface ShipState {
  Mode: ShipMode
  Burn: Burn | null
  Park: Park | null
  Drift: Drift | null
}

// JumpTransit — fleet-owned, not a `space.ShipState` shape: a fleet in lane
// transit has no position in either system (design.md Decision 4). Tagged
// camelCase (the `fleet` package, not `space`).
export interface JumpTransit {
  laneId: string
  destSystemId: string
  departMs: number
  arriveMs: number
}

// FleetRoster is the owner-only ships/cargo/derived-stats block on fleet
// reads. Absent entirely on a foreign fleet read; but per fleet-movement
// "Fleet Read Endpoints Serve Own Fleets Only" (design.md Decision 11) a
// foreign fleet is omitted from reads outright now, not merely redacted.
export interface FleetRoster {
  ships: { class: string }[]
  // Tons held, by resource kind. Kinds the fleet holds none of are absent.
  cargo: Record<string, number> | null
  cargoCapacity: number
  freeHold: number
  // Summed extraction rate (tons/world-ms) — the mine ETA preview's divisor.
  miningRate: number
}

export interface Fleet {
  id: string
  corporationId: string
  systemId: string
  state: ShipState
  // The dock/host id this fleet is attached to, empty/absent when
  // free-flying (design.md Decision 13). A relationship, not a kinematic
  // mode — `state` stays the only answer to "where".
  attachedTo?: string
  // Non-null while crossing a lane (design.md Decision 10).
  jump?: JumpTransit
  // The fleet's live position, `space.StatePosition` resolved server-side.
  position: Vec3
  // Whether the requester owns this fleet. A foreign fleet is omitted from
  // reads entirely (design.md Decision 11) rather than sent redacted, so in
  // practice every `Fleet` reaching the client has `own: true` — the field
  // survives on the wire and is kept here rather than narrowed away.
  own: boolean
  // Owner-only roster/cargo/derived-stats block.
  roster?: FleetRoster
  worldTime: number
}

// OrderRequest — the burn-order verb's body: exactly one of a body id or an
// explicit point (fleet-movement "Order Request Validation"), with an
// optional commanded acceleration (design.md Decision 9) defaulting to the
// fleet's roster-derived ceiling when omitted.
export interface OrderRequest {
  bodyId?: string
  point?: Vec3
  accel?: number
}

// JumpRequest — the jump verb's body: the lane to cross, valid only from a
// docked, charted gate (design.md Decision 10).
export interface JumpRequest {
  laneId: string
}

// The mine verb's request/response. Commit returns the created action's id
// and its FROZEN eta — countdowns derive from this, never from a client
// pre-commit preview.
export interface MineRequest {
  featureId: string
  kind: ResourceKind
  tons: number
}

export interface MineCommit {
  actionId: string
  eta: number
  worldTime: number
}

// The `GET /v1/fleets?systemId=` (or `?mine=true`) envelope.
export interface FleetList {
  fleets: Fleet[]
  worldTime: number
}
