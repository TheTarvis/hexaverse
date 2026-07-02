package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	"{{PROJECT_SLUG}}/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// Handler handles SSE HTTP requests.
type Handler struct {
	sseManager *SSEManager
}

// NewHandler creates a new SSE Handler.
func NewHandler() *Handler {
	return &Handler{
		sseManager: GetSSEManager(),
	}
}

// StreamChannel handles Server-Sent Events streaming for a logical channel.
// GET /v1/channels/:channelId/stream
// The channel id is opaque — typical uses are an org id, a user id, or a topic key.
// Subscribe-side authorization (does this account get to subscribe to this channel?)
// is the caller's responsibility to enforce in middleware before reaching this handler.
func (h *Handler) StreamChannel(c *gin.Context) {
	channelId := common.RequiredHttpParam(c, "channelId")

	accountId := common.Actor(c)
	if accountId == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	client := NewSSEClient(c.Request.Context(), channelId, accountId, common.IsAdmin(c))
	h.sseManager.AddClient(client)
	defer h.sseManager.RemoveClient(client.ID)

	log.Info().
		Str("clientId", client.ID).
		Str("accountId", accountId).
		Str("channelId", channelId).
		Msg("SSE client connected")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		log.Error().Msg("Streaming unsupported - ResponseWriter does not implement http.Flusher")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming unsupported"})
		return
	}

	connectionEvent := map[string]string{
		"channelId": channelId,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"message":   "connected",
	}
	connectionData, _ := json.Marshal(connectionEvent)
	fmt.Fprintf(c.Writer, "event: connected\n")
	fmt.Fprintf(c.Writer, "data: %s\n\n", string(connectionData))
	flusher.Flush()

	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case event := <-client.Channel:
			data, err := json.Marshal(event.Data)
			if err != nil {
				log.Error().Err(err).Msg("Failed to marshal event for SSE")
				continue
			}
			fmt.Fprintf(c.Writer, "event: %s\n", event.Type)
			fmt.Fprintf(c.Writer, "data: %s\n\n", string(data))
			flusher.Flush()

		case <-heartbeat.C:
			fmt.Fprintf(c.Writer, ": heartbeat\n\n")
			flusher.Flush()

		case <-c.Request.Context().Done():
			log.Info().
				Str("clientId", client.ID).
				Str("channelId", channelId).
				Msg("SSE client disconnected")
			return
		}
	}
}
