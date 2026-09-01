package fleet

// RED-phase integration test for openspec change
// replace-observation-with-sightings, tasks.md 1.4 — "Wire
// galaxy.EnsureLaneHorizon into jump-arrival settlement (fleet.Service.Get's
// post-jump-settle step), called strictly before the destination's first
// BodyTable build for that arrival — closing blocker 4" (design.md Decision
// 23; fleet-movement "Jump Arrival Parks Near the Destination Gate,
// Unmasked": "Arrival at the frontier materializes the full lane horizon
// before the gate set is built"; galaxy-generation "Lazy, Idempotent Block
// Materialization": "A jump arrival at the frontier materializes the
// destination's full lane horizon before its gate set is built").
//
// This is one of the two CONSEQUENCE tests design.md Decision 24 calls for
// on top of the end-to-end slice (the other, blocker 3's "never a 5xx",
// lives in backend/traversability_e2e_test.go and
// backend/router_jump_wiring_test.go, package main, against the real
// production-constructed router). This test is deliberately service-level,
// not HTTP: `fleet.Service.Get`'s arrival-settle path needs no GraphSource
// at all (that dependency belongs to Jump's COMMIT path, never its
// ARRIVAL/resolve path), so it can drive the real galaxy+system+action+fleet
// stack against the Firestore emulator, with a fully injectable clock, using
// ONLY symbols that exist today — no fakeGraph, no speculative not-yet-
// existing wiring seam guessed at.
//
// SETUP TECHNIQUE: rather than committing a jump through Service.Jump (whose
// own commit path is blocker 3's concern and is exercised elsewhere — see
// jump_verb_test.go and backend/router_jump_wiring_test.go) and
// rather than waiting out a real ETA, this test commits the "jump" action
// directly through action.Service.Commit with the EXACT ActorState shape
// Service.Jump itself writes (mirroring jump_settle_test.go's own "as if
// BurnResolver had already run" convention, one level up: "as if Jump had
// already committed"), then advances the injected clock past the ETA. This
// exercises the REAL JumpResolver and the REAL fleet.Service.Get post-
// resolve step end to end, with zero dependency on Jump's own commit-time
// wiring.
//
// EXPECTED TO BE RED TODAY: fleet.Service.Get's jump-settle step
// (service.go) calls s.bodiesFor(ctx, settled.SystemId) with NO preceding
// call to galaxy.EnsureLaneHorizon anywhere in fleet — so a jump arrival at
// a system whose own block is materialized alone (the frontier case) sees
// only whatever neighbours were ALREADY materialized before arrival, never
// the destination's true full lane horizon.

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"
)

// findFrontierSystem scans a deterministic run of blocks, far outside any
// seed's start area (StartAreaBlockRadius defaults to 1 — a 3x3 window
// around the origin block), for one whose OWN block carries at least one
// lane whose FAR endpoint lies in a DIFFERENT block — the exact shape of "a
// system at the edge of the currently materialized region" this scenario
// needs. Returns the system id to materialize alone, and the far system id
// that must NOT be reachable until EnsureLaneHorizon runs.
func findFrontierSystem(t *testing.T, f *galaxy.Field) (own galaxy.Block, destSys, farSys string) {
	t.Helper()
	for bx := 400; bx < 460; bx++ {
		b := galaxy.Block{X: bx, Y: 400}
		if len(f.BlockSystems(b)) == 0 {
			continue
		}
		for _, l := range f.BlockLanes(b) {
			if l.ABlock == b && l.BBlock != b {
				return b, l.AId, l.BId
			}
			if l.BBlock == b && l.ABlock != b {
				return b, l.BId, l.AId
			}
		}
	}
	t.Fatal("findFrontierSystem: no cross-block lane found in the scanned block range — " +
		"widen the scan range if galaxy generation parameters changed")
	return galaxy.Block{}, "", ""
}

func TestIntegration_Scenario_JumpArrivalAtFrontierMaterializesFullLaneHorizonBeforeGateSetBuilds(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 0}

	params := galaxy.DefaultParams()
	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	meta, err := gsvc.Seed(ctx, 7, params)
	if err != nil {
		t.Fatalf("Seed: %v", err)
	}
	gid := meta.Id

	f := galaxy.NewField(7, params)
	ownBlock, destSys, farSys := findFrontierSystem(t, f)

	// Materialize ONLY the destination's own block — deliberately NOT its
	// full lane horizon — reproducing "arrival at a system whose block is
	// materialized but whose neighbours are not yet."
	if err := gsvc.EnsureBlocks(ctx, ownBlock); err != nil {
		t.Fatalf("EnsureBlocks(ownBlock): %v", err)
	}

	defer common.CleanupFirestoreTestData(t, client, append(
		[]string{"galaxies", "galaxy_pointers", "fleets", "actions"},
		galaxy.SubcollectionPaths(gid, destSys)...)...)

	// Baseline sanity: before arrival, the frontier system's far neighbour is
	// genuinely NOT YET reachable — proves this is a real frontier, not an
	// accident of an already-complete horizon.
	before, err := gsvc.NeighborsOf(ctx, destSys)
	if err != nil {
		t.Fatalf("NeighborsOf (before): %v", err)
	}
	for _, n := range before {
		if n == farSys {
			t.Fatalf("test setup invalid: %q already reachable from %q before arrival — pick a different "+
				"frontier system (findFrontierSystem's scan range may need widening)", farSys, destSys)
		}
	}

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(jumpType, action.KindKinematic, JumpResolver)
	fdao := NewDaoWithClient(fs)
	// gsvc — the real galaxy service seeded above — is this stack's
	// GraphSource. This test drives the ARRIVAL path, which needs no graph
	// (see the file header), but the constructor now requires the dependency
	// to be stated, and a real one is already in scope.
	fsvc := NewServiceWith(fdao, ssvc, gsvc, asvc, clk)

	// Seed a fleet mid-jump, arriving at the frontier system — mirroring
	// exactly what Service.Jump's own commit writes (jumpType action,
	// ActorState carrying "jump"), so JumpResolver's real production code
	// runs unmodified. The origin system id is a placeholder: JumpResolver
	// never reads it for anything requiring materialization.
	seedFleet := Fleet{
		Id:            "fleet_frontier_test",
		CorporationId: "corp-frontier-test",
		SystemId:      "sys-origin-placeholder",
		State:         space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
		CreatedAt:     0,
		UpdatedAt:     0,
	}
	seedFleet.StateDoc = EncodeKinematicState(seedFleet.State)
	if err := fdao.Save(ctx, seedFleet); err != nil {
		t.Fatalf("seeding fleet: %v", err)
	}

	jump := JumpTransit{LaneId: "lane-frontier-test", DestSystemId: destSys, DepartMs: 0, ArriveMs: 100}
	if _, err := asvc.Commit(ctx, action.CommitSpec{
		Type:            jumpType,
		Actor:           seedFleet.Id,
		ActorCollection: actorCollection,
		Scope:           seedFleet.SystemId,
		Params:          map[string]interface{}{"laneId": jump.LaneId, "destSystemId": jump.DestSystemId},
		Eta:             jump.ArriveMs,
		ActorState:      map[string]interface{}{"jump": jump, "updatedAt": int64(0)},
	}); err != nil {
		t.Fatalf("committing the jump action directly (mirroring Service.Jump's own write): %v", err)
	}

	// Past the jump's ETA — Get must settle it opportunistically, exactly as
	// fleet-movement's "Jump Arrival Parks Near the Destination Gate,
	// Unmasked" requires.
	clk.now = 100_000

	if _, err := fsvc.Get(ctx, seedFleet.Id); err != nil {
		t.Fatalf("Get (settling the due jump arrival): %v", err)
	}

	after, err := gsvc.NeighborsOf(ctx, destSys)
	if err != nil {
		t.Fatalf("NeighborsOf (after): %v", err)
	}
	for _, n := range after {
		if n == farSys {
			return // full lane horizon materialized before/at arrival — the fix is in
		}
	}
	t.Fatalf("galaxy-generation \"A jump arrival at the frontier materializes the destination's full lane "+
		"horizon before its gate set is built\": after the jump arrival settled, %q is still unreachable from "+
		"the destination %q (got neighbours %v) — fleet.Service.Get's post-jump-settle step never calls "+
		"galaxy.EnsureLaneHorizon before building the destination's BodyTable (blocker 4)", farSys, destSys, after)
}
