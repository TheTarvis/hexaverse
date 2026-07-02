package common

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// EventBuilder provides a fluent interface for building events
type EventBuilder struct {
	event EventEnvelope
}

// NewEvent creates an event builder with trace ID from context
// Follows the same pattern as common/helpers.go for extracting tracer
func NewEvent(ctx context.Context, eventType string) *EventBuilder {
	event := EventEnvelope{
		EventID:   uuid.New().String(),
		EventType: eventType,
		Timestamp: time.Now().UTC(),
		Version:   "1.0",
		Payload:   make(map[string]interface{}),
	}

	// Extract trace ID from context using same pattern as TracingHook
	traceID := ""
	if tracer, ok := ctx.Value(TracerKey).(string); ok {
		traceID = tracer
	}
	if traceID == "" {
		// Generate new trace ID if not in context
		traceID = uuid.New().String()
	}

	// Pre-populate metadata with trace ID (publishedAt will be set in Build())
	event.Metadata = EventMetadata{
		TraceID: traceID,
	}

	return &EventBuilder{event: event}
}

// WithSource sets the event source
func (b *EventBuilder) WithSource(source string) *EventBuilder {
	b.event.Source = source
	return b
}

// WithTypedPayload sets the event payload from a typed struct
// The struct will be marshalled to map[string]interface{} via JSON
func (b *EventBuilder) WithTypedPayload(payload interface{}) *EventBuilder {
	b.event.Payload = payload
	return b
}

// WithVersion sets the event version
func (b *EventBuilder) WithVersion(version string) *EventBuilder {
	b.event.Version = version
	return b
}

// WithTimestamp sets the event timestamp (when the event occurred)
func (b *EventBuilder) WithTimestamp(timestamp time.Time) *EventBuilder {
	b.event.Timestamp = timestamp
	return b
}

// WithAttribute adds a single Pub/Sub message attribute for filtering
func (b *EventBuilder) WithAttribute(key string, value string) *EventBuilder {
	if b.event.Attributes == nil {
		b.event.Attributes = make(map[string]string)
	}
	b.event.Attributes[key] = value
	return b
}

// WithAttributes sets multiple Pub/Sub message attributes at once
func (b *EventBuilder) WithAttributes(attrs map[string]string) *EventBuilder {
	if b.event.Attributes == nil {
		b.event.Attributes = make(map[string]string)
	}
	for k, v := range attrs {
		b.event.Attributes[k] = v
	}
	return b
}

// Build finalizes the event and sets publishedAt
func (b *EventBuilder) Build() EventEnvelope {
	// Always set publishedAt to current UTC time when building
	b.event.Metadata.PublishedAt = time.Now().UTC()

	// Ensure required fields have defaults
	if b.event.Source == "" {
		b.event.Source = "unknown"
	}
	if b.event.Version == "" {
		b.event.Version = "1.0"
	}

	// If payload is a struct (not already a map), convert it to map[string]interface{}
	// This handles the case where WithTypedPayload was used
	if b.event.Payload != nil {
		if _, isMap := b.event.Payload.(map[string]interface{}); !isMap {
			// Convert struct to map via JSON marshalling
			payloadMap, err := convertToMap(b.event.Payload)
			if err != nil {
				// Log error but don't fail - keep the original payload
				// This will be caught later during publish
			} else {
				b.event.Payload = payloadMap
			}
		}
	}

	// Automatically populate Pub/Sub message attributes for filtering
	// This enables subscription filters to work without manually setting attributes
	if b.event.Attributes == nil {
		b.event.Attributes = make(map[string]string)
	}

	// Always set eventType as an attribute for filtering
	if b.event.EventType != "" {
		b.event.Attributes[EventType] = b.event.EventType
	}

	// Copy common payload fields to attributes for filtering.
	// Add field names here as your project introduces filter-worthy attributes.
	commonFilterFields := []string{}

	// Safely extract attributes from payload map
	if payloadMap, ok := b.event.Payload.(map[string]interface{}); ok {
		for _, field := range commonFilterFields {
			if val, ok := payloadMap[field].(string); ok && val != "" {
				b.event.Attributes[field] = val
			}
		}
	}

	return b.event
}

// convertToMap converts a struct to map[string]interface{} using JSON marshalling
// This is used to convert typed payloads to the standard payload format
func convertToMap(payload interface{}) (map[string]interface{}, error) {
	// Marshal to JSON
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	// Unmarshal back to map
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}

	return result, nil
}
