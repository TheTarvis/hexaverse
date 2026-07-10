package system

import (
	"context"
	"errors"
	"net/http"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/observation"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// BoardFog is the fog dependency the interior read needs: the requester's live
// sensor union (Visible) and their stored per-feature memory (Remembered). Nil
// on the logged-out/dev path — the interior then ships unfogged.
type BoardFog interface {
	Coverage(ctx context.Context, cid, systemID string, now common.WorldMillis) (observation.Coverage, error)
	RememberedFeatures(ctx context.Context, cid, systemID string) (map[string]observation.FeatureMemory, error)
}

type Handler struct {
	svc   ServiceInterface
	clock common.WorldTime
	fog   BoardFog
}

func NewHandler() *Handler {
	return &Handler{svc: NewService(), clock: common.WorldClock()}
}

func NewHandlerWith(svc ServiceInterface, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

// WithFog wires the per-Corporation board fog into the interior read.
func (h *Handler) WithFog(fog BoardFog) *Handler {
	h.fog = fog
	return h
}

func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	authorized.GET("/systems/:systemId", h.GetInterior)
}

// GetInterior serves a system's interior, materializing it on first request (the
// dev-only trigger until #0008), then fogging it per requester at this boundary
// (#0006): the astronomical layer for anyone, live detail inside their sensor
// union, remembered features elsewhere.
func (h *Handler) GetInterior(c *gin.Context) {
	systemID := common.RequiredHttpParam(c, "systemId")
	ctx := c.Request.Context()

	gen, err := h.svc.GetOrCreateInterior(ctx, systemID)
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, galaxy.ErrSystemNotFound), errors.Is(err, galaxy.ErrNoLiveGalaxy):
		c.AbortWithStatus(http.StatusNotFound)
		return
	case err != nil:
		log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to get interior")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	now := h.clock.Now()
	features := projectUnfogged(gen)
	if h.fog != nil {
		if cid := common.ActorCorp(c); cid != "" {
			cov, err := h.fog.Coverage(ctx, cid, systemID, now)
			if err != nil {
				log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to compute coverage")
				c.AbortWithStatus(http.StatusInternalServerError)
				return
			}
			remembered, err := h.fog.RememberedFeatures(ctx, cid, systemID)
			if err != nil {
				log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to load remembered features")
				c.AbortWithStatus(http.StatusInternalServerError)
				return
			}
			features = projectFogged(gen, cov, remembered, now)
		}
	}
	c.JSON(http.StatusOK, interiorDTO{
		SystemId:  gen.Interior.SystemId,
		Radius:    gen.Interior.Radius,
		Character: gen.Interior.Character,
		StarClass: gen.Interior.StarClass,
		Features:  features,
		WorldTime: now,
	})
}

// --- Wire DTO --------------------------------------------------------------

type interiorDTO struct {
	SystemId  string             `json:"systemId"`
	Radius    int                `json:"radius"`
	Character string             `json:"character"`
	StarClass string             `json:"starClass"`
	Features  []fogFeatureDTO    `json:"features"`
	WorldTime common.WorldMillis `json:"worldTime"`
}
