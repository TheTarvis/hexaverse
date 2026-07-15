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

	// My sensor sits at the origin; a large body squats at (2,0).
	fleets := fakeFleets{byCorp: map[string][]FleetPos{
		me: {{Id: "mine", CorporationId: me, SystemId: sys, Hex: board.Hex{Q: 0, R: 0}}},
	}}
	interiors := beamInteriors{feats: map[string][]FeatureGeom{
		sys: {{Id: "feat-planet", Anchor: board.Hex{Q: 2, R: 0}, Occludes: true,
			Detail: &FeatureDetail{FeatureType: "rocky"}}},
	}}
	svc := NewServiceWith(nil, fleets, interiors, beamLanes{}, common.WorldClock()).
		WithParams(SensorParams{AmbientRadius: 5}, testScanParams())

	behind := FleetPos{Id: "hidden", CorporationId: them, SystemId: sys, Hex: board.Hex{Q: 4, R: 0}}
	if vis, err := svc.FleetVisibleTo(ctx, me, behind, 0); err != nil {
		t.Fatalf("visibility (behind): %v", err)
	} else if vis {
		t.Errorf("a fleet behind a large body must be hidden even inside the ambient radius")
	}

	open := FleetPos{Id: "open", CorporationId: them, SystemId: sys, Hex: board.Hex{Q: 0, R: 3}}
	if vis, err := svc.FleetVisibleTo(ctx, me, open, 0); err != nil {
		t.Fatalf("visibility (open): %v", err)
	} else if !vis {
		t.Errorf("a fleet at an open angle inside the ambient radius must be visible")
	}

	// Own perception is never fogged — even behind the planet.
	ownBehind := FleetPos{Id: "own", CorporationId: me, SystemId: sys, Hex: board.Hex{Q: 4, R: 0}}
	if vis, err := svc.FleetVisibleTo(ctx, me, ownBehind, 0); err != nil {
		t.Fatalf("visibility (own): %v", err)
	} else if !vis {
		t.Errorf("a corp must always see its own fleet, occluders or not")
	}
}

// Coverage's occlusion is the same primitive every consumer computes through —
// the board read's ambient band uses Covers directly.
func TestCoverage_CoversRespectsLineOfSight(t *testing.T) {
	cov := NewCoverageWithOccluders(5, []board.Hex{{Q: 2, R: 0}}, board.Hex{Q: 0, R: 0})
	if cov.Covers(board.Hex{Q: 4, R: 0}) {
		t.Errorf("hex behind the occluder must not be covered")
	}
	if !cov.Covers(board.Hex{Q: 2, R: 0}) {
		t.Errorf("the occluder's own hex is covered (first body on the line is seen)")
	}
	if !cov.Covers(board.Hex{Q: 0, R: 3}) {
		t.Errorf("open hex inside the radius must be covered")
	}
	if cov.Covers(board.Hex{Q: 0, R: 6}) {
		t.Errorf("hex beyond the radius must not be covered")
	}
}
