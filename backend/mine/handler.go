package mine

import (
	"errors"
	"net/http"

	"hexaverse/action"
	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	svc   ServiceInterface
	clock common.WorldTime
}

func NewHandlerWith(svc ServiceInterface, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	g := authorized.Group("/fleets")
	{
		g.POST("/:fleetId/mine", h.Commit)
	}
}

// mineResponseDTO is the success shape: the created action's id and frozen ETA
// (design.md "Mine Command Endpoint": "A committed mine run returns its action
// and ETA").
type mineResponseDTO struct {
	ActionId  string             `json:"actionId"`
	Eta       common.WorldMillis `json:"eta"`
	WorldTime common.WorldMillis `json:"worldTime"`
}

// Commit is POST /v1/fleets/:fleetId/mine {featureId, kind, tons}. Maps every
// mine.Err* sentinel (service.go) to a distinguishing gin.H{"error": "<reason>"}
// response, following backend/fleet/handler.go's RoutePreview/Scan/Order
// convention (design.md Decision #19 / "Mine Commit Rejections Report a
// Distinguishable Reason").
func (h *Handler) Commit(c *gin.Context) {
	var req MineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	requesterCorpId := common.ActorCorp(c)
	fleetId := common.RequiredHttpParam(c, "fleetId")

	a, err := h.svc.Commit(c.Request.Context(), requesterCorpId, fleetId, req)
	switch {
	case errors.Is(err, ErrUnauthenticated):
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
	case errors.Is(err, ErrForeignFleet):
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, ErrInvalidTonnage):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrSubMinimumRun):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrNotDocked):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrStationNotMineable):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrUnknownKind):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrLodeDepleted):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrNoMiningCapability):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrOverFreeHold):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, action.ErrActiveActionExists):
		// The busy-slot reason (which of burn/lane-transit/mine holds the
		// slot) is already folded into err's message by Service.Commit
		// (design.md Decision #19's "names the occupying action kind").
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case err != nil:
		log.Error().Ctx(c).Err(err).Str("fleetId", fleetId).Msg("mine commit failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, mineResponseDTO{ActionId: a.Id, Eta: a.Eta, WorldTime: h.clock.Now()})
	}
}
