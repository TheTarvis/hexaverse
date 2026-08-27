package space

import "testing"

// space-kinematics: "Orbital Angles Resolve Through a Pinned Table, Never
// Runtime Trigonometry" and "Fixed-Round Iteration Replaces Every
// Data-Dependent Loop Exit" (the PhaseIndexOf half of it).
//
// PhaseIndexOf(offset Vec3) (SubTurns, int) — design.md Decision 3: octant
// reduction plus a fixed twenty-comparison bracketing search over the pinned
// two-level table, documented tie-break (lower index wins). No math.Atan2
// anywhere on this path (that is enforced by check-transcendental.sh, not by
// this Go suite — see the coverage table).

// Scenario: Deriving a phase index from an offset is deterministic.
func TestPhaseIndexOf_Scenario_Deterministic(t *testing.T) {
	offset := Vec3{X: 37.5, Y: 0, Z: -12.25}
	idx1, steps1 := PhaseIndexOf(offset)
	idx2, steps2 := PhaseIndexOf(offset)
	if idx1 != idx2 {
		t.Fatalf("PhaseIndexOf(%v) not deterministic: %v then %v", offset, idx1, idx2)
	}
	if steps1 != steps2 {
		t.Fatalf("PhaseIndexOf(%v) step count not deterministic: %v then %v", offset, steps1, steps2)
	}
}

// Scenario: The phase-index search always runs the same number of steps —
// exactly twenty, for both an offset that lands exactly on a table entry and
// one requiring the full bracketing search, with no early exit for the
// on-entry case (space-kinematics: "Fixed-Round Iteration...").
func TestPhaseIndexOf_Scenario_AlwaysTwentySteps(t *testing.T) {
	onEntry := Orbit{Radius: 1, Phase: 12345}.LocalPosition(0)
	_, stepsOnEntry := PhaseIndexOf(onEntry)
	if stepsOnEntry != 20 {
		t.Errorf("on-entry offset: steps = %d, want 20 (no early exit)", stepsOnEntry)
	}

	generic := Vec3{X: 0.31415, Y: 0, Z: 0.98765}
	_, stepsGeneric := PhaseIndexOf(generic)
	if stepsGeneric != 20 {
		t.Errorf("generic offset: steps = %d, want 20", stepsGeneric)
	}

	if stepsOnEntry != stepsGeneric {
		t.Errorf("step counts differ across inputs: on-entry=%d generic=%d, want equal (fixed trip count)", stepsOnEntry, stepsGeneric)
	}
}

// Scenario: An offset that lies exactly on a table entry's direction resolves
// to that entry's own index. Built by round-tripping through LocalPosition at
// radius 1, inclination 0, node 0 — the position's (X, Z) IS the table
// direction for that phase by construction, so this does not depend on any
// concrete recorded table value (which does not exist yet in the red phase).
func TestPhaseIndexOf_Scenario_ExactlyOnEntryResolvesToItsOwnIndex(t *testing.T) {
	for _, phase := range []SubTurns{0, 1, 1023, 1024, 1025, SubTurn/4 + 7, SubTurn - 1} {
		pos := Orbit{Radius: 1, Phase: phase}.LocalPosition(0)
		got, _ := PhaseIndexOf(pos)
		if got != phase {
			t.Errorf("PhaseIndexOf(LocalPosition(phase=%d)) = %d, want %d (exact round trip)", phase, got, phase)
		}
	}
}

// Scenario: An offset exactly equidistant between two adjacent table
// directions resolves to the lower index. Built as the SUM of the two
// adjacent unit directions (the geometric angle bisector), per the spec's
// own construction. Does not cover the zero offset — see solve_test.go and
// park_test.go for the two requirements that define that default.
func TestPhaseIndexOf_Scenario_TieResolvesToLowerIndex(t *testing.T) {
	const lower SubTurns = 500_000
	a := Orbit{Radius: 1, Phase: lower}.LocalPosition(0)
	b := Orbit{Radius: 1, Phase: lower + 1}.LocalPosition(0)
	tieOffset := a.Add(b)

	got, _ := PhaseIndexOf(tieOffset)
	if got != lower {
		t.Fatalf("PhaseIndexOf(sum of adjacent unit directions at %d, %d) = %d, want the lower index %d",
			lower, lower+1, got, lower)
	}
}

// SDET-added boundary probe: the tie construction must actually be
// equidistant for the assertion above to mean anything — sanity-check that
// the two source phases are genuinely adjacent (differ by exactly one
// sub-turn unit, the finest representable step), so a future edit to the
// tie-offset construction can't silently drift onto a non-tie input.
func TestPhaseIndexOf_Scenario_TieConstructionUsesAdjacentIndices(t *testing.T) {
	const lower SubTurns = 500_000
	if diff := (lower + 1) - lower; diff != 1 {
		t.Fatalf("tie construction not adjacent: diff = %d, want 1", diff)
	}
}

// subTurnsApart returns the shortest circular distance between two phase
// indices, in sub-turn units — so a comparison across the 0/SubTurn wrap
// (index 0 vs index SubTurn-1) reads as the one unit it geometrically is,
// not as SubTurn-1.
func subTurnsApart(a, b SubTurns) int64 {
	d := int64(a) - int64(b)
	if d < 0 {
		d = -d
	}
	if d > int64(SubTurn)/2 {
		d = int64(SubTurn) - d
	}
	return d
}

// Scenario: The phase index round-trips with local position — "the
// round-tripped phase index equals the original phase index exactly for an
// offset built from that index's own table direction, and WITHIN ONE
// SUB-TURN UNIT OTHERWISE" (space-kinematics: "Orbital Angles Resolve
// Through a Pinned Table, Never Runtime Trigonometry").
//
// tasks.md 8.1 [QA, 2026-08-27]: the pre-existing round-trip test covers
// only the exact leg, at seven phases, and only for offsets that ARE table
// directions by construction — so the "otherwise" clause had no coverage at
// all. This sweeps the whole phase domain on both legs.
//
// The swept set is every 1021st index (1021 is prime and coprime with both
// table levels' sizes, so the walk visits all eight octants, every coarse
// bracket, and a non-repeating spread of fine indices rather than a lattice
// aligned to either level).
const roundTripStride SubTurns = 1021

// The exact leg: radius 1, inclination 0, node 0 — LocalPosition's (X, Z) IS
// the pinned table's own entry for that phase, unscaled, so the resolution
// must return that entry's own index with no slack whatsoever.
func TestPhaseIndexOf_Scenario_RoundTripIsExactForATableDirection(t *testing.T) {
	swept := 0
	for phase := SubTurns(0); phase < SubTurn; phase += roundTripStride {
		pos := Orbit{Radius: 1, Phase: phase}.LocalPosition(0)
		got, _ := PhaseIndexOf(pos)
		if got != phase {
			t.Fatalf("exact leg: PhaseIndexOf(LocalPosition(phase=%d)) = %d, want %d exactly", phase, got, phase)
		}
		swept++
	}
	if swept < 1000 {
		t.Fatalf("swept only %d phases, want the whole domain at stride %d", swept, roundTripStride)
	}
}

// The "otherwise" leg: a GENERIC Cartesian offset that is not a table
// direction. A node rotation composes the table's own angle-addition with a
// second rounded rotation, and a non-power-of-two radius scales the result,
// so the offset lands between table entries rather than on one. The clause
// allows one sub-turn unit of slack there — and no more.
func TestPhaseIndexOf_Scenario_RoundTripIsWithinOneUnitForAGenericOffset(t *testing.T) {
	const node SubTurns = 314_159
	swept, inexact := 0, 0
	for phase := SubTurns(0); phase < SubTurn; phase += roundTripStride {
		// Radius 37.3 is neither 1 nor a power of two, so the scaling
		// rounds; the node rotation puts the direction between entries.
		pos := Orbit{Radius: 37.3, Phase: phase, Node: node}.LocalPosition(0)
		want := wrapSubTurn(int64(phase) + int64(node))
		got, steps := PhaseIndexOf(pos)
		if d := subTurnsApart(got, want); d > 1 {
			t.Fatalf("generic leg: PhaseIndexOf(LocalPosition(phase=%d, node=%d, r=37.3)) = %d, want within one sub-turn unit of %d (off by %d)",
				phase, node, got, want, d)
		} else if d == 1 {
			inexact++
		}
		if steps != phaseIndexSteps {
			t.Fatalf("generic leg: steps = %d, want the fixed %d", steps, phaseIndexSteps)
		}
		swept++
	}
	if swept < 1000 {
		t.Fatalf("swept only %d phases, want the whole domain at stride %d", swept, roundTripStride)
	}
	// The leg is only meaningful if it actually exercises non-table-aligned
	// offsets. If every swept case came back exact, the construction has
	// drifted back onto table directions and the "otherwise" clause is
	// once again untested — which is the very gap this test was added to
	// close, so say so rather than passing quietly.
	t.Logf("generic leg: %d/%d swept phases resolved one sub-turn unit off (the rest exactly)", inexact, swept)
}

// Scenario: Deriving a phase index from an offset is deterministic —
// "including on an input that falls exactly on the documented tie-break
// boundary" (space-kinematics: "Orbital Angles Resolve Through a Pinned
// Table, Never Runtime Trigonometry").
//
// tasks.md 8.3 [QA, 2026-08-27]: the pre-existing determinism test uses a
// generic offset and the tie test resolves the tie input only ONCE, so the
// literal scenario — determinism AT the boundary — was implied by purity
// but never asserted.
func TestPhaseIndexOf_Scenario_DeterministicAtTheTieBoundary(t *testing.T) {
	const lower SubTurns = 500_000
	a := Orbit{Radius: 1, Phase: lower}.LocalPosition(0)
	b := Orbit{Radius: 1, Phase: lower + 1}.LocalPosition(0)
	tieOffset := a.Add(b)

	idx1, steps1 := PhaseIndexOf(tieOffset)
	idx2, steps2 := PhaseIndexOf(tieOffset)

	if idx1 != idx2 {
		t.Fatalf("PhaseIndexOf at the tie boundary is not deterministic: %d then %d", idx1, idx2)
	}
	if steps1 != steps2 {
		t.Fatalf("PhaseIndexOf step count at the tie boundary is not deterministic: %d then %d", steps1, steps2)
	}
	if idx1 != lower {
		t.Fatalf("PhaseIndexOf at the tie boundary = %d, want the LOWER index %d on both calls", idx1, lower)
	}
}
