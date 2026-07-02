package middlewares

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"{{PROJECT_SLUG}}/common"
	apiconfig "{{PROJECT_SLUG}}/config"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// setProdMode forces non-local env so ErrorSanitizer actually runs. Returns
// a cleanup func the test should defer.
func setProdMode(t *testing.T) func() {
	t.Helper()
	origEnv := apiconfig.ServiceConfig.Env
	origEmu := os.Getenv("FIRESTORE_EMULATOR_HOST")
	apiconfig.ServiceConfig.Env = "PRODUCTION"
	_ = os.Unsetenv("FIRESTORE_EMULATOR_HOST")
	return func() {
		apiconfig.ServiceConfig.Env = origEnv
		if origEmu != "" {
			_ = os.Setenv("FIRESTORE_EMULATOR_HOST", origEmu)
		}
	}
}

func newTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.TracerKey, "test-trace-123")
		c.Next()
	})
	r.Use(ErrorSanitizer())
	return r
}

func TestErrorSanitizer_ReplacesInternalServerErrorBody(t *testing.T) {
	defer setProdMode(t)()
	r := newTestRouter()
	r.GET("/boom", func(c *gin.Context) {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "pq: relation \"users\" does not exist",
		})
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/boom", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var body map[string]any
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "Internal server error. Contact support if this persists.", body["error"])
	assert.Equal(t, "test-trace-123", body["trace"])
	assert.NotContains(t, w.Body.String(), "pq:")
	assert.NotContains(t, w.Body.String(), "relation")
}

func TestErrorSanitizer_Passes4xxErrorsThrough(t *testing.T) {
	defer setProdMode(t)()
	r := newTestRouter()
	r.GET("/bad", func(c *gin.Context) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing field: name"})
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/bad", nil))

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var body map[string]any
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	// 4xx bodies are client errors (validation) — NOT sanitized
	assert.Equal(t, "missing field: name", body["error"])
}

func TestErrorSanitizer_Passes2xxThrough(t *testing.T) {
	defer setProdMode(t)()
	r := newTestRouter()
	r.GET("/ok", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"name": "Alice", "email": "a@example.com"})
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ok", nil))

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "Alice", body["name"])
	assert.Equal(t, "a@example.com", body["email"])
}

func TestErrorSanitizer_LocalModeIsPassThrough(t *testing.T) {
	// Don't call setProdMode — stay in default test/local env.
	// Developers want to see the real error locally.
	apiconfig.ServiceConfig.Env = "LOCAL"
	r := newTestRouter()
	r.GET("/boom", func(c *gin.Context) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "raw driver error"})
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var body map[string]any
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "raw driver error", body["error"])
}

func TestErrorSanitizer_StreamingContentTypePassesThrough(t *testing.T) {
	defer setProdMode(t)()
	r := newTestRouter()
	r.GET("/stream", func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		c.Writer.WriteHeader(http.StatusOK)
		_, _ = c.Writer.Write([]byte("event: message\ndata: hello\n\n"))
		_, _ = c.Writer.Write([]byte("event: message\ndata: world\n\n"))
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/stream", nil))

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "data: hello")
	assert.Contains(t, w.Body.String(), "data: world")
}

func TestErrorSanitizer_502And503AreSanitized(t *testing.T) {
	defer setProdMode(t)()

	for _, status := range []int{http.StatusBadGateway, http.StatusServiceUnavailable} {
		r := newTestRouter()
		r.GET("/err", func(c *gin.Context) {
			c.JSON(status, gin.H{"error": "upstream Firestore: context deadline exceeded"})
		})

		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/err", nil))

		assert.Equal(t, status, w.Code)
		var body map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		assert.NotContains(t, body["error"], "Firestore")
		assert.NotContains(t, body["error"], "deadline")
	}
}
