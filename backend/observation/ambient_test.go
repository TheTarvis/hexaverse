package observation

import (
	"context"
	"testing"

	"hexaverse/board"
	"hexaverse/common"
)

// TestAmbientWrites_PathSweptPresenceOnly proves on-move reveal mints memory for
// exactly the features the sensor bubble swept along the path, and that it is
// presence-only — geometry, never composition (Detail), so ambient can't
// substitute for a scan.
func TestAmbientWrites_PathSweptPresenceOnly(t *testing.T) {
	const sys = "s"
	interiors := fakeInteriors{feats: map[string][]FeatureGeom{
		sys: {
			{Id: "feat-star", Anchor: board.Cell{Ring: 0, Slot: 0}, Astronomical: true,
				Detail: &FeatureDetail{FeatureType: "star", Resources: []ResourceReading{{Kind: "metals", Richness: 1}}}},
			{Id: "feat-body-0", Elements: &board.Orbit{Ring: 2, Angle0: 0, Period: 0, Dir: 1},
				Detail: &FeatureDetail{FeatureType: "rocky", Resources: []ResourceReading{{Kind: "metals", Richness: 0.8}}}},
			{Id: "feat-far", Elements: &board.Orbit{Ring: board.ProductionSchedule().MaxRing, Angle0: board.ProductionSchedule().Slots(board.ProductionSchedule().MaxRing) / 2, Period: 0, Dir: 1}},
		},
	}}
	// dao is unused by AmbientWrites; default sensor radius is 3.
	svc := NewServiceWith(nil, fakeFleets{}, interiors, beamLanes{}, common.WorldClock())

	path := []board.Cell{{Ring: 0, Slot: 0}, {Ring: 1, Slot: 0}}
	writes, err := svc.AmbientWrites(context.Background(), "corpX", sys, path, common.WorldMillis(0))
	if err != nil {
		t.Fatalf("ambient writes: %v", err)
	}

	got := map[string]map[string]interface{}{}
	for _, w := range writes {
		got[w.Path[len(w.Path)-1]] = w.Data
	}
	// The star (dist 0) and the ring-2 body (dist 2 ≤ radius 3) were swept; the
	// feature at the far rim, on the opposite side of the board, was not.
	if _, ok := got["feat-star"]; !ok {
		t.Errorf("swept star not recorded")
	}
	if _, ok := got["feat-body-0"]; !ok {
		t.Errorf("swept ring-2 body not recorded")
	}
	if _, ok := got["feat-far"]; ok {
		t.Errorf("far-rim feature recorded despite being far outside the bubble")
	}
	// Presence-only: no composition detail leaks through ambient.
	for id, data := range got {
		if _, leaked := data["detail"]; leaked {
			t.Errorf("ambient memory for %s leaked composition detail (scan is the only minter)", id)
		}
	}
}

// TestAmbientWrites_Scenario_FeatureRingBeyondLiveScheduleIsGuardedNotPanicked
// repurposes what used to be a vacuous fixture (a feature at ring 20 against
// a production MaxRing of 16, silently "passing" because hex Distance was
// total) into the regression test for the stored-coordinate guard (tasks.md
// 4.9): a feature whose ring exceeds the live schedule's maximum must not
// reach board.Distance/LineOfSight and panic — the read must degrade
// (omit that one feature) rather than crash.
func TestAmbientWrites_Scenario_FeatureRingBeyondLiveScheduleIsGuardedNotPanicked(t *testing.T) {
	const sys = "s"
	badRing := board.ProductionSchedule().MaxRing + 4
	interiors := fakeInteriors{feats: map[string][]FeatureGeom{
		sys: {
			{Id: "feat-star", Anchor: board.Cell{Ring: 0, Slot: 0}, Astronomical: true},
			{Id: "feat-corrupt", Elements: &board.Orbit{Ring: badRing, Angle0: 0, Period: 0, Dir: 1}},
		},
	}}
	svc := NewServiceWith(nil, fakeFleets{}, interiors, beamLanes{}, common.WorldClock())

	path := []board.Cell{{Ring: 0, Slot: 0}, {Ring: 1, Slot: 0}}

	var panicked any
	func() {
		defer func() { panicked = recover() }()
		// Either outcome is acceptable here — a named error, or a silent
		// per-feature omission that still returns the star's write. Only a
		// panic reaching board.Distance/LineOfSight is disallowed.
		_, _ = svc.AmbientWrites(context.Background(), "corpX", sys, path, common.WorldMillis(0))
	}()
	if panicked != nil {
		t.Fatalf("AmbientWrites panicked on a feature ring (%d) beyond the live schedule's max (%d): %v",
			badRing, board.ProductionSchedule().MaxRing, panicked)
	}
}
