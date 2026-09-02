package fleet

// Emulator-backed ORDERING test for openspec change
// replace-observation-with-sightings, tasks.md 8.2 (the blocker-4 half) — "an
// emulator-backed ordering test asserting EnsureLaneHorizon runs before the
// destination's first BodyTable build on jump arrival at the frontier
// (blocker 4)" (design.md Decision 24; galaxy-generation "Lazy, Idempotent
// Block Materialization": "A jump arrival at the frontier materializes the
// destination's full lane horizon before its gate set is built";
// fleet-movement "Jump Arrival Parks Near the Destination Gate, Unmasked":
// "Arrival at the frontier materializes the full lane horizon before the gate
// set is built").
//
// WHY THIS EXISTS ALONGSIDE jump_arrival_lane_horizon_test.go (tasks.md 1.4):
// that sibling test asserts the CONSEQUENCE — after the arrival settles, the
// far system is reachable from the destination. It would pass just as happily
// if EnsureLaneHorizon ran AFTER the gate set was already built from the
// pre-horizon neighbour set, because the horizon would still be materialized
// by the time the test looked. The scenario's own words are an ordering
// constraint ("before its gate set is built"), and only an ordering assertion
// can fail when the order is wrong. That is this file's whole job.
//
// CORRECTED 2026-09-01 (SDET, design.md Decision 28): this file used to pin
// EnsureLaneHorizon(dest) strictly before the first NeighborsOf(dest) call.
// That assertion is VACUOUS — it passes under both the shipped (broken) seam
// and the corrected one:
//   - under the shipped seam, EnsureLaneHorizon sits inside
//     system.Service.addGates (system/bodies.go:190), which calls it BEFORE
//     its own NeighborsOf call a few lines later — so the order holds simply
//     because one function's two statements happen to be written in that
//     order, regardless of where addGates itself sits relative to anything
//     else;
//   - under the corrected seam (EnsureLaneHorizon hoisted onto the jump path,
//     addGates no longer calling it at all — tasks.md 10.1-10.3), the order
//     ALSO holds, because Get's post-jump-settle step now calls
//     EnsureLaneHorizon before calling BodyTable at all, and NeighborsOf runs
//     even later, inside that BodyTable call.
// Neither branch can make old the assertion fail, so it was not a regression
// net for the seam drift Decision 28 diagnoses. It was also mis-targeted
// against the spec: the requirement constrains the ordering against the
// BODY-TABLE BUILD ("before its gate set is built"), not against a read
// internal to the gate build's own implementation.
//
// The corrected, LOAD-BEARING assertion pins EnsureLaneHorizon(dest) strictly
// before the first BodyTable(dest) call — the actual seam boundary the
// requirement names — observed by wrapping fleet.BodySource
// (service.go:105) in a second recording spy (orderRecordingBodySource) that
// appends "BodyTable <sys>" into the SAME ordered event log
// orderRecordingGalaxy already keeps, so the two seams' calls interleave in
// one timeline. Under the shipped/broken seam this now correctly FAILS: the
// first destination event is "BodyTable dest" (recorded the instant the
// wrapped BodySource is entered, before it delegates into the real
// system.Service.BodyTable, which is where addGates's nested
// EnsureLaneHorizon call actually runs) — i.e. "BodyTable dest" precedes
// "EnsureLaneHorizon dest" in the log, the exact inversion the requirement
// forbids.
//
// The old NeighborsOf-ordering check is KEPT but DEMOTED to a redundant inner
// sanity check (see the comment at its call site below) — it is not deleted,
// since a check that happens to be non-discriminating today is still useful
// as a second signal, but it is no longer what this test relies on to catch
// the regression.
//
// HOW THE ORDER IS OBSERVED, WITHOUT A FAKE STANDING IN FOR ANYTHING:
// orderRecordingGalaxy is a pass-through SPY, not a fake — it embeds the REAL
// *galaxy.Service (seeded against the REAL Firestore emulator) and delegates
// every call, recording only the sequence. orderRecordingBodySource is the same
// shape one seam over: it embeds the REAL BodySource (ssvc, itself backed by
// the same real *galaxy.Service through the spy) and delegates every call.
// Nothing either spy returns is invented, so the production code under test
// sees exactly the world it would see without them. The galaxy seam is
// galaxy.ServiceInterface, which system.NewServiceWith already takes as a
// constructor parameter; the body-table seam is fleet.BodySource, which
// fleet.NewServiceWith already takes as a constructor parameter — so no
// production wiring is bent to make this observable.
//
// FUTURE-PROOFING NOTE: this test also passes the SAME spy (not the bare
// *galaxy.Service) as fleet.NewServiceWith's graph parameter, even though
// today's Jump/Get code never calls a galaxy method through it during
// arrival-settle. Decision 28 wires EnsureLaneHorizon onto exactly this
// dependency shape ("wire it the same way WithGraph is wired" — tasks.md
// 10.3), and *galaxy.Service already satisfies a wider surface than
// GraphSource's own LaneCrossing alone; routing the same real service through
// the spy on both parameters costs nothing (spy is a pure pass-through) and
// means this test keeps observing the call correctly regardless of which
// already-threaded dependency the eventual fix reuses.
//
// The assertion is deliberately DOUBLE:
//  1. the recorded event log shows EnsureLaneHorizon(dest) strictly before
//     the first BodyTable(dest) call — the seam boundary the requirement
//     names ("before its gate set is built"); and
//  2. that FIRST NeighborsOf(dest) call — wherever it falls — already
//     RETURNED the far system — which is what "materialized before" actually
//     buys, and which fails independently of the log if the horizon call is
//     moved after the gate set is derived from a stale neighbour set.
//
// The no-fake counterpart standing rule #3 asks for is
// backend/traversability_e2e_test.go (tasks.md 1.6), which drives the same
// arrival through the real production-constructed router with no spy at all.

import (
	"context"
	"sync"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"
)

// orderRecordingGalaxy wraps the real galaxy service, recording the order of
// the calls whose sequence this scenario constrains and delegating
// everything else untouched. recordEvent is also used by orderRecordingBodySource
// below, so a BodyTable call and a galaxy call share one ordered timeline.
//
// Embeds the CONCRETE *galaxy.Service, not the galaxy.ServiceInterface it
// also satisfies, so that LaneCrossing — a method galaxy.Service exposes
// that ServiceInterface's own signature does not (fleet.GraphSource's own
// dependency) — is promoted through for free. That lets this same spy stand
// in for fleet.NewServiceWith's graph parameter too (see the
// FUTURE-PROOFING NOTE above) without a third hand-written passthrough
// method.
type orderRecordingGalaxy struct {
	*galaxy.Service

	mu sync.Mutex
	// events is the ordered call log, one entry per observed call, e.g.
	// "EnsureLaneHorizon sys_1_2" / "NeighborsOf sys_1_2" / "BodyTable sys_1_2".
	events []string
	// firstNeighbors records the RESULT of the first NeighborsOf call per
	// system id — the set the gate build actually saw at that instant.
	firstNeighbors map[string][]string
}

func newOrderRecordingGalaxy(inner *galaxy.Service) *orderRecordingGalaxy {
	return &orderRecordingGalaxy{Service: inner, firstNeighbors: map[string][]string{}}
}

// recordEvent appends e to the shared ordered log. Exported to the package
// (not just this file) so a second spy over a different seam — see
// orderRecordingBodySource — can interleave its own events into the same
// timeline, which is the whole point of the log: one ordering, not two
// independently-timestamped ones a test would have to reconcile by hand.
func (g *orderRecordingGalaxy) recordEvent(e string) {
	g.mu.Lock()
	g.events = append(g.events, e)
	g.mu.Unlock()
}

// reset clears the log — used by callers (e.g. the resolve-path regression
// test, tasks.md 10.5) that need to isolate events to a specific window
// rather than the whole test's history.
func (g *orderRecordingGalaxy) reset() {
	g.mu.Lock()
	g.events = nil
	g.firstNeighbors = map[string][]string{}
	g.mu.Unlock()
}

func (g *orderRecordingGalaxy) EnsureLaneHorizon(ctx context.Context, systemID string) error {
	err := g.Service.EnsureLaneHorizon(ctx, systemID)
	g.recordEvent("EnsureLaneHorizon " + systemID)
	return err
}

func (g *orderRecordingGalaxy) NeighborsOf(ctx context.Context, systemID string) ([]string, error) {
	out, err := g.Service.NeighborsOf(ctx, systemID)
	g.mu.Lock()
	g.events = append(g.events, "NeighborsOf "+systemID)
	if _, seen := g.firstNeighbors[systemID]; !seen {
		g.firstNeighbors[systemID] = append([]string{}, out...)
	}
	g.mu.Unlock()
	return out, err
}

// indexOf returns the position of the first event equal to want, or -1.
func (g *orderRecordingGalaxy) indexOf(want string) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	for i, e := range g.events {
		if e == want {
			return i
		}
	}
	return -1
}

func (g *orderRecordingGalaxy) log() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]string{}, g.events...)
}

// orderRecordingBodySource wraps a fleet.BodySource, recording "BodyTable <sys>"
// into the SAME ordered event log an orderRecordingGalaxy keeps (see its own
// recordEvent doc). A pass-through spy, not a fake: every call is delegated
// unmodified to the real BodySource (here, a real *system.Service backed by
// the Firestore emulator), so production code sees exactly the world it
// would see without it. The event is recorded BEFORE delegating, so it marks
// the moment the call was ENTERED — which is what lets a call nested inside
// the delegate (e.g. addGates's internal EnsureLaneHorizon, under the
// shipped/broken seam) show up AFTER "BodyTable <sys>" in the log, correctly
// reproducing the inversion the requirement forbids.
type orderRecordingBodySource struct {
	inner BodySource
	log   *orderRecordingGalaxy
}

func (b *orderRecordingBodySource) BodyTable(ctx context.Context, systemID string) (*system.BodyTable, error) {
	b.log.recordEvent("BodyTable " + systemID)
	return b.inner.BodyTable(ctx, systemID)
}

// Scenario: A jump arrival at the frontier materializes the destination's full
// lane horizon before its gate set is built (galaxy-generation "Lazy,
// Idempotent Block Materialization"); Arrival at the frontier materializes the
// full lane horizon before the gate set is built (fleet-movement "Jump Arrival
// Parks Near the Destination Gate, Unmasked").
func TestIntegration_Scenario_LaneHorizonRunsBeforeTheDestinationsFirstBodyTableBuild(t *testing.T) {
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

	// Materialize ONLY the destination's own block — its neighbours stay
	// unmaterialized, which is what makes NeighborsOf(dest) answer a SHORT set
	// until the horizon is ensured. Without this, the ordering assertion below
	// would be untestable: an already-complete horizon returns the same
	// neighbour set either way.
	if err := real.EnsureBlocks(ctx, ownBlock); err != nil {
		t.Fatalf("EnsureBlocks(ownBlock): %v", err)
	}

	defer common.CleanupFirestoreTestData(t, client, append(
		[]string{"galaxies", "galaxy_pointers", "fleets", "actions"},
		galaxy.SubcollectionPaths(gid, destSys)...)...)

	// Baseline, taken on the REAL service before the spy is even constructed,
	// so it contributes no events: the far system is genuinely unreachable, i.e.
	// this really is a frontier and the assertions below cannot pass by
	// accident.
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

	spy := newOrderRecordingGalaxy(real)
	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), spy, clk)
	bts := &orderRecordingBodySource{inner: ssvc, log: spy}
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(jumpType, action.KindKinematic, JumpResolver)
	fdao := NewDaoWithClient(fs)
	// bts records every BodyTable call into spy's own log; graph is also spy
	// (not the bare `real`) — see the FUTURE-PROOFING NOTE above — so a
	// galaxy call made through EITHER dependency fleet.Service holds is
	// observed on one timeline.
	fsvc := NewServiceWith(fdao, bts, spy, asvc, clk)

	// A fleet mid-jump into the frontier system, written exactly as
	// Service.Jump's own commit writes it (jump_arrival_lane_horizon_test.go's
	// established "as if Jump had already committed" convention), so the REAL
	// JumpResolver and the REAL post-settle step run unmodified.
	seedFleet := Fleet{
		Id:            "fleet_horizon_ordering_test",
		CorporationId: "corp-horizon-ordering-test",
		SystemId:      "sys-origin-placeholder",
		State:         space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
		CreatedAt:     0,
		UpdatedAt:     0,
	}
	seedFleet.StateDoc = EncodeKinematicState(seedFleet.State)
	if err := fdao.Save(ctx, seedFleet); err != nil {
		t.Fatalf("seeding fleet: %v", err)
	}

	jump := JumpTransit{LaneId: "lane-horizon-ordering-test", DestSystemId: destSys, DepartMs: 0, ArriveMs: 100}
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

	clk.now = 100_000
	if _, err := fsvc.Get(ctx, seedFleet.Id); err != nil {
		t.Fatalf("Get (settling the due jump arrival): %v", err)
	}

	horizonAt := spy.indexOf("EnsureLaneHorizon " + destSys)
	bodyTableAt := spy.indexOf("BodyTable " + destSys)
	neighborsAt := spy.indexOf("NeighborsOf " + destSys)

	// --- LOAD-BEARING: the requirement's own words are "before its gate set
	// is built" — the gate set is built inside a BodyTable call
	// (system/bodies.go's addGates, invoked from BodyTable), so the seam
	// boundary the requirement actually constrains is BodyTable, not
	// NeighborsOf (design.md Decision 28). ---
	if bodyTableAt < 0 {
		t.Fatalf("the destination's body table was never built on arrival: no BodyTable(%q) call was observed "+
			"during the jump-arrival settle (observed calls: %v)", destSys, spy.log())
	}
	if horizonAt < 0 {
		t.Fatalf("galaxy-generation \"A jump arrival at the frontier materializes the destination's full lane "+
			"horizon before its gate set is built\": galaxy.EnsureLaneHorizon(%q) was NEVER called during the "+
			"jump-arrival settle, yet the destination's body table was built — the arriving fleet is shown fewer "+
			"gates than truly exist (blocker 4). Observed calls: %v", destSys, spy.log())
	}
	if horizonAt > bodyTableAt {
		t.Fatalf("galaxy-generation \"A jump arrival at the frontier materializes the destination's full lane "+
			"horizon before its gate set is built\": EnsureLaneHorizon(%q) ran at call #%d, AFTER the destination's "+
			"first BodyTable(%q) call at call #%d — the ordering is the requirement, not merely that both happen "+
			"during the same arrival (design.md Decision 28: the shipped seam runs EnsureLaneHorizon from INSIDE "+
			"the BodyTable build, which is the exact inversion this assertion exists to catch). Observed calls: %v",
			destSys, horizonAt, destSys, bodyTableAt, spy.log())
	}

	// --- REDUNDANT INNER SANITY CHECK, not load-bearing (design.md Decision
	// 28): addGates's own two statements call EnsureLaneHorizon immediately
	// before its own NeighborsOf a few lines later, so this ordering holds
	// under BOTH the shipped/broken seam and the corrected one — it cannot by
	// itself distinguish them, which is exactly why it was demoted from this
	// test's original load-bearing assertion. Kept only because a violation
	// of even this weaker ordering would indicate something more broken than
	// what this test is nominally about. ---
	if neighborsAt >= 0 && horizonAt >= 0 && horizonAt > neighborsAt {
		t.Fatalf("redundant inner sanity check failed: EnsureLaneHorizon(%q) (call #%d) ran after this system's "+
			"own NeighborsOf(%q) (call #%d) — structurally stranger than the seam drift this test targets. "+
			"Observed calls: %v", destSys, horizonAt, destSys, neighborsAt, spy.log())
	}

	// The consequence of the ordering above, asserted on the set the gate
	// build ACTUALLY saw at its first NeighborsOf read — independent of the
	// event log, so a horizon call that ran first but materialized the wrong
	// blocks still fails here.
	spy.mu.Lock()
	firstSeen := append([]string{}, spy.firstNeighbors[destSys]...)
	spy.mu.Unlock()
	for _, n := range firstSeen {
		if n == farSys {
			return
		}
	}
	t.Fatalf("the destination's FIRST neighbour read during the arrival returned %v, which omits the frontier "+
		"neighbour %q — the gate set was built from a pre-horizon neighbour set, so the arriving fleet is shown "+
		"fewer gates than truly exist (blocker 4). Observed calls: %v", firstSeen, farSys, spy.log())
}
