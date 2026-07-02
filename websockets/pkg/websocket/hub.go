package websocket

import (
	"sync"

	"firebase.google.com/go/v4/auth"
	"github.com/rs/zerolog/log"
)

// Hub maintains the set of active clients and broadcasts messages to the clients.
type Hub struct {
	// Registered clients.
	clients map[*WSClient]bool

	// Inbound messages from the clients.
	broadcast chan []byte

	// Register requests from the clients.
	register chan *WSClient

	// Unregister requests from clients.
	unregister chan *WSClient

	// Map of user IDs to clients
	userClients map[string]*WSClient

	// Mutex for userClients map
	userClientsLock sync.RWMutex

	// Firebase auth client
	authClient *auth.Client
}

// NewHub creates a new hub instance
func NewHub() *Hub {
	return &Hub{
		broadcast:   make(chan []byte),
		register:    make(chan *WSClient),
		unregister:  make(chan *WSClient),
		clients:     make(map[*WSClient]bool),
		userClients: make(map[string]*WSClient),
	}
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			h.userClientsLock.Lock()
			h.userClients[client.uid] = client
			h.userClientsLock.Unlock()

			log.Debug().
				Str("clientId", client.uid).
				Int("totalClients", len(h.clients)).
				Msg("Client registered")

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				h.userClientsLock.Lock()
				delete(h.userClients, client.uid)
				h.userClientsLock.Unlock()
				close(client.send)

				log.Debug().
					Str("clientId", client.uid).
					Int("totalClients", len(h.clients)).
					Msg("Client unregistered")
			}

		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
					h.userClientsLock.Lock()
					delete(h.userClients, client.uid)
					h.userClientsLock.Unlock()
				}
			}
		}
	}
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(message *Message) {
	data, err := message.ToJSON()
	if err != nil {
		log.Error().
			Err(err).
			Interface("message", message).
			Msg("Error encoding message for broadcast")
		return
	}

	h.broadcast <- data
}

// SendToUser sends a message to a specific user
func (h *Hub) SendToUser(userID string, message *Message) bool {
	h.userClientsLock.RLock()
	client, ok := h.userClients[userID]
	h.userClientsLock.RUnlock()

	if !ok {
		return false
	}

	if err := client.SendMessage(message); err != nil {
		log.Error().
			Err(err).
			Str("userId", userID).
			Interface("message", message).
			Msg("Error sending message to user")
		return false
	}

	return true
}

// GetConnectedClientsCount returns the number of connected clients
func (h *Hub) GetConnectedClientsCount() int {
	return len(h.clients)
}
