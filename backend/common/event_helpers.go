package common

import (
	"encoding/json"

	"cloud.google.com/go/pubsub"
	"github.com/rs/zerolog/log"
)

// UnmarshalEventEnvelope unmarshals a Pub/Sub message into an EventEnvelope
func UnmarshalEventEnvelope(msg *pubsub.Message) (*EventEnvelope, error) {
	var envelope EventEnvelope
	if err := json.Unmarshal(msg.Data, &envelope); err != nil {
		log.Error().Err(err).Msg("Failed to unmarshal event envelope")
		return nil, err
	}
	return &envelope, nil
}
