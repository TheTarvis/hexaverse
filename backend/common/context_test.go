package common

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func newTestContext() *gin.Context {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/", nil)
	return c
}

func TestActor(t *testing.T) {
	t.Run("returns account id when set", func(t *testing.T) {
		c := newTestContext()
		c.Set(AccountIdKey, "account-123")
		assert.Equal(t, "account-123", Actor(c))
	})

	t.Run("returns empty string when not set", func(t *testing.T) {
		c := newTestContext()
		assert.Equal(t, "", Actor(c))
	})
}

func TestFirestoreUid(t *testing.T) {
	t.Run("returns firestore uid when set", func(t *testing.T) {
		c := newTestContext()
		c.Set(FirestoreUidKey, "firebase-uid-abc")
		assert.Equal(t, "firebase-uid-abc", FirestoreUid(c))
	})

	t.Run("returns empty string when not set", func(t *testing.T) {
		c := newTestContext()
		assert.Equal(t, "", FirestoreUid(c))
	})
}

func TestIsAdmin(t *testing.T) {
	t.Run("returns true when admin flag set", func(t *testing.T) {
		c := newTestContext()
		c.Set(IsAdminKey, true)
		assert.True(t, IsAdmin(c))
	})

	t.Run("returns false when admin flag set to false", func(t *testing.T) {
		c := newTestContext()
		c.Set(IsAdminKey, false)
		assert.False(t, IsAdmin(c))
	})

	t.Run("returns false when not set", func(t *testing.T) {
		c := newTestContext()
		assert.False(t, IsAdmin(c))
	})
}

func TestAnonymousId(t *testing.T) {
	t.Run("returns anonymous id when set", func(t *testing.T) {
		c := newTestContext()
		c.Set("fw_aid", "anon-xyz")
		assert.Equal(t, "anon-xyz", AnonymousId(c))
	})

	t.Run("returns empty string when not set", func(t *testing.T) {
		c := newTestContext()
		assert.Equal(t, "", AnonymousId(c))
	})
}
