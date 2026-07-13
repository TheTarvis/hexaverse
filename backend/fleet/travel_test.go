package fleet

import (
	"context"
	"errors"
	"testing"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"

	"go.uber.org/mock/gomock"
)

// orderTravel freezes the trip as a lane-travel action (scope = destination) and
// flips the fleet to lane-transit with a burn-to-gate board leg. (Shared test
// fixtures — fakeGraph/fakeTiers/chainGalaxy/travelSvc — live in routing_test.go.)
// Spec: 0008/S1
func TestOrderTravel_FreezesTripAndCommits(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa := travelSvc(t, clk, map[string]observation.Tier{
		"A": observation.TierExplored, "B": observation.TierExplored, "C": observation.TierRumored,
	})
	f := &Fleet{Id: "fleet_1", CorporationId: "corp", SystemId: "A",
		State: board.MovementState{Mode: board.ModeCoast, Coast: &board.Orbit{Ring: 0}}}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{SystemId: "C"})
	if err != nil {
		t.Fatal(err)
	}
	if got.State.Mode != board.ModeLaneTransit || got.State.LaneTransit == nil {
		t.Fatalf("expected lane-transit, got %s", got.State.Mode)
	}
	lt := got.State.LaneTransit
	if len(lt.Route) != 3 || lt.Route[2] != "C" {
		t.Fatalf("route = %v", lt.Route)
	}
	// LegEtas are evenly spaced by the per-leg cost: each fixture lane is 10 units
	// long, so a leg costs 10 × the drive speed. Derived from the params (not a
	// hardcoded number) so retuning common/tuning.go doesn't break the travel math.
	wantLeg := common.WorldMillis(10 * svc.params.LaneMsPerDistance)
	if lt.LegEtas[1]-lt.LegEtas[0] != wantLeg || lt.LegEtas[2]-lt.LegEtas[1] != wantLeg {
		t.Fatalf("leg spacing wrong: %v (want each leg %d ms apart)", lt.LegEtas, wantLeg)
	}
	if lt.ArriveTime != lt.LegEtas[2] {
		t.Fatalf("arriveTime %d != last legEta %d", lt.ArriveTime, lt.LegEtas[2])
	}
	if lt.BoardLeg == nil || board.Ring(lt.BoardLeg.Path[len(lt.BoardLeg.Path)-1]) != svc.params.BoardRadius {
		t.Fatalf("board leg should burn to a rim gate: %+v", lt.BoardLeg)
	}
	if board.Ring(lt.EntryGate) != svc.params.BoardRadius {
		t.Fatalf("entry gate should sit on the rim: %v", lt.EntryGate)
	}
	if fa.committed == nil || fa.committed.Type != travelType || fa.committed.Scope != "C" {
		t.Fatalf("expected a lane-travel commit scoped to C, got %+v", fa.committed)
	}
	if fa.committed.Eta != lt.ArriveTime {
		t.Fatalf("commit eta %d != arriveTime %d", fa.committed.Eta, lt.ArriveTime)
	}
}

// Spec: 0008/S2
func TestOrderTravel_NoRouteSurfacesSentinel(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _ := travelSvc(t, clk, map[string]observation.Tier{"A": observation.TierExplored})
	f := &Fleet{Id: "fleet_1", CorporationId: "corp", SystemId: "A",
		State: board.MovementState{Mode: board.ModeCoast, Coast: &board.Orbit{Ring: 0}}}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)
	// D is unreached and behind uncharted B — no route.
	if _, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{SystemId: "D"}); !errors.Is(err, ErrNoRoute) {
		t.Fatalf("expected ErrNoRoute, got %v", err)
	}
}

// A mid-lane cancel parks the fleet in lane-hold at its frozen fraction.
// Spec: 0008/S4
func TestCancel_MidLaneHolds(t *testing.T) {
	clk := &fakeClock{now: 400} // between B (300) and C (500) on the second lane
	svc, dao, _ := travelSvc(t, clk, map[string]observation.Tier{"A": observation.TierExplored})
	lt := &board.LaneTransit{
		BoardLeg:   &board.BoardLeg{Path: []board.Hex{{Q: 0, R: 0}}, StartTime: 0, GateEta: 100},
		Route:      []string{"A", "B", "C"},
		LegEtas:    []common.WorldMillis{100, 300, 500},
		ArriveTime: 500,
	}
	f := &Fleet{Id: "fleet_1", CorporationId: "corp", SystemId: "A", ActiveActionId: "act",
		State: board.MovementState{Mode: board.ModeLaneTransit, LaneTransit: lt}}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.Cancel(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if got.State.Mode != board.ModeLaneHold || got.State.LaneHold == nil {
		t.Fatalf("expected lane-hold, got %s", got.State.Mode)
	}
	h := got.State.LaneHold
	if h.From != "B" || h.To != "C" || h.Fraction != 0.5 {
		t.Fatalf("hold wrong: %+v", h)
	}
	if got.ActiveActionId != "" {
		t.Fatalf("cancel should release the slot")
	}
}
