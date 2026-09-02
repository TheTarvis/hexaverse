package fleet

// RED-phase regression test for openspec change
// replace-observation-with-sightings, tasks.md 10.5 (design.md Decision 28):
// "Resolve-path regression test: a burn resolve driven through the real
// action service against the emulator, with the galaxy service wrapped in
// the existing orderRecordingGalaxy spy, asserting ZERO EnsureLaneHorizon
// calls are recorded during the resolve. This is the assertion that fails if
// a materializing call is ever reintroduced into the body-table path, and it
// fails for the right reason — it does not depend on observing a Firestore
// error."
// (system-body-table: "A Body-Table Build Materializes Nothing" — "A build
// from inside a resolve transaction performs no write.")
//
// WHY NOT ASSERT ON A FIRESTORE ERROR INSTEAD: design.md Decision 28's Fact 2
// is that ensureBlocksIn short-circuits to a pure read once a system's
// horizon is already materialized, so EnsureLaneHorizon called from inside a
// transaction on an ALREADY-MATERIALIZED system (the steady-state case this
// test deliberately uses — the origin system, whose own horizon Seed already
// establishes) returns nil with NO nested RunTransaction and therefore NO
// errNestedTransaction. A test that waited for that error would be silently
// vacuous in exactly this common case — passing for the wrong reason (no
// error observed) even with the call still present. Counting the CALL itself,
// regardless of whether it happens to error, is the only assertion that
// cannot be satisfied by accident.
//
// EXPECTED TO BE RED TODAY: system.Service.addGates (system/bodies.go:190)
// unconditionally calls galaxySvc.EnsureLaneHorizon at the top of every
// BodyTable build, transactional or not — including the one BurnResolver
// (fleet/resolver.go:214) runs from inside action's resolve transaction
// (action/dao.go's RunTransaction). This test's spy observes that call.
//
// SETUP: mirrors TestIntegration_OrderMoveArrive's real galaxy+system+action+
// fleet stack exactly (same seed, same body pick, same OrderTo→Get arrival
// shape) — the only addition is wrapping the galaxy dependency in
// orderRecordingGalaxy and resetting its log immediately before the resolve,
// so the assertion is scoped to the resolve itself and not to the setup
// reads (Seed, GetOrCreateInterior, the pre-resolve BodyTable call OrderTo
// itself makes to solve the burn) that legitimately call BodyTable outside
// any transaction.
import (
	"context"
	"strings"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"
)

// Scenario: A build from inside a resolve transaction performs no write
// (system-body-table "A Body-Table Build Materializes Nothing").
func TestIntegration_Scenario_BurnResolveCallsNoEnsureLaneHorizon(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 0}

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	meta, err := gsvc.Seed(ctx, 1, galaxy.DefaultParams())
	if err != nil {
		t.Fatal(err)
	}
	gid := meta.Id
	home := meta.OriginSystemId
	defer common.CleanupFirestoreTestData(t, client, append(
		[]string{"galaxies", "galaxy_pointers", "fleets", "actions"},
		galaxy.SubcollectionPaths(gid, home)...)...)

	spy := newOrderRecordingGalaxy(gsvc)
	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), spy, clk)
	interior, err := ssvc.GetOrCreateInterior(ctx, home)
	if err != nil {
		t.Fatal(err)
	}

	var targetID string
	for _, f := range interior.Features {
		if f.Type != system.FeatureStar && f.Space != nil {
			targetID = f.Id
			break
		}
	}
	if targetID == "" {
		t.Skip("generated interior had no orbiting feature")
	}

	bt, err := ssvc.BodyTable(ctx, home)
	if err != nil {
		t.Fatal(err)
	}

	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(burnType, action.KindKinematic, BurnResolver(ssvc))
	fsvc := NewServiceWith(NewDaoWithClient(fs), ssvc, spy, asvc, clk)

	at := space.Vec3{X: bt.Extent() * 0.5}
	seeded, err := fsvc.SeedFleet(ctx, home, "dev-corp-resolve-path-test", at, bt.StarSize())
	if err != nil {
		t.Fatal(err)
	}

	ordered, err := fsvc.OrderTo(ctx, seeded.Id, OrderRequest{BodyId: targetID})
	if err != nil {
		t.Fatal(err)
	}
	if ordered.State.Mode != space.ModeBurn {
		t.Fatalf("expected burn, got %v", ordered.State.Mode)
	}
	arriveMs := ordered.State.Burn.ArriveMs

	// Isolate the assertion to the RESOLVE window: everything above (Seed,
	// GetOrCreateInterior, the OrderTo solve's own BodyTable read) is a
	// legitimate, non-transactional caller of BodyTable and is expected to
	// exercise EnsureLaneHorizon freely — that is not what this test is
	// about.
	spy.reset()

	clk.now = arriveMs + 1_000
	arrived, err := fsvc.Get(ctx, seeded.Id)
	if err != nil {
		t.Fatal(err)
	}
	if arrived.State.Mode != space.ModeParked || arrived.State.Park == nil || arrived.State.Park.BodyId != targetID {
		t.Fatalf("expected the burn to have settled into a ParkOrbit around %s, got %+v — the resolve itself must "+
			"have gone through for this test's absence assertion to mean anything", targetID, arrived.State)
	}

	for _, e := range spy.log() {
		if strings.HasPrefix(e, "EnsureLaneHorizon ") {
			t.Fatalf("system-body-table \"A Body-Table Build Materializes Nothing\": \"A build from inside a "+
				"resolve transaction performs no write\" — galaxy.EnsureLaneHorizon was called (%q) during the "+
				"burn resolve, which runs inside action's Firestore resolve transaction (action/dao.go's "+
				"RunTransaction). EnsureLaneHorizon must never be reachable from system.Service.BodyTable/addGates "+
				"(design.md Decision 28) — observed calls during the resolve window: %v", e, spy.log())
		}
	}
}
