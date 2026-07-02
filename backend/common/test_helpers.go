package common

import (
	"encoding/json"
	"time"

	"cloud.google.com/go/pubsub"
	"github.com/google/uuid"
)

// CreateTestEventEnvelope creates an EventEnvelope for testing
func CreateTestEventEnvelope(eventType string, payload map[string]interface{}) *EventEnvelope {
	return &EventEnvelope{
		EventID:   uuid.New().String(),
		EventType: eventType,
		Source:    "test-source",
		Timestamp: time.Now().UTC(),
		Payload:   payload,
		Version:   "1.0",
		Metadata: EventMetadata{
			TraceID:     "test-trace-id",
			PublishedAt: time.Now().UTC(),
		},
	}
}

// CreateTestPubSubMessage creates a Pub/Sub message with an EventEnvelope for testing
func CreateTestPubSubMessage(eventType string, payload map[string]interface{}) *pubsub.Message {
	envelope := CreateTestEventEnvelope(eventType, payload)
	data, _ := json.Marshal(envelope)
	return &pubsub.Message{
		Data: data,
	}
}
