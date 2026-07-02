package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"firebase.google.com/go/v4/auth"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512 * 1024 // 512KB
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

// WSClient represents a websocket client connection
type WSClient struct {
	uid      string
	conn     *websocket.Conn
	hub      *Hub
	send     chan []byte
	sendLock sync.Mutex
}

// NewClient creates a new websocket client
func NewClient(uid string, conn *websocket.Conn, hub *Hub) *WSClient {
	return &WSClient{
		uid:  uid,
		conn: conn,
		hub:  hub,
		send: make(chan []byte, 256),
	}
}

// readPump pumps messages from the websocket connection to the hub.
func (c *WSClient) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Error().
					Str("clientId", c.uid).
					Err(err).
					Msg("Connection closed unexpectedly")
			} else {
				log.Debug().
					Str("clientId", c.uid).
					Err(err).
					Msg("Connection closed")
			}
			break
		}

		// Parse the message to determine its type
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Error().
				Str("clientId", c.uid).
				Err(err).
				RawJSON("message", message).
				Msg("Error parsing message")
			continue
		}

		// Add sender ID to the message payload
		if msg.Payload == nil {
			msg.Payload = make(map[string]interface{})
		}
		payload, ok := msg.Payload.(map[string]interface{})
		if !ok {
			log.Error().
				Str("clientId", c.uid).
				Interface("payload", msg.Payload).
				Msg("Invalid payload type")
			continue
		}
		payload["senderId"] = c.uid
		msg.Payload = payload

		// Re-encode the message with the added sender ID
		message, err = json.Marshal(msg)
		if err != nil {
			log.Error().
				Str("clientId", c.uid).
				Err(err).
				Interface("message", msg).
				Msg("Error encoding message")
			continue
		}

		c.hub.broadcast <- message
	}
}

// writePump pumps messages from the hub to the websocket connection.
func (c *WSClient) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				log.Error().
					Str("clientId", c.uid).
					Err(err).
					Msg("Error getting writer")
				return
			}

			// Write the message
			if _, err := w.Write(message); err != nil {
				log.Error().
					Str("clientId", c.uid).
					Err(err).
					RawJSON("message", message).
					Msg("Error writing message")
				return
			}

			if err := w.Close(); err != nil {
				log.Error().
					Str("clientId", c.uid).
					Err(err).
					Msg("Error closing writer")
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Error().
					Str("clientId", c.uid).
					Err(err).
					Msg("Error sending ping")
				return
			}
		}
	}
}

// SendMessage sends a message to the client
func (c *WSClient) SendMessage(message *Message) error {
	c.sendLock.Lock()
	defer c.sendLock.Unlock()

	// Check if the send channel is still open
	select {
	case <-c.send:
		return fmt.Errorf("send channel closed")
	default:
	}

	// Marshal the message
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("error marshaling message: %w", err)
	}

	// Try to send the message
	select {
	case c.send <- data:
		log.Debug().
			Str("clientId", c.uid).
			Str("type", message.Type).
			Msg("Message sent to client")
		return nil
	default:
		log.Warn().
			Str("clientId", c.uid).
			Str("type", message.Type).
			Msg("Failed to send message (buffer full)")
		return fmt.Errorf("send buffer full")
	}
}

// ServeWS handles WebSocket requests from clients.
func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	// Get token from query or header
	token := r.URL.Query().Get("token")
	if token == "" {
		token = r.Header.Get("Authorization")
		// Remove "Bearer " prefix if present
		if len(token) > 7 && token[:7] == "Bearer " {
			token = token[7:]
		}
	}

	// Handle authentication
	uid, err := authenticateToken(hub.authClient, r.Context(), token)
	if err != nil {
		http.Error(w, "Unauthorized: "+err.Error(), http.StatusUnauthorized)
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().
			Err(err).
			Str("path", r.URL.Path).
			Msg("Error upgrading connection")
		return
	}

	client := NewClient(uid, conn, hub)

	// Register client to hub
	hub.register <- client

	// Start client message pumps
	go client.writePump()
	go client.readPump()
}

// ServeWSNoAuth handles WebSocket requests without authentication
func ServeWSNoAuth(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().
			Err(err).
			Str("path", r.URL.Path).
			Msg("Error upgrading connection")
		return
	}

	// Generate a unique ID for the client
	clientID := fmt.Sprintf("anon-%d", time.Now().UnixNano())

	// Create new client
	client := NewClient(clientID, conn, hub)

	// Register client
	hub.register <- client

	// Start client routines
	go client.writePump()
	go client.readPump()
}

// Helper function to authenticate a token
func authenticateToken(authClient *auth.Client, ctx context.Context, token string) (string, error) {
	if token == "" {
		return "", fmt.Errorf("missing authentication token")
	}

	// If auth client is nil, use anonymous authentication
	if authClient == nil {
		return "anonymous-" + time.Now().Format(time.RFC3339Nano), nil
	}

	// Verify Firebase token
	firebaseToken, err := authClient.VerifyIDToken(ctx, token)
	if err != nil {
		return "", fmt.Errorf("invalid authentication token: %w", err)
	}

	return firebaseToken.UID, nil
}
