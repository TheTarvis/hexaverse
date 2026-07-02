package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestAnonymousId_SetsCookieWhenMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(AnonymousId())

	var ctxValue string
	router.GET("/test", func(c *gin.Context) {
		ctxValue = c.GetString("fw_aid")
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.NotEmpty(t, ctxValue, "fw_aid should be set in context")

	cookies := w.Result().Cookies()
	var fwCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "fw_aid" {
			fwCookie = c
			break
		}
	}
	assert.NotNil(t, fwCookie, "fw_aid cookie should be set")
	assert.Equal(t, ctxValue, fwCookie.Value)
	assert.True(t, fwCookie.HttpOnly)
	assert.Equal(t, "/", fwCookie.Path)
}

func TestAnonymousId_PreservesExistingCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(AnonymousId())

	existingId := "existing-anon-id-123"
	var ctxValue string
	router.GET("/test", func(c *gin.Context) {
		ctxValue = c.GetString("fw_aid")
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.AddCookie(&http.Cookie{Name: "fw_aid", Value: existingId})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, existingId, ctxValue)

	// Should not set a new cookie when one already exists
	cookies := w.Result().Cookies()
	for _, c := range cookies {
		assert.NotEqual(t, "fw_aid", c.Name, "should not re-set fw_aid cookie")
	}
}
