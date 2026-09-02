package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 5.1/5.2 — "Implement POST /v1/fleets/:fleetId/jump {laneId}" and
// "Compute jump crossing time as space.Vec3{...}.Length() ... times the
// fleet's configured lane rate, quantized via space.QuantizeArrival".
//
// UPDATED by replace-observation-with-sightings tasks.md 1.1/1.2 (design.md
// Decisions 2/22): jump-eligibility dropped its map-knowledge precondition —
// attachment to the lane's own gate body is now the ENTIRE eligibility
// check, no dwell, and the lane-crossing-geometry source is wired as a
// required positional parameter of fleet.NewServiceWith — the package's only
// constructor (tasks.md 6.3) — rather than through a deleted
// post-construction accessor. The scenarios pinning the
// now-removed charted-lane requirement are deleted outright below, per the
// same test-immutability protocol handler_test.go's own deleted
// TestGetInterior_LaneGatesFogFilterToCharted documents (an authorized
// change: the spec removed the requirement these scenarios pinned); the
// surviving scenarios are adapted only in their construction plumbing — this
// package's own established convention (see svc.classStats below) is that a
// same-package test may set an unexported Service field directly, which is
// exactly how each surviving scenario now supplies its lane-crossing fake in
// place of the deleted accessor.
//
// CONTRACT this suite assumes:
//
//   func (s *Service) Jump(ctx context.Context, id, laneId string) (*Fleet, error)
//
//   type GraphSource interface {
//       // LaneCrossing resolves one lane's crossing geometry, given the lane
//       // id and the system the fleet currently occupies (one of the lane's
//       // two endpoints). from/to are the two endpoint systems' RAW galaxy
//       // coordinates — never a precomputed length — so it is the PRODUCTION
//       // code, not this test's fixture, that calls space.Vec3{...}.Length()
//       // (design.md Decision 10's own text names that call explicitly).
//       LaneCrossing(ctx context.Context, laneId, fromSystemId string) (
//           destSystemId string, from, to space.Vec3, err error)
//   }
//
//   var ErrJumpNotAttached = errors.New(...) // "jumping without attachment to the named gate is rejected"
//
// The gate body a jump departs from is named "gate-"+destSystemId, mirroring
// system.gateId's own convention (system/bodies.go) — the fleet's
// AttachedTo is compared against this literal, since system does not export
// gateId. The eligibility check keys on the FLEET's own CorporationId, not a
// caller-supplied requester id: no verb in this package threads a requester
// identity through the service layer today (design.md Decision 21/tasks.md
// 5.6 — ownership is never checked), so "the requester corporation"
// operationally means "the fleet's corporation".
//
// A developer landing a materially different but scenario-equivalent shape
// should raise it as a test dispute for orchestrator adjudication, not
// silently diverge.

import (
	"context"
	"errors"
	"testing"

	"hexaverse/common"
	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// fakeGraph is the SDET-authored fake for the not-yet-existing GraphSource
// dependency (see CONTRACT above). from/to are handed over as RAW
// coordinates precisely so a production implementation that hardcodes a
// length instead of calling space.Vec3{...}.Length() itself would still
// need to reach into these fields to get the right answer — this fixture
// does not do that computation for it.
type fakeGraph struct {
	destSystemId string
	from, to     space.Vec3
	err          error
}

func (g *fakeGraph) LaneCrossing(context.Context, string, string) (string, space.Vec3, space.Vec3, error) {
	return g.destSystemId, g.from, g.to, g.err
}

// EnsureLaneHorizon is a no-op success by default: this fixture's whole job
// is scripting LaneCrossing for tests that never exercise the fail-closed
// horizon path (that path has its own dedicated, real-*galaxy.Service-backed
// test — jump_fail_closed_lane_horizon_test.go). Mechanical addition to keep
// this fixture satisfying the widened GraphSource interface (design.md
// Decision 28, tasks 10.2/10.3) — not a scenario assertion.
func (g *fakeGraph) EnsureLaneHorizon(context.Context, string) error { return nil }

// gateParkedFleet returns a fleet parked in orbit of the named gate body,
// attached to it — the "jump-eligible" precondition ("Lane Jump From a
// Docked Gate": "accept the order only when the fleet is attached to the
// gate body for that lane").
func gateParkedFleet(gateId string) *Fleet {
	return &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		AttachedTo: gateId,
		State:      space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: gateId, Radius: 220}},
	}
}

// Scenario: Jumping from a charted, attached gate commits — combined with
// tasks.md 5.2's own crossing-time formula, since both are the SAME
// execution path and a separate test would just re-run the identical
// fixture. The destination coordinates (200,300,600) are a Pythagorean
// 3-4-12 triple scaled by 100, giving an EXACT 3D length of 700 — chosen so
// a naive length calculation that drops the Z axis (500, from the 3-4-5
// sub-triangle) is unmistakably distinguishable from the correct answer.
// The fixture's roster is pinned to LaneRate=1.0 so "times the lane rate"
// and "divided by the lane rate" (roster.go's own documented dimension:
// LaneRate is lane-length-units PER unit-world-time, a speed, so crossing
// time = length / rate) coincide numerically — this test does not take a
// side in that reading; TestJump_Scenario_CrossingTimeDividesLengthByLaneRate
// below does.
func TestJump_Scenario_ChartedAttachedGateCommits(t *testing.T) {
	clk := &fakeClock{now: 1_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	svc.classStats = map[ShipClass]ClassStats{ClassSeed: {LaneRate: 1.0}}
	svc.graph = &fakeGraph{destSystemId: "sys-1", from: space.Vec3{}, to: space.Vec3{X: 200, Y: 300, Z: 600}}

	f := gateParkedFleet("gate-sys-1")
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.Jump(context.Background(), "fleet_1", "lane-1")
	if err != nil {
		t.Fatalf("Jump: %v", err)
	}
	if got.Jump == nil {
		t.Fatal("expected Jump to be set after a successful commit")
	}
	if got.Jump.LaneId != "lane-1" {
		t.Errorf("Jump.LaneId = %q, want %q", got.Jump.LaneId, "lane-1")
	}
	if got.Jump.DestSystemId != "sys-1" {
		t.Errorf("Jump.DestSystemId = %q, want %q", got.Jump.DestSystemId, "sys-1")
	}
	if got.Jump.DepartMs != 1_000 {
		t.Errorf("Jump.DepartMs = %d, want the commit instant 1000", got.Jump.DepartMs)
	}
	wantEta := common.WorldMillis(1_000 + 700) // length 700 / LaneRate 1.0, quantized
	if got.Jump.ArriveMs != wantEta {
		t.Errorf("Jump.ArriveMs = %d, want %d (now + the lane's 3D length 700 / the fleet's lane rate 1.0)",
			got.Jump.ArriveMs, wantEta)
	}
	if fa.committed == nil {
		t.Fatal("expected the jump to commit through the action spine")
	}
	if fa.committed.Type != "jump" {
		t.Errorf("committed action Type = %q, want %q", fa.committed.Type, "jump")
	}
	if fa.committed.Eta != wantEta {
		t.Errorf("committed action Eta = %d, want %d", fa.committed.Eta, wantEta)
	}
	if fa.committed.Scope != "sys-0" {
		t.Errorf("committed action Scope = %q, want the fleet's origin system %q", fa.committed.Scope, "sys-0")
	}
	if got.ActiveActionId != "action_test" {
		t.Errorf("ActiveActionId = %q, want the new commit's id", got.ActiveActionId)
	}
}

// Scenario (SDET-added disambiguation of tasks.md 5.2's own prose, which
// says crossing time is the lane length "times" the lane rate — dimensionally
// backwards against roster.go's own documented unit for LaneRate,
// lane-length-units PER unit-world-time, i.e. a SPEED; time = distance /
// speed, not distance * speed. This test pins the DIVISION reading with a
// non-unity rate so the two readings are numerically distinguishable, and is
// explicitly flagged as an SDET judgment call subject to dispute if a
// developer's implementation multiplies instead.
func TestJump_Scenario_CrossingTimeDividesLengthByLaneRate(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// Length 700 (see the fixture above), LaneRate 0.35 units/ms ⇒
	// flight = 700 / 0.35 = 2000ms exactly, distinguishable from 700*0.35=245.
	svc.classStats = map[ShipClass]ClassStats{ClassSeed: {LaneRate: 0.35}}
	svc.graph = &fakeGraph{destSystemId: "sys-1", to: space.Vec3{X: 200, Y: 300, Z: 600}}

	f := gateParkedFleet("gate-sys-1")
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.Jump(context.Background(), "fleet_1", "lane-1")
	if err != nil {
		t.Fatalf("Jump: %v", err)
	}
	wantEta := common.WorldMillis(2_000)
	if got.Jump.ArriveMs != wantEta {
		t.Errorf("Jump.ArriveMs = %d, want %d (length 700 / LaneRate 0.35 = 2000ms) — if this is 245ms instead, "+
			"the implementation multiplies length by lane rate rather than dividing; raise as a test dispute if "+
			"that reading is intended", got.Jump.ArriveMs, wantEta)
	}
}

// Scenario: Jumping without attachment to the named gate is rejected.
func TestJump_Scenario_RejectedWithoutAttachment(t *testing.T) {
	for _, c := range []struct {
		name  string
		fleet *Fleet
	}{
		{"not attached to anything", freshParkedFleet()},
		{"attached to a different body", gateParkedFleet("feat-body-a")},
	} {
		t.Run(c.name, func(t *testing.T) {
			clk := &fakeClock{now: 1_000}
			svc, dao, fa, ctrl := newSvc(t, clk)
			defer ctrl.Finish()

			svc.graph = &fakeGraph{destSystemId: "sys-1", to: space.Vec3{X: 1}}
			dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(c.fleet, nil)

			_, err := svc.Jump(context.Background(), "fleet_1", "lane-1")
			if !errors.Is(err, ErrJumpNotAttached) {
				t.Fatalf("err = %v, want ErrJumpNotAttached", err)
			}
			if fa.committed != nil {
				t.Fatalf("a rejected jump must not commit an action, got %+v", fa.committed)
			}
		})
	}
}

// TestJump_Scenario_RejectedUnchartedLane (DELETED —
// replace-observation-with-sightings tasks.md 1.2) used to prove Jump
// rejected an uncharted lane. That precondition is REMOVED by design.md
// Decision 2: jump-eligibility is attachment to the lane's own gate body
// alone, no map-knowledge check — the charting circularity this scenario
// pinned (you cannot chart without arriving, and cannot arrive without
// charting) is exactly what made the galaxy untraversable for a fresh
// corporation. Deleted rather than inverted, per the same test-immutability
// protocol handler_test.go's own deleted TestGetInterior_LaneGatesFogFilterToCharted
// documents (an authorized change: the spec removed the requirement this
// test pinned).

// Scenario: Jump costs no delta-v.
//
// The fleet's kinematic State has no delta-v-charging shape at all: only a
// space.Burn ever prices delta-v (space.Burn.DeltaV). This asserts the
// closest observable proxy this data model has for "no delta-v charged": a
// successful jump commit does NOT rewrite the fleet's State into a burn (or
// touch it at all) — design.md Decision 4's own words are that the stale
// State "SHALL NOT be evaluated by any reader" while Jump is set, which this
// test reads as "and is therefore never turned into a priced burn either".
func TestJump_Scenario_CostsNoDeltaV(t *testing.T) {
	clk := &fakeClock{now: 1_000}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	svc.graph = &fakeGraph{destSystemId: "sys-1", to: space.Vec3{X: 1}}

	f := gateParkedFleet("gate-sys-1")
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.Jump(context.Background(), "fleet_1", "lane-1")
	if err != nil {
		t.Fatalf("Jump: %v", err)
	}
	if got.State.Mode != space.ModeParked || got.State.Park == nil || got.State.Park.BodyId != "gate-sys-1" {
		t.Fatalf("State after jump commit = %+v, want it left EXACTLY as it was (no burn, no delta-v priced)", got.State)
	}
}

// Scenario (SDET-added; design.md Decision 10's own requirement text: "SHALL
// commit the jump ... replacing any active movement order"): jumping cancels
// a running non-movement verb sharing the fleet's movement slot (e.g. a
// docked mine), exactly as OrderTo/Stop already do for an active burn.
func TestJump_Scenario_ReplacesActiveMovementOrder(t *testing.T) {
	clk := &fakeClock{now: 1_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	svc.graph = &fakeGraph{destSystemId: "sys-1", to: space.Vec3{X: 1}}

	f := gateParkedFleet("gate-sys-1")
	f.ActiveActionId = "action_running_mine"
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	_, err := svc.Jump(context.Background(), "fleet_1", "lane-1")
	if err != nil {
		t.Fatalf("Jump: %v", err)
	}
	if len(fa.cancelled) != 1 || fa.cancelled[0] != "action_running_mine" {
		t.Fatalf("expected the prior active action %q to be cancelled, got %v", "action_running_mine", fa.cancelled)
	}
	if fa.committed == nil || fa.committed.Type != "jump" {
		t.Fatalf("expected a fresh jump commit, got %+v", fa.committed)
	}
}

// Scenario (SDET-added boundary probe): jumping a fleet already mid-jump is
// rejected — a fleet in lane transit has no position and no attachment to
// re-derive eligibility from (fleet-movement MODIFIED "Effective Position
// Resolution": while Jump is set, State is stale and unevaluated).
func TestJump_Scenario_RejectedWhileAlreadyInTransit(t *testing.T) {
	clk := &fakeClock{now: 1_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	f := gateParkedFleet("gate-sys-1")
	f.Jump = &JumpTransit{LaneId: "lane-0", DestSystemId: "sys-9", DepartMs: 0, ArriveMs: 500_000}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	_, err := svc.Jump(context.Background(), "fleet_1", "lane-1")
	if !errors.Is(err, ErrFleetInTransit) {
		t.Fatalf("err = %v, want ErrFleetInTransit", err)
	}
	if fa.committed != nil {
		t.Fatalf("a fleet already mid-jump must not commit a second jump, got %+v", fa.committed)
	}
}
