package main

import (
	"time"

	"hexaverse/account"
	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/config"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/health"
	"hexaverse/middlewares"
	"hexaverse/observation"
	"hexaverse/sse"
	"hexaverse/system"

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
		// Hexaverse dev frontend runs on :3010 (base +10 so it coexists with
		// Flywheel on :3000). Next.js bumps to the next free port when 3010 is
		// taken, so accept :3011 too. :3110 is the dedicated e2e frontend port
		// (playwright boots the dev server there) — without it the browser's API
		// calls are CORS-blocked during e2e.
		corsConfig.AllowOrigins = append(corsConfig.AllowOrigins,
			"http://localhost:3010", "http://localhost:3011", "http://localhost:3110")
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

	// The action spine (#0005) and the verbs share ONE action.Service instance so
	// the resolvers each verb registers are the same ones the sweep and reads
	// dispatch through. Construct it explicitly, wire resolvers, then hand it out.
	clock := common.WorldClock()
	systemSvc := system.NewService()
	actionSvc := action.NewService()
	fleetSvc := fleet.NewServiceWith(fleet.NewDao(), systemSvc, actionSvc, clock)

	// Fog of war (#0006): the fog-filter every read projects through, per
	// Corporation. It reads live positions from fleet and interior geometry from
	// system via interfaces (no import cycle), and registers the scan resolver.
	fogSvc := observation.NewService(fleetSvc, systemSvc)
	fogSvc.RegisterResolvers(actionSvc)

	// Register the burn resolver AFTER the fog service exists, so a resolved move
	// also mints path-swept ambient memory (#0006 Decision #14).
	fleet.RegisterResolversWithAmbient(actionSvc, fogSvc)

	// Domain handlers: register them here. Use `/new-domain <name>` to scaffold one.
	galaxy.NewHandler().WithFog(fogSvc).RegisterRoutes(authorized)
	system.NewHandlerWith(systemSvc, clock).WithFog(fogSvc).RegisterRoutes(authorized)

	actionHandler := action.NewHandler(actionSvc)
	actionHandler.RegisterRoutes(authorized)
	fleet.NewHandlerWith(fleetSvc, clock).WithFog(fogSvc).RegisterRoutes(authorized)

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
		// The Cloud Scheduler sweep (#0005) — an OIDC-verified reader on a clock.
		actionHandler.RegisterPushRoutes(pushGroup)
	}

	return router
}
