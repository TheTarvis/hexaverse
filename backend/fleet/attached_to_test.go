package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 3.1 — THE PRIORITY TASK. Pins the `attachedTo`-clearing invariant
// across all three of its clauses (tasks.md 3.1; design.md Decision 4, 13):
//
//  1. a burn order clears AttachedTo AT COMMIT, not at resolve
//     (fleet-movement "In-System Burn Order to a Body or a Point" —
//     "committing a burn detaches the fleet from its host").
//  2. cut-drive and stop-in-place LEAVE it cleared — neither mutates it
//     further, because a burning/drifting fleet's AttachedTo was already
//     cleared at commit (fleet-movement "Cut Drive Converts the Burn to a
//     Drift and Goes Dark" / "Stop In Place Commits a Velocity-Nulling
//     Burn").
//  3. a body-targeted burn sets AttachedTo ONLY AT RESOLVE, never at commit
//     (fleet-movement "In-System Burn Order to a Body or a Point" —
//     "the fleet's attachedTo is set to the body's id only once the burn
//     resolves").
//
// This invariant's prior absence yielded three conforming-but-wrong
// implementations, including mine/sell working at unlimited range because a
// stale AttachedTo was never cleared when a fleet burned away from its dock
// (tasks.md 3.1's own history note). Every assertion below is written
// against the CONTRACT this SDET pass establishes (see
// space_testutil_test.go's header comment) — none of it exists in
// production yet, so every one of these tests is expected to fail to
// COMPILE until a developer lands section 3 (the Fleet/Service shape) and
// section 4 (the burn/cut-drive/stop verbs that actually mutate
// AttachedTo). That is deliberate: 3.1 is pinned red before either section
// lands, precisely so a fourth wrong implementation cannot pass either.

import (
	"context"
	"testing"

	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// dockedFleet returns a fleet parked (docked) at bodyId — AttachedTo set,
// State a ParkOrbit riding that body, so the pre-condition of "attached,
// about to be ordered away" is unambiguous.
func dockedFleet(bodyId string, radius float64) *Fleet {
	return &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		AttachedTo: bodyId,
		State: space.ShipState{
			Mode: space.ModeParked,
			Park: &space.Park{Kind: space.ParkOrbit, BodyId: bodyId, Radius: radius, PeriodMs: 600_000},
		},
	}
}

// Scenario: Committing a burn detaches the fleet from its host.
//
// WHEN a fleet attached to a body is given a burn order to a different
// point THEN its AttachedTo is cleared at commit — before the burn ever
// resolves — and the action spine sees the commit go through.
func TestOrderTo_Scenario_CommittingABurnDetachesFromHost(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	f := dockedFleet("feat-star", 20) // parked far enough out to clear the star's own clearance
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	point := space.Vec3{X: 100, Y: 0, Z: 0}
	got, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point})
	if err != nil {
		t.Fatalf("OrderTo: %v", err)
	}
	if got.AttachedTo != "" {
		t.Fatalf("AttachedTo = %q immediately after commit, want cleared", got.AttachedTo)
	}
	if fa.committed == nil {
		t.Fatal("expected the burn to commit through the action spine")
	}
}

// Scenario: A body-targeted burn's attachedTo is set only at resolve, never
// at commit.
//
// WHEN a fleet is ordered to intercept an orbiting body THEN AttachedTo
// reads empty on the commit's own return value (the burn hasn't arrived
// yet) — it is set only once BurnResolver settles the arrival.
func TestOrderTo_Scenario_BodyTargetedBurnSetsAttachedToOnlyAtResolve(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	target := orbitingFeature("feat-body-a", 40, 2.0)
	bodies := testBodyTable(t, "sys-0", 6.0, target)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	f := freshParkedFleet() // free-flying, AttachedTo empty
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{BodyId: "feat-body-a"})
	if err != nil {
		t.Fatalf("OrderTo: %v", err)
	}
	if got.AttachedTo != "" {
		t.Fatalf("AttachedTo = %q immediately after commit, want empty — a body-targeted burn "+
			"only attaches on RESOLVE, never on commit", got.AttachedTo)
	}
	if got.State.Mode != space.ModeBurn {
		t.Fatalf("expected the fleet to be mid-burn immediately after commit, got mode %v", got.State.Mode)
	}
}

// Scenario: cut drive leaves AttachedTo cleared (it was already cleared at
// the burn's own commit) and performs no further mutation of that field.
func TestCutDrive_Scenario_LeavesAttachedToCleared(t *testing.T) {
	clk := &fakeClock{now: 150_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := freshParkedFleet()
	burning.AttachedTo = "" // already cleared at the burn's own commit
	burning.ActiveActionId = "action_running"
	burning.State = space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
		Origin: space.Vec3{}, Target: space.Target{Point: &space.Vec3{X: 100}},
		Intercept: space.Vec3{X: 100}, Accel: 8, DepartMs: 0, ArriveMs: 300_000,
	}}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil)

	got, err := svc.CutDrive(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("CutDrive: %v", err)
	}
	if got.AttachedTo != "" {
		t.Fatalf("AttachedTo = %q after cut-drive, want still cleared", got.AttachedTo)
	}
	if got.State.Mode != space.ModeDrift {
		t.Fatalf("expected the fleet to convert to a drift, got mode %v", got.State.Mode)
	}
	if len(fa.cancelled) != 1 || fa.cancelled[0] != "action_running" {
		t.Fatalf("expected the running movement action to be cancelled, got %v", fa.cancelled)
	}
}

// Scenario: stop-in-place clears AttachedTo at the instant the order is
// accepted, in both the instant-park and committed-burn cases (design.md
// Decision 8 / fleet-movement "Stop In Place Commits a Velocity-Nulling
// Burn").
func TestStop_Scenario_ClearsAttachedToAtAcceptance(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// Docked at a body, drifting away is nonsensical, but the invariant is
	// unconditional per the spec text ("in both the instant-park and
	// committed-burn cases") — a docked fleet ordered to stop must also
	// clear AttachedTo the instant the order is accepted.
	f := dockedFleet("feat-star", 20)
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.Stop(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if got.AttachedTo != "" {
		t.Fatalf("AttachedTo = %q after stop-in-place, want cleared", got.AttachedTo)
	}
}

// stubBodySourceFixed is a BodySource fake that always answers with the
// same pre-built table, regardless of systemID — the section-3 tests don't
// exercise multi-system fan-out (that's section 5/jump's concern).
type stubBodySourceFixed struct {
	bt  *system.BodyTable
	err error
}

func (s stubBodySourceFixed) BodyTable(context.Context, string) (*system.BodyTable, error) {
	return s.bt, s.err
}
