// Package space (backend/space) does not exist yet — openspec change
// add-space-kinematics, TDD red phase. Every *_test.go file in this
// directory is written by the SDET BEFORE any production .go file exists;
// the compile failure (undefined: space.X) is the correct initial red
// state. No non-test .go file is added by this handoff.
//
// ============================================================================
// ASSUMED API CONTRACT
// ============================================================================
// tasks.md section 1 names the files and the broad shape of each package
// member; design.md's Decisions pin the algorithms and a few literal
// signatures (Decision 3's PhaseIndexOf semantics, Decision 4's
// []float64{x,y,z} / int64 wire shapes, Decision 10's derivation order).
// Neither document pins every Go signature byte-for-byte (return-value
// shape for step/round counts, exactly how a body/orbit/park struct's
// fields are named, whether star-clearance is a parameter or resolved
// internally). Where a signature was not pinned, this test suite fixes ONE
// concrete choice below so the tests compile into a single coherent
// contract; per the SDET protocol this choice *is* the contract until the
// orchestrator adjudicates a developer's dispute in the developer's favor
// (the two-clause exception: spec changed, or a test provably misreads the
// spec — never "inconvenient to implement").
//
// Vec3 — vec.go (tasks.md 1.1):
//
//	type Vec3 struct { X, Y, Z float64 }
//	func (v Vec3) Add(o Vec3) Vec3
//	func (v Vec3) Sub(o Vec3) Vec3
//	func (v Vec3) Scale(s float64) Vec3
//	func (v Vec3) Dot(o Vec3) float64
//	func (v Vec3) Cross(o Vec3) Vec3
//	func (v Vec3) Length() float64
//	func (v Vec3) Normalize() (Vec3, bool) // ok=false below a small-length epsilon
//
// SubTurns / PhaseIndexOf — turn.go (tasks.md 1.2, design.md Decision 3):
//
//	type SubTurns int64
//	const SubTurn SubTurns = 1 << 20
//	const DefaultPhaseIndex SubTurns = 0 // the fixed, documented default for a degenerate (zero) offset
//	func PhaseIndexOf(offset Vec3) (idx SubTurns, steps int) // steps is always 20; offset's horizontal (X,Z) plane is what's resolved
//
// Orbit — orbit.go (tasks.md 1.5):
//
//	type Orbit struct {
//	    ParentId    string
//	    Radius      float64
//	    PeriodMs    common.WorldMillis
//	    Phase       SubTurns
//	    Inclination SubTurns
//	    Node        SubTurns
//	}
//	func (o Orbit) PhaseAt(t common.WorldMillis) SubTurns   // the raw advanced index before inclination/node rotation
//	func (o Orbit) LocalPosition(t common.WorldMillis) Vec3
//	func (o Orbit) LocalVelocity(t common.WorldMillis) Vec3
//
// Body / Bodies — body.go (tasks.md 1.6):
//
//	type Body struct {
//	    Id    string
//	    Size  float64
//	    Orbit *Orbit // nil => parentless (the star), positioned at the origin
//	}
//	type Bodies interface { Body(id string) (Body, bool) }
//	var ErrUnknownBody error
//	var ErrBodyCycle error
//	func Position(bodies Bodies, id string, t common.WorldMillis) (Vec3, error)
//	func Velocity(bodies Bodies, id string, t common.WorldMillis) (Vec3, error)
//
// Curve — curve.go (tasks.md 1.7):
//
//	type Curve struct { P0, C1, C2, C3, C4, P5 Vec3 } // QUINTIC since design.md Decision 11
//	func (c Curve) Point(u float64) Vec3
//	func (c Curve) Derivative(u float64) Vec3 // raw (non-unit) analytic Bernstein derivative
//	func (c Curve) ArcTable() [65]float64     // cumulative chord sums at 64 equal parameter steps; [0]==0
//	func (c Curve) Length() float64           // == ArcTable()[64]
//	func (c Curve) ArcParam(frac float64) (u float64, steps int) // fixed six-step binary search; steps is always 6
//
// Target — shared by Burn/BuildCurve/SolveBurn (tasks.md 1.8, "Targeting
// Names a Body or an Explicit Point"), mirroring board.Target's
// exactly-one-of-two-fields idiom (backend/board/ship.go):
//
//	type Target struct {
//	    BodyId string // non-empty => body target
//	    Point  *Vec3  // non-nil => explicit point target
//	}
//
// Burn — burn.go (tasks.md 1.8):
//
//	type Burn struct {
//	    Origin         Vec3
//	    Target         Target
//	    Intercept      Vec3
//	    Curve          Curve
//	    Length         float64
//	    DepartMs       common.WorldMillis
//	    ArriveMs       common.WorldMillis
//	    Accel          float64
//	    InsertionPhase SubTurns // meaningful only when Target.BodyId != ""
//	}
//	func (b Burn) Position(t common.WorldMillis) Vec3
//	func (b Burn) Tangent(t common.WorldMillis) Vec3   // unit vector
//	func (b Burn) Speed(t common.WorldMillis) float64
//	func (b Burn) Progress(t common.WorldMillis) float64 // fraction of arc length covered, clamped [0,1]
//	func (b Burn) BeforeFlip(t common.WorldMillis) bool
//	func (b Burn) DeltaV() float64
//
//	var ErrArcTooShort error           // curve length below the configured minimum (space/params.go)
//	var ErrEndpointInsideClearance error // origin or intercept at/inside the star-clearance radius
//
//	type CurveResult struct {
//	    Curve          Curve
//	    Intercept      Vec3
//	    InsertionPhase SubTurns
//	}
//	// starClearance is the resolved clearance radius (see StarClearanceRadius below) — BuildCurve/
//	// SolveBurn take it explicitly rather than resolving "the star" internally, since this package's
//	// only notion of "the star" is "whatever parentless body sits at the origin" and there is no
//	// dedicated accessor for it on Bodies.
//	func BuildCurve(bodies Bodies, from Vec3, target Target, arriveMs common.WorldMillis, departDir *Vec3, starClearance float64) (CurveResult, error)
//
//	type SolveResult struct {
//	    Burn   Burn
//	    Rounds int
//	}
//	func SolveBurn(bodies Bodies, from Vec3, target Target, departMs common.WorldMillis, accel float64, departDir *Vec3, starClearance float64, rounds int) (SolveResult, error)
//
// Park — park.go (tasks.md 1.9):
//
//	type ParkKind int
//	const ( ParkOrbit ParkKind = iota; ParkStationkeep; ParkPoint )
//	type Park struct {
//	    Kind     ParkKind
//	    BodyId   string  // orbit, stationkeep
//	    Radius   float64 // orbit
//	    PeriodMs common.WorldMillis // orbit
//	    Phase    SubTurns // orbit
//	    EpochMs  common.WorldMillis // orbit
//	    Offset   Vec3    // stationkeep
//	    Point    Vec3    // point
//	}
//	func (p Park) PhaseAt(t common.WorldMillis) SubTurns // orbit kind only
//	func (p Park) Position(bodies Bodies, t common.WorldMillis) (Vec3, error)
//	func (p Park) Velocity(bodies Bodies, t common.WorldMillis) (Vec3, error)
//
//	func InsertionStandoff(body Body) float64                  // documented per-body function
//	func InsertionPeriod(radius float64) common.WorldMillis    // documented function of the standoff radius
//	func StationKeepRate(bodies Bodies, bodyId string) (float64, error)
//	func StationKeepUpkeep(rate float64, fromMs, toMs common.WorldMillis) float64
//	const StationKeepFloor float64 = <placeholder, space/params.go>
//	const MinOrbitRadius float64 = <placeholder, space/params.go>
//	func ReleaseStationkeep(bodyId string, offset Vec3, releaseMs common.WorldMillis) Park
//	func StarClearanceRadius(starSize float64) float64
//	const MinArcLength float64 = <placeholder, space/params.go> // referenced symbolically only, never a hardcoded number in this suite
//
// ShipState / StateAt — state.go (tasks.md 1.10), mirroring
// backend/board/ship.go's StateAt(priorState, t, schedule) MovementState shape:
//
//	type ShipMode int
//	const ( ModeBurn ShipMode = iota; ModeParked )
//	type ShipState struct {
//	    Mode ShipMode
//	    Burn *Burn // set iff Mode == ModeBurn
//	    Park *Park // set iff Mode == ModeParked
//	}
//	func StateAt(bodies Bodies, s ShipState, t common.WorldMillis) (ShipState, error)
//	func StatePosition(bodies Bodies, s ShipState, t common.WorldMillis) (Vec3, error)
//
// Codec — params.go (tasks.md 1.11, design.md Decision 4 — the []float64/int64
// shapes are pinned literally by the design text, not an SDET choice):
//
//	func EncodeVec(v Vec3) []float64
//	func DecodeVec(v any) (Vec3, error)
//	func EncodeSubTurns(a SubTurns) int64
//	func DecodeSubTurns(v any) (SubTurns, error)
//	var ErrNonFiniteCoordinate error
//	var ErrCoordinateOutOfExtent error
//
// ============================================================================
package space

import (
	"math"
	"testing"

	"hexaverse/common"
)

// --- shared tolerances --------------------------------------------------
//
// The spec pins exact tolerances in a few places (1e-9 for the prograde dot
// product; "strictly greater than 0.95" for tangent alignment; bit-identical
// via == for arrival continuity). Everywhere else, this suite states its own
// tolerance explicitly and clearly, per the harness instructions, because the
// spec has not pinned one (design.md Open Questions: the tangent-alignment
// *measured* value and the minimum-arc-length value are still open; this
// suite never guesses at those numbers, only at generic floating-point slop
// from evaluating the same closed-form expression through two different call
// paths).

// looseTolerance is an SDET-chosen (not spec-pinned) absolute tolerance for
// comparing two independently-derived float64 values that the spec does not
// require to be bit-identical (e.g. a distance computed via the pinned
// trig table vs. a nominal radius). Generous relative to the 2^-20-turn
// table resolution design.md Decision 3 documents (~3e-6 rad => ~0.003
// units of positional granularity at radius 500).
const looseTolerance = 1e-4

// tightTolerance is an SDET-chosen (not spec-pinned) tolerance for
// comparisons that should be very close but still cross one float
// division/sqrt boundary computed independently by the test.
const tightTolerance = 1e-9

func almostEqual(a, b, tol float64) bool { return math.Abs(a-b) <= tol }

func almostEqualVec(a, b Vec3, tol float64) bool {
	return almostEqual(a.X, b.X, tol) && almostEqual(a.Y, b.Y, tol) && almostEqual(a.Z, b.Z, tol)
}

// dist is a test-local convenience wrapper: Sub then Length, both part of
// the assumed Vec3 API above.
func dist(a, b Vec3) float64 { return a.Sub(b).Length() }

// ulpsWithin reports whether a and b differ by at most n representable
// float64 steps — used for the ONE scenario that states an explicit ULP
// tolerance ("A non-zero inclination produces a genuinely three-dimensional
// path": "to within one unit in the last place of that product").
func ulpsWithin(a, b float64, n uint64) bool {
	if a == b {
		return true
	}
	ba, bb := math.Float64bits(a), math.Float64bits(b)
	// Float64bits is not monotonic across the sign boundary; both operands
	// in this suite's one ULP-tolerant scenario share a sign, so the plain
	// unsigned difference is sufficient and does not need the sign-flip
	// correction a general-purpose ULP comparator would.
	var diff uint64
	if ba > bb {
		diff = ba - bb
	} else {
		diff = bb - ba
	}
	return diff <= n
}

// --- shared fixture bodies -----------------------------------------------
//
// fakeBodies is the SDET's own tiny in-memory Bodies implementation — the
// injected interface tasks.md 1.6 specifies exists precisely so `space`
// takes bodies without minting or storing any (design.md Decision 9: "space
// owns no storage and mints no body; system/galaxy do").

type fakeBodies map[string]Body

func (f fakeBodies) Body(id string) (Body, bool) {
	b, ok := f[id]
	return b, ok
}

// testSystem is a small, deterministic three-level hierarchy (star -> planet
// -> moon) plus a second planet, reused across files: exercises the
// parent-chain composition (star at origin; planet orbits star; moon orbits
// planet) every closed-form-position scenario needs, without generation
// machinery this package explicitly does not own (design.md Non-Goals: "No
// system or galaxy generation").
func testSystem() fakeBodies {
	return fakeBodies{
		"star": {Id: "star", Size: 6, Orbit: nil},
		"planet1": {Id: "planet1", Size: 2.4, Orbit: &Orbit{
			ParentId: "star", Radius: 50, PeriodMs: 100_000, Phase: 0, Inclination: 0, Node: 0,
		}},
		// planet2 carries a non-zero inclination so the "genuinely 3D" and
		// "leaves the plane" scenarios have a body to evaluate.
		"planet2": {Id: "planet2", Size: 3.1, Orbit: &Orbit{
			ParentId: "star", Radius: 80, PeriodMs: 160_000, Phase: 0,
			Inclination: SubTurn / 24, // a modest non-zero tilt (15 degrees worth of sub-turns)
			Node:        0,
		}},
		"moon1": {Id: "moon1", Size: 0.6, Orbit: &Orbit{
			ParentId: "planet1", Radius: 6, PeriodMs: 9_000, Phase: SubTurn / 8, Inclination: 0, Node: 0,
		}},
	}
}

// cyclicBodies is a two-body mutual-parent cycle: neither body's chain ever
// reaches a parentless root. Used by the "cyclic parent chain fails" scenario.
func cyclicBodies() fakeBodies {
	return fakeBodies{
		"a": {Id: "a", Size: 1, Orbit: &Orbit{ParentId: "b", Radius: 10, PeriodMs: 1000}},
		"b": {Id: "b", Size: 1, Orbit: &Orbit{ParentId: "a", Radius: 10, PeriodMs: 1000}},
	}
}

// requireNoError is a small local helper so scenario tests read as the
// THEN, not as Go error-handling boilerplate.
func requireNoError(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

var _ common.WorldMillis // keep the common import live even if a given file in this package doesn't use it directly
