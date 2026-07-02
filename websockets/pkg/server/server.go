package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/option"

	"websockets/pkg/config"
	"websockets/pkg/middleware"
	"websockets/pkg/pubsub"
	"websockets/pkg/websocket"
)

// Server represents the HTTP server
type Server struct {
	config     *config.Config
	hub        *websocket.Hub
	PubSub     *pubsub.Service
	authClient *auth.Client
	server     *http.Server
	handler    http.Handler
}

// NewServer creates a new HTTP server instance
func NewServer(cfg *config.Config) *Server {
	hub := websocket.NewHub() // Pass nil for now, will set later if firebase is initialized
	go hub.Run()

	srv := &Server{
		config: cfg,
		hub:    hub,
	}

	srv.setupRoutes()
	return srv
}

// Hub returns the websocket hub
func (s *Server) Hub() *websocket.Hub {
	return s.hub
}

// InitFirebase initializes Firebase auth
func (s *Server) InitFirebase(ctx context.Context) error {
	if s.config.FirebaseCredFile != "" {
		app, err := firebase.NewApp(ctx, nil, option.WithCredentialsFile(s.config.FirebaseCredFile))
		if err != nil {
			log.Error().
				Ctx(ctx).
				Err(err).
				Str("credFile", s.config.FirebaseCredFile).
				Msg("Error initializing Firebase app")
			return err
		}

		s.authClient, err = app.Auth(ctx)
		if err != nil {
			log.Error().
				Ctx(ctx).
				Err(err).
				Msg("Error initializing Firebase Auth")
			return err
		}
	} else {
		// Try default credentials
		app, err := firebase.NewApp(ctx, nil)
		if err != nil {
			log.Error().
				Ctx(ctx).
				Err(err).
				Msg("Error initializing Firebase app with default credentials")
			return err
		}

		s.authClient, err = app.Auth(ctx)
		if err != nil {
			log.Error().
				Ctx(ctx).
				Err(err).
				Msg("Error initializing Firebase Auth with default credentials")
			return err
		}
	}

	return nil
}

// setupRoutes sets up the HTTP routes
func (s *Server) setupRoutes() {
	// Create a router with middleware
	mux := http.NewServeMux()

	// WebSocket handler
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		// If Firebase Auth is not initialized, skip token verification
		if s.authClient == nil {
			log.Warn().
				Str("path", "/ws").
				Msg("Firebase Auth not initialized, skipping token verification")
			websocket.ServeWSNoAuth(s.hub, w, r)
			return
		}

		websocket.ServeWSNoAuth(s.hub, w, r)
	})

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)

		// Get client count from hub
		connectedClients := s.hub.GetConnectedClientsCount()

		// Create response with client count
		response := map[string]interface{}{
			"status":  "ok",
			"clients": connectedClients,
		}

		json.NewEncoder(w).Encode(response)
	})

	// Add a test endpoint to publish messages to PubSub
	if os.Getenv("PUBSUB_EMULATOR_HOST") != "" {
		mux.HandleFunc("/test/publish", func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}

			// Parse the request body
			var message websocket.Message
			if err := json.NewDecoder(r.Body).Decode(&message); err != nil {
				http.Error(w, "Invalid JSON", http.StatusBadRequest)
				return
			}

			// Publish the message
			id, err := s.PubSub.PublishMessage(r.Context(), message)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to publish message: %v", err), http.StatusInternalServerError)
				return
			}

			// Return the message ID
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(fmt.Sprintf("Message published with ID: %s", id)))
		})

		// Add a test endpoint to broadcast messages directly to all connected clients
		mux.HandleFunc("/test/broadcast", func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}

			// Parse the request body
			var message websocket.Message
			if err := json.NewDecoder(r.Body).Decode(&message); err != nil {
				http.Error(w, "Invalid JSON", http.StatusBadRequest)
				return
			}

			// Broadcast the message to all connected clients
			s.hub.Broadcast(&message)

			// Return success response with client count
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			response := map[string]interface{}{
				"status":  "success",
				"message": "Broadcast sent",
				"clients": s.hub.GetConnectedClientsCount(),
			}
			json.NewEncoder(w).Encode(response)
		})

		log.Info().Msg("Test endpoints available at /test/publish and /test/broadcast (PubSub Emulator mode)")
	}

	// Apply CORS middleware to all routes
	s.handler = middleware.CORSMiddleware(mux)
}

// Start starts the HTTP server
func (s *Server) Start() error {
	s.server = &http.Server{
		Addr:    ":" + s.config.Port,
		Handler: s.handler,
	}

	log.Info().
		Str("port", s.config.Port).
		Msg("Starting server")

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("error starting server: %w", err)
	}

	return nil
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	log.Info().Msg("Server is shutting down...")
	return s.server.Shutdown(ctx)
}
