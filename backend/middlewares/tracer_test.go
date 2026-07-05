package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTracerRouter builds a router with the TRACER middleware and a handler
// that echoes the trace id it sees in the gin context.
func newTracerRouter(t *testing.T, captured *string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(TRACER)
	r.GET("/test", func(c *gin.Context) {
		value, exists := c.Get(common.TracerKey)
		require.True(t, exists, "tracer middleware should set %s in the gin context", common.TracerKey)
		traceID, ok := value.(string)
		require.True(t, ok, "trace id should be a string")
		*captured = traceID
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	return r
}

func TestTracer_UsesIncomingTraceHeader(t *testing.T) {
	var captured string
	r := newTracerRouter(t, &captured)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set(common.TracerKey, "incoming-trace-abc")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "incoming-trace-abc", captured)
}

func TestTracer_GeneratesUUIDWhenHeaderMissing(t *testing.T) {
	var captured string
	r := newTracerRouter(t, &captured)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/test", nil))

	assert.Equal(t, http.StatusOK, w.Code)
	require.NotEmpty(t, captured)
	_, err := uuid.Parse(captured)
	assert.NoError(t, err, "generated trace id should be a valid UUID, got %q", captured)
}

func TestTracer_GeneratesUUIDWhenHeaderEmpty(t *testing.T) {
	var captured string
	r := newTracerRouter(t, &captured)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set(common.TracerKey, "")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	require.NotEmpty(t, captured, "empty header should be replaced with a generated trace id")
	_, err := uuid.Parse(captured)
	assert.NoError(t, err)
}

func TestTracer_GeneratedIDsAreUniquePerRequest(t *testing.T) {
	var captured string
	r := newTracerRouter(t, &captured)

	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, httptest.NewRequest(http.MethodGet, "/test", nil))
	first := captured

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/test", nil))
	second := captured

	assert.Equal(t, http.StatusOK, w1.Code)
	assert.Equal(t, http.StatusOK, w2.Code)
	assert.NotEqual(t, first, second, "each request without a trace header should get its own trace id")
}
