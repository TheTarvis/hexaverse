package config

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/namsral/flag"
)

type ServiceConfiguration struct {
	ServiceName string
	Version     string
	Env         string
	ApiPort     string

	// Firestore Configuration
	FirebaseProjectID string // Firestore project ID

	// Pub/Sub Configuration
	GCPProjectID       string // Required for Pub/Sub
	PubSubTopicPrefix  string // Prefix for Pub/Sub topics
	PubSubEmulatorHost string // For local development with emulator

	// OAuth Configuration
	GoogleOAuthClientID     string // Google OAuth client ID
	GoogleOAuthClientSecret string // Google OAuth client secret

	// LLM Configuration
	AnthropicAPIKey string // Anthropic API key for Claude

	// Email (platform-managed Resend sender) Configuration
	// Used by the `email` provider — Flywheel-branded transactional sender that
	// sends to the workflow owner only (recipient locked to pipeline.CreatedBy).
	ResendAPIKey        string // Resend API key for the platform-managed Flywheel sender
	EmailSender string // From address for platform-managed emails (e.g. "Hexaverse <pipelines@hexaverse.io>")

	// Scheduler Configuration (local development)
	SchedulerTriggerInterval int // Interval in seconds for local scheduler trigger (default 60)

	// GCS Managed Bucket Configuration
	ImportBucket                 string // GCS bucket for user file uploads (default: hexaverse-imports-dev)
	ExportBucket                 string // GCS bucket for user file downloads/exports (default: hexaverse-exports-dev)
	PipelineArtifactsBucket      string // GCS bucket for internal pipeline artifacts - chunks, intermediate documents (default: hexaverse-pipelines-dev)
	GCSSigningSA                 string // Service account for signing URLs (default: hexaverse-backend@hexaverse.iam.gserviceaccount.com)
	GCSPathPrefix                string // Path prefix prepended to all managed bucket paths (for e2e test isolation)
	GoogleApplicationCredentials string

	// Stripe Billing Configuration
	StripeSecretKey       string
	StripeWebhookSecret   string
	StripeProMonthlyPrice string
	StripeProAnnualPrice  string

	// Rate Limiting
	DisableRateLimiting bool // Disable auth endpoint rate limiting (for CI/CD e2e tests)

	// World simulation clock (spec #0005). scale warps sim time vs wall time:
	// prod=1 (real time), dev/test fast so long burns resolve in seconds.
	// NEVER change on a world holding data — stored stamps would reinterpret.
	WorldTimeScale float64
}

var ServiceConfig ServiceConfiguration

func init() {
	// Determine which env file to load based on ENV environment variable
	env := os.Getenv("ENV")
	if env == "" {
		env = "local" // Default to local development
	}

	// Try to load environment-specific file first (.env.local, .env.test, etc.)
	envFile := fmt.Sprintf(".env.%s", strings.ToLower(env))
	if _, err := os.Stat(envFile); err == nil {
		err := godotenv.Load(envFile)
		if err != nil {
			log.Fatalf("Error loading %s file. %v", envFile, err)
		} else {
			log.Printf("Loaded %s file", envFile)
		}
	} else if _, err := os.Stat(".env"); err == nil {
		// Fall back to .env if environment-specific file doesn't exist
		err := godotenv.Load()
		if err != nil {
			log.Fatalf("Error loading .env file. %v", err)
		} else {
			log.Println("Loaded .env file")
		}
	}

	flag.StringVar(&ServiceConfig.Env, "ENV", "LOCAL", "Specifies what environment we're in")
	flag.StringVar(&ServiceConfig.Version, "VERSION", "__dev__", "Setting Version for debugging")
	flag.StringVar(&ServiceConfig.ServiceName, "SERVICE_NAME", "NonNon API", "Name of Service")
	flag.StringVar(&ServiceConfig.ApiPort, "PORT", "8080", "Specifies what port the API uses")

	// Firestore Configuration (uses FIREBASE_PROJECT_ID for consistency)
	flag.StringVar(&ServiceConfig.FirebaseProjectID, "FIREBASE_PROJECT_ID", "hexaverse", "Firebase project ID")

	// Pub/Sub Configuration
	flag.StringVar(&ServiceConfig.GCPProjectID, "GCP_PROJECT_ID", "hexaverse", "GCP Project ID for Pub/Sub (required)")
	flag.StringVar(&ServiceConfig.PubSubTopicPrefix, "PUBSUB_TOPIC_PREFIX", "hexaverse", "Prefix for Pub/Sub topic names")
	flag.StringVar(&ServiceConfig.PubSubEmulatorHost, "PUBSUB_EMULATOR_HOST", "", "Pub/Sub emulator host for local development")

	// OAuth Configuration
	//flag.StringVar(&ServiceConfig.GoogleOAuthClientID, "GOOGLE_OAUTH_CLIENT_ID", "", "Google OAuth client ID")
	//flag.StringVar(&ServiceConfig.GoogleOAuthClientSecret, "GOOGLE_OAUTH_CLIENT_SECRET", "", "Google OAuth client secret")
	//flag.StringVar(&ServiceConfig.GoogleApplicationCredentials, "GOOGLE_APPLICATION_CREDENTIALS", "", "Path to Google Application Credentials JSON file")

	// LLM Configuration
	flag.StringVar(&ServiceConfig.AnthropicAPIKey, "ANTHROPIC_API_KEY", "", "Anthropic API key for Claude")

	// Email (platform-managed Resend sender) Configuration
	flag.StringVar(&ServiceConfig.ResendAPIKey, "RESEND_API_KEY", "", "Resend API key for platform-managed email sender")
	flag.StringVar(&ServiceConfig.EmailSender, "EMAIL_SENDER", "Hexaverse <pipelines@hexaverse.io>", "From address used by the platform-managed email provider")

	// Scheduler Configuration (local development)
	flag.IntVar(&ServiceConfig.SchedulerTriggerInterval, "SCHEDULER_TRIGGER_INTERVAL", 60, "Interval in seconds for local scheduler trigger")

	// GCS Managed Bucket Configuration
	flag.StringVar(&ServiceConfig.ImportBucket, "IMPORT_BUCKET", "hexaverse-imports-dev", "GCS bucket for user file uploads")
	flag.StringVar(&ServiceConfig.ExportBucket, "EXPORT_BUCKET", "hexaverse-exports-dev", "GCS bucket for user file downloads/exports")
	flag.StringVar(&ServiceConfig.PipelineArtifactsBucket, "PIPELINE_ARTIFACTS_BUCKET", "hexaverse-pipelines-dev", "GCS bucket for internal pipeline artifacts")
	flag.StringVar(&ServiceConfig.GCSSigningSA, "GCS_SIGNING_SA", "hexaverse-backend@hexaverse.iam.gserviceaccount.com", "Service account for signing URLs for gcs")
	flag.StringVar(&ServiceConfig.GCSPathPrefix, "GCS_PATH_PREFIX", "", "Path prefix prepended to all managed bucket paths (for e2e test isolation)")

	// Stripe Billing Configuration
	flag.StringVar(&ServiceConfig.StripeSecretKey, "STRIPE_SECRET_KEY", "", "Stripe secret API key")
	flag.StringVar(&ServiceConfig.StripeWebhookSecret, "STRIPE_WEBHOOK_SECRET", "", "Stripe webhook signing secret")
	flag.StringVar(&ServiceConfig.StripeProMonthlyPrice, "STRIPE_PRO_MONTHLY_PRICE_ID", "", "Stripe Price ID for Pro monthly plan")
	flag.StringVar(&ServiceConfig.StripeProAnnualPrice, "STRIPE_PRO_ANNUAL_PRICE_ID", "", "Stripe Price ID for Pro annual plan")

	// Rate Limiting
	flag.BoolVar(&ServiceConfig.DisableRateLimiting, "DISABLE_RATE_LIMITING", false, "Disable auth endpoint rate limiting (for CI/CD e2e tests)")

	// World simulation clock. Default 1 (real time); dev/test override fast.
	flag.Float64Var(&ServiceConfig.WorldTimeScale, "WORLD_TIME_SCALE", 1, "Simulation time-warp factor relative to wall clock")

	flag.Parse()
}

// IsLocal returns true if the application is running in local development mode
func IsLocal() bool {
	// Check if ENV is explicitly set to LOCAL
	if ServiceConfig.Env == "LOCAL" {
		return true
	}

	// Also check for Firestore emulator as an indicator of local development
	if os.Getenv("FIRESTORE_EMULATOR_HOST") != "" {
		return true
	}

	return false
}
