package account

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAccount(t *testing.T) {
	accountId := "test-account-id"
	account := NewAccount(accountId)

	assert.Equal(t, accountId, account.Id)
	assert.Empty(t, account.FirestoreUid)
	assert.False(t, account.IsAdmin)
	assert.Empty(t, account.Name)
	assert.Empty(t, account.Email)
	assert.False(t, account.CreatedAt.IsZero())
}

func TestAccountModel(t *testing.T) {
	emailVerified := true
	account := Account{
		Id:            "account-123",
		FirestoreUid:  "firestore|user-456",
		IsAdmin:       true,
		Name:          "John Doe",
		GivenName:     "John",
		FamilyName:    "Doe",
		Nickname:      "johnny",
		Email:         "john@example.com",
		EmailVerified: &emailVerified,
		Picture:       "https://example.com/photo.jpg",
		Profile:       "https://example.com/profile",
	}

	assert.Equal(t, "account-123", account.Id)
	assert.Equal(t, "firestore|user-456", account.FirestoreUid)
	assert.True(t, account.IsAdmin)
	assert.Equal(t, "John Doe", account.Name)
	assert.Equal(t, "John", account.GivenName)
	assert.Equal(t, "Doe", account.FamilyName)
	assert.Equal(t, "johnny", account.Nickname)
	assert.Equal(t, "john@example.com", account.Email)
	require := assert.NotNil(t, account.EmailVerified)
	if require {
		assert.True(t, *account.EmailVerified)
	}
	assert.Equal(t, "https://example.com/photo.jpg", account.Picture)
	assert.Equal(t, "https://example.com/profile", account.Profile)
}

func TestAccountProfileModel(t *testing.T) {
	profile := AccountProfile{
		Id:      "account-123",
		Name:    "Jane Doe",
		Email:   "jane@example.com",
		Picture: "https://example.com/jane.jpg",
	}

	assert.Equal(t, "account-123", profile.Id)
	assert.Equal(t, "Jane Doe", profile.Name)
	assert.Equal(t, "jane@example.com", profile.Email)
	assert.Equal(t, "https://example.com/jane.jpg", profile.Picture)
}

func TestToProfile(t *testing.T) {
	tests := []struct {
		name     string
		account  Account
		expected AccountProfile
	}{
		{
			name: "full account",
			account: Account{
				Id:           "account-123",
				FirestoreUid: "firestore|user-456",
				IsAdmin:      true,
				Name:         "John Doe",
				Email:        "john@example.com",
				Picture:      "https://example.com/photo.jpg",
			},
			expected: AccountProfile{
				Id:      "account-123",
				Name:    "John Doe",
				Email:   "john@example.com",
				Picture: "https://example.com/photo.jpg",
			},
		},
		{
			name: "minimal account",
			account: Account{
				Id: "account-456",
			},
			expected: AccountProfile{
				Id: "account-456",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile := tt.account.ToProfile()

			assert.Equal(t, tt.expected.Id, profile.Id)
			assert.Equal(t, tt.expected.Name, profile.Name)
			assert.Equal(t, tt.expected.Email, profile.Email)
			assert.Equal(t, tt.expected.Picture, profile.Picture)
		})
	}
}
