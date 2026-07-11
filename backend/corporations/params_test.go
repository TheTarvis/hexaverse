package corporations

import "testing"

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
	// The starting hull coasts one ring inside the lane-gate ring (board radius 16).
	if p.RimRing != 15 {
		t.Fatalf("RimRing = %d, want 15 (one inside the gate ring)", p.RimRing)
	}
}
