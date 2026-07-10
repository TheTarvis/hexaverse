package system

import (
	"errors"
	"net/http"

	"hexaverse/common"
	"hexaverse/galaxy"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	svc   ServiceInterface
	clock common.WorldTime
}

func NewHandler() *Handler {
	return &Handler{svc: NewService(), clock: common.WorldClock()}
}

func NewHandlerWith(svc ServiceInterface, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	authorized.GET("/systems/:systemId", h.GetInterior)
}

// GetInterior serves a system's interior, materializing it on first request
// (the dev-only trigger until #0008). Unfogged for now — M6 inserts the fog
// filter at this boundary, so the read path stays thin.
func (h *Handler) GetInterior(c *gin.Context) {
	systemID := common.RequiredHttpParam(c, "systemId")

	gen, err := h.svc.GetOrCreateInterior(c.Request.Context(), systemID)
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, galaxy.ErrSystemNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case errors.Is(err, galaxy.ErrNoLiveGalaxy):
		c.AbortWithStatus(http.StatusNotFound)
	case err != nil:
		log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to get interior")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, toDTO(gen, h.clock.Now()))
	}
}

// --- Wire DTO --------------------------------------------------------------

type interiorDTO struct {
	SystemId  string             `json:"systemId"`
	Radius    int                `json:"radius"`
	Character string             `json:"character"`
	StarClass string             `json:"starClass"`
	Features  []Feature          `json:"features"`
	WorldTime common.WorldMillis `json:"worldTime"`
}

func toDTO(gen *GeneratedInterior, now common.WorldMillis) interiorDTO {
	features := gen.Features
	if features == nil {
		features = []Feature{}
	}
	return interiorDTO{
		SystemId:  gen.Interior.SystemId,
		Radius:    gen.Interior.Radius,
		Character: gen.Interior.Character,
		StarClass: gen.Interior.StarClass,
		Features:  features,
		WorldTime: now,
	}
}
