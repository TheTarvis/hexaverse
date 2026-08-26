package observation

import (
	"context"
	"testing"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/polar"
)

// observation-fog-and-scan, MODIFIED requirement "Ambient Sensor Coverage
// From Own Units" — new scenarios (design.md Decision 1's "the star's shadow
// widens into a genuine cone", flagged as a real gameplay change, not an
// incidental):
//
//  1. "The star's occlusion shadow reaches across the core"
//  2. "The same radius value covers different cell counts across ring bands"

// TestCoverage_Scenario_StarShadowReachesAcrossTheCore proves a cell on the
// opposite side of the core star from a fleet is NOT covered even though the
// star occupies only the single core cell and nothing sits directly on the
// chord between them — the star's pinned occlusion radius (a full radial
// unit, board.StarOcclusionRadius2) blocks any chord passing within it of the
// core, not merely a chord landing exactly on the core cell.
func TestCoverage_Scenario_StarShadowReachesAcrossTheCore(t *testing.T) {
	ctx := context.Background()
	const sys = "sys-star-shadow"
	const corp = "corp-1"
	sched := testSched()

	interiors := fakeInteriors{feats: map[string][]FeatureGeom{
		sys: {{Id: "feat-star", Anchor: board.Cell{Ring: 0, Slot: 0}, Astronomical: true,
			OcclusionRadius2: board.StarOcclusionRadius2, Detail: &FeatureDetail{FeatureType: "star"}}},
	}}
	// A fleet on ring 4, slot 0; the candidate on the SAME ring, the antipodal
	// slot — the chord between them is a diameter through the core.
	const ring = 4
	fleetAt := board.Cell{Ring: ring, Slot: 0}
	candidate := board.Cell{Ring: ring, Slot: sched.Slots(ring) / 2}

	fleets := fakeFleets{byCorp: map[string][]FleetPos{
		corp: {{Id: "f1", CorporationId: corp, SystemId: sys, Cell: fleetAt}},
	}}
	// Ambient radius large enough to reach across the board (2×ring hops),
	// so RANGE is never the limiting factor — only line of sight is.
	svc := NewServiceWith(nil, fleets, interiors, beamLanes{}, common.WorldClock()).
		WithParams(SensorParams{AmbientRadius: 4 * ring}, testScanParams())

	cov, err := svc.Coverage(ctx, corp, sys, 0)
	if err != nil {
		t.Fatalf("Coverage: %v", err)
	}
	if cov.Covers(candidate) {
		t.Fatalf("cell %+v on the far side of the core star from fleet %+v must not be covered — "+
			"the chord between them passes within the star's occlusion radius of the core, even though "+
			"the star occupies only the single core cell and no feature sits ON the chord", candidate, fleetAt)
	}
	// Sanity: this isn't merely "everything is dark" — a cell near the fleet,
	// off that exact diameter, is covered.
	nearby := board.Cell{Ring: ring, Slot: sched.Slots(ring) / 4}
	if !cov.Covers(nearby) {
		t.Fatalf("fixture broken: an open-angle cell %+v near the fleet should be covered", nearby)
	}
}

// TestCoverage_Scenario_SameRadiusCoversDifferentCellCountsAcrossRingBands
// proves the ambient radius is a LATTICE-HOP budget, not a fixed cell count:
// two fleets at the same configured radius, sitting on ring bands whose slot
// counts differ, end up with discs of different total cell counts — grounded
// against board.Within (design.md Decision 6's own primitive), not a
// hand-derived expectation.
func TestCoverage_Scenario_SameRadiusCoversDifferentCellCountsAcrossRingBands(t *testing.T) {
	ctx := context.Background()
	const sys = "sys-bands"
	const corp = "corp-1"
	sched := testSched()
	const radius = 3

	// No occluders — isolate the "different band, different cell count"
	// property from line-of-sight entirely.
	interiors := fakeInteriors{feats: map[string][]FeatureGeom{sys: {}}}

	countCovered := func(center board.Cell) int {
		fleets := fakeFleets{byCorp: map[string][]FleetPos{
			corp: {{Id: "f1", CorporationId: corp, SystemId: sys, Cell: center}},
		}}
		svc := NewServiceWith(nil, fleets, interiors, beamLanes{}, common.WorldClock()).
			WithParams(SensorParams{AmbientRadius: radius}, testScanParams())
		cov, err := svc.Coverage(ctx, corp, sys, 0)
		if err != nil {
			t.Fatalf("Coverage: %v", err)
		}
		n := 0
		for _, c := range allCellsUpTo(sched, sched.MaxRing) {
			if cov.Covers(c) {
				n++
			}
		}
		return n
	}

	innerCount := countCovered(board.Cell{Ring: 1, Slot: 0})
	outerCount := countCovered(board.Cell{Ring: 8, Slot: 0})

	// Ground truth: the SAME radius, via board.Within, from the same two
	// centers, on the same schedule.
	wantInner := len(board.Within(board.Cell{Ring: 1, Slot: 0}, radius, sched))
	wantOuter := len(board.Within(board.Cell{Ring: 8, Slot: 0}, radius, sched))

	if innerCount != wantInner {
		t.Errorf("inner-band disc has %d cells, want %d (board.Within ground truth)", innerCount, wantInner)
	}
	if outerCount != wantOuter {
		t.Errorf("outer-band disc has %d cells, want %d (board.Within ground truth)", outerCount, wantOuter)
	}
	if innerCount == outerCount {
		t.Errorf("both ring bands produced the SAME cell count (%d) at ambient radius %d — "+
			"expected the schedule's uneven angular slot width to produce different totals", innerCount, radius)
	}
}

// allCellsUpTo enumerates every cell in the schedule up to maxRing (inclusive).
func allCellsUpTo(s polar.Schedule, maxRing int) []board.Cell {
	out := []board.Cell{{Ring: 0, Slot: 0}}
	for ring := 1; ring <= maxRing; ring++ {
		for slot := 0; slot < s.Slots(ring); slot++ {
			out = append(out, board.Cell{Ring: ring, Slot: slot})
		}
	}
	return out
}
