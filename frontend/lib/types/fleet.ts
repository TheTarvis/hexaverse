// Fleet domain types (spec #0004/#0007) — the wire shape of the fleet reads the
// hex board consumes.
//
// A fleet carries one movement field with three shapes (coast | burn | docked)
// and its live `position` computed server-side at `worldTime`. `state` and
// `position` are `MovementState`/`Hex` straight from `lib/hex` — the same math
// the client re-evaluates for animation and the move preview — so the wire shape
// IS the renderer shape (no wire→renderer adaptation, cf. system-board).
//
// The list read (`GET /v1/fleets?systemId=`) is already fogged server-side: it
// returns the requester's own units plus any foreign fleet inside their live
// sensor union (audience fog, #0006). No unsensed foreign ever reaches here.

import type { Hex, MovementState } from '@/lib/hex'

export interface Fleet {
  id: string
  corporationId: string
  systemId: string
  state: MovementState
  // The live hex the server computed at `worldTime`; the client re-derives it
  // from `state` for frame-by-frame animation.
  position: Hex
  // Whether the requester owns this fleet (may drive it, sees its committed path).
  // A foreign fleet's `state` is a snapshot — mode + position, no path or ETA.
  own: boolean
  worldTime: number
}

// The `GET /v1/fleets?systemId=` (or `?mine=true`) envelope — the fogged fleet
// layer. `mine=true` returns the requester's own fleets across systems (transit
// included), for the galaxy view.
export interface FleetList {
  fleets: Fleet[]
  worldTime: number
}

// RoutePreview is `GET /v1/fleets/:id/route?systemId=` — the shortest-time lane
// route to a destination system with per-leg + total ETA, shown before committing
// a trip (#0008). `route` is the systemId chain [origin, …, dest]; `legEtas[i]` is
// the world time the fleet reaches `route[i]` (legEtas[0] = the departure gate ETA).
export interface RoutePreview {
  route: string[]
  legEtas: number[]
  totalEta: number
  departGate: { q: number; r: number }
  worldTime: number
}
