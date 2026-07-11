package corporations

import (
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
)

// Corporation is the player entity (#0009) — the auth-account-linked lineage of
// an uploaded mind. Fleets reference it as owner (fleet.CorporationId); the
// per-Corporation fog store is keyed by its id. The lineage lives while ≥1 fleet
// lives and dies with the last (DiedAt), then is read-only history; a restart
// mints a NEW corporation for the same account.
type Corporation struct {
	Id string `json:"id" firestore:"id"`
	// AccountId is the Firebase auth account. One LIVING corp per account — the
	// account→corp pointer (see dao.go) enforces uniqueness; a dead corp keeps
	// its accountId as history.
	AccountId string             `json:"accountId" firestore:"accountId"`
	Name      string             `json:"name" firestore:"name"`
	CreatedAt common.WorldMillis `json:"createdAt" firestore:"createdAt"`
	// DiedAt is set when the corp's last fleet is destroyed; settable only at zero
	// fleets (the death invariant). Zero ⇒ living. No slice code path reaches it —
	// nothing destroys a fleet yet — but the rule ships so combat inherits it.
	DiedAt common.WorldMillis `json:"diedAt,omitempty" firestore:"diedAt,omitempty"`
}

// Living reports whether the corporation still has its lineage (no death stamp).
func (c *Corporation) Living() bool { return c.DiedAt == 0 }

// SpawnRequest is the body of POST /v1/corporations — the wake-up call. Name is
// the only input; everything else (site, hull, fog) is server-decided.
type SpawnRequest struct {
	Name string `json:"name"`
}

// SpawnResult is a successful wake: the corporation (new, or the existing living
// one on an idempotent re-call), its one hull, and the home system it woke in.
// The client lands on the galaxy view centered on HomeSystem.
type SpawnResult struct {
	Corporation Corporation        `json:"corporation"`
	Fleet       *fleet.Fleet       `json:"fleet"`
	HomeSystem  *galaxy.System     `json:"homeSystem"`
	WorldTime   common.WorldMillis `json:"worldTime"`
}
