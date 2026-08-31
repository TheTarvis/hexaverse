package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/space"
	"hexaverse/system"
)

// These tests pin the "one truth for where a ship is" property on the two verb
// doors that act on a fleet's position: order and cancel. A burn whose
// ArriveMs has passed IS its settled park/drift (space.StateAt folds it
// deterministically — space-kinematics: "A Burn Past Its Arrival Is Its
// Settled Park, With No Extra Persisted State") — but until some read runs
// the authoritative settle, the doc still says burn. A verb that trusted the
// stored state acted from a position the ship left long ago, visibly
// teleporting it back to its old intercept — the 2026-07-14 frozen-ship bug
// family these were written red against, migrated here from the lattice's
// board.Cell/board.StateAt shape to space.Vec3/space.StateAt (design.md
// Decision 4).
//
// The harness is the emulator integration stack (real Firestore, real action
// spine, injected clock) minus the galaxy/system services: every order here
// targets a bare point, which never touches an interior/BodyTable beyond the
// star clearance check, so a minimal fixed BodyTable (one star, no other
// bodies) is enough — if a point-target order starts reaching for more,
// that's a layering change worth a loud failure.

func newStaleArrivalSvc(t *testing.T, bodies *system.BodyTable) (*Service, Dao, *fakeClock, context.Context) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	t.Cleanup(func() { common.CleanupFirestoreTestData(t, client, "fleets", "actions") })
	clk := &fakeClock{now: 0}
	src := stubBodySourceFixed{bt: bodies}
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(burnType, action.KindKinematic, BurnResolver(src))
	dao := NewDaoWithClient(fs)
	svc := NewServiceWith(dao, src, asvc, clk)
	return svc, dao, clk, context.Background()
}

// staleArrivalFixture seeds a fleet, burns it to a point, and advances the
// clock well past arrival WITHOUT any settling read — the doc still says
// burn. It returns the fleet id and the ship's TRUE settled position: a
// point-targeted burn settles to a ParkPoint at the intercept with no further
// motion (space.Burn.Position/Speed both clamp at-or-after ArriveMs), so "the
// ship's live position" is a single, unambiguous point neither test needs a
// second formula to re-derive.
func staleArrivalFixture(t *testing.T, ctx context.Context, svc *Service, dao Dao, clk *fakeClock) (id string, meet space.Vec3) {
	t.Helper()

	seeded := Fleet{
		Id: "fleet-stale-1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 20}}},
	}
	if err := dao.Save(ctx, seeded); err != nil {
		t.Fatal(err)
	}

	dest := space.Vec3{X: 300}
	ordered, err := svc.OrderTo(ctx, seeded.Id, OrderRequest{Point: &dest})
	if err != nil {
		t.Fatal(err)
	}
	if ordered.State.Mode != space.ModeBurn {
		t.Fatalf("expected burn, got %v", ordered.State.Mode)
	}
	meet = ordered.State.Burn.Intercept

	// Well past arrival — long enough that "still burning" would visibly
	// disagree with "arrived and at rest at the intercept" — with no
	// intervening settling read, so the doc still says burn.
	clk.now = ordered.State.Burn.ArriveMs + 60_000
	return ordered.Id, meet
}

// Spec: 0004/S1
// Spec: fleet-movement "Effective Position Resolution" / "In-System Burn
// Order to a Body or a Point" (migrated from the lattice-era 0004/S1).
func TestIntegration_OrderAfterUnsettledArrival_DepartsFromLivePosition(t *testing.T) {
	bodies := testBodyTable(t, "sys-0", 6.0)
	svc, dao, clk, ctx := newStaleArrivalSvc(t, bodies)
	id, meet := staleArrivalFixture(t, ctx, svc, dao, clk)

	reorderedDest := space.Vec3{X: -150}
	reordered, err := svc.OrderTo(ctx, id, OrderRequest{Point: &reorderedDest})
	if err != nil {
		t.Fatal(err)
	}
	if reordered.State.Mode != space.ModeBurn {
		t.Fatalf("expected burn, got %v", reordered.State.Mode)
	}
	from := reordered.State.Burn.Origin
	if from != meet {
		t.Errorf("new burn departs from %+v, want the ship's settled arrival position %+v — "+
			"a stale (unsettled-in-storage) doc must never depart from anywhere else", from, meet)
	}
}

// Spec: 0004/S2
// Spec: fleet-movement "Cut Drive Converts the Burn to a Drift and Goes
// Dark" (migrated from the lattice-era 0004/S2).
func TestIntegration_CancelAfterUnsettledArrival_HoldsAtLivePosition(t *testing.T) {
	bodies := testBodyTable(t, "sys-0", 6.0)
	svc, dao, clk, ctx := newStaleArrivalSvc(t, bodies)
	id, meet := staleArrivalFixture(t, ctx, svc, dao, clk)

	halted, err := svc.Cancel(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if halted.State.Mode != space.ModeDrift || halted.State.Drift == nil {
		t.Fatalf("expected a drift halt, got %+v", halted.State)
	}
	got, err := svc.Position(ctx, halted, bodies)
	if err != nil {
		t.Fatal(err)
	}
	if got != meet {
		t.Errorf("halt position = %+v, want the ship's settled arrival position %+v — "+
			"cancel must not re-anchor the ship anywhere else", got, meet)
	}
}
