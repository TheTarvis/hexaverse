package common

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/option"
)

// GCPCredentials provides a shared credential source for all GCP clients.
// This prevents the "thundering herd" problem where many clients try to
// refresh credentials simultaneously, overwhelming the metadata server.
//
// See: https://github.com/googleapis/google-cloud-go/issues/6315
var (
	gcpCredentials     *google.Credentials
	gcpCredentialsOnce sync.Once
	gcpCredentialsErr  error
)

// GCPClientOptions returns client options that should be used by all GCP clients.
// This ensures all clients share the same credential provider, preventing
// credential refresh storms that can timeout against the metadata server.
//
// Note: Only returns WithCredentials, not WithHTTPClient, because gRPC-based
// clients (Firestore, Pub/Sub) are incompatible with WithHTTPClient.
func GCPClientOptions() []option.ClientOption {
	gcpCredentialsOnce.Do(initGCPCredentials)

	if gcpCredentialsErr != nil {
		log.Warn().Err(gcpCredentialsErr).Msg("Failed to initialize shared GCP credentials, clients will use defaults")
		return nil
	}

	if gcpCredentials == nil {
		return nil
	}

	// Only share credentials - gRPC clients handle their own transport
	return []option.ClientOption{
		option.WithCredentials(gcpCredentials),
	}
}

// initGCPCredentials initializes the shared GCP credentials.
// Called once via sync.Once to ensure single initialization.
func initGCPCredentials() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Find default credentials with all required scopes
	scopes := []string{
		"https://www.googleapis.com/auth/bigquery",
		"https://www.googleapis.com/auth/datastore",
		"https://www.googleapis.com/auth/pubsub",
		"https://www.googleapis.com/auth/cloudplatformprojects.readonly", // For listing GCP projects
		"https://www.googleapis.com/auth/firebase.readonly",              // For listing Firebase projects
	}

	creds, err := google.FindDefaultCredentials(ctx, scopes...)
	if err != nil {
		gcpCredentialsErr = err
		log.Error().Err(err).Msg("Failed to find default GCP credentials")
		return
	}

	gcpCredentials = creds
	log.Info().Msg("Shared GCP credentials initialized successfully")
}
