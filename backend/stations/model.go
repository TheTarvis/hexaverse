package stations

import "hexaverse/common"

// Station is an NPC (or, later, player-owned) trading post: the one place goods
// convert to credits. Exactly one per spawn-home system (#0011) — stations exist
// nowhere else in this version.
//
// It lives in its OWN store (galaxies/{gid}/systems/{sid}/station/meta), NOT in
// the interior's feature subcollection: system.dao's CreateInterior is a
// single atomic batch write that assumes the whole feature set is known at first
// materialization, with no add-a-feature path — and a system's interior is often
// materialized (by a passing scan or an arrival) long before anyone spawns
// there, so "write it during generation" has no well-defined moment to run.
// Ownership also belongs on the entity that actually has an owner; system.Feature
// deliberately has no owner field.
type Station struct {
	// SystemId is BOTH the home system and the station's own identity: at most
	// one station exists per system, so the system id is already a unique station
	// identifier with nothing new to invent. This is the "venue" key the price
	// board and a sale settle against.
	SystemId string `json:"systemId" firestore:"systemId"`
	// OwnerCorpId is empty for an NPC station. Present from day one so player
	// ownership is a value change later, never a schema retrofit — no verb in
	// this version can set it.
	OwnerCorpId string `json:"ownerCorpId,omitempty" firestore:"ownerCorpId,omitempty"`
	// The station's ORBIT is deliberately not a field here, and no successor
	// replaces it. It orbits — it is not a fixed anchor (design.md Decision 4)
	// — but its orbital element set is DERIVED at interior-splice time from
	// (galaxy seed, system id, skeleton) by system.StationContinuousOrbit and
	// never persisted on this document. A client that needs the station's
	// position reads GET /v1/systems/:systemId, exactly as it does for every
	// other body.
	//
	// FeatureId is how a burn order names the station within its own system.
	// System-scoped and NOT globally unique — the same convention every
	// other feature id follows — so it must never be used as a venue key outside
	// its own system. Cross-capability identity is SystemId.
	FeatureId string `json:"featureId" firestore:"featureId"`
	// CreatedAt stamps provisioning.
	CreatedAt common.WorldMillis `json:"createdAt" firestore:"createdAt"`

	// Requests are the NPC's standing premium demand entries, embedded on this
	// doc (bounded, far under Firestore's 1 MB limit) so a fill decrements them
	// inside this single document's own transaction — no cross-document
	// coordination. Provisioned lazily per (station, epoch); see requests.go.
	Requests []Request `json:"requests,omitempty" firestore:"requests,omitempty"`
	// RequestEpoch is the provisioning epoch Requests were minted for. A read in
	// a later epoch re-provisions, create-if-absent.
	RequestEpoch int64 `json:"requestEpoch,omitempty" firestore:"requestEpoch,omitempty"`
	// WindowSpend / WindowAbsorbed track this window's budget and absorption
	// consumption per resource kind.
	//
	// Keyed by the STRING form of system.ResourceKind, never the named type:
	// fleet.Cargo's own doc comment records a Firestore SDK transform-extraction
	// reflection panic on a map keyed by a named string type, and a per-kind
	// tally is exactly the shape that would repeat it.
	WindowSpend    map[string]int64   `json:"windowSpend,omitempty" firestore:"windowSpend,omitempty"`
	WindowAbsorbed map[string]float64 `json:"windowAbsorbed,omitempty" firestore:"windowAbsorbed,omitempty"`
}

// Request is one NPC premium demand entry: a standing offer to buy up to
// RemainingQuantity tons of Kind at UnitPrice, above the region's floor.
type Request struct {
	Id string `json:"id" firestore:"id"`
	// Kind is the resource kind's STRING form (see WindowSpend's note).
	Kind      string `json:"kind" firestore:"kind"`
	UnitPrice int64  `json:"unitPrice" firestore:"unitPrice"`
	// RemainingQuantity is decremented at settlement, inside the station doc's
	// own transaction, so concurrent sales can never oversell it.
	RemainingQuantity float64 `json:"remainingQuantity" firestore:"remainingQuantity"`
	// ExpiresAt is when this request stops quoting and stops being fillable —
	// reported distinguishably as expired rather than exhausted.
	ExpiresAt common.WorldMillis `json:"expiresAt" firestore:"expiresAt"`
}

// Expired reports whether the request has passed its lifetime. An expired
// request with remaining quantity is NOT the same as an exhausted one, and the
// two are reported distinguishably.
func (r *Request) Expired(now common.WorldMillis) bool { return now >= r.ExpiresAt }

// Fillable reports whether the request can still absorb tonnage right now.
func (r *Request) Fillable(now common.WorldMillis) bool {
	return !r.Expired(now) && r.RemainingQuantity > 0
}

// StationFeatureId is the board feature id a station carries inside its own
// system. Stable and derived, so a burn order can name it without a store read.
const StationFeatureId = "feat-station"
