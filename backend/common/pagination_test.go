package common

import (
	"context"
	"fmt"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestDataRecord is a test model for pagination tests
type TestDataRecord struct {
	ID             string `firestore:"id"`
	OrganizationID string `firestore:"organizationId"`
	SourceID       string `firestore:"sourceId"`
	CreatedAt      int64  `firestore:"createdAt"`
	Name           string `firestore:"name"`
}

func TestPaginationConstants(t *testing.T) {
	assert.Equal(t, 1000, DefaultPageSize, "DefaultPageSize should be 1000")
	assert.Equal(t, 10000, MaxPageSize, "MaxPageSize should be 10000")
	assert.Equal(t, 1, MinPageSize, "MinPageSize should be 1")
}

func TestNewPaginationConfig(t *testing.T) {
	config := NewPaginationConfig("testField")

	assert.Equal(t, DefaultPageSize, config.PageSize)
	assert.Equal(t, DefaultPageSize, config.DefaultSize)
	assert.Equal(t, MaxPageSize, config.MaxSize)
	assert.Equal(t, "testField", config.OrderByField)
	assert.Equal(t, firestore.Asc, config.OrderDirection)
}

func TestPaginationConfig_WithPageSize(t *testing.T) {
	t.Run("valid page size", func(t *testing.T) {
		config := NewPaginationConfig("testField").WithPageSize(500)
		assert.Equal(t, 500, config.PageSize)
	})

	t.Run("page size below minimum uses default", func(t *testing.T) {
		config := NewPaginationConfig("testField").WithPageSize(0)
		assert.Equal(t, DefaultPageSize, config.PageSize)
	})

	t.Run("negative page size uses default", func(t *testing.T) {
		config := NewPaginationConfig("testField").WithPageSize(-10)
		assert.Equal(t, DefaultPageSize, config.PageSize)
	})

	t.Run("page size above maximum is clamped", func(t *testing.T) {
		config := NewPaginationConfig("testField").WithPageSize(20000)
		assert.Equal(t, MaxPageSize, config.PageSize)
	})

	t.Run("page size at maximum is allowed", func(t *testing.T) {
		config := NewPaginationConfig("testField").WithPageSize(MaxPageSize)
		assert.Equal(t, MaxPageSize, config.PageSize)
	})

	t.Run("page size at minimum is allowed", func(t *testing.T) {
		config := NewPaginationConfig("testField").WithPageSize(MinPageSize)
		assert.Equal(t, MinPageSize, config.PageSize)
	})
}

// Integration tests using Firestore emulator
func TestPaginateQuery_Integration(t *testing.T) {
	client := setupFirestoreTestClient(t)
	defer client.Close()

	service := &FirestoreBaseService{Client: client}
	ctx := context.Background()
	testCollection := "test_pagination"

	// Cleanup before and after
	defer cleanupCollection(ctx, client, testCollection)
	require.NoError(t, cleanupCollection(ctx, client, testCollection))

	// Create test data
	orgID := "org-test-pagination"
	testRecords := []TestDataRecord{
		{ID: "1", OrganizationID: orgID, SourceID: "source-01", CreatedAt: 1000, Name: "Record 1"},
		{ID: "2", OrganizationID: orgID, SourceID: "source-02", CreatedAt: 2000, Name: "Record 2"},
		{ID: "3", OrganizationID: orgID, SourceID: "source-03", CreatedAt: 3000, Name: "Record 3"},
		{ID: "4", OrganizationID: orgID, SourceID: "source-04", CreatedAt: 4000, Name: "Record 4"},
		{ID: "5", OrganizationID: orgID, SourceID: "source-05", CreatedAt: 5000, Name: "Record 5"},
		{ID: "6", OrganizationID: "org-other", SourceID: "source-06", CreatedAt: 6000, Name: "Other Org"},
	}

	// Insert test data
	for _, record := range testRecords {
		docID := fmt.Sprintf("%s#%s", record.OrganizationID, record.ID)
		_, err := client.Collection(testCollection).Doc(docID).Set(ctx, record)
		require.NoError(t, err)
	}

	t.Run("first page without cursor", func(t *testing.T) {
		config := NewPaginationConfig("sourceId").WithPageSize(3)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", orgID)
		}

		result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "")

		require.NoError(t, err)
		assert.Equal(t, 3, len(result.Items))
		assert.True(t, result.HasMore)
		assert.NotEmpty(t, result.NextCursor)

		// Verify order
		assert.Equal(t, "source-01", result.Items[0].SourceID)
		assert.Equal(t, "source-02", result.Items[1].SourceID)
		assert.Equal(t, "source-03", result.Items[2].SourceID)
	})

	t.Run("second page with cursor", func(t *testing.T) {
		// First page
		config := NewPaginationConfig("sourceId").WithPageSize(2)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", orgID)
		}

		firstPage, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "")
		require.NoError(t, err)
		require.True(t, firstPage.HasMore)

		// Second page using cursor
		secondPage, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, firstPage.NextCursor)
		require.NoError(t, err)

		assert.Equal(t, 2, len(secondPage.Items))
		assert.True(t, secondPage.HasMore)
		assert.Equal(t, "source-03", secondPage.Items[0].SourceID)
		assert.Equal(t, "source-04", secondPage.Items[1].SourceID)
	})

	t.Run("last page has no more results", func(t *testing.T) {
		config := NewPaginationConfig("sourceId").WithPageSize(10)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", orgID)
		}

		result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "")

		require.NoError(t, err)
		assert.Equal(t, 5, len(result.Items)) // Only 5 records for orgID
		assert.False(t, result.HasMore)
		assert.Empty(t, result.NextCursor)
	})

	t.Run("empty results when no matches", func(t *testing.T) {
		config := NewPaginationConfig("sourceId").WithPageSize(10)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", "org-nonexistent")
		}

		result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "")

		require.NoError(t, err)
		assert.Equal(t, 0, len(result.Items))
		assert.False(t, result.HasMore)
		assert.Empty(t, result.NextCursor)
	})

	t.Run("invalid cursor returns error", func(t *testing.T) {
		config := NewPaginationConfig("sourceId").WithPageSize(10)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", orgID)
		}

		result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "nonexistent-cursor-id")

		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "invalid cursor")
	})

	t.Run("descending order", func(t *testing.T) {
		config := NewPaginationConfig("sourceId").WithPageSize(3)
		config.OrderDirection = firestore.Desc
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", orgID)
		}

		result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "")

		require.NoError(t, err)
		assert.Equal(t, 3, len(result.Items))
		// Verify descending order
		assert.Equal(t, "source-05", result.Items[0].SourceID)
		assert.Equal(t, "source-04", result.Items[1].SourceID)
		assert.Equal(t, "source-03", result.Items[2].SourceID)
	})

	t.Run("order by different field", func(t *testing.T) {
		config := NewPaginationConfig("createdAt").WithPageSize(3)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", orgID)
		}

		result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "")

		require.NoError(t, err)
		assert.Equal(t, 3, len(result.Items))
		// Verify ascending order by createdAt
		assert.Equal(t, int64(1000), result.Items[0].CreatedAt)
		assert.Equal(t, int64(2000), result.Items[1].CreatedAt)
		assert.Equal(t, int64(3000), result.Items[2].CreatedAt)
	})

	t.Run("page size of 1", func(t *testing.T) {
		config := NewPaginationConfig("sourceId").WithPageSize(1)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", orgID)
		}

		result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "")

		require.NoError(t, err)
		assert.Equal(t, 1, len(result.Items))
		assert.True(t, result.HasMore)
		assert.NotEmpty(t, result.NextCursor)
	})

	t.Run("complex query with multiple filters", func(t *testing.T) {
		// Add a record with a specific name pattern
		specificRecord := TestDataRecord{
			ID:             "7",
			OrganizationID: orgID,
			SourceID:       "source-07",
			CreatedAt:      7000,
			Name:           "Special Record",
		}
		docID := fmt.Sprintf("%s#%s", specificRecord.OrganizationID, specificRecord.ID)
		_, err := client.Collection(testCollection).Doc(docID).Set(ctx, specificRecord)
		require.NoError(t, err)

		config := NewPaginationConfig("createdAt").WithPageSize(10)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.
				Where("organizationId", "==", orgID).
				Where("createdAt", ">=", int64(7000))
		}

		result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, "")

		require.NoError(t, err)
		assert.Equal(t, 1, len(result.Items))
		assert.Equal(t, "Special Record", result.Items[0].Name)
		assert.False(t, result.HasMore)
	})

	t.Run("pagination through all pages", func(t *testing.T) {
		config := NewPaginationConfig("sourceId").WithPageSize(2)
		queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
			return collection.Query.Where("organizationId", "==", orgID)
		}

		allItems := []TestDataRecord{}
		cursor := ""
		pageCount := 0
		maxPages := 10 // Safety limit to prevent infinite loops

		// Paginate through all results
		for pageCount < maxPages {
			result, err := PaginateQuery[TestDataRecord](ctx, service, testCollection, queryBuilder, config, cursor)
			require.NoError(t, err)

			if len(result.Items) > 0 {
				allItems = append(allItems, result.Items...)
				pageCount++
			}

			if !result.HasMore {
				break
			}

			cursor = result.NextCursor
			require.NotEmpty(t, cursor, "cursor should not be empty when HasMore is true")
		}

		// Should have fetched at least the 5 original records, possibly 6 with the special one
		assert.GreaterOrEqual(t, len(allItems), 5, "should fetch at least 5 original records")
		assert.LessOrEqual(t, len(allItems), 6, "should not exceed 6 records")
		// Should have taken ceil(count/2) pages
		assert.GreaterOrEqual(t, pageCount, 3, "should have at least 3 pages")

		// Verify all items have correct org ID
		for _, item := range allItems {
			assert.Equal(t, orgID, item.OrganizationID)
		}
	})
}

func TestGetDocumentSnapshot(t *testing.T) {
	client := setupFirestoreTestClient(t)
	defer client.Close()

	service := &FirestoreBaseService{Client: client}
	ctx := context.Background()
	testCollection := "test_doc_snapshot"

	// Cleanup
	defer cleanupCollection(ctx, client, testCollection)
	require.NoError(t, cleanupCollection(ctx, client, testCollection))

	t.Run("get existing document snapshot", func(t *testing.T) {
		// Create a test document
		docID := "test-doc-1"
		_, err := client.Collection(testCollection).Doc(docID).Set(ctx, map[string]interface{}{"test": "data"})
		require.NoError(t, err)

		snapshot, err := getDocumentSnapshot(ctx, service, testCollection, docID)

		require.NoError(t, err)
		assert.NotNil(t, snapshot)
		assert.True(t, snapshot.Exists())
	})

	t.Run("error on nonexistent document", func(t *testing.T) {
		snapshot, err := getDocumentSnapshot(ctx, service, testCollection, "nonexistent-doc")

		// Document exists but is empty, or doesn't exist - either way we should handle gracefully
		// Firestore returns a snapshot even for non-existent docs, just with Exists() = false
		// However, our error handling should catch this
		if err != nil {
			assert.Contains(t, err.Error(), "failed to get cursor document")
		} else {
			// If no error, snapshot should indicate non-existence
			assert.False(t, snapshot.Exists())
		}
	})
}

func TestPaginationResult_TypeSafety(t *testing.T) {
	// This test verifies that the generic type parameter works correctly
	// It's more of a compile-time check, but we can verify the structure

	t.Run("string type", func(t *testing.T) {
		result := &PaginationResult[string]{
			Items:      []string{"a", "b", "c"},
			NextCursor: "cursor",
			HasMore:    true,
		}

		assert.Equal(t, 3, len(result.Items))
		assert.Equal(t, "a", result.Items[0])
		assert.True(t, result.HasMore)
	})

	t.Run("struct type", func(t *testing.T) {
		result := &PaginationResult[TestDataRecord]{
			Items: []TestDataRecord{
				{ID: "1", Name: "Test"},
			},
			NextCursor: "cursor",
			HasMore:    false,
		}

		assert.Equal(t, 1, len(result.Items))
		assert.Equal(t, "Test", result.Items[0].Name)
		assert.False(t, result.HasMore)
	})
}
