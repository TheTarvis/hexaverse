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

import type { ResourceKind } from '@/lib/types/system-space'

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

// ParkKind — space.ParkKind's iota. A NAME for a wire enum, not a mirror of a
// rule: nothing here recomputes anything backend/space decides. Exported once
// (add-vitals-strip, contract §2.4) so `roster-status.ts` is not a third
// hard-coded copy alongside `FleetActionsPanel.tsx` and `space-scene.ts`.
export type ParkKind = 0 | 1 | 2
export const PARK_KIND_ORBIT: ParkKind = 0
export const PARK_KIND_STATIONKEEP: ParkKind = 1
export const PARK_KIND_POINT: ParkKind = 2

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
  // `fuel` rides this SAME map (add-fuel-as-cargo — fuel is a reserved cargo
  // kind, not a `ResourceKind`; see `lib/types/system-space.ts`), never a
  // separate field.
  cargo: Record<string, number> | null
  cargoCapacity: number
  freeHold: number
  // Summed extraction rate (tons/world-ms) — the mine ETA preview's divisor.
  miningRate: number
  // add-fuel-as-cargo (fleet-movement "Fleet Read Reports an Estimated
  // Maximum Range From Current Fuel" / "... Persistent Stranded Indication"
  // / "... Serves the Configured Fuel Price"). Always served on a real
  // owner-only read; declared OPTIONAL here (not on the wire) only so the
  // fixtures this repo already had before this capability landed keep
  // type-checking without every one of them being touched.
  estimatedRange?: number
  stranded?: boolean
  fuelPricePerTon?: number
  // add-stationkeep-hold-verb: the station-keeping upkeep rate this fleet
  // would pay (or is paying), served on BOTH park modes so the hold can be
  // priced before it is taken. Never derived client-side from a body's
  // orbital elements — `space.StationKeepRate` is rule-bearing.
  stationKeepRateTonsPerSecond?: number
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
  // The attached lane-gate body's lane id (fleet-movement "Fleet Read
  // Serves the Attached Gate's Lane Id") — derived server-side via
  // `galaxy.LaneIdBetween`, from a source neither filtered by nor derived
  // from the corporation's charted-lane set. Absent/empty when the fleet
  // is not attached to a lane-gate body.
  laneId?: string
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
  // The world clock's rate at the moment of the read. The space view falls
  // back to this when the interior read — its usual source — has failed, so
  // a mis-scaled clock never draws every orbit and burn mark wrong.
  scale?: number
  // add-fuel-as-cargo (fleet-roster "A Burn Commit's Stranding Warning Is
  // Surfaced to the Player") — ONE-SHOT, present only on a burn commit's
  // response naming the condition, never on an ordinary fleet read (which
  // carries the roster's `stranded` field instead — the persistent
  // indication).
  strandingWarning?: boolean
}

// OrderRequest — the burn-order verb's body: exactly one of a body id or an
// explicit point (fleet-movement "Order Request Validation"), with an
// optional commanded acceleration (design.md Decision 9) defaulting to the
// fleet's roster-derived ceiling when omitted.
export interface OrderRequest {
  bodyId?: string
  point?: Vec3
  accel?: number
  // The quoted fuel ceiling the player agreed to (serve-orbital-elements-
  // and-burn-preview). ABSENT means uncapped; a present 0 is a real cap that
  // rejects any positive cost, so an omitted cap must never serialize as
  // zero (`system-space-view`: *The burn stays committable without a quote,
  // labelled as uncapped*).
  maxFuelTons?: number
}

// BurnPreview — `POST /v1/fleets/:id/orders/preview`'s response: the
// server-solved curve and its figures, with nothing committed. Typed
// against the recorded wire sample
// (`backend/testdata/serve-orbital-elements-and-burn-preview/
// preview-response.json`), so the key names are the served ones. `Curve`'s
// control points are `space.Vec3`, hence the untagged capitalized keys.
export interface BurnPreview {
  controlPoints: Vec3[]
  departMs: number
  arriveMs: number
  deltaV: number
  fuelCostTons: number
  affordable: boolean
  strandingWarning: boolean
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
