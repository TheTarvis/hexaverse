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
// coasting at the destination's gate ring, flipping the destination to Explored,
// and materializing its interior (the first-arrival detail roll).
// Spec: 0008/S3
func TestIntegration_TravelArriveReveals(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 0}

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	meta, err := gsvc.Seed(ctx, 1, galaxy.DefaultParams())
	if err != nil {
		t.Fatal(err)
	}
	gid := meta.Id
	home := meta.OriginSystemId

	// A neighbour of the origin to travel to, and the lane that reaches it.
	live, err := gsvc.GetLive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var neighbor, laneID string
	for _, l := range live.Lanes {
		if l.AId == home {
			neighbor, laneID = l.BId, l.Id
			break
		}
		if l.BId == home {
			neighbor, laneID = l.AId, l.Id
			break
		}
	}
	if neighbor == "" {
		t.Skip("the seeded start area gave the origin system no lane")
	}

	defer common.CleanupFirestoreTestData(t, client, append(
		[]string{"galaxies", "galaxy_pointers", "fleets", "actions", "corporations", "corpByAccount", "spawnClaims"},
		galaxy.SubcollectionPaths(gid, home, neighbor)...)...)

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

	seeded, err := fsvc.SeedFleet(ctx, home, corp, board.Cell{Ring: 1, Slot: 0})
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
	// Landed coasting on the destination's gate ring (the lane-mouth tile —
	// three rings in from the rim, board.GateRing).
	wantRing := board.GateRing(DefaultMovementParams().BoardRadius)
	if pos := board.OrbState(*arrived.State.Coast, clk.now, testSched()); pos.Ring != wantRing {
		t.Fatalf("expected coast on the gate ring %d, got ring %d", wantRing, pos.Ring)
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
