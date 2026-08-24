package corporations

import (
	"errors"
	"net/http"
	"strconv"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	svc ServiceInterface
}

// NewHandler takes the shared service router.go constructs (spawn orchestrates
// through the live fleet/fog/galaxy singletons) — there's no zero-arg constructor.
func NewHandler(svc ServiceInterface) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes wires the spawn + session-bootstrap routes. strictLimit guards
// the spawn surface (account-creation-spam analog, like account POST).
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup, strictLimit gin.HandlerFunc) {
	g := authorized.Group("/corporations")
	{
		g.POST("", strictLimit, h.Spawn)
		g.GET("/me", h.GetMine)
		// Owner-only ledger read. The corp id is in the PATH deliberately, even
		// though the only readable value is the requester's own: it makes the
		// foreign-corp rejection a real, testable request rather than an
		// unreachable branch. Existence is hidden (404, never 403) — the fog
		// convention this codebase already applies to foreign fleets and mine
		// targets.
		g.GET("/:corpId/ledger", h.GetLedger)
	}
}

// RegisterPushRoutes wires the reconciliation cadence's trigger. OIDC-verified
// (the pushGroup's middleware), never client-reachable — the same shape action's
// scheduled sweep uses.
func (h *Handler) RegisterPushRoutes(push *gin.RouterGroup) {
	push.POST("/credit-reconcile", h.ReconcileLedgers)
}

// ReconcileLedgers runs one reconciliation cycle across every living
// corporation. POST /v1/push/credit-reconcile.
//
// Reports 200 with the divergence count even when divergences are found: the
// cycle itself succeeded, and a non-2xx would make Cloud Scheduler retry a check
// that is working exactly as designed. The divergences are surfaced as
// attributable log signals, not as an HTTP failure.
func (h *Handler) ReconcileLedgers(c *gin.Context) {
	svc, ok := h.svc.(*Service)
	if !ok {
		c.AbortWithStatus(http.StatusNotImplemented)
		return
	}
	divergent, err := svc.ReconcileLedgers(c.Request.Context())
	if err != nil {
		log.Error().Ctx(c).Err(err).Msg("Reconciliation cycle failed")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if len(divergent) > 0 {
		log.Error().Ctx(c).
			Int("divergentCorporations", len(divergent)).
			Str("signal", "credit_reconciliation_cycle_divergent").
			Msg("Reconciliation cycle found divergences")
	}
	c.JSON(http.StatusOK, gin.H{"checked": true, "divergent": len(divergent)})
}

// Spawn is the wake-up call: POST /v1/corporations {name}. Idempotent per account
// — a second call returns the existing living corp (200, not 201) — so the client
// can call it optimistically from the wake-up flow.
func (h *Handler) Spawn(c *gin.Context) {
	accountId := common.Actor(c)

	var req SpawnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := h.svc.Spawn(c.Request.Context(), accountId, req.Name)
	switch {
	case errors.Is(err, ErrNameRequired):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "name is required"})
	case errors.Is(err, ErrForbidden):
		c.AbortWithStatus(http.StatusForbidden)
	case errors.Is(err, ErrNoSpawnSite):
		log.Error().Ctx(c).Err(err).Msg("No spawn site satisfies the criteria")
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "no spawn site available"})
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("Spawn failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, result)
	}
}

// GetLedger returns one bounded page of the requester's own trade ledger.
// GET /v1/corporations/:corpId/ledger?cursor=&limit=
//
// Owner-only, resolved through common.ActorCorp: any id but the requester's own
// living corporation reads 404, disclosing no figures and not even confirming
// the corporation exists. Unauthenticated (no corp resolves) is 401.
func (h *Handler) GetLedger(c *gin.Context) {
	corpID := common.RequiredHttpParam(c, "corpId")
	if corpID == "" {
		return
	}
	actorCorp := common.ActorCorp(c)
	if actorCorp == "" {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if actorCorp != corpID {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	page, err := h.svc.Ledger(c.Request.Context(), corpID, common.CursorQuery(c), parseLimit(common.LimitQuery(c)))
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("Failed to read ledger")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, page)
	}
}

// parseLimit clamps the caller's page size into the bounded range. An absent,
// malformed, or oversized limit falls back to the default rather than erroring —
// the ceiling is what matters, not punishing a sloppy client.
func parseLimit(raw string) int {
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 || n > LedgerPageSize {
		return LedgerPageSize
	}
	return n
}

// GetMine returns the caller's living corporation (404 before they've woken) — the
// client's session bootstrap. GET /v1/corporations/me.
func (h *Handler) GetMine(c *gin.Context) {
	accountId := common.Actor(c)

	corp, err := h.svc.GetForAccount(c.Request.Context(), accountId)
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("Failed to get corporation")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, corp)
	}
}
