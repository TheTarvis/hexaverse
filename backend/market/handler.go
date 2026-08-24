package market

import (
	"errors"
	"net/http"

	"hexaverse/common"
	"hexaverse/corporations"
	"hexaverse/fleet"
	"hexaverse/stations"

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

// RegisterRoutes wires the price board and the sell verb. writeQuota guards only
// the credit-mutating route — it is additive to, never a replacement for, the
// general per-IP tier the whole authorized group already carries.
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup, writeQuota gin.HandlerFunc) {
	authorized.GET("/market/board", h.GetBoard)
	authorized.POST("/fleets/:fleetId/sell", writeQuota, h.Sell)
}

// GetBoard serves the remote price board. GET /v1/market/board
func (h *Handler) GetBoard(c *gin.Context) {
	out, err := h.svc.GetBoard(c.Request.Context(), common.ActorCorp(c))
	if err != nil {
		log.Error().Ctx(c).Err(err).Msg("Failed to read market board")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, out)
}

// Sell settles a sale from a docked fleet's hold.
// POST /v1/fleets/:fleetId/sell
func (h *Handler) Sell(c *gin.Context) {
	fleetID := common.RequiredHttpParam(c, "fleetId")
	if fleetID == "" {
		return
	}

	var req SellRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// The acting corporation comes ONLY from the server-resolved actor — never
	// from a client-supplied field, query param, or header. SellRequest carries
	// no corporationId at all, so there is nothing to ignore.
	res, err := h.svc.Sell(c.Request.Context(), common.Actor(c), common.ActorCorp(c), fleetID, req)
	if err != nil {
		h.reject(c, err)
		return
	}
	c.JSON(http.StatusOK, res)
}

// reject maps every rejection to its status and reason.
//
// The four existence-hiding cases — unknown fleet, foreign fleet, unknown
// station, below-gate station — all collapse into ONE byte-identical 404 body,
// so probing across candidate ids yields uniform responses. Every other reason
// is distinguishable from every other.
func (h *Handler) reject(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrHidden):
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": ErrHidden.Error()})
	case errors.Is(err, ErrUnauthenticated):
		c.AbortWithStatus(http.StatusUnauthorized)

	case errors.Is(err, corporations.ErrOperationKeyFormat),
		errors.Is(err, corporations.ErrOperationKeyReserved),
		errors.Is(err, ErrInvalidTonnage),
		errors.Is(err, ErrInvalidGuard):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	case errors.Is(err, ErrNotDockedAtStation),
		errors.Is(err, ErrNotTradableHere),
		errors.Is(err, ErrZeroProceeds),
		errors.Is(err, ErrProceedsOverflow),
		errors.Is(err, ErrBudgetExhausted),
		errors.Is(err, ErrAbsorptionExhausted),
		errors.Is(err, ErrInsufficientCargo),
		errors.Is(err, fleet.ErrInsufficientCargo),
		errors.Is(err, stations.ErrRequestGone),
		errors.Is(err, stations.ErrRequestOversold):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	// A conflict, not a replay: the key was reused with different parameters.
	case errors.Is(err, corporations.ErrOperationConflict):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	// The board the client read is stale — distinguishable so the UI can refresh
	// the offer to the current price rather than freezing a dead one on screen.
	case errors.Is(err, ErrPriceChanged):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, corporations.ErrReconciliationDivergence),
		errors.Is(err, corporations.ErrChainBroken):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})

	// Contention: retry-able, and explicitly NOT a rejection of the sale's terms.
	case errors.Is(err, ErrBusy):
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})

	default:
		log.Error().Ctx(c).Err(err).Msg("Sale failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	}
}
