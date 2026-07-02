package common

//go:generate mockgen -source=pubsub.go -destination=pubsub_mock.go -package=common PubSubInterface

import (
	"context"
	"{{PROJECT_SLUG}}/config"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"cloud.google.com/go/pubsub"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/option"
)

// Event types — abbreviated to stay within GCP Pub/Sub's 256-char filter limit.
// Pattern: entity.action. Per-domain constants are added by `/new-domain`.

// PubSub topics. Per-domain topics are added by `/new-domain`.

// EventEnvelope payload attribute keys.
const (
	EventType = "type"
	CreatedBy = "createdBy"
)

// Filter builder helpers for creating Pub/Sub subscription filters

// AttributeEquals creates a filter condition for an attribute
// Note: GCP Pub/Sub filter syntax requires double quotes for string literals
func AttributeEquals(key, value string) string {
	return fmt.Sprintf("attributes.%s = \"%s\"", key, value)
}

// PubSubFilterAnd joins multiple filter conditions with AND
func PubSubFilterAnd(conditions ...string) string {
	return strings.Join(conditions, " AND ")
}

// PubSubFilterOr joins multiple filter conditions with OR
func PubSubFilterOr(conditions ...string) string {
	return strings.Join(conditions, " OR ")
}

// PubSubInterface defines the interface for pub/sub operations
type PubSubInterface interface {
	Publish(topic string, data EventEnvelope) error
	PublishWithContext(ctx context.Context, topic string, data EventEnvelope) error
	Subscribe(topic string) *SubscriptionBuilder
	DeleteSubscription(ctx context.Context, subscriptionName string) error
	CreatePushSubscription(ctx context.Context, topicName, subName, filter, pushEndpoint string) error
}

// PubSubClient provides a simple API for pub/sub operations
type PubSubClient struct {
	client        *pubsub.Client
	projectID     string
	topics        map[string]*pubsub.Topic
	subscriptions map[string]*pubsub.Subscription
	mu            sync.RWMutex
}

var (
	pubsubClient PubSubInterface
	once         sync.Once
)

// PubSub returns the singleton PubSub client
func PubSub() PubSubInterface {
	once.Do(func() {
		initPubSub()
	})
	return pubsubClient
}

// initPubSub initializes the PubSub client
//
//goland:noinspection GoUnhandledErrorResult
func initPubSub() {

	ctx := context.Background()

	// Get configuration values
	projectID := config.ServiceConfig.GCPProjectID
	if projectID == "" {
		log.Fatal().Msg("GCP_PROJECT_ID is required for PubSub")
	}

	// Check for emulator configuration
	emulatorHost := config.ServiceConfig.PubSubEmulatorHost
	if emulatorHost != "" {
		// Set the environment variable for the Google Cloud client library
		os.Setenv("PUBSUB_EMULATOR_HOST", emulatorHost)
		log.Info().Str("host", emulatorHost).Msg("Using PubSub emulator")
	}

	// Configure gRPC connection pool to handle concurrent streaming receivers and admin API calls
	// Without this, all gRPC streams from Receive() can exhaust the default connection,
	// causing Exists() and other admin calls to timeout
	//
	// Also use shared GCP credentials to prevent credential refresh thundering herd
	// when many streaming pulls try to refresh tokens simultaneously.
	// See: https://github.com/googleapis/google-cloud-go/issues/6315
	clientOpts := []option.ClientOption{
		option.WithGRPCConnectionPool(25), // Handle 14 concurrent streaming receivers + admin calls
	}
	// Add shared credentials (unless using emulator)
	if emulatorHost == "" {
		clientOpts = append(clientOpts, GCPClientOptions()...)
	}
	client, err := pubsub.NewClient(ctx, projectID, clientOpts...)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create PubSub client")
	}

	pubsubClient = &PubSubClient{
		client:        client,
		projectID:     projectID,
		topics:        make(map[string]*pubsub.Topic),
		subscriptions: make(map[string]*pubsub.Subscription),
	}

	log.Info().Str("projectID", projectID).Msg("PubSub client initialized")

	// Pre-warm the gRPC connection by listing topics
	// This establishes the network connection early during startup,
	// preventing timeout errors when setting up subscriptions later
	go func() {
		warmupCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		log.Debug().Msg("Pre-warming PubSub gRPC connection...")
		it := client.Topics(warmupCtx)
		_, _ = it.Next() // Just trigger the connection, ignore result
		log.Debug().Msg("PubSub gRPC connection warmed up")
	}()
}

// Publish publishes a message to a topic
func (p *PubSubClient) Publish(topic string, data EventEnvelope) error {

	ctx := context.Background()
	t, err := p.getTopic(ctx, topic)
	if err != nil {
		return fmt.Errorf("failed to get topic %s: %w", topic, err)
	}

	bytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal data: %w", err)
	}

	result := t.Publish(ctx, &pubsub.Message{
		Data: bytes,
		Attributes: map[string]string{
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		},
	})

	msgID, err := result.Get(ctx)
	if err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}

	log.Debug().
		Str("topic", topic).
		Str("messageId", msgID).
		Msg("Message published to PubSub")

	return nil
}

// PublishWithContext publishes a message with a specific context
func (p *PubSubClient) PublishWithContext(ctx context.Context, topic string, data EventEnvelope) error {
	t, err := p.getTopic(ctx, topic)
	if err != nil {
		return fmt.Errorf("failed to get topic %s: %w", topic, err)
	}

	bytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal data: %w", err)
	}

	// Extract trace ID from context if available
	traceID := ""
	if tracer, ok := ctx.Value(TracerKey).(string); ok {
		traceID = tracer
	}

	// Start with default attributes
	attrs := map[string]string{
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	if traceID != "" {
		attrs["traceId"] = traceID
	}

	// Merge custom attributes from the event envelope
	// Custom attributes take precedence over defaults (except timestamp and traceId)
	if data.Attributes != nil {
		for k, v := range data.Attributes {
			attrs[k] = v
		}
	}

	result := t.Publish(ctx, &pubsub.Message{
		Data:       bytes,
		Attributes: attrs,
	})

	msgID, err := result.Get(ctx)
	if err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("topic", topic).
			Msg("Failed to publish message")
		return fmt.Errorf("failed to publish message: %w", err)
	}

	log.Debug().
		Ctx(ctx).
		Str("topic", topic).
		Str("messageId", msgID).
		Str("traceId", traceID).
		Msg("Message published to PubSub")

	return nil
}

// Subscribe returns a subscription builder for the topic
func (p *PubSubClient) Subscribe(topic string) *SubscriptionBuilder {
	return &SubscriptionBuilder{
		topic:  topic,
		client: p,
	}
}

// SubscriptionBuilder builds a subscription configuration
type SubscriptionBuilder struct {
	topic            string
	client           *PubSubClient
	subscriptionName string
	filter           string
	ackDeadline      time.Duration
}

// WithName sets a custom subscription name
func (s *SubscriptionBuilder) WithName(name string) *SubscriptionBuilder {
	s.subscriptionName = name
	return s
}

// WithFilter adds a filter to the subscription
func (s *SubscriptionBuilder) WithFilter(filter string) *SubscriptionBuilder {
	s.filter = filter
	return s
}

// WithAckDeadline sets the acknowledgment deadline
func (s *SubscriptionBuilder) WithAckDeadline(deadline time.Duration) *SubscriptionBuilder {
	s.ackDeadline = deadline
	return s
}

// CreatePushSubscription creates a push subscription on the emulator (or GCP) that
// delivers messages via HTTP POST to the given endpoint. No pull goroutines are started.
// In production, Terraform manages subscriptions — this is only called locally.
func (p *PubSubClient) CreatePushSubscription(ctx context.Context, topicName, subName, filter, pushEndpoint string) error {
	// No lock needed — called serially during local startup only.

	topic, err := p.getTopic(ctx, topicName)
	if err != nil {
		return fmt.Errorf("failed to get topic %s: %w", topicName, err)
	}

	// Delete existing subscription for fresh state (emulator can have stale state)
	sub := p.client.Subscription(subName)
	exists, _ := sub.Exists(ctx)
	if exists {
		if err := sub.Delete(ctx); err != nil {
			log.Warn().Err(err).Str("subscription", subName).Msg("Failed to delete existing push subscription")
		}
	}

	cfg := pubsub.SubscriptionConfig{
		Topic:       topic,
		AckDeadline: 30 * time.Second,
		PushConfig: pubsub.PushConfig{
			Endpoint: pushEndpoint,
		},
		RetryPolicy: &pubsub.RetryPolicy{
			MinimumBackoff: 10 * time.Second,
			MaximumBackoff: 60 * time.Second,
		},
	}

	// Emulator doesn't support filters — in-memory filtering not needed for push
	// because each subscription has its own dedicated push endpoint.
	// Production filters are set in Terraform.
	// Note: If the emulator gains filter support in the future, add cfg.Filter = filter here.
	_ = filter

	_, err = p.client.CreateSubscription(ctx, subName, cfg)
	if err != nil {
		return fmt.Errorf("failed to create push subscription %s: %w", subName, err)
	}

	log.Info().
		Str("subscription", subName).
		Str("topic", topicName).
		Str("pushEndpoint", pushEndpoint).
		Msg("Created push subscription")

	return nil
}

// Handle starts receiving messages with the given handler
func (s *SubscriptionBuilder) Handle(handler func(context.Context, *pubsub.Message)) error {
	ctx := context.Background()
	sub, err := s.client.getOrCreateSubscription(ctx, s.topic, s.subscriptionName, s.filter, s.ackDeadline)
	if err != nil {
		return fmt.Errorf("failed to get subscription: %w", err)
	}

	// Configure receive settings
	sub.ReceiveSettings.MaxOutstandingMessages = 100
	sub.ReceiveSettings.NumGoroutines = 10

	log.Info().
		Str("topic", s.topic).
		Str("subscription", sub.ID()).
		Msg("Starting to receive messages")

	// Wrap handler with in-memory filtering for emulator
	wrappedHandler := s.wrapHandlerWithEmulatorFilter(handler, s.filter)

	// This blocks until context is cancelled or an error occurs
	return sub.Receive(ctx, func(ctx context.Context, msg *pubsub.Message) {
		wrappedHandler(ctx, msg)
		msg.Ack()
	})
}

// HandleAsync starts receiving messages in a goroutine
func (s *SubscriptionBuilder) HandleAsync(handler func(context.Context, *pubsub.Message)) error {
	ctx := context.Background()
	sub, err := s.client.getOrCreateSubscription(ctx, s.topic, s.subscriptionName, s.filter, s.ackDeadline)
	if err != nil {
		return fmt.Errorf("failed to get subscription: %w", err)
	}

	// Configure receive settings
	sub.ReceiveSettings.MaxOutstandingMessages = 100
	sub.ReceiveSettings.NumGoroutines = 10

	log.Info().
		Str("topic", s.topic).
		Str("subscription", sub.ID()).
		Msg("Starting async message receiver")

	// Wrap handler with in-memory filtering for emulator
	wrappedHandler := s.wrapHandlerWithEmulatorFilter(handler, s.filter)

	// Start receiving in a goroutine with retry for transient auth errors
	go func() {
		subID := sub.ID()

		// Configure retry for transient authentication errors (common during cold start)
		retryConfig := RetryConfig{
			MaxAttempts:  5,
			InitialDelay: time.Second,
			MaxDelay:     30 * time.Second,
			ShouldRetry: func(err error) bool {
				errStr := err.Error()
				return strings.Contains(errStr, "Unauthenticated") ||
					strings.Contains(errStr, "authentication credentials")
			},
		}

		err := RetryWithBackoffContext(ctx, retryConfig, func() error {
			return sub.Receive(ctx, func(ctx context.Context, msg *pubsub.Message) {
				wrappedHandler(ctx, msg)
				msg.Ack()
			})
		})

		if err != nil && !errors.Is(err, context.Canceled) {
			log.Error().
				Err(err).
				Str("subscription", subID).
				Msg("Error receiving messages")
		}
	}()

	return nil
}

// HandleWithManualAck starts receiving messages with manual acknowledgment control
// The handler is responsible for calling msg.Ack() or msg.Nack() on each message
func (s *SubscriptionBuilder) HandleWithManualAck(ctx context.Context, handler func(context.Context, *pubsub.Message)) error {
	sub, err := s.client.getOrCreateSubscription(ctx, s.topic, s.subscriptionName, s.filter, s.ackDeadline)
	if err != nil {
		return fmt.Errorf("failed to get subscription: %w", err)
	}

	// Configure receive settings
	sub.ReceiveSettings.MaxOutstandingMessages = 100
	sub.ReceiveSettings.NumGoroutines = 10

	log.Info().
		Str("topic", s.topic).
		Str("subscription", sub.ID()).
		Msg("Starting to receive messages with manual ack")

	// Wrap handler with in-memory filtering for emulator
	wrappedHandler := s.wrapHandlerWithEmulatorFilterManualAck(handler, s.filter)

	// This blocks until context is cancelled or an error occurs
	// Handler must manually ack/nack messages
	return sub.Receive(ctx, wrappedHandler)
}

// HandleAsyncWithManualAck starts receiving messages in a goroutine with manual acknowledgment control
// The handler is responsible for calling msg.Ack() or msg.Nack() on each message
func (s *SubscriptionBuilder) HandleAsyncWithManualAck(ctx context.Context, handler func(context.Context, *pubsub.Message)) error {
	sub, err := s.client.getOrCreateSubscription(ctx, s.topic, s.subscriptionName, s.filter, s.ackDeadline)
	if err != nil {
		return fmt.Errorf("failed to get subscription: %w", err)
	}

	// Configure receive settings
	sub.ReceiveSettings.MaxOutstandingMessages = 100
	sub.ReceiveSettings.NumGoroutines = 10

	log.Info().
		Str("topic", s.topic).
		Str("subscription", sub.ID()).
		Msg("Starting async message receiver with manual ack")

	// Wrap handler with in-memory filtering for emulator
	wrappedHandler := s.wrapHandlerWithEmulatorFilterManualAck(handler, s.filter)

	// Start receiving in a goroutine with retry for transient auth errors
	// Handler must manually ack/nack messages
	go func() {
		subID := sub.ID()

		// Configure retry for transient authentication errors (common during cold start)
		retryConfig := RetryConfig{
			MaxAttempts:  5,
			InitialDelay: time.Second,
			MaxDelay:     30 * time.Second,
			ShouldRetry: func(err error) bool {
				errStr := err.Error()
				return strings.Contains(errStr, "Unauthenticated") ||
					strings.Contains(errStr, "authentication credentials")
			},
		}

		err := RetryWithBackoffContext(ctx, retryConfig, func() error {
			return sub.Receive(ctx, wrappedHandler)
		})

		if err != nil && !errors.Is(err, context.Canceled) {
			log.Error().
				Err(err).
				Str("subscription", subID).
				Msg("Error receiving messages")
		}
	}()

	return nil
}

// getTopic gets or creates a topic
func (p *PubSubClient) getTopic(ctx context.Context, topicName string) (*pubsub.Topic, error) {
	startTime := time.Now().UTC()

	p.mu.Lock()
	defer p.mu.Unlock()

	// Check cache
	if topic, exists := p.topics[topicName]; exists {
		log.Debug().
			Str("topic", topicName).
			Msg("Topic found in cache")
		return topic, nil
	}

	log.Debug().
		Str("topic", topicName).
		Msg("Topic not in cache, checking existence...")

	// Get or create topic
	topic := p.client.Topic(topicName)
	existsCheckStart := time.Now().UTC()
	exists, err := topic.Exists(ctx)
	if err != nil {
		log.Error().
			Err(err).
			Str("topic", topicName).
			Dur("existsCheckDuration", time.Since(existsCheckStart)).
			Msg("Failed to check topic existence")
		return nil, fmt.Errorf("failed to check topic existence: %w", err)
	}

	log.Debug().
		Str("topic", topicName).
		Bool("exists", exists).
		Dur("existsCheckDuration", time.Since(existsCheckStart)).
		Msg("Topic existence check completed")

	if !exists {
		createStart := time.Now().UTC()
		topic, err = p.client.CreateTopic(ctx, topicName)
		if err != nil {
			log.Error().
				Err(err).
				Str("topic", topicName).
				Dur("createDuration", time.Since(createStart)).
				Msg("Failed to create topic")
			return nil, fmt.Errorf("failed to create topic: %w", err)
		}
		log.Info().
			Str("topic", topicName).
			Dur("createDuration", time.Since(createStart)).
			Msg("Created new PubSub topic")
	}

	// Configure publish settings for better throughput
	// These settings allow async publishing with batching
	topic.PublishSettings = pubsub.PublishSettings{
		NumGoroutines:  10,                     // Concurrent publish workers
		CountThreshold: 100,                    // Batch up to 100 messages
		ByteThreshold:  1e6,                    // Or 1MB
		DelayThreshold: 100 * time.Millisecond, // Max 100ms delay for batching
		Timeout:        60 * time.Second,       // Overall publish timeout
		FlowControlSettings: pubsub.FlowControlSettings{
			MaxOutstandingBytes: 10e6, // Buffer up to 10MB
		},
	}

	// Cache the topic
	p.topics[topicName] = topic
	log.Debug().
		Str("topic", topicName).
		Dur("totalDuration", time.Since(startTime)).
		Msg("Topic ready")
	return topic, nil
}

// getOrCreateSubscription gets or creates a subscription
func (p *PubSubClient) getOrCreateSubscription(ctx context.Context, topicName string, subName string, filter string, ackDeadline time.Duration) (*pubsub.Subscription, error) {
	startTime := time.Now().UTC()

	p.mu.Lock()
	defer p.mu.Unlock()

	// Generate subscription name if not provided
	if subName == "" {
		subName = fmt.Sprintf("%s-subscription", topicName)
	}

	log.Debug().
		Str("subscription", subName).
		Str("topic", topicName).
		Msg("Getting or creating subscription...")

	// Check cache
	cacheKey := fmt.Sprintf("%s:%s", topicName, subName)
	if sub, exists := p.subscriptions[cacheKey]; exists {
		log.Debug().
			Str("subscription", subName).
			Dur("elapsed", time.Since(startTime)).
			Msg("Subscription found in cache")
		return sub, nil
	}

	// Get topic first (unlock during topic creation to avoid deadlock)
	p.mu.Unlock()
	topicStartTime := time.Now().UTC()
	topic, err := p.getTopic(ctx, topicName)
	p.mu.Lock()
	if err != nil {
		log.Error().
			Err(err).
			Str("topic", topicName).
			Dur("elapsed", time.Since(topicStartTime)).
			Msg("Failed to get topic")
		return nil, err
	}
	log.Debug().
		Str("topic", topicName).
		Dur("elapsed", time.Since(topicStartTime)).
		Msg("Topic retrieved successfully")

	// Get or create subscription with retry for transient GCP errors during cold start
	sub := p.client.Subscription(subName)

	var exists bool
	var attempt int
	// Aggressive retry config for cold start resilience:
	// - 10 attempts with exponential backoff from 2s to 30s
	// - Covers ~3 minutes total which handles most cold start scenarios
	retryConfig := RetryConfig{
		MaxAttempts:  10,
		InitialDelay: 2 * time.Second,
		MaxDelay:     30 * time.Second,
		ShouldRetry: func(err error) bool {
			errStr := err.Error()
			// Retry on transient GCP errors common during cold start
			return strings.Contains(errStr, "DeadlineExceeded") ||
				strings.Contains(errStr, "context deadline exceeded") ||
				strings.Contains(errStr, "Unavailable") ||
				strings.Contains(errStr, "Internal") ||
				strings.Contains(errStr, "connection") ||
				strings.Contains(errStr, "transport")
		},
	}

	existsCheckStart := time.Now().UTC()
	err = RetryWithBackoff(retryConfig, func() error {
		attempt++
		attemptStart := time.Now().UTC()
		var checkErr error
		exists, checkErr = sub.Exists(ctx)
		if checkErr != nil {
			log.Warn().
				Err(checkErr).
				Str("subscription", subName).
				Int("attempt", attempt).
				Dur("attemptDuration", time.Since(attemptStart)).
				Msg("Subscription existence check failed")
		} else {
			log.Debug().
				Str("subscription", subName).
				Int("attempt", attempt).
				Bool("exists", exists).
				Dur("attemptDuration", time.Since(attemptStart)).
				Msg("Subscription existence check succeeded")
		}
		return checkErr
	})

	// WORKAROUND: For the emulator, delete and recreate subscriptions to ensure fresh state.
	// The emulator can have stale subscription state where subscriptions exist but don't receive
	// messages. This is different from the production filter drift detection below - in production,
	// we check if the filter changed; in emulator, filters aren't supported (we use in-memory
	// filtering via wrapHandlerWithEmulatorFilter instead), so we just ensure fresh state.
	// See: https://github.com/googleapis/google-cloud-go/issues/pubsub-emulator-stale-subscriptions
	if exists && os.Getenv("PUBSUB_EMULATOR_HOST") != "" {
		log.Debug().
			Str("subscription", subName).
			Msg("Emulator detected: recreating subscription for fresh state")
		if deleteErr := sub.Delete(ctx); deleteErr != nil {
			log.Warn().
				Err(deleteErr).
				Str("subscription", subName).
				Msg("Failed to delete subscription for recreation")
		} else {
			exists = false
		}
	}
	if err != nil {
		log.Error().
			Err(err).
			Str("subscription", subName).
			Int("totalAttempts", attempt).
			Dur("totalDuration", time.Since(existsCheckStart)).
			Msg("Failed to check subscription existence after all retries")
		return nil, fmt.Errorf("failed to check subscription existence: %w", err)
	}

	// Check for filter drift (only in production, not emulator)
	// If the subscription exists but has a different filter than expected, recreate it
	if exists && filter != "" && os.Getenv("PUBSUB_EMULATOR_HOST") == "" {
		cfg, cfgErr := sub.Config(ctx)
		if cfgErr != nil {
			// Config fetch failed - might be a transient error or subscription was deleted
			// Log warning but continue, we'll try to use/create the subscription anyway
			log.Warn().
				Err(cfgErr).
				Str("subscription", subName).
				Msg("Failed to get subscription config for filter check - continuing anyway")
		} else if cfg.Filter != filter {
			log.Warn().
				Str("subscription", subName).
				Str("currentFilter", cfg.Filter).
				Str("expectedFilter", filter).
				Msg("Subscription filter mismatch detected - recreating subscription")

			// Delete the subscription
			deleteErr := sub.Delete(ctx)
			if deleteErr != nil {
				// Check if it's a "not found" error (already deleted by another instance)
				errStr := deleteErr.Error()
				if strings.Contains(errStr, "NotFound") || strings.Contains(errStr, "not found") {
					log.Info().
						Str("subscription", subName).
						Msg("Subscription already deleted (possibly by another instance)")
				} else {
					// Log error but don't fail - continue to try creating/using the subscription
					log.Error().
						Err(deleteErr).
						Str("subscription", subName).
						Msg("Failed to delete subscription with stale filter - will attempt to continue")
				}
			} else {
				log.Info().
					Str("subscription", subName).
					Msg("Deleted subscription with stale filter")
			}

			// Mark as not existing so it gets recreated below
			exists = false
		}
	}

	if !exists {
		// Configure subscription
		cfg := pubsub.SubscriptionConfig{
			Topic:       topic,
			AckDeadline: 30 * time.Second, // Default
			RetryPolicy: &pubsub.RetryPolicy{
				MinimumBackoff: 10 * time.Second,
				MaximumBackoff: 60 * time.Second,
			},
		}

		// Override ack deadline if provided
		if ackDeadline > 0 {
			cfg.AckDeadline = ackDeadline
		}

		// Add filter if provided (but not for emulator, which doesn't support filters)
		// The emulator uses in-memory filtering via wrapHandlerWithEmulatorFilter instead
		if filter != "" && os.Getenv("PUBSUB_EMULATOR_HOST") == "" {
			cfg.Filter = filter
		}

		createStart := time.Now().UTC()
		sub, err = p.client.CreateSubscription(ctx, subName, cfg)
		if err != nil {
			log.Error().
				Err(err).
				Str("subscription", subName).
				Str("topic", topicName).
				Dur("createDuration", time.Since(createStart)).
				Msg("Failed to create subscription")
			return nil, fmt.Errorf("failed to create subscription: %w", err)
		}

		log.Info().
			Str("subscription", subName).
			Str("topic", topicName).
			Str("filter", filter).
			Dur("createDuration", time.Since(createStart)).
			Msg("Created new PubSub subscription")
	}

	// Cache the subscription
	p.subscriptions[cacheKey] = sub

	log.Info().
		Str("subscription", subName).
		Str("topic", topicName).
		Bool("existed", exists).
		Int("existsCheckAttempts", attempt).
		Dur("totalDuration", time.Since(startTime)).
		Msg("Subscription ready")

	return sub, nil
}

// DeleteSubscription deletes a subscription by name
func (p *PubSubClient) DeleteSubscription(ctx context.Context, subscriptionName string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Get subscription
	sub := p.client.Subscription(subscriptionName)

	// Delete subscription
	if err := sub.Delete(ctx); err != nil {
		// Check if it's a "not found" error
		if strings.Contains(err.Error(), "NotFound") || strings.Contains(err.Error(), "not found") {
			// Already deleted, treat as success
			log.Debug().Str("subscription", subscriptionName).Msg("Subscription already deleted")
			return nil
		}
		return fmt.Errorf("failed to delete subscription: %w", err)
	}

	// Remove from cache
	for key := range p.subscriptions {
		if strings.HasSuffix(key, ":"+subscriptionName) {
			delete(p.subscriptions, key)
			break
		}
	}

	log.Info().Str("subscription", subscriptionName).Msg("Deleted PubSub subscription")
	return nil
}

// wrapHandlerWithEmulatorFilter wraps a handler with in-memory filtering for the emulator
// This is necessary because the Firebase Pub/Sub emulator doesn't support subscription filters
func (s *SubscriptionBuilder) wrapHandlerWithEmulatorFilter(
	handler func(context.Context, *pubsub.Message),
	filter string,
) func(context.Context, *pubsub.Message) {
	// If no filter or not using emulator, return original handler
	if filter == "" || config.ServiceConfig.PubSubEmulatorHost == "" {
		return handler
	}

	log.Info().
		Str("filter", filter).
		Msg("Emulator detected: Applying in-memory filter for subscription")

	// Parse the filter expression once
	filterConditions := parseFilterExpression(filter)

	// Capture subscription name for logging
	subscriptionName := s.subscriptionName

	// Return wrapped handler
	return func(ctx context.Context, msg *pubsub.Message) {
		// Evaluate filter against message attributes
		if evaluateFilter(filterConditions, msg.Attributes) {
			// Filter matches, call the handler
			log.Debug().
				Str("messageId", msg.ID).
				Str("subscription", subscriptionName).
				Msg("In-memory filter: message matched")
			handler(ctx, msg)
		}
		// Silently skip messages that don't match the filter
	}
}

// filterCondition represents a single filter condition
type filterCondition struct {
	key   string
	value string
}

// parseFilterExpression parses a GCP Pub/Sub filter expression
// Example: "attributes.type = \"pipeline.run\" AND attributes.serviceName = \"firestore\""
func parseFilterExpression(filter string) [][]filterCondition {
	// Split by OR first (lower precedence)
	orClauses := strings.Split(filter, " OR ")

	result := make([][]filterCondition, 0, len(orClauses))

	for _, orClause := range orClauses {
		// Split by AND (higher precedence)
		andConditions := strings.Split(strings.TrimSpace(orClause), " AND ")

		conditions := make([]filterCondition, 0, len(andConditions))

		for _, condition := range andConditions {
			condition = strings.TrimSpace(condition)

			// Parse: attributes.key = 'value'
			parts := strings.Split(condition, "=")
			if len(parts) != 2 {
				continue
			}

			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])

			// Remove "attributes." prefix
			key = strings.TrimPrefix(key, "attributes.")

			// Remove quotes from value
			value = strings.Trim(value, "'\"")

			conditions = append(conditions, filterCondition{
				key:   key,
				value: value,
			})
		}

		if len(conditions) > 0 {
			result = append(result, conditions)
		}
	}

	return result
}

// wrapHandlerWithEmulatorFilterManualAck wraps a manual-ack handler with in-memory filtering
// For manual ack handlers, filtered messages are automatically Nack'd
func (s *SubscriptionBuilder) wrapHandlerWithEmulatorFilterManualAck(
	handler func(context.Context, *pubsub.Message),
	filter string,
) func(context.Context, *pubsub.Message) {
	// If no filter or not using emulator, return original handler
	if filter == "" || config.ServiceConfig.PubSubEmulatorHost == "" {
		return handler
	}

	log.Info().
		Str("filter", filter).
		Msg("Emulator detected: Applying in-memory filter for manual-ack subscription")

	// Parse the filter expression once
	filterConditions := parseFilterExpression(filter)

	// Capture subscription name for logging
	subscriptionName := s.subscriptionName

	// Return wrapped handler
	return func(ctx context.Context, msg *pubsub.Message) {
		// Evaluate filter against message attributes
		if evaluateFilter(filterConditions, msg.Attributes) {
			// Filter matches, call the handler (handler must ack/nack)
			handler(ctx, msg)
		} else {
			// Filter doesn't match, nack this message
			log.Debug().
				Str("messageId", msg.ID).
				Str("subscription", subscriptionName).
				Msg("Message filtered out by in-memory filter (nacking)")
			msg.Nack()
		}
	}
}

// evaluateFilter evaluates filter conditions against message attributes
// Returns true if any OR clause matches (each OR clause requires all AND conditions to match)
func evaluateFilter(orClauses [][]filterCondition, attributes map[string]string) bool {
	if len(orClauses) == 0 {
		return true // No filter means match all
	}

	// Check each OR clause
	for _, andConditions := range orClauses {
		allMatch := true

		// All AND conditions must match
		for _, condition := range andConditions {
			attrValue, exists := attributes[condition.key]
			if !exists || attrValue != condition.value {
				allMatch = false
				break
			}
		}

		// If all AND conditions matched, the filter passes
		if allMatch {
			return true
		}
	}

	return false
}

// Close closes the PubSub client
func (p *PubSubClient) Close() error {
	if p.client != nil {
		return p.client.Close()
	}
	return nil
}

// ResetPubSubForTesting resets the singleton for testing purposes
// This allows tests to re-initialize the client with different configurations
// IMPORTANT: Only use this in tests, never in production code
func ResetPubSubForTesting() {
	once = sync.Once{}
	pubsubClient = nil
}
