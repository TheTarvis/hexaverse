package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseFilterExpression(t *testing.T) {
	tests := []struct {
		name     string
		filter   string
		expected [][]filterCondition
	}{
		{
			name:   "Single condition",
			filter: `attributes.type = "pipeline.run"`,
			expected: [][]filterCondition{
				{
					{key: "type", value: "pipeline.run"},
				},
			},
		},
		{
			name:   "AND conditions",
			filter: `attributes.type = "pipeline.run" AND attributes.serviceName = "firestore"`,
			expected: [][]filterCondition{
				{
					{key: "type", value: "pipeline.run"},
					{key: "serviceName", value: "firestore"},
				},
			},
		},
		{
			name:   "OR conditions",
			filter: `attributes.type = "pipeline.run" OR attributes.type = "pipeline.node"`,
			expected: [][]filterCondition{
				{
					{key: "type", value: "pipeline.run"},
				},
				{
					{key: "type", value: "pipeline.node"},
				},
			},
		},
		{
			name:   "Complex filter with AND and OR",
			filter: `attributes.type = "pipeline.run" AND attributes.serviceName = "firestore" OR attributes.type = "pipeline.node" AND attributes.serviceName = "bigquery"`,
			expected: [][]filterCondition{
				{
					{key: "type", value: "pipeline.run"},
					{key: "serviceName", value: "firestore"},
				},
				{
					{key: "type", value: "pipeline.node"},
					{key: "serviceName", value: "bigquery"},
				},
			},
		},
		{
			name:     "Empty filter",
			filter:   "",
			expected: [][]filterCondition{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseFilterExpression(tt.filter)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestEvaluateFilter(t *testing.T) {
	tests := []struct {
		name       string
		filter     string
		attributes map[string]string
		expected   bool
	}{
		{
			name:   "Single condition - matches",
			filter: `attributes.type = "pipeline.run"`,
			attributes: map[string]string{
				"type": "pipeline.run",
			},
			expected: true,
		},
		{
			name:   "Single condition - no match",
			filter: `attributes.type = "pipeline.run"`,
			attributes: map[string]string{
				"type": "pipeline.node",
			},
			expected: false,
		},
		{
			name:   "AND conditions - all match",
			filter: `attributes.type = "pipeline.run" AND attributes.serviceName = "firestore"`,
			attributes: map[string]string{
				"type":        "pipeline.run",
				"serviceName": "firestore",
			},
			expected: true,
		},
		{
			name:   "AND conditions - partial match",
			filter: `attributes.type = "pipeline.run" AND attributes.serviceName = "firestore"`,
			attributes: map[string]string{
				"type":        "pipeline.run",
				"serviceName": "bigquery",
			},
			expected: false,
		},
		{
			name:   "AND conditions - missing attribute",
			filter: `attributes.type = "pipeline.run" AND attributes.serviceName = "firestore"`,
			attributes: map[string]string{
				"type": "pipeline.run",
			},
			expected: false,
		},
		{
			name:   "OR conditions - first matches",
			filter: `attributes.type = "pipeline.run" OR attributes.type = "pipeline.node"`,
			attributes: map[string]string{
				"type": "pipeline.run",
			},
			expected: true,
		},
		{
			name:   "OR conditions - second matches",
			filter: `attributes.type = "pipeline.run" OR attributes.type = "pipeline.node"`,
			attributes: map[string]string{
				"type": "pipeline.node",
			},
			expected: true,
		},
		{
			name:   "OR conditions - no match",
			filter: `attributes.type = "pipeline.run" OR attributes.type = "pipeline.node"`,
			attributes: map[string]string{
				"type": "schema.updated",
			},
			expected: false,
		},
		{
			name:   "Complex filter - first OR clause matches",
			filter: `attributes.type = "pipeline.run" AND attributes.serviceName = "firestore" OR attributes.type = "pipeline.node" AND attributes.serviceName = "bigquery"`,
			attributes: map[string]string{
				"type":        "pipeline.run",
				"serviceName": "firestore",
			},
			expected: true,
		},
		{
			name:   "Complex filter - second OR clause matches",
			filter: `attributes.type = "pipeline.run" AND attributes.serviceName = "firestore" OR attributes.type = "pipeline.node" AND attributes.serviceName = "bigquery"`,
			attributes: map[string]string{
				"type":        "pipeline.node",
				"serviceName": "bigquery",
			},
			expected: true,
		},
		{
			name:   "Complex filter - no match",
			filter: `attributes.type = "pipeline.run" AND attributes.serviceName = "firestore" OR attributes.type = "pipeline.node" AND attributes.serviceName = "bigquery"`,
			attributes: map[string]string{
				"type":        "pipeline.run",
				"serviceName": "bigquery",
			},
			expected: false,
		},
		{
			name:       "Empty filter - matches all",
			filter:     "",
			attributes: map[string]string{},
			expected:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			filterConditions := parseFilterExpression(tt.filter)
			result := evaluateFilter(filterConditions, tt.attributes)
			assert.Equal(t, tt.expected, result)
		})
	}
}
