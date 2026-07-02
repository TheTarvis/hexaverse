package common

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Test struct for payload unmarshaling
type TestPayload struct {
	StringField string  `json:"stringField"`
	IntField    int     `json:"intField"`
	FloatField  float64 `json:"floatField"`
	BoolField   bool    `json:"boolField"`
}

func TestEventEnvelope_UnmarshalPayload_Success(t *testing.T) {
	envelope := EventEnvelope{
		EventID:   "event-123",
		EventType: "test.event",
		Source:    "test-service",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"stringField": "test value",
			"intField":    float64(42), // JSON unmarshals numbers as float64
			"floatField":  3.14,
			"boolField":   true,
		},
		Version: "1.0",
	}

	var payload TestPayload
	err := envelope.UnmarshalPayload(&payload)

	require.NoError(t, err)
	assert.Equal(t, "test value", payload.StringField)
	assert.Equal(t, 42, payload.IntField)
	assert.Equal(t, 3.14, payload.FloatField)
	assert.True(t, payload.BoolField)
}

func TestEventEnvelope_UnmarshalPayload_EmptyPayload(t *testing.T) {
	envelope := EventEnvelope{
		EventID:   "event-123",
		EventType: "test.event",
		Source:    "test-service",
		Timestamp: time.Now(),
		Payload:   map[string]interface{}{},
		Version:   "1.0",
	}

	var payload TestPayload
	err := envelope.UnmarshalPayload(&payload)

	require.NoError(t, err)
	assert.Equal(t, "", payload.StringField)
	assert.Equal(t, 0, payload.IntField)
	assert.Equal(t, 0.0, payload.FloatField)
	assert.False(t, payload.BoolField)
}

func TestEventEnvelope_UnmarshalPayload_PartialData(t *testing.T) {
	envelope := EventEnvelope{
		EventID:   "event-123",
		EventType: "test.event",
		Source:    "test-service",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"stringField": "partial",
			"intField":    float64(99),
		},
		Version: "1.0",
	}

	var payload TestPayload
	err := envelope.UnmarshalPayload(&payload)

	require.NoError(t, err)
	assert.Equal(t, "partial", payload.StringField)
	assert.Equal(t, 99, payload.IntField)
	assert.Equal(t, 0.0, payload.FloatField)
	assert.False(t, payload.BoolField)
}

func TestEventEnvelope_UnmarshalPayload_TypeMismatch(t *testing.T) {
	envelope := EventEnvelope{
		EventID:   "event-123",
		EventType: "test.event",
		Source:    "test-service",
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"stringField": 123, // Wrong type
			"intField":    "not a number",
		},
		Version: "1.0",
	}

	var payload TestPayload
	err := envelope.UnmarshalPayload(&payload)

	// Should return error for type mismatches
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to unmarshal payload into target type")
}
