package fleet

// RED-phase, emulator-backed test for openspec change
// replace-observation-with-sightings, tasks.md 10.12 (design.md Decision 28):
// "Fail-closed jump-rejection test: commit a jump toward a destination whose
// lane-horizon materialization is forced to fail (an injected galaxy seam
// returning an error), and assert the HTTP response is a distinguishable,
// retryable rejection — never a committed jump — that no action was
// created, and that the fleet remains attached to the originating gate
// rather than entering lane transit."
// (fleet-movement "Jump Arrival Parks Near the Destination Gate, Unmasked" —
// "A jump toward a destination whose horizon cannot be materialized is
// rejected.")
//
// INTERFACE-SHAPE DECISION (recorded for the record, since it was made
// before the landed shape was visible): the task text directed this file to
// be written "against the interface shape task 10.3 specifies... a
// required positional constructor parameter" — a possible BRAND NEW
// fleet.NewServiceWith parameter. This file deliberately did NOT add a
// speculative 6th constructor parameter, instead threading the
// forced-failure double through the EXISTING graph (GraphSource) parameter,
// mirroring this package's own sibling test
// (jump_arrival_lane_horizon_ordering_test.go's "FUTURE-PROOFING NOTE",
// design.md Decision 28) — reasoning that *galaxy.Service already satisfies
// a wider surface than GraphSource's own LaneCrossing, so passing it as
// `graph` would work "regardless of which already-threaded dependency the
// eventual fix reuses." CONFIRMED CORRECT once tasks 10.2/10.3 landed
// (concurrently, while this file was being authored): GraphSource itself was
// WIDENED to add `EnsureLaneHorizon` (fleet/service.go), reusing the same
// `graph` parameter with no new constructor parameter at all — exactly the
// shape this file's double already satisfied. No follow-up edit was needed.
//
// SENTINEL: tasks.md 10.12 says to assert "fleet.ErrDestinationNotReady ->
// 503" by name. That sentinel did not exist when this file was first
// authored (task 10.13's own job), so the identity check below was
// deliberately deferred rather than referencing an undefined identifier
// (which would have failed the ENTIRE fleet package's test binary to
// compile — a violation of the Red-handoff requirement that pre-existing
// suites stay green — following this package's own precedent for a
// not-yet-existing symbol, jump_deletion_test.go's
// TestPackage_Scenario_ZeroDependencyConstructorsAreAbsent, which AST-scans
// source text for exactly this reason). Task 10.13 landed concurrently
// (fleet/service.go now declares ErrDestinationNotReady, mapped to 503 in
// fleet/handler.go's respond), so the identity check was added below as a
// strengthening addition once it became safe to compile — never a rewrite
// of the assertions already in place.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"
)

// alwaysFailingHorizonGalaxy wraps the REAL, emulator-backed *galaxy.Service
// (never a hand-rolled fake standing in for real geometry) and overrides
// ONLY EnsureLaneHorizon to force the failure this scenario requires.
// LaneCrossing (fleet.GraphSource's own method) is promoted through
// untouched, so the fleet Service under test resolves a real crossing's
// geometry exactly as production would — the injected fault is isolated to
// the ONE seam this scenario names ("the destination's lane-horizon
// materialization is forced to fail"), never to lane resolution itself.
type alwaysFailingHorizonGalaxy struct {
	*galaxy.Service
}

var errForcedHorizonFailure = errors.New("test double: lane-horizon materialization forced to fail")

func (a *alwaysFailingHorizonGalaxy) EnsureLaneHorizon(ctx context.Context, systemID string) error {
	return errForcedHorizonFailure
}

// Scenario: A jump toward a destination whose horizon cannot be materialized
// is rejected.
func TestIntegration_Scenario_JumpTowardAnUnmaterializableDestinationIsRejectedFailClosed(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 0}

	params := galaxy.DefaultParams()
	real := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	meta, err := real.Seed(ctx, 7, params)
	if err != nil {
		t.Fatalf("Seed: %v", err)
	}
	gid := meta.Id

	f := galaxy.NewField(7, params)

	// Find ANY block with a materializable intra-block lane — this scenario
	// is about commit-time fail-closed behavior, not frontier geometry, so
	// (unlike the sibling frontier tests) any already-resolvable lane
	// suffices; the injected double forces EnsureLaneHorizon to fail
	// unconditionally, for any system id.
	var originSys, laneId, destSys string
	for bx := 400; bx < 460; bx++ {
		b := galaxy.Block{X: bx, Y: 400}
		if len(f.BlockSystems(b)) == 0 {
			continue
		}
		if err := real.EnsureBlocks(ctx, b); err != nil {
			t.Fatalf("EnsureBlocks(%v): %v", b, err)
		}
		for _, sys := range f.BlockSystems(b) {
			lanes, lerr := real.LanesOf(ctx, sys.Id)
			if lerr != nil {
				t.Fatalf("LanesOf(%q): %v", sys.Id, lerr)
			}
			if len(lanes) > 0 {
				originSys, laneId, destSys = sys.Id, lanes[0].LaneId, lanes[0].OtherSystemId
				break
			}
		}
		if laneId != "" {
			break
		}
	}
	if laneId == "" {
		t.Fatal("test setup invalid: no materializable lane found in the scanned block range")
	}

	defer common.CleanupFirestoreTestData(t, client, append(
		[]string{"galaxies", "galaxy_pointers", "fleets", "actions"},
		galaxy.SubcollectionPaths(gid, originSys)...)...)

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), real, clk)
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(jumpType, action.KindKinematic, JumpResolver)
	fdao := NewDaoWithClient(fs)
	// The forced-failure double is threaded through the SAME graph parameter
	// GraphSource already occupies — see this file's header comment for why.
	failingGraph := &alwaysFailingHorizonGalaxy{Service: real}
	fsvc := NewServiceWith(fdao, ssvc, failingGraph, asvc, clk)

	gateToDestId := "gate-" + destSys
	seedFleet := Fleet{
		Id:            "fleet_fail_closed_horizon_test",
		CorporationId: "corp-fail-closed-horizon-test",
		SystemId:      originSys,
		AttachedTo:    gateToDestId,
		State:         space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: gateToDestId, Radius: 300}},
	}
	seedFleet.StateDoc = EncodeKinematicState(seedFleet.State)
	if err := fdao.Save(ctx, seedFleet); err != nil {
		t.Fatalf("seeding the attached fleet: %v", err)
	}

	jumped, jerr := fsvc.Jump(ctx, seedFleet.Id, laneId)

	// --- Distinguishable, retryable rejection -----------------------------
	if jerr == nil {
		t.Fatalf("fleet-movement \"Jump Arrival Parks Near the Destination Gate, Unmasked\": \"A jump toward a "+
			"destination whose horizon cannot be materialized is rejected\" — Jump succeeded (got fleet %+v) even "+
			"though EnsureLaneHorizon(%q) was forced to fail", jumped, destSys)
	}
	// POST-AUTHORING TIGHTENING (2026-09-01, SDET): task 10.13 landed
	// (concurrently, while this file was being authored) — ErrDestinationNotReady
	// now exists, so the sentinel-identity pin this file's header comment
	// deferred is added here as a strengthening addition, not a rewrite of
	// any existing assertion (test-immutability protocol: this is new
	// coverage becoming safe to add, never a weakening of what was already
	// asserted).
	if !errors.Is(jerr, ErrDestinationNotReady) {
		t.Errorf("expected errors.Is(err, ErrDestinationNotReady) for a jump whose destination horizon could not "+
			"be materialized (a distinguishable, RETRYABLE reason — 503 at the HTTP surface, task 10.13) — got: %v",
			jerr)
	}
	// Distinguishable from the package's OTHER named jump rejections (never
	// conflated with "not attached" or "already in transit"), so a
	// caller/handler can tell them apart.
	if errors.Is(jerr, ErrJumpNotAttached) {
		t.Errorf("a lane-horizon-materialization failure was reported as ErrJumpNotAttached — the fleet WAS "+
			"attached to the correct gate; this rejection must be distinguishable from that one — got: %v", jerr)
	}
	if errors.Is(jerr, ErrFleetInTransit) {
		t.Errorf("a lane-horizon-materialization failure was reported as ErrFleetInTransit — got: %v", jerr)
	}
	if jumped != nil {
		t.Errorf("Jump returned a non-nil fleet alongside an error: %+v", jumped)
	}

	// --- No action was created ---------------------------------------------
	inbox, ierr := asvc.Inbox(ctx, seedFleet.Id)
	if ierr != nil {
		t.Fatalf("Inbox: %v", ierr)
	}
	if len(inbox) != 0 {
		t.Errorf("expected NO action committed for a fail-closed jump rejection, got %d: %+v", len(inbox), inbox)
	}

	// --- Fleet remains attached to the originating gate, never enters
	// transit -------------------------------------------------------------
	reloaded, err := fdao.Get(ctx, seedFleet.Id)
	if err != nil {
		t.Fatalf("reloading the fleet: %v", err)
	}
	if reloaded == nil {
		t.Fatal("fleet vanished after a rejected jump")
	}
	if reloaded.AttachedTo != gateToDestId {
		t.Errorf("fleet's AttachedTo changed from %q to %q after a rejected jump", gateToDestId, reloaded.AttachedTo)
	}
	if reloaded.Jump != nil {
		t.Errorf("fleet entered lane transit (Jump=%+v) despite the destination's horizon materialization "+
			"having failed at commit", reloaded.Jump)
	}
	if reloaded.ActiveActionId != "" {
		t.Errorf("fleet claimed a movement-channel action slot (%q) despite the rejected jump", reloaded.ActiveActionId)
	}
}

// Scenario (HTTP surface half, added once task 10.13 made it compilable —
// see this file's header comment): ErrDestinationNotReady maps to 503 at
// the handler, the distinguishable RETRYABLE status this scenario names.
// Unit-level (fakeFleetSvc, no emulator) since the handler's status mapping
// is a pure function of the returned error — the emulator-backed test above
// already covers the real commit-time behavior this error signals.
func TestHandler_Scenario_DestinationNotReadyMapsTo503(t *testing.T) {
	own := &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1"}
	r := newFleetRouter(&fakeFleetSvc{fleet: own, jumpErr: ErrDestinationNotReady})
	w := httptest.NewRecorder()
	body := strings.NewReader(`{"laneId":"lane_1_1_1_2"}`)
	req := httptest.NewRequest(http.MethodPost, "/fleets/f1/jump", body)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("fleet-movement \"Jump Arrival Parks Near the Destination Gate, Unmasked\": a jump rejected for "+
			"ErrDestinationNotReady must respond 503 (distinguishable, RETRYABLE) — got status %d, body %s",
			w.Code, w.Body.String())
	}
}
