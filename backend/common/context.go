package common

import (
	"github.com/gin-gonic/gin"
)

// Actor returns the account ID of the authenticated user from the context
func Actor(c *gin.Context) string {
	return c.GetString(AccountIdKey)
}

// ActorCorp returns the Corporation the requester acts as. Fog of war and
// ownership are strictly per-Corporation (#0006 Decision #12), so read filtering
// keys on this, not the account. The ResolveCorporation middleware (#0009)
// resolves account→living-corp once per request and stashes it here; empty means
// the account hasn't woken yet (no corp), in which case fogged reads return the
// baseline and own-asset lists are empty.
func ActorCorp(c *gin.Context) string {
	return c.GetString(CorpIdKey)
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
