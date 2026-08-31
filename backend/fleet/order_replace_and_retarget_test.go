package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.1 — the three "In-System Burn Order to a Body or a Point"
// scenarios NOT already covered by the pre-existing section-3 corpus:
//
//   - "A new order replaces an active one" (service_test.go/
//     stale_arrival_integration_test.go cover the OTHER two order-replacement
//     shapes — a fresh order from rest, and re-ordering over an
//     already-arrived-but-unresolved burn — but neither pins the ordinary
//     mid-flight replace: cancel the still-running action, claim a new one).
//   - "Re-targeting mid-burn departs tangent to current motion, not the
//     original departure" — genuinely unimplemented: Service.OrderTo
//     (service.go) calls space.SolveBurn with a hard-coded `nil` departDir on
//     every call, so BuildCurve falls back to the straight CHORD direction
//     toward the new target regardless of the fleet's live velocity
//     (space/burn.go:291-294). This test is RED against real production code,
//     not a missing symbol.
//
// Also includes one SDET-added boundary probe not named in tasks.md 4.1's own
// parenthetical scenario list but present in the fleet-movement spec text
// itself ("A target too close to solve is rejected by name"): cheap, and
// worth pinning since space.ErrArcTooShort's propagation through OrderTo has
// no existing fleet-level assertion.

import (
	"context"
	"errors"
	"testing"

	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// Scenario: A new order replaces an active one.
//
// WHEN a fleet with an active, not-yet-arrived burn is given a new burn order
// THEN the prior action is cancelled and the new order's action claims the
// movement slot.
func TestOrderTo_Scenario_NewOrderReplacesAnActiveOne(t *testing.T) {
	clk := &fakeClock{now: 50_000} // strictly before the active burn's arrival
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	from := space.Vec3{X: 30}
	to := space.Vec3{X: 430}
	curve := space.Curve{P0: from, C1: from, C2: from, C3: to, C4: to, P5: to}
	active := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		ActiveActionId: "action_old_burn",
		State: space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: from, Target: space.Target{Point: &to}, Intercept: to, Curve: curve,
			Length: to.Sub(from).Length(), Accel: 8, DepartMs: 0, ArriveMs: 200_000, // arrives well after `clk.now`
		}},
	}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(active, nil)

	newTarget := space.Vec3{X: 30, Y: 300}
	got, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &newTarget})
	if err != nil {
		t.Fatalf("OrderTo: %v", err)
	}
	if len(fa.cancelled) != 1 || fa.cancelled[0] != "action_old_burn" {
		t.Fatalf("expected the prior active action %q to be cancelled, got %v", "action_old_burn", fa.cancelled)
	}
	if fa.committed == nil || fa.committed.Type != burnType {
		t.Fatalf("expected the new order to commit a fresh burn action, got %+v", fa.committed)
	}
	if got.ActiveActionId != "action_test" { // fakeActions.Commit's fixed id (service_test.go)
		t.Fatalf("ActiveActionId after replace = %q, want the new commit's id", got.ActiveActionId)
	}
	if got.State.Burn.Intercept != newTarget {
		t.Fatalf("new burn intercept = %+v, want the newly ordered point %+v", got.State.Burn.Intercept, newTarget)
	}
}

// Scenario: Re-targeting mid-burn departs tangent to current motion, not the
// original departure.
//
// WHEN a fleet mid-burn toward one target is re-ordered to a different target
// before arriving THEN the new burn's departure tangent is derived from the
// fleet's live velocity at the re-order instant, not a fresh chord toward the
// new target.
//
// The old burn here is a straight run along +X; the re-order aims at a point
// due +Y of the fleet's CURRENT position, so the chord direction (+Y) and the
// live-velocity direction (+X) are orthogonal — an unambiguous discriminator.
func TestOrderTo_Scenario_RetargetingMidBurnDepartsTangentToLiveMotion(t *testing.T) {
	from := space.Vec3{X: 30}
	to := space.Vec3{X: 430}
	const accel = 8.0
	length := to.Sub(from).Length()
	// A physically-consistent ArriveMs (not an arbitrary round number) — the
	// old burn's own Progress/ArcParam fold depends on Length/Accel/ArriveMs
	// agreeing, or the curve degenerates to its start/end control points
	// (whose tangent is zero, since this test's straight-line curve repeats
	// its endpoint as its own control point) and the discriminator this test
	// relies on (a real, non-degenerate mid-flight tangent) is meaningless.
	arriveMs := space.QuantizeArrival(0, space.FlightSeconds(length, accel))
	// Strictly before the flip (half of flightSeconds) — genuinely
	// accelerating, unambiguously mid-flight.
	now := arriveMs / 4

	clk := &fakeClock{now: now}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	curve := space.Curve{P0: from, C1: from, C2: from, C3: to, C4: to, P5: to}
	oldBurn := &space.Burn{
		Origin: from, Target: space.Target{Point: &to}, Intercept: to, Curve: curve,
		Length: length, Accel: accel, DepartMs: 0, ArriveMs: arriveMs,
	}
	active := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		ActiveActionId: "action_old_burn",
		State:          space.ShipState{Mode: space.ModeBurn, Burn: oldBurn},
	}

	// The fleet's live velocity direction just before re-ordering — computed
	// independently of OrderTo, through the same Burn.Tangent every settle
	// path uses, so the discriminator itself is trustworthy.
	wantDir := oldBurn.Tangent(clk.now)
	if wantDir == (space.Vec3{}) {
		t.Fatal("fixture bug: the old burn's tangent at the re-order instant is degenerate")
	}
	curPos, err := svc.Position(context.Background(), active, bodies)
	if err != nil {
		t.Fatalf("resolving the fleet's live position: %v", err)
	}

	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(active, nil)

	// Due +Y of the fleet's CURRENT position — orthogonal to the old burn's
	// +X travel direction, so a chord-direction departure and a
	// live-velocity-tangent departure are unmistakably different.
	newTarget := curPos.Add(space.Vec3{Y: 300})
	got, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &newTarget})
	if err != nil {
		t.Fatalf("OrderTo: %v", err)
	}
	newBurn := got.State.Burn
	if newBurn == nil {
		t.Fatal("expected the fleet to be mid a new burn")
	}
	gotDir := newBurn.Tangent(newBurn.DepartMs)
	dot := gotDir.Dot(wantDir)
	if dot < 0.9 {
		t.Fatalf("new burn's departure tangent = %+v (dot=%.4f against the fleet's live velocity direction %+v at "+
			"the re-order instant), want it to depart tangent to LIVE MOTION — fleet-movement \"In-System Burn Order "+
			"to a Body or a Point\": \"re-targeting mid-burn departs tangent to current motion, not the original "+
			"departure\". Service.OrderTo currently passes a hard-coded nil departDir to space.SolveBurn on every "+
			"call, so BuildCurve falls back to the straight chord toward the new target instead", gotDir, dot, wantDir)
	}
}

// Scenario (SDET-added; named in the fleet-movement spec text but not in
// tasks.md 4.1's own scenario parenthetical): A target too close to solve is
// rejected by name.
//
// WHEN a fleet parked at a body's insertion standoff is ordered to burn back
// to that same body, yielding a curve shorter than space.MinArcLength THEN
// the order is rejected with space.ErrArcTooShort and no burn is stored.
func TestOrderTo_Scenario_TargetTooCloseToSolveRejectedByName(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	target := orbitingFeature("feat-body-a", 40, 2.0)
	bodies := testBodyTable(t, "sys-0", 6.0, target)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	body, ok := bodies.Body("feat-body-a")
	if !ok {
		t.Fatal("fixture: feat-body-a not found")
	}
	bodyPos, err := space.Position(bodies, "feat-body-a", clk.now)
	if err != nil {
		t.Fatalf("resolving body position: %v", err)
	}
	standoff := space.InsertionStandoff(body)
	// Parked exactly at the body's own insertion standoff distance — ordering
	// straight back to the SAME body solves a near-zero-length curve.
	parkedAtStandoff := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{
			Kind: space.ParkPoint, Point: bodyPos.Add(space.Vec3{X: standoff}),
		}},
	}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(parkedAtStandoff, nil)

	_, err = svc.OrderTo(context.Background(), "fleet_1", OrderRequest{BodyId: "feat-body-a"})
	if !errors.Is(err, space.ErrArcTooShort) {
		t.Fatalf("err = %v, want space.ErrArcTooShort", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected order must not commit an action: %+v", fa.committed)
	}
}
