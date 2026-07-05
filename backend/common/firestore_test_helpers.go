package common

import (
	"context"
	"errors"
	"os"
	"testing"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

// SetupFirestoreTestClient creates a Firestore client for testing
// Assumes emulator is running: firebase emulators:start --only firestore,auth, pubsub --config firebase.test.json
//
//goland:noinspection GoUnhandledErrorResult
func SetupFirestoreTestClient(t *testing.T) *firestore.Client {
	if testing.Short() {
		t.Skip("integration test needs the Firestore emulator; skipped with -short")
	}
	// Ensure we're using the test emulator
	os.Setenv("FIRESTORE_EMULATOR_HOST", "localhost:9100")

	ctx := context.Background()
	// Project ID must match the emulator's --project flag to see data in UI
	client, err := firestore.NewClient(ctx, "test")
	if err != nil {
		t.Fatalf("Failed to create Firestore client: %v", err)
	}

	return client
}

// CleanupFirestoreTestData removes all test data from specified collections
// Pass specific collections to clean to avoid race conditions in parallel tests
func CleanupFirestoreTestData(t *testing.T, client *firestore.Client, collections ...string) {
	// Manual cleanup fallback
	ctx := context.Background()

	for _, collName := range collections {
		iter := client.Collection(collName).Documents(ctx)
		for {
			doc, err := iter.Next()
			if err != nil {
				if errors.Is(err, iterator.Done) {
					break
				}
				t.Logf("Error iterating %s: %v", collName, err)
				break
			}

			if _, err := doc.Ref.Delete(ctx); err != nil {
				t.Logf("Error deleting document %s: %v", doc.Ref.Path, err)
			}
		}
		iter.Stop()
	}
}

// SetupFirestoreTestDAO creates a DAO with a test Firestore client
// This is a generic helper that can be used by any package
func SetupFirestoreTestDAO(t *testing.T) (FirestoreService, *firestore.Client) {
	client := SetupFirestoreTestClient(t)
	service := NewFirestoreServiceWithClient(client)
	return service, client
}
