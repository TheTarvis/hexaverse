package fleet

import (
	"hexaverse/common"
	"hexaverse/space"
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

// JumpTransit is fleet-owned lane-transit state (migrate-fleet-to-continuous-
// burns, design.md Decision 4) — deliberately NOT a space.ShipState shape,
// since a fleet crossing a lane has no position in either system
// (fleet-movement MODIFIED "Effective Position Resolution": "A fleet mid-jump
// reports no position in either system"). Non-nil only while the fleet is
// mid-jump; cleared on arrival.
type JumpTransit struct {
	LaneId       string             `json:"laneId" firestore:"laneId"`
	DestSystemId string             `json:"destSystemId" firestore:"destSystemId"`
	DepartMs     common.WorldMillis `json:"departMs" firestore:"departMs"`
	ArriveMs     common.WorldMillis `json:"arriveMs" firestore:"arriveMs"`
}

// ScanWindow is fleet-owned focused-scan state (replace-observation-with-
// sightings design.md Decision 11), mirroring JumpTransit's own shape and
// lifecycle: non-nil only while a sweep is running, cleared at resolve and
// at cancel. HostId is the swept target; DepartMs/ArriveMs are the
// committed sweep window — depart is always the commit world time, never a
// value short of the full sweep, so the emission interval, the masking
// break, and the action's own ETA are the same interval end to end
// (focused-scan "Sweep Duration Scales With Range to the Target"). Range is
// the commit-time distance to the host, frozen at commit — the input the
// sweep's own emission radius derives from (disclosure.ScanWindow.Range).
type ScanWindow struct {
	HostId   string             `json:"hostId" firestore:"hostId"`
	DepartMs common.WorldMillis `json:"departMs" firestore:"departMs"`
	ArriveMs common.WorldMillis `json:"arriveMs" firestore:"arriveMs"`
	Range    float64            `json:"range" firestore:"range"`
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

	// State is the fleet's kinematic mode — burn | park | drift
	// (migrate-fleet-to-continuous-burns, design.md Decision 4). Position is
	// ALWAYS space.StatePosition(bodies, f.State, now) (tasks.md 3.7); no
	// other code path may re-derive, cache, or round it.
	//
	// Never persisted directly: backend/space carries zero firestore tags by
	// design (its own purity test asserts this), so a bare space.ShipState in
	// this struct would serialize under raw Go field names and silently
	// disagree with a real Firestore round trip (design.md Decision 21C item
	// 3). StateDoc is what actually crosses the boundary — see
	// EncodeKinematicState/DecodeKinematicState (tasks.md 3.6).
	State space.ShipState `json:"state" firestore:"-"`
	// StateDoc is State's persisted, storage-native form (the discriminated
	// `{"mode": ..., "value": ...}` shape EncodeKinematicState/
	// DecodeKinematicState define). Nothing outside those two functions and
	// this package's DAO constructs or reads it directly.
	StateDoc map[string]any `json:"-" firestore:"state,omitempty"`

	// AttachedTo is the id of the host this fleet is docked to (a body, a
	// station, a gate, later a carrier), empty when free-flying. It is a
	// RELATIONSHIP, not a kinematic mode — space.ShipState stays the only
	// answer to "where" (design.md Decision 13).
	//
	// LINK 6 (re-express-economy-positions) redefines what a valid host is
	// and deletes whatever it must. Nothing about this field is permanent.
	AttachedTo string `json:"attachedTo,omitempty" firestore:"attachedTo,omitempty"`

	// Jump is non-nil only while the fleet is crossing a lane; see
	// JumpTransit's own doc comment for why this is not a space.ShipState
	// shape.
	Jump *JumpTransit `json:"jump,omitempty" firestore:"jump,omitempty"`

	// ActiveActionId is the MOVEMENT channel's single-slot guard (#0005, #0006
	// Decision #19): at most one running burn/mine (mine shares this channel,
	// never a dedicated one). Claimed at commit, released at resolve/cancel —
	// both transactionally, inside the action domain.
	ActiveActionId string `json:"activeActionId,omitempty" firestore:"activeActionId,omitempty"`
	// ActiveScanId is the SENSOR channel's slot: independent of the movement
	// channel above (a burning fleet can scan). DECLARED AND UNWRITTEN by this
	// change (design.md Open Question 4; fleet-movement "Single Kinematic-
	// State Fleet Record" — "the sensor channel persists declared and
	// unwritten") — chain link 5 (replace-observation-with-sightings) is the
	// first change to claim it, with the focused scan verb.
	ActiveScanId string `json:"activeScanId,omitempty" firestore:"activeScanId,omitempty"`
	// Scan is non-nil only while a focused scan is running, mirroring Jump's
	// own lifecycle (replace-observation-with-sightings design.md Decision
	// 11) — claimed on the ActiveScanId channel at commit, cleared at
	// resolve and at cancel.
	Scan *ScanWindow `json:"scan,omitempty" firestore:"scan,omitempty"`

	// Ships is the fleet's roster (#0010 "Fleet Ship Composition"). A fleet
	// document written before this capability shipped carries no stored Ships
	// field and MUST be read as one default ClassSeed hull — never as an empty
	// roster (Migration Plan; the "pre-existing fleet with no stored roster"
	// scenario). Every derived-capacity/rate helper (roster.go) owns this
	// fallback; Ships itself is never defaulted in-place by a raw Firestore
	// decode.
	Ships []ShipEntry `json:"ships,omitempty" firestore:"ships,omitempty"`
	// Cargo is the fleet-level held-resource pool (#0010 "Fleet Cargo Pool") —
	// one pool, no per-ship allocation, credited only by mine's resolve.
	// Since add-fuel-as-cargo, the reserved kind "fuel" also lives here —
	// mined by no verb, sold by none, mutated only by a burn commit's debit,
	// a discard's refund, spawn's starting grant, and the refuel verb's
	// credit (fleet-movement "Fleet Cargo Pool").
	Cargo map[string]float64 `json:"cargo,omitempty" firestore:"cargo,omitempty"`
	// BurnFuelCostTons is the fuel cost, in tons, ACTUALLY DEBITED at the
	// commit of the burn currently stored in State (add-fuel-as-cargo,
	// fleet-movement "The refund is symmetric with the original debit's
	// stored cost, not a re-derivation from the roster at discard time").
	// Written at commit alongside the burn itself; read (never re-derived)
	// by every discard path to compute the closed-form partial refund.
	// Meaningful only while State.Mode == ModeBurn — a stale value left
	// over once the fleet parks or drifts is simply never read again.
	BurnFuelCostTons float64            `json:"-" firestore:"burnFuelCostTons,omitempty"`
	CreatedAt        common.WorldMillis `json:"createdAt" firestore:"createdAt"`
	UpdatedAt        common.WorldMillis `json:"updatedAt" firestore:"updatedAt"`

	// StrandingWarning is a TRANSIENT, never-persisted signal (add-fuel-as-
	// cargo, fleet-movement "A Burn Commit Warns, But Does Not Block, When
	// It Would Leave the Fleet Unable to Reach a Station or Gate") — set by
	// OrderTo/Stop right before returning, read by the HTTP handler to add
	// the commit-response-only `strandingWarning` field. Never round-trips
	// through Firestore (json:"-" firestore:"-"), so an ordinary read (which
	// never calls OrderTo/Stop) always sees it false — the persistent
	// indication for an ordinary read is FuelStatus's own `stranded` field,
	// a distinct signal computed fresh on every read.
	StrandingWarning bool `json:"-" firestore:"-"`
}

// DockedTo reports the id of the host this fleet is attached to, and whether
// it is attached at all (design.md Decision 13; mirrors mine/market's
// pre-migration `eff.Mode == board.ModeDocked` check, now a one-line
// re-point for link 6 to build on).
func (f Fleet) DockedTo() (string, bool) { return f.AttachedTo, f.AttachedTo != "" }

// OrderRequest is the body of POST /v1/fleets/:id/orders — a burn ordered to
// a body id or an explicit point, with an optional commanded acceleration
// (design.md Decision 4, 9). Exactly one of BodyId/Point is meaningful for an
// in-system burn; LaneId names a jump (chain link 4 section 5's own verb) and
// is not validated by OrderTo.
type OrderRequest struct {
	BodyId string      `json:"bodyId,omitempty"`
	Point  *space.Vec3 `json:"point,omitempty"`
	LaneId string      `json:"laneId,omitempty"`
	// Accel is the optional commanded acceleration (design.md Decision 9).
	// Omitted (nil), it defaults to the fleet's configured acceleration —
	// the roster-derived ceiling is chain link 4 section 4's own job
	// (ClassStats.Accel / DerivedAccelCeiling do not exist yet).
	Accel *float64 `json:"accel,omitempty"`
}

// JumpRequest is the body of POST /v1/fleets/:id/jump — a single-hop lane
// crossing, distinct from OrderRequest's in-system burn shape (design.md
// Decision 10; fleet-movement "Lane Jump From a Docked Gate").
type JumpRequest struct {
	LaneId string `json:"laneId"`
}

// ScanRequest is the body of POST /v1/fleets/:id/scan — a focused sweep of
// a body or an own fleet in the scanning fleet's own system (focused-scan
// "A Focused Sweep Commits On the Sensor Channel").
type ScanRequest struct {
	HostId string `json:"hostId"`
}
