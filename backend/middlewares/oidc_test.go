package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestOIDCTokenVerification_SkipsInLocalMode(t *testing.T) {
	// The emulator doesn't send OIDC tokens, so local mode skips validation.
	// config.IsLocal() returns true when FIRESTORE_EMULATOR_HOST is set or ENV=LOCAL.
	// Since tests run with the emulator, this should skip.
	gin.SetMode(gin.TestMode)

	handlerCalled := false
	router := gin.New()
	router.Use(OIDCTokenVerification())
	router.POST("/push/test", func(c *gin.Context) {
		handlerCalled = true
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/push/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.True(t, handlerCalled, "handler should be called when local mode skips OIDC")
}
