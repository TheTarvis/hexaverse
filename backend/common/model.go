package common

import (
	"encoding/json"
	"fmt"
	"time"
)

// EventMetadata contains standard metadata for all events
type EventMetadata struct {
	TraceID     string    `json:"traceId"`     // From x-tracer header or generated UUID
	PublishedAt time.Time `json:"publishedAt"` // When sent to Pub/Sub (UTC)
}

// EventEnvelope represents a system event
type EventEnvelope struct {
	EventID   string      `json:"eventId"`
	EventType string      `json:"eventType"`
	Source    string      `json:"source"`
	Timestamp time.Time   `json:"timestamp"`
	Payload   interface{} `json:"payload"`
	Version   string      `json:"version"`

	Metadata EventMetadata `json:"metadata"`

	// Optional Pub/Sub message attributes for filtering.
	// Set as message attributes, not part of the JSON payload.
	Attributes map[string]string `json:"-"`
}

// UnmarshalPayload unmarshals the event payload into a typed struct
// for type-safe access without manual type assertions.
func (e *EventEnvelope) UnmarshalPayload(target interface{}) error {
	payloadBytes, err := json.Marshal(e.Payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	if err := json.Unmarshal(payloadBytes, target); err != nil {
		return fmt.Errorf("failed to unmarshal payload into target type: %w", err)
	}

	return nil
}
