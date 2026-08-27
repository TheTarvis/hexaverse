package space

import (
	"testing"

	"hexaverse/common"
)

// space-kinematics: "A Burn Past Its Arrival Is Its Settled Park, With No
// Extra Persisted State", "A Large Time Jump Is Safe by Construction", "No
// Value Is Derived From Accumulated Per-Tick State" (the two-reader half —
// the read-count-independence half lives in park_test.go's
// TestStationKeepUpkeep_Scenario_ReadCountIndependent), and "Burn Timing
// Quantizes to Integer World-Milliseconds by Ceiling" scenario 3 (the exact
// integer arrival comparison, which belongs at the fold).

func settledBurnFixture(t *testing.T) (fakeBodies, Burn) {
	t.Helper()
	bodies := testSystem()
	result, err := SolveBurn(bodies, Vec3{X: 90, Y: 0, Z: 90}, bodyTarget("planet1"), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	return bodies, result.Burn
}

// Scenario: A burn is still burning immediately before arrival and settled
// immediately after.
func TestStateAt_Scenario_BurningBeforeSettledAfter(t *testing.T) {
	bodies, b := settledBurnFixture(t)
	initial := ShipState{Mode: ModeBurn, Burn: &b}

	before, err := StateAt(bodies, initial, b.ArriveMs-1)
	requireNoError(t, err)
	if before.Mode != ModeBurn {
		t.Errorf("state at arrive-1 = %v, want still ModeBurn", before.Mode)
	}

	after, err := StateAt(bodies, initial, b.ArriveMs+1)
	requireNoError(t, err)
	if after.Mode != ModeParked {
		t.Errorf("state at arrive+1 = %v, want ModeParked", after.Mode)
	}
}

// Scenario (space-kinematics, Burn Timing Quantizes...): Arrival is an
// exact integer comparison — evaluated exactly AT the stored arrival
// millisecond, the burn is already treated as arrived.
func TestStateAt_Scenario_ArrivalIsExactIntegerComparison(t *testing.T) {
	bodies, b := settledBurnFixture(t)
	initial := ShipState{Mode: ModeBurn, Burn: &b}
	at, err := StateAt(bodies, initial, b.ArriveMs)
	requireNoError(t, err)
	if at.Mode != ModeParked {
		t.Fatalf("state evaluated exactly at ArriveMs = %v, want ModeParked (arrived), using an exact integer comparison", at.Mode)
	}
}

// Scenario: Folding at two later times gives identical results.
func TestStateAt_Scenario_FoldingAtTwoLaterTimesIsIdentical(t *testing.T) {
	bodies, b := settledBurnFixture(t)
	initial := ShipState{Mode: ModeBurn, Burn: &b}

	first, err := StateAt(bodies, initial, b.ArriveMs+5)
	requireNoError(t, err)
	second, err := StateAt(bodies, initial, b.ArriveMs+999_999)
	requireNoError(t, err)

	if first.Mode != ModeParked || second.Mode != ModeParked {
		t.Fatalf("expected both folds settled: first=%v second=%v", first.Mode, second.Mode)
	}
	if *first.Park != *second.Park {
		t.Fatalf("folding at two later times produced different parks: %+v vs %+v", *first.Park, *second.Park)
	}
}

// Scenario: A settled body-targeted burn rides its insertion orbit.
func TestStateAt_Scenario_SettledBurnRidesInsertionOrbit(t *testing.T) {
	bodies, b := settledBurnFixture(t)
	initial := ShipState{Mode: ModeBurn, Burn: &b}
	wellAfter := b.ArriveMs + 50_000

	settled, err := StateAt(bodies, initial, wellAfter)
	requireNoError(t, err)
	pos, err := StatePosition(bodies, initial, wellAfter)
	requireNoError(t, err)
	bodyPos, err := Position(bodies, "planet1", wellAfter)
	requireNoError(t, err)

	got := dist(pos, bodyPos)
	want := InsertionStandoff(mustBody(t, bodies, "planet1"))
	if !almostEqual(got, want, looseTolerance) {
		t.Errorf("distance from target body well after arrival = %v, want the configured insertion radius %v", got, want)
	}
	if settled.Mode != ModeParked {
		t.Fatalf("settled mode = %v, want ModeParked", settled.Mode)
	}
}

// Scenario: A burn to a fixed point settles into a point park.
func TestStateAt_Scenario_PointTargetBurnSettlesIntoPointPark(t *testing.T) {
	bodies := testSystem()
	result, err := SolveBurn(bodies, Vec3{X: 0, Y: 0, Z: 0}, pointTarget(Vec3{X: 300, Y: 0, Z: 0}), 0, 8, nil, noStarClearance, testRounds)
	requireNoError(t, err)
	b := result.Burn
	initial := ShipState{Mode: ModeBurn, Burn: &b}

	settled, err := StateAt(bodies, initial, b.ArriveMs+1)
	requireNoError(t, err)
	if settled.Mode != ModeParked || settled.Park == nil {
		t.Fatalf("settled state = %+v, want a parked point settlement", settled)
	}
	if settled.Park.Kind != ParkPoint {
		t.Errorf("settled park kind = %v, want ParkPoint", settled.Park.Kind)
	}
	if settled.Park.Point != b.Intercept {
		t.Errorf("settled point park position = %v, want the burn's intercept %v", settled.Park.Point, b.Intercept)
	}
}

// Scenario: A single far-future evaluation matches many intermediate
// evaluations.
func TestStateAt_Scenario_FarFutureMatchesSteppedEvaluations(t *testing.T) {
	bodies, b := settledBurnFixture(t)
	initial := ShipState{Mode: ModeBurn, Burn: &b}
	farFuture := b.ArriveMs + 200_000

	direct, err := StateAt(bodies, initial, farFuture)
	requireNoError(t, err)
	directPos, err := StatePosition(bodies, initial, farFuture)
	requireNoError(t, err)

	stepped := initial
	for _, tm := range []common.WorldMillis{
		b.DepartMs + 100, b.ArriveMs - 500, b.ArriveMs + 1, b.ArriveMs + 10_000, b.ArriveMs + 100_000, farFuture,
	} {
		stepped, err = StateAt(bodies, stepped, tm)
		requireNoError(t, err)
	}
	steppedPos, err := StatePosition(bodies, stepped, farFuture)
	requireNoError(t, err)

	if direct.Mode != stepped.Mode {
		t.Fatalf("mode differs: direct=%v stepped=%v", direct.Mode, stepped.Mode)
	}
	if *direct.Park != *stepped.Park {
		t.Fatalf("settled park differs: direct=%+v stepped=%+v", *direct.Park, *stepped.Park)
	}
	if directPos != steppedPos {
		t.Fatalf("position differs: direct=%v stepped=%v", directPos, steppedPos)
	}
}

// Scenario: A first read long after arrival returns the settled park, not a
// frozen burn.
func TestStateAt_Scenario_FirstReadLongAfterArrivalReturnsSettledPark(t *testing.T) {
	bodies, b := settledBurnFixture(t)
	initial := ShipState{Mode: ModeBurn, Burn: &b} // never read at any intermediate time
	farFuture := b.ArriveMs + 500_000

	got, err := StateAt(bodies, initial, farFuture)
	requireNoError(t, err)
	if got.Mode != ModeParked {
		t.Fatalf("first read long after arrival = %v, want ModeParked (the settled park), not the mid-flight burn", got.Mode)
	}
}

// Scenario: Two independent readers at the same world time agree.
func TestStatePosition_Scenario_TwoIndependentReadersAgree(t *testing.T) {
	bodies, b := settledBurnFixture(t)
	initial := ShipState{Mode: ModeBurn, Burn: &b}
	const tm common.WorldMillis = 8_000 // mid-flight, arbitrary

	readerA, err := StatePosition(bodies, initial, tm)
	requireNoError(t, err)
	readerB, err := StatePosition(bodies, initial, tm)
	requireNoError(t, err)
	if readerA != readerB {
		t.Fatalf("independent reads at the same world time disagree: %v vs %v", readerA, readerB)
	}
}

func mustBody(t *testing.T, bodies fakeBodies, id string) Body {
	t.Helper()
	b, ok := bodies.Body(id)
	if !ok {
		t.Fatalf("test fixture missing body %q", id)
	}
	return b
}
