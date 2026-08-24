package main

import (
	"time"

	"hexaverse/account"
	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/config"
	"hexaverse/corporations"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/health"
	"hexaverse/market"
	"hexaverse/middlewares"
	"hexaverse/mine"
	"hexaverse/observation"
	"hexaverse/sse"
	"hexaverse/stations"
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

	// The action spine (#0005) and the verbs share ONE action.Service instance so
	// the resolvers each verb registers are the same ones the sweep and reads
	// dispatch through. Construct it explicitly, wire resolvers, then hand it out.
	clock := common.WorldClock()
	systemSvc := system.NewService()
	galaxySvc := galaxy.NewService()
	actionSvc := action.NewService()
	fleetSvc := fleet.NewServiceWith(fleet.NewDao(), systemSvc, actionSvc, clock)

	// Fog of war (#0006): the fog-filter every read projects through, per
	// Corporation. It reads live positions from fleet, interior geometry from
	// system, and the lane graph from galaxy via interfaces (no import cycle),
	// and registers the scan resolver.
	fogSvc := observation.NewService(fleetSvc, systemSvc, galaxySvc)
	fogSvc.RegisterResolvers(actionSvc)

	// Graph-tier travel (#0008): the fleet service pathfinds over the galaxy graph
	// and the requester's charted set (from fog). Wired after fog exists (fog
	// depends on the fleet service — a construction cycle).
	fleetSvc.WithTravel(galaxySvc, fogSvc)

	// Register the burn resolver AFTER the fog service exists, so a resolved move
	// also mints path-swept ambient memory (#0006 Decision #14).
	fleet.RegisterResolversWithAmbient(actionSvc, fogSvc)

	// The lane-travel resolver: arrival settles the fleet at the destination rim
	// and mints the reveal (Explored + the crossed lanes charted) in one
	// transaction (#0008, revised per #0006 Decision #17 — no onward rumor;
	// scanning finds the roads).
	fleet.RegisterTravelResolver(actionSvc, fogSvc)

	// Spawn & identity (#0009): the corporation service orchestrates spawn through
	// the live galaxy/fleet/fog singletons above, and resolves account→living-corp
	// for the ownership seam. Constructed before the authorized group so its
	// resolver can join the request middleware chain.
	// Trading stations (#0011): provisioned as a spawn-home asset, spliced into
	// every interior read, and the venue a sale settles against. Wired BEFORE the
	// corp service so spawn's asset healing can provision the home station, and
	// spliced into systemSvc so fleet's dock/position resolution sees it.
	marketParams := market.DefaultParams()
	stationSvc := stations.NewService(galaxySvc, fogSvc).
		WithMinVisibilityTier(marketParams.MinVisibilityTier)
	systemSvc.WithStations(stationSvc)

	corpSvc := corporations.NewService(galaxySvc, fleetSvc, fogSvc).
		WithMarket(stationSvc, marketParams.StartingCredits)
	corpHandler := corporations.NewHandler(corpSvc)

	authorized := v1.Group("/")
	authorized.Use(
		generalLimit,
		middlewares.FirebaseJWTVerification(),
		middlewares.AuditAuthEvents(),
		middlewares.FirebaseUidToAccountMiddleware(),
		// Resolve the requester's Corporation once per request — the single seam
		// common.ActorCorp reads for fog + ownership (#0009). Corpless is fine
		// (the wake-up flow's own POST /corporations runs before a corp exists).
		middlewares.ResolveCorporation(func(c *gin.Context, accountId string) (string, error) {
			return corpSvc.CorpForAccount(c.Request.Context(), accountId)
		}),
	)

	accountHandler := account.NewHandler()
	accountHandler.RegisterRoutes(authorized, strictLimit)

	// Domain handlers: register them here. Use `/new-domain <name>` to scaffold one.
	corpHandler.RegisterRoutes(authorized, strictLimit)
	galaxy.NewHandler().WithFog(fogSvc).RegisterRoutes(authorized)
	system.NewHandlerWith(systemSvc, clock).WithFog(fogSvc).WithActions(actionSvc).RegisterRoutes(authorized)

	actionHandler := action.NewHandler(actionSvc)
	actionHandler.RegisterRoutes(authorized)
	fleet.NewHandlerWith(fleetSvc, clock).WithFog(fogSvc).RegisterRoutes(authorized)

	// Mine (#0010): the action spine's first mutating resolver. Wired after
	// fleet/fog/travel/spawn — it rides fleet's movement channel (Decision #9)
	// and reads through fleetSvc/systemSvc/actionSvc, never their DAOs.
	mineParams := mine.DefaultMineParams()
	mineClassStats := fleet.DefaultClassStats()
	mineSvc := mine.NewServiceWith(fleetSvc, systemSvc, actionSvc, clock, mineParams, mineClassStats)
	mine.RegisterResolver(actionSvc, mineParams, mineClassStats)
	mine.NewHandlerWith(mineSvc, clock).RegisterRoutes(authorized)

	// The direct station read — gated by the requester's graph tier, which is why
	// it lives here and not at the (requester-less) interior splice.
	stations.NewHandler(stationSvc).RegisterRoutes(authorized)

	// The market (#0011): the remote price board and the instant sell verb. It
	// composes fleet's, corporations', and the station's transaction-scoped
	// primitives inside the ONE transaction it opens — never their DAOs. It
	// registers no action.ResolveFunc: nothing here rides the action spine.
	//
	// The sell route additionally carries a per-corporation write quota, keyed on
	// the server-resolved actor corp — additive to the general per-IP tier, which
	// its own spec documents as IP-spoofable and per-instance and therefore not a
	// sufficient sole control for a balance-mutating route.
	var corpWriteQuota gin.HandlerFunc
	if config.ServiceConfig.DisableRateLimiting {
		corpWriteQuota = func(c *gin.Context) { c.Next() }
	} else {
		corpWriteQuota = middlewares.NewCorpWriteQuota(60, time.Minute).Middleware()
	}
	marketSvc := market.NewService(
		marketParams, galaxySvc, stationSvc, fleetSvc,
		corpSvc.Credits(), fogSvc, clock, common.NewFirestoreService(),
	)
	market.NewHandler(marketSvc, clock).RegisterRoutes(authorized, corpWriteQuota)

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
		// The credit-reconciliation cadence (#0011) — the periodic backstop that
		// finds a balance/ledger divergence nobody's next mutation would surface.
		corpHandler.RegisterPushRoutes(pushGroup)
	}

	return router
}
