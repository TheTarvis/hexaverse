package observation

import (
	"context"
	"testing"

	"hexaverse/board"
	"hexaverse/common"

	"github.com/google/uuid"
)

// fakeInteriors is a hand fake of InteriorSource returning fixed geometry on
// an 8-ring board.
type fakeInteriors struct{ feats map[string][]FeatureGeom }

func (f fakeInteriors) Features(_ context.Context, systemID string) ([]FeatureGeom, error) {
	return f.feats[systemID], nil
}


// fakeFleets is a hand fake of FleetSource returning each corp's units.
type fakeFleets struct{ byCorp map[string][]FleetPos }

func (f fakeFleets) FleetsForCorp(_ context.Context, cid string, _ common.WorldMillis) ([]FleetPos, error) {
	return f.byCorp[cid], nil
}

// sampleInterior is a star + an orbiting rocky planet + a belt — enough to
// exercise astronomical vs. detail features and orbiting geometry.
func sampleInterior(systemID string) fakeInteriors {
	return fakeInteriors{feats: map[string][]FeatureGeom{
		systemID: {
			{Id: "feat-star", Anchor: board.Hex{Q: 0, R: 0}, Astronomical: true,
				Detail: &FeatureDetail{FeatureType: "star"}},
			{Id: "feat-body-0", Elements: &board.Orbit{Ring: 3, Angle0: 0, Period: 0, Dir: 1}, Astronomical: true,
				Detail: &FeatureDetail{FeatureType: "rocky", Resources: []ResourceReading{{Kind: "metals", Richness: 0.7}}}},
			{Id: "feat-belt-0", Elements: &board.Orbit{Ring: 5, Angle0: 2, Period: 0, Dir: 1},
				Detail: &FeatureDetail{FeatureType: "belt"}},
		},
	}}
}

// TestFogIsolation_OneScans_OtherUnchanged is the M6 keystone (build-order:
// write the two-player isolation test first). One Corporation scans a system;
// the other Corporation's projection of that same system is entirely unchanged —
// no tier, no remembered features, no coverage. Fog is strictly per-Corporation.
func TestFogIsolation_OneScans_OtherUnchanged(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corpA := "corp-" + uuid.NewString()
	corpB := "corp-" + uuid.NewString()
	const sys = "sys-1"

	interiors := sampleInterior(sys)
	// Corp A has a fleet sitting at the star; corp B has none in this system.
	fleets := fakeFleets{byCorp: map[string][]FleetPos{
		corpA: {{Id: "fa", CorporationId: corpA, SystemId: sys, Hex: board.Hex{Q: 0, R: 0}}},
	}}
	svc := NewServiceWith(NewDaoWithClient(service), fleets, interiors, beamLanes{}, common.WorldClock())

	at := common.WorldMillis(1_000)
	if err := svc.MintScan(ctx, corpA, sys, board.Hex{Q: 0, R: 0}, at); err != nil {
		t.Fatalf("corp A scan: %v", err)
	}

	// Corp A earned per-feature memory — and no graph tier: scanning reveals the
	// board and charts lanes, it never writes surveyed (#0006 Decision #20).
	tiersA, err := svc.SystemTiers(ctx, corpA)
	if err != nil {
		t.Fatalf("tiers A: %v", err)
	}
	if got, ok := tiersA[sys]; ok {
		t.Errorf("corp A gained graph tier %q from a scan; scans grant none", got)
	}
	remA, err := svc.RememberedFeatures(ctx, corpA, sys)
	if err != nil {
		t.Fatalf("remembered A: %v", err)
	}
	if len(remA) != 3 {
		t.Errorf("corp A remembered %d features, want 3", len(remA))
	}

	// Corp B is completely unaffected — the isolation invariant.
	tiersB, err := svc.SystemTiers(ctx, corpB)
	if err != nil {
		t.Fatalf("tiers B: %v", err)
	}
	if _, leaked := tiersB[sys]; leaked {
		t.Errorf("corp B leaked a subspace tier for a system only corp A scanned")
	}
	remB, err := svc.RememberedFeatures(ctx, corpB, sys)
	if err != nil {
		t.Fatalf("remembered B: %v", err)
	}
	if len(remB) != 0 {
		t.Errorf("corp B leaked %d remembered features from corp A's scan", len(remB))
	}

	// Coverage is per-corp: A covers its fleet's hex; B covers nothing here.
	covA, err := svc.Coverage(ctx, corpA, sys, at)
	if err != nil {
		t.Fatalf("coverage A: %v", err)
	}
	if !covA.Covers(board.Hex{Q: 0, R: 0}) {
		t.Errorf("corp A should cover its own fleet's hex")
	}
	covB, err := svc.Coverage(ctx, corpB, sys, at)
	if err != nil {
		t.Fatalf("coverage B: %v", err)
	}
	if !covB.Empty() {
		t.Errorf("corp B should have no coverage in a system it has no units in")
	}

	// Own-perception is never fogged; a foreign fleet outside your coverage is.
	aFleet := FleetPos{Id: "fa", CorporationId: corpA, SystemId: sys, Hex: board.Hex{Q: 0, R: 0}}
	if vis, _ := svc.FleetVisibleTo(ctx, corpA, aFleet, at); !vis {
		t.Errorf("a corp must always see its own fleet")
	}
	if vis, _ := svc.FleetVisibleTo(ctx, corpB, aFleet, at); vis {
		t.Errorf("corp A's fleet leaked to corp B, which has no coverage of it")
	}
}

// TestRememberedKeepsOrbiting proves a remembered feature stores its orbital
// elements, so a consumer draws it at its CURRENT computed position while its
// activity/detail stay frozen at asOf (geometry lives, activity freezes).
func TestRememberedKeepsOrbiting(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	const sys = "sys-1"
	// A planet with a real period, so its position advances over time.
	interiors := fakeInteriors{feats: map[string][]FeatureGeom{
		sys: {{Id: "feat-body-0", Elements: &board.Orbit{Ring: 4, Angle0: 0, Period: 24_000, Dir: 1}}},
	}}
	svc := NewServiceWith(NewDaoWithClient(service), fakeFleets{}, interiors, beamLanes{}, common.WorldClock())

	if err := svc.MintScan(ctx, corp, sys, board.Hex{Q: 0, R: 0}, 1_000); err != nil {
		t.Fatalf("scan: %v", err)
	}
	rem, err := svc.RememberedFeatures(ctx, corp, sys)
	if err != nil {
		t.Fatalf("remembered: %v", err)
	}
	mem, ok := rem["feat-body-0"]
	if !ok || mem.Elements == nil {
		t.Fatalf("remembered feature lost its orbital elements")
	}
	// The stored elements evaluate to different hexes at different times — the
	// clockwork keeps ticking in memory.
	early := board.OrbState(*mem.Elements, 1_000)
	late := board.OrbState(*mem.Elements, 7_000)
	if early == late {
		t.Errorf("remembered feature is frozen in place; it should keep orbiting (early=%v late=%v)", early, late)
	}
	if mem.AsOf != 1_000 {
		t.Errorf("activity/detail should freeze at asOf=1000, got %d", mem.AsOf)
	}
}
