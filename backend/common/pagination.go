package common

import (
	"context"
	"fmt"

	"cloud.google.com/go/firestore"
	"github.com/rs/zerolog/log"
)

const (
	// DefaultPageSize is the default number of items per page
	DefaultPageSize = 1000
	// MaxPageSize is the maximum allowed page size
	MaxPageSize = 10000
	// MinPageSize is the minimum allowed page size
	MinPageSize = 1
)

// PaginationConfig holds configuration for cursor-based pagination
type PaginationConfig struct {
	PageSize       int                 // Number of items per page (validated to [MinPageSize, MaxPageSize])
	DefaultSize    int                 // Default page size if validation fails
	MaxSize        int                 // Maximum allowed page size
	OrderByField   string              // Field to order results by (e.g., "sourceId", "createdAt")
	OrderDirection firestore.Direction // Sort direction (firestore.Asc or firestore.Desc)
}

// PaginationResult contains the results of a paginated query
type PaginationResult[T any] struct {
	Items      []T    // The items for this page
	NextCursor string // Cursor for the next page (empty if no more pages)
	HasMore    bool   // Whether there are more pages available
}

// QueryBuilder is a function that builds a base Firestore query with filters
// This allows DAOs to add their own Where clauses before pagination is applied
type QueryBuilder func(collection *firestore.CollectionRef) firestore.Query

// NewPaginationConfig creates a new PaginationConfig with sensible defaults
func NewPaginationConfig(orderByField string) PaginationConfig {
	return PaginationConfig{
		PageSize:       DefaultPageSize,
		DefaultSize:    DefaultPageSize,
		MaxSize:        MaxPageSize,
		OrderByField:   orderByField,
		OrderDirection: firestore.Asc,
	}
}

// WithPageSize validates and sets the page size
// If the size is invalid, it will be clamped to the valid range [MinPageSize, MaxSize]
func (c PaginationConfig) WithPageSize(size int) PaginationConfig {
	if size < MinPageSize {
		log.Warn().
			Int("requested", size).
			Int("using", c.DefaultSize).
			Msg("Page size too small, using default")
		c.PageSize = c.DefaultSize
	} else if size > c.MaxSize {
		log.Warn().
			Int("requested", size).
			Int("using", c.MaxSize).
			Msg("Page size exceeds maximum, clamping to max")
		c.PageSize = c.MaxSize
	} else {
		c.PageSize = size
	}
	return c
}

// PaginateQuery executes a cursor-based paginated query using Go generics for type safety
//
// Parameters:
//   - ctx: Context for the query
//   - db: FirestoreService instance
//   - collectionName: Name of the Firestore collection
//   - queryBuilder: Function that adds DAO-specific Where clauses to the query
//   - config: Pagination configuration (page size, order field, direction)
//   - cursor: Document ID to start after (empty string for first page)
//
// Returns:
//   - *PaginationResult[T]: Contains items, nextCursor, and hasMore flag
//   - error: Any error that occurred during the query
//
// Example usage:
//
//	config := common.NewPaginationConfig("sourceId").WithPageSize(100)
//	queryBuilder := func(collection *firestore.CollectionRef) firestore.Query {
//	    return collection.Query.
//	        Where("organizationId", "==", orgId).
//	        Where("isActive", "==", true)
//	}
//	result, err := common.PaginateQuery[DataRecord](ctx, db, "datarecords", queryBuilder, config, cursor)
func PaginateQuery[T any](
	ctx context.Context,
	db FirestoreService,
	collectionName string,
	queryBuilder QueryBuilder,
	config PaginationConfig,
	cursor string,
) (*PaginationResult[T], error) {
	// Get collection reference
	collection := db.Collection(collectionName)

	// Build base query with DAO-specific filters
	query := queryBuilder(collection)

	// Apply ordering and limit
	query = query.OrderBy(config.OrderByField, config.OrderDirection).Limit(config.PageSize)

	// Apply cursor if provided
	if cursor != "" {
		docSnap, err := getDocumentSnapshot(ctx, db, collectionName, cursor)
		if err != nil {
			log.Error().
				Ctx(ctx).
				Err(err).
				Str("cursor", cursor).
				Str("collection", collectionName).
				Msg("Failed to get cursor document snapshot")
			return nil, fmt.Errorf("invalid cursor: %w", err)
		}
		query = query.StartAfter(docSnap)
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("collection", collectionName).
			Msg("Failed to fetch documents")
		return nil, fmt.Errorf("failed to fetch documents: %w", err)
	}

	log.Debug().
		Ctx(ctx).
		Int("docsFound", len(docs)).
		Str("collection", collectionName).
		Str("orderBy", config.OrderByField).
		Msg("Paginated query executed successfully")

	// Convert documents to typed results
	items := make([]T, 0, len(docs))
	for _, doc := range docs {
		var item T
		if err := doc.DataTo(&item); err != nil {
			log.Warn().
				Ctx(ctx).
				Err(err).
				Str("docId", doc.Ref.ID).
				Str("collection", collectionName).
				Msg("Failed to decode document, skipping")
			continue
		}
		items = append(items, item)
	}

	// Calculate hasMore and nextCursor
	hasMore := len(docs) == config.PageSize
	nextCursor := ""
	if hasMore && len(docs) > 0 {
		// Use the last document's ID as the cursor for the next page
		nextCursor = docs[len(docs)-1].Ref.ID
	}

	return &PaginationResult[T]{
		Items:      items,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

// getDocumentSnapshot retrieves a document snapshot by ID for cursor operations
// This is an internal helper function used by PaginateQuery
func getDocumentSnapshot(ctx context.Context, db FirestoreService, collectionName, docId string) (*firestore.DocumentSnapshot, error) {
	collection := db.Collection(collectionName)
	docRef := collection.Doc(docId)
	docSnap, err := docRef.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get cursor document: %w", err)
	}
	return docSnap, nil
}
