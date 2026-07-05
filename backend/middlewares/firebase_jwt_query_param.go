package middlewares

import (
	"hexaverse/common"
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// FirebaseJWTFromQueryParam is a middleware that verifies Firebase JWT tokens from query parameters
// This is specifically for SSE endpoints where EventSource doesn't support custom headers
func FirebaseJWTFromQueryParam() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try to get token from Authorization header first (standard path)
		authHeader := c.GetHeader("Authorization")
		var token string

		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			// Fallback to query parameter for SSE (EventSource doesn't support headers)
			token = common.OptionalQueryParam(c, "token")
			if token == "" {
				log.Warn().Msg("Missing token in both Authorization header and query parameter")
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing authentication token"})
				return
			}
		}

		if token == "" {
			log.Warn().Msg("Empty token")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Empty token"})
			return
		}

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
			log.Warn().Err(err).Msg("Failed to verify Firebase JWT token")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
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

		// Set Firebase UID and admin status in context
		c.Set(common.FirestoreUidKey, firebaseUID)
		c.Set(common.IsAdminKey, isAdmin)

		log.Debug().
			Str("firebase_uid", firebaseUID).
			Bool("is_admin", isAdmin).
			Bool("from_query_param", authHeader == "").
			Msg("Successfully verified Firebase JWT token")

		c.Next()
	}
}
