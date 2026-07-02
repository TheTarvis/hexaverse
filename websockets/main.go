package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"

	"websockets/pkg/config"
	"websockets/pkg/logger"
	"websockets/pkg/pubsub"
	"websockets/pkg/server"
)

//TIP <p>To run your code, right-click the code and select <b>Run</b>.</p> <p>Alternatively, click
// the <icon src="AllIcons.Actions.Execute"/> icon in the gutter and select the <b>Run</b> menu item from here.</p>

func main() {
	// Initialize logger
	logger.Init()

	ctx := context.Background()
	ctx = logger.WithContext(ctx)

	log.Info().
		Str("version", "v0.0.1").
		Msg("Starting websocket server")

	log.Debug().
		Str("PORT", os.Getenv("PORT")).
		Str("PUBSUB_PROJECT_ID", os.Getenv("PUBSUB_PROJECT_ID")).
		Str("PUBSUB_TOPIC_ID", os.Getenv("PUBSUB_TOPIC_ID")).
		Str("PUBSUB_EMULATOR_HOST", os.Getenv("PUBSUB_EMULATOR_HOST")).
		Msg("Environment configuration")

	// Create server config
	cfg := &config.Config{
		Port:               os.Getenv("PORT"),
		PubSubProjectID:    os.Getenv("PUBSUB_PROJECT_ID"),
		PubSubTopicID:      os.Getenv("PUBSUB_TOPIC_ID"),
		PubSubEmulatorHost: os.Getenv("PUBSUB_EMULATOR_HOST"),
	}

	// Initialize server
	srv := server.NewServer(cfg)

	// Initialize PubSub if configuration is provided
	if cfg.PubSubProjectID != "" && cfg.PubSubTopicID != "" {
		var ps *pubsub.Service
		var err error

		if cfg.PubSubEmulatorHost != "" {
			ps, err = pubsub.NewEmulatorService(cfg)
		} else {
			ps, err = pubsub.NewService(cfg)
		}

		if err != nil {
			log.Error().
				Ctx(ctx).
				Err(err).
				Msg("Pub/Sub setup failed, continuing without Pub/Sub integration")
		} else {
			// Setup PubSub with the hub
			if err := ps.Setup(ctx, srv.Hub()); err != nil {
				log.Error().
					Ctx(ctx).
					Err(err).
					Msg("Pub/Sub setup failed, continuing without Pub/Sub integration")
			} else {
				srv.PubSub = ps
				go func() {
					if err := ps.ReceiveMessages(ctx, srv.Hub()); err != nil {
						log.Error().
							Ctx(ctx).
							Err(err).
							Msg("Error receiving pubsub messages")
					}
				}()
			}
		}
	} else {
		log.Info().
			Msg("Pub/Sub configuration not provided, running without Pub/Sub integration")
	}

	// Initialize Firebase Auth if available
	if err := srv.InitFirebase(ctx); err != nil {
		log.Warn().
			Ctx(ctx).
			Err(err).
			Msg("Firebase Auth initialization failed, continuing without authentication")
	}

	// Start server
	go func() {
		if err := srv.Start(); err != nil {
			log.Fatal().
				Ctx(ctx).
				Err(err).
				Msg("Error starting server")
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Server is shutting down...")

	// Create shutdown context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal().
			Ctx(ctx).
			Err(err).
			Msg("Server forced to shutdown")
	}

	// Cleanup PubSub if it was initialized
	if srv.PubSub != nil {
		if err := srv.PubSub.Cleanup(ctx); err != nil {
			log.Error().
				Ctx(ctx).
				Err(err).
				Msg("Error cleaning up Pub/Sub")
		}
	}

	log.Info().Msg("Server exited gracefully")
}
