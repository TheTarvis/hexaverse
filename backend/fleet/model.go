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
	// ActiveActionId is the single-action-slot guard (#0005): a fleet holds at
	// most one running action (its burn). Claimed at commit, released at
	// resolve/cancel — both transactionally, inside the action domain.
	ActiveActionId string             `json:"activeActionId,omitempty" firestore:"activeActionId,omitempty"`
	CreatedAt      common.WorldMillis `json:"createdAt" firestore:"createdAt"`
	UpdatedAt      common.WorldMillis `json:"updatedAt" firestore:"updatedAt"`
}

// OrderRequest is the body of POST /v1/fleets/:id/orders — a target hex OR a
// feature to intercept (exactly one).
type OrderRequest struct {
	Target board.Target `json:"target"`
}
