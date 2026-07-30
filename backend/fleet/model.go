package fleet

import (
	"hexaverse/board"
	"hexaverse/common"
)

// ShipClass names a per-class stats-table entry (mining rate, hold capacity,
// burn rate, lane rate), looked up from configuration — never stored per-ship
// (#0010 "Fleet Ship Composition"). Only ClassSeed exists in this slice; ship
// classes/build tree are a deferred non-goal (design.md Non-goals).
type ShipClass string

const (
	// ClassSeed is the one generalist hull SeedFleet places. Its per-class stats
	// (params.go) are configured to be value-preserving for a single-ship
	// roster against today's global MsPerTile/LaneMsPerDistance ("Derived Fleet
	// Speed"'s value-preservation scenario).
	ClassSeed ShipClass = "seed"
)

// ShipEntry is one hull in a fleet's roster. Ships compose the fleet's
// aggregate stats; they are never independent actors with their own movement
// state — the fleet, not the ship, is the sole mover (#0010 Decision #1).
type ShipEntry struct {
	Class ShipClass `json:"class" firestore:"class"`
}

// Fleet is the map-mover — a thing at a position that can be ordered to move
// (#0004 Decision #8). The fleet persists across systems, carrying its current
// systemId, so it is top-level (not nested under system).
type Fleet struct {
	Id string `json:"id" firestore:"id"`
	// CorporationId is carried from day one (dev-seeded until #0009), so
	// ownership enforcement in M9 is not a retrofit.
	CorporationId string `json:"corporationId" firestore:"corporationId"`
	SystemId      string `json:"systemId" firestore:"systemId"`
	// State is the single movement field — coast | burn | docked. No per-tick
	// position is stored; the live hex is computed from (State, worldTime).
	State board.MovementState `json:"state" firestore:"state"`
	// ActiveActionId is the MOVEMENT channel's single-slot guard (#0005, #0006
	// Decision #19): at most one running burn/trip/mine (#0010 Decision #9 —
	// mine shares this channel, never a dedicated one). Claimed at commit,
	// released at resolve/cancel — both transactionally, inside the action
	// domain.
	ActiveActionId string `json:"activeActionId,omitempty" firestore:"activeActionId,omitempty"`
	// ActiveScanId is the SENSOR channel's slot: at most one running scan,
	// independent of movement — a burning (or mining) fleet can scan (#0006
	// Decision #19).
	ActiveScanId string `json:"activeScanId,omitempty" firestore:"activeScanId,omitempty"`
	// Ships is the fleet's roster (#0010 "Fleet Ship Composition"). A fleet
	// document written before this capability shipped carries no stored Ships
	// field and MUST be read as one default ClassSeed hull — never as an empty
	// roster (Migration Plan; the "pre-existing fleet with no stored roster"
	// scenario). Every derived-capacity/rate helper (roster.go) owns this
	// fallback; Ships itself is never defaulted in-place by a raw Firestore
	// decode.
	Ships []ShipEntry `json:"ships,omitempty" firestore:"ships,omitempty"`
	// Cargo is the fleet-level held-resource pool (#0010 "Fleet Cargo Pool") —
	// one pool, no per-ship allocation, credited only by mine's resolve. A
	// fleet with no stored Cargo reads as empty (zero tons of every kind), which
	// needs no special-case fallback (a nil/empty map already means "holds
	// nothing").
	//
	// Keyed by the STRING form of system.ResourceKind, not the named type
	// itself (string(kind)) — the cloud.google.com/go/firestore SDK's
	// transform-extraction reflection panics on a map field keyed by a named
	// string type (confirmed against the live emulator; SDET fix, not a
	// design choice — see the handoff report). Callers convert at the
	// boundary: system.ResourceKind is still the wire/API type
	// (MineRequest.Kind, system.Resource.Kind).
	Cargo     map[string]float64 `json:"cargo,omitempty" firestore:"cargo,omitempty"`
	CreatedAt common.WorldMillis `json:"createdAt" firestore:"createdAt"`
	UpdatedAt common.WorldMillis `json:"updatedAt" firestore:"updatedAt"`
}

// OrderRequest is the body of POST /v1/fleets/:id/orders. The server picks the
// movement tier by target type: a board target (hex or feature to intercept) is
// an in-system burn (#0004); a systemId is a graph-tier trip (#0008). Exactly one
// of Target / SystemId is set.
type OrderRequest struct {
	Target   board.Target `json:"target"`
	SystemId string       `json:"systemId,omitempty"`
}

// RoutePreview is the read a client shows before committing a trip: the system
// chain and the frozen-at-commit ETAs (per leg + total), so a 3D view that can't
// be eyeballed for distance still surfaces the numbers (#0008 Decision #4).
type RoutePreview struct {
	Route      []string             `json:"route"`
	LegEtas    []common.WorldMillis `json:"legEtas"`
	TotalEta   common.WorldMillis   `json:"totalEta"`
	DepartGate board.Hex            `json:"departGate"`
	WorldTime  common.WorldMillis   `json:"worldTime"`
}
