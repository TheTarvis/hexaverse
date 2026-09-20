package common

import (
	"context"
	"fmt"
	"hexaverse/config"
	"os"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupFirestoreTestClient creates a test client connected to the Firestore emulator
func setupFirestoreTestClient(t *testing.T) *firestore.Client {
	t.Helper()

	if testing.Short() {
		t.Skip("integration test needs the Firestore emulator; skipped with -short")
	}

	// Ensure we're using the test emulator
	os.Setenv("FIRESTORE_EMULATOR_HOST", "localhost:9100")

	// Ensure emulator is being used
	emulatorHost := os.Getenv("FIRESTORE_EMULATOR_HOST")
	if emulatorHost == "" {
		t.Skip("FIRESTORE_EMULATOR_HOST not set, skipping integration test")
	}

	ctx := context.Background()
	client, err := firestore.NewClient(ctx, config.ServiceConfig.FirebaseProjectID)
	require.NoError(t, err)

	return client
}

// cleanupCollection deletes all documents in a collection
func cleanupCollection(ctx context.Context, client *firestore.Client, collection string) error {
	docs, err := client.Collection(collection).Documents(ctx).GetAll()
	if err != nil {
		return err
	}

	for _, doc := range docs {
		if _, err := doc.Ref.Delete(ctx); err != nil {
			return err
		}
	}
	return nil
}

func TestMaxBulkWriteBatchSize(t *testing.T) {
	assert.Equal(t, 400, MaxBulkWriteBatchSize, "MaxBulkWriteBatchSize should be 400")
}

func TestFirestoreBaseService_BatchSet(t *testing.T) {
	client := setupFirestoreTestClient(t)
	defer client.Close()

	service := &FirestoreBaseService{Client: client}
	ctx := context.Background()
	testCollection := "test_batch_set"

	// Cleanup before and after
	defer cleanupCollection(ctx, client, testCollection)
	cleanupCollection(ctx, client, testCollection)

	t.Run("empty writes returns nil", func(t *testing.T) {
		err := service.BatchSet(ctx, []BatchWrite{})
		assert.NoError(t, err)
	})

	t.Run("single write succeeds", func(t *testing.T) {
		writes := []BatchWrite{
			{
				Collection: testCollection,
				DocID:      "doc-1",
				Data:       map[string]interface{}{"name": "test1"},
			},
		}

		err := service.BatchSet(ctx, writes)
		assert.NoError(t, err)

		// Verify document was written
		doc, err := client.Collection(testCollection).Doc("doc-1").Get(ctx)
		require.NoError(t, err)
		assert.Equal(t, "test1", doc.Data()["name"])
	})

	t.Run("multiple writes within single chunk", func(t *testing.T) {
		writes := make([]BatchWrite, 10)
		for i := 0; i < 10; i++ {
			writes[i] = BatchWrite{
				Collection: testCollection,
				DocID:      fmt.Sprintf("multi-doc-%d", i),
				Data:       map[string]interface{}{"index": i},
			}
		}

		err := service.BatchSet(ctx, writes)
		assert.NoError(t, err)

		// Verify all documents were written
		for i := 0; i < 10; i++ {
			doc, err := client.Collection(testCollection).Doc(fmt.Sprintf("multi-doc-%d", i)).Get(ctx)
			require.NoError(t, err)
			assert.Equal(t, int64(i), doc.Data()["index"])
		}
	})

	t.Run("writes exceeding chunk size are processed in batches", func(t *testing.T) {
		// Create writes that exceed MaxBulkWriteBatchSize (400)
		numWrites := MaxBulkWriteBatchSize + 50 // 450 writes = 2 chunks
		writes := make([]BatchWrite, numWrites)
		for i := 0; i < numWrites; i++ {
			writes[i] = BatchWrite{
				Collection: testCollection,
				DocID:      fmt.Sprintf("chunk-doc-%d", i),
				Data:       map[string]interface{}{"index": i, "batch": "chunked"},
			}
		}

		err := service.BatchSet(ctx, writes)
		assert.NoError(t, err)

		// Verify first doc in first chunk
		doc, err := client.Collection(testCollection).Doc("chunk-doc-0").Get(ctx)
		require.NoError(t, err)
		assert.Equal(t, "chunked", doc.Data()["batch"])

		// Verify last doc in first chunk
		doc, err = client.Collection(testCollection).Doc(fmt.Sprintf("chunk-doc-%d", MaxBulkWriteBatchSize-1)).Get(ctx)
		require.NoError(t, err)
		assert.Equal(t, int64(MaxBulkWriteBatchSize-1), doc.Data()["index"])

		// Verify first doc in second chunk
		doc, err = client.Collection(testCollection).Doc(fmt.Sprintf("chunk-doc-%d", MaxBulkWriteBatchSize)).Get(ctx)
		require.NoError(t, err)
		assert.Equal(t, int64(MaxBulkWriteBatchSize), doc.Data()["index"])

		// Verify last doc
		doc, err = client.Collection(testCollection).Doc(fmt.Sprintf("chunk-doc-%d", numWrites-1)).Get(ctx)
		require.NoError(t, err)
		assert.Equal(t, int64(numWrites-1), doc.Data()["index"])
	})
}

func TestFirestoreBaseService_BatchUpdate(t *testing.T) {
	client := setupFirestoreTestClient(t)
	defer client.Close()

	service := &FirestoreBaseService{Client: client}
	ctx := context.Background()
	testCollection := "test_batch_update"

	// Cleanup before and after
	defer cleanupCollection(ctx, client, testCollection)
	cleanupCollection(ctx, client, testCollection)

	t.Run("empty updates returns nil", func(t *testing.T) {
		err := service.BatchUpdate(ctx, []BatchUpdate{})
		assert.NoError(t, err)
	})

	t.Run("single update succeeds", func(t *testing.T) {
		// First create the document
		_, err := client.Collection(testCollection).Doc("update-doc-1").Set(ctx, map[string]interface{}{
			"name":   "original",
			"status": "active",
		})
		require.NoError(t, err)

		// Now update it
		updates := []BatchUpdate{
			{
				Collection: testCollection,
				DocID:      "update-doc-1",
				Updates: []firestore.Update{
					{Path: "name", Value: "updated"},
				},
			},
		}

		err = service.BatchUpdate(ctx, updates)
		assert.NoError(t, err)

		// Verify update
		doc, err := client.Collection(testCollection).Doc("update-doc-1").Get(ctx)
		require.NoError(t, err)
		assert.Equal(t, "updated", doc.Data()["name"])
		assert.Equal(t, "active", doc.Data()["status"]) // unchanged
	})

	t.Run("multiple updates within single chunk", func(t *testing.T) {
		// Create documents first
		for i := 0; i < 10; i++ {
			_, err := client.Collection(testCollection).Doc(fmt.Sprintf("multi-update-%d", i)).Set(ctx, map[string]interface{}{
				"value": 0,
			})
			require.NoError(t, err)
		}

		// Update all documents
		updates := make([]BatchUpdate, 10)
		for i := 0; i < 10; i++ {
			updates[i] = BatchUpdate{
				Collection: testCollection,
				DocID:      fmt.Sprintf("multi-update-%d", i),
				Updates: []firestore.Update{
					{Path: "value", Value: i * 10},
				},
			}
		}

		err := service.BatchUpdate(ctx, updates)
		assert.NoError(t, err)

		// Verify all documents were updated
		for i := 0; i < 10; i++ {
			doc, err := client.Collection(testCollection).Doc(fmt.Sprintf("multi-update-%d", i)).Get(ctx)
			require.NoError(t, err)
			assert.Equal(t, int64(i*10), doc.Data()["value"])
		}
	})
}

func TestFirestoreBaseService_BatchDelete(t *testing.T) {
	client := setupFirestoreTestClient(t)
	defer client.Close()

	service := &FirestoreBaseService{Client: client}
	ctx := context.Background()
	testCollection := "test_batch_delete"

	// Cleanup before and after
	defer cleanupCollection(ctx, client, testCollection)
	cleanupCollection(ctx, client, testCollection)

	t.Run("empty refs returns nil", func(t *testing.T) {
		err := service.BatchDelete(ctx, []DocRef{})
		assert.NoError(t, err)
	})

	t.Run("single delete succeeds", func(t *testing.T) {
		// Create a document first
		_, err := client.Collection(testCollection).Doc("delete-doc-1").Set(ctx, map[string]interface{}{
			"name": "to-delete",
		})
		require.NoError(t, err)

		// Verify it exists
		doc, err := client.Collection(testCollection).Doc("delete-doc-1").Get(ctx)
		require.NoError(t, err)
		assert.True(t, doc.Exists())

		// Delete it
		refs := []DocRef{
			{Collection: testCollection, DocID: "delete-doc-1"},
		}

		err = service.BatchDelete(ctx, refs)
		assert.NoError(t, err)

		// Verify it's deleted
		doc, err = client.Collection(testCollection).Doc("delete-doc-1").Get(ctx)
		assert.Error(t, err) // Should get "not found" error
	})

	t.Run("multiple deletes within single chunk", func(t *testing.T) {
		// Create documents first
		for i := 0; i < 10; i++ {
			_, err := client.Collection(testCollection).Doc(fmt.Sprintf("multi-delete-%d", i)).Set(ctx, map[string]interface{}{
				"index": i,
			})
			require.NoError(t, err)
		}

		// Delete all documents
		refs := make([]DocRef, 10)
		for i := 0; i < 10; i++ {
			refs[i] = DocRef{
				Collection: testCollection,
				DocID:      fmt.Sprintf("multi-delete-%d", i),
			}
		}

		err := service.BatchDelete(ctx, refs)
		assert.NoError(t, err)

		// Verify all documents were deleted
		for i := 0; i < 10; i++ {
			doc, err := client.Collection(testCollection).Doc(fmt.Sprintf("multi-delete-%d", i)).Get(ctx)
			// Firestore returns a snapshot even for deleted docs, but Exists() returns false
			if err == nil {
				assert.False(t, doc.Exists(), "document %d should not exist", i)
			}
			// Or it may return a not found error
		}
	})

	t.Run("delete non-existent document succeeds", func(t *testing.T) {
		// Deleting a non-existent document should not error in Firestore
		refs := []DocRef{
			{Collection: testCollection, DocID: "non-existent-doc"},
		}

		err := service.BatchDelete(ctx, refs)
		assert.NoError(t, err)
	})
}

func TestFirestoreBaseService_ChunkCalculation(t *testing.T) {
	// Test the chunking math used in batch operations
	testCases := []struct {
		totalItems     int
		expectedChunks int
	}{
		{0, 0},
		{1, 1},
		{100, 1},
		{400, 1},
		{401, 2},
		{800, 2},
		{801, 3},
		{1200, 3},
	}

	for _, tc := range testCases {
		t.Run(fmt.Sprintf("%d items", tc.totalItems), func(t *testing.T) {
			chunks := 0
			for i := 0; i < tc.totalItems; i += MaxBulkWriteBatchSize {
				chunks++
			}
			if tc.totalItems == 0 {
				chunks = 0
			}
			assert.Equal(t, tc.expectedChunks, chunks)
		})
	}
}
