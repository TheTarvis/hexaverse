package action

import (
	"errors"
	"net/http"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	svc   *Service
	clock common.WorldTime
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc, clock: common.WorldClock()}
}

func NewHandlerWith(svc *Service, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	g := authorized.Group("/actions")
	{
		// Inbox: ?actor=<fleetId>&status=<running|done|cancelled>.
		g.GET("", h.Inbox)
		g.GET("/:actionId", h.Get)
		g.POST("/:actionId/acknowledge", h.Acknowledge)
		// Generic cancel: flips status + releases the slot. Verbs with motion
		// state (a burning fleet) cancel through their own endpoint so they can
		// settle a coast — see POST /v1/fleets/:id/cancel.
		g.POST("/:actionId/cancel", h.Cancel)
	}
}

// actionDTO is the owner read shape. Every read carries worldTime so the client
// can compute a server-time offset and animate from it (#0005).
type actionDTO struct {
	Action
	WorldTime common.WorldMillis `json:"worldTime"`
}

func (h *Handler) toDTO(a Action) actionDTO {
	return actionDTO{Action: a, WorldTime: h.clock.Now()}
}

func (h *Handler) Inbox(c *gin.Context) {
	actor := c.Query("actor")
	if actor == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "actor query param is required"})
		return
	}
	var statuses []Status
	if s := c.Query("status"); s != "" {
		statuses = append(statuses, Status(s))
	}
	actions, err := h.svc.Inbox(c.Request.Context(), actor, statuses...)
	if err != nil {
		log.Error().Ctx(c).Err(err).Msg("inbox query failed")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	dtos := make([]actionDTO, len(actions))
	for i, a := range actions {
		dtos[i] = h.toDTO(a)
	}
	c.JSON(http.StatusOK, gin.H{"actions": dtos, "worldTime": h.clock.Now()})
}

func (h *Handler) Get(c *gin.Context) {
	a, err := h.svc.Get(c.Request.Context(), common.RequiredHttpParam(c, "actionId"))
	h.respond(c, a, err)
}

func (h *Handler) Acknowledge(c *gin.Context) {
	a, err := h.svc.Acknowledge(c.Request.Context(), common.RequiredHttpParam(c, "actionId"))
	h.respond(c, a, err)
}

func (h *Handler) Cancel(c *gin.Context) {
	a, err := h.svc.Cancel(c.Request.Context(), common.RequiredHttpParam(c, "actionId"), nil)
	h.respond(c, a, err)
}

func (h *Handler) respond(c *gin.Context, a *Action, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case errors.Is(err, ErrNotRunning):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "action is not running"})
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("action operation failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, h.toDTO(*a))
	}
}
