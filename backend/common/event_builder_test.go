package common

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewEvent(t *testing.T) {
	// Test with trace ID in context
	traceID := "test-trace-123"
	ctx := context.WithValue(context.Background(), TracerKey, traceID)

	event := NewEvent(ctx, "test.event").
		WithSource("test-service").
		WithTypedPayload(map[string]interface{}{
			"key": "value",
		}).
		Build()

	assert.Equal(t, "test.event", event.EventType)
	assert.Equal(t, "test-service", event.Source)
	assert.Equal(t, traceID, event.Metadata.TraceID)
	payload, ok := event.Payload.(map[string]interface{})
	assert.True(t, ok, "Payload should be a map[string]interface{}")
	assert.Equal(t, "value", payload["key"])
	assert.NotEmpty(t, event.EventID)
	assert.NotZero(t, event.Metadata.PublishedAt)
	assert.True(t, event.Metadata.PublishedAt.Before(time.Now().Add(time.Second)))
}

func TestNewEventWithoutTraceID(t *testing.T) {
	// Test without trace ID in context - should generate one
	ctx := context.Background()

	event := NewEvent(ctx, "test.event").
		WithSource("test-service").
		Build()

	assert.NotEmpty(t, event.Metadata.TraceID)
	assert.Equal(t, "test.event", event.EventType)
	assert.Equal(t, "test-service", event.Source)
}

func TestNewEventWithPayloadFields(t *testing.T) {
	// Test creating event with typed payload
	ctx := context.Background()
	event := NewEvent(ctx, "test.event").
		WithSource("test-service").
		WithTypedPayload(map[string]interface{}{
			"field1": "value1",
			"field2": 123,
		}).
		WithVersion("2.0").
		Build()

	assert.Equal(t, "test.event", event.EventType)
	assert.Equal(t, "test-service", event.Source)
	assert.Equal(t, "2.0", event.Version)
	assert.NotEmpty(t, event.Metadata.TraceID)
	payload, ok := event.Payload.(map[string]interface{})
	assert.True(t, ok, "Payload should be a map[string]interface{}")
	assert.Equal(t, "value1", payload["field1"])
	assert.Equal(t, 123, payload["field2"])
	assert.NotZero(t, event.Metadata.PublishedAt)
}

func TestEventBuilderDefaults(t *testing.T) {
	// Test that defaults are set properly
	ctx := context.Background()
	event := NewEvent(ctx, "test.event").Build()

	assert.Equal(t, "unknown", event.Source) // Default source
	assert.Equal(t, "1.0", event.Version)    // Default version
	assert.NotEmpty(t, event.EventID)
	assert.NotEmpty(t, event.Metadata.TraceID)
	assert.NotZero(t, event.Timestamp)
	assert.NotZero(t, event.Metadata.PublishedAt)
}

func TestEventBuilderWithAttributes(t *testing.T) {
	// Test adding individual attributes
	ctx := context.Background()
	event := NewEvent(ctx, "test.event").
		WithSource("test-service").
		WithAttribute("serviceName", "pubsub").
		WithAttribute("strategy", "streaming").
		Build()

	assert.Equal(t, "test.event", event.EventType)
	assert.Equal(t, "test-service", event.Source)
	assert.NotNil(t, event.Attributes)
	assert.Equal(t, "pubsub", event.Attributes["serviceName"])
	assert.Equal(t, "streaming", event.Attributes["strategy"])
}

func TestEventBuilderWithAttributesMap(t *testing.T) {
	// Test adding multiple attributes at once
	ctx := context.Background()
	attrs := map[string]string{
		"serviceName": "bigquery",
		"strategy":    "manual",
		"customKey":   "customValue",
	}

	event := NewEvent(ctx, "test.event").
		WithSource("test-service").
		WithAttributes(attrs).
		Build()

	assert.Equal(t, "test.event", event.EventType)
	assert.NotNil(t, event.Attributes)
	assert.Equal(t, "bigquery", event.Attributes["serviceName"])
	assert.Equal(t, "manual", event.Attributes["strategy"])
	assert.Equal(t, "customValue", event.Attributes["customKey"])
}

func TestEventBuilderWithMixedAttributes(t *testing.T) {
	// Test mixing individual and batch attribute addition
	ctx := context.Background()
	event := NewEvent(ctx, "test.event").
		WithSource("test-service").
		WithAttribute("key1", "value1").
		WithAttributes(map[string]string{
			"key2": "value2",
			"key3": "value3",
		}).
		WithAttribute("key4", "value4").
		Build()

	assert.NotNil(t, event.Attributes)
	assert.Equal(t, "value1", event.Attributes["key1"])
	assert.Equal(t, "value2", event.Attributes["key2"])
	assert.Equal(t, "value3", event.Attributes["key3"])
	assert.Equal(t, "value4", event.Attributes["key4"])
}
