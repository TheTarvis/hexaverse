package fleet

import (
	"hexaverse/board"
	"hexaverse/common"
)

// Fleet is the map-mover — a thing at a position that can be ordered to move
// (#0004 Decision #8). A lone ship is a fleet-of-one; ship composition is
// deferred. The fleet persists across systems, carrying its current systemId,
// so it is top-level (not nested under system).
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
	// Decision #19): at most one running burn/trip. Claimed at commit, released
	// at resolve/cancel — both transactionally, inside the action domain.
	ActiveActionId string `json:"activeActionId,omitempty" firestore:"activeActionId,omitempty"`
	// ActiveScanId is the SENSOR channel's slot: at most one running scan,
	// independent of movement — a burning fleet can scan (#0006 Decision #19).
	ActiveScanId string             `json:"activeScanId,omitempty" firestore:"activeScanId,omitempty"`
	CreatedAt    common.WorldMillis `json:"createdAt" firestore:"createdAt"`
	UpdatedAt    common.WorldMillis `json:"updatedAt" firestore:"updatedAt"`
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
