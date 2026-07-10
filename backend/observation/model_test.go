package observation

import "testing"

// TestTierOrdering locks the monotonic ladder the reveal writes rely on.
func TestTierOrdering(t *testing.T) {
	if !TierExplored.AtLeast(TierSurveyed) || !TierSurveyed.AtLeast(TierRumored) || !TierRumored.AtLeast(TierStarVisible) {
		t.Errorf("tier ordering broken: explored≥surveyed≥rumored≥starVisible must hold")
	}
	if Max(TierRumored, TierExplored) != TierExplored {
		t.Errorf("Max(rumored, explored) = %q, want explored", Max(TierRumored, TierExplored))
	}
	if TierStarVisible.AtLeast(TierRumored) {
		t.Errorf("starVisible must not rank at/above rumored")
	}
}
