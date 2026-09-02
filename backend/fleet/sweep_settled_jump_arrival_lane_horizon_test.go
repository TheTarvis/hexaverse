package fleet

// RED-phase regression test for openspec change
// replace-observation-with-sightings, tasks.md 10.6 (design.md Decision 28):
// "Sweep-settled arrival test: commit a jump toward a frontier destination,
// settle it via the action sweep (ResolveAllDue) rather than via
// fleet.Service.Get, then read the destination's body table and assert its
// gate set contains the frontier neighbour. This is the only test that fails
// if the horizon call lives solely at the arrival site."
// (fleet-movement "Jump Arrival Parks Near the Destination Gate, Unmasked" —
// "A sweep-settled arrival still has the destination's full gate set.")
//
// WHY THIS TEST EXISTS ALONGSIDE jump_arrival_lane_horizon_test.go AND
// jump_arrival_lane_horizon_ordering_test.go: those two both settle the
// arrival through fleet.Service.Get, which is exactly the seam
// design.md Decision 28 wires an EnsureLaneHorizon call onto (task 10.3,
// Get's post-jump-settle branch, guarded on `f.Jump != nil`). The action
// sweep (POST /v1/push/action-sweep -> action.Service.ResolveAllDue) can
// settle a due jump FIRST, since jump is a registered resolver — and once it
// has, the fleet reads back with Jump == nil, so Get's post-settle branch
// NEVER RUNS, not for this arrival or any later read of it. Decision 28's
// answer is a SECOND, disjoint call site at jump COMMIT (task 10.2, inside
// fleet.Service.Jump, before the action is committed) precisely so this
// sweep-settled path is still covered. A test that only exercises the
// Get-settled path (the other two files) could never catch a fix that
// implements 10.3 alone and forgets 10.2 — this file is the one that can.
//
// HOW THE DISCRIMINATING ASSERTION AVOIDS TWO DIFFERENT WAYS TO BE VACUOUS
// (both discovered empirically while writing this file — read before
// editing):
//
//  1. A NAIVE version that reads ssvc.BodyTable(ctx, destSys) after the sweep
//     and checks its gate set is USELESS as a red-today check: TODAY,
//     system.Service.addGates (system/bodies.go:190) still calls
//     EnsureLaneHorizon unconditionally at the top of EVERY BodyTable build —
//     including a bare, untriggered read with no jump commit or sweep
//     involved at all — so that check would PASS right now regardless of
//     whether the jump path ensures anything. Exactly the "consequence-only"
//     trap design.md Decision 28 diagnoses in the sibling ordering test.
//
//  2. A version that instead calls galaxy.Service.NeighborsOf(destSys)
//     directly (no BodyTable read at all) is STILL not enough, and this one
//     is subtler: fleet.Service.Jump's own commit path calls
//     s.bodiesFor(ctx, f.SystemId) for the ORIGIN system (to solve/attach
//     from its live body table) — and that BodyTable build's addGates ALSO
//     unconditionally calls EnsureLaneHorizon(originSystem) TODAY. Since a
//     frontier destination's own cross-block neighbour is typically inside
//     the SAME adjacent block the origin's own 3x3 horizon window already
//     covers (the two systems are lane-adjacent), ensuring the ORIGIN's
//     horizon during Jump's ordinary, unrelated bodiesFor(origin) call can
//     materialize the very block the destination's frontier neighbour lives
//     in, as pure incidental block-level overlap — making
//     NeighborsOf(destSys) report farSys reachable for a reason that has
//     NOTHING to do with whether the destination's own horizon was ever
//     ensured by name. Confirmed empirically: an earlier draft of this file
//     using exactly that check PASSED against today's code.
//
// The assertion that survives both traps: wrap the galaxy dependency in the
// SAME orderRecordingGalaxy spy jump_arrival_lane_horizon_ordering_test.go
// already defines (a real *galaxy.Service, pass-through, recording only the
// call log) and check for a call recorded as EXACTLY
// "EnsureLaneHorizon <destSys>" — keyed on the DESTINATION's own system id,
// never merely "was the neighbour reachable" or "was some EnsureLaneHorizon
// call made." Origin's own incidental EnsureLaneHorizon(originSys) call is
// recorded too, under its own, different key, and does not satisfy this
// check. This is also, deliberately, a plain existence check rather than an
// ordering one (unlike the sibling ordering test) — this scenario's own
// words are the CONSEQUENCE ("still has the full gate set"), not an order.
//
// EXPECTED TO BE RED TODAY: neither fleet.Service.Jump nor JumpResolver
// (fleet/resolver.go) calls galaxy.EnsureLaneHorizon anywhere naming the
// DESTINATION system — grep confirms zero occurrences of EnsureLaneHorizon in
// fleet today (tasks.md 10.2/10.3 are what add the two call sites). The only
// EnsureLaneHorizon call this path makes is the origin's own, incidental one
// inside Jump's pre-commit bodiesFor(originSys) — which does not name the
// destination and therefore does not satisfy this test's assertion.

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"
)

// Scenario: A sweep-settled arrival still has the destination's full gate set
// (fleet-movement "Jump Arrival Parks Near the Destination Gate, Unmasked").
func TestIntegration_Scenario_SweepSettledJumpArrivalStillGetsFullLaneHorizon(t *testing.T) {
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
	ownBlock, destSys, farSys := findFrontierSystem(t, f)

	// Materialize ONLY the destination's own block — its neighbours (farSys's
	// block) stay unmaterialized, reproducing "arrival at the frontier."
	if err := real.EnsureBlocks(ctx, ownBlock); err != nil {
		t.Fatalf("EnsureBlocks(ownBlock): %v", err)
	}

	defer common.CleanupFirestoreTestData(t, client, append(
		[]string{"galaxies", "galaxy_pointers", "fleets", "actions"},
		galaxy.SubcollectionPaths(gid, destSys)...)...)

	before, err := real.NeighborsOf(ctx, destSys)
	if err != nil {
		t.Fatalf("NeighborsOf (before): %v", err)
	}
	for _, n := range before {
		if n == farSys {
			t.Fatalf("test setup invalid: %q already reachable from %q before arrival — pick a different "+
				"frontier system (findFrontierSystem's scan range may need widening)", farSys, destSys)
		}
	}
	if len(before) == 0 {
		t.Fatalf("test setup invalid: %q has NO already-materialized neighbour to jump FROM within its own "+
			"block %v — findFrontierSystem needs a destination system with at least one intra-block neighbour "+
			"as well as its cross-block one", destSys, ownBlock)
	}
	// originSys is a system already known to be adjacent to destSys — the
	// lane between them is therefore already materialized by the own-block
	// step above, so a fleet parked there can legally jump to destSys without
	// this test needing to arrange anything about ITS horizon.
	originSys := before[0]

	lanes, err := real.LanesOf(ctx, originSys)
	if err != nil {
		t.Fatalf("LanesOf(origin): %v", err)
	}
	var laneId string
	for _, l := range lanes {
		if l.OtherSystemId == destSys {
			laneId = l.LaneId
			break
		}
	}
	if laneId == "" {
		t.Fatalf("could not resolve a lane id between %q and %q via galaxy.LanesOf (got %+v)", originSys, destSys, lanes)
	}

	// spy from here on — see header comment for why keying its assertion on
	// the DESTINATION system id specifically (never a bare consequence check)
	// is what makes this test discriminate correctly.
	spy := newOrderRecordingGalaxy(real)
	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), spy, clk)
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(jumpType, action.KindKinematic, JumpResolver)
	fdao := NewDaoWithClient(fs)
	fsvc := NewServiceWith(fdao, ssvc, spy, asvc, clk)

	// Seed a fleet ATTACHED to the gate leading to destSys, in originSys —
	// driven through the REAL Service.Jump commit path below (never the "as
	// if Jump had already committed" direct-action-commit convention the
	// sibling arrival tests use), because this scenario is specifically
	// about whether the COMMIT path (task 10.2) ensures the horizon.
	gateToDestId := "gate-" + destSys
	seedFleet := Fleet{
		Id:            "fleet_sweep_settled_test",
		CorporationId: "corp-sweep-settled-test",
		SystemId:      originSys,
		AttachedTo:    gateToDestId,
		State:         space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: gateToDestId, Radius: 300}},
	}
	seedFleet.StateDoc = EncodeKinematicState(seedFleet.State)
	if err := fdao.Save(ctx, seedFleet); err != nil {
		t.Fatalf("seeding the attached fleet: %v", err)
	}

	jumped, err := fsvc.Jump(ctx, seedFleet.Id, laneId)
	if err != nil {
		t.Fatalf("Jump (real commit path): %v", err)
	}
	if jumped.Jump == nil || jumped.Jump.DestSystemId != destSys || jumped.Jump.ArriveMs <= 0 {
		t.Fatalf("expected a committed jump to %q with a positive ETA, got %+v", destSys, jumped.Jump)
	}

	// Settle via the SWEEP, never fleet.Service.Get — the whole point of this
	// file (see header comment).
	clk.now = jumped.Jump.ArriveMs + 1_000
	if _, err := asvc.ResolveAllDue(ctx); err != nil {
		t.Fatalf("ResolveAllDue: %v", err)
	}

	// --- LOAD-BEARING: did anything in the commit+sweep-resolve path ensure
	// the DESTINATION's own lane horizon by name? Origin's own incidental
	// EnsureLaneHorizon(originSys) call (Jump's ordinary bodiesFor(origin)
	// read, today's addGates) is recorded under a DIFFERENT key and does not
	// satisfy this. See header comment for why a bare NeighborsOf/BodyTable
	// consequence check is vacuous here. ---
	if idx := spy.indexOf("EnsureLaneHorizon " + destSys); idx < 0 {
		t.Fatalf("fleet-movement \"Jump Arrival Parks Near the Destination Gate, Unmasked\": \"A sweep-settled "+
			"arrival still has the destination's full gate set\" — after a sweep-settled arrival (ResolveAllDue, "+
			"never fleet.Service.Get), galaxy.EnsureLaneHorizon(%q) was never called by name during the jump "+
			"commit or the sweep resolve. The only EnsureLaneHorizon call this path made was for the ORIGIN "+
			"system (%q), an incidental side effect of Jump's own bodiesFor(origin) read, not a deliberate ensure "+
			"of the destination's horizon — design.md Decision 28 requires the destination's own horizon to be "+
			"ensured at commit (task 10.2), since a sweep-settled arrival never reaches Get's post-settle branch "+
			"(task 10.3) at all. Observed calls: %v", destSys, originSys, spy.log())
	}

	// --- Literal task wording, kept as a second, non-discriminating check
	// once the destination-keyed call above is confirmed: once task 10.1
	// removes addGates's self-heal, this is the same assertion made through
	// the actual seam a player-facing read uses. ---
	bt, err := ssvc.BodyTable(ctx, destSys)
	if err != nil {
		t.Fatalf("BodyTable(dest): %v", err)
	}
	if _, ok := bt.Body("gate-" + farSys); !ok {
		t.Fatalf("the destination's body table omits the frontier neighbour's gate (%q) even though "+
			"EnsureLaneHorizon(%q) was already called by name — got ids=%v", "gate-"+farSys, destSys, bt.Ids())
	}
}
