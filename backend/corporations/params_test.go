package corporations

import (
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/system"
)

// TestDefaultSpawnParams pins the slice placeholder knobs — a guard so a careless
// edit to the constants (which tune where new players wake) is a visible change.
func TestDefaultSpawnParams(t *testing.T) {
	p := DefaultSpawnParams()
	if p.MinSpawnDistance < 0 {
		t.Fatalf("MinSpawnDistance = %d, must be non-negative", p.MinSpawnDistance)
	}
	if p.PeripheryWeight < 0 {
		t.Fatalf("PeripheryWeight = %f, must be non-negative", p.PeripheryWeight)
	}
	if !p.RequireMineable {
		t.Fatal("RequireMineable should default true — the bootstrap guarantee is on")
	}
	// The starting hull coasts one ring inside the lane-gate ring.
	if want := common.Tuning().BoardRadius - 1; p.RimRing != want {
		t.Fatalf("RimRing = %d, want %d (one inside the gate ring)", p.RimRing, want)
	}
}

// The board-geometry invariant, previously enforced only by "must match" comments
// in three files: system generates every interior at radius R, fleet places lane
// gates on ring R, and spawn rests the starting hull on ring R-1. All three now
// derive from common.Tuning().BoardRadius, so this asserts the wiring actually
// holds — a regression here silently strands hulls off-board or puts gates in the
// void.
func TestBoardRadiusInvariant(t *testing.T) {
	radius := common.Tuning().BoardRadius

	if got := system.DefaultParams().Radius; got != radius {
		t.Errorf("system generation radius = %d, want %d (common.Tuning().BoardRadius)", got, radius)
	}
	if got := fleet.DefaultMovementParams().BoardRadius; got != radius {
		t.Errorf("fleet gate ring = %d, want %d (common.Tuning().BoardRadius)", got, radius)
	}
	if got := DefaultSpawnParams().RimRing; got != radius-1 {
		t.Errorf("spawn rim ring = %d, want %d (one inside the gate ring)", got, radius-1)
	}
}

// Turning the central knob must move all three in lockstep — this is the property
// that makes a future admin page safe to point at BoardRadius.
func TestBoardRadiusInvariant_TracksTuning(t *testing.T) {
	original := common.Tuning()
	t.Cleanup(func() { common.SetTuning(original) })

	retuned := common.DefaultTuning()
	retuned.BoardRadius = 20
	common.SetTuning(retuned)

	if got := system.DefaultParams().Radius; got != 20 {
		t.Errorf("system radius = %d, want 20 — it did not follow the central knob", got)
	}
	if got := fleet.DefaultMovementParams().BoardRadius; got != 20 {
		t.Errorf("fleet gate ring = %d, want 20 — it did not follow the central knob", got)
	}
	if got := DefaultSpawnParams().RimRing; got != 19 {
		t.Errorf("spawn rim ring = %d, want 19 — it did not follow the central knob", got)
	}
}
