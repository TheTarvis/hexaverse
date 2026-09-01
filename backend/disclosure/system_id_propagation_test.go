package disclosure

// Supplementary coverage for tasks.md 4.3 (proximity-disclosure "A
// Disclosure-Computed Sighting Carries Its System"), written because
// computed_sighting_system_id_test.go's own FocusedScan-based scenarios
// (TestFocusedScan_Scenario_AComputedSightingNamesItsSystem,
// TestFocusedScan_Scenario_ACleanSweepRecordNamesItsSystem) place their
// scanner at {X:40, Y:200} against a host ("planet") whose true resolved
// position is {40,0,0} (testWorld's own fixture, confirmed by direct
// measurement) — a distance of 200, an order of magnitude beyond
// FocusedScanRange (48, pinned by params_test.go's knobValues and exercised
// by the already-committed, immutable sighting_test.go). No production
// change can make FocusedScan accept that commission without contradicting
// FocusedScanRange's own pinned value, so those two scenarios cannot pass
// as written; see the accompanying test-dispute note in this task's report.
//
// This file exercises the SAME requirement — every computed
// disclosure.Sighting value carries World.SystemId — through FocusedScan's
// real geometry (mirroring sighting_test.go's own TestFocusedScan fixture
// shape), so the requirement itself has passing, correctly-geometried
// coverage independent of that dispute.

import (
	"testing"

	"hexaverse/space"
)

func TestFocusedScan_SystemIdPropagatesToComputedSightings(t *testing.T) {
	att := fakeAttachments{"ship": "planet"}
	w := testWorld(att)
	w.SystemId = "sys-alpha"

	planetPos, err := space.Position(w.Bodies, "planet", 0)
	if err != nil {
		t.Fatalf("resolving the planet: %v", err)
	}
	scanner := space.Vec3{X: planetPos.X + 10, Y: planetPos.Y, Z: planetPos.Z}
	ships := map[string]Ship{
		"ship": {Id: "ship", State: parkedAt("ship", planetPos).State},
	}

	got, err := FocusedScan(w, scanner, "planet", ships, 0)
	if err != nil {
		t.Fatalf("FocusedScan: %v", err)
	}
	if len(got) == 0 {
		t.Fatalf("expected at least one minted sighting")
	}
	for _, s := range got {
		if s.SystemId != w.SystemId {
			t.Errorf("minted sighting SystemId = %q, want %q", s.SystemId, w.SystemId)
		}
	}
}

func TestFocusedScan_CleanSweepSystemIdPropagates(t *testing.T) {
	w := testWorld(nil)
	w.SystemId = "sys-beta"

	planetPos, err := space.Position(w.Bodies, "planet", 0)
	if err != nil {
		t.Fatalf("resolving the planet: %v", err)
	}
	scanner := space.Vec3{X: planetPos.X + 10, Y: planetPos.Y, Z: planetPos.Z}

	got, err := FocusedScan(w, scanner, "planet", map[string]Ship{}, 4_200)
	if err != nil {
		t.Fatalf("FocusedScan: %v", err)
	}
	if len(got) != 1 || !got[0].CleanSweep {
		t.Fatalf("expected exactly one clean-sweep record, got %+v", got)
	}
	if got[0].SystemId != w.SystemId {
		t.Errorf("clean-sweep record SystemId = %q, want %q", got[0].SystemId, w.SystemId)
	}
}
