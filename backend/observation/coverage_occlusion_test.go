package observation

import (
	"context"
	"testing"

	"hexaverse/board"
	"hexaverse/common"
)

// TestFleetVisibleTo_AmbientBubbleIsOccluded pins #0006 Decision #16: the
// passive bubble obeys the same line-of-sight law as the beam. A foreign fleet
// inside my ambient radius but behind a large body is hidden; one at an open
// angle is seen; my own fleet is never fogged.
//
// Spec: 0006/S8
func TestFleetVisibleTo_AmbientBubbleIsOccluded(t *testing.T) {
	ctx := context.Background()
	const sys = "sys-1"
	const me = "corp-me"
	const them = "corp-them"
	sched := testSched()

	// My sensor sits at the core; a large body squats at ring 2, slot 0 (the
	// same ray every schedule's slot 0 sits on — verified against the pinned
	// coordinate table).
	fleets := fakeFleets{byCorp: map[string][]FleetPos{
		me: {{Id: "mine", CorporationId: me, SystemId: sys, Cell: board.Cell{Ring: 0, Slot: 0}}},
	}}
	interiors := beamInteriors{feats: map[string][]FeatureGeom{
		sys: {{Id: "feat-planet", Anchor: board.Cell{Ring: 2, Slot: 0}, OcclusionRadius2: board.PlanetOcclusionRadius2,
			Detail: &FeatureDetail{FeatureType: "rocky"}}},
	}}
	svc := NewServiceWith(nil, fleets, interiors, beamLanes{}, common.WorldClock()).
		WithParams(SensorParams{AmbientRadius: 5}, testScanParams())

	// Directly beyond the planet, same slot-0 ray — collinear, in shadow.
	behind := FleetPos{Id: "hidden", CorporationId: them, SystemId: sys, Cell: board.Cell{Ring: 4, Slot: 0}}
	if vis, err := svc.FleetVisibleTo(ctx, me, behind, 0); err != nil {
		t.Fatalf("visibility (behind): %v", err)
	} else if vis {
		t.Errorf("a fleet behind a large body must be hidden even inside the ambient radius")
	}

	// A quarter-turn away from the planet's ray on ring 3 — nowhere near the
	// chord to the planet, in clear line of sight.
	openSlot := sched.Slots(3) / 4
	open := FleetPos{Id: "open", CorporationId: them, SystemId: sys, Cell: board.Cell{Ring: 3, Slot: openSlot}}
	if vis, err := svc.FleetVisibleTo(ctx, me, open, 0); err != nil {
		t.Fatalf("visibility (open): %v", err)
	} else if !vis {
		t.Errorf("a fleet at an open angle inside the ambient radius must be visible")
	}

	// Own perception is never fogged — even behind the planet.
	ownBehind := FleetPos{Id: "own", CorporationId: me, SystemId: sys, Cell: board.Cell{Ring: 4, Slot: 0}}
	if vis, err := svc.FleetVisibleTo(ctx, me, ownBehind, 0); err != nil {
		t.Fatalf("visibility (own): %v", err)
	} else if !vis {
		t.Errorf("a corp must always see its own fleet, occluders or not")
	}
}

// Coverage's occlusion is the same primitive every consumer computes through —
// the board read's ambient band uses Covers directly.
func TestCoverage_CoversRespectsLineOfSight(t *testing.T) {
	sched := testSched()
	cov := NewCoverageWithOccluders(5, []board.Occluder{{Cell: board.Cell{Ring: 2, Slot: 0}, Radius2: board.PlanetOcclusionRadius2}},
		sched, board.Cell{Ring: 0, Slot: 0})
	if cov.Covers(board.Cell{Ring: 4, Slot: 0}) {
		t.Errorf("cell behind the occluder must not be covered")
	}
	if !cov.Covers(board.Cell{Ring: 2, Slot: 0}) {
		t.Errorf("the occluder's own cell is covered (first body on the line is seen)")
	}
	if !cov.Covers(board.Cell{Ring: 3, Slot: sched.Slots(3) / 4}) {
		t.Errorf("open cell inside the radius must be covered")
	}
	if cov.Covers(board.Cell{Ring: 6, Slot: 0}) {
		t.Errorf("cell beyond the radius must not be covered")
	}
}
