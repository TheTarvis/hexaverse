package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/observation"
	"hexaverse/system"
)

// TestIntegration_TravelArriveReveals drives the full M8 stack against the
// emulator: a real galaxy graph, a seeded fleet ordered to a Rumored neighbour,
// and an offline arrival resolved by advancing the clock — landing the fleet
// coasting at the destination rim, flipping the destination to Explored, and
// materializing its interior (the first-arrival detail roll).
// Spec: 0008/S3
func TestIntegration_TravelArriveReveals(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 0}

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	gen, err := gsvc.Generate(ctx, 1, galaxy.DefaultParams())
	if err != nil {
		t.Fatal(err)
	}
	gid := gen.Galaxy.Id

	// A neighbour of sys-0 to travel to, and the lane that reaches it.
	var neighbor, laneID string
	for _, l := range gen.Lanes {
		if l.AId == "sys-0" {
			neighbor, laneID = l.BId, l.Id
			break
		}
		if l.BId == "sys-0" {
			neighbor, laneID = l.AId, l.Id
			break
		}
	}
	if neighbor == "" {
		t.Skip("generated galaxy gave sys-0 no lane")
	}

	defer common.CleanupFirestoreTestData(t, client, "galaxies", "galaxy_pointers", "fleets", "actions", "corporations",
		"galaxies/"+gid+"/systems", "galaxies/"+gid+"/lanes",
		"galaxies/"+gid+"/systems/sys-0/interior", "galaxies/"+gid+"/systems/sys-0/features",
		"galaxies/"+gid+"/systems/"+neighbor+"/interior", "galaxies/"+gid+"/systems/"+neighbor+"/features")

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	odao := observation.NewDaoWithClient(fs)
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	fsvc := NewServiceWith(NewDaoWithClient(fs), ssvc, asvc, clk)
	// fog depends on the fleet service (live positions); the fleet service's
	// travel depends on fog (tiers) — wire fog after fsvc, then back-inject.
	fogSvc := observation.NewServiceWith(odao, fsvc, ssvc, gsvc, clk)
	fsvc.WithTravel(gsvc, fogSvc)
	RegisterTravelResolver(asvc, fogSvc)

	const corp = "dev-corp"
	// The corp knows the neighbour as a Rumored terminal AND has charted the lane
	// to it (#0006 Decision #17: a scan wrote both; routing needs the lane doc).
	if err := odao.UpsertSystemObservation(ctx, corp, observation.SystemObservation{
		SystemId: neighbor, Tier: observation.TierRumored, AsOf: 0,
	}); err != nil {
		t.Fatal(err)
	}
	if err := odao.UpsertLane(ctx, corp, observation.LaneObservation{
		LaneId: laneID, Via: observation.ViaScanned, AsOf: 0,
	}); err != nil {
		t.Fatal(err)
	}

	seeded, err := fsvc.SeedFleet(ctx, "sys-0", corp, board.Hex{Q: 1, R: 0})
	if err != nil {
		t.Fatal(err)
	}

	ordered, err := fsvc.OrderTo(ctx, seeded.Id, OrderRequest{SystemId: neighbor})
	if err != nil {
		t.Fatal(err)
	}
	if ordered.State.Mode != board.ModeLaneTransit {
		t.Fatalf("expected lane-transit, got %s", ordered.State.Mode)
	}
	arriveTime := ordered.State.LaneTransit.ArriveTime

	// Before arrival: still in transit.
	clk.now = arriveTime - 1
	mid, err := fsvc.Get(ctx, seeded.Id)
	if err != nil {
		t.Fatal(err)
	}
	if mid.State.Mode != board.ModeLaneTransit {
		t.Fatalf("before ETA should still be in transit, got %s", mid.State.Mode)
	}

	// Come back online after the ETA: arrival resolves on read.
	clk.now = arriveTime + 1_000
	arrived, err := fsvc.Get(ctx, seeded.Id)
	if err != nil {
		t.Fatal(err)
	}
	if arrived.State.Mode != board.ModeCoast {
		t.Fatalf("expected coast at destination, got %s", arrived.State.Mode)
	}
	if arrived.SystemId != neighbor {
		t.Fatalf("expected fleet in %s, got %s", neighbor, arrived.SystemId)
	}
	if arrived.ActiveActionId != "" {
		t.Fatalf("expected slot released after arrival")
	}
	// Landed coasting on the destination board's rim (a lane gate tile).
	if pos := board.OrbState(*arrived.State.Coast, clk.now); board.Ring(pos) != DefaultMovementParams().BoardRadius {
		t.Fatalf("expected coast on the rim, got ring %d", board.Ring(pos))
	}

	// The destination flipped to Explored (the arrival reveal).
	obs, err := odao.GetSystemObservation(ctx, corp, neighbor)
	if err != nil {
		t.Fatal(err)
	}
	if obs == nil || obs.Tier != observation.TierExplored {
		t.Fatalf("expected %s Explored after arrival, got %+v", neighbor, obs)
	}

	// The first-arrival detail roll materialized the destination interior.
	destInterior, err := ssvc.GetOrCreateInterior(ctx, neighbor)
	if err != nil {
		t.Fatal(err)
	}
	if destInterior.Interior.SystemId != neighbor {
		t.Fatalf("destination interior not materialized")
	}
}
