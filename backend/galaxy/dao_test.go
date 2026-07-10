package galaxy

import (
	"context"
	"reflect"
	"sort"
	"testing"

	"hexaverse/common"
)

func TestDao_SaveAndReadRoundTrip(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	dao := NewDaoWithClient(fs)

	gen := Generate(101, smallParams())
	gen.Galaxy.Id = "gal_test_roundtrip"
	gen.Galaxy.CreatedAt = 12345

	defer common.CleanupFirestoreTestData(t, client, galaxiesCollection, pointersCollection,
		systemsPath(gen.Galaxy.Id), lanesPath(gen.Galaxy.Id))

	if err := dao.SaveGalaxy(ctx, gen); err != nil {
		t.Fatalf("SaveGalaxy: %v", err)
	}

	meta, err := dao.GetGalaxyMeta(ctx, gen.Galaxy.Id)
	if err != nil || meta == nil {
		t.Fatalf("GetGalaxyMeta: meta=%v err=%v", meta, err)
	}
	if meta.Seed != 101 || meta.CreatedAt != 12345 {
		t.Fatalf("metadata mismatch: %+v", meta)
	}

	gotSystems, err := dao.ListSystems(ctx, gen.Galaxy.Id)
	if err != nil {
		t.Fatalf("ListSystems: %v", err)
	}
	gotLanes, err := dao.ListLanes(ctx, gen.Galaxy.Id)
	if err != nil {
		t.Fatalf("ListLanes: %v", err)
	}

	if len(gotSystems) != len(gen.Systems) {
		t.Fatalf("system count: got %d want %d", len(gotSystems), len(gen.Systems))
	}
	if len(gotLanes) != len(gen.Lanes) {
		t.Fatalf("lane count: got %d want %d", len(gotLanes), len(gen.Lanes))
	}

	// Firestore doesn't preserve order — sort both sides by id and deep-equal.
	sort.Slice(gotSystems, func(i, j int) bool { return gotSystems[i].Id < gotSystems[j].Id })
	want := append([]System(nil), gen.Systems...)
	sort.Slice(want, func(i, j int) bool { return want[i].Id < want[j].Id })
	if !reflect.DeepEqual(gotSystems, want) {
		t.Fatal("system round-trip not equal")
	}
}

func TestService_Generate_IdempotentAndReReadable(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	dao := NewDaoWithClient(fs)
	svc := NewServiceWith(dao, testClock())

	// Track ids so cleanup can reach their subcollections.
	first, err := svc.Generate(ctx, 1, smallParams())
	if err != nil {
		t.Fatalf("first Generate: %v", err)
	}
	second, err := svc.Generate(ctx, 2, smallParams())
	if err != nil {
		t.Fatalf("second Generate: %v", err)
	}
	defer common.CleanupFirestoreTestData(t, client, galaxiesCollection, pointersCollection,
		systemsPath(first.Galaxy.Id), lanesPath(first.Galaxy.Id),
		systemsPath(second.Galaxy.Id), lanesPath(second.Galaxy.Id))

	if first.Galaxy.Id == second.Galaxy.Id {
		t.Fatal("re-seed reused the same galaxy id (should be a fresh id)")
	}

	// Live should now resolve to the second galaxy — the first is untouched.
	live, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	if live.Galaxy.Id != second.Galaxy.Id {
		t.Fatalf("live pointer = %s, want latest %s", live.Galaxy.Id, second.Galaxy.Id)
	}
	if live.Galaxy.Seed != 2 {
		t.Fatalf("live seed = %d, want 2", live.Galaxy.Seed)
	}

	// The first galaxy is still fully readable at its own id (not corrupted).
	oldMeta, err := dao.GetGalaxyMeta(ctx, first.Galaxy.Id)
	if err != nil || oldMeta == nil || oldMeta.Seed != 1 {
		t.Fatalf("first galaxy not intact: meta=%+v err=%v", oldMeta, err)
	}
}
