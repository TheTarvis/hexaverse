package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
)

// These tests pin the "one truth for where a ship is" property on the two verb
// doors that act on a fleet's position: order and cancel. A burn whose
// arriveTime has passed IS a coast (board.StateAt anchors the orbit at the
// arrival instant) — but until some read runs the authoritative settle, the doc
// still says burn. A verb that trusted the stored state acted from a position
// the ship left long ago, visibly teleporting it back to its old meet cell —
// the 2026-07-14 frozen-ship bug family these were written red against.
//
// The harness is the emulator integration stack (real Firestore, real action
// spine, injected clock) minus the galaxy/system services: every order here
// targets a bare cell, which never touches an interior, so systemSvc is nil on
// purpose — if a cell-target order starts reaching for the interior, that's a
// layering change worth a loud failure.

// staleArrivalFixture seeds a fleet, burns it to a cell, and advances the clock
// a third of an orbit past the arrival WITHOUT any settling read. It returns
// the fleet id, the meet cell the burn ended on, and the ship's true position
// at the (now-current) clock — where the settled coast has carried it.
func staleArrivalFixture(t *testing.T, ctx context.Context, fsvc *Service, clk *fakeClock) (id string, meet, livePos board.Cell) {
	t.Helper()

	seeded, err := fsvc.SeedFleet(ctx, "sys-0", "dev-corp", board.Cell{Ring: 1, Slot: 0})
	if err != nil {
		t.Fatal(err)
	}

	dest := board.Cell{Ring: 6, Slot: 0}
	ordered, err := fsvc.OrderTo(ctx, seeded.Id, OrderRequest{Target: board.Target{Cell: &dest}})
	if err != nil {
		t.Fatal(err)
	}
	if ordered.State.Mode != board.ModeBurn {
		t.Fatalf("expected burn, got %s", ordered.State.Mode)
	}
	burn := ordered.State.Burn
	meet = burn.Path[len(burn.Path)-1]

	// A third of the meet ring's orbit past arrival: long enough that the coast
	// has carried the ship well away from the meet cell, and nothing has read the
	// fleet since, so the doc still says burn.
	period := common.Tuning().OrbitPeriod(meet.Ring)
	clk.now = burn.ArriveTime + period/3

	// Where the ship actually is: the settled coast (anchored through the meet
	// cell at the ARRIVAL instant — the same transition settleArrival/BurnResolver
	// encode) evaluated at the current clock.
	settled := board.CoastAt(meet, burn.ArriveTime, testSched())
	livePos = board.OrbState(*settled.Coast, clk.now, testSched())
	if livePos == meet {
		t.Fatalf("fixture is vacuous: a third of an orbit left the ship on its meet cell %+v", meet)
	}
	return ordered.Id, meet, livePos
}

func newStaleArrivalSvc(t *testing.T) (*Service, *fakeClock, context.Context) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	t.Cleanup(func() { common.CleanupFirestoreTestData(t, client, "fleets", "actions") })
	clk := &fakeClock{now: 0}
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(burnType, action.KindKinematic, BurnResolver(DefaultMovementParams()))
	return NewServiceWith(NewDaoWithClient(fs), nil, asvc, clk), clk, context.Background()
}

// Spec: 0004/S1
func TestIntegration_OrderAfterUnsettledArrival_DepartsFromLivePosition(t *testing.T) {
	fsvc, clk, ctx := newStaleArrivalSvc(t)
	id, meet, livePos := staleArrivalFixture(t, ctx, fsvc, clk)

	// Re-order with NO intervening read — nothing has settled the finished burn.
	reorderedDest := board.Cell{Ring: 9, Slot: 40}
	reordered, err := fsvc.OrderTo(ctx, id, OrderRequest{Target: board.Target{Cell: &reorderedDest}})
	if err != nil {
		t.Fatal(err)
	}
	if reordered.State.Mode != board.ModeBurn {
		t.Fatalf("expected burn, got %s", reordered.State.Mode)
	}
	from := reordered.State.Burn.Path[0]
	if from != livePos {
		t.Errorf("new burn departs from %+v, want the ship's live coast position %+v (stale doc's meet cell is %+v — the ship teleported back to where its finished burn ended)",
			from, livePos, meet)
	}
}

// Spec: 0004/S2
func TestIntegration_CancelAfterUnsettledArrival_HoldsAtLivePosition(t *testing.T) {
	fsvc, clk, ctx := newStaleArrivalSvc(t)
	id, meet, livePos := staleArrivalFixture(t, ctx, fsvc, clk)

	halted, err := fsvc.Cancel(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if halted.State.Mode != board.ModeCoast || halted.State.Coast == nil {
		t.Fatalf("expected a coast halt, got %+v", halted.State)
	}
	got := board.OrbState(*halted.State.Coast, clk.now, testSched())
	if got != livePos {
		t.Errorf("halt coast passes through %+v at cancel time, want the ship's live position %+v (stale doc's meet cell is %+v — cancel re-anchored the ship where its finished burn ended)",
			got, livePos, meet)
	}
}
