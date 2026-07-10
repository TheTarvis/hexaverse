package fleet

import (
	"errors"
	"net/http"

	"hexaverse/board"
	"hexaverse/common"

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
	g := authorized.Group("/fleets")
	{
		g.GET("/:fleetId", h.Get)
		g.POST("/:fleetId/orders", h.Order)
		g.POST("/:fleetId/cancel", h.Cancel)
		// Dev-only: drop a fleet into a system. TODO(#0009): spawn replaces this.
		g.POST("/dev-seed", h.DevSeed)
	}
}

func (h *Handler) Get(c *gin.Context) {
	f, err := h.svc.Get(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	h.respond(c, f, err)
}

func (h *Handler) Order(c *gin.Context) {
	var req OrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.Target.Hex == nil && req.Target.FeatureId == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "target must be a hex or featureId"})
		return
	}
	f, err := h.svc.OrderTo(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"), req)
	h.respond(c, f, err)
}

func (h *Handler) Cancel(c *gin.Context) {
	f, err := h.svc.Cancel(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	h.respond(c, f, err)
}

type devSeedRequest struct {
	SystemId      string    `json:"systemId"`
	CorporationId string    `json:"corporationId"`
	At            board.Hex `json:"at"`
}

func (h *Handler) DevSeed(c *gin.Context) {
	var req devSeedRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.SystemId == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "systemId is required"})
		return
	}
	corp := req.CorporationId
	if corp == "" {
		corp = "dev-corp"
	}
	f, err := h.svc.SeedFleet(c.Request.Context(), req.SystemId, corp, req.At)
	if err != nil {
		log.Error().Ctx(c).Err(err).Msg("dev-seed fleet failed")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusCreated, h.toDTO(c, f))
}

func (h *Handler) respond(c *gin.Context, f *Fleet, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case errors.Is(err, ErrFeatureAbsent):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "target feature not found"})
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("fleet operation failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, h.toDTO(c, f))
	}
}

// fleetDTO is the read shape: the movement state plus the computed live
// position and worldTime, so the client can render immediately.
type fleetDTO struct {
	Id            string              `json:"id"`
	CorporationId string              `json:"corporationId"`
	SystemId      string              `json:"systemId"`
	State         board.MovementState `json:"state"`
	Position      board.Hex           `json:"position"`
	WorldTime     common.WorldMillis  `json:"worldTime"`
}

func (h *Handler) toDTO(c *gin.Context, f *Fleet) fleetDTO {
	pos, err := h.svc.Position(c.Request.Context(), f)
	if err != nil {
		log.Warn().Ctx(c).Err(err).Str("fleetId", f.Id).Msg("could not resolve fleet position")
	}
	return fleetDTO{
		Id:            f.Id,
		CorporationId: f.CorporationId,
		SystemId:      f.SystemId,
		State:         f.State,
		Position:      pos,
		WorldTime:     h.clock.Now(),
	}
}
