package refuel

import (
	"errors"
	"net/http"

	"hexaverse/common"
	"hexaverse/corporations"
	"hexaverse/fleet"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	svc   *Service
	clock common.WorldTime
}

func NewHandler(svc *Service, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

// RegisterRoutes wires the refuel verb. writeQuota guards only this
// credit-mutating route — additive to, never a replacement for, the
// general per-IP tier the whole authorized group already carries
// (request-authorization "Per-Corporation Write Quota on Player-Initiated
// Trade Routes": named alongside sell).
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup, writeQuota gin.HandlerFunc) {
	authorized.POST("/fleets/:fleetId/refuel", writeQuota, h.Refuel)
}

// Refuel settles a fuel purchase from a docked fleet's own home station.
// POST /v1/fleets/:fleetId/refuel
func (h *Handler) Refuel(c *gin.Context) {
	fleetID := common.RequiredHttpParam(c, "fleetId")
	if fleetID == "" {
		return
	}

	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// The acting corporation comes ONLY from the server-resolved actor —
	// never from a client-supplied field (request-authorization "The Sell
	// and Refuel Endpoints Ignore a Client-Supplied Corporation Id").
	// Request carries no corporationId field at all, so there is nothing to
	// ignore beyond an arbitrary extra JSON key ShouldBindJSON already
	// discards.
	res, err := h.svc.Refuel(c.Request.Context(), common.Actor(c), common.ActorCorp(c), fleetID, req)
	if err != nil {
		h.reject(c, err)
		return
	}
	c.JSON(http.StatusOK, res)
}

// reject maps every rejection to its status and reason — the two
// existence-hiding cases (unknown fleet, foreign fleet) collapse into ONE
// byte-identical 404 body; every other reason is distinguishable.
func (h *Handler) reject(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrHidden):
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": ErrHidden.Error()})
	case errors.Is(err, ErrUnauthenticated):
		c.AbortWithStatus(http.StatusUnauthorized)

	case errors.Is(err, corporations.ErrOperationKeyFormat),
		errors.Is(err, corporations.ErrOperationKeyReserved),
		errors.Is(err, ErrInvalidTonnage):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	case errors.Is(err, ErrNotDockedAtStation),
		errors.Is(err, ErrExceedsFreeHold),
		errors.Is(err, ErrMisconfiguredPrice),
		errors.Is(err, ErrCostOverflow),
		errors.Is(err, ErrZeroCost),
		errors.Is(err, corporations.ErrInsufficientCredits):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	// A conflict, not a replay: the key was reused with different
	// parameters (fuel-purchase "A reused key naming different parameters
	// is rejected as a conflict").
	case errors.Is(err, corporations.ErrOperationConflict):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, corporations.ErrReconciliationDivergence),
		errors.Is(err, corporations.ErrChainBroken):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})

	// A refuel whose own transactional re-read still shows a station-keeping
	// hold at or after its stored dry instant applies NONE of its effects —
	// no purchased tonnage credited onto the stale figure — and is retryable
	// (fleet-movement "Every Decision Reading Fuel Settles a Past-Dry-Instant
	// Hold First"): the retry's own preceding settlement write observes the
	// now-past dry instant and settles it before the credit is re-evaluated.
	// Reason-bearing, never the bodyless 500 below.
	case errors.Is(err, fleet.ErrHoldExpiredMidCommit):
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})

	default:
		log.Error().Ctx(c).Err(err).Msg("Refuel failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	}
}
