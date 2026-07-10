package fleet

import (
	"context"
	"testing"

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
