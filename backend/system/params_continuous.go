package system

// Continuous-space tuning constants (openspec add-orbital-system-bodies,
// design.md Decisions 2-7, 11, 16). Every value here is a placeholder feel
// dial in the sense every constant in that design is — but several of them
// back BY-CONSTRUCTION PROOFS, not mere calibration: moving one of the
// flagged constants in isolation turns a proof this package's tests rely on
// into a falsehood, silently, with no failing test at the point of the edit
// (the failure would surface later, in a generated body sitting inside its
// own star's clearance shell, or a gate inside the planetary disk). Each
// flagged constant's comment names the exact proof it backs.

import "hexaverse/space"

// BaseOrbitRadius is the smallest continuous radius any star-parented body
// can receive (`ContinuousRadius(0)`). PROOF-BACKING: it is the left-hand
// side of four inequalities that TestCalibration_* (continuous_test.go) and
// TestMoonOrbitLocalRadius_Scenario_BandCeilingBelowBaseOrbitRadius assert
// directly, and moving it without re-checking all four turns a passing
// build into an unsound one:
//  1. BaseOrbitRadius > disclosure.PassiveRange (12) — a fleet's passive
//     detection range never reaches even the innermost orbit.
//  2. BaseOrbitRadius > disclosure.PlumeFloor (20) — the degenerate
//     single-body-at-index-0 system (MinBodies=1, distinctRings can return
//     {0}) still clears the plume floor; at the old value of 20.0 this was
//     an equality, which fails the requirement's strict ">" outright.
//  3. space.StarClearanceRadius(max(StarSize table)) < BaseOrbitRadius — no
//     generated body ever sits inside its own star's burn-clearance shell.
//  4. The moon-orbit band's ceiling (maxGiantSize + InsertionStandoff +
//     MoonOrbitMax = 21.0) is strictly less than BaseOrbitRadius (24.0), so
//     a moon can never reach the next star-parented orbit.
const BaseOrbitRadius float64 = 24.0

// RadiusGrowth is ContinuousRadius's per-orbital-index geometric multiplier.
// PROOF-BACKING: TestCalibration_Scenario_BeltWidthJitterNeverReachesNextIndex
// asserts `1 + BeltWidthFraction/2 < RadiusGrowth` (1.03 < 1.23) — the
// inequality that keeps a belt's member jitter from ever reaching the next
// orbital index's radius, which is what makes SystemInterior.Extent a
// genuine by-construction ceiling over every belt member rather than a
// checked one. Moving RadiusGrowth down (or BeltWidthFraction up) without
// re-verifying this inequality reopens that hole silently.
const RadiusGrowth float64 = 1.23

// MinOrbitSpacing is deliberately exactly RadiusGrowth, per design.md
// Decision 2: adjacent skeleton ordinals differ by at least 1, so no larger
// multiple is assertable as a general minimum-spacing bound.
const MinOrbitSpacing = RadiusGrowth

// KeplerBaseRadius / KeplerBaseSeconds parameterize the star-parented Kepler
// period law (design.md Decision 3): keplerSeconds(r) = KeplerBaseSeconds *
// (r/KeplerBaseRadius) * sqrt(r/KeplerBaseRadius) — the PoC's
// `40*(r/40)^1.5` with math.Pow algebraically eliminated.
const (
	KeplerBaseRadius  float64 = 40.0
	KeplerBaseSeconds float64 = 40.0
)

// StationStandoff is the station's own clearance term beyond its parent's
// size-ceiling insertion shell (design.md Decision 6).
const StationStandoff float64 = 1.5

// StationFallbackRadius is the star-parented radius a station falls back to
// when its system's skeleton is empty (unreachable today: MinBodies=1).
// PROOF-BACKING: TestStationFallbackRadius_Scenario_ClearsStarShellAndStaysInsideExtent
// asserts it sits strictly between space.StarClearanceRadius(max(StarSize))
// (19.0) and the interior's Extent (658.7) — chosen with generous headroom
// on both sides so a future StarSize/BaseOrbitRadius retune has slack
// before this constant needs to move too.
const StationFallbackRadius float64 = 40.0

// MoonOrbitMin / MoonOrbitMax bound a body-parented child's local-radius
// band beyond its parent's own clearance (design.md Decision 16):
// localRadius = parentSize + InsertionStandoff(parent) + MoonOrbitMin +
// u*(MoonOrbitMax-MoonOrbitMin). PROOF-BACKING: over the shipped gas-giant
// size band [3.4, 4.2] (the only family moons ride, generator.go's
// giantIDs), this band's floor is 15.0 and its ceiling is 21.0 —
//   - Floor (15.0) is strictly ABOVE the station's local radius at the same
//     parent type (14.5, Decision 6) — a station is deliberately inside
//     every moon of its host, and this is the inequality that makes that
//     true rather than incidental.
//   - Ceiling (21.0) is strictly BELOW BaseOrbitRadius (24.0) — see
//     BaseOrbitRadius's own doc, invariant #4 — which is what keeps a
//     moon's distance from the star always inside Extent.
//
// Moving MoonOrbitMax up without re-checking against BaseOrbitRadius (or
// moving StationStandoff's resulting 14.5 up without re-checking against
// this floor) breaks one of these silently.
const (
	MoonOrbitMin float64 = 4.0
	MoonOrbitMax float64 = 8.0
)

// BeltWidthFraction is the proportional (not absolute) full-width a belt's
// annulus spans, relative to its own base radius (design.md Decision 5).
// PROOF-BACKING: see RadiusGrowth's doc — this is the other half of the
// `1 + BeltWidthFraction/2 < RadiusGrowth` inequality
// TestCalibration_Scenario_BeltWidthJitterNeverReachesNextIndex asserts.
const BeltWidthFraction float64 = 0.06

// AsteroidsPerBelt is the number of derived member bodies one belt feature
// synthesizes (design.md Decision 5). A code constant, not data: changing it
// changes every belt's member ids retroactively (flagged forward to link 6
// in design.md's Risks).
const AsteroidsPerBelt int = 8

// BeltMemberSizeMin / BeltMemberSizeMax bound a belt member's independently
// drawn size (design.md Decisions 4/5 — the PoC's asteroid band).
const (
	BeltMemberSizeMin float64 = 0.3
	BeltMemberSizeMax float64 = 0.9
)

// BeltFeatureSize is the belt feature's OWN size (not a member's) — constant,
// never drawn (design.md Decision 4).
const BeltFeatureSize float64 = 0.9

// StationSize is the station's own size — constant, never drawn (design.md
// Decision 4, the PoC's own value).
const StationSize float64 = 0.9

// GateSize is a lane gate's named, strictly positive size (design.md
// Decisions 4/7) — a gate is manufactured and identical everywhere; its size
// exists to give docking a standoff, not to describe an object.
const GateSize float64 = 1.2

// GateRadiusFactor scales a system's continuous Extent up to the radius
// every one of its lane gates sits at (design.md Decision 7):
// gateRadius = Extent * GateRadiusFactor. PROOF-BACKING: because every
// generated body's star-frame radius is <= Extent by Decision 2's
// construction (every family's orbital index is <= params.Radius; belt
// members bounded by the BeltWidthFraction/RadiusGrowth inequality above;
// body-parented children bounded by the MoonOrbitMax/BaseOrbitRadius
// inequality above), any GateRadiusFactor > 1 keeps every gate strictly
// outside the whole planetary disk with no per-body check required. Moving
// it to <= 1 (or moving Extent's own upper bound without re-deriving this
// factor) reopens the "station on the gate ring" defect class in continuous
// terms.
const GateRadiusFactor float64 = 1.1

// MaxInclinationJitter is the configured ceiling on the tilt jitter applied
// on top of a feature's prograde/retrograde side (design.md Decisions 1/17).
// Must stay strictly less than SubTurn/8 (system-interior: the prograde and
// retrograde bands must never touch or overlap) —
// TestInclinationConvention_Scenario_JitterBelowQuarterTurnBoundary asserts
// this directly.
const MaxInclinationJitter space.SubTurns = space.SubTurn / 32

// continuousStreamSalt is the distinct constant that seeds the second
// (continuous) RNG stream's splitmix64 finalizer (design.md Decision 11) —
// distinct from DominantOrbitDirection's own entry constant and from
// stations.mix64's, so the two streams' finalizers never coincidentally
// agree.
const continuousStreamSalt uint64 = 0x5CE1_A57E_0F17_C0DE
