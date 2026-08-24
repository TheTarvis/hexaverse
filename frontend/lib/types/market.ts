// Market types (spec #0011) — the NPC trading station, its demand, and the sell
// verb. Mirrors the backend's `market` and `stations` DTOs.
//
// The resolving principle: bytes move instantly, mass moves in a hold. Credits
// and prices are information and transmit galaxy-wide with zero travel time;
// goods exist only in a fleet's hold, and a trade settles only where they are.

import type { ResourceKind } from '@/lib/types/system-board'

// Where a demand entry came from. The floor is modelled as an ENTRY, not a
// separate field or a fallback branch — which is what lets a future player
// exchange join the same list without forking this contract.
export type DemandSource = 'request' | 'floor'

// One uniform offer to buy at a venue: "I'll take up to remainingQuantity tons
// at unitPrice."
//
// Deliberately NOT split into `floor` + `requests` as two differently-typed
// fields: consumers render one ordered list and never branch on which kind of
// demand they're looking at.
export interface DemandEntry {
  unitPrice: number
  source: DemandSource
  // Absent/unused when `unlimited` is true — the floor never runs out.
  remainingQuantity?: number
  unlimited?: boolean
  // Identifies the underlying NPC request, so settlement knows which to
  // decrement. Absent for the floor.
  requestId?: string
}

// One venue's demand for one resource kind, price-descending with the floor last.
export interface Quote {
  kind: ResourceKind
  entries: DemandEntry[]
}

// Every quote at one venue.
//
// `venue` is an OPAQUE scope key. It happens to equal `systemId` today; no
// consumer may interpret it as one, so a later global or regional order book can
// key onto the same shape.
export interface VenueQuotes {
  venue: string
  systemId: string
  quotes: Quote[]
  // NOTE: no ownerCorpId, by design. The board carries market data, never who
  // owns what — the field is absent entirely rather than shipped as null.
}

// GET /v1/market/board — every visible station's live quotes.
export interface MarketBoard {
  venues: VenueQuotes[]
  worldTime: number
  // The stated freshness contract: the client polls at this cadence, and a price
  // up to this stale is acceptable for a decision that itself costs minutes of
  // travel to act on.
  refreshCadenceMs: number
}

// A system's trading station. GET /v1/systems/:systemId/station
export interface Station {
  systemId: string
  // Absent for an NPC station. Present from day one so player ownership is a
  // value change later, never a schema retrofit.
  ownerCorpId?: string
  orbit: {
    ring: number
    angle0: number
    period: number
    dir: number
  }
  // How a burn order names the station within its own system's board. System-
  // scoped and NOT globally unique — never use it as a venue key.
  featureId: string
  createdAt: number
}

// POST /v1/fleets/:fleetId/sell
export interface SellRequest {
  featureId: string
  kind: ResourceKind
  tons: number
  // Client-generated per user-initiated attempt (a UUID), reused across
  // transport retries of THAT attempt. A sale claims no action slot, so it
  // inherits none of the action spine's retry safety — this key is the only
  // thing standing between a lost response and a double sale.
  operationKey: string
  // The two optional slippage guards. OPTIONAL, never defaulted to 0: an
  // omitted guard must be genuinely absent, because 0 matches no positive price
  // and would reject every sale from a client that simply didn't opt in.
  expectedUnitPrice?: number
  minTotalProceeds?: number
}

// One portion of a settled sale — the tonnage that went to one demand entry and
// what it earned. Reported per portion so a split fill stays legible instead of
// collapsing into one blended number.
export interface Fill {
  requestId?: string
  source: DemandSource
  unitPrice: number
  tons: number
  // Already rounded down to whole credits, per portion.
  proceeds: number
}

// A settled sale. No action id and no ETA: selling is instant, not an action.
export interface SellResult {
  fills: Fill[]
  totalProceeds: number
  cargo: Record<string, number>
  balance: number
  worldTime: number
}
