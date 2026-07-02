package common

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"

	"cloud.google.com/go/pubsub"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// PushMessage matches the message field in GCP's push delivery format.
type PushMessage struct {
	Data        string            `json:"data"`       // base64-encoded
	Attributes  map[string]string `json:"attributes"` // message attributes
	MessageID   string            `json:"messageId"`
	PublishTime string            `json:"publishTime"`
}

// PushRequestBody matches GCP Pub/Sub's push delivery HTTP body.
type PushRequestBody struct {
	Message      PushMessage `json:"message"`
	Subscription string      `json:"subscription"`
}

// WrapPushHandler adapts an existing pull-style handler (func(context.Context, *pubsub.Message))
// into a gin.HandlerFunc that receives push deliveries from Pub/Sub.
//
// The adapter decodes the push HTTP body, constructs a *pubsub.Message with the
// decoded data and attributes, and calls the handler. Ack/Nack calls on the
// constructed message are no-ops — under push, HTTP 200 = ack.
func WrapPushHandler(handler func(context.Context, *pubsub.Message)) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body PushRequestBody
		if err := c.ShouldBindJSON(&body); err != nil {
			log.Error().Err(err).Msg("Failed to parse push message body")
			c.Status(http.StatusBadRequest)
			return
		}

		// Decode base64 data
		data, err := base64.StdEncoding.DecodeString(body.Message.Data)
		if err != nil {
			log.Error().Err(err).Msg("Failed to decode push message data")
			c.Status(http.StatusBadRequest)
			return
		}

		// Build a pubsub.Message that existing handlers can consume.
		// The message has no ack handler — Ack()/Nack() are no-ops.
		msg := &pubsub.Message{
			Data:       data,
			Attributes: body.Message.Attributes,
			ID:         body.Message.MessageID,
		}

		handler(c.Request.Context(), msg)

		// Always 200 — all handlers ack. Push retry is controlled by
		// Pub/Sub subscription retry policy, not application logic.
		c.Status(http.StatusOK)
	}
}

// WrapPushHandlerWithFilter is like WrapPushHandler but applies in-memory attribute
// filtering on the emulator (which doesn't support server-side subscription filters).
// In production, Pub/Sub filters messages before delivery so the filter is redundant
// but harmless. Pass an empty filter to skip filtering (same as WrapPushHandler).
func WrapPushHandlerWithFilter(handler func(context.Context, *pubsub.Message), filter string) gin.HandlerFunc {
	if filter == "" {
		return WrapPushHandler(handler)
	}

	filterConditions := parseFilterExpression(filter)

	return func(c *gin.Context) {
		var body PushRequestBody
		if err := c.ShouldBindJSON(&body); err != nil {
			log.Error().Err(err).Msg("Failed to parse push message body")
			c.Status(http.StatusBadRequest)
			return
		}

		// Check filter before decoding data — skip early if no match
		if !evaluateFilter(filterConditions, body.Message.Attributes) {
			c.Status(http.StatusOK) // Ack to prevent redelivery
			return
		}

		data, err := base64.StdEncoding.DecodeString(body.Message.Data)
		if err != nil {
			log.Error().Err(err).Msg("Failed to decode push message data")
			c.Status(http.StatusBadRequest)
			return
		}

		msg := &pubsub.Message{
			Data:       data,
			Attributes: body.Message.Attributes,
			ID:         body.Message.MessageID,
		}

		handler(c.Request.Context(), msg)
		c.Status(http.StatusOK)
	}
}

// WrapPushHandlerJSON is a convenience for push handlers that need to parse
// the raw JSON body themselves (e.g., for logging the subscription name).
// Most handlers should use WrapPushHandler instead.
func WrapPushHandlerJSON(handler func(context.Context, *pubsub.Message, string)) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body PushRequestBody
		if err := json.NewDecoder(c.Request.Body).Decode(&body); err != nil {
			log.Error().Err(err).Msg("Failed to parse push message body")
			c.Status(http.StatusBadRequest)
			return
		}

		data, err := base64.StdEncoding.DecodeString(body.Message.Data)
		if err != nil {
			log.Error().Err(err).Msg("Failed to decode push message data")
			c.Status(http.StatusBadRequest)
			return
		}

		msg := &pubsub.Message{
			Data:       data,
			Attributes: body.Message.Attributes,
			ID:         body.Message.MessageID,
		}

		handler(c.Request.Context(), msg, body.Subscription)

		c.Status(http.StatusOK)
	}
}
