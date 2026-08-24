package stations

import (
	"errors"
	"net/http"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	svc ServiceInterface
}

func NewHandler(svc ServiceInterface) *Handler { return &Handler{svc: svc} }

// RegisterRoutes wires the direct station read onto the systems group, so a
// station reads as what it is: a property of a system.
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	authorized.GET("/systems/:systemId/station", h.GetStation)
}

// GetStation returns one system's station. GET /v1/systems/:systemId/station
//
// 404 for an unknown system AND for a system below the requester's visibility
// tier — deliberately the same response, so the endpoint cannot be used to probe
// which systems carry stations (and therefore where corporations woke up).
func (h *Handler) GetStation(c *gin.Context) {
	systemID := common.RequiredHttpParam(c, "systemId")
	if systemID == "" {
		return
	}

	st, err := h.svc.GetVisible(c.Request.Context(), common.ActorCorp(c), systemID)
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case err != nil:
		log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to read station")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, st)
	}
}
