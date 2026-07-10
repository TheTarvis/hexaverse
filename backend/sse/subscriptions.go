package sse

import (
	"context"
	"encoding/json"
	"time"

	"hexaverse/common"

	"cloud.google.com/go/pubsub"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// RegisterPushRoutes registers Pub/Sub push delivery endpoints that fan out to
// SSE clients. When no SSE clients are connected, handlers broadcast to an empty
// client map (no-op) — SSE is invalidation, not truth (#0005 Decision #10), so a
// dropped fan-out self-heals via the client refetch rules.
//
// Wrap handlers with `common.WrapPushHandler` so they decode the Pub/Sub push
// envelope; the /v1/push group already enforces OIDC.
func RegisterPushRoutes(g *gin.RouterGroup) {
	g.POST("/sse-action", common.WrapPushHandler(handleActionCompleted))
}

// handleActionCompleted broadcasts an ActionCompleted envelope to watchers of the
// action's scope (channelId = scope). The payload is intentionally thin — a nudge
// to refetch, not the resolved state itself.
func handleActionCompleted(_ context.Context, msg *pubsub.Message) {
	channelID := msg.Attributes["channelId"]
	if channelID == "" {
		log.Warn().Str("messageId", msg.ID).Msg("ActionCompleted push had no channelId; dropping")
		return
	}
	var env common.EventEnvelope
	if err := json.Unmarshal(msg.Data, &env); err != nil {
		log.Error().Err(err).Str("messageId", msg.ID).Msg("Failed to decode ActionCompleted envelope")
		return
	}
	GetSSEManager().BroadcastToChannel(channelID, &Event{
		Type:      common.ActionCompleted,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Data:      env.Payload,
	})
}
