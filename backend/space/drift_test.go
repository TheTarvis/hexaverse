// Package space — RED phase for openspec change
// migrate-fleet-to-continuous-burns, tasks.md section 2 ("space — free
// drift, cut-drive conversion, the widened codec"). Every *_test.go file
// added by this handoff is written BEFORE the corresponding production code
// exists; the compile failure (undefined: space.ModeDrift, space.Drift, ...)
// is the correct initial red state. No non-test .go file is added by this
// handoff. Section 1 (fixtures) is already committed (1f1c88a) and is not
// touched here; pre-existing test files (state_test.go, burn_test.go,
// params_test.go, etc., from the add-space-kinematics link) are likewise
// left untouched — new coverage for this link lands in new files.
//
// ============================================================================
// ASSUMED API CONTRACT ADDENDUM — section 2 (this handoff)
// ============================================================================
// tasks.md 2.1-2.6 name the shape of each new member; design.md's Decisions
// 5-9 pin the algorithms and, in places, literal wire shapes. Neither
// document pins every Go signature byte-for-byte. Where a signature was not
// pinned, this addendum fixes ONE concrete choice so the tests in this
// handoff's files compile into a single coherent contract — per the SDET
// protocol this choice *is* the contract until the orchestrator adjudicates
// a developer's dispute in the developer's favor.
//
// Drift — drift.go (tasks.md 2.1, design.md Decision 5):
//
//	type Drift struct {
//	    Anchor   Vec3
//	    Velocity Vec3               // a FIELD, not a method — Decision 5's own
//	                                // struct literal (`Velocity: burn.Tangent(...)`)
//	                                // rules out a same-named method (Go forbids a
//	                                // field and method sharing one name). tasks.md's
//	                                // prose "a constant Velocity()" is read as
//	                                // describing the property (the stored value never
//	                                // varies with the query time), not a literal
//	                                // zero-arg method.
//	    EpochMs  common.WorldMillis
//	}
//	func (d Drift) Position(t common.WorldMillis) Vec3 // anchor + velocity*seconds(t-epoch), no clamp
//
// ShipState (state.go) gains a third mode and a third payload field
// (design.md Decision 5):
//
//	const ModeDrift ShipMode = <third value, alongside the existing ModeBurn/ModeParked>
//	type ShipState struct {
//	    Mode  ShipMode
//	    Burn  *Burn
//	    Park  *Park
//	    Drift *Drift // set iff Mode == ModeDrift
//	}
//
// The cut-drive conversion (tasks.md 2.2, design.md Decision 6, code sketch
// given literally in the design text — Anchor/Velocity/EpochMs are pinned;
// only the function name/signature wrapping that construction is an SDET
// choice):
//
//	var ErrCutAfterArrival error // refusing a cut at/after the burn's stored ArriveMs
//	func CutDrive(b Burn, cutMs common.WorldMillis) (Drift, error)
//
// StopInPlaceSpeedFloor (tasks.md 2.3, design.md Decision 8):
//
//	const StopInPlaceSpeedFloor float64 = <placeholder, space/params_const.go>
//
// The widened codec (tasks.md 2.5, design.md Decision 9/the MODIFIED
// requirement) — control points encode as a FLAT []float64 of 18 numbers (6
// points * 3 components, P0,C1,C2,C3,C4,P5 in that order), the one shape of
// the three the requirement text permits that this suite picks; see
// codec_kinematic_state_test.go's own header for the full map-key contract.
//
// ============================================================================
package space

import (
	"testing"

	"hexaverse/common"
)

// --- 2.1: A Free-Drifting Ship Coasts in a Straight Line at Constant Velocity

// Scenario: A drift's position follows the linear expression.
func TestDrift_Scenario_PositionFollowsLinearExpression(t *testing.T) {
	d := Drift{
		Anchor:   Vec3{X: 10, Y: 0, Z: -5},
		Velocity: Vec3{X: 2, Y: 0, Z: 3},
		EpochMs:  1_000,
	}
	// 4.5 seconds after epoch.
	at := common.WorldMillis(1_000 + 4_500)
	want := Vec3{X: 10 + 2*4.5, Y: 0, Z: -5 + 3*4.5}

	got := d.Position(at)
	if got != want {
		t.Fatalf("Position(%d) = %v, want %v (anchor + velocity*seconds(t-epoch))", at, got, want)
	}
}

// Scenario: Velocity is identical at two different world times.
//
// Velocity is a stored field, not a function of t (see this file's ASSUMED
// API CONTRACT ADDENDUM); reading it around two different Position(t)
// evaluations proves those evaluations do not perturb it.
func TestDrift_Scenario_VelocityIdenticalAtTwoDifferentWorldTimes(t *testing.T) {
	d := Drift{
		Anchor:   Vec3{X: 1, Y: 1, Z: 1},
		Velocity: Vec3{X: 4, Y: -2, Z: 0.5},
		EpochMs:  5_000,
	}
	before := d.Velocity
	_ = d.Position(6_000)
	mid := d.Velocity
	_ = d.Position(9_999_999)
	after := d.Velocity

	if before != mid || mid != after {
		t.Fatalf("velocity read around two different-time Position evaluations: before=%v mid=%v after=%v, want all identical", before, mid, after)
	}
}

// Scenario: Evaluation before the stored epoch displaces backward, never
// panics.
func TestDrift_Scenario_EvaluationBeforeEpochDisplacesBackwardNoPanic(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("Position before the stored epoch panicked: %v", r)
		}
	}()
	d := Drift{
		Anchor:   Vec3{X: 0, Y: 0, Z: 0},
		Velocity: Vec3{X: 10, Y: 0, Z: 0},
		EpochMs:  10_000,
	}
	before := common.WorldMillis(7_000) // 3 seconds before epoch
	want := Vec3{X: -30, Y: 0, Z: 0}    // displaced backward by 10*(-3)

	got := d.Position(before)
	if got != want {
		t.Fatalf("Position(%d) [before epoch %d] = %v, want %v (displaced backward along velocity by the negative elapsed seconds)", before, d.EpochMs, got, want)
	}
}

// Scenario: A zero-velocity drift equals its anchor forever.
func TestDrift_Scenario_ZeroVelocityDriftEqualsAnchorForever(t *testing.T) {
	anchor := Vec3{X: 3, Y: -7, Z: 2}
	d := Drift{Anchor: anchor, Velocity: Vec3{}, EpochMs: 50_000}

	for _, tm := range []common.WorldMillis{
		0, 1, 49_999, 50_000, 50_001, 1_000_000, 999_999_999,
	} {
		if got := d.Position(tm); got != anchor {
			t.Errorf("Position(%d) on a zero-velocity drift = %v, want the stored anchor %v unchanged", tm, got, anchor)
		}
	}
}

// Scenario: The fold at a far-future time returns the identical drift, not a
// park.
func TestStateAt_Scenario_DriftFoldAtFarFutureStaysADrift(t *testing.T) {
	bodies := testSystem()
	d := Drift{Anchor: Vec3{X: 1, Y: 2, Z: 3}, Velocity: Vec3{X: 1, Y: 0, Z: 0}, EpochMs: 0}
	initial := ShipState{Mode: ModeDrift, Drift: &d}

	farFuture := common.WorldMillis(500_000_000)
	got, err := StateAt(bodies, initial, farFuture)
	requireNoError(t, err)

	if got.Mode != ModeDrift {
		t.Fatalf("folded mode at a far-future time = %v, want ModeDrift (never settles into a park)", got.Mode)
	}
	if got.Park != nil {
		t.Errorf("folded state carries a non-nil Park = %+v, want nil — a drift never settles", got.Park)
	}
	if got.Drift == nil || *got.Drift != d {
		t.Errorf("folded drift = %+v, want the identical stored drift %+v, unchanged", got.Drift, d)
	}
}

// Scenario: A large time jump is safe by construction for a drift.
//
// Drift.Position is a pure, stateless function of (anchor, velocity, epoch,
// t) alone — there is no per-tick accumulation for a large jump to corrupt.
// Evaluating at several intermediate times before the final far-future
// evaluation must not perturb the final result.
func TestDrift_Scenario_LargeTimeJumpIsSafeByConstruction(t *testing.T) {
	d := Drift{Anchor: Vec3{X: -100, Y: 50, Z: 0}, Velocity: Vec3{X: 7, Y: -3, Z: 1}, EpochMs: 0}
	farFuture := common.WorldMillis(1_000_000_000) // ~11.6 days of world time

	direct := d.Position(farFuture)

	// Read at several intermediate times first; none of them mutate d (it is
	// a plain value), so the final read must be bit-identical to the direct
	// evaluation above.
	for _, tm := range []common.WorldMillis{
		1, 1_000, 1_000_000, 100_000_000, 999_999_999,
	} {
		_ = d.Position(tm)
	}
	stepped := d.Position(farFuture)

	if direct != stepped {
		t.Fatalf("Position(farFuture) direct=%v vs after stepping through intermediate reads=%v, want identical", direct, stepped)
	}
}

// Scenario: The same drift evaluated twice at the same time is
// bit-identical.
func TestDrift_Scenario_RepeatEvaluationAtSameTimeIsBitIdentical(t *testing.T) {
	d := Drift{Anchor: Vec3{X: 1.23456789, Y: -9.87654321, Z: 0.00001}, Velocity: Vec3{X: 3.14159, Y: 2.71828, Z: -1.41421}, EpochMs: 12_345}
	const tm common.WorldMillis = 67_890

	a := d.Position(tm)
	b := d.Position(tm)
	if a != b {
		t.Fatalf("Position(%d) evaluated twice: %v vs %v, want bit-identical", tm, a, b)
	}
}
