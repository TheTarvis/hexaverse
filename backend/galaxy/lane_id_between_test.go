package galaxy

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 2.1 — "Export galaxy.LaneIdBetween(aSysId, bSysId string) string
// over the existing laneIdFor/CellForSystemId pair, purely (no read), so a
// gate-attachment write can derive its lane id without a lookup."
// (design.md Decision 3 — no dedicated scenario of its own; this supports
// task 2.4's gate-attachment knowledge writer, exercised directly in
// backend/charts/gate_attachment_test.go.)
//
// EXPECTED TO FAIL ON FIRST RUN: LaneIdBetween is not declared anywhere in
// this package today (compile error — "undefined: LaneIdBetween"), which is
// the exact red a purely-additive export produces before it exists.
//
// White-box (package galaxy, not galaxy_test) so this can cross-check the
// exported wrapper against the existing unexported laneIdFor directly,
// proving LaneIdBetween is that function over system ids rather than a
// re-implementation that could silently diverge.

import "testing"

// TestLaneIdBetween_MatchesTheExistingLaneIdForOverTheSameCells pins that the
// new exported entry point is exactly laneIdFor(CellForSystemId(a),
// CellForSystemId(b)) — not a parallel derivation.
func TestLaneIdBetween_MatchesTheExistingLaneIdForOverTheSameCells(t *testing.T) {
	a := Cell{X: 5, Y: -2}
	b := Cell{X: 5, Y: -1}
	sysA, sysB := SystemIdFor(a), SystemIdFor(b)

	want := laneIdFor(a, b)
	got := LaneIdBetween(sysA, sysB)
	if got != want {
		t.Fatalf("LaneIdBetween(%q, %q) = %q, want %q (must derive from the same laneIdFor/CellForSystemId pair)",
			sysA, sysB, got, want)
	}
}

// TestLaneIdBetween_OrderIndependent pins that LaneIdBetween is symmetric
// over the unordered endpoint pair, mirroring laneIdFor's own
// order-independence (galaxy/field.go's cellLess canonicalization) — a
// gate-attachment write and a jump-arrival write approaching the same lane
// from opposite systems must land on the identical document id.
func TestLaneIdBetween_OrderIndependent(t *testing.T) {
	sysA := SystemIdFor(Cell{X: -3, Y: 8})
	sysB := SystemIdFor(Cell{X: -3, Y: 9})

	ab := LaneIdBetween(sysA, sysB)
	ba := LaneIdBetween(sysB, sysA)
	if ab != ba {
		t.Fatalf("LaneIdBetween(a,b) = %q, LaneIdBetween(b,a) = %q — must agree over the unordered pair", ab, ba)
	}
}

// TestLaneIdBetween_DistinctPairsYieldDistinctIds is a cheap boundary probe
// (SDET-added): two different endpoint pairs must not collide.
func TestLaneIdBetween_DistinctPairsYieldDistinctIds(t *testing.T) {
	sysA := SystemIdFor(Cell{X: 0, Y: 0})
	sysB := SystemIdFor(Cell{X: 0, Y: 1})
	sysC := SystemIdFor(Cell{X: 0, Y: 2})

	if LaneIdBetween(sysA, sysB) == LaneIdBetween(sysA, sysC) {
		t.Fatalf("LaneIdBetween collided for distinct endpoint pairs (%s,%s) and (%s,%s)", sysA, sysB, sysA, sysC)
	}
}
