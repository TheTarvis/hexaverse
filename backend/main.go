package main

import (
	"context"
	"fmt"
	"os"

	"hexaverse/common"
	"hexaverse/config"
	"hexaverse/galaxy"
	"hexaverse/middlewares"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// Local: pretty console output. Production: default JSON to stderr for log aggregators.
	if config.IsLocal() {
		log.Logger = log.Output(zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: "3:04:05PM",
		})
	}

	log.Logger = log.Logger.Hook(common.TracingHook{})

	switch os.Getenv("LOG_LEVEL") {
	case "debug":
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	case "error":
		zerolog.SetGlobalLevel(zerolog.ErrorLevel)
	case "warn":
		zerolog.SetGlobalLevel(zerolog.WarnLevel)
	default:
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}

	if err := middlewares.InitializeFirebase(); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize Firebase")
	}
	log.Info().Msg("Firebase initialized successfully")

	// Local + e2e only: ensure a live galaxy exists so drill-in has a world to
	// render (GET /v1/systems/:id 404s without one). Idempotent and synchronous —
	// the e2e stack's health gate then implies the galaxy is ready. Prod seeds
	// deliberately via `make seed`, never on boot.
	if config.IsLocal() {
		if err := galaxy.SeedDevGalaxy(context.Background()); err != nil {
			log.Warn().Err(err).Msg("Dev galaxy seed failed (drill-in may 404 until seeded)")
		}
	}

	// Cloud Run requires 0.0.0.0; local dev can override in .env.local.
	hostAndPort := fmt.Sprintf("0.0.0.0:%s", config.ServiceConfig.ApiPort)

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	fmt.Printf("Server starting on %s\n", hostAndPort)
	router := SetupRouter()
	if err := router.Run(hostAndPort); err != nil {
		log.Fatal().Err(err).Str("address", hostAndPort).Msg("Failed to start server")
	}
}
