package fleet

import (
	"errors"
	"net/http"

	"hexaverse/common"
	"hexaverse/space"

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

// RegisterRoutes wires the surviving endpoint set (design.md Decision 21A):
// GET /route and POST /scan are deleted with no successor here (routing and
// scanning are chain link 4 sections 5/observation's own concerns).
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	g := authorized.Group("/fleets")
	{
		g.GET("", h.List)
		g.GET("/:fleetId", h.Get)
		g.POST("/:fleetId/orders", h.Order)
		g.POST("/:fleetId/cancel", h.Cancel)
		g.POST("/:fleetId/cut-drive", h.CutDrive)
		g.POST("/:fleetId/stop", h.Stop)
		g.POST("/:fleetId/jump", h.Jump)
	}
}

// Get returns the requester's own fleet in full; a fleet belonging to
// another corporation 404s outright — permanently, not an interim
// (fleet-movement "Fleet Read Endpoints Serve Own Fleets In Full and
// Foreign Fleets As Contacts", replace-observation-with-sightings design.md
// Decision 7: a foreign fleet has no addressable identity, so this 404 is
// not a redaction, it is the shipped absence semantics — "a direct read of
// an undisclosed entity is indistinguishable from absence." Foreign
// presence reaches a client through the interior read's `contacts`
// projection and nowhere else, mirrored here from List's own ownership
// check).
func (h *Handler) Get(c *gin.Context) {
	f, err := h.svc.Get(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	if err != nil {
		h.respond(c, nil, err)
		return
	}
	if requesterCid := common.ActorCorp(c); requesterCid == "" || f.CorporationId != requesterCid {
		h.respond(c, nil, ErrNotFound)
		return
	}
	dto, err := h.toDTO(c, f)
	if err != nil {
		h.respond(c, nil, err)
		return
	}
	c.JSON(http.StatusOK, dto)
}

// List returns every fleet the requester may see in a system: their own
// units in full; foreign fleets are omitted entirely — permanently
// (fleet-movement "Fleet Read Endpoints Serve Own Fleets In Full and
// Foreign Fleets As Contacts": own fleets are returned in full, a foreign
// fleet is omitted from a list read, `mine=true` with no corporation
// returns an empty list). Read-only: it never settles a due arrival.
func (h *Handler) List(c *gin.Context) {
	requesterCid := common.ActorCorp(c)
	ctx := c.Request.Context()

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
		if requesterCid == "" || f.CorporationId != requesterCid {
			continue // foreign fleets are omitted entirely from a list read
		}
		dto, err := h.toDTO(c, f)
		if err != nil {
			log.Error().Ctx(c).Err(err).Str("fleetId", f.Id).Msg("could not resolve fleet position; omitting from list")
			continue
		}
		out = append(out, dto)
	}
	c.JSON(http.StatusOK, gin.H{"fleets": out, "worldTime": h.clock.Now()})
}

func (h *Handler) Order(c *gin.Context) {
	var req OrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	f, err := h.svc.OrderTo(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"), req)
	h.respond(c, f, err)
}

func (h *Handler) Cancel(c *gin.Context) {
	f, err := h.svc.Cancel(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	h.respond(c, f, err)
}

// CutDrive handles POST /v1/fleets/:fleetId/cut-drive (fleet-movement "Cut
// Drive Converts the Burn to a Drift and Goes Dark").
func (h *Handler) CutDrive(c *gin.Context) {
	f, err := h.svc.CutDrive(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	h.respond(c, f, err)
}

// Stop handles POST /v1/fleets/:fleetId/stop (fleet-movement "Stop In Place
// Commits a Velocity-Nulling Burn").
func (h *Handler) Stop(c *gin.Context) {
	f, err := h.svc.Stop(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"))
	h.respond(c, f, err)
}

// Jump handles POST /v1/fleets/:fleetId/jump {laneId} (fleet-movement "Lane
// Jump From a Docked Gate").
func (h *Handler) Jump(c *gin.Context) {
	var req JumpRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	f, err := h.svc.Jump(c.Request.Context(), common.RequiredHttpParam(c, "fleetId"), req.LaneId)
	h.respond(c, f, err)
}

func (h *Handler) respond(c *gin.Context, f *Fleet, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case errors.Is(err, ErrEmptyOrder), errors.Is(err, ErrAmbiguousOrder):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrFleetInTransit):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "fleet is in lane transit"})
	case errors.Is(err, ErrJumpNotAttached):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("fleet operation failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		dto, posErr := h.toDTO(c, f)
		if posErr != nil {
			h.respond(c, nil, posErr)
			return
		}
		c.JSON(http.StatusOK, dto)
	}
}

// fleetDTO is the read shape: the kinematic state plus the computed live
// position and worldTime, so the client can render immediately. `own` tells
// the client whether it may drive this fleet.
type fleetDTO struct {
	Id            string             `json:"id"`
	CorporationId string             `json:"corporationId"`
	SystemId      string             `json:"systemId"`
	State         space.ShipState    `json:"state"`
	AttachedTo    string             `json:"attachedTo,omitempty"`
	Jump          *JumpTransit       `json:"jump,omitempty"`
	Position      space.Vec3         `json:"position"`
	Own           bool               `json:"own"`
	WorldTime     common.WorldMillis `json:"worldTime"`
	// Roster is the owner-only ships/cargo/derived-capacity surface (#0010
	// "Fleet Read Surfaces Roster, Cargo, and Derived Capacity"). nil for a
	// foreign fleet — omitted from the JSON entirely (`omitempty`).
	Roster *rosterDTO `json:"roster,omitempty"`
}

// rosterDTO is the roster/cargo/derived-capacity read shape — populated only
// for the requester's own fleet.
type rosterDTO struct {
	Ships         []ShipEntry        `json:"ships"`
	Cargo         map[string]float64 `json:"cargo"`
	CargoCapacity float64            `json:"cargoCapacity"`
	FreeHold      float64            `json:"freeHold"`
	MiningRate    float64            `json:"miningRate"`
}

// rosterFieldsFor builds the owner-only roster/cargo DTO, or nil for a
// foreign fleet.
func rosterFieldsFor(f *Fleet, own bool) *rosterDTO {
	if !own {
		return nil
	}
	stats := DefaultClassStats()
	return &rosterDTO{
		Ships:         effectiveRoster(*f),
		Cargo:         f.Cargo,
		CargoCapacity: DerivedCapacity(*f, stats),
		FreeHold:      FreeHold(*f, stats),
		MiningRate:    DerivedMiningRate(*f, stats),
	}
}

// toDTO resolves the fleet's position (through its own system's body table)
// and shapes the read DTO. A mid-jump fleet's position resolves to the zero
// vector with no error surfaced to the caller — Jump being set is itself the
// disclosed fact; ErrFleetInTransit is an internal signal, not an HTTP
// failure.
func (h *Handler) toDTO(c *gin.Context, f *Fleet) (fleetDTO, error) {
	requesterCid := common.ActorCorp(c)
	own := requesterCid != "" && f.CorporationId == requesterCid

	var pos space.Vec3
	if resolved, err := h.svc.PositionOf(c.Request.Context(), f); err == nil {
		pos = resolved
	} else if !errors.Is(err, ErrFleetInTransit) {
		return fleetDTO{}, err
	}

	return fleetDTO{
		Id:            f.Id,
		CorporationId: f.CorporationId,
		SystemId:      f.SystemId,
		State:         f.State,
		AttachedTo:    f.AttachedTo,
		Jump:          f.Jump,
		Position:      pos,
		Own:           own,
		WorldTime:     h.clock.Now(),
		Roster:        rosterFieldsFor(f, own),
	}, nil
}
