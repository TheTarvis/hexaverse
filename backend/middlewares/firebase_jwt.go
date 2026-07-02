package middlewares

import (
	"{{PROJECT_SLUG}}/account"
	"{{PROJECT_SLUG}}/common"
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/option"
)

var (
	firebaseApp *firebase.App
	authClient  *auth.Client
	accountDao  account.Dao
)

// InitializeFirebase initializes the Firebase app and auth client
func InitializeFirebase() error {
	var err error

	// Get Firebase project ID from environment
	projectID := os.Getenv("FIREBASE_PROJECT_ID")
	if projectID == "" {
		return fmt.Errorf("FIREBASE_PROJECT_ID environment variable is required")
	}

	// Initialize Firebase App with project ID
	// Use shared GCP credentials to prevent credential refresh thundering herd
	config := &firebase.Config{
		ProjectID: projectID,
	}

	// Get shared credentials options
	var opts []option.ClientOption
	if sharedOpts := common.GCPClientOptions(); sharedOpts != nil {
		opts = sharedOpts
	}

	firebaseApp, err = firebase.NewApp(context.Background(), config, opts...)
	if err != nil {
		return fmt.Errorf("failed to initialize Firebase app: %w", err)
	}

	// Get Auth client
	authClient, err = firebaseApp.Auth(context.Background())
	if err != nil {
		return fmt.Errorf("failed to initialize Firebase auth client: %w", err)
	}

	// Initialize the account DAO after Firebase is set up
	// This ensures it uses the correct Firestore configuration
	accountDao = account.NewDao()

	return nil
}

// FirebaseJWTVerification is a Gin middleware that verifies Firebase JWT tokens
func FirebaseJWTVerification() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			log.Warn().Msg("Missing Authorization header")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing Authorization header"})
			return
		}

		// Extract bearer token
		if !strings.HasPrefix(authHeader, "Bearer ") {
			log.Warn().Msg("Authorization header must start with Bearer")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid Authorization header format"})
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == "" {
			log.Warn().Msg("Empty token in Authorization header")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Empty token"})
			return
		}

		// Debug: Log token presence only (avoid logging token content)
		log.Debug().Bool("token_present", len(token) > 0).Int("token_length", len(token)).Msg("Received token for verification")

		// Check if Firebase is initialized
		if authClient == nil {
			log.Error().Msg("Firebase auth client not initialized")
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Authentication service unavailable"})
			return
		}

		// Verify the Firebase JWT token
		ctx := context.Background()
		decodedToken, err := authClient.VerifyIDToken(ctx, token)
		if err != nil {
			log.Warn().Err(err).Str("error_details", err.Error()).Msg("Failed to verify Firebase JWT token")

			// Provide more specific error messages
			errorMsg := "Invalid token"
			if strings.Contains(err.Error(), "no 'kid' header") {
				errorMsg = "Token format invalid - ensure you're sending a Firebase ID token, not a custom JWT"
			} else if strings.Contains(err.Error(), "project id not available") {
				errorMsg = "Firebase project configuration error"
			}

			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": errorMsg})
			return
		}

		// Extract user information from the token
		firebaseUID := decodedToken.UID

		// Extract admin claim from the token
		isAdmin := false
		if adminClaim, exists := decodedToken.Claims["admin"]; exists {
			if adminBool, ok := adminClaim.(bool); ok {
				isAdmin = adminBool
			}
		}

		// Set Firebase UID and admin status in context for use by other handlers
		c.Set(common.FirestoreUidKey, firebaseUID)
		c.Set(common.IsAdminKey, isAdmin)

		log.Debug().
			Str("firebase_uid", firebaseUID).
			Str("subject", decodedToken.Subject).
			Bool("is_admin", isAdmin).
			Msg("Successfully verified Firebase JWT token")

		c.Next()
	}
}

// FirebaseUidToAccountMiddleware converts Firebase UID to internal account ID
// This middleware should be used after FirebaseJWTVerification
func FirebaseUidToAccountMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		firebaseUID := c.GetString(common.FirestoreUidKey)
		if firebaseUID == "" {
			log.Error().Msg("Firebase UID not found in context - ensure FirebaseJWTVerification middleware runs first")
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Authentication context missing"})
			return
		}

		// Ensure accountDao is initialized
		if accountDao == nil {
			log.Error().Msg("Account DAO not initialized - ensure InitializeFirebase is called first")
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Service not initialized"})
			return
		}

		// Query the account service to get the internal account ID
		ctx := c.Request.Context()
		log.Debug().
			Str("firebase_uid", firebaseUID).
			Msg("Looking up account by Firebase UID")

		acct, err := accountDao.GetAccountByFirestoreUid(ctx, firebaseUID)
		if err != nil {
			log.Error().
				Err(err).
				Str("firebase_uid", firebaseUID).
				Msg("Failed to fetch account by Firebase UID")
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch account"})
			return
		}

		if acct == nil {
			log.Warn().
				Str("firebase_uid", firebaseUID).
				Msg("Account not found for Firebase UID - continuing without account ID")
			// Don't abort - just continue without setting the account ID
			// This allows account creation to proceed
			c.Next()
			return
		}

		// Set the internal account ID in the context
		c.Set(common.AccountIdKey, acct.Id)

		log.Debug().
			Str("firebase_uid", firebaseUID).
			Str("account_id", acct.Id).
			Msg("Successfully mapped Firebase UID to account ID")

		c.Next()
	}
}
