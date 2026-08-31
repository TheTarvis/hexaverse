package fleet

// RED-phase tests for tasks.md 3.10 — `fleet.ErrCoreDestination` and its
// destination-identity special case are deleted; the star is excluded
// SOLELY by `space.BuildCurve`'s endpoint-clearance guard (design.md
// Decision 14; fleet-movement "In-System Burn Order to a Body or a Point" —
// "ordering the star's own body id is rejected by geometry").
//
// This test deliberately does NOT reference fleet.ErrCoreDestination (that
// sentinel has no successor per Decision 14) — it asserts the OBSERVABLE
// rejection reason is space's own geometry guard, so a reintroduced
// destination-identity special case would fail this test by producing a
// DIFFERENT error than space.ErrEndpointInsideClearance.

import (
	"context"
	"errors"
	"testing"

	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

func TestOrderTo_Scenario_OrderingTheStarsBodyIdRejectedByGeometryAlone(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0) // star "feat-star", size 6 => clearance 15
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	f := freshParkedFleet()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	_, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{BodyId: "feat-star"})
	if err == nil {
		t.Fatal("ordering a burn to the star's own body id succeeded, want rejection")
	}
	if !errors.Is(err, space.ErrEndpointInsideClearance) {
		t.Fatalf("err = %v, want it to trace to space.ErrEndpointInsideClearance — "+
			"design.md Decision 14: the star is excluded by geometry ALONE, no destination-identity special case", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected order must not commit an action: %+v", fa.committed)
	}
}
