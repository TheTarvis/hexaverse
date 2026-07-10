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
// keys on this, not the account. Until #0009 builds real account→corporation
// membership, dev maps one corp per account so two accounts are two corps.
//
// TODO(#0009): resolve the requester's real corporation from membership; keep
// this the single seam callers depend on so M9 is a one-function change.
func ActorCorp(c *gin.Context) string {
	uid := Actor(c)
	if uid == "" {
		return ""
	}
	return "corp-" + uid
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
