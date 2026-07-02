package sse

import (
	"github.com/gin-gonic/gin"
)

// RegisterPushRoutes registers Pub/Sub push delivery endpoints that fan out
// to SSE clients. When no SSE clients are connected, handlers broadcast
// to an empty client map (no-op).
//
// Add a route per topic you want to fan out. A typical handler unmarshals
// `common.EventEnvelope` from the message body, pulls a `channelId` out of
// the payload or attributes, and calls
// `GetSSEManager().BroadcastToChannel(channelId, &Event{...})`.
//
// Wrap your handler with `common.WrapPushHandler` so it can decode the
// Pub/Sub push envelope and verify OIDC.
func RegisterPushRoutes(g *gin.RouterGroup) {
	// e.g. g.POST("/sse-widget", common.WrapPushHandler(handleWidgetEventBroadcast))
}
