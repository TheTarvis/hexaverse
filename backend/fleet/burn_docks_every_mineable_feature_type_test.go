package fleet

// PERMANENT REGRESSION — originally built as a diagnostic probe for the
// link-4 slice e2e's last failure (`slice.spec.ts`): the roster waited 180s
// for a body-targeted burn to read "Docked" and never saw it — the fleet
// settled to `On station` (parked, unattached) instead. That defect is fixed;
// this test earns a permanent name because, unlike the `stale_arrival`
// family, it drives a REAL generated system end-to-end (real galaxy seed ->
// real GetOrCreateInterior materialize -> a real system.BodyTable) and is
// the only test proving a body-targeted burn attaches for every real
// mineable feature type the generator produces (rocky, gas_giant, ice, belt,
// anomaly — 9 cases), picking targets the same way slice.spec.ts's step 3
// does: any feature carrying `data-mineable` (front end: len(resources) > 0)
// whose id does not start with "feat-moon-". Every hop the original
// diagnosis brief asked for stays logged with -v.

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

func TestIntegration_BurnToEveryMineableFeatureType_DocksAgainstARealGeneratedSystem(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 0}

	// 1. Seed a REAL galaxy (same generator the game boots against), small
	// enough to materialize fast but otherwise DefaultParams.
	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	params := galaxy.DefaultParams()
	params.BlockSize = 4 // 4*78 = 312 > MaxLaneLength(180), strictly, per the existing spawnTestParams precedent
	params.StartAreaBlockRadius = 0
	params.MinOriginComponentSystems = 2
	meta, err := gsvc.Seed(ctx, 42, params)
	if err != nil {
		t.Fatalf("seeding a real galaxy failed: %v", err)
	}
	gid := meta.Id

	live, err := gsvc.GetLive(ctx)
	if err != nil {
		t.Fatalf("reading the live galaxy back failed: %v", err)
	}
	if len(live.Systems) == 0 {
		t.Fatal("seeded galaxy materialized zero systems — cannot pick a home")
	}
	systemID := live.Systems[0].Id
	t.Logf("picked systemId=%q from the real seeded galaxy (%d systems)", systemID, len(live.Systems))

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	// The REAL galaxy service is this stack's GraphSource — it is already in
	// scope and satisfies the interface, so the graph dependency is genuine
	// here rather than stubbed.
	fsvc := NewServiceWith(NewDaoWithClient(fs), ssvc, gsvc, asvc, clk)
	RegisterResolvers(asvc, ssvc)

	t.Cleanup(func() {
		common.CleanupFirestoreTestData(t, client, append([]string{
			"galaxies", "galaxy_pointers", "fleets", "actions",
		}, galaxy.SubcollectionPaths(gid, systemID)...)...)
	})

	// 2. Materialize a REAL interior the same way GetOrCreateInterior always
	// does (this IS spawn's own materialization path — corporations.Spawn's
	// home system read goes through this exact method).
	gen, err := ssvc.GetOrCreateInterior(ctx, systemID)
	if err != nil {
		t.Fatalf("materializing a real interior failed: %v", err)
	}
	t.Logf("generated interior: %d features", len(gen.Features))

	// 3. Pick candidates EXACTLY the way slice.spec.ts's step 3 does: any
	// feature carrying data-mineable (len(resources) > 0), excluding
	// "feat-moon-*". The e2e picks by pixel distance to the viewport
	// origin, which is effectively arbitrary — so every non-moon mineable
	// feature generated is a fair reproduction, and this probe tries ALL of
	// them rather than guessing which one the e2e would land on.
	var candidates []system.Feature
	for _, f := range gen.Features {
		if len(f.Resources) == 0 {
			continue
		}
		if strings.HasPrefix(f.Id, "feat-moon-") {
			continue
		}
		candidates = append(candidates, f)
	}
	if len(candidates) == 0 {
		t.Fatalf("no mineable non-moon feature was generated for %s — cannot reproduce the e2e's own pick "+
			"(re-seed with a different seed/params, or this system's own dial rolled zero lodes)", systemID)
	}
	ids := make([]string, len(candidates))
	for i, f := range candidates {
		ids[i] = string(f.Type) + ":" + f.Id
	}
	t.Logf("mineable non-moon candidates: %v", ids)

	bt, err := ssvc.BodyTable(ctx, systemID)
	if err != nil {
		t.Fatalf("building the real BodyTable failed: %v", err)
	}
	btIds := make(map[string]bool, len(bt.Ids()))
	for _, id := range bt.Ids() {
		btIds[id] = true
	}

	extent, starSize, err := fsvc.HomeGeometry(ctx, systemID)
	if err != nil {
		t.Fatalf("HomeGeometry failed: %v", err)
	}
	clearance := space.StarClearanceRadius(starSize)
	seedAt := space.Vec3{X: clearance * 3}
	if seedAt.X >= extent {
		seedAt.X = extent * 0.5
	}
	t.Logf("home geometry: extent=%v starSize=%v clearance=%v seedAt=%+v", extent, starSize, clearance, seedAt)

	for _, feat := range candidates {
		targetId := feat.Id
		t.Run(string(feat.Type)+"_"+targetId, func(t *testing.T) {
			// hop 0: is the e2e's own pick even a key in the body table at all?
			_, inBT := bt.Body(targetId)
			t.Logf("hop 0: target feature type=%q id=%q — in BodyTable.Ids()=%v, Body(id) ok=%v",
				feat.Type, targetId, btIds[targetId], inBT)

			f, err := fsvc.SeedFleet(ctx, systemID, "dev-corp-"+targetId, seedAt, starSize)
			if err != nil {
				t.Fatalf("SeedFleet failed: %v", err)
			}

			// hop 1: the bodyId OrderTo receives, and whether it commits at
			// all (a moon is REJECTED here by BuildCurve's endpoint-clearance
			// guard — this probe already excludes moons, so every candidate
			// here is expected to solve successfully).
			ordered, err := fsvc.OrderTo(ctx, f.Id, OrderRequest{BodyId: targetId})
			if err != nil {
				t.Fatalf("hop 1: OrderTo(bodyId=%q) returned an error rather than committing: %v", targetId, err)
			}
			if ordered.State.Mode != space.ModeBurn || ordered.State.Burn == nil {
				t.Fatalf("hop 1: expected a burn, got mode=%v", ordered.State.Mode)
			}
			t.Logf("hop 1: OrderTo committed — in-memory Burn.Target = %+v (BodyId=%q Point=%v)",
				ordered.State.Burn.Target, ordered.State.Burn.Target.BodyId, ordered.State.Burn.Target.Point)

			// hop 2: the Firestore round trip — reload the fleet doc fresh
			// (clock is still pre-arrival, so Get's opportunistic settle is a
			// no-op and this reads exactly what was persisted).
			reloaded, err := fsvc.Get(ctx, f.Id)
			if err != nil {
				t.Fatalf("hop 2: reloading the committed fleet failed: %v", err)
			}
			decoded, err := DecodeKinematicState(bt, reloaded.StateDoc, burnType, reloaded.ActiveActionId)
			if err != nil {
				t.Fatalf("hop 2: decoding the round-tripped burn failed: %v", err)
			}
			t.Logf("hop 2: post-Firestore-round-trip decoded Burn.Target = %+v (BodyId=%q Point=%v)",
				decoded.Burn.Target, decoded.Burn.Target.BodyId, decoded.Burn.Target.Point)

			// hop 3: settle — advance well past arrival and read through the
			// same opportunistic-settle seam Get uses (the roster's own read,
			// ListForCorp, shares this seam post-ad4f330).
			clk.now = ordered.State.Burn.ArriveMs + 60_000
			settled, err := fsvc.Get(ctx, f.Id)
			if err != nil {
				t.Fatalf("hop 3: settling the due arrival failed: %v", err)
			}
			var parkKind any
			var parkBodyId string
			if settled.State.Park != nil {
				parkKind = settled.State.Park.Kind
				parkBodyId = settled.State.Park.BodyId
			}
			t.Logf("hop 3: settled State.Mode=%v Park.Kind=%v Park.BodyId=%q AttachedTo=%q",
				settled.State.Mode, parkKind, parkBodyId, settled.AttachedTo)

			if settled.State.Mode != space.ModeParked {
				t.Errorf("target %s %q: settled mode = %v, want ModeParked", feat.Type, targetId, settled.State.Mode)
			}
			if settled.AttachedTo != targetId {
				t.Errorf("target %s %q: settled AttachedTo = %q, want %q — a body-targeted burn to a real "+
					"generated feature did not dock (this is the diagnosed cause of the link-4 slice e2e's "+
					"180s roster-status timeout, reproduced against a real generated system rather than a "+
					"hand-built fixture)", feat.Type, targetId, settled.AttachedTo, targetId)
			}
		})
	}
}
