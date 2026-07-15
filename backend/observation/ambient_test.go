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
			{Id: "feat-star", Anchor: board.Hex{Q: 0, R: 0}, Astronomical: true,
				Detail: &FeatureDetail{FeatureType: "star", Resources: []ResourceReading{{Kind: "metals", Richness: 1}}}},
			{Id: "feat-body-0", Elements: &board.Orbit{Ring: 2, Angle0: 0, Period: 0, Dir: 1},
				Detail: &FeatureDetail{FeatureType: "rocky", Resources: []ResourceReading{{Kind: "metals", Richness: 0.8}}}},
			{Id: "feat-far", Elements: &board.Orbit{Ring: 20, Angle0: 0, Period: 0, Dir: 1}},
		},
	}}
	// dao is unused by AmbientWrites; default sensor radius is 3.
	svc := NewServiceWith(nil, fakeFleets{}, interiors, beamLanes{}, common.WorldClock())

	path := []board.Hex{{Q: 0, R: 0}, {Q: 1, R: 0}}
	writes, err := svc.AmbientWrites(context.Background(), "corpX", sys, path, common.WorldMillis(0))
	if err != nil {
		t.Fatalf("ambient writes: %v", err)
	}

	got := map[string]map[string]interface{}{}
	for _, w := range writes {
		got[w.Path[len(w.Path)-1]] = w.Data
	}
	// The star (dist 0) and the ring-2 body (dist 2 ≤ radius 3) were swept; the
	// ring-20 feature was not.
	if _, ok := got["feat-star"]; !ok {
		t.Errorf("swept star not recorded")
	}
	if _, ok := got["feat-body-0"]; !ok {
		t.Errorf("swept ring-2 body not recorded")
	}
	if _, ok := got["feat-far"]; ok {
		t.Errorf("ring-20 feature recorded despite being far outside the bubble")
	}
	// Presence-only: no composition detail leaks through ambient.
	for id, data := range got {
		if _, leaked := data["detail"]; leaked {
			t.Errorf("ambient memory for %s leaked composition detail (scan is the only minter)", id)
		}
	}
}
