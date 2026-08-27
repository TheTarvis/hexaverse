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
	// HomeSystemId is the home system of RECORD, written in the same transaction
	// as the corp doc and its spawn reservation. It is what spawn and healing
	// report as the home regardless of where the hull currently sits — and it is
	// what makes healing reuse the corporation's own committed choice instead of
	// re-running site selection (which would strand an orphaned reservation).
	HomeSystemId string `json:"homeSystemId" firestore:"homeSystemId"`
	// DiedAt is set when the corp's last fleet is destroyed; settable only at zero
	// fleets (the death invariant). Zero ⇒ living. No slice code path reaches it —
	// nothing destroys a fleet yet — but the rule ships so combat inherits it.
	DiedAt common.WorldMillis `json:"diedAt,omitempty" firestore:"diedAt,omitempty"`
	// Credits is the materialized whole-credit balance (#0011). A deliberate
	// deviation from #0005's fold-of-deltas: a credit ledger accrues forever, so
	// folding every read doesn't age well — the ledger is the record, the balance
	// is the truth, and reconciliation (credits.go) keeps that claim checkable.
	// int64, never float: whole indivisible units, no accumulated FP drift.
	// Mutated ONLY through PrepareCreditInTx/CreditPlan.Apply. Absent on a
	// pre-#0011 doc ⇒ "never granted", NOT "granted zero" — the opening grant's
	// only signal is its "spawn:"-keyed ledger entry, never Credits == 0.
	Credits int64 `json:"credits" firestore:"credits"`
	// AssetsCompleteAt stamps the moment ensureSpawnAssets confirmed ALL derived
	// assets present (hull, fog, station, opening balance). Non-zero short-circuits
	// the healing pass at entry on every later read — the marker is the only doc
	// read, no per-asset checks. Zero/absent ⇒ fall through and check each asset.
	AssetsCompleteAt common.WorldMillis `json:"assetsCompleteAt,omitempty" firestore:"assetsCompleteAt,omitempty"`
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
