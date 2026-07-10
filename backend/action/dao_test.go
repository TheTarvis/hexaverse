package action

import (
	"context"
	"strings"
	"testing"

	"hexaverse/common"
)

// TestRefFromPath validates the alternating collection/doc path resolver the
// structured resolve-writes depend on.
func TestRefFromPath(t *testing.T) {
	fs, _ := common.SetupFirestoreTestDAO(t)
	dao := NewDaoWith(fs, common.WorldClock()).(*DaoImpl)

	for _, bad := range [][]string{{}, {"a"}, {"a", "b", "c"}} {
		if _, err := dao.refFromPath(bad); err == nil {
			t.Errorf("refFromPath(%v) should error (needs even length ≥ 2)", bad)
		}
	}

	ref, err := dao.refFromPath([]string{"corporations", "corp-1", "observations", "sys-1", "features", "feat-0"})
	if err != nil {
		t.Fatalf("valid nested path: %v", err)
	}
	if !strings.HasSuffix(ref.Path, "corporations/corp-1/observations/sys-1/features/feat-0") {
		t.Errorf("ref path = %q, want the nested suffix", ref.Path)
	}
}

// TestResolveOne_AppliesStructuredWrites proves a resolver's Writes land at their
// target paths in the SAME transaction as the status flip — the path scan (and
// later mine) mint observations through.
func TestResolveOne_AppliesStructuredWrites(t *testing.T) {
	svc, fs, clk, cleanup := newActionService(t)
	defer cleanup()

	svc.RegisterResolver("reveal", KindMutating, func(_ context.Context, r Resolution) (ResolveResult, error) {
		return ResolveResult{Outcome: "revealed", Writes: []DocWrite{{
			Path: []string{corporationsCollection, "corp-x", "observations", "sys-x"},
			Data: map[string]interface{}{"tier": "surveyed", "asOf": int64(r.At)},
		}}}, nil
	})
	ctx := context.Background()
	newActorDoc(t, fs, "fleetW")

	if _, err := svc.Commit(ctx, CommitSpec{Type: "reveal", Actor: "fleetW", ActorCollection: "fleets", Scope: "sys-x", Eta: 1000}); err != nil {
		t.Fatal(err)
	}
	clk.set(5000)
	if _, err := svc.ResolveActive(ctx, "fleetW"); err != nil {
		t.Fatal(err)
	}

	doc, err := fs.Collection(corporationsCollection).Doc("corp-x").Collection("observations").Doc("sys-x").Get(ctx)
	if err != nil {
		t.Fatalf("reading the structured write: %v", err)
	}
	if doc.Data()["tier"] != "surveyed" {
		t.Errorf("resolve write not applied: %v", doc.Data())
	}
}

const corporationsCollection = "corporations"
