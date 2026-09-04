package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"hexaverse/account"
	"hexaverse/action"
	"hexaverse/charts"
	"hexaverse/common"
	"hexaverse/config"
	"hexaverse/corporations"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/health"
	"hexaverse/market"
	"hexaverse/middlewares"
	"hexaverse/mine"
	refuelpkg "hexaverse/refuel"
	"hexaverse/sightings"
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
	// systemSvc doubles as fleet's BodySource (its BodyTable method,
	// migrate-fleet-to-continuous-burns design.md Decision 16) — the same
	// concrete service instance every other domain already shares.
	// galaxySvc doubles as fleet's lane-crossing-geometry source (its
	// LaneCrossing method, replace-observation-with-sightings design.md
	// Decision 22, blocker 3) — a required constructor parameter here, not a
	// post-construction accessor that a future refactor could silently drop.
	fleetSvc := fleet.NewServiceWith(fleet.NewDao(), systemSvc, galaxySvc, actionSvc, clock)
	// The interior read's contact union (replace-observation-with-sightings
	// tasks.md 4.1, 4.4, 4.5): systemSvc consumes fleetSvc as its
	// system.FleetSource, structurally — system never imports fleet (that
	// dependency already runs the other way, for BodySource).
	systemSvc.WithFleets(fleetSvc)

	// Register the burn resolver, folding a settled arrival through the same
	// BodySource (design.md Decision 16, 21A — BurnResolver folds
	// space.StateAt). The path-swept ambient reveal this registration used to
	// also wire has no successor after the fleet-state migration; link 4
	// section 7 removes the observation-side writer it fed.
	fleet.RegisterResolvers(actionSvc, systemSvc)
	// The focused-scan resolver (replace-observation-with-sightings §5, task
	// 5.8) — its own registration function, separate from RegisterResolvers,
	// since it needs a ShipSource (fleetSvc itself, structurally) alongside
	// the BodySource every other resolver already takes.
	fleet.RegisterScanResolver(actionSvc, fleetSvc, systemSvc)

	// Galaxy knowledge (#0006, rehomed by replace-observation-with-sightings
	// design.md Decision 1 from backend/observation into backend/charts): the
	// graph-tier ladder, the charted-lane set, and the arrival/attachment
	// reveal writers. Live perception (masking, contacts, sightings) is owned
	// by disclosure/sightings instead — this store is never consulted to
	// decide it (specs/galaxy-knowledge/spec.md — "A Knowledge Write Never
	// Decides Live Disclosure").
	fogSvc := charts.NewService()

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

	// add-fuel-as-cargo's tuning knobs — ONE source of truth shared by the
	// fleet service (burn-commit pricing, the estimated-range/stranded
	// read, the served price), spawn healing's starting-fuel grant, and the
	// refuel verb's own settlement price, so a future retune never drifts
	// between them.
	fuelParams := fleet.DefaultFuelParams()
	fleetSvc.WithFuelParams(fuelParams)

	corpSvc := corporations.NewService(galaxySvc, fleetSvc, fogSvc).
		WithMarket(stationSvc, marketParams.StartingCredits).
		WithFuelParams(fuelParams)
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
	galaxy.NewHandler().WithFog(galaxyFogAdapter{fogSvc}).RegisterRoutes(authorized)
	system.NewHandlerWith(systemSvc, clock).WithActions(actionSvc).WithContacts(systemSvc).RegisterRoutes(authorized)

	// The action inbox authorizes through the actor→corporation seam
	// (action-dispatch "Action Endpoints Are Restricted to the Owning
	// Corporation"), satisfied here by the fleet service — action declares the
	// interface and never imports fleet, since that dependency already runs
	// the other way.
	actionHandler := action.NewHandler(actionSvc).WithActorOwner(fleetActorOwner{fleetSvc})
	actionHandler.RegisterRoutes(authorized)
	fleet.NewHandlerWith(fleetSvc, clock).RegisterRoutes(authorized)

	// Mine (#0010): the action spine's first mutating resolver. Wired after
	// fleet/fog/travel/spawn — it rides fleet's movement channel (Decision #9)
	// and reads through fleetSvc/systemSvc/actionSvc, never their DAOs.
	mineParams := mine.DefaultMineParams()
	mineClassStats := fleet.DefaultClassStats()
	mineSvc := mine.NewServiceWith(fleetSvc, systemSvc, actionSvc, clock, mineParams, mineClassStats)
	mine.RegisterResolver(actionSvc, mineParams, mineClassStats, clock)
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

	// fuel-purchase (add-fuel-as-cargo, section 6): the instant refuel verb,
	// modelled on market's own architecture. It composes fleet's and
	// corporations' transaction-scoped primitives inside the ONE
	// transaction it opens itself — never their DAOs — and rides the SAME
	// per-corporation write quota instance sell does (request-authorization
	// "A corporation exceeding its quota via refuel requests is rejected
	// the same way as via sale requests").
	refuelSvc := refuelpkg.NewService(fuelParams, fleetSvc, corpSvc.Credits(), clock, common.NewFirestoreService())
	refuelpkg.NewHandler(refuelSvc, clock).RegisterRoutes(authorized, corpWriteQuota)

	// The sighting pile (§3 of replace-observation-with-sightings): the read
	// side of the persisted, immutable historical-claim store. Minting is the
	// focused-scan resolver's job (task 5.8, backend/fleet) — this handler only
	// serves the caller's own corporation's pile, newest pulse-reach first.
	sightings.NewHandler(sightings.NewService()).RegisterRoutes(authorized)

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

// fleetActorCollection is the collection every fleet-actor action records in
// Action.ActorCollection (fleet/service.go's own actorCollection constant,
// unexported there). Today it is the only actor collection in the system.
const fleetActorCollection = "fleets"

// fleetActorOwner adapts the fleet service to action.ActorOwner at the
// composition root (replace-observation-with-sightings tasks.md 6.5): action
// declares the seam and resolves through it, and never imports fleet — that
// dependency already runs the other way (fleet imports action to commit and
// resolve), so reversing it would be an import cycle.
type fleetActorOwner struct{ fleets *fleet.Service }

// OwnerOf resolves an action actor to its owning corporation. An empty
// collection means the caller had no action document to read one off (the
// inbox endpoint); since fleets are the only actor collection in the system,
// both that case and an explicit "fleets" resolve through the fleet service.
// An actor in any other collection resolves to no owner rather than an error —
// the handler reads that as absence, which for an unknown collection is
// exactly right.
func (a fleetActorOwner) OwnerOf(ctx context.Context, collection, actorId string) (string, error) {
	if collection != "" && collection != fleetActorCollection {
		return "", nil
	}
	f, err := a.fleets.Get(ctx, actorId)
	if errors.Is(err, fleet.ErrNotFound) {
		return "", nil // a nonexistent actor is not an error; it simply has no owner
	}
	if err != nil {
		return "", fmt.Errorf("resolving the owning corporation of actor %q: %w", actorId, err)
	}
	if f == nil {
		return "", nil
	}
	return f.CorporationId, nil
}

// galaxyFogAdapter adapts charts.Service to galaxy.GraphFog at the
// composition root: charts imports galaxy (galaxy.LaneIdBetween, for its
// gate-attachment writer — replace-observation-with-sightings design.md
// Decision 3), so galaxy cannot import charts back without a cycle.
// galaxy.GraphFog therefore takes raw tier strings; this is the one seam
// that converts charts' typed Tier to the string the wire already carries.
type galaxyFogAdapter struct{ charts *charts.Service }

func (a galaxyFogAdapter) SystemTiers(ctx context.Context, cid string) (map[string]string, error) {
	tiers, err := a.charts.SystemTiers(ctx, cid)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(tiers))
	for systemID, tier := range tiers {
		out[systemID] = string(tier)
	}
	return out, nil
}

func (a galaxyFogAdapter) ChartedLanes(ctx context.Context, cid string) (map[string]bool, error) {
	return a.charts.ChartedLanes(ctx, cid)
}
