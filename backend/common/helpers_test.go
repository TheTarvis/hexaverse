package common

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPtr(t *testing.T) {
	t.Run("returns pointer to string", func(t *testing.T) {
		s := "hello"
		p := Ptr(s)
		assert.Equal(t, &s, p)
		assert.Equal(t, "hello", *p)
	})

	t.Run("returns pointer to int", func(t *testing.T) {
		i := 42
		p := Ptr(i)
		assert.Equal(t, 42, *p)
	})

	t.Run("returns pointer to bool", func(t *testing.T) {
		b := true
		p := Ptr(b)
		assert.True(t, *p)
	})

	t.Run("returns pointer to struct", func(t *testing.T) {
		type testStruct struct {
			Name string
		}
		s := testStruct{Name: "test"}
		p := Ptr(s)
		assert.Equal(t, "test", p.Name)
	})
}

func TestContextWithTraceFromEvent(t *testing.T) {
	t.Run("uses trace from envelope when present", func(t *testing.T) {
		ctx := context.Background()
		envelope := &EventEnvelope{
			Metadata: EventMetadata{
				TraceID: "existing-trace-id",
			},
		}

		newCtx := ContextWithTraceFromEvent(ctx, envelope)

		traceID, ok := newCtx.Value(TracerKey).(string)
		assert.True(t, ok)
		assert.Equal(t, "existing-trace-id", traceID)
	})

	t.Run("generates new trace when envelope has empty traceId", func(t *testing.T) {
		ctx := context.Background()
		envelope := &EventEnvelope{
			Metadata: EventMetadata{
				TraceID: "",
			},
		}

		newCtx := ContextWithTraceFromEvent(ctx, envelope)

		traceID, ok := newCtx.Value(TracerKey).(string)
		assert.True(t, ok)
		assert.NotEmpty(t, traceID)
		// UUID format check (36 chars with hyphens)
		assert.Len(t, traceID, 36)
	})
}

func TestContextWithNewTrace(t *testing.T) {
	t.Run("generates new trace id", func(t *testing.T) {
		ctx := context.Background()

		newCtx := ContextWithNewTrace(ctx)

		traceID, ok := newCtx.Value(TracerKey).(string)
		assert.True(t, ok)
		assert.NotEmpty(t, traceID)
		assert.Len(t, traceID, 36) // UUID format
	})

	t.Run("generates unique traces on each call", func(t *testing.T) {
		ctx := context.Background()

		ctx1 := ContextWithNewTrace(ctx)
		ctx2 := ContextWithNewTrace(ctx)

		trace1 := ctx1.Value(TracerKey).(string)
		trace2 := ctx2.Value(TracerKey).(string)

		assert.NotEqual(t, trace1, trace2)
	})
}

func TestTracingHook(t *testing.T) {
	t.Run("adds tracer to log event", func(t *testing.T) {
		var buf bytes.Buffer
		logger := zerolog.New(&buf).Hook(TracingHook{})

		ctx := context.WithValue(context.Background(), TracerKey, "test-trace-id")
		logger.Info().Ctx(ctx).Msg("test message")

		output := buf.String()
		assert.Contains(t, output, "x-tracer")
		assert.Contains(t, output, "test-trace-id")
	})

	t.Run("adds firestore uid to log event", func(t *testing.T) {
		var buf bytes.Buffer
		logger := zerolog.New(&buf).Hook(TracingHook{})

		ctx := context.WithValue(context.Background(), FirestoreUidKey, "firestore-uid-123")
		logger.Info().Ctx(ctx).Msg("test message")

		output := buf.String()
		assert.Contains(t, output, "x-firestore-uid")
		assert.Contains(t, output, "firestore-uid-123")
	})

	t.Run("adds account id to log event", func(t *testing.T) {
		var buf bytes.Buffer
		logger := zerolog.New(&buf).Hook(TracingHook{})

		ctx := context.WithValue(context.Background(), AccountIdKey, "account-456")
		logger.Info().Ctx(ctx).Msg("test message")

		output := buf.String()
		assert.Contains(t, output, "x-uid")
		assert.Contains(t, output, "account-456")
	})

	t.Run("adds all context values when present", func(t *testing.T) {
		var buf bytes.Buffer
		logger := zerolog.New(&buf).Hook(TracingHook{})

		ctx := context.Background()
		ctx = context.WithValue(ctx, TracerKey, "trace-all")
		ctx = context.WithValue(ctx, FirestoreUidKey, "fs-all")
		ctx = context.WithValue(ctx, AccountIdKey, "acc-all")

		logger.Info().Ctx(ctx).Msg("test message")

		output := buf.String()
		assert.Contains(t, output, "trace-all")
		assert.Contains(t, output, "fs-all")
		assert.Contains(t, output, "acc-all")
	})

	t.Run("handles missing context values gracefully", func(t *testing.T) {
		var buf bytes.Buffer
		logger := zerolog.New(&buf).Hook(TracingHook{})

		ctx := context.Background()
		logger.Info().Ctx(ctx).Msg("test message")

		output := buf.String()
		// Should still produce valid JSON without the context keys
		assert.Contains(t, output, "test message")
		assert.NotContains(t, output, "x-tracer")
	})
}

func TestRetryWithBackoff(t *testing.T) {
	t.Run("succeeds on first attempt", func(t *testing.T) {
		attempts := 0
		config := RetryConfig{
			MaxAttempts:  3,
			InitialDelay: 10 * time.Millisecond,
			MaxDelay:     100 * time.Millisecond,
		}

		err := RetryWithBackoff(config, func() error {
			attempts++
			return nil
		})

		require.NoError(t, err)
		assert.Equal(t, 1, attempts)
	})

	t.Run("retries on failure and succeeds", func(t *testing.T) {
		attempts := 0
		config := RetryConfig{
			MaxAttempts:  5,
			InitialDelay: 10 * time.Millisecond,
			MaxDelay:     100 * time.Millisecond,
		}

		err := RetryWithBackoff(config, func() error {
			attempts++
			if attempts < 3 {
				return errors.New("transient error")
			}
			return nil
		})

		require.NoError(t, err)
		assert.Equal(t, 3, attempts)
	})

	t.Run("fails after max attempts", func(t *testing.T) {
		attempts := 0
		config := RetryConfig{
			MaxAttempts:  3,
			InitialDelay: 10 * time.Millisecond,
			MaxDelay:     100 * time.Millisecond,
		}

		err := RetryWithBackoff(config, func() error {
			attempts++
			return errors.New("persistent error")
		})

		require.Error(t, err)
		assert.Equal(t, 3, attempts)
		assert.Contains(t, err.Error(), "persistent error")
	})

	t.Run("respects ShouldRetry function", func(t *testing.T) {
		attempts := 0
		config := RetryConfig{
			MaxAttempts:  5,
			InitialDelay: 10 * time.Millisecond,
			MaxDelay:     100 * time.Millisecond,
			ShouldRetry: func(err error) bool {
				return err.Error() == "retryable"
			},
		}

		err := RetryWithBackoff(config, func() error {
			attempts++
			return errors.New("non-retryable")
		})

		require.Error(t, err)
		assert.Equal(t, 1, attempts) // Should not retry
	})

	t.Run("respects context cancellation", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		attempts := 0
		config := RetryConfig{
			MaxAttempts:  10,
			InitialDelay: 100 * time.Millisecond,
			MaxDelay:     1 * time.Second,
		}

		// Cancel after first attempt
		go func() {
			time.Sleep(50 * time.Millisecond)
			cancel()
		}()

		err := RetryWithBackoffContext(ctx, config, func() error {
			attempts++
			return errors.New("error")
		})

		require.Error(t, err)
		assert.True(t, errors.Is(err, context.Canceled))
		assert.LessOrEqual(t, attempts, 2) // Should stop early
	})
}
