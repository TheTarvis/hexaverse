package middlewares

import "github.com/gin-gonic/gin"

// SecurityHeaders sets standard security headers on all responses.
// Covers OWASP ASVS requirements for HTTP security headers.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()

		// Prevent clickjacking
		h.Set("X-Frame-Options", "DENY")

		// Prevent MIME-type sniffing
		h.Set("X-Content-Type-Options", "nosniff")

		// Enable XSS filter (legacy browsers)
		h.Set("X-XSS-Protection", "1; mode=block")

		// Control referrer information
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Enforce HTTPS (1 year, include subdomains)
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

		// Prevent embedding in unauthorized contexts
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		// Content Security Policy — API only, no inline scripts needed
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")

		c.Next()
	}
}
