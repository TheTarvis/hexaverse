package sse

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// Event wraps different event types for SSE streaming.
type Event struct {
	Type      string      `json:"type"`
	Timestamp string      `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// SSEClient represents a single Server-Sent Events client connection.
type SSEClient struct {
	ID        string
	ChannelId string // Logical channel — one connection per channel.
	AccountId string
	IsAdmin   bool

	Channel chan *Event
	Context context.Context // Connection lifecycle (client disconnect detection).
}

// SSEManager manages all active SSE client connections for this Cloud Run instance.
type SSEManager struct {
	clients map[string]*SSEClient
	mu      sync.RWMutex
}

var (
	sseManager *SSEManager
	once       sync.Once
)

// GetSSEManager returns the singleton SSE manager instance.
func GetSSEManager() *SSEManager {
	once.Do(func() {
		sseManager = &SSEManager{
			clients: make(map[string]*SSEClient),
		}
	})
	return sseManager
}

// AddClient registers a new SSE client connection.
func (m *SSEManager) AddClient(client *SSEClient) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clients[client.ID] = client
}

// RemoveClient unregisters an SSE client connection.
func (m *SSEManager) RemoveClient(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if client, exists := m.clients[clientID]; exists {
		close(client.Channel)
		delete(m.clients, clientID)
	}
}

// BroadcastToChannel sends an event to all SSE clients subscribed to the given channel.
// A "channel" is an opaque string — typical uses are an org id, a user id, or a topic key.
// Permission to subscribe is enforced at connection time by the handler.
func (m *SSEManager) BroadcastToChannel(channelId string, event *Event) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if channelId == "" || len(m.clients) == 0 {
		return
	}

	for _, client := range m.clients {
		if client.ChannelId != channelId {
			continue
		}
		select {
		case client.Channel <- event:
		default:
			log.Warn().
				Str("clientId", client.ID).
				Str("eventType", event.Type).
				Msg("Client channel full, event dropped")
		}
	}
}

// BroadcastToAccount sends an event to every connected client whose AccountId matches.
// Used for per-user notifications independent of channel.
func (m *SSEManager) BroadcastToAccount(accountId string, event *Event) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if accountId == "" || len(m.clients) == 0 {
		return
	}

	for _, client := range m.clients {
		if client.AccountId != accountId {
			continue
		}
		select {
		case client.Channel <- event:
		default:
			log.Warn().
				Str("clientId", client.ID).
				Str("eventType", event.Type).
				Msg("Client channel full, event dropped")
		}
	}
}

// BroadcastToAdmins sends an event to every connected client whose JWT carried admin=true.
// IsAdmin is set at connection time from a verified Firebase claim — clients can't spoof it.
func (m *SSEManager) BroadcastToAdmins(event *Event) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if len(m.clients) == 0 {
		return
	}

	for _, client := range m.clients {
		if !client.IsAdmin {
			continue
		}
		select {
		case client.Channel <- event:
		default:
			log.Warn().
				Str("clientId", client.ID).
				Str("eventType", event.Type).
				Msg("Admin client channel full, event dropped")
		}
	}
}

// GetClientCount returns the number of active SSE clients.
func (m *SSEManager) GetClientCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.clients)
}

// NewSSEClient creates a new SSE client subscribed to the given channel.
func NewSSEClient(ctx context.Context, channelId, accountId string, isAdmin bool) *SSEClient {
	return &SSEClient{
		ID:        uuid.New().String(),
		ChannelId: channelId,
		AccountId: accountId,
		IsAdmin:   isAdmin,
		Channel:   make(chan *Event, 100),
		Context:   ctx,
	}
}
