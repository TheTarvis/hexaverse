package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// fleet-movement, "Every Body In the System's Body Table Is a Valid
// Attachment Host" — "A fleet may attach to a belt member or the belt
// feature alike" (re-express-economy-positions tasks.md 3.7).
//
// LOAD-BEARING: every belt-member resolution test in mine-extraction
// (section 2 of this change, e.g. mine/belt_member_resolution_test.go)
// exercises a fleet's docked state via a STUBBED FleetSource whose
// AttachedTo is set DIRECTLY by the fixture, never produced by a real
// commit. This is the one test that proves the game can actually REACH
// that state: a real OrderTo commit targeting a derived belt-member body
// id, resolved by a real BurnResolver against a real *system.BodyTable
// built through the production system.Service.BodyTable — so belt-member
// synthesis (system/bodies.go's `for k := 0; k < AsteroidsPerBelt; k++`
// loop) runs for real, not a hand-rolled stand-in.
//
// EXPECTED GREEN TODAY: attachment is already class-blind (task 3.1) and
// belt-member synthesis into the body table already exists — this test
// exercises the COMBINATION, not new production surface, and is expected
// to pass without any code change from this change's own developer tasks.
func TestOrderTo_Scenario_BurnToADerivedBeltMemberBodyIdAttaches(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	belt := system.Feature{
		Id: "feat-belt-0", Type: system.FeatureBelt, Size: 1.0, Width: 8.0,
		SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "feat-star", Radius: 40, PeriodMs: 600_000}),
	}
	bodies := testBodyTable(t, "sys-0", 6.0, belt)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	const memberId = "feat-belt-0#3"
	if _, ok := bodies.Body(memberId); !ok {
		t.Fatalf("fixture broken: %s not derived into the body table — belt member synthesis did not run", memberId)
	}

	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

	ordered, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{BodyId: memberId})
	if err != nil {
		t.Fatalf("OrderTo's body-existence check rejected a real derived belt-member id %q: %v", memberId, err)
	}
	if ordered.State.Mode != space.ModeBurn {
		t.Fatalf("expected burn, got %v", ordered.State.Mode)
	}
	if ordered.State.Burn.Target.BodyId != memberId {
		t.Fatalf("burn target = %+v, want body %s", ordered.State.Burn.Target, memberId)
	}
	if fa.committed == nil {
		t.Fatalf("expected a committed burn action")
	}

	resolver := BurnResolver(stubBodySourceFixed{bt: bodies})
	res, err := resolver(context.Background(), action.Resolution{
		At:     ordered.State.Burn.ArriveMs,
		Action: action.Action{Id: "action_test"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = Fleet{
				Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
				StateDoc: EncodeKinematicState(ordered.State),
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res.ActorState["attachedTo"] != memberId {
		t.Fatalf("attachedTo after settling a burn ordered at a belt member = %v, want %q", res.ActorState["attachedTo"], memberId)
	}
}
