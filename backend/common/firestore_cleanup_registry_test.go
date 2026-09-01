package common

// Pins the outcome of the sightings change's tasks 2.11 + 7.5: cleaning a
// parent collection must also clear the subcollections registered under it, so
// a test that cleans "corporations" no longer orphans that corp's charts,
// chartedLanes, sightings, ledger and reconciliation piles.
//
// This is deliberately a BEHAVIORAL pin, not an assertion about the registry
// map's contents: a future refactor that derives the list instead of hand-
// maintaining it should keep these tests green without edits.

import (
	"context"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"google.golang.org/api/iterator"
)

// corpSubcollections is spelled out here on purpose — the test names the
// collections independently of the production registry it is checking, so a
// deletion from that registry fails this test instead of silently redefining
// what "cleaned" means.
var corpSubcollections = []string{"charts", "chartedLanes", "sightings", "ledger", "reconciliation"}

func docCount(t *testing.T, ctx context.Context, col *firestore.CollectionRef) int {
	t.Helper()
	n := 0
	iter := col.Documents(ctx)
	defer iter.Stop()
	for {
		_, err := iter.Next()
		if err == iterator.Done {
			return n
		}
		if err != nil {
			t.Fatalf("counting %s: %v", col.Path, err)
		}
		n++
	}
}

// Scenario: cleaning "corporations" clears every registered subcollection of
// every corporation document.
func TestCleanupFirestoreTestData_CleansRegisteredCorporationSubcollections(t *testing.T) {
	client := SetupFirestoreTestClient(t)
	ctx := context.Background()

	corpID := "corp-cleanup-" + uuid.NewString()
	corpRef := client.Collection("corporations").Doc(corpID)
	if _, err := corpRef.Set(ctx, map[string]any{"name": "cleanup fixture"}); err != nil {
		t.Fatalf("seeding %s: %v", corpRef.Path, err)
	}
	for _, sub := range corpSubcollections {
		if _, err := corpRef.Collection(sub).Doc("fixture").Set(ctx, map[string]any{"seeded": true}); err != nil {
			t.Fatalf("seeding %s/%s/fixture: %v", corpRef.Path, sub, err)
		}
	}

	CleanupFirestoreTestData(t, client, "corporations")

	if snap, err := corpRef.Get(ctx); err == nil && snap.Exists() {
		t.Errorf("%s still exists after cleanup", corpRef.Path)
	}
	for _, sub := range corpSubcollections {
		if n := docCount(t, ctx, corpRef.Collection(sub)); n != 0 {
			t.Errorf("%s/%s holds %d document(s) after CleanupFirestoreTestData(\"corporations\"); "+
				"Firestore does not cascade, so an unregistered subcollection leaks into every later run",
				corpRef.Path, sub, n)
		}
	}
}

// Scenario: a subcollection ALREADY orphaned by an earlier run — its parent
// document deleted, the subcollection left behind — is cleaned too. Firestore's
// Documents() query does not return such "missing" parents, so this is the case
// a naive parent sweep can never heal.
func TestCleanupFirestoreTestData_CleansAlreadyOrphanedSubcollections(t *testing.T) {
	client := SetupFirestoreTestClient(t)
	ctx := context.Background()

	corpID := "corp-orphan-" + uuid.NewString()
	corpRef := client.Collection("corporations").Doc(corpID)
	// No parent document is ever written: this is exactly the state a previous
	// cleanup left behind when it deleted the corp doc and orphaned its pile.
	if _, err := corpRef.Collection("sightings").Doc("fixture").Set(ctx, map[string]any{"seeded": true}); err != nil {
		t.Fatalf("seeding orphaned %s/sightings/fixture: %v", corpRef.Path, err)
	}

	CleanupFirestoreTestData(t, client, "corporations")

	if n := docCount(t, ctx, corpRef.Collection("sightings")); n != 0 {
		t.Errorf("%s/sightings holds %d document(s) after cleanup, want 0 — an orphaned pile survives "+
			"forever, and every spawn afterwards pays to read it", corpRef.Path, n)
	}
}
