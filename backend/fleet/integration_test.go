package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"
)

// TestIntegration_OrderMoveArrive drives the full stack against the emulator:
// a real generated galaxy + system interior + BodyTable, a seeded fleet
// ordered to a real orbiting body, and an offline arrival resolved purely by
// advancing the clock (no scheduler) — migrated from the pre-continuous-space
// discrete-board version (migrate-fleet-to-continuous-burns, design.md Decision 4/16):
// SeedFleet takes a continuous `space.Vec3` park instead of a discrete cell,
// OrderTo names a body id instead of a discrete target, and arrival settles
// into a `space.ParkOrbit` (AttachedTo set) instead of a docked mode.
func TestIntegration_OrderMoveArrive(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 0}

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	meta, err := gsvc.Seed(ctx, 1, galaxy.DefaultParams())
	if err != nil {
		t.Fatal(err)
	}
	gid := meta.Id
	// The world is an infinite field materialized lazily, so there is no "sys-0"
	// any more: the galaxy records its origin system, and that is the anchor
	// every test that needs "a real system" starts from.
	home := meta.OriginSystemId
	defer common.CleanupFirestoreTestData(t, client, append(
		[]string{"galaxies", "galaxy_pointers", "fleets", "actions"},
		galaxy.SubcollectionPaths(gid, home)...)...)

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	interior, err := ssvc.GetOrCreateInterior(ctx, home)
	if err != nil {
		t.Fatal(err)
	}

	// Pick a real orbiting (non-star) body to intercept + dock — Space is the
	// decoded continuous orbital element set system.GetOrCreateInterior
	// populates (system/model.go), the successor to the retired `Orbit`
	// field this test used to key on.
	var targetID string
	for _, f := range interior.Features {
		if f.Type != system.FeatureStar && f.Space != nil {
			targetID = f.Id
			break
		}
	}
	if targetID == "" {
		t.Skip("generated interior had no orbiting feature")
	}

	bt, err := ssvc.BodyTable(ctx, home)
	if err != nil {
		t.Fatal(err)
	}

	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(burnType, action.KindKinematic, BurnResolver(ssvc))
	// The real galaxy service doubles as this stack's GraphSource (it is the
	// only production implementation of LaneCrossing) — full stack, no stub.
	fsvc := NewServiceWith(NewDaoWithClient(fs), ssvc, gsvc, asvc, clk)

	// Seed well clear of the star's own clearance shell — the star at the
	// origin is not a legal fleet position (design.md Decision 14: excluded
	// by geometry alone).
	at := space.Vec3{X: bt.Extent() * 0.5}
	seeded, err := fsvc.SeedFleet(ctx, home, "dev-corp", at, bt.StarSize())
	if err != nil {
		t.Fatal(err)
	}

	// Order to the body → burn with a real ETA.
	ordered, err := fsvc.OrderTo(ctx, seeded.Id, OrderRequest{BodyId: targetID})
	if err != nil {
		t.Fatal(err)
	}
	if ordered.State.Mode != space.ModeBurn {
		t.Fatalf("expected burn, got %v", ordered.State.Mode)
	}
	arriveMs := ordered.State.Burn.ArriveMs
	if arriveMs <= 0 {
		t.Fatalf("expected a positive ETA, got %d", arriveMs)
	}

	// Read before arrival: still burning.
	clk.now = arriveMs - 1
	mid, err := fsvc.Get(ctx, seeded.Id)
	if err != nil {
		t.Fatal(err)
	}
	if mid.State.Mode != space.ModeBurn {
		t.Fatalf("before ETA should still be burning, got %v", mid.State.Mode)
	}

	// Simulate coming back online well after the ETA: arrival resolved on read.
	clk.now = arriveMs + 1_000
	arrived, err := fsvc.Get(ctx, seeded.Id)
	if err != nil {
		t.Fatal(err)
	}
	if arrived.State.Mode != space.ModeParked || arrived.State.Park == nil || arrived.State.Park.BodyId != targetID {
		t.Fatalf("expected a ParkOrbit around %s, got %+v", targetID, arrived.State)
	}
	if host, docked := arrived.DockedTo(); !docked || host != targetID {
		t.Fatalf("expected AttachedTo = %q (set only at resolve — design.md Decision 4/13), got %q (docked=%v)", targetID, host, docked)
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

	// The docked position resolves through the parent body's live position.
	pos, err := fsvc.PositionOf(ctx, arrived)
	if err != nil {
		t.Fatal(err)
	}
	_ = pos // resolved without error is the assertion (parent lookup succeeded)
}
