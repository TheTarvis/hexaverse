package system

import (
	"testing"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"
)

// TestProjectFogged_ThreeBands proves the board fog places each feature in the
// right band: covered → Visible (live detail), scanned-but-uncovered →
// Remembered (frozen at asOf), an uncovered major body → the free Astronomical
// layer (no worth), and an uncovered/unremembered detail feature → Unseen
// (dropped).
//
// SDET NOTE: projectFogged is unexported and gains a threaded polar.Schedule
// parameter under this migration (design.md Decision 3 — system's fog
// projection sources its schedule from SystemInterior.Radius, never a
// literal). No other artifact pins this private signature, so this test
// specifies it: `projectFogged(gen, cov, remembered, now, sched)`.
func TestProjectFogged_ThreeBands(t *testing.T) {
	const radius = 16
	sched := board.Schedule(radius)
	gen := &GeneratedInterior{
		Interior: SystemInterior{SystemId: "s", Radius: radius},
		Features: []Feature{
			// At the centre — inside coverage → Visible.
			{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
			// A major body far out, uncovered, unremembered → free Astronomical layer.
			{Id: "feat-body-0", Type: FeatureRocky, Orbit: &Orbit{Ring: 3, Angle0: 0, Period: 0, Dir: 1},
				Footprint: []board.Cell{{Ring: 3, Slot: 0}}, Resources: []Resource{{Kind: ResourceMetals, Richness: 0.5}}},
			// A belt scanned earlier, now uncovered → Remembered WITH composition.
			{Id: "feat-belt-0", Type: FeatureBelt, Orbit: &Orbit{Ring: 5, Angle0: 0, Period: 0, Dir: 1},
				Footprint: []board.Cell{{Ring: 5, Slot: 0}}, Resources: []Resource{{Kind: ResourceVolatiles, Richness: 0.9}}},
			// A belt only ever passed (ambient) → Remembered but presence-only.
			{Id: "feat-belt-1", Type: FeatureBelt, Orbit: &Orbit{Ring: 8, Angle0: 3, Period: 0, Dir: 1},
				Footprint: []board.Cell{{Ring: 8, Slot: 0}}, Resources: []Resource{{Kind: ResourceMetals, Richness: 0.4}}},
			// A belt never seen → Unseen, dropped.
			{Id: "feat-belt-2", Type: FeatureBelt, Orbit: &Orbit{Ring: 10, Angle0: 1, Period: 0, Dir: 1},
				Footprint: []board.Cell{{Ring: 10, Slot: 0}}},
		},
	}
	cov := observation.NewCoverage(1, sched, board.Cell{Ring: 0, Slot: 0}) // covers the star only
	remembered := map[string]observation.FeatureMemory{
		// Scanned: composition earned.
		"feat-belt-0": {AsOf: 500, Detail: &observation.FeatureDetail{
			FeatureType: "belt", Resources: []observation.ResourceReading{{Kind: "volatiles", Richness: 0.9}}}},
		// Ambient presence: geometry only, no Detail.
		"feat-belt-1": {AsOf: 700},
	}

	out := projectFogged(gen, cov, remembered, common.WorldMillis(0), sched)

	byID := map[string]fogFeatureDTO{}
	for _, f := range out {
		byID[f.Id] = f
	}
	if len(out) != 4 {
		t.Fatalf("projected %d features, want 4 (belt-2 unseen)", len(out))
	}
	if _, dropped := byID["feat-belt-2"]; dropped {
		t.Errorf("an unseen detail feature leaked into the projection")
	}

	if star := byID["feat-star"]; star.Band != bandVisible || !star.Live {
		t.Errorf("star band = %q live=%v, want visible/live", star.Band, star.Live)
	}
	body := byID["feat-body-0"]
	if body.Band != bandAstronomical {
		t.Errorf("uncovered major body band = %q, want astronomical", body.Band)
	}
	if body.Resources != nil {
		t.Errorf("astronomical layer leaked worth (resources) for %s", body.Id)
	}
	belt := byID["feat-belt-0"]
	if belt.Band != bandRemembered {
		t.Errorf("scanned uncovered belt band = %q, want remembered", belt.Band)
	}
	if belt.AsOf == nil || *belt.AsOf != 500 {
		t.Errorf("remembered belt asOf = %v, want 500 (activity frozen at observation time)", belt.AsOf)
	}
	if len(belt.Resources) == 0 {
		t.Errorf("scanned remembered belt lost its earned composition")
	}
	// Presence-only memory: it's drawn (Remembered), but its worth stays hidden —
	// scan is the only minter of composition.
	ambient := byID["feat-belt-1"]
	if ambient.Band != bandRemembered {
		t.Errorf("ambient-remembered belt band = %q, want remembered", ambient.Band)
	}
	if ambient.Resources != nil {
		t.Errorf("presence-only memory leaked composition for %s (scan is the only minter)", ambient.Id)
	}
}
