package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 5.3 — the two clauses of "Jump Arrival Parks Near the
// Destination Gate, Unmasked" that live at the SERVICE level rather than
// inside the (dependency-free — see jump_resolver_test.go's own CONTRACT
// note) resolver itself:
//
//   - "WHEN a jump's ETA passes and the fleet is read/resolved" — Get must
//     opportunistically settle a due jump exactly as it already does a due
//     burn (service.go's existing Get), which today it does NOT: its due
//     check (`f.State.Mode == space.ModeBurn && ...`) never even looks at
//     f.Jump.
//   - "the destination system's interior (create-if-absent) after the
//     resolve transaction completes" — a deliberate, separate step run once
//     the jump has settled, not something the (write-free) resolver itself
//     can do.

import (
	"context"
	"testing"

	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// recordingBodySource is a BodySource fake that records every systemId it
// was asked to resolve, in order — stronger than body_source_test.go's own
// spyBodySource (which counts calls but not their arguments), needed here to
// pin WHICH system got materialized.
type recordingBodySource struct {
	bt    *system.BodyTable
	calls []string
}

func (r *recordingBodySource) BodyTable(_ context.Context, systemID string) (*system.BodyTable, error) {
	r.calls = append(r.calls, systemID)
	return r.bt, nil
}

func containsString(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

// Scenario (SDET-added; the "read/resolved" clause of "Jump Arrival Parks
// Near the Destination Gate, Unmasked", mirroring the existing due-burn
// delegation test TestGet_Scenario_DueArrivalDelegatesToTheActionSpine
// exactly, for a due JUMP instead).
func TestGet_Scenario_DueJumpDelegatesToTheActionSpine(t *testing.T) {
	clk := &fakeClock{now: 500_000} // past the jump's eta
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	jumping := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0", ActiveActionId: "action_running",
		Jump: &JumpTransit{LaneId: "lane-1", DestSystemId: "sys-1", DepartMs: 0, ArriveMs: 300_000},
	}
	settled := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-1",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
	}
	gomock.InOrder(
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(jumping, nil),
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(settled, nil),
	)

	f, err := svc.Get(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if len(fa.resolved) != 1 || fa.resolved[0] != "fleet_1" {
		t.Fatalf("expected a due jump to be resolved through the action spine on read, got fa.resolved=%v", fa.resolved)
	}
	if f.SystemId != "sys-1" {
		t.Fatalf("expected the re-loaded (settled) doc showing the flipped systemId, got %+v", f)
	}
}

// Scenario (SDET-added companion boundary check): a jump not yet at its eta
// is left alone by Get, exactly as a not-yet-due burn is
// (TestGet_Scenario_NotYetDueBurnIsNotResolved).
func TestGet_Scenario_NotYetDueJumpIsNotResolved(t *testing.T) {
	clk := &fakeClock{now: 100_000} // before the jump's eta
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	jumping := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0", ActiveActionId: "action_running",
		Jump: &JumpTransit{LaneId: "lane-1", DestSystemId: "sys-1", DepartMs: 0, ArriveMs: 300_000},
	}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(jumping, nil)

	f, err := svc.Get(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if len(fa.resolved) != 0 {
		t.Fatalf("expected no resolve before the jump's eta, got %v", fa.resolved)
	}
	if f.Jump == nil {
		t.Fatal("expected Jump to remain set (unsettled) before eta")
	}
}

// Scenario: First arrival materializes the destination's interior.
//
// WHEN a fleet's jump resolves into a system with no materialized interior
// THEN the destination's interior is generated (create-if-absent) AFTER the
// resolve transaction completes. Pinned here as a service-level property (a
// call against the destination systemId through the fleet's own BodySource
// seam, design.md Decision 16) since the resolver itself is dependency-free
// (jump_resolver_test.go's own CONTRACT note) and therefore cannot be the
// one performing it.
func TestGet_Scenario_DueJumpArrivalMaterializesDestinationInteriorAfterResolve(t *testing.T) {
	clk := &fakeClock{now: 500_000}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	rec := &recordingBodySource{bt: testBodyTable(t, "sys-1", 6.0)}
	svc.WithBodies(rec)

	jumping := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0", ActiveActionId: "action_running",
		Jump: &JumpTransit{LaneId: "lane-1", DestSystemId: "sys-1", DepartMs: 0, ArriveMs: 300_000},
	}
	settled := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-1",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
	}
	gomock.InOrder(
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(jumping, nil),
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(settled, nil),
	)

	if _, err := svc.Get(context.Background(), "fleet_1"); err != nil {
		t.Fatal(err)
	}
	if !containsString(rec.calls, "sys-1") {
		t.Fatalf("expected the destination system's interior to be materialized (BodySource.BodyTable called "+
			"for %q) strictly after the jump resolved — \"Jump Arrival Parks Near the Destination Gate, "+
			"Unmasked\": \"materializes the destination system's interior (create-if-absent) after the resolve "+
			"transaction completes\"; got calls=%v", "sys-1", rec.calls)
	}
}
