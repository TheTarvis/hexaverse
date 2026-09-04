package system

import (
	"context"
	"sync"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"
)

func TestDao_RoundTrip(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	dao := NewDaoWithClient(fs)

	gid, sid := "gal_rt", "sys-0"
	gen := Generate(galaxy.SystemSeed(42, sid), "star_rich", sampleSkeleton(), DefaultParams())
	gen.Interior.SystemId = sid
	gen.Interior.CreatedAt = 999

	defer common.CleanupFirestoreTestData(t, client,
		interiorPath(gid, sid), featuresPath(gid, sid))

	if err := dao.CreateInterior(ctx, gid, gen); err != nil {
		t.Fatalf("CreateInterior: %v", err)
	}

	si, err := dao.GetInterior(ctx, gid, sid)
	if err != nil || si == nil {
		t.Fatalf("GetInterior: si=%v err=%v", si, err)
	}
	if si.Character != "star_rich" || si.CreatedAt != 999 {
		t.Fatalf("interior mismatch: %+v", si)
	}

	feats, err := dao.ListFeatures(ctx, gid, sid)
	if err != nil {
		t.Fatalf("ListFeatures: %v", err)
	}
	if len(feats) != len(gen.Features) {
		t.Fatalf("feature count: got %d want %d", len(feats), len(gen.Features))
	}
}

// A test was DELETED from here. It pinned that a feature's orbital period was
// NOT persisted — it was refilled from live tuning on every read, so retuning
// a global orbital law re-paced systems that already existed. There is no
// global orbital law any more, and no knob to retune: a body's
// period is a Keplerian function of its own continuous radius, drawn once at
// generation time and persisted with the rest of its element set. The read
// path no longer refills anything, so the property has no subject left
// (authorized deletion; cause = the requirement it pinned was removed).
// SpaceDoc's own round-trip is covered by interior_continuous_decode_test.go.

// TestDao_CreateOnce_UnderRace verifies the create-if-absent claim: N concurrent
// resolvers all try to materialize the same interior; exactly one wins the
// meta-doc Create, the rest get ErrAlreadyExists, and the stored feature set is
// the single winner's (never doubled).
func TestDao_CreateOnce_UnderRace(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	dao := NewDaoWithClient(fs)

	gid, sid := "gal_race", "sys-0"
	gen := Generate(galaxy.SystemSeed(42, sid), "star_rich", sampleSkeleton(), DefaultParams())
	gen.Interior.SystemId = sid

	defer common.CleanupFirestoreTestData(t, client,
		interiorPath(gid, sid), featuresPath(gid, sid))

	const racers = 8
	var wg sync.WaitGroup
	results := make([]error, racers)
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = dao.CreateInterior(ctx, gid, gen)
		}(i)
	}
	wg.Wait()

	wins, losses := 0, 0
	for _, err := range results {
		switch {
		case err == nil:
			wins++
		case err == ErrAlreadyExists:
			losses++
		default:
			t.Fatalf("unexpected error from racer: %v", err)
		}
	}
	if wins != 1 {
		t.Fatalf("expected exactly one winner, got %d (losses %d)", wins, losses)
	}

	// The stored feature set is one interior's worth — not N× duplicated.
	feats, err := dao.ListFeatures(ctx, gid, sid)
	if err != nil {
		t.Fatalf("ListFeatures: %v", err)
	}
	if len(feats) != len(gen.Features) {
		t.Fatalf("feature count doubled under race: got %d want %d", len(feats), len(gen.Features))
	}
}
