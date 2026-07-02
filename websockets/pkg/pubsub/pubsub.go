package pubsub

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"cloud.google.com/go/pubsub"
	"github.com/rs/zerolog/log"

	"websockets/pkg/config"
	"websockets/pkg/websocket"
)

// Service handles Pub/Sub operations
type Service struct {
	client *pubsub.Client
	config *config.Config
	hub    *websocket.Hub
	sub    *pubsub.Subscription
}

// NewService creates a new Pub/Sub service
func NewService(cfg *config.Config) (*Service, error) {
	if cfg.PubSubProjectID == "" || cfg.PubSubTopicID == "" {
		return nil, fmt.Errorf("missing required Pub/Sub configuration")
	}

	ctx := context.Background()
	client, err := pubsub.NewClient(ctx, cfg.PubSubProjectID)
	if err != nil {
		return nil, fmt.Errorf("failed to create pubsub client: %w", err)
	}

	return &Service{
		client: client,
		config: cfg,
	}, nil
}

// NewEmulatorService creates a new Pub/Sub service using the emulator
func NewEmulatorService(cfg *config.Config) (*Service, error) {
	if cfg.PubSubProjectID == "" || cfg.PubSubTopicID == "" {
		return nil, fmt.Errorf("missing required Pub/Sub configuration")
	}

	if cfg.PubSubEmulatorHost == "" {
		return nil, fmt.Errorf("PubSub emulator host not configured")
	}

	log.Debug().
		Str("emulatorHost", cfg.PubSubEmulatorHost).
		Msg("Using Pub/Sub emulator")

	os.Setenv("PUBSUB_EMULATOR_HOST", cfg.PubSubEmulatorHost)

	ctx := context.Background()
	client, err := pubsub.NewClient(ctx, cfg.PubSubProjectID)
	if err != nil {
		return nil, fmt.Errorf("failed to create pubsub client: %w", err)
	}

	return &Service{
		client: client,
		config: cfg,
	}, nil
}

// Setup initializes the Pub/Sub topic and subscription
func (s *Service) Setup(ctx context.Context, hub *websocket.Hub) error {
	s.hub = hub

	// Check if topic exists, create it if using emulator
	topic := s.client.Topic(s.config.PubSubTopicID)
	exists, err := topic.Exists(ctx)
	if err != nil {
		return fmt.Errorf("failed to check if topic exists: %w", err)
	}

	// Create the topic if it doesn't exist and we're using the emulator
	if !exists {
		if s.config.PubSubEmulatorHost != "" {
			log.Debug().
				Str("topic", s.config.PubSubTopicID).
				Msg("Creating PubSub topic on emulator")
			topic, err = s.client.CreateTopic(ctx, s.config.PubSubTopicID)
			if err != nil {
				return fmt.Errorf("failed to create pubsub topic: %w", err)
			}
		} else {
			return fmt.Errorf("pubsub topic %s does not exist", s.config.PubSubTopicID)
		}
	}

	// Create a consistent subscription name for this server
	subID := fmt.Sprintf("websocket-server-%s", s.config.PubSubTopicID)

	// Check if subscription exists
	sub := s.client.Subscription(subID)
	exists, err = sub.Exists(ctx)
	if err != nil {
		return fmt.Errorf("failed to check if subscription exists: %w", err)
	}

	// Create subscription if it doesn't exist
	if !exists {
		sub, err = s.client.CreateSubscription(ctx, subID, pubsub.SubscriptionConfig{
			Topic:            topic,
			AckDeadline:      20 * time.Second,
			ExpirationPolicy: 24 * time.Hour,
		})
		if err != nil {
			return fmt.Errorf("failed to create subscription: %w", err)
		}
		log.Info().
			Str("subscription", subID).
			Msg("Created new Pub/Sub subscription")

		// Seek to current time to start receiving only new messages
		if err := sub.SeekToTime(ctx, time.Now()); err != nil {
			log.Warn().
				Str("subscription", subID).
				Err(err).
				Msg("Failed to seek to current time, subscription will receive existing messages")
		}
	} else {
		log.Info().
			Str("subscription", subID).
			Msg("Using existing Pub/Sub subscription")
	}

	s.sub = sub
	log.Info().
		Str("topic", s.config.PubSubTopicID).
		Msg("Pub/Sub setup complete")
	return nil
}

// ReceiveMessages starts receiving messages from the subscription
func (s *Service) ReceiveMessages(ctx context.Context, hub *websocket.Hub) error {
	if s.sub == nil {
		return fmt.Errorf("subscription not initialized, call Setup first")
	}

	s.hub = hub

	log.Info().
		Str("topic", s.config.PubSubTopicID).
		Msg("Starting to receive messages")

	return s.sub.Receive(ctx, func(ctx context.Context, msg *pubsub.Message) {
		log.Info().
			RawJSON("message", msg.Data).
			Msg("Received PubSub message")

		// First parse the raw JSON to identify message type and extract fields
		var rawMsg map[string]interface{}
		if err := json.Unmarshal(msg.Data, &rawMsg); err != nil {
			log.Error().
				Ctx(ctx).
				Err(err).
				Str("data", string(msg.Data)).
				Msg("Error parsing pubsub message as JSON")
			msg.Ack()
			return
		}

		// Extract message type
		msgType, _ := rawMsg["type"].(string)
		if msgType == "" {
			log.Debug().Msg("Message has no type field")
			msgType = "unknown"
		}

		// Check message scope from attributes
		scope, ok := msg.Attributes["scope"]
		if !ok {
			log.Warn().Msg("Message has no scope attribute, treating as broadcast")
			scope = "broadcast"
		}

		// Create websocket message with the entire payload
		wsMessage := websocket.Message{
			Type:    msgType,
			Payload: rawMsg, // Use the entire raw message as payload
		}

		if scope == "broadcast" {
			// Broadcast message to all clients
			log.Debug().
				Str("type", wsMessage.Type).
				Msg("Broadcasting message")
			s.hub.Broadcast(&wsMessage)
			log.Debug().Msg("Message broadcasted to all connected clients")
		} else if scope == "direct" {
			// Handle direct message
			recipientID, ok := msg.Attributes["recipientId"]
			if !ok {
				log.Error().Msg("Direct message has no recipientId attribute, discarding")
				msg.Ack()
				return
			}

			log.Warn().
				Str("recipientId", recipientID).
				Str("type", wsMessage.Type).
				Msg("Received direct message")

			// Check if recipient is connected and send message
			clientCount := s.hub.GetConnectedClientsCount()
			sent := s.hub.SendToUser(recipientID, &wsMessage)

			if sent {
				log.Debug().
					Str("recipientId", recipientID).
					Msg("Direct message delivered")
			} else {
				log.Warn().
					Str("recipientId", recipientID).
					Int("totalClients", clientCount).
					Msg("Recipient not connected")
			}
		} else {
			log.Warn().
				Str("scope", scope).
				Msg("Unknown message scope, treating as broadcast")
			s.hub.Broadcast(&wsMessage)
		}

		msg.Ack()
	})
}

// PublishMessage publishes a message to the configured Pub/Sub topic
func (s *Service) PublishMessage(ctx context.Context, message websocket.Message) (string, error) {
	// Get the topic
	topic := s.client.Topic(s.config.PubSubTopicID)
	exists, err := topic.Exists(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to check if topic exists: %v", err)
	}

	// Create the topic if it doesn't exist and we're using the emulator
	if !exists {
		if s.config.PubSubEmulatorHost != "" {
			log.Debug().
				Str("topic", s.config.PubSubTopicID).
				Msg("Creating topic in emulator")
			topic, err = s.client.CreateTopic(ctx, s.config.PubSubTopicID)
			if err != nil {
				return "", fmt.Errorf("failed to create topic: %v", err)
			}
		} else {
			return "", fmt.Errorf("pubsub topic %s does not exist", s.config.PubSubTopicID)
		}
	}

	// Publish the message
	data, err := json.Marshal(message)
	if err != nil {
		return "", fmt.Errorf("failed to marshal message: %v", err)
	}

	result := topic.Publish(ctx, &pubsub.Message{
		Data: data,
	})

	// Get the server ID
	id, err := result.Get(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to publish message: %v", err)
	}

	log.Debug().
		Str("topic", s.config.PubSubTopicID).
		Str("messageId", id).
		Msg("Successfully published message")
	return id, nil
}

// Cleanup cleans up the Pub/Sub subscription
func (s *Service) Cleanup(ctx context.Context) error {
	if s.sub != nil {
		if err := s.sub.Delete(ctx); err != nil {
			return fmt.Errorf("error deleting subscription: %w", err)
		}
		log.Info().Msg("Pub/Sub subscription deleted")
	}
	return nil
}
