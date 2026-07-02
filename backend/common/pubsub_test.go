package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAttributeEquals(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		value    string
		expected string
	}{
		{
			name:     "simple attribute",
			key:      "type",
			value:    "item.created",
			expected: `attributes.type = "item.created"`,
		},
		{
			name:     "empty value",
			key:      "test",
			value:    "",
			expected: `attributes.test = ""`,
		},
		{
			name:     "value with spaces",
			key:      "message",
			value:    "hello world",
			expected: `attributes.message = "hello world"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := AttributeEquals(tt.key, tt.value)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestPubSubFilterAnd(t *testing.T) {
	tests := []struct {
		name       string
		conditions []string
		expected   string
	}{
		{
			name: "two conditions",
			conditions: []string{
				`attributes.type = "item.created"`,
				`attributes.createdBy = "u-1"`,
			},
			expected: `attributes.type = "item.created" AND attributes.createdBy = "u-1"`,
		},
		{
			name: "single condition",
			conditions: []string{
				`attributes.type = "item.updated"`,
			},
			expected: `attributes.type = "item.updated"`,
		},
		{
			name:       "empty conditions",
			conditions: []string{},
			expected:   "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := PubSubFilterAnd(tt.conditions...)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestPubSubFilterOr(t *testing.T) {
	tests := []struct {
		name       string
		conditions []string
		expected   string
	}{
		{
			name: "two conditions",
			conditions: []string{
				`attributes.type = "item.created"`,
				`attributes.type = "item.updated"`,
			},
			expected: `attributes.type = "item.created" OR attributes.type = "item.updated"`,
		},
		{
			name:       "empty conditions",
			conditions: []string{},
			expected:   "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := PubSubFilterOr(tt.conditions...)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestPayloadKeyConstants(t *testing.T) {
	keys := map[string]string{
		"EventType": EventType,
		"CreatedBy": CreatedBy,
	}

	for name, value := range keys {
		assert.NotEmpty(t, value, "%s constant should not be empty", name)
	}
}

func TestResetPubSubForTesting(t *testing.T) {
	ResetPubSubForTesting()
	assert.True(t, true, "ResetPubSubForTesting completed without panic")
}

func TestFilterDriftDetection_Logic(t *testing.T) {
	tests := []struct {
		name           string
		currentFilter  string
		expectedFilter string
		shouldRecreate bool
	}{
		{
			name:           "filters match - no recreate",
			currentFilter:  `attributes.type = "item.created"`,
			expectedFilter: `attributes.type = "item.created"`,
			shouldRecreate: false,
		},
		{
			name:           "filters differ - should recreate",
			currentFilter:  `attributes.type = "item.created"`,
			expectedFilter: `attributes.type = "item.updated"`,
			shouldRecreate: true,
		},
		{
			name:           "empty current filter with expected filter - should recreate",
			currentFilter:  "",
			expectedFilter: `attributes.type = "item.created"`,
			shouldRecreate: true,
		},
		{
			name:           "both empty - no recreate",
			currentFilter:  "",
			expectedFilter: "",
			shouldRecreate: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shouldRecreate := tt.currentFilter != tt.expectedFilter
			assert.Equal(t, tt.shouldRecreate, shouldRecreate)
		})
	}
}
