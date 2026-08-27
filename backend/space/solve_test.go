package space

import (
	"errors"
	"math"
	"testing"

	"hexaverse/common"
)

// space-kinematics: "Flight Time Is the Brachistochrone..." (the
// curve-vs-chord and minimum-arc-length halves), "Departure Is Tangent to
// the Ship's Actual Motion at Commit", "Arrival Is Tangent to the Target's
// Settled Motion, With No Perceptible Discontinuity", "A Burn Path Is
// Displaced Perpendicular to the Chord to Clear the Star", "Intercept
// Against a Moving Target Converges in a Fixed Number of Rounds", and
// "Targeting Names a Body or an Explicit Point, Never Requires a
// Precomputed Position".
//
// Uses BuildCurve/SolveBurn per the assumed contract in helpers_test.go,
// plus one more assumed function this file's own scenario requires
// literally ("the target's resolved position at any time equals that
// point"):
//
//	func TargetPosition(bodies Bodies, target Target, t common.WorldMillis) (Vec3, error)
//
// noStarClearance disables star-avoidance for scenarios not exercising it
// (a path that never comes within radius 0 of the origin never triggers the
// displacement branch).
const noStarClearance = 0.0

const testRounds = 8 // an SDET-chosen round count for scenarios that don't depend on the fixture-measured N (see the skipped scenario below)

func pointTarget(v Vec3) Target   { return Target{Point: &v} }
func bodyTarget(id string) Target { return Target{BodyId: id} }

// --- Flight Time Is the Brachistochrone of the Curve's Arc Length ----------

// Scenario: Curve length is never shorter than the chord, and the stored
// flight duration is the brachistochrone of the curve's ACTUAL length, not
// the chord's.
func TestSolveBurn_Scenario_CurveLengthAtLeastChordAndDurationMatchesActualLength(t *testing.T) {
	bodies := testSystem()
	from := Vec3{X: -50, Y: 0, Z: 60}
	target := pointTarget(Vec3{X: 60, Y: 0, Z: 70})
	crosswise := Vec3{X: 0, Y: 0, Z: -1}
	result, err := SolveBurn(bodies, from, target, 0, 8, &crosswise, noStarClearance, testRounds)
	requireNoError(t, err)
	b := result.Burn

	chord := dist(from, b.Intercept)
	if b.Length < chord-tightTolerance {
		t.Errorf("curve length %v is shorter than the chord %v", b.Length, chord)
	}
	// Adjudicated test defect: a 1e-6s tolerance compared the stored
	// (integer-millisecond) duration against the UNQUANTIZED brachistochrone
	// value, but "Burn Timing Quantizes to Integer World-Milliseconds by
	// Ceiling" (design.md Decision 2) mandates arriveMs = departMs +
	// ceil(flightSeconds*1000) — a rounding step that introduces up to 1ms
	// (1e-3s) of "error" by construction, three orders of magnitude looser
	// than the tolerance this test used to enforce. The precise, faithful
	// assertion is exact equality against that ceiling, not a tolerance
	// against the unquantized value at all.
	wantDurationSeconds := FlightSeconds(b.Length, b.Accel)
	wantArriveMs := QuantizeArrival(b.DepartMs, wantDurationSeconds)
	if b.ArriveMs != wantArriveMs {
		t.Errorf("stored ArriveMs = %d, want ceil(brachistochrone_seconds*1000) of the ACTUAL curve length = %d (departMs=%d, brachistochrone=%.15fs)",
			b.ArriveMs, wantArriveMs, b.DepartMs, wantDurationSeconds)
	}
}

// Scenario: A burn below the configured minimum arc length is rejected at
// commit, with no burn stored.
func TestSolveBurn_Scenario_BelowMinimumArcLengthRejected(t *testing.T) {
	bodies := testSystem()
	from := Vec3{X: 100, Y: 0, Z: 100}
	// A target a hair away from `from` produces an arbitrarily short curve —
	// below any plausible configured minimum arc length.
	target := pointTarget(Vec3{X: 100.0001, Y: 0, Z: 100})
	_, err := SolveBurn(bodies, from, target, 0, 8, nil, noStarClearance, testRounds)
	if !errors.Is(err, ErrArcTooShort) {
		t.Fatalf("err = %v, want errors.Is(err, ErrArcTooShort)", err)
	}
}

// Scenario: A burn at or above the configured minimum arc length is
// accepted and resolves normally.
func TestSolveBurn_Scenario_AtOrAboveMinimumArcLengthAccepted(t *testing.T) {
	bodies := testSystem()
	from := Vec3{X: -200, Y: 0, Z: 0}
	target := pointTarget(Vec3{X: 200, Y: 0, Z: 0}) // a long, unambiguously-above-minimum path
	result, err := SolveBurn(bodies, from, target, 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	if result.Burn.ArriveMs <= result.Burn.DepartMs {
		t.Errorf("accepted burn has non-positive duration: depart=%d arrive=%d", result.Burn.DepartMs, result.Burn.ArriveMs)
	}
}

// --- Departure Is Tangent to the Ship's Actual Motion at Commit ------------

// Scenario: A crosswise departure velocity bends the path off the chord.
func TestBuildCurve_Scenario_CrosswiseDepartureBendsPathOffChord(t *testing.T) {
	bodies := testSystem()
	from := Vec3{X: -60, Y: 0, Z: 40}
	target := pointTarget(Vec3{X: 60, Y: 0, Z: 40}) // chord along X at Z=40
	const arrive common.WorldMillis = 20_000

	straight, err := BuildCurve(bodies, from, target, arrive, nil, noStarClearance)
	requireNoError(t, err)
	crosswiseDir := Vec3{X: 0, Y: 0, Z: 1}
	curved, err := BuildCurve(bodies, from, target, arrive, &crosswiseDir, noStarClearance)
	requireNoError(t, err)

	if !(curved.Curve.Length() > straight.Curve.Length()) {
		t.Errorf("crosswise curve length %v not greater than straight curve length %v", curved.Curve.Length(), straight.Curve.Length())
	}
	mid := curved.Curve.Point(0.5)
	if math.Abs(mid.Z-40) <= 1 {
		t.Errorf("crosswise path midpoint Z=%v is not measurably off the chord line Z=40", mid.Z)
	}
}

// Scenario: Departing a stationary park uses the chord direction.
func TestBuildCurve_Scenario_StationaryParkUsesChordDirection(t *testing.T) {
	bodies := testSystem()
	from := Vec3{X: 10, Y: 0, Z: 10}
	target := pointTarget(Vec3{X: 110, Y: 0, Z: 10})
	const arrive common.WorldMillis = 15_000

	result, err := BuildCurve(bodies, from, target, arrive, nil, noStarClearance) // nil == no velocity of its own
	requireNoError(t, err)

	chordDir, ok := target.Point.Sub(from).Normalize()
	if !ok {
		t.Fatal("degenerate test fixture: zero-length chord")
	}
	initialDir, ok := result.Curve.Derivative(0).Normalize()
	if !ok {
		t.Fatal("curve has zero initial derivative")
	}
	if !almostEqualVec(initialDir, chordDir, looseTolerance) {
		t.Errorf("departure tangent = %v, want chord direction %v", initialDir, chordDir)
	}
}

// --- Arrival Is Tangent to the Target's Settled Motion ---------------------

// Scenario: The end tangent closely matches the settled orbit's velocity
// direction (spec-pinned floor: strictly greater than 0.95).
func TestSolveBurn_Scenario_EndTangentMatchesSettledVelocityDirection(t *testing.T) {
	bodies := testSystem()
	result, err := SolveBurn(bodies, Vec3{X: 90, Y: 0, Z: 90}, bodyTarget("planet1"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	b := result.Burn

	settled, err := StateAt(bodies, ShipState{Mode: ModeBurn, Burn: &b}, b.ArriveMs+1)
	requireNoError(t, err)
	if settled.Mode != ModeParked || settled.Park == nil {
		t.Fatalf("settled state = %+v, want a parked settlement immediately after arrival", settled)
	}

	endTangent := b.Tangent(b.ArriveMs)
	settledVel, err := settled.Park.Velocity(bodies, b.ArriveMs)
	requireNoError(t, err)
	settledDir, ok := settledVel.Normalize()
	if !ok {
		t.Fatal("settled park has zero velocity — cannot evaluate tangent alignment")
	}
	dot := endTangent.Dot(settledDir)
	if !(dot > 0.95) {
		t.Errorf("dot(endTangent, settledDir) = %v, want strictly greater than 0.95", dot)
	}
}

// Scenario: Position does not visibly jump across arrival — bit-identical,
// not merely close.
func TestSolveBurn_Scenario_PositionBitIdenticalAcrossArrival(t *testing.T) {
	bodies := testSystem()
	result, err := SolveBurn(bodies, Vec3{X: 90, Y: 0, Z: 90}, bodyTarget("planet1"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	b := result.Burn

	settled, err := StateAt(bodies, ShipState{Mode: ModeBurn, Burn: &b}, b.ArriveMs+1)
	requireNoError(t, err)
	settledPos, err := settled.Park.Position(bodies, b.ArriveMs)
	requireNoError(t, err)

	byBurn := b.Position(b.ArriveMs)
	if byBurn != settledPos {
		t.Fatalf("burn's arrival position %v is not bit-identical to the settled park's position at arrival %v", byBurn, settledPos)
	}
	if byBurn != b.Intercept {
		t.Fatalf("burn's arrival position %v is not bit-identical to the stored intercept %v", byBurn, b.Intercept)
	}
}

// Scenario: The insertion phase index is stored, not recovered from the
// intercept.
func TestSolveBurn_Scenario_InsertionPhaseIsStoredNotRecovered(t *testing.T) {
	bodies := testSystem()
	result, err := SolveBurn(bodies, Vec3{X: 90, Y: 0, Z: 90}, bodyTarget("planet1"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	b := result.Burn

	settled, err := StateAt(bodies, ShipState{Mode: ModeBurn, Burn: &b}, b.ArriveMs+1)
	requireNoError(t, err)
	if settled.Park.Phase != b.InsertionPhase {
		t.Errorf("settled park's phase = %d, want the burn's stored InsertionPhase %d", settled.Park.Phase, b.InsertionPhase)
	}
	gotPos, err := settled.Park.Position(bodies, b.ArriveMs)
	requireNoError(t, err)
	if gotPos != b.Intercept {
		t.Errorf("park.Position(bodies, arriveMs) = %v, want bit-identical to the stored intercept %v", gotPos, b.Intercept)
	}
}

// --- A Burn Path Is Displaced Perpendicular to the Chord to Clear the Star -

// sampleAtEqualSteps mirrors the spec's own fixed 33-sample evaluation.
func sampleAtEqualSteps(c interface{ Point(float64) Vec3 }, n int) []Vec3 {
	pts := make([]Vec3, 0, n+1)
	for i := 0; i <= n; i++ {
		pts = append(pts, c.Point(float64(i)/float64(n)))
	}
	return pts
}

func minDistanceFromOrigin(pts []Vec3) float64 {
	min := math.Inf(1)
	for _, p := range pts {
		if d := p.Length(); d < min {
			min = d
		}
	}
	return min
}

// Scenario: A burn crossing near the star bulges clear of it.
func TestBuildCurve_Scenario_BulgesClearOfStar(t *testing.T) {
	bodies := testSystem()
	from := Vec3{X: -80, Y: 0, Z: 0.5}
	target := pointTarget(Vec3{X: 80, Y: 0, Z: -0.5}) // chord grazes right past the origin
	const clearance = 5.0

	result, err := BuildCurve(bodies, from, target, 20_000, nil, clearance)
	requireNoError(t, err)
	minDist := minDistanceFromOrigin(sampleAtEqualSteps(result.Curve, 33))
	if !(minDist > clearance) {
		t.Errorf("min sampled distance from star = %v, want strictly greater than clearance %v", minDist, clearance)
	}
}

// Scenario: A burn nowhere near the star is left unmodified — its control
// points equal the control points computed before star-avoidance was
// considered (approximated here by disabling avoidance entirely: a path
// that never needed the displacement produces the identical curve whether
// or not avoidance was in effect).
func TestBuildCurve_Scenario_FarFromStarLeftUnmodified(t *testing.T) {
	bodies := testSystem()
	from := Vec3{X: 100, Y: 0, Z: 100}
	target := pointTarget(Vec3{X: 200, Y: 0, Z: 100})
	const arrive common.WorldMillis = 20_000

	withAvoidance, err := BuildCurve(bodies, from, target, arrive, nil, 5.0)
	requireNoError(t, err)
	withoutAvoidance, err := BuildCurve(bodies, from, target, arrive, nil, noStarClearance)
	requireNoError(t, err)

	if withAvoidance.Curve != withoutAvoidance.Curve {
		t.Errorf("curve was modified despite never approaching the star: with-avoidance=%+v without=%+v",
			withAvoidance.Curve, withoutAvoidance.Curve)
	}
}

// Scenario: A burn whose endpoint is already inside the clearance radius is
// rejected, with a reason distinct from the minimum-arc-length rejection.
func TestBuildCurve_Scenario_EndpointInsideClearanceRejected(t *testing.T) {
	bodies := testSystem()
	const clearance = 5.0
	insideOrigin := Vec3{X: 1, Y: 0, Z: 0} // distance 1 from the star, inside clearance 5
	target := pointTarget(Vec3{X: 200, Y: 0, Z: 0})

	_, err := BuildCurve(bodies, insideOrigin, target, 20_000, nil, clearance)
	if !errors.Is(err, ErrEndpointInsideClearance) {
		t.Fatalf("err = %v, want errors.Is(err, ErrEndpointInsideClearance)", err)
	}
	if errors.Is(err, ErrArcTooShort) {
		t.Fatalf("ErrEndpointInsideClearance must be distinct from ErrArcTooShort, got err satisfying both: %v", err)
	}
}

// Scenario: A grazing point whose radial direction is nearly chord-parallel
// still clears the star, and the displacement is still exactly
// perpendicular to the chord (not along the near-parallel radial
// direction). The origin here sits just outside the clearance radius, close
// enough that the curve's early, chord-directed departure threads near the
// star — the exact failure mode a naive "push radially" implementation
// mishandles (design.md Decision 7 / the PoC's own recorded regression).
func TestBuildCurve_Scenario_GrazingChordParallelStillClearsPerpendicular(t *testing.T) {
	bodies := testSystem()
	const clearance = 5.0
	from := Vec3{X: -5.5, Y: 0, Z: 0} // just outside the clearance radius (distance 5.5)
	target := pointTarget(Vec3{X: 200, Y: 0, Z: -0.01})
	const arrive common.WorldMillis = 40_000

	withAvoidance, err := BuildCurve(bodies, from, target, arrive, nil, clearance)
	requireNoError(t, err)
	withoutAvoidance, err := BuildCurve(bodies, from, target, arrive, nil, noStarClearance)
	requireNoError(t, err)

	minDist := minDistanceFromOrigin(sampleAtEqualSteps(withAvoidance.Curve, 33))
	if !(minDist > clearance) {
		t.Fatalf("min sampled distance from star = %v, want strictly greater than clearance %v (avoidance should have triggered)", minDist, clearance)
	}

	chordDir, ok := target.Point.Sub(from).Normalize()
	if !ok {
		t.Fatal("degenerate chord")
	}
	// The displacement is read off an INTERIOR control point: since
	// design.md Decision 11 the curve is a quintic and avoidance moves C2
	// and C3 only, leaving C1 and C4 — and therefore both end tangents —
	// untouched (asserted separately below).
	displacement := withAvoidance.Curve.C2.Sub(withoutAvoidance.Curve.C2)
	if displacement.Length() < tightTolerance {
		t.Fatal("avoidance did not move C2 at all — cannot check displacement direction")
	}
	alongChord := displacement.Dot(chordDir)
	// SDET-chosen tolerance: the displacement's component along the chord
	// direction must be negligible relative to its own magnitude.
	if math.Abs(alongChord)/displacement.Length() > 0.05 {
		t.Errorf("control-point displacement is not perpendicular to the chord: displacement=%v chordDir=%v (along-chord component ratio %v)",
			displacement, chordDir, math.Abs(alongChord)/displacement.Length())
	}
}

// Scenario: Star avoidance leaves both end tangents exactly unchanged
// (space-kinematics: "A Burn Path Is Displaced Perpendicular to the Chord to
// Clear the Star"). This is the invariant that makes the arrival-tangency
// requirement hold for EVERY burn rather than only for the ones that need no
// avoidance — a cubic could not provide it, because its only interior
// control points are the two that define the end tangents (design.md
// Decision 11).
func TestBuildCurve_Scenario_AvoidanceLeavesEndTangentsUnchanged(t *testing.T) {
	bodies := testSystem()
	const clearance = 5.0
	from := Vec3{X: -5.5, Y: 0, Z: 0}
	target := pointTarget(Vec3{X: 200, Y: 0, Z: -0.01})
	const arrive common.WorldMillis = 40_000

	withAvoidance, err := BuildCurve(bodies, from, target, arrive, nil, clearance)
	requireNoError(t, err)
	withoutAvoidance, err := BuildCurve(bodies, from, target, arrive, nil, noStarClearance)
	requireNoError(t, err)

	// Precondition: avoidance must actually have fired, or the assertion is
	// vacuous.
	if withAvoidance.Curve.C2 == withoutAvoidance.Curve.C2 {
		t.Fatal("avoidance did not displace the curve — the invariant below would be vacuous")
	}

	if withAvoidance.Curve.C1 != withoutAvoidance.Curve.C1 {
		t.Errorf("avoidance moved C1, which defines the departure tangent: %v vs %v",
			withAvoidance.Curve.C1, withoutAvoidance.Curve.C1)
	}
	if withAvoidance.Curve.C4 != withoutAvoidance.Curve.C4 {
		t.Errorf("avoidance moved C4, which defines the arrival tangent: %v vs %v",
			withAvoidance.Curve.C4, withoutAvoidance.Curve.C4)
	}
	if got, want := withAvoidance.Curve.Derivative(0), withoutAvoidance.Curve.Derivative(0); got != want {
		t.Errorf("departure tangent changed across avoidance: %v vs %v", got, want)
	}
	if got, want := withAvoidance.Curve.Derivative(1), withoutAvoidance.Curve.Derivative(1); got != want {
		t.Errorf("arrival tangent changed across avoidance: %v vs %v", got, want)
	}
}

// --- Intercept Against a Moving Target Runs a Fixed Number of Rounds

// Scenario: The solved intercept sits at the insertion standoff from the
// target's arrival position, and arrival is strictly after depart.
func TestSolveBurn_Scenario_InterceptAtInsertionStandoff(t *testing.T) {
	bodies := testSystem()
	planet := bodies["planet1"]
	result, err := SolveBurn(bodies, Vec3{X: 80, Y: 10, Z: -40}, bodyTarget("planet1"), 5, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	b := result.Burn

	bodyAtArrival, err := Position(bodies, "planet1", b.ArriveMs)
	requireNoError(t, err)
	got := dist(b.Intercept, bodyAtArrival)
	want := InsertionStandoff(planet)
	if !almostEqual(got, want, looseTolerance) {
		t.Errorf("intercept distance from body at arrival = %v, want the configured insertion standoff %v", got, want)
	}
	if !(b.ArriveMs > b.DepartMs) {
		t.Errorf("ArriveMs (%d) is not strictly after DepartMs (%d)", b.ArriveMs, b.DepartMs)
	}
}

// Scenario: The solve never exits early regardless of how quickly the
// estimate stabilizes — a barely-moving target and a fast-moving target
// report the identical, configured round count.
func TestSolveBurn_Scenario_NeverExitsEarly(t *testing.T) {
	bodies := fakeBodies{
		"star": {Id: "star", Size: 6},
		"barelyMoving": {Id: "barelyMoving", Size: 2, Orbit: &Orbit{
			ParentId: "star", Radius: 50, PeriodMs: 1_000_000_000, Phase: 0, // enormous period: ~stationary during any plausible flight
		}},
		"fastMoving": {Id: "fastMoving", Size: 2, Orbit: &Orbit{
			ParentId: "star", Radius: 50, PeriodMs: 4_000, Phase: 0, // whips around during the flight
		}},
	}
	stable, err := SolveBurn(bodies, Vec3{X: 200, Y: 0, Z: 0}, bodyTarget("barelyMoving"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	volatile, err := SolveBurn(bodies, Vec3{X: 200, Y: 0, Z: 0}, bodyTarget("fastMoving"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)

	if stable.Rounds != testRounds {
		t.Errorf("stable-target rounds = %d, want the configured %d (no early exit)", stable.Rounds, testRounds)
	}
	if volatile.Rounds != testRounds {
		t.Errorf("volatile-target rounds = %d, want the configured %d (no early exit)", volatile.Rounds, testRounds)
	}
	if stable.Rounds != volatile.Rounds {
		t.Errorf("round counts differ by target volatility: stable=%d volatile=%d, want equal", stable.Rounds, volatile.Rounds)
	}
}

// Scenario: The round count is validated by a zero quantized residual, not
// asserted — over the capability's own fixture sweep. NOT AUTOMATABLE in
// the red phase: this requires fixtures/space/cases.json's solveBurn
// family (design.md Decision 8, tasks.md 3.1/3.4), which does not exist
// until the implementation records it by running the sweep and choosing N.
// This test structure will be filled in once that fixture exists.
func TestSolveBurn_Scenario_RoundResidualIsWithinTheRecordedBound(t *testing.T) {
	// space-kinematics: "The round-to-round residual is measured and
	// bounded, not assumed zero". The solve is NOT required to reach a fixed
	// point — against a target that moves appreciably during the flight the
	// iteration is not a contraction, and the ceiling-quantized arrival makes
	// its right-hand side a step function, so an exact fixed point need not
	// exist (design.md Decision 12). What IS required is that the residual
	// stays at or below the bound the fixture family records.
	//
	// Asserted against the recorded measurement rather than by re-running the
	// sweep here: fixtures_test.go's computeFixtures is the one place that
	// sweep executes.
	m := recordedMeasurements(t)

	if m.SolveRounds != SolveRounds {
		t.Fatalf("fixtures/space/cases.json records N=%d but space.SolveRounds is %d — re-record with UPDATE_FIXTURES=1",
			m.SolveRounds, SolveRounds)
	}
	if m.SolveSweepSolved == 0 {
		t.Fatal("the recorded solveBurn sweep solved no cases — the residual measurement is vacuous")
	}
	if m.SolveResidualP99Bound != SolveRoundResidualP99BoundMs || m.SolveResidualMaxBound != SolveRoundResidualMaxBoundMs {
		t.Fatalf("fixtures/space/cases.json records bounds (p99=%d, max=%d) but the constants are (p99=%d, max=%d) — re-record with UPDATE_FIXTURES=1",
			m.SolveResidualP99Bound, m.SolveResidualMaxBound, SolveRoundResidualP99BoundMs, SolveRoundResidualMaxBoundMs)
	}
	if m.SolveResidualP99Ms > SolveRoundResidualP99BoundMs {
		t.Errorf("the p99 round-to-round residual is %d ms across the recorded solveBurn sweep (%d solved cases), "+
			"exceeding the recorded p99 bound of %d ms. This is the tight bound: it catches a BROAD regression, "+
			"not one pathological case. Raising it is a deliberate act needing a stated reason.",
			m.SolveResidualP99Ms, m.SolveSweepSolved, SolveRoundResidualP99BoundMs)
	}
	if m.SolveResidualMaxMs > SolveRoundResidualMaxBoundMs {
		t.Errorf("the worst round-to-round residual is %d ms across the recorded solveBurn sweep, exceeding the "+
			"recorded max bound of %d ms. The randomized sweep's box is adversarial, so this bound is loose by "+
			"design — exceeding it means a NEW pathology, not an unlucky draw.",
			m.SolveResidualMaxMs, SolveRoundResidualMaxBoundMs)
	}

	// The realistic-traffic sweep is what the acceptability of that tolerance
	// was actually judged on (design.md Decision 12), so it carries its own
	// hard assertions rather than being recorded for information only.
	rt := m.RealisticTraffic
	if rt.Burns == 0 {
		t.Fatal("the realistic-traffic sweep produced no burns — its assertions below are vacuous")
	}
	if rt.StarClearanceViolations != 0 {
		t.Errorf("%d of %d realistic-traffic burns came at or inside the star's clearance radius, want 0",
			rt.StarClearanceViolations, rt.Burns)
	}
	if rt.TangentBelowFloor != 0 {
		t.Errorf("%d of %d realistic-traffic burns arrived below the tangent-alignment floor, want 0",
			rt.TangentBelowFloor, rt.Burns)
	}
	if rt.ResidualP99Ms > SolveRoundResidualP99BoundMs {
		t.Errorf("realistic-traffic p99 residual is %d ms (median flight %d ms), exceeding the p99 bound of %d ms",
			rt.ResidualP99Ms, rt.MedianFlightMs, SolveRoundResidualP99BoundMs)
	}
}

// Scenario: A stationary target DOES reach a fixed point — so the residual
// the family records is attributable to target motion, not to N being too
// small (space-kinematics: "A stationary target does reach a fixed point").
func TestSolveBurn_Scenario_StationaryTargetResidualIsExactlyZero(t *testing.T) {
	bodies := testSystem()
	cases := []struct {
		name   string
		target Target
	}{
		{"explicit point", pointTarget(Vec3{X: 40, Y: 0, Z: 120})},
		{"zero-period body", bodyTarget("star")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			from := Vec3{X: 200, Y: 0, Z: 0}
			full, err := SolveBurn(bodies, from, c.target, 0, 8, nil, noStarClearance, SolveRounds)
			requireNoError(t, err)
			short, err := SolveBurn(bodies, from, c.target, 0, 8, nil, noStarClearance, SolveRounds-1)
			requireNoError(t, err)
			if full.Burn.ArriveMs != short.Burn.ArriveMs {
				t.Errorf("stationary target residual = %d ms, want exactly 0 (round %d vs %d)",
					int64(full.Burn.ArriveMs)-int64(short.Burn.ArriveMs), SolveRounds-1, SolveRounds)
			}
		})
	}
}

// Scenario: The same inputs at the same round count always produce the same
// burn — the guarantee that replaced convergence (space-kinematics: "The
// same inputs at the same round count always produce the same burn").
func TestSolveBurn_Scenario_SameInputsSameRoundCountSameBurn(t *testing.T) {
	bodies := testSystem()
	from := Vec3{X: 90, Y: 0, Z: 90}
	first, err := SolveBurn(bodies, from, bodyTarget("moon1"), 1_234, 8, nil, StarClearanceRadius(6), SolveRounds)
	requireNoError(t, err)
	second, err := SolveBurn(bodies, from, bodyTarget("moon1"), 1_234, 8, nil, StarClearanceRadius(6), SolveRounds)
	requireNoError(t, err)

	if first.Burn != second.Burn {
		t.Errorf("the same solve run twice produced different burns:\n  %+v\n  %+v", first.Burn, second.Burn)
	}
	if first.Rounds != second.Rounds {
		t.Errorf("round counts differ across identical runs: %d vs %d", first.Rounds, second.Rounds)
	}
}

// Scenario: The standoff is taken on the approaching side, in the
// horizontal plane — two burns approaching from opposite sides of the same
// (stationary, at the origin) body land on opposite sides, each with zero
// vertical offset component.
func TestSolveBurn_Scenario_StandoffOnApproachingSideHorizontalPlane(t *testing.T) {
	bodies := fakeBodies{"star": {Id: "star", Size: 6}}
	fromPositiveX, err := SolveBurn(bodies, Vec3{X: 100, Y: 0, Z: 0}, bodyTarget("star"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	fromNegativeX, err := SolveBurn(bodies, Vec3{X: -100, Y: 0, Z: 0}, bodyTarget("star"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)

	offsetA := fromPositiveX.Burn.Intercept // star sits at the origin, so intercept IS the offset
	offsetB := fromNegativeX.Burn.Intercept

	if offsetA.Y != 0 {
		t.Errorf("offset A has non-zero vertical component: %v", offsetA)
	}
	if offsetB.Y != 0 {
		t.Errorf("offset B has non-zero vertical component: %v", offsetB)
	}
	if offsetA.Dot(offsetB) >= 0 {
		t.Errorf("offsets are not on opposite sides: A=%v B=%v (dot=%v, want negative)", offsetA, offsetB, offsetA.Dot(offsetB))
	}
}

// Scenario: A larger body gets a proportionally larger standoff.
func TestInsertionStandoff_Scenario_LargerBodyGetsLargerStandoff(t *testing.T) {
	small := Body{Id: "small", Size: 1.5}
	big := Body{Id: "big", Size: 4.5}
	if !(InsertionStandoff(big) > InsertionStandoff(small)) {
		t.Errorf("InsertionStandoff(big=%v) = %v, want strictly greater than InsertionStandoff(small=%v) = %v",
			big.Size, InsertionStandoff(big), small.Size, InsertionStandoff(small))
	}
}

// --- Targeting Names a Body or an Explicit Point ---------------------------

// Scenario: A point target resolves to exactly that point.
func TestTargetPosition_Scenario_PointTargetResolvesToExactlyThatPoint(t *testing.T) {
	bodies := testSystem()
	mark := Vec3{X: 1, Y: 2, Z: 3}
	for _, tm := range []common.WorldMillis{0, 55_000, 9_999_999} {
		got, err := TargetPosition(bodies, pointTarget(mark), tm)
		requireNoError(t, err)
		if got != mark {
			t.Errorf("TargetPosition(point, t=%d) = %v, want %v", tm, got, mark)
		}
	}
}

// Scenario: The same body target at two different depart times yields two
// different intercepts, each still naming the same target body identity.
func TestSolveBurn_Scenario_SameBodyDifferentDepartTimesDifferentIntercepts(t *testing.T) {
	bodies := testSystem()
	early, err := SolveBurn(bodies, Vec3{X: 90, Y: 0, Z: 90}, bodyTarget("planet1"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	late, err := SolveBurn(bodies, Vec3{X: 90, Y: 0, Z: 90}, bodyTarget("planet1"), 40_000, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)

	if early.Burn.Intercept == late.Burn.Intercept {
		t.Errorf("intercepts are identical across different depart times: %v", early.Burn.Intercept)
	}
	if early.Burn.Target.BodyId != "planet1" || late.Burn.Target.BodyId != "planet1" {
		t.Errorf("burns do not both store the target body identity: early=%q late=%q", early.Burn.Target.BodyId, late.Burn.Target.BodyId)
	}
}

// --- SDET-added: closing a coverage gap found independent of file naming ---
//
// QA's independent coverage pass found BuildCurve's zero-offset
// default-phase branch (`if approach.X == 0 && approach.Z == 0 { phase =
// DefaultPhaseIndex }`, burn.go) untested: space-kinematics cross-references
// this degenerate-zero-offset default as belonging to BOTH "Intercept
// Against a Moving Target..." and "Releasing a Station-Keep Hold...", but
// only the station-keep half was covered (park_test.go's
// TestReleaseStationkeep_Scenario_DirectlyAboveUsesMinimumRadiusAndDefaultPhase).
// This is the intercept half: a body target approached from directly
// overhead, so the horizontal (X, Z) offset between origin and target is
// exactly (0, 0) and PhaseIndexOf would otherwise be asked to resolve an
// undefined direction.
func TestBuildCurve_Scenario_DirectlyOverheadApproachUsesDefaultPhase(t *testing.T) {
	bodies := fakeBodies{"star": {Id: "star", Size: 6}} // parentless -> positioned at the origin
	from := Vec3{X: 0, Y: 50, Z: 0}                     // directly above the body: horizontal (X,Z) offset is exactly (0,0)
	target := bodyTarget("star")
	const arrive common.WorldMillis = 0

	result, err := BuildCurve(bodies, from, target, arrive, nil, noStarClearance)
	requireNoError(t, err)
	if result.InsertionPhase != DefaultPhaseIndex {
		t.Fatalf("InsertionPhase = %d, want the documented default phase index %d for a directly-overhead approach",
			result.InsertionPhase, DefaultPhaseIndex)
	}
}
