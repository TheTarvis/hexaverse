package middlewares

import (
	"context"
	"hexaverse/account"
	"hexaverse/common"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"go.uber.org/mock/gomock"
)

func TestFirebaseJWTVerification(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		authHeader     string
		expectedStatus int
		shouldCallNext bool
	}{
		{
			name:           "missing authorization header",
			authHeader:     "",
			expectedStatus: http.StatusUnauthorized,
			shouldCallNext: false,
		},
		{
			name:           "invalid authorization header format",
			authHeader:     "Invalid token",
			expectedStatus: http.StatusUnauthorized,
			shouldCallNext: false,
		},
		{
			name:           "empty token",
			authHeader:     "Bearer ",
			expectedStatus: http.StatusUnauthorized,
			shouldCallNext: false,
		},
		{
			name:           "invalid token format (Firebase not initialized)",
			authHeader:     "Bearer invalid-token",
			expectedStatus: http.StatusInternalServerError, // Firebase not initialized in test
			shouldCallNext: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a test router
			router := gin.New()

			// Track if next handler was called
			nextCalled := false

			// Add the middleware and a test handler
			router.Use(FirebaseJWTVerification())
			router.GET("/test", func(c *gin.Context) {
				nextCalled = true
				c.Status(http.StatusOK)
			})

			// Create a test request
			req := httptest.NewRequest("GET", "/test", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}

			// Create a response recorder
			w := httptest.NewRecorder()

			// Perform the request
			router.ServeHTTP(w, req)

			// Assert the response
			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Equal(t, tt.shouldCallNext, nextCalled)
		})
	}
}

func TestFirebaseUidToAccountMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name              string
		firebaseUID       string
		setupMock         func(*gomock.Controller, *account.MockDao)
		expectedStatus    int
		expectedAccountID string
	}{
		{
			name:        "valid firebase UID with existing account",
			firebaseUID: "firebase-uid-123",
			setupMock: func(ctrl *gomock.Controller, mockDao *account.MockDao) {
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firebase-uid-123").
					Return(&account.Account{
						Id:           "internal-account-456",
						FirestoreUid: "firebase-uid-123",
					}, nil)
			},
			expectedStatus:    http.StatusOK,
			expectedAccountID: "internal-account-456",
		},
		{
			name:        "valid firebase UID but account not found - should continue",
			firebaseUID: "firebase-uid-789",
			setupMock: func(ctrl *gomock.Controller, mockDao *account.MockDao) {
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firebase-uid-789").
					Return(nil, nil)
			},
			expectedStatus: http.StatusOK, // Updated: should continue, not abort
		},
		{
			name:           "missing firebase UID",
			firebaseUID:    "",
			setupMock:      func(ctrl *gomock.Controller, mockDao *account.MockDao) {},
			expectedStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create gomock controller
			ctrl := gomock.NewController(t)
			defer ctrl.Finish()

			// Create mock DAO
			mockDao := account.NewMockDao(ctrl)
			if tt.setupMock != nil {
				tt.setupMock(ctrl, mockDao)
			}

			// Save original DAO and replace with mock
			originalDao := accountDao
			accountDao = mockDao
			defer func() {
				accountDao = originalDao
			}()

			// Create a test router
			router := gin.New()

			// Add the middleware and a test handler
			router.Use(func(c *gin.Context) {
				// Simulate the Firebase UID being set by previous middleware
				if tt.firebaseUID != "" {
					c.Set(common.FirestoreUidKey, tt.firebaseUID)
				}
				c.Next()
			})
			router.Use(FirebaseUidToAccountMiddleware())
			router.GET("/test", func(c *gin.Context) {
				// Verify the account ID was set correctly
				if tt.expectedAccountID != "" {
					accountID := c.GetString(common.AccountIdKey)
					assert.Equal(t, tt.expectedAccountID, accountID)
				}
				c.Status(http.StatusOK)
			})

			// Create a test request with context
			req := httptest.NewRequest("GET", "/test", nil)
			req = req.WithContext(context.Background())
			w := httptest.NewRecorder()

			// Perform the request
			router.ServeHTTP(w, req)

			// Assert the response
			assert.Equal(t, tt.expectedStatus, w.Code)
		})
	}
}

// TestMiddlewareChain tests the complete middleware chain
func TestMiddlewareChain(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("middleware chain without firebase initialization", func(t *testing.T) {
		// This tests the middleware behavior when Firebase is not initialized
		// The JWT verification should fail gracefully

		router := gin.New()
		router.Use(FirebaseJWTVerification(), FirebaseUidToAccountMiddleware())
		router.GET("/test", func(c *gin.Context) {
			c.Status(http.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer some-token")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		// Should return internal server error because Firebase is not initialized
		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

// TestAdminClaimsHandling tests admin claim extraction and context setting
func TestAdminClaimsHandling(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		setupContext   func(*gin.Context)
		expectedAdmin  bool
		expectedStatus int
	}{
		{
			name: "user with admin claim should be marked as admin",
			setupContext: func(c *gin.Context) {
				c.Set(common.FirestoreUidKey, "admin-uid")
				c.Set(common.IsAdminKey, true)
			},
			expectedAdmin:  true,
			expectedStatus: http.StatusOK,
		},
		{
			name: "user without admin claim should not be marked as admin",
			setupContext: func(c *gin.Context) {
				c.Set(common.FirestoreUidKey, "regular-uid")
				c.Set(common.IsAdminKey, false)
			},
			expectedAdmin:  false,
			expectedStatus: http.StatusOK,
		},
		{
			name: "admin status should default to false when not set",
			setupContext: func(c *gin.Context) {
				c.Set(common.FirestoreUidKey, "some-uid")
				// Don't set IsAdminKey to test default behavior
			},
			expectedAdmin:  false,
			expectedStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()

			// Middleware to simulate JWT verification setting context
			router.Use(func(c *gin.Context) {
				tt.setupContext(c)
				c.Next()
			})

			// Test handler that checks admin status
			router.GET("/test", func(c *gin.Context) {
				isAdmin := common.IsAdmin(c)
				assert.Equal(t, tt.expectedAdmin, isAdmin)
				c.Status(http.StatusOK)
			})

			req := httptest.NewRequest("GET", "/test", nil)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)
		})
	}
}

// TestCommonContextHelpers tests the helper functions in common package
func TestCommonContextHelpers(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("IsAdmin helper function", func(t *testing.T) {
		router := gin.New()

		router.GET("/admin-test", func(c *gin.Context) {
			c.Set(common.IsAdminKey, true)
			assert.True(t, common.IsAdmin(c))

			c.Set(common.IsAdminKey, false)
			assert.False(t, common.IsAdmin(c))

			// Test default behavior when key is not set
			c.Set(common.IsAdminKey, nil)
			assert.False(t, common.IsAdmin(c))

			c.Status(http.StatusOK)
		})

		req := httptest.NewRequest("GET", "/admin-test", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}
