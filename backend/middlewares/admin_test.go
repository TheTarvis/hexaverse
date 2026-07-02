package middlewares

import (
	"{{PROJECT_SLUG}}/common"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestAdminOnlyMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		isAdmin        bool
		expectedStatus int
		expectedBody   string
	}{
		{
			name:           "Admin user access granted",
			isAdmin:        true,
			expectedStatus: http.StatusOK,
			expectedBody:   "success",
		},
		{
			name:           "Non-admin user access denied",
			isAdmin:        false,
			expectedStatus: http.StatusForbidden,
			expectedBody:   `{"error":"Admin access required"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()

			// Setup middleware chain
			router.Use(func(c *gin.Context) {
				// Mock the admin status in context
				c.Set(common.IsAdminKey, tt.isAdmin)
				c.Set(common.FirestoreUidKey, "test-uid")
				c.Set(common.AccountIdKey, "test-account")
				c.Next()
			})

			router.Use(AdminOnlyMiddleware())

			// Test endpoint
			router.GET("/test", func(c *gin.Context) {
				c.String(http.StatusOK, "success")
			})

			req := httptest.NewRequest("GET", "/test", nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, tt.expectedStatus, rec.Code)

			if tt.expectedStatus == http.StatusOK {
				assert.Equal(t, tt.expectedBody, rec.Body.String())
			} else {
				assert.Contains(t, rec.Body.String(), "Admin access required")
			}
		})
	}
}

func TestAdminOnlyMiddleware_MissingAdminKey(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(AdminOnlyMiddleware())
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "success")
	})

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	// When admin key is missing, GetBool returns false, so access should be denied
	assert.Equal(t, http.StatusForbidden, rec.Code)
	assert.Contains(t, rec.Body.String(), "Admin access required")
}
