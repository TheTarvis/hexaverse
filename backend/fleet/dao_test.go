package fleet

import (
	"context"
	"testing"

	"hexaverse/board"
	"hexaverse/common"
)

// TestListByCorporation proves the coverage input query returns only a
// corporation's own fleets — the boundary fog isolation rides on.
func TestListByCorporation(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, firestoreCollection)

	ctx := context.Background()
	dao := NewDaoWithClient(fs)
	for _, f := range []Fleet{
		{Id: "f1", CorporationId: "corp-A", SystemId: "s1"},
		{Id: "f2", CorporationId: "corp-A", SystemId: "s2"},
		{Id: "f3", CorporationId: "corp-B", SystemId: "s1"},
	} {
		if err := dao.Save(ctx, f); err != nil {
			t.Fatalf("seed %s: %v", f.Id, err)
		}
	}

	got, err := dao.ListByCorporation(ctx, "corp-A")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("got %d fleets for corp-A, want 2 (corp-B's must not leak)", len(got))
	}
	for _, f := range got {
		if f.CorporationId != "corp-A" {
			t.Errorf("foreign fleet %s leaked into corp-A's list", f.Id)
		}
	}
}

// TestDao_CoastPeriod_RehydratedFromLiveTuning is the regression for the bug that
// survived the first cut of "orbits are tunable": Period was still persisted on the
// fleet doc, so a fleet kept coasting at whatever pace it SETTLED at. Retuning
// orbits spun the planets up and left the ship hanging there.
//
// Both reads (Get and the list query) must hydrate — the board view uses one, the
// fleet roster the other, and a ship that moves on one screen and not the other is
// worse than one that doesn't move at all.
func TestDao_CoastPeriod_RehydratedFromLiveTuning(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, firestoreCollection)

	ctx := context.Background()
	dao := NewDaoWithClient(fs)

	// A fleet that settled long ago, under a slow world.
	const ring = 4
	slow := common.DefaultTuning()
	slow.OrbitBasePeriod = 3_600_000_000 // the old "ships are static" pace
	common.SetTuning(slow)

	if err := dao.Save(ctx, Fleet{
		Id: "f1", CorporationId: "corp-A", SystemId: "s1",
		State: coastState(board.Hex{Q: ring, R: 0}, 0),
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// The operator speeds the world's orbits up.
	fast := common.DefaultTuning()
	fast.OrbitBasePeriod = 600
	common.SetTuning(fast)
	defer common.SetTuning(common.DefaultTuning())

	want := fast.OrbitPeriod(ring)

	got, err := dao.Get(ctx, "f1")
	if err != nil || got == nil {
		t.Fatalf("Get: f=%v err=%v", got, err)
	}
	if got.State.Coast == nil || got.State.Coast.Period != want {
		t.Errorf("Get: coast period = %v, want %d (live pace, not the settle-time pace)",
			got.State.Coast, want)
	}

	list, err := dao.ListByCorporation(ctx, "corp-A")
	if err != nil || len(list) != 1 {
		t.Fatalf("list: got %d fleets, err=%v", len(list), err)
	}
	if list[0].State.Coast == nil || list[0].State.Coast.Period != want {
		t.Errorf("list: coast period = %v, want %d", list[0].State.Coast, want)
	}
}
