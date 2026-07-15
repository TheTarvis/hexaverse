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
		g.GET("/:fleetId/route", h.RoutePreview)
		g.POST("/:fleetId/orders", h.Order)
		g.POST("/:fleetId/cancel", h.Cancel)
		g.POST("/:fleetId/scan", h.Scan)
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
	requesterCid := common.ActorCorp(c)
	ctx := c.Request.Context()

	// `?mine=true` lists the requester's own fleets across systems (transit
	// included) — the galaxy view's fleet layer; otherwise `?systemId=` scopes to
	// one board (the #0007 layer).
	var fleets []Fleet
	var err error
	if common.OptionalQueryParam(c, "mine") == "true" {
		if requesterCid == "" {
			c.JSON(http.StatusOK, gin.H{"fleets": []fleetDTO{}, "worldTime": h.clock.Now()})
			return
		}
		fleets, err = h.svc.ListForCorp(ctx, requesterCid)
	} else {
		systemID := common.RequiredQueryParam(c, "systemId")
		if systemID == "" {
			return // RequiredQueryParam already aborted with 400
		}
		fleets, err = h.svc.ListInSystem(ctx, systemID)
	}
	if err != nil {
		log.Error().Ctx(c).Err(err).Msg("list fleets failed")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
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

// RoutePreview returns the shortest-time lane route to `?systemId=` with per-leg
// and total ETA, without committing (#0008) — the preview a client shows before
// departing. A destination with no charted route (or the fleet's own system) is a
// 4xx with a clear reason, not a 500.
func (h *Handler) RoutePreview(c *gin.Context) {
	dest := common.RequiredQueryParam(c, "systemId")
	if dest == "" {
		return // RequiredQueryParam already aborted with 400
	}
	preview, err := h.svc.PreviewRoute(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"), dest)
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case errors.Is(err, ErrNoRoute):
		c.AbortWithStatusJSON(http.StatusUnprocessableEntity, gin.H{"error": "no charted route to destination"})
	case errors.Is(err, ErrSameSystem):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "destination is the current system"})
	case errors.Is(err, ErrTravelUnavailable):
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "travel is not available"})
	case err != nil:
		log.Error().Ctx(c).Err(err).Str("dest", dest).Msg("route preview failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, preview)
	}
}

// Scan commits the 360° sweep (#0006 Decision #21) — no body: one manual
// trigger, an automatic all-around sweep from wherever the fleet is at eta.
func (h *Handler) Scan(c *gin.Context) {
	f, err := h.svc.Scan(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	switch {
	case errors.Is(err, action.ErrActiveActionExists):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "fleet already has a scan in progress"})
	case errors.Is(err, ErrNotOnBoard):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "fleet is in lane transit — nothing around to scan"})
	default:
		h.respond(c, f, err)
	}
}

func (h *Handler) Order(c *gin.Context) {
	var req OrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	// A trip target is a systemId (#0008); a board target is a hex or feature
	// (#0004). Exactly one must be present.
	hasBoardTarget := req.Target.Hex != nil || req.Target.FeatureId != ""
	if req.SystemId == "" && !hasBoardTarget {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "target must be a hex, featureId, or systemId"})
		return
	}
	if req.SystemId != "" && hasBoardTarget {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "order a board target or a system, not both"})
		return
	}
	f, err := h.svc.OrderTo(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"), req)
	h.respond(c, f, err)
}

func (h *Handler) Cancel(c *gin.Context) {
	f, err := h.svc.Cancel(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	h.respond(c, f, err)
}

func (h *Handler) respond(c *gin.Context, f *Fleet, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case errors.Is(err, ErrFeatureAbsent):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "target feature not found"})
	case errors.Is(err, ErrCoreDestination):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "cannot move to or dock the star at the core"})
	case errors.Is(err, ErrNoRoute):
		c.AbortWithStatusJSON(http.StatusUnprocessableEntity, gin.H{"error": "no charted route to destination"})
	case errors.Is(err, ErrSameSystem):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "destination is the current system"})
	case errors.Is(err, ErrTravelUnavailable):
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "travel is not available"})
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
