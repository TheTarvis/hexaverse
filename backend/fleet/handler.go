package fleet

import (
	"context"
	"errors"
	"net/http"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// AudienceFog resolves the #0004-delegated audience rule: a requester sees a
// fleet only if it's their own or inside their live sensor union. Nil on the
// dev path (no filtering).
type AudienceFog interface {
	FleetVisibleTo(ctx context.Context, requesterCid string, f observation.FleetPos, now common.WorldMillis) (bool, error)
}

type Handler struct {
	svc   ServiceInterface
	clock common.WorldTime
	fog   AudienceFog
}

func NewHandler() *Handler {
	return &Handler{svc: NewService(), clock: common.WorldClock()}
}

func NewHandlerWith(svc ServiceInterface, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

// WithFog wires the audience filter into fleet reads.
func (h *Handler) WithFog(fog AudienceFog) *Handler {
	h.fog = fog
	return h
}

func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	g := authorized.Group("/fleets")
	{
		g.GET("", h.List)
		g.GET("/:fleetId", h.Get)
		g.POST("/:fleetId/orders", h.Order)
		g.POST("/:fleetId/cancel", h.Cancel)
		g.POST("/:fleetId/scan", h.Scan)
		// Dev-only: drop a fleet into a system. TODO(#0009): spawn replaces this.
		g.POST("/dev-seed", h.DevSeed)
	}
}

func (h *Handler) Get(c *gin.Context) {
	f, err := h.svc.Get(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	if err != nil {
		h.respond(c, nil, err)
		return
	}
	// Audience fog: own fleets are never fogged; a foreign fleet the requester
	// can't currently sense reads as not-found (server-authoritative filtering).
	if h.fog != nil {
		pos, _ := h.svc.Position(c.Request.Context(), f)
		vis, err := h.fog.FleetVisibleTo(c.Request.Context(), common.ActorCorp(c),
			observation.FleetPos{Id: f.Id, CorporationId: f.CorporationId, SystemId: f.SystemId, Hex: pos}, h.clock.Now())
		if err != nil {
			log.Error().Ctx(c).Err(err).Str("fleetId", f.Id).Msg("fleet audience check failed")
			c.AbortWithStatus(http.StatusInternalServerError)
			return
		}
		if !vis {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
	}
	c.JSON(http.StatusOK, h.toDTO(c, f))
}

// List returns every fleet the requester may see in a system: their own units
// always, plus foreign fleets currently inside their live sensor union (audience
// fog, per fleet). It's the board's fleet layer — a single read alongside the
// interior read, both fogged server-side, so no unfogged fleet ever reaches the
// client (#0007). Read-only: it never settles a due arrival.
func (h *Handler) List(c *gin.Context) {
	systemID := common.RequiredQueryParam(c, "systemId")
	if systemID == "" {
		return // RequiredQueryParam already aborted with 400
	}
	fleets, err := h.svc.ListInSystem(c.Request.Context(), systemID)
	if err != nil {
		log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("list fleets failed")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	requesterCid := common.ActorCorp(c)
	out := make([]fleetDTO, 0, len(fleets))
	for i := range fleets {
		f := &fleets[i]
		pos, err := h.svc.Position(c.Request.Context(), f)
		if err != nil {
			log.Warn().Ctx(c).Err(err).Str("fleetId", f.Id).Msg("could not resolve fleet position")
		}
		// Own units are never fogged; only foreign fleets face the audience check
		// (which also spares a per-own-unit coverage computation).
		if h.fog != nil && f.CorporationId != requesterCid {
			vis, err := h.fog.FleetVisibleTo(c.Request.Context(), requesterCid,
				observation.FleetPos{Id: f.Id, CorporationId: f.CorporationId, SystemId: f.SystemId, Hex: pos}, h.clock.Now())
			if err != nil {
				log.Error().Ctx(c).Err(err).Str("fleetId", f.Id).Msg("fleet audience check failed")
				c.AbortWithStatus(http.StatusInternalServerError)
				return
			}
			if !vis {
				continue
			}
		}
		out = append(out, h.dtoFor(f, pos, requesterCid))
	}
	c.JSON(http.StatusOK, gin.H{"fleets": out, "worldTime": h.clock.Now()})
}

func (h *Handler) Scan(c *gin.Context) {
	f, err := h.svc.Scan(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	if errors.Is(err, action.ErrActiveActionExists) {
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "fleet already has an action in progress"})
		return
	}
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
	// Default ownership to the seeder's corporation so a dev-seeded fleet is one
	// the requester can drive and see as their own (#0009 spawn replaces this).
	corp := req.CorporationId
	if corp == "" {
		corp = common.ActorCorp(c)
	}
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

// fleetDTO is the read shape: the movement state plus the computed live position
// and worldTime, so the client can render immediately. `own` tells the client
// whether it may drive this fleet and render its committed path — a foreign
// fleet's `state` is stripped to a snapshot (mode + position, no path or ETA),
// so audience fog never leaks another corporation's plan (#0004/#0007).
type fleetDTO struct {
	Id            string              `json:"id"`
	CorporationId string              `json:"corporationId"`
	SystemId      string              `json:"systemId"`
	State         board.MovementState `json:"state"`
	Position      board.Hex           `json:"position"`
	Own           bool                `json:"own"`
	WorldTime     common.WorldMillis  `json:"worldTime"`
}

func (h *Handler) toDTO(c *gin.Context, f *Fleet) fleetDTO {
	pos, err := h.svc.Position(c.Request.Context(), f)
	if err != nil {
		log.Warn().Ctx(c).Err(err).Str("fleetId", f.Id).Msg("could not resolve fleet position")
	}
	return h.dtoFor(f, pos, common.ActorCorp(c))
}

func (h *Handler) dtoFor(f *Fleet, pos board.Hex, requesterCid string) fleetDTO {
	own := requesterCid != "" && f.CorporationId == requesterCid
	state := f.State
	if !own {
		// Snapshot only — the audience sees where a foreign fleet is, never its
		// committed path, coast elements, or arrival ETA.
		state = board.MovementState{Mode: f.State.Mode}
	}
	return fleetDTO{
		Id:            f.Id,
		CorporationId: f.CorporationId,
		SystemId:      f.SystemId,
		State:         state,
		Position:      pos,
		Own:           own,
		WorldTime:     h.clock.Now(),
	}
}
