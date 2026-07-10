package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/system"
)

// TestIntegration_OrderMoveArrive drives the full M4 stack against the emulator:
// a real generated galaxy + system interior, a seeded fleet ordered to a body,
// and an offline arrival resolved purely by advancing the clock (no scheduler).
func TestIntegration_OrderMoveArrive(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 0}

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	gen, err := gsvc.Generate(ctx, 1, galaxy.DefaultParams())
	if err != nil {
		t.Fatal(err)
	}
	gid := gen.Galaxy.Id
	defer common.CleanupFirestoreTestData(t, client, "galaxies", "galaxy_pointers", "fleets", "actions",
		"galaxies/"+gid+"/systems", "galaxies/"+gid+"/lanes",
		"galaxies/"+gid+"/systems/sys-0/interior", "galaxies/"+gid+"/systems/sys-0/features")

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	interior, err := ssvc.GetOrCreateInterior(ctx, "sys-0")
	if err != nil {
		t.Fatal(err)
	}

	// Pick a coasting (orbiting) feature to intercept + dock.
	var targetID string
	for _, f := range interior.Features {
		if f.Orbit != nil {
			targetID = f.Id
			break
		}
	}
	if targetID == "" {
		t.Skip("generated interior had no orbiting feature")
	}

	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(burnType, action.KindKinematic, BurnResolver(DefaultMovementParams()))
	fsvc := NewServiceWith(NewDaoWithClient(fs), ssvc, asvc, clk)
	// Seed just off the core — the star at (0,0) is not a legal fleet position.
	seeded, err := fsvc.SeedFleet(ctx, "sys-0", "dev-corp", board.Hex{Q: 1, R: 0})
	if err != nil {
		t.Fatal(err)
	}

	// Order to the body → burn with a real ETA.
	ordered, err := fsvc.OrderTo(ctx, seeded.Id, OrderRequest{Target: board.Target{FeatureId: targetID}})
	if err != nil {
		t.Fatal(err)
	}
	if ordered.State.Mode != board.ModeBurn {
		t.Fatalf("expected burn, got %s", ordered.State.Mode)
	}
	arriveTime := ordered.State.Burn.ArriveTime
	if arriveTime <= 0 {
		t.Fatalf("expected a positive ETA, got %d", arriveTime)
	}

	// Read before arrival: still burning.
	clk.now = arriveTime - 1
	mid, err := fsvc.Get(ctx, seeded.Id)
	if err != nil {
		t.Fatal(err)
	}
	if mid.State.Mode != board.ModeBurn {
		t.Fatalf("before ETA should still be burning, got %s", mid.State.Mode)
	}

	// Simulate coming back online well after the ETA: arrival resolved on read.
	clk.now = arriveTime + 1_000
	arrived, err := fsvc.Get(ctx, seeded.Id)
	if err != nil {
		t.Fatal(err)
	}
	if arrived.State.Mode != board.ModeDocked || arrived.State.Docked.ParentId != targetID {
		t.Fatalf("expected docked to %s, got %+v", targetID, arrived.State)
	}

	// Kinematic resolve through the spine also flipped the wrapping action to done
	// and released the single-action slot — one transaction, not two reads.
	if arrived.ActiveActionId != "" {
		t.Fatalf("expected slot released after arrival, got %q", arrived.ActiveActionId)
	}
	act, err := asvc.Get(ctx, ordered.ActiveActionId)
	if err != nil {
		t.Fatal(err)
	}
	if act.Status != action.StatusDone {
		t.Fatalf("burn action status = %s, want done", act.Status)
	}

	// The docked position resolves to the parent body's live hex.
	pos, err := fsvc.Position(ctx, arrived)
	if err != nil {
		t.Fatal(err)
	}
	_ = pos // resolved without error is the assertion (parent lookup succeeded)
}
