package stations

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/observation"

	"cloud.google.com/go/firestore"
)

const (
	testGalaxyID   = "gal-test"
	testGalaxySeed = int64(9876)
)

type fakeGraph struct{}

func (f *fakeGraph) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) {
	return &galaxy.Galaxy{Id: testGalaxyID, Seed: testGalaxySeed}, nil
}

// fakeTiers answers the graph-tier fog read the visibility gate keys on.
type fakeTiers struct {
	byCorp map[string]map[string]observation.Tier
	err    error
}

func (f *fakeTiers) SystemTiers(_ context.Context, cid string) (map[string]observation.Tier, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.byCorp[cid], nil
}

type fakeClock struct{ now common.WorldMillis }

func (c fakeClock) Now() common.WorldMillis                                { return c.now }
func (c fakeClock) FromWall(interface{ IsZero() bool }) common.WorldMillis { return c.now }

func newStationFixture(t *testing.T, tiers *fakeTiers) (*Service, *firestore.Client, func()) {
	t.Helper()
	db, client := common.SetupFirestoreTestDAO(t)
	svc := NewServiceWith(NewDaoWithClient(db), &fakeGraph{}, tiers, common.WorldClock())
	cleanup := func() {
		// Per-test literal collection path — a parent-doc delete does NOT remove
		// Firestore subcollections, so the station docs must be named directly.
		common.CleanupFirestoreTestData(t, client,
			fmt.Sprintf("%s/%s/%s", galaxiesCollection, testGalaxyID, systemsSubcol))
	}
	return svc, client, cleanup
}

// stationCleanupPath names one system's station subcollection for cleanup.
func stationCleanupPath(systemID string) string {
	return fmt.Sprintf("%s/%s/%s/%s/%s",
		galaxiesCollection, testGalaxyID, systemsSubcol, systemID, stationSubcol)
}

func TestEnsureStation_ProvisionsExactlyOne(t *testing.T) {
	svc, client, _ := newStationFixture(t, &fakeTiers{})
	sysID := "sys-provision"
	defer common.CleanupFirestoreTestData(t, client, stationCleanupPath(sysID))

	ctx := context.Background()
	if err := svc.EnsureStation(ctx, sysID); err != nil {
		t.Fatalf("EnsureStation: %v", err)
	}

	st, err := svc.Get(ctx, sysID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if st == nil {
		t.Fatal("no station provisioned")
	}
	if st.OwnerCorpId != "" {
		t.Errorf("ownerCorpId = %q, want empty (NPC-owned) — this entry point takes no owner at all", st.OwnerCorpId)
	}
	if st.SystemId != sysID {
		t.Errorf("systemId = %q, want %q", st.SystemId, sysID)
	}
	// The orbit must match the pure derivation, so a docked fleet can recompute
	// it in-process without reading this store.
	want := DeriveOrbit(testGalaxySeed, sysID, svc.gateRing)
	if st.Orbit.Ring != want.Ring || st.Orbit.Angle0 != want.Angle0 || st.Orbit.Dir != want.Dir {
		t.Errorf("stored orbit %+v does not match the derivation %+v", st.Orbit, want)
	}
}

func TestEnsureStation_RepeatCallDoesNotProvisionASecond(t *testing.T) {
	svc, client, _ := newStationFixture(t, &fakeTiers{})
	sysID := "sys-repeat"
	defer common.CleanupFirestoreTestData(t, client, stationCleanupPath(sysID))

	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if err := svc.EnsureStation(ctx, sysID); err != nil {
			t.Fatalf("EnsureStation call %d: %v", i, err)
		}
	}

	docs, err := client.Collection(galaxiesCollection).Doc(testGalaxyID).
		Collection(systemsSubcol).Doc(sysID).Collection(stationSubcol).Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("listing stations: %v", err)
	}
	if len(docs) != 1 {
		t.Errorf("system carries %d station docs, want exactly 1", len(docs))
	}
}

func TestEnsureStation_ConcurrentCallsConvergeOnOne(t *testing.T) {
	// Two corporations spawning into the same home system, at the same moment.
	// The create-if-absent claim is what makes them converge rather than each
	// getting their own station.
	svc, client, _ := newStationFixture(t, &fakeTiers{})
	sysID := "sys-concurrent"
	defer common.CleanupFirestoreTestData(t, client, stationCleanupPath(sysID))

	ctx := context.Background()
	var wg sync.WaitGroup
	errs := make([]error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = svc.EnsureStation(ctx, sysID)
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		// Losing the race is SUCCESS — that is what idempotent provisioning means.
		if err != nil {
			t.Errorf("concurrent EnsureStation %d = %v, want nil", i, err)
		}
	}
	docs, err := client.Collection(galaxiesCollection).Doc(testGalaxyID).
		Collection(systemsSubcol).Doc(sysID).Collection(stationSubcol).Documents(ctx).GetAll()
	if err != nil {
		t.Fatalf("listing stations: %v", err)
	}
	if len(docs) != 1 {
		t.Errorf("system carries %d station docs after a concurrent race, want exactly 1", len(docs))
	}
}

func TestGetVisible_GateHidesExistenceBelowTheTier(t *testing.T) {
	sysID := "sys-gated"
	tiers := &fakeTiers{byCorp: map[string]map[string]observation.Tier{
		"corp-knows":   {sysID: observation.TierRumored},
		"corp-glimpse": {sysID: observation.TierStarVisible},
		"corp-blind":   {},
	}}
	svc, client, _ := newStationFixture(t, tiers)
	defer common.CleanupFirestoreTestData(t, client, stationCleanupPath(sysID))

	ctx := context.Background()
	if err := svc.EnsureStation(ctx, sysID); err != nil {
		t.Fatalf("EnsureStation: %v", err)
	}

	// At or above the minimum tier: the station discloses.
	st, err := svc.GetVisible(ctx, "corp-knows", sysID)
	if err != nil {
		t.Fatalf("GetVisible at rumored = %v, want the station", err)
	}
	if st == nil {
		t.Fatal("no station returned to a corp at the minimum tier")
	}

	// Below it, and for a corp with no knowledge at all: 404-shaped, and the SAME
	// response as an unknown system — so this can never be used to probe which
	// systems carry stations (and therefore where corporations woke up).
	for _, corp := range []string{"corp-glimpse", "corp-blind"} {
		if _, err := svc.GetVisible(ctx, corp, sysID); !errors.Is(err, ErrNotFound) {
			t.Errorf("GetVisible for %s = %v, want ErrNotFound", corp, err)
		}
	}
	unknownErr := func() error {
		_, err := svc.GetVisible(ctx, "corp-knows", "sys-does-not-exist")
		return err
	}()
	belowGateErr := func() error {
		_, err := svc.GetVisible(ctx, "corp-glimpse", sysID)
		return err
	}()
	if unknownErr.Error() != belowGateErr.Error() {
		t.Errorf("unknown-system (%v) and below-gate (%v) responses differ; they must be indistinguishable",
			unknownErr, belowGateErr)
	}
}

func TestStationFeature_ShapesAnOrbitingBoardFeature(t *testing.T) {
	svc, client, _ := newStationFixture(t, &fakeTiers{})
	sysID := "sys-feature"
	defer common.CleanupFirestoreTestData(t, client, stationCleanupPath(sysID))

	ctx := context.Background()
	if err := svc.EnsureStation(ctx, sysID); err != nil {
		t.Fatalf("EnsureStation: %v", err)
	}

	feat, err := svc.StationFeature(ctx, sysID)
	if err != nil {
		t.Fatalf("StationFeature: %v", err)
	}
	if feat == nil {
		t.Fatal("no station feature returned")
	}
	if feat.Orbit == nil {
		t.Fatal("station feature carries no orbital elements — a docked fleet could not resolve its position")
	}
	// Period is never persisted (it is derived from live tuning), so the feature
	// must refill it; a zero period would freeze the station at its epoch anchor.
	if feat.Orbit.Period == 0 {
		t.Error("station feature's orbital period is 0; it must be refilled from live tuning on read")
	}
	if len(feat.Footprint) == 0 {
		t.Error("station feature has no footprint hex")
	}
}

func TestStationFeature_AbsentSystemYieldsNoFeature(t *testing.T) {
	svc, _, _ := newStationFixture(t, &fakeTiers{})
	feat, err := svc.StationFeature(context.Background(), "sys-has-no-station")
	if err != nil {
		t.Fatalf("StationFeature = %v, want no error", err)
	}
	if feat != nil {
		t.Error("a system with no station yielded a feature")
	}
}
