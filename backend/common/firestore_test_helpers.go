package common

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
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

// RegisteredTopLevelCollections names every top-level Firestore collection this
// backend writes. RegisteredSubcollections names the subcollections that hang
// off a document of the named parent collection.
//
// Together they are THE registry backend/CLAUDE.md's rule refers to ("New
// collections must be added to CleanupFirestoreTestData() ... so emulator state
// doesn't leak between tests"). Two things consume them:
//
//  1. CleanupFirestoreTestData — cleaning "corporations" now also clears that
//     corp's charts/chartedLanes/sightings/ledger/reconciliation piles, which
//     Firestore's non-cascading delete would otherwise orphan.
//  2. UnregisteredCollections — the loud-failure guard. An emulator-backed suite
//     calls it after its run; anything the production code actually created that
//     is missing from these lists comes back as a failure instead of silently
//     accumulating. This is what stops the registry from being one more
//     hand-maintained list kept in sync by memory.
var RegisteredTopLevelCollections = []string{
	"accounts",        // backend/account/dao.go
	"actions",         // backend/action/dao.go
	"corpByAccount",   // backend/corporations/dao.go
	"corporations",    // backend/corporations/dao.go
	"deltas",          // backend/action/dao.go
	"fleets",          // backend/fleet/dao.go
	"galaxies",        // backend/galaxy/dao.go, backend/stations/dao.go
	"galaxy_pointers", // backend/galaxy/dao.go
	"spawnClaims",     // backend/corporations/dao.go
}

// RegisteredSubcollections maps a parent collection's leaf name to the
// subcollections hanging off each of its documents.
var RegisteredSubcollections = map[string][]string{
	// backend/charts/dao.go, backend/sightings/dao.go, backend/corporations/credits.go
	// "fuelGrants" is the openspec change add-fuel-as-cargo's starting-fuel
	// idempotency anchor (corporations/{corpId}/fuelGrants/{fleetId},
	// corporation-spawn's "Spawn Asset Healing") — registered ahead of the
	// production write landing (test infrastructure only, backend/CLAUDE.md's
	// registry rule) so the root suite's UnregisteredCollections guard doesn't
	// fail the very first green run that creates one.
	"corporations": {"charts", "chartedLanes", "sightings", "ledger", "reconciliation", "fuelGrants"},
	// backend/action/dao.go — deltas/{scope}/entries/{actionId}
	"deltas": {"entries"},
	// backend/galaxy/dao.go
	"galaxies": {"systems", "lanes", "blocks"},
	// backend/system/dao.go, backend/stations/dao.go
	"systems": {"interior", "features", "station"},
}

// cleanupSkipsChildrenOf names the registered parents CleanupFirestoreTestData
// deliberately does NOT descend into. A galaxy holds thousands of system
// documents, so descending would add a per-document metadata round trip to every
// galaxy-touching suite; those paths already have the repo's other mechanism
// (galaxy.SubcollectionPaths), which a caller names explicitly for the handful of
// systems its test actually touched. This is a cost decision, not an oversight —
// the paths stay REGISTERED (so the loud-failure guard still knows them), they
// are just not auto-traversed.
var cleanupSkipsChildrenOf = map[string]bool{"galaxies": true, "systems": true}

// CleanupFirestoreTestData removes all test data from specified collections
// Pass specific collections to clean to avoid race conditions in parallel tests
//
// Firestore does not cascade: deleting a document ORPHANS its subcollections,
// which then leak into the next test. Subcollections named in
// RegisteredSubcollections are cleaned along with their parent; anything else
// nested must be named explicitly — for a galaxy, ask the galaxy package for
// them (`galaxy.SubcollectionPaths`) rather than spelling them out, so a domain
// that adds a subcollection (as the endless galaxy added `blocks`) updates every
// caller at once.
func CleanupFirestoreTestData(t *testing.T, client *firestore.Client, collections ...string) {
	// Manual cleanup fallback
	ctx := context.Background()

	for _, collName := range collections {
		cleanupRegisteredSubcollections(t, client, ctx, collName)

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

// cleanupRegisteredSubcollections deletes every registered subcollection under
// each document of collPath before the caller deletes the parent documents
// themselves.
//
// It enumerates DocumentRefs, not Documents: Firestore's Documents() query skips
// "missing" documents — parents that exist only because a subcollection hangs off
// them — which is precisely the shape an EARLIER cleanup left behind when it
// deleted a corp doc and orphaned its charts. DocumentRefs sees those, so this
// also heals state a previous run leaked.
//
// A path whose leaf collection is not in the registry costs nothing: the map
// lookup misses and the function returns before touching Firestore.
func cleanupRegisteredSubcollections(t *testing.T, client *firestore.Client, ctx context.Context, collPath string) {
	segments := strings.Split(collPath, "/")
	leaf := segments[len(segments)-1]
	if cleanupSkipsChildrenOf[leaf] {
		return
	}
	subs := RegisteredSubcollections[leaf]
	if len(subs) == 0 {
		return
	}

	refs := client.Collection(collPath).DocumentRefs(ctx)
	for {
		parent, err := refs.Next()
		if err != nil {
			if !errors.Is(err, iterator.Done) {
				t.Logf("Error listing document refs of %s: %v", collPath, err)
			}
			break
		}
		for _, sub := range subs {
			docs := parent.Collection(sub).Documents(ctx)
			for {
				doc, err := docs.Next()
				if err != nil {
					if !errors.Is(err, iterator.Done) {
						t.Logf("Error iterating %s/%s: %v", parent.Path, sub, err)
					}
					break
				}
				if _, err := doc.Ref.Delete(ctx); err != nil {
					t.Logf("Error deleting document %s: %v", doc.Ref.Path, err)
				}
			}
			docs.Stop()
		}
	}
}

// unregisteredScanDocSample bounds the guard's cost: it lists the
// subcollections of at most this many documents per collection. A subcollection
// a package writes is written for essentially every document of its parent, so
// a small sample finds it; the bound is what keeps the scan O(1) against a
// galaxy holding thousands of system documents.
const unregisteredScanDocSample = 5

// UnregisteredCollections returns every collection path present in the database
// that the registry above does not name — the LOUD-FAILURE GUARD for the
// hand-maintained-list problem.
//
// Call it from an emulator-backed suite AFTER its run, against a project that
// suite owns. It reports what production code actually created, so a new domain
// that starts writing a new collection and forgets to register it fails a test
// run instead of silently leaking state into every later run. The scan is
// bounded (see unregisteredScanDocSample) and read-only.
//
// Coverage is honest but partial by construction: it can only see collections
// the calling suite actually exercised. It never produces a false failure —
// anything it names really is an unregistered collection that really exists.
func UnregisteredCollections(ctx context.Context, client *firestore.Client) ([]string, error) {
	known := make(map[string]bool, len(RegisteredTopLevelCollections))
	for _, c := range RegisteredTopLevelCollections {
		known[c] = true
	}

	var unregistered []string
	tops, err := collectionIDs(ctx, client.Collections(ctx))
	if err != nil {
		return nil, fmt.Errorf("listing top-level collections: %w", err)
	}
	for _, top := range tops {
		if !known[top] {
			unregistered = append(unregistered, top)
			continue
		}
		found, err := scanSubcollections(ctx, client.Collection(top), top, top)
		if err != nil {
			return nil, err
		}
		unregistered = append(unregistered, found...)
	}
	sort.Strings(unregistered)
	return unregistered, nil
}

// scanSubcollections samples documents of col and reports any subcollection of
// theirs that RegisteredSubcollections does not name for parentLeaf, recursing
// into the ones it does name.
func scanSubcollections(ctx context.Context, col *firestore.CollectionRef, parentLeaf, path string) ([]string, error) {
	registered := make(map[string]bool, len(RegisteredSubcollections[parentLeaf]))
	for _, c := range RegisteredSubcollections[parentLeaf] {
		registered[c] = true
	}

	var out []string
	seen := map[string]bool{}
	refs := col.DocumentRefs(ctx)
	for i := 0; i < unregisteredScanDocSample; i++ {
		doc, err := refs.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("listing documents of %s: %w", path, err)
		}
		children, err := collectionIDs(ctx, doc.Collections(ctx))
		if err != nil {
			return nil, fmt.Errorf("listing subcollections of %s: %w", doc.Path, err)
		}
		for _, child := range children {
			if seen[child] {
				continue
			}
			seen[child] = true
			childPath := path + "/*/" + child
			if !registered[child] {
				out = append(out, childPath)
				continue
			}
			deeper, err := scanSubcollections(ctx, doc.Collection(child), child, childPath)
			if err != nil {
				return nil, err
			}
			out = append(out, deeper...)
		}
	}
	return out, nil
}

func collectionIDs(ctx context.Context, iter *firestore.CollectionIterator) ([]string, error) {
	var out []string
	for {
		col, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		out = append(out, col.ID)
	}
}

// SetupFirestoreTestDAO creates a DAO with a test Firestore client
// This is a generic helper that can be used by any package
func SetupFirestoreTestDAO(t *testing.T) (FirestoreService, *firestore.Client) {
	client := SetupFirestoreTestClient(t)
	service := NewFirestoreServiceWithClient(client)
	return service, client
}
