package common

//go:generate mockgen -destination=firestore_mock.go -package=common -source=firestore.go FirestoreService

import (
	"{{PROJECT_SLUG}}/config"
	"context"
	"errors"
	"fmt"
	"sync"

	"cloud.google.com/go/firestore"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
)

const (
	// MaxBulkWriteBatchSize is the maximum number of writes per batch.
	// Firestore supports up to 500 writes per batch. Using 400 to leave headroom.
	MaxBulkWriteBatchSize = 400
)

// FirestoreService interface matches the pattern of DynamoDBService
type FirestoreService interface {
	// Core operations
	Get(ctx context.Context, collection, docID string) (*firestore.DocumentSnapshot, error)
	Set(ctx context.Context, collection, docID string, data interface{}) error
	Create(ctx context.Context, collection, docID string, data interface{}) error // Fails if document exists (for idempotent operations)
	Update(ctx context.Context, collection, docID string, updates []firestore.Update) error
	Delete(ctx context.Context, collection, docID string) error

	Collection(collection string) *firestore.CollectionRef

	// Batch operations
	BatchSet(ctx context.Context, writes []BatchWrite) error
	BatchUpdate(ctx context.Context, updates []BatchUpdate) error
	BatchDelete(ctx context.Context, refs []DocRef) error

	// Transaction support
	RunTransaction(ctx context.Context, f func(context.Context, *firestore.Transaction) error) error

	// Utility operations
	GetAll(ctx context.Context, collection string) ([]*firestore.DocumentSnapshot, error)
	GetByIds(ctx context.Context, collection string, docIDs []string) ([]*firestore.DocumentSnapshot, error)
	Exists(ctx context.Context, collection, docID string) (bool, error)
}

// FirestoreBaseService implements FirestoreService
type FirestoreBaseService struct {
	Client *firestore.Client
}

// BatchWrite represents a document write operation for batching
type BatchWrite struct {
	Collection string
	DocID      string
	Data       interface{}
}

// BatchUpdate represents a document update operation for batching
type BatchUpdate struct {
	Collection string
	DocID      string
	Updates    []firestore.Update
}

// DocRef represents a document reference for operations
type DocRef struct {
	Collection string
	DocID      string
}

// Singleton Firestore service - reuse the same client across all DAOs/services
// This prevents creating dozens of gRPC connections with separate credential management
var (
	firestoreService     FirestoreService
	firestoreServiceOnce sync.Once
)

// NewFirestoreService returns a singleton FirestoreService instance.
// The Firestore client is created once and reused across all callers.
// This prevents connection/credential overhead from creating multiple clients.
func NewFirestoreService() FirestoreService {
	firestoreServiceOnce.Do(initFirestoreService)
	return firestoreService
}

// initFirestoreService initializes the singleton Firestore client.
func initFirestoreService() {
	ctx := context.Background()

	// Use shared credentials to prevent metadata server overload
	opts := GCPClientOptions()
	client, err := firestore.NewClient(ctx, config.ServiceConfig.FirebaseProjectID, opts...)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create Firestore client")
	}

	firestoreService = &FirestoreBaseService{
		Client: client,
	}

	log.Info().
		Str("projectID", config.ServiceConfig.FirebaseProjectID).
		Msg("Singleton Firestore client initialized")
}

// NewFirestoreServiceWithClient creates a new FirestoreService instance with provided client
func NewFirestoreServiceWithClient(client *firestore.Client) FirestoreService {
	return &FirestoreBaseService{
		Client: client,
	}
}

// Get retrieves a document by collection and document ID
func (f *FirestoreBaseService) Get(ctx context.Context, collection, docID string) (*firestore.DocumentSnapshot, error) {
	return f.Client.Collection(collection).Doc(docID).Get(ctx)
}

// Set creates or overwrites a document
func (f *FirestoreBaseService) Set(ctx context.Context, collection, docID string, data interface{}) error {
	_, err := f.Client.Collection(collection).Doc(docID).Set(ctx, data)
	return err
}

// Create creates a document only if it doesn't already exist.
// Returns an error with code codes.AlreadyExists if the document already exists.
// Use this for idempotent operations where duplicate creation should be detected.
func (f *FirestoreBaseService) Create(ctx context.Context, collection, docID string, data interface{}) error {
	_, err := f.Client.Collection(collection).Doc(docID).Create(ctx, data)
	return err
}

// Update updates specific fields in a document
func (f *FirestoreBaseService) Update(ctx context.Context, collection, docID string, updates []firestore.Update) error {
	_, err := f.Client.Collection(collection).Doc(docID).Update(ctx, updates)
	return err
}

// Delete removes a document
func (f *FirestoreBaseService) Delete(ctx context.Context, collection, docID string) error {
	_, err := f.Client.Collection(collection).Doc(docID).Delete(ctx)
	return err
}

// Collection returns a collection reference
func (f *FirestoreBaseService) Collection(collection string) *firestore.CollectionRef {
	return f.Client.Collection(collection)
}

// BatchSet performs multiple write operations using BulkWriter with chunking and error handling.
// Uses context.Background() to avoid inheriting deadlines that may be too short for large batches.
func (f *FirestoreBaseService) BatchSet(ctx context.Context, writes []BatchWrite) error {
	if len(writes) == 0 {
		return nil
	}

	// Process in chunks to avoid overwhelming Firestore
	for i := 0; i < len(writes); i += MaxBulkWriteBatchSize {
		end := i + MaxBulkWriteBatchSize
		if end > len(writes) {
			end = len(writes)
		}
		chunk := writes[i:end]

		if err := f.executeBatchSetChunk(chunk); err != nil {
			return fmt.Errorf("failed to write batch chunk %d-%d: %w", i, end, err)
		}
	}

	return nil
}

// executeBatchSetChunk processes a single chunk of writes with proper error handling
func (f *FirestoreBaseService) executeBatchSetChunk(writes []BatchWrite) error {
	// Use context.Background() to avoid inheriting short deadlines from Pub/Sub handlers
	bulkWriter := f.Client.BulkWriter(context.Background())

	// Collect jobs to wait for results
	jobs := make([]*firestore.BulkWriterJob, 0, len(writes))

	for _, write := range writes {
		docRef := f.Client.Collection(write.Collection).Doc(write.DocID)
		job, err := bulkWriter.Set(docRef, write.Data)
		if err != nil {
			bulkWriter.End()
			return fmt.Errorf("failed to add write to bulk writer for doc %s: %w", write.DocID, err)
		}
		jobs = append(jobs, job)
	}

	// Flush and wait for all writes to complete
	bulkWriter.End()

	// Check results from all jobs
	var writeErrors []error
	var mu sync.Mutex

	for idx, job := range jobs {
		_, err := job.Results()
		if err != nil {
			mu.Lock()
			writeErrors = append(writeErrors, fmt.Errorf("write failed for doc %s: %w", writes[idx].DocID, err))
			mu.Unlock()
		}
	}

	if len(writeErrors) > 0 {
		return fmt.Errorf("%d writes failed, first error: %w", len(writeErrors), writeErrors[0])
	}

	return nil
}

// BatchUpdate performs multiple update operations using BulkWriter with chunking and error handling.
// Uses context.Background() to avoid inheriting deadlines that may be too short for large batches.
func (f *FirestoreBaseService) BatchUpdate(ctx context.Context, updates []BatchUpdate) error {
	if len(updates) == 0 {
		return nil
	}

	// Process in chunks to avoid overwhelming Firestore
	for i := 0; i < len(updates); i += MaxBulkWriteBatchSize {
		end := i + MaxBulkWriteBatchSize
		if end > len(updates) {
			end = len(updates)
		}
		chunk := updates[i:end]

		if err := f.executeBatchUpdateChunk(chunk); err != nil {
			return fmt.Errorf("failed to update batch chunk %d-%d: %w", i, end, err)
		}
	}

	return nil
}

// executeBatchUpdateChunk processes a single chunk of updates with proper error handling
func (f *FirestoreBaseService) executeBatchUpdateChunk(updates []BatchUpdate) error {
	// Use context.Background() to avoid inheriting short deadlines from Pub/Sub handlers
	bulkWriter := f.Client.BulkWriter(context.Background())

	// Collect jobs to wait for results
	jobs := make([]*firestore.BulkWriterJob, 0, len(updates))

	for _, update := range updates {
		docRef := f.Client.Collection(update.Collection).Doc(update.DocID)
		job, err := bulkWriter.Update(docRef, update.Updates)
		if err != nil {
			bulkWriter.End()
			return fmt.Errorf("failed to add update to bulk writer for doc %s: %w", update.DocID, err)
		}
		jobs = append(jobs, job)
	}

	// Flush and wait for all updates to complete
	bulkWriter.End()

	// Check results from all jobs
	var updateErrors []error
	var mu sync.Mutex

	for idx, job := range jobs {
		_, err := job.Results()
		if err != nil {
			mu.Lock()
			updateErrors = append(updateErrors, fmt.Errorf("update failed for doc %s: %w", updates[idx].DocID, err))
			mu.Unlock()
		}
	}

	if len(updateErrors) > 0 {
		return fmt.Errorf("%d updates failed, first error: %w", len(updateErrors), updateErrors[0])
	}

	return nil
}

// BatchDelete performs multiple delete operations using BulkWriter with chunking and error handling.
// Uses context.Background() to avoid inheriting deadlines that may be too short for large batches.
func (f *FirestoreBaseService) BatchDelete(ctx context.Context, refs []DocRef) error {
	if len(refs) == 0 {
		return nil
	}

	// Process in chunks to avoid overwhelming Firestore
	for i := 0; i < len(refs); i += MaxBulkWriteBatchSize {
		end := i + MaxBulkWriteBatchSize
		if end > len(refs) {
			end = len(refs)
		}
		chunk := refs[i:end]

		if err := f.executeBatchDeleteChunk(chunk); err != nil {
			return fmt.Errorf("failed to delete batch chunk %d-%d: %w", i, end, err)
		}
	}

	return nil
}

// executeBatchDeleteChunk processes a single chunk of deletes with proper error handling
func (f *FirestoreBaseService) executeBatchDeleteChunk(refs []DocRef) error {
	// Use context.Background() to avoid inheriting short deadlines from Pub/Sub handlers
	bulkWriter := f.Client.BulkWriter(context.Background())

	// Collect jobs to wait for results
	jobs := make([]*firestore.BulkWriterJob, 0, len(refs))

	for _, ref := range refs {
		docRef := f.Client.Collection(ref.Collection).Doc(ref.DocID)
		job, err := bulkWriter.Delete(docRef)
		if err != nil {
			bulkWriter.End()
			return fmt.Errorf("failed to add delete to bulk writer for doc %s: %w", ref.DocID, err)
		}
		jobs = append(jobs, job)
	}

	// Flush and wait for all deletes to complete
	bulkWriter.End()

	// Check results from all jobs
	var deleteErrors []error
	var mu sync.Mutex

	for idx, job := range jobs {
		_, err := job.Results()
		if err != nil {
			mu.Lock()
			deleteErrors = append(deleteErrors, fmt.Errorf("delete failed for doc %s: %w", refs[idx].DocID, err))
			mu.Unlock()
		}
	}

	if len(deleteErrors) > 0 {
		return fmt.Errorf("%d deletes failed, first error: %w", len(deleteErrors), deleteErrors[0])
	}

	return nil
}

// RunTransaction executes a function within a Firestore transaction
func (f *FirestoreBaseService) RunTransaction(ctx context.Context, fn func(context.Context, *firestore.Transaction) error) error {
	return f.Client.RunTransaction(ctx, fn)
}

// GetAll retrieves all documents from a collection
func (f *FirestoreBaseService) GetAll(ctx context.Context, collection string) ([]*firestore.DocumentSnapshot, error) {
	iter := f.Client.Collection(collection).Documents(ctx)
	defer iter.Stop()

	var docs []*firestore.DocumentSnapshot
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to iterate documents: %w", err)
		}
		docs = append(docs, doc)
	}

	return docs, nil
}

// GetByIds retrieves multiple documents by their IDs in a single batch operation
func (f *FirestoreBaseService) GetByIds(ctx context.Context, collection string, docIDs []string) ([]*firestore.DocumentSnapshot, error) {
	if len(docIDs) == 0 {
		return nil, nil
	}

	refs := make([]*firestore.DocumentRef, len(docIDs))
	for i, id := range docIDs {
		refs[i] = f.Client.Collection(collection).Doc(id)
	}

	return f.Client.GetAll(ctx, refs)
}

// Exists checks if a document exists
func (f *FirestoreBaseService) Exists(ctx context.Context, collection, docID string) (bool, error) {
	doc, err := f.Client.Collection(collection).Doc(docID).Get(ctx)
	if err != nil {
		// Check if it's a not found error
		if IsNotFoundError(err) {
			return false, nil
		}
		return false, err
	}

	return doc.Exists(), nil
}

// IsNotFoundError checks if an error is a Firestore "not found" error
func IsNotFoundError(err error) bool {
	// Import the status package to check for NotFound
	// This is similar to how we check DynamoDB errors
	return err != nil && err.Error() == "not found"
}

// FieldFilter represents a field filter for queries
type FieldFilter struct {
	Field string
	Op    string
	Value interface{}
}

// ResetFirestoreServiceForTesting resets the singleton for testing purposes.
// This allows tests to re-initialize the client with different configurations.
// IMPORTANT: Only use this in tests, never in production code.
func ResetFirestoreServiceForTesting() {
	firestoreServiceOnce = sync.Once{}
	firestoreService = nil
}
