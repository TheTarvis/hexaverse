package middlewares

import (
	"hexaverse/common"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// AdminOnlyMiddleware ensures only users with admin claims can access the endpoint
// This middleware should be used after FirebaseJWTVerification
func AdminOnlyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		isAdmin := c.GetBool(common.IsAdminKey)

		if !isAdmin {
			log.Warn().
				Str("firebase_uid", c.GetString(common.FirestoreUidKey)).
				Str("account_id", c.GetString(common.AccountIdKey)).
				Msg("Admin access required but user is not admin")
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			return
		}

		log.Debug().
			Str("firebase_uid", c.GetString(common.FirestoreUidKey)).
			Str("account_id", c.GetString(common.AccountIdKey)).
			Msg("Admin access granted")

		c.Next()
	}
}
