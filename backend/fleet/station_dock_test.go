package fleet

import (
	"context"
	"testing"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/system"
)

// stationSystem is fakeSystem plus a spliced trading station — the shape
// system.Service.GetOrCreateInterior actually returns once the station store is
// wired. The station ORBITS at a real pace (not the effectively-static period
// the other fixtures use), so a test can prove the position tracks world time.
//
// tasks.md 6.2 (this file lives in fleet's package, task 6.2's note): the
// station's cell is re-derived from the live schedule's slot count on ring
// stationRing, not merely re-typed from the retired 6×ring assumption.
type stationSystem struct{}

const (
	stationRing   = 6
	stationAngle0 = 3
	stationPeriod = common.WorldMillis(60_000)
)

func (f *stationSystem) GetOrCreateInterior(context.Context, string) (*system.GeneratedInterior, error) {
	orb := &system.Orbit{Ring: stationRing, Angle0: stationAngle0, Period: stationPeriod, Dir: 1}
	anchor := board.OrbState(board.Orbit{Ring: stationRing, Angle0: stationAngle0, Period: stationPeriod, Dir: 1}, 0, testSched())
	return &system.GeneratedInterior{
		Interior: system.SystemInterior{SystemId: "sys-0", Radius: 16},
		Features: []system.Feature{
			{Id: "feat-star", Type: system.FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
			{Id: "feat-station", Type: system.FeatureStation, Orbit: orb,
				Footprint: []board.Cell{anchor}},
		},
	}, nil
}

func (f *stationSystem) LaneGates(context.Context, string, int) ([]system.LaneGate, error) {
	return nil, nil
}

// TestPosition_DockedToStationRidesItsLiveOrbit pins design.md Decision 4's
// "zero new code" claim rather than assuming it: Position's existing
// featureOrbit/board.OrbState branch must resolve a fleet docked to a station
// exactly as it does for any other orbiting feature.
//
// If a future change made the station fixed (or dropped its orbital elements),
// this test fails — which is the point.
func TestPosition_DockedToStationRidesItsLiveOrbit(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc := NewServiceWith(nil, &stationSystem{}, nil, clk)

	docked := &Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-0",
		State: board.MovementState{
			Mode:   board.ModeDocked,
			Docked: &board.Docked{ParentId: "feat-station"},
		},
	}

	got, err := svc.Position(context.Background(), docked)
	if err != nil {
		t.Fatalf("Position: %v", err)
	}
	want := board.OrbState(board.Orbit{Ring: stationRing, Angle0: stationAngle0, Period: stationPeriod, Dir: 1}, clk.Now(), testSched())
	if got != want {
		t.Errorf("docked-to-station position = %+v, want the station's live orbital cell %+v", got, want)
	}
	// A docked fleet must not be parked at the core.
	if got == (board.Cell{Ring: 0, Slot: 0}) {
		t.Error("docked fleet resolved to the core rather than the station's ring")
	}
}

// TestPosition_DockedToStationTracksWorldTime proves the fleet actually RIDES
// the orbit rather than freezing at the station's epoch anchor: half a period
// later it must be somewhere else.
func TestPosition_DockedToStationTracksWorldTime(t *testing.T) {
	docked := &Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-0",
		State: board.MovementState{
			Mode:   board.ModeDocked,
			Docked: &board.Docked{ParentId: "feat-station"},
		},
	}

	atEpoch := NewServiceWith(nil, &stationSystem{}, nil, &fakeClock{now: 0})
	early, err := atEpoch.Position(context.Background(), docked)
	if err != nil {
		t.Fatalf("Position at epoch: %v", err)
	}

	// Half a revolution later.
	atHalf := NewServiceWith(nil, &stationSystem{}, nil, &fakeClock{now: stationPeriod / 2})
	later, err := atHalf.Position(context.Background(), docked)
	if err != nil {
		t.Fatalf("Position at half period: %v", err)
	}

	if early == later {
		t.Errorf("docked position %+v is unchanged half a period later — the fleet is not riding the station's orbit", early)
	}
}
