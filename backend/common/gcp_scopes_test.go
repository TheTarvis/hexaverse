package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUserGCPScopes(t *testing.T) {
	// Verify scopes are defined
	assert.NotEmpty(t, UserGCPScopes, "UserGCPScopes should not be empty")

	// Verify expected scopes are present
	expectedScopes := []string{
		"https://www.googleapis.com/auth/bigquery",
		"https://www.googleapis.com/auth/pubsub",
		"https://www.googleapis.com/auth/datastore",
		"https://www.googleapis.com/auth/devstorage.full_control",
		"https://www.googleapis.com/auth/cloudplatformprojects.readonly",
		"https://www.googleapis.com/auth/firebase.readonly",
	}

	for _, scope := range expectedScopes {
		assert.Contains(t, UserGCPScopes, scope, "UserGCPScopes should contain %s", scope)
	}
}

func TestUserGCPScopesWithIdentity(t *testing.T) {
	scopes := UserGCPScopesWithIdentity()

	// Verify identity scopes are present
	assert.Contains(t, scopes, "openid", "Should contain openid scope")
	assert.Contains(t, scopes, "email", "Should contain email scope")
	assert.Contains(t, scopes, "profile", "Should contain profile scope")

	// Verify all base scopes are also present
	for _, scope := range UserGCPScopes {
		assert.Contains(t, scopes, scope, "Should contain base scope %s", scope)
	}

	// Verify identity scopes come first
	assert.Equal(t, "openid", scopes[0], "openid should be first")
	assert.Equal(t, "email", scopes[1], "email should be second")
	assert.Equal(t, "profile", scopes[2], "profile should be third")
}
