package middlewares

import (
	"{{PROJECT_SLUG}}/config"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/idtoken"
)

const pushAudience = "flywheel-backend"

// OIDCTokenVerification is a Gin middleware that validates OIDC tokens
// on push subscription endpoints. In production, Pub/Sub sends an OIDC
// token signed by the push service account. Locally, the emulator
// doesn't send tokens, so validation is skipped.
func OIDCTokenVerification() gin.HandlerFunc {
	return func(c *gin.Context) {
		if config.IsLocal() {
			c.Next()
			return
		}

		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			log.Warn().Str("path", c.Request.URL.Path).Msg("Push endpoint: missing Authorization header")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing Authorization header"})
			return
		}

		if !strings.HasPrefix(authHeader, "Bearer ") {
			log.Warn().Str("path", c.Request.URL.Path).Msg("Push endpoint: invalid Authorization format")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid Authorization header format"})
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")

		// Validate the OIDC token against our expected audience.
		// The audience must match what's configured in the Terraform push_config.
		payload, err := idtoken.Validate(c.Request.Context(), token, pushAudience)
		if err != nil {
			log.Warn().Err(err).Str("path", c.Request.URL.Path).Msg("Push endpoint: OIDC token validation failed")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid OIDC token"})
			return
		}

		log.Debug().
			Str("issuer", payload.Issuer).
			Str("subject", payload.Subject).
			Str("path", c.Request.URL.Path).
			Msg("Push endpoint: OIDC token verified")

		c.Next()
	}
}
