package account

import (
	"context"

	"cloud.google.com/go/pubsub"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"{{PROJECT_SLUG}}/common"
)

// SubscriptionHandler is a placeholder push subscription handler.
// Wire up domain-specific event handlers here as your project grows.
type SubscriptionHandler struct {
	dao Dao
}

func NewSubscriptionHandler(dao Dao) *SubscriptionHandler {
	return &SubscriptionHandler{dao: dao}
}

// RegisterPushRoutes registers Pub/Sub push delivery endpoints for account-related events.
// The example route is wired but unused — remove or replace as needed.
func (h *SubscriptionHandler) RegisterPushRoutes(g *gin.RouterGroup) {
	g.POST("/account-noop", common.WrapPushHandler(h.handleNoop))
}

func (h *SubscriptionHandler) handleNoop(ctx context.Context, msg *pubsub.Message) {
	log.Debug().Str("messageId", msg.ID).Msg("account subscription received message (no-op)")
}
