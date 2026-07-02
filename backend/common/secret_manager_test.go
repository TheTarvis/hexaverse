package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsFullResourcePath(t *testing.T) {
	tests := []struct {
		name     string
		ref      string
		expected bool
	}{
		{
			name:     "full path with projects prefix",
			ref:      "projects/255694242424/secrets/conn-abc123/versions/1",
			expected: true,
		},
		{
			name:     "full path with leading slash",
			ref:      "/projects/my-project/secrets/my-secret/versions/latest",
			expected: true,
		},
		{
			name:     "just secret ID",
			ref:      "conn-abc123",
			expected: false,
		},
		{
			name:     "oauth app secret ID",
			ref:      "oauth-app-xyz789",
			expected: false,
		},
		{
			name:     "empty string",
			ref:      "",
			expected: false,
		},
		{
			name:     "firestore prefix",
			ref:      "firestore://secret/conn-abc123",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isFullResourcePath(tt.ref)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestExtractSecretID(t *testing.T) {
	tests := []struct {
		name       string
		secretRef  string
		expectedID string
	}{
		{
			name:       "extracts from full path with numeric project",
			secretRef:  "projects/255694242424/secrets/conn-abc123/versions/1",
			expectedID: "conn-abc123",
		},
		{
			name:       "extracts from full path with string project",
			secretRef:  "projects/flywheel-etl-prod/secrets/oauth-app-xyz/versions/latest",
			expectedID: "oauth-app-xyz",
		},
		{
			name:       "extracts from path with leading slash",
			secretRef:  "/projects/my-project/secrets/my-secret/versions/2",
			expectedID: "my-secret",
		},
		{
			name:       "returns plain secret ID unchanged",
			secretRef:  "org-1__connection__abc123",
			expectedID: "org-1__connection__abc123",
		},
		{
			name:       "returns oauth secret ID unchanged",
			secretRef:  "org-1__oauth_tokens__conn-456",
			expectedID: "org-1__oauth_tokens__conn-456",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractSecretID(tt.secretRef)
			assert.Equal(t, tt.expectedID, result)
		})
	}
}

func TestParseResourceName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected map[string]string
	}{
		{
			name:  "full resource path",
			input: "projects/my-project/secrets/my-secret/versions/latest",
			expected: map[string]string{
				"projects": "my-project",
				"secrets":  "my-secret",
				"versions": "latest",
			},
		},
		{
			name:  "path with leading slash",
			input: "/projects/my-project/secrets/my-secret/versions/1",
			expected: map[string]string{
				"projects": "my-project",
				"secrets":  "my-secret",
				"versions": "1",
			},
		},
		{
			name:  "numeric project ID",
			input: "projects/255694242424/secrets/conn-abc123/versions/1",
			expected: map[string]string{
				"projects": "255694242424",
				"secrets":  "conn-abc123",
				"versions": "1",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseResourceName(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestBugfix_FullResourcePathNotRecognized verifies the fix for the bug where
// secret references starting with "projects/" (without leading slash) were not
// recognized as full resource paths, causing double-wrapping like:
// projects/flywheel-etl-prod/secrets/projects/255694242424/secrets/conn-xxx/versions/1/versions/latest
func TestBugfix_FullResourcePathNotRecognized(t *testing.T) {
	// This is the exact format returned by GCP Secret Manager's AddSecretVersion
	// Note: uses numeric project ID, no leading slash
	storedRef := "projects/255694242424/secrets/conn-b7c24ee9-2d05-4835-8ee1-8a417452d5af/versions/1"

	// Before fix: isFullResourcePath would return false (only checked for leading "/")
	// After fix: isFullResourcePath returns true (also checks for "projects/" prefix)
	assert.True(t, isFullResourcePath(storedRef),
		"should recognize 'projects/...' as a full resource path")

	// Verify we can extract the secret ID correctly
	secretID := extractSecretID(storedRef)
	assert.Equal(t, "conn-b7c24ee9-2d05-4835-8ee1-8a417452d5af", secretID,
		"should extract the secret ID from the full resource path")
}
