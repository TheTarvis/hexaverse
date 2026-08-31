package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.3 — "Cut Drive Converts the Burn to a Drift and Goes Dark",
// the scenarios NOT already covered by attached_to_test.go's
// TestCutDrive_Scenario_LeavesAttachedToCleared (which pins the AttachedTo
// invariant alone).
//
// One of these is genuinely RED against shipped code:
// Service.CutDrive (service.go) propagates space.ErrCutAfterArrival for an
// already-arrived burn but never resolves the arrival as the spec requires
// ("the arrival is resolved (settled with its effects) rather than converted
// to a drift") — it just returns the error and leaves the stale burn
// unsettled in storage.
//
// The rest are already correctly implemented as a side effect of section 3's
// broader OrderTo/CutDrive/Cancel work and are expected to PASS on first
// run — each is flagged in its own doc comment below, per the SDET handoff
// report's discipline of never presenting a tautological pass as a red
// finding.

import (
	"context"
	"errors"
	"testing"

	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// burningFleet is a small helper: a free-flying (AttachedTo empty) fleet
// mid-burn toward an explicit point, with a claimed movement-channel action.
// Origin/Intercept sit well clear of any star clearance this fixture family's
// star sizes produce, and the Curve/Length are a REAL non-degenerate straight
// line (not the zero-value Burn{} some other pre-existing fixtures in this
// package get away with when they never read Position/Tangent on the
// result) — this helper's own callers do read the cut position downstream
// (re-ordering, emission), so a degenerate curve would silently fold every
// query to the origin and produce a fixture bug indistinguishable from a
// production one.
func burningFleet(departMs, arriveMs common.WorldMillis) *Fleet {
	origin := space.Vec3{X: 30}
	intercept := space.Vec3{X: 130}
	curve := space.Curve{P0: origin, C1: origin, C2: origin, C3: intercept, C4: intercept, P5: intercept}
	return &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		ActiveActionId: "action_running",
		State: space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: origin, Target: space.Target{Point: &intercept}, Intercept: intercept, Curve: curve,
			Length: intercept.Sub(origin).Length(), Accel: 8, DepartMs: departMs, ArriveMs: arriveMs,
		}},
	}
}

// Scenario: Cutting an already-arrived burn resolves the arrival instead.
//
// WHEN cut drive is ordered against a fleet whose active burn has already
// reached or passed its arrival time but has not yet been resolved THEN the
// order is rejected with its own named reason, and the arrival is RESOLVED
// (settled with its effects) rather than converted to a drift.
//
// GENUINELY RED: Service.CutDrive today returns space.ErrCutAfterArrival
// (propagated straight from space.CutDrive) but never calls the action
// spine's settle path — the fleet's stored burn is left exactly as it was,
// unsettled, rather than resolved.
func TestCutDrive_Scenario_AlreadyArrivedResolvesInsteadOfConverting(t *testing.T) {
	clk := &fakeClock{now: 300_000} // well past the burn's ArriveMs, never re-read
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := burningFleet(0, 100_000)
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil).AnyTimes()

	_, err := svc.CutDrive(context.Background(), "fleet_1")
	if !errors.Is(err, space.ErrCutAfterArrival) {
		t.Fatalf("err = %v, want it to trace to space.ErrCutAfterArrival — cut-drive's own named reason for "+
			"an already-arrived burn, distinct from ErrNotBurning", err)
	}
	if len(fa.resolved) != 1 || fa.resolved[0] != "fleet_1" {
		t.Fatalf("expected the arrival to be RESOLVED through the action spine (fleet-movement \"Cut Drive "+
			"Converts the Burn to a Drift and Goes Dark\": \"cutting an already-arrived burn resolves the "+
			"arrival instead\"), got fa.resolved=%v — the stale burn is being left unsettled, not settled", fa.resolved)
	}
}

// Scenario: Cutting a parked, drifting, or in-transit fleet is rejected by
// name — distinct from the already-arrived rejection.
//
// EXPECTED TO PASS ON FIRST RUN for all three sub-cases: Service.CutDrive's
// existing guard (`f.State.Mode != space.ModeBurn || f.State.Burn == nil`)
// already rejects a parked or drifting fleet with ErrNotBurning, distinct by
// construction from space.ErrCutAfterArrival. The in-transit sub-case is
// covered too: a jumping fleet's domain invariant is that Jump is only ever
// set while the fleet's (stale) State is ModeParked — jump commits only from
// an attached, and therefore parked, gate dock (fleet-movement "Lane Jump
// From a Docked Gate") — so the same mode guard rejects it without a
// dedicated Jump != nil branch.
func TestCutDrive_Scenario_RejectedForNonBurningFleets(t *testing.T) {
	for _, c := range []struct {
		name  string
		fleet *Fleet
	}{
		{"parked", freshParkedFleet()},
		{"drifting", &Fleet{
			Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
			State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: space.Vec3{X: 50}}},
		}},
		{"in lane transit (stale State is parked, per the jump-only-from-a-dock invariant)", &Fleet{
			Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
			Jump:  &JumpTransit{LaneId: "lane-1", DestSystemId: "sys-1", DepartMs: 0, ArriveMs: 100_000},
			State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 50}}},
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			clk := &fakeClock{now: 10_000}
			svc, dao, _, ctrl := newSvc(t, clk)
			defer ctrl.Finish()
			dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(c.fleet, nil)

			_, err := svc.CutDrive(context.Background(), "fleet_1")
			if !errors.Is(err, ErrNotBurning) {
				t.Fatalf("err = %v, want ErrNotBurning", err)
			}
			if errors.Is(err, space.ErrCutAfterArrival) {
				t.Fatal("a non-burning fleet's rejection must be DISTINCT from the already-arrived rejection")
			}
		})
	}
}

// Scenario: Cut drive charges no delta-v.
//
// EXPECTED TO PASS ON FIRST RUN: CutDrive never touches Cargo or any
// credit/ledger path — there is no code path for it to do so, so this
// assertion documents an absence rather than catching a live bug.
func TestCutDrive_Scenario_ChargesNoDeltaV(t *testing.T) {
	clk := &fakeClock{now: 50_000}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := burningFleet(0, 300_000)
	burning.Cargo = map[string]float64{"ore": 10}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil)

	got, err := svc.CutDrive(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("CutDrive: %v", err)
	}
	if got.Cargo["ore"] != 10 {
		t.Errorf("Cargo changed by cut-drive: %v, want unchanged", got.Cargo)
	}
}

// Scenario: A cut fleet is immediately re-orderable.
//
// EXPECTED TO PASS ON FIRST RUN: CutDrive clears ActiveActionId to "", and
// OrderTo's own active-action branch is a no-op when ActiveActionId is
// empty, so a fresh order commits immediately with no special-cased
// cooldown state to trip over.
func TestCutDrive_Scenario_ImmediatelyReorderable(t *testing.T) {
	clk := &fakeClock{now: 50_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	burning := burningFleet(0, 300_000)
	gomock.InOrder(
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil),
		dao.EXPECT().Get(gomock.Any(), "fleet_1").DoAndReturn(func(context.Context, string) (*Fleet, error) {
			return burning, nil // the mock's own store isn't mutated by CutDrive; the returned *Fleet is what matters
		}),
	)

	cut, err := svc.CutDrive(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("CutDrive: %v", err)
	}
	if cut.ActiveActionId != "" {
		t.Fatalf("ActiveActionId after cut-drive = %q, want cleared", cut.ActiveActionId)
	}

	point := space.Vec3{X: 60}
	reordered, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point})
	if err != nil {
		t.Fatalf("a fresh order immediately after cut-drive must succeed with no cooldown: %v", err)
	}
	if reordered.State.Mode != space.ModeBurn {
		t.Fatalf("expected a fresh burn, got %v", reordered.State.Mode)
	}
	if fa.committed == nil {
		t.Fatal("expected the fresh order to commit")
	}
}

// Scenario: Emission stops the same instant the drive is cut.
//
// WHEN a fleet's emission state is read immediately before and immediately
// after a cut-drive order THEN it reports emitting before the cut and not
// emitting after it, with no intervening instant reported as ambiguous.
//
// EXPECTED TO PASS ON FIRST RUN: disclosure.Emitting reads `s.Mode !=
// space.ModeBurn`, and CutDrive's own commit flips Mode from ModeBurn to
// ModeDrift atomically in the returned Fleet — there is no code path where
// both reads could observe the same moment differently. Cross-package with
// disclosure (design.md Decision 6: "because disclosure.Emitting reads
// s.Mode != ModeBurn, emission stops in the same instant the state flips").
func TestCutDrive_Scenario_EmissionStopsTheSameInstant(t *testing.T) {
	clk := &fakeClock{now: 50_000} // strictly mid-burn: DepartMs=0 < now < ArriveMs=300_000
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := burningFleet(0, 300_000)
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil)

	if !disclosure.Emitting(burning.State, clk.now) {
		t.Fatal("fixture bug: the fleet must be emitting immediately before the cut")
	}

	cut, err := svc.CutDrive(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("CutDrive: %v", err)
	}
	if disclosure.Emitting(cut.State, clk.now) {
		t.Error("the fleet still reports emitting immediately after the cut, at the SAME world time")
	}
}
