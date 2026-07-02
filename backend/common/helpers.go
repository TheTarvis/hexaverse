package common

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type TracingHook struct{}

// Run Logging hook that allows us to get custom stuff from the context
func (h TracingHook) Run(e *zerolog.Event, _ zerolog.Level, _ string) {
	ctx := e.GetCtx()

	if tracer, ok := ctx.Value(TracerKey).(string); ok {
		e.Str(TracerKey, tracer)
	}

	if firestoreUid, ok := ctx.Value(FirestoreUidKey).(string); ok {
		e.Str(FirestoreUidKey, firestoreUid)
	}

	if uid, ok := ctx.Value(AccountIdKey).(string); ok {
		e.Str(AccountIdKey, uid)
	}

}

// Ptr returns a pointer to whatever value you give it
func Ptr[T any](v T) *T {
	return &v
}

// UnixMilliToTime converts Unix milliseconds to time.Time.
// Used when deserializing timestamps from event payloads.
func UnixMilliToTime(ms int64) time.Time {
	return time.UnixMilli(ms)
}

// UnmarshalServiceConfig converts a map[string]interface{} service config into a typed struct.
// This is a generic helper to reduce boilerplate in subscription handlers where we need to
// marshal and unmarshal service configs.
func UnmarshalServiceConfig[T any](serviceConfig map[string]interface{}) (T, error) {
	var config T
	configBytes, err := json.Marshal(serviceConfig)
	if err != nil {
		return config, fmt.Errorf("failed to marshal service config: %w", err)
	}
	if err := json.Unmarshal(configBytes, &config); err != nil {
		return config, fmt.Errorf("failed to unmarshal service config: %w", err)
	}
	return config, nil
}

// ContextWithTraceFromEvent creates a new context with the traceId from the event envelope.
// This allows downstream events emitted during event handling to share the same trace.
// If the envelope has no traceId, generates a new one.
func ContextWithTraceFromEvent(ctx context.Context, envelope *EventEnvelope) context.Context {
	traceId := envelope.Metadata.TraceID
	if traceId == "" {
		traceId = uuid.New().String()
	}
	return context.WithValue(ctx, TracerKey, traceId)
}

// ContextWithNewTrace creates a new context with a freshly generated traceId.
// Use this when starting a new trace (e.g., scheduler-initiated operations).
func ContextWithNewTrace(ctx context.Context) context.Context {
	return context.WithValue(ctx, TracerKey, uuid.New().String())
}

// SubscriptionContext creates a new context for Pub/Sub subscription handlers.
// It detaches from the message context's deadline (which is tied to ack deadline)
// while preserving trace IDs and setting a generous timeout for GCP operations.
//
// Call this ONCE at the entry point of your subscription handler, then pass the
// returned context to all downstream operations. This avoids the need to sprinkle
// DetachedContext() calls throughout the service layer.
//
// Example:
//
//	func (h *Handler) handleEvent(ctx context.Context, msg *pubsub.Message) {
//	    ctx, cancel := common.SubscriptionContext(ctx)
//	    defer cancel()
//	    // Use ctx for all operations...
//	}
func SubscriptionContext(ctx context.Context) (context.Context, context.CancelFunc) {
	// Use 5 minutes timeout - generous enough for cold start credential fetching
	// and batch operations, but still bounded to prevent resource leaks
	return SubscriptionContextWithTimeout(ctx, 5*time.Minute)
}

// SubscriptionContextWithTimeout is like SubscriptionContext but with a custom timeout.
func SubscriptionContextWithTimeout(ctx context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	newCtx, cancel := context.WithTimeout(context.Background(), timeout)
	return detachContextValues(ctx, newCtx), cancel
}

// detachContextValues copies trace values from src to dst context.
func detachContextValues(src, dst context.Context) context.Context {
	// Preserve trace ID
	if tracer, ok := src.Value(TracerKey).(string); ok {
		dst = context.WithValue(dst, TracerKey, tracer)
	}

	// Preserve account ID
	if accountId, ok := src.Value(AccountIdKey).(string); ok {
		dst = context.WithValue(dst, AccountIdKey, accountId)
	}

	// Preserve Firestore UID
	if firestoreUid, ok := src.Value(FirestoreUidKey).(string); ok {
		dst = context.WithValue(dst, FirestoreUidKey, firestoreUid)
	}

	return dst
}

// RetryConfig configures the retry behavior
type RetryConfig struct {
	MaxAttempts  int
	InitialDelay time.Duration
	MaxDelay     time.Duration
	// ShouldRetry is an optional function to determine if an error is retryable.
	// If nil, all errors are considered retryable.
	ShouldRetry func(error) bool
}

// DefaultRetryConfig returns sensible defaults for retry behavior
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts:  5,
		InitialDelay: time.Second,
		MaxDelay:     30 * time.Second,
		ShouldRetry:  nil, // retry all errors by default
	}
}

// RetryWithBackoff retries an operation with exponential backoff.
// Returns nil on success, or the last error after all attempts are exhausted.
func RetryWithBackoff(config RetryConfig, operation func() error) error {
	return RetryWithBackoffContext(context.Background(), config, operation)
}

// RetryWithBackoffContext retries an operation with exponential backoff and context support.
// The operation will be cancelled if the context is cancelled.
func RetryWithBackoffContext(ctx context.Context, config RetryConfig, operation func() error) error {
	var lastErr error
	delay := config.InitialDelay

	for attempt := 1; attempt <= config.MaxAttempts; attempt++ {
		// Check context before attempting
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		err := operation()
		if err == nil {
			if attempt > 1 {
				log.Info().
					Int("attempt", attempt).
					Msg("Operation succeeded after retry")
			}
			return nil
		}

		lastErr = err

		// Check if we should retry this error
		if config.ShouldRetry != nil && !config.ShouldRetry(err) {
			return err
		}

		// Don't sleep after the last attempt
		if attempt < config.MaxAttempts {
			log.Warn().
				Err(err).
				Int("attempt", attempt).
				Int("maxAttempts", config.MaxAttempts).
				Dur("retryIn", delay).
				Msg("Operation failed, retrying...")

			// Sleep with context awareness
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}

			// Exponential backoff with cap
			delay *= 2
			if delay > config.MaxDelay {
				delay = config.MaxDelay
			}
		}
	}

	log.Error().
		Err(lastErr).
		Int("attempts", config.MaxAttempts).
		Msg("Operation failed after all retry attempts")

	return lastErr
}
