package health

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func setupTestGin() (*gin.Engine, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	recorder := httptest.NewRecorder()
	return router, recorder
}

func TestGetHealthcheck(t *testing.T) {
	router, recorder := setupTestGin()

	router.GET("/health", GetHealthcheck)

	req := httptest.NewRequest("GET", "/health", nil)
	router.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusOK, recorder.Code)

	var response Payload
	err := json.Unmarshal(recorder.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.True(t, response.Healthy)
	assert.True(t, response.Test)
	assert.NotEmpty(t, response.Name)
	assert.NotEmpty(t, response.Env)
	assert.NotEmpty(t, response.Version)
}
