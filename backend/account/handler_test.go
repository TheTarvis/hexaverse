package account

import (
	"{{PROJECT_SLUG}}/common"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"go.uber.org/mock/gomock"
)

func setupTestGin() (*gin.Engine, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	recorder := httptest.NewRecorder()
	return router, recorder
}

func createTestAccount() *Account {
	return &Account{
		Id:           "test-account-id",
		FirestoreUid: "firestore|test-user-id",
	}
}

func TestGetAccountSelfHandler(t *testing.T) {
	tests := []struct {
		name             string
		firestoreUid     string
		mockSetup        func(*MockDao)
		expectedStatus   int
		validateResponse func(*testing.T, *httptest.ResponseRecorder)
	}{
		{
			name:         "success - account found",
			firestoreUid: "firestore|test-user-id",
			mockSetup: func(mockDao *MockDao) {
				account := createTestAccount()
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|test-user-id").
					Return(account, nil)
			},
			expectedStatus: http.StatusOK,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response Account
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "test-account-id", response.Id)
			},
		},
		{
			name:         "account not found",
			firestoreUid: "firestore|nonexistent-user",
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|nonexistent-user").
					Return(nil, nil)
			},
			expectedStatus: http.StatusNotFound,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				assert.Empty(t, recorder.Body.String())
			},
		},
		{
			name:         "database error",
			firestoreUid: "firestore|test-user-id",
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|test-user-id").
					Return(nil, errors.New("database connection failed"))
			},
			expectedStatus: http.StatusInternalServerError,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				assert.Empty(t, recorder.Body.String())
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			defer ctrl.Finish()

			router, recorder := setupTestGin()
			mockDao := NewMockDao(ctrl)

			handler := &Handler{dao: mockDao}

			if tt.mockSetup != nil {
				tt.mockSetup(mockDao)
			}

			router.GET("/account/self", func(c *gin.Context) {
				c.Set(common.FirestoreUidKey, tt.firestoreUid)
				handler.GetAccountSelfHandler(c)
			})

			req := httptest.NewRequest("GET", "/account/self", nil)
			router.ServeHTTP(recorder, req)

			assert.Equal(t, tt.expectedStatus, recorder.Code)
			if tt.validateResponse != nil {
				tt.validateResponse(t, recorder)
			}
		})
	}
}

func TestGetAccountByIdHandler(t *testing.T) {
	tests := []struct {
		name                   string
		accountId              string
		authenticatedAccountId string
		mockSetup              func(*MockDao)
		expectedStatus         int
		validateResponse       func(*testing.T, *httptest.ResponseRecorder)
	}{
		{
			name:                   "success - account owner accessing their own account",
			accountId:              "test-account-id",
			authenticatedAccountId: "test-account-id",
			mockSetup: func(mockDao *MockDao) {
				account := createTestAccount()
				mockDao.EXPECT().
					GetByAccountId(gomock.Any(), "test-account-id").
					Return(account, nil)
			},
			expectedStatus: http.StatusOK,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response Account
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "test-account-id", response.Id)
			},
		},
		{
			name:                   "forbidden - user attempting to access another user's account",
			accountId:              "other-account-id",
			authenticatedAccountId: "test-account-id",
			mockSetup: func(mockDao *MockDao) {
				// No DAO calls should be made when authorization fails
			},
			expectedStatus: http.StatusForbidden,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response map[string]string
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Contains(t, response["error"], "Forbidden")
			},
		},
		{
			name:                   "account not found",
			accountId:              "test-account-id",
			authenticatedAccountId: "test-account-id",
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetByAccountId(gomock.Any(), "test-account-id").
					Return(nil, nil)
			},
			expectedStatus: http.StatusNotFound,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				assert.Empty(t, recorder.Body.String())
			},
		},
		{
			name:                   "database error",
			accountId:              "test-account-id",
			authenticatedAccountId: "test-account-id",
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetByAccountId(gomock.Any(), "test-account-id").
					Return(nil, errors.New("database connection failed"))
			},
			expectedStatus: http.StatusInternalServerError,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				assert.Empty(t, recorder.Body.String())
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			defer ctrl.Finish()

			router, recorder := setupTestGin()
			mockDao := NewMockDao(ctrl)

			handler := &Handler{dao: mockDao}

			if tt.mockSetup != nil {
				tt.mockSetup(mockDao)
			}

			router.GET("/account/:accountId", func(c *gin.Context) {
				c.Set(common.AccountIdKey, tt.authenticatedAccountId)
				handler.GetAccountByIdHandler(c)
			})

			req := httptest.NewRequest("GET", "/account/"+tt.accountId, nil)
			router.ServeHTTP(recorder, req)

			assert.Equal(t, tt.expectedStatus, recorder.Code)
			if tt.validateResponse != nil {
				tt.validateResponse(t, recorder)
			}
		})
	}
}

func TestGetAccountProfileHandler(t *testing.T) {
	tests := []struct {
		name                   string
		accountId              string
		authenticatedAccountId string
		mockSetup              func(*MockDao)
		expectedStatus         int
		validateResponse       func(*testing.T, *httptest.ResponseRecorder)
	}{
		{
			name:                   "success - get any user's profile",
			accountId:              "other-account-id",
			authenticatedAccountId: "test-account-id",
			mockSetup: func(mockDao *MockDao) {
				account := &Account{
					Id:      "other-account-id",
					Name:    "John Doe",
					Email:   "john@example.com",
					Picture: "https://example.com/avatar.jpg",
				}
				mockDao.EXPECT().
					GetByAccountId(gomock.Any(), "other-account-id").
					Return(account, nil)
			},
			expectedStatus: http.StatusOK,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response AccountProfile
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "other-account-id", response.Id)
				assert.Equal(t, "John Doe", response.Name)
				assert.Equal(t, "john@example.com", response.Email)
				assert.Equal(t, "https://example.com/avatar.jpg", response.Picture)
				// Verify organizations are NOT included in profile
			},
		},
		{
			name:                   "success - profile with minimal data",
			accountId:              "minimal-account-id",
			authenticatedAccountId: "test-account-id",
			mockSetup: func(mockDao *MockDao) {
				account := &Account{
					Id: "minimal-account-id",
				}
				mockDao.EXPECT().
					GetByAccountId(gomock.Any(), "minimal-account-id").
					Return(account, nil)
			},
			expectedStatus: http.StatusOK,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response AccountProfile
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "minimal-account-id", response.Id)
				assert.Empty(t, response.Name)
				assert.Empty(t, response.Email)
				assert.Empty(t, response.Picture)
			},
		},
		{
			name:                   "account not found",
			accountId:              "nonexistent-account-id",
			authenticatedAccountId: "test-account-id",
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetByAccountId(gomock.Any(), "nonexistent-account-id").
					Return(nil, nil)
			},
			expectedStatus: http.StatusNotFound,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				assert.Empty(t, recorder.Body.String())
			},
		},
		{
			name:                   "database error",
			accountId:              "test-account-id",
			authenticatedAccountId: "test-account-id",
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetByAccountId(gomock.Any(), "test-account-id").
					Return(nil, errors.New("database connection failed"))
			},
			expectedStatus: http.StatusInternalServerError,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				assert.Empty(t, recorder.Body.String())
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			defer ctrl.Finish()

			router, recorder := setupTestGin()
			mockDao := NewMockDao(ctrl)

			handler := &Handler{dao: mockDao}

			if tt.mockSetup != nil {
				tt.mockSetup(mockDao)
			}

			router.GET("/account/:accountId/profile", func(c *gin.Context) {
				c.Set(common.AccountIdKey, tt.authenticatedAccountId)
				handler.GetAccountProfileHandler(c)
			})

			req := httptest.NewRequest("GET", "/account/"+tt.accountId+"/profile", nil)
			router.ServeHTTP(recorder, req)

			assert.Equal(t, tt.expectedStatus, recorder.Code)
			if tt.validateResponse != nil {
				tt.validateResponse(t, recorder)
			}
		})
	}
}

func TestCreateAccountHandler(t *testing.T) {
	tests := []struct {
		name             string
		firestoreUid     string
		requestBody      interface{}
		mockSetup        func(*MockDao)
		expectedStatus   int
		validateResponse func(*testing.T, *httptest.ResponseRecorder)
	}{
		{
			name:         "success - new account created with empty profile",
			firestoreUid: "firestore|new-user-id",
			requestBody:  map[string]interface{}{},
			mockSetup: func(mockDao *MockDao) {
				// First call to check if account exists (should return nil)
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|new-user-id").
					Return(nil, nil)
				// Second call to save the account
				mockDao.EXPECT().
					SaveAccount(gomock.Any(), gomock.Any()).
					DoAndReturn(func(ctx context.Context, account Account) error {
						if account.FirestoreUid != "firestore|new-user-id" ||
							account.Id == "" {
							t.Errorf("Invalid account: %+v", account)
						}
						return nil
					})
			},
			expectedStatus: http.StatusOK,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response Account
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.NotEmpty(t, response.Id)
				// Note: FirestoreUid should not be in JSON response due to json:"-" tag
			},
		},
		{
			name:         "success - new account created with complete profile data",
			firestoreUid: "firestore|new-user-with-profile",
			requestBody: map[string]interface{}{
				"name":           "John Doe",
				"given_name":     "John",
				"family_name":    "Doe",
				"nickname":       "johnny",
				"email":          "john.doe@example.com",
				"email_verified": true,
				"picture":        "https://example.com/avatar.jpg",
				"profile":        "https://example.com/profile/john",
			},
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|new-user-with-profile").
					Return(nil, nil)
				mockDao.EXPECT().
					SaveAccount(gomock.Any(), gomock.Any()).
					DoAndReturn(func(ctx context.Context, account Account) error {
						if account.FirestoreUid != "firestore|new-user-with-profile" ||
							account.Id == "" ||
							account.Name != "John Doe" ||
							account.GivenName != "John" ||
							account.FamilyName != "Doe" ||
							account.Nickname != "johnny" ||
							account.Email != "john.doe@example.com" ||
							account.EmailVerified == nil || *account.EmailVerified != true ||
							account.Picture != "https://example.com/avatar.jpg" ||
							account.Profile != "https://example.com/profile/john" {
							t.Errorf("Invalid account: %+v", account)
						}
						return nil
					})
			},
			expectedStatus: http.StatusOK,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response Account
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.NotEmpty(t, response.Id)
				assert.Equal(t, "John Doe", response.Name)
				assert.Equal(t, "John", response.GivenName)
				assert.Equal(t, "Doe", response.FamilyName)
				assert.Equal(t, "johnny", response.Nickname)
				assert.Equal(t, "john.doe@example.com", response.Email)
				assert.NotNil(t, response.EmailVerified)
				assert.True(t, *response.EmailVerified)
				assert.Equal(t, "https://example.com/avatar.jpg", response.Picture)
				assert.Equal(t, "https://example.com/profile/john", response.Profile)
			},
		},
		{
			name:         "success - new account created with partial profile data",
			firestoreUid: "firestore|partial-profile-user",
			requestBody: map[string]interface{}{
				"name":     "Jane Smith",
				"email":    "jane@example.com",
				"nickname": "jane",
			},
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|partial-profile-user").
					Return(nil, nil)
				mockDao.EXPECT().
					SaveAccount(gomock.Any(), gomock.Any()).
					DoAndReturn(func(ctx context.Context, account Account) error {
						if account.FirestoreUid != "firestore|partial-profile-user" ||
							account.Name != "Jane Smith" ||
							account.Email != "jane@example.com" ||
							account.Nickname != "jane" ||
							account.GivenName != "" ||
							account.FamilyName != "" ||
							account.EmailVerified != nil {
							t.Errorf("Invalid account: %+v", account)
						}
						return nil
					})
			},
			expectedStatus: http.StatusOK,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response Account
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "Jane Smith", response.Name)
				assert.Equal(t, "jane@example.com", response.Email)
				assert.Equal(t, "jane", response.Nickname)
				assert.Empty(t, response.GivenName)
				assert.Empty(t, response.FamilyName)
				assert.Nil(t, response.EmailVerified)
			},
		},
		{
			name:         "account already exists",
			firestoreUid: "firestore|existing-user-id",
			requestBody: map[string]interface{}{
				"organizations": []string{},
			},
			mockSetup: func(mockDao *MockDao) {
				existingAccount := createTestAccount()
				existingAccount.FirestoreUid = "firestore|existing-user-id"
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|existing-user-id").
					Return(existingAccount, nil)
			},
			expectedStatus: http.StatusBadRequest,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response string
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "Account already created.", response)
			},
		},
		{
			name:         "database error checking existing account",
			firestoreUid: "firestore|test-user-id",
			requestBody:  map[string]interface{}{},
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|test-user-id").
					Return(nil, errors.New("database connection failed"))
			},
			expectedStatus: http.StatusInternalServerError,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response string
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "Error Creating Account", response)
			},
		},
		{
			name:         "invalid request body",
			firestoreUid: "firestore|test-user-id",
			requestBody:  "invalid json",
			mockSetup: func(mockDao *MockDao) {
				// No DAO calls should be made for invalid JSON
			},
			expectedStatus: http.StatusBadRequest,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response string
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "Invalid profile data", response)
			},
		},
		{
			name:         "save account fails",
			firestoreUid: "firestore|test-user-id",
			requestBody:  map[string]interface{}{},
			mockSetup: func(mockDao *MockDao) {
				mockDao.EXPECT().
					GetAccountByFirestoreUid(gomock.Any(), "firestore|test-user-id").
					Return(nil, nil)
				mockDao.EXPECT().
					SaveAccount(gomock.Any(), gomock.Any()).
					Return(errors.New("database save failed"))
			},
			expectedStatus: http.StatusInternalServerError,
			validateResponse: func(t *testing.T, recorder *httptest.ResponseRecorder) {
				var response string
				err := json.Unmarshal(recorder.Body.Bytes(), &response)
				assert.NoError(t, err)
				assert.Equal(t, "Unable to create account", response)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			defer ctrl.Finish()

			router, recorder := setupTestGin()
			mockDao := NewMockDao(ctrl)

			handler := &Handler{dao: mockDao}

			if tt.mockSetup != nil {
				tt.mockSetup(mockDao)
			}

			router.POST("/account", func(c *gin.Context) {
				c.Set(common.FirestoreUidKey, tt.firestoreUid)
				handler.CreateAccountHandler(c)
			})

			var requestBody []byte
			var err error

			if str, ok := tt.requestBody.(string); ok {
				requestBody = []byte(str)
			} else {
				requestBody, err = json.Marshal(tt.requestBody)
				assert.NoError(t, err)
			}

			req := httptest.NewRequest("POST", "/account", bytes.NewBuffer(requestBody))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(recorder, req)

			assert.Equal(t, tt.expectedStatus, recorder.Code)
			if tt.validateResponse != nil {
				tt.validateResponse(t, recorder)
			}
		})
	}
}

func TestNewHandler(t *testing.T) {
	handler := NewHandler()
	assert.NotNil(t, handler)
	assert.NotNil(t, handler.dao)
}
