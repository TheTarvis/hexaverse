package main

import (
	"time"
	"hexaverse/account"
	"hexaverse/config"
	"hexaverse/galaxy"
	"hexaverse/system"
	"hexaverse/health"
	"hexaverse/middlewares"
	"hexaverse/sse"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

func SetupRouter() *gin.Engine {
	router := gin.New()
	router.Use(gin.Recovery())

	// Cloud Run provides HTTP request logging in production; only log locally.
	if config.IsLocal() {
		router.Use(gin.Logger())
	}

	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{}
	if config.IsLocal() {
		corsConfig.AllowOrigins = append(corsConfig.AllowOrigins, "http://localhost:3000")
	}
	corsConfig.AllowCredentials = true
	corsConfig.AllowHeaders = []string{
		"Origin",
		"Content-Length",
		"Content-Type",
		"Authorization",
	}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}

	router.Use(cors.New(corsConfig))
	router.Use(middlewares.AnonymousId())
	router.Use(middlewares.SecurityHeaders())
	router.Use(middlewares.TRACER)
	router.Use(middlewares.ErrorSanitizer())

	router.GET("/healthcheck", health.GetHealthcheck)

	v1 := router.Group("/v1")

	// Anti-automation rate limits (OWASP ASVS V2.2.1):
	//   strict (20/min/IP) — credential/enumeration surfaces
	//   general (600/min/IP) — DoS safety net on the authorized group
	// DISABLE_RATE_LIMITING=true makes them no-ops for e2e/CI.
	var strictLimit, generalLimit gin.HandlerFunc
	if config.ServiceConfig.DisableRateLimiting {
		log.Info().Msg("Rate limiting disabled via DISABLE_RATE_LIMITING")
		noop := func(c *gin.Context) { c.Next() }
		strictLimit = noop
		generalLimit = noop
	} else {
		strictLimit = middlewares.NewRateLimiter(20, time.Minute).Middleware()
		generalLimit = middlewares.NewRateLimiter(600, time.Minute).Middleware()
	}

	authorized := v1.Group("/")
	authorized.Use(generalLimit, middlewares.FirebaseJWTVerification(), middlewares.AuditAuthEvents(), middlewares.FirebaseUidToAccountMiddleware())

	accountHandler := account.NewHandler()
	accountHandler.RegisterRoutes(authorized, strictLimit)

	// Domain handlers: register them here. Use `/new-domain <name>` to scaffold one.
	galaxy.NewHandler().RegisterRoutes(authorized)
	system.NewHandler().RegisterRoutes(authorized)

	// SSE: EventSource can't send custom headers, so JWT comes from the query string.
	sseHandler := sse.NewHandler()
	sseChannel := v1.Group("/channels/:channelId")
	sseChannel.Use(middlewares.FirebaseJWTFromQueryParam(), middlewares.FirebaseUidToAccountMiddleware())
	sseChannel.GET("/stream", sseHandler.StreamChannel)

	// Pub/Sub push delivery — OIDC verification protects in production; emulator skips.
	pushAccountSub := account.NewSubscriptionHandler(account.NewDao())
	pushGroup := v1.Group("/push")
	pushGroup.Use(middlewares.OIDCTokenVerification())
	{
		pushAccountSub.RegisterPushRoutes(pushGroup)
		sse.RegisterPushRoutes(pushGroup)
	}

	return router
}
