package sse

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func setupTestRouter() (*gin.Engine, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	recorder := httptest.NewRecorder()
	return router, recorder
}

func TestHandler_StreamChannel_Unauthorized(t *testing.T) {
	router, recorder := setupTestRouter()

	handler := NewHandler()
	router.GET("/v1/channels/:channelId/stream", handler.StreamChannel)

	req := httptest.NewRequest("GET", "/v1/channels/c-123/stream", nil)
	router.ServeHTTP(recorder, req)

	// No actor in context → unauthorized.
	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
}

func TestNewHandler(t *testing.T) {
	handler := NewHandler()
	assert.NotNil(t, handler)
	assert.NotNil(t, handler.sseManager)
}

func TestNewHandler_SSEManagerIsSingleton(t *testing.T) {
	handler1 := NewHandler()
	handler2 := NewHandler()
	assert.Same(t, handler1.sseManager, handler2.sseManager)
}
