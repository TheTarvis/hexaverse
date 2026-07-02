package middlewares

import (
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// AuditAuthEvents logs authentication-related events for CASA/ASVS compliance.
// Placed after FirebaseJWTVerification to log success/failure outcomes.
func AuditAuthEvents() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// Log after request completes so we have the outcome
		status := c.Writer.Status()
		path := c.Request.URL.Path
		method := c.Request.Method
		clientIP := c.ClientIP()

		// Build base audit event
		event := log.Info().
			Str("audit_type", "auth").
			Str("method", method).
			Str("path", path).
			Str("client_ip", clientIP).
			Int("status", status)

		// Add identity if available
		if uid := c.GetString("firebase_uid"); uid != "" {
			event = event.Str("firebase_uid", uid)
		}
		if accountId := c.GetString("account_id"); accountId != "" {
			event = event.Str("account_id", accountId)
		}

		// Classify the event
		switch {
		case status == 401:
			log.Warn().
				Str("audit_type", "auth_failure").
				Str("method", method).
				Str("path", path).
				Str("client_ip", clientIP).
				Int("status", status).
				Msg("Authentication failed")
		case status == 403:
			log.Warn().
				Str("audit_type", "authz_failure").
				Str("method", method).
				Str("path", path).
				Str("client_ip", clientIP).
				Int("status", status).
				Str("firebase_uid", c.GetString("firebase_uid")).
				Str("account_id", c.GetString("account_id")).
				Msg("Authorization denied")
		case status == 429:
			log.Warn().
				Str("audit_type", "rate_limit").
				Str("method", method).
				Str("path", path).
				Str("client_ip", clientIP).
				Msg("Rate limit exceeded")
		default:
			event.Msg("Auth request processed")
		}
	}
}
