package middlewares

import (
	apiconfig "hexaverse/config"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const anonymousIDCookie = "fw_aid"

// AnonymousId sets a server-side fw_aid cookie on every request if not already present.
// The cookie is HttpOnly (not readable by JS) and server-set (not subject to Safari ITP 7-day cap).
// The value is stored in the Gin context under "fw_aid" for downstream handlers to read.
func AnonymousId() gin.HandlerFunc {
	return func(c *gin.Context) {
		aid, err := c.Cookie(anonymousIDCookie)
		if err != nil || aid == "" {
			aid = uuid.New().String()
			maxAge := 2 * 365 * 24 * 60 * 60 // 2 years
			secure := !apiconfig.IsLocal()
			c.SetCookie(anonymousIDCookie, aid, maxAge, "/", "", secure, true)
		}
		c.Set("fw_aid", aid)
		c.Next()
	}
}
