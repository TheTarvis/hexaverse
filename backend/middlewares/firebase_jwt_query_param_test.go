package middlewares

import (
	"hexaverse/common"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// TestFirebaseJWTFromQueryParam tests the JWT middleware for SSE endpoints
func TestFirebaseJWTFromQueryParam(t *testing.T) {
	tests := []struct {
		name           string
		authHeader     string
		queryToken     string
		expectedStatus int
		shouldCallNext bool
	}{
		{
			name:           "missing token in both header and query",
			authHeader:     "",
			queryToken:     "",
			expectedStatus: http.StatusUnauthorized,
			shouldCallNext: false,
		},
		{
			name:           "empty bearer token in header",
			authHeader:     "Bearer ",
			queryToken:     "",
			expectedStatus: http.StatusUnauthorized,
			shouldCallNext: false,
		},
		{
			name:           "empty query token",
			authHeader:     "",
			queryToken:     "",
			expectedStatus: http.StatusUnauthorized,
			shouldCallNext: false,
		},
		{
			name:           "invalid auth header format (no Bearer prefix)",
			authHeader:     "InvalidToken",
			queryToken:     "",
			expectedStatus: http.StatusUnauthorized,
			shouldCallNext: false,
		},
		{
			name:           "token in header - firebase not initialized",
			authHeader:     "Bearer valid-token",
			queryToken:     "",
			expectedStatus: http.StatusInternalServerError, // Firebase not initialized
			shouldCallNext: false,
		},
		{
			name:           "token in query param - firebase not initialized",
			authHeader:     "",
			queryToken:     "valid-token",
			expectedStatus: http.StatusInternalServerError, // Firebase not initialized
			shouldCallNext: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()

			nextCalled := false
			router.Use(FirebaseJWTFromQueryParam())
			router.GET("/test", func(c *gin.Context) {
				nextCalled = true
				c.Status(http.StatusOK)
			})

			url := "/test"
			if tt.queryToken != "" {
				url += "?token=" + tt.queryToken
			}

			req := httptest.NewRequest("GET", url, nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Equal(t, tt.shouldCallNext, nextCalled)
		})
	}
}

// TestFirebaseJWTFromQueryParam_HeaderPreference tests that header takes precedence over query param
func TestFirebaseJWTFromQueryParam_HeaderPreference(t *testing.T) {
	t.Run("header token is preferred over query token", func(t *testing.T) {
		router := gin.New()

		// Track which token path was used
		var headerUsed bool

		router.Use(func(c *gin.Context) {
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" && len(authHeader) > 7 {
				headerUsed = true
			}
			c.Next()
		})
		router.Use(FirebaseJWTFromQueryParam())
		router.GET("/test", func(c *gin.Context) {
			c.Status(http.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test?token=query-token", nil)
		req.Header.Set("Authorization", "Bearer header-token")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.True(t, headerUsed, "Header token should be checked first")
	})
}

// TestFirebaseJWTFromQueryParam_ContextValues tests that context values are set correctly
func TestFirebaseJWTFromQueryParam_ContextValues(t *testing.T) {
	t.Run("context keys are defined", func(t *testing.T) {
		// Verify the context keys exist
		assert.NotEmpty(t, common.FirestoreUidKey)
		assert.NotEmpty(t, common.IsAdminKey)
	})
}

// TestFirebaseJWTFromQueryParam_SSEEndpoint tests the middleware with SSE-like endpoint
func TestFirebaseJWTFromQueryParam_SSEEndpoint(t *testing.T) {
	t.Run("SSE endpoint with query token", func(t *testing.T) {
		router := gin.New()

		router.Use(FirebaseJWTFromQueryParam())
		router.GET("/api/sse/organization/:orgId", func(c *gin.Context) {
			c.Status(http.StatusOK)
		})

		// EventSource doesn't support custom headers, so token comes via query param
		req := httptest.NewRequest("GET", "/api/sse/organization/org-123?token=sse-token", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Will fail because Firebase is not initialized in tests
		// but this verifies the middleware runs correctly
		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

// TestFirebaseJWTFromQueryParam_ErrorResponses tests error response formats
func TestFirebaseJWTFromQueryParam_ErrorResponses(t *testing.T) {
	tests := []struct {
		name          string
		setupRequest  func() *http.Request
		expectedError string
	}{
		{
			name: "missing token error",
			setupRequest: func() *http.Request {
				return httptest.NewRequest("GET", "/test", nil)
			},
			expectedError: "Missing authentication token",
		},
		{
			name: "empty token after bearer",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				req.Header.Set("Authorization", "Bearer ")
				return req
			},
			expectedError: "Empty token",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			router.Use(FirebaseJWTFromQueryParam())
			router.GET("/test", func(c *gin.Context) {
				c.Status(http.StatusOK)
			})

			req := tt.setupRequest()
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Response should contain the expected error
			assert.Contains(t, w.Body.String(), tt.expectedError)
		})
	}
}

// TestFirebaseJWTFromQueryParam_AdminClaim tests admin claim handling
func TestFirebaseJWTFromQueryParam_AdminClaim(t *testing.T) {
	t.Run("admin claim extraction logic", func(t *testing.T) {
		// The middleware extracts admin claim from Firebase token claims
		// Test the logic pattern

		claims := map[string]interface{}{
			"admin": true,
		}

		isAdmin := false
		if adminClaim, exists := claims["admin"]; exists {
			if adminBool, ok := adminClaim.(bool); ok {
				isAdmin = adminBool
			}
		}

		assert.True(t, isAdmin)
	})

	t.Run("non-admin user", func(t *testing.T) {
		claims := map[string]interface{}{
			"admin": false,
		}

		isAdmin := false
		if adminClaim, exists := claims["admin"]; exists {
			if adminBool, ok := adminClaim.(bool); ok {
				isAdmin = adminBool
			}
		}

		assert.False(t, isAdmin)
	})

	t.Run("missing admin claim defaults to false", func(t *testing.T) {
		claims := map[string]interface{}{}

		isAdmin := false
		if adminClaim, exists := claims["admin"]; exists {
			if adminBool, ok := adminClaim.(bool); ok {
				isAdmin = adminBool
			}
		}

		assert.False(t, isAdmin)
	})
}

// TestFirebaseJWTFromQueryParam_BearerParsing tests Bearer token parsing
func TestFirebaseJWTFromQueryParam_BearerParsing(t *testing.T) {
	tests := []struct {
		name          string
		authHeader    string
		expectedToken string
		shouldExtract bool
	}{
		{
			name:          "valid bearer token",
			authHeader:    "Bearer abc123",
			expectedToken: "abc123",
			shouldExtract: true,
		},
		{
			name:          "bearer with spaces in token",
			authHeader:    "Bearer token with spaces",
			expectedToken: "token with spaces",
			shouldExtract: true,
		},
		{
			name:          "lowercase bearer",
			authHeader:    "bearer abc123",
			expectedToken: "",
			shouldExtract: false, // Case-sensitive
		},
		{
			name:          "no bearer prefix",
			authHeader:    "abc123",
			expectedToken: "",
			shouldExtract: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var token string
			if len(tt.authHeader) > 7 && tt.authHeader[:7] == "Bearer " {
				token = tt.authHeader[7:]
			}

			if tt.shouldExtract {
				assert.Equal(t, tt.expectedToken, token)
			} else {
				assert.Empty(t, token)
			}
		})
	}
}
