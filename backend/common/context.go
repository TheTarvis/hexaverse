package common

import (
	"github.com/gin-gonic/gin"
)

// Actor returns the account ID of the authenticated user from the context
func Actor(c *gin.Context) string {
	return c.GetString(AccountIdKey)
}

// FirestoreUid returns the FirestoreUid from the Gin context
func FirestoreUid(c *gin.Context) string {
	return c.GetString(FirestoreUidKey)
}

// IsAdmin returns true if the authenticated user has admin privileges
func IsAdmin(c *gin.Context) bool {
	return c.GetBool(IsAdminKey)
}

// AnonymousId returns the anonymous tracking ID from the fw_aid cookie (set by AnonymousId middleware)
func AnonymousId(c *gin.Context) string {
	return c.GetString("fw_aid")
}
