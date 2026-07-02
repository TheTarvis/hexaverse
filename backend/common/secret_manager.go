package common

//go:generate mockgen -destination=secret_manager_mock.go -package=common -source=secret_manager.go SecretManager

import (
	"{{PROJECT_SLUG}}/config"
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	secretmanager "cloud.google.com/go/secretmanager/apiv1"
	"cloud.google.com/go/secretmanager/apiv1/secretmanagerpb"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// TODO TW: We need to split this up and get some test around it.
// SecretManager interface for managing secrets
type SecretManager interface {
	// Store creates or updates a secret
	Store(ctx context.Context, secretID string, data []byte) (string, error)
	// Get retrieves a secret
	Get(ctx context.Context, secretRef string) ([]byte, error)
	// Update updates an existing secret
	Update(ctx context.Context, secretRef string, data []byte) error
	// Delete removes a secret
	Delete(ctx context.Context, secretRef string) error
}

// NewSecretManager creates the appropriate secret manager based on environment
func NewSecretManager() SecretManager {
	// For local development, use Firestore-backed storage
	if config.IsLocal() {
		log.Debug().Msg("Using Firestore secret manager (local environment)")
		return NewFirestoreSecretManager()
	}

	// Try to create GCP Secret Manager client
	ctx := context.Background()
	client, err := secretmanager.NewClient(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create GCP secret manager client, falling back to Firestore")
		return NewFirestoreSecretManager()
	}

	return &GCPSecretManager{
		client:    client,
		projectID: config.ServiceConfig.GCPProjectID,
	}
}

// FirestoreSecretManager implements SecretManager using Firestore for local development
type FirestoreSecretManager struct {
	db FirestoreService
}

// Secret represents a secret stored in Firestore
type Secret struct {
	ID        string    `firestore:"id"`
	Data      string    `firestore:"data"` // Base64 encoded
	Version   int       `firestore:"version"`
	CreatedAt time.Time `firestore:"createdAt"`
	UpdatedAt time.Time `firestore:"updatedAt"`
}

// NewFirestoreSecretManager creates a new Firestore-backed secret manager
func NewFirestoreSecretManager() SecretManager {
	return &FirestoreSecretManager{
		db: NewFirestoreService(),
	}
}

// Store creates or updates a secret in Firestore
func (f *FirestoreSecretManager) Store(ctx context.Context, secretID string, data []byte) (string, error) {
	// Check if secret exists
	doc, err := f.db.Get(ctx, "secret_manager", secretID)

	var version = 1
	if err == nil && doc.Exists() {
		var existing Secret
		if err := doc.DataTo(&existing); err == nil {
			version = existing.Version + 1
		}
	}

	secret := Secret{
		ID:        secretID,
		Data:      base64.StdEncoding.EncodeToString(data),
		Version:   version,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	if err := f.db.Set(ctx, "secret_manager", secretID, secret); err != nil {
		return "", fmt.Errorf("failed to store secret: %w", err)
	}

	// Return a reference that identifies this as a Firestore-stored secret
	ref := fmt.Sprintf("firestore://secret/%s", secretID)
	log.Debug().Str("secretId", secretID).Str("ref", ref).Msg("Stored secret in Firestore")

	return ref, nil
}

// Get retrieves a secret from Firestore
func (f *FirestoreSecretManager) Get(ctx context.Context, secretRef string) ([]byte, error) {
	// Parse the reference
	secretID := f.parseSecretRef(secretRef)
	if secretID == "" {
		return nil, fmt.Errorf("invalid secret reference: %s", secretRef)
	}

	doc, err := f.db.Get(ctx, "secret_manager", secretID)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, fmt.Errorf("secret not found: %s", secretID)
		}
		return nil, fmt.Errorf("failed to get secret: %w", err)
	}

	var secret Secret
	if err := doc.DataTo(&secret); err != nil {
		return nil, fmt.Errorf("failed to parse secret: %w", err)
	}

	data, err := base64.StdEncoding.DecodeString(secret.Data)
	if err != nil {
		return nil, fmt.Errorf("failed to decode secret data: %w", err)
	}

	return data, nil
}

// Update updates an existing secret in Firestore
func (f *FirestoreSecretManager) Update(ctx context.Context, secretRef string, data []byte) error {
	// Parse the reference
	secretID := f.parseSecretRef(secretRef)
	if secretID == "" {
		return fmt.Errorf("invalid secret reference: %s", secretRef)
	}

	// Get existing secret to increment version
	doc, err := f.db.Get(ctx, "secret_manager", secretID)
	if err != nil {
		return fmt.Errorf("secret not found: %s", secretID)
	}

	var existing Secret
	if err := doc.DataTo(&existing); err != nil {
		return fmt.Errorf("failed to parse existing secret: %w", err)
	}

	// Update with new data and incremented version
	secret := Secret{
		ID:        secretID,
		Data:      base64.StdEncoding.EncodeToString(data),
		Version:   existing.Version + 1,
		CreatedAt: existing.CreatedAt,
		UpdatedAt: time.Now().UTC(),
	}

	if err := f.db.Set(ctx, "secret_manager", secretID, secret); err != nil {
		return fmt.Errorf("failed to update secret: %w", err)
	}

	log.Debug().Str("secretId", secretID).Int("version", secret.Version).Msg("Updated secret in Firestore")
	return nil
}

// Delete removes a secret from Firestore
func (f *FirestoreSecretManager) Delete(ctx context.Context, secretRef string) error {
	// Parse the reference
	secretID := f.parseSecretRef(secretRef)
	if secretID == "" {
		return fmt.Errorf("invalid secret reference: %s", secretRef)
	}

	if err := f.db.Delete(ctx, "secret_manager", secretID); err != nil {
		return fmt.Errorf("failed to delete secret: %w", err)
	}

	log.Debug().Str("secretId", secretID).Msg("Deleted secret from Firestore")
	return nil
}

// parseSecretRef extracts the secret ID from a reference
func (f *FirestoreSecretManager) parseSecretRef(ref string) string {
	if ref == "" {
		return ""
	}

	const firestorePrefix = "firestore://secret/"
	if len(ref) > len(firestorePrefix) && ref[:len(firestorePrefix)] == firestorePrefix {
		return ref[len(firestorePrefix):]
	}

	// Assume it's just the ID
	return ref
}

// GCPSecretManager implements SecretManager using Google Cloud Secret Manager
type GCPSecretManager struct {
	client    *secretmanager.Client
	projectID string
}

// Store creates or updates a secret in GCP Secret Manager
func (g *GCPSecretManager) Store(ctx context.Context, secretID string, data []byte) (string, error) {
	parent := fmt.Sprintf("projects/%s", g.projectID)

	// Try to create the secret
	createReq := &secretmanagerpb.CreateSecretRequest{
		Parent:   parent,
		SecretId: secretID,
		Secret: &secretmanagerpb.Secret{
			Replication: &secretmanagerpb.Replication{
				Replication: &secretmanagerpb.Replication_Automatic_{
					Automatic: &secretmanagerpb.Replication_Automatic{},
				},
			},
		},
	}

	_, err := g.client.CreateSecret(ctx, createReq)
	if err != nil && status.Code(err) != codes.AlreadyExists {
		return "", fmt.Errorf("failed to create secret: %w", err)
	}

	// Add secret version
	name := fmt.Sprintf("projects/%s/secrets/%s", g.projectID, secretID)
	addReq := &secretmanagerpb.AddSecretVersionRequest{
		Parent: name,
		Payload: &secretmanagerpb.SecretPayload{
			Data: data,
		},
	}

	version, err := g.client.AddSecretVersion(ctx, addReq)
	if err != nil {
		return "", fmt.Errorf("failed to add secret version: %w", err)
	}

	return version.Name, nil
}

// isFullResourcePath checks if the reference is a full GCP resource path
// (starts with "projects/" or "/")
func isFullResourcePath(ref string) bool {
	return strings.HasPrefix(ref, "projects/") || strings.HasPrefix(ref, "/")
}

// extractSecretID parses a secret reference and returns the secret ID.
// Handles both full resource names and plain secret IDs.
func extractSecretID(secretRef string) string {
	if !isFullResourcePath(secretRef) {
		return secretRef
	}
	parts := parseResourceName(secretRef)
	return parts["secrets"]
}

// Get retrieves a secret from GCP Secret Manager
func (g *GCPSecretManager) Get(ctx context.Context, secretRef string) ([]byte, error) {
	var name string
	if isFullResourcePath(secretRef) {
		// Full resource name - normalize to latest version
		if strings.Contains(secretRef, "/versions/") {
			parts := strings.Split(secretRef, "/versions/")
			name = parts[0] + "/versions/latest"
		} else {
			name = secretRef + "/versions/latest"
		}
	} else {
		name = fmt.Sprintf("projects/%s/secrets/%s/versions/latest", g.projectID, secretRef)
	}

	req := &secretmanagerpb.AccessSecretVersionRequest{
		Name: name,
	}

	result, err := g.client.AccessSecretVersion(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to access secret: %w", err)
	}

	return result.Payload.Data, nil
}

// Update updates an existing secret in GCP Secret Manager by adding a new version
// and destroying old versions to prevent version accumulation and reduce costs.
func (g *GCPSecretManager) Update(ctx context.Context, secretRef string, data []byte) error {
	secretID := extractSecretID(secretRef)
	name := fmt.Sprintf("projects/%s/secrets/%s", g.projectID, secretID)

	addReq := &secretmanagerpb.AddSecretVersionRequest{
		Parent: name,
		Payload: &secretmanagerpb.SecretPayload{
			Data: data,
		},
	}

	newVersion, err := g.client.AddSecretVersion(ctx, addReq)
	if err != nil {
		return fmt.Errorf("failed to update secret: %w", err)
	}

	// Destroy old versions to prevent accumulation (async, best-effort)
	go g.destroyOldVersions(context.Background(), name, newVersion.Name)

	return nil
}

// destroyOldVersions destroys versions of a secret that are older than the current version.
// Only destroys versions with a lower version number to avoid a race condition where
// concurrent Updates could destroy each other's newly created versions.
// This runs asynchronously and logs errors rather than failing the update.
func (g *GCPSecretManager) destroyOldVersions(ctx context.Context, secretName, currentVersionName string) {
	// Extract the current version number to only destroy older versions
	currentVersionNum := extractVersionNumber(currentVersionName)
	if currentVersionNum <= 0 {
		log.Warn().Str("version", currentVersionName).Msg("Could not parse current version number, skipping cleanup")
		return
	}

	// List all versions
	iter := g.client.ListSecretVersions(ctx, &secretmanagerpb.ListSecretVersionsRequest{
		Parent: secretName,
	})

	for {
		version, err := iter.Next()
		if err != nil {
			// iterator.Done or actual error - either way, we're done
			break
		}

		// Skip already destroyed versions
		if version.State == secretmanagerpb.SecretVersion_DESTROYED {
			continue
		}

		// Only destroy versions older (lower number) than the current version.
		// This prevents a race where concurrent goroutines destroy each other's new versions.
		versionNum := extractVersionNumber(version.Name)
		if versionNum <= 0 || versionNum >= currentVersionNum {
			continue
		}

		// Destroy the old version
		_, err = g.client.DestroySecretVersion(ctx, &secretmanagerpb.DestroySecretVersionRequest{
			Name: version.Name,
		})
		if err != nil {
			log.Warn().
				Err(err).
				Str("version", version.Name).
				Msg("Failed to destroy old secret version")
		}
	}
}

// extractVersionNumber parses the version number from a full secret version resource name.
// e.g. "projects/123/secrets/my-secret/versions/5" → 5
func extractVersionNumber(versionName string) int {
	parts := strings.Split(versionName, "/versions/")
	if len(parts) != 2 {
		return 0
	}
	n := 0
	for _, c := range parts[1] {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// Delete removes a secret from GCP Secret Manager
func (g *GCPSecretManager) Delete(ctx context.Context, secretRef string) error {
	secretID := extractSecretID(secretRef)
	name := fmt.Sprintf("projects/%s/secrets/%s", g.projectID, secretID)

	req := &secretmanagerpb.DeleteSecretRequest{
		Name: name,
	}

	err := g.client.DeleteSecret(ctx, req)
	if err != nil && status.Code(err) != codes.NotFound {
		return fmt.Errorf("failed to delete secret: %w", err)
	}

	return nil
}

// parseResourceName parses a GCP resource name into its components
// Example: "projects/my-project/secrets/my-secret/versions/latest" becomes:
// {"projects": "my-project", "secrets": "my-secret", "versions": "latest"}
func parseResourceName(name string) map[string]string {
	parts := make(map[string]string)

	// Split the resource name by /
	segments := strings.Split(name, "/")

	// Filter out empty segments and process pairs
	var filtered []string
	for _, segment := range segments {
		if segment != "" {
			filtered = append(filtered, segment)
		}
	}

	// Process pairs (key/value)
	for i := 0; i < len(filtered)-1; i += 2 {
		parts[filtered[i]] = filtered[i+1]
	}

	return parts
}
