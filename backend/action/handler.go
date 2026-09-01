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
	// owner resolves an action's actor to its owning corporation — the seam
	// every one of the four endpoints below authorizes through
	// (action-dispatch "Action Endpoints Are Restricted to the Owning
	// Corporation"). Supplied by the composition root via WithActorOwner.
	owner ActorOwner
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc, clock: common.WorldClock()}
}

func NewHandlerWith(svc *Service, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

// WithActorOwner wires the actor→corporation resolution seam. router.go
// supplies an adapter over the fleet service; a handler without one serves no
// actor-scoped endpoint at all (see ownsActor).
func (h *Handler) WithActorOwner(owner ActorOwner) *Handler {
	h.owner = owner
	return h
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

// ownsActor decides whether the requester's corporation owns the named actor,
// answering `404 Not Found` with an empty body — never `403`, never a body
// naming the actor or the reason — when it does not, or when the requester has
// no corporation at all (action-dispatch "Action Endpoints Are Restricted to
// the Owning Corporation": a foreign actor is indistinguishable from a
// nonexistent one, and a 403 would itself confirm the actor exists —
// design.md Decision 21).
//
// collection is the actor's home collection (Action.ActorCollection), or ""
// when the request names an actor id alone and no action document has been
// read — see ActorOwner's own doc comment.
func (h *Handler) ownsActor(c *gin.Context, collection, actorId string) bool {
	requesterCid := common.ActorCorp(c)
	if requesterCid == "" {
		c.AbortWithStatus(http.StatusNotFound)
		return false
	}
	if h.owner == nil {
		// An unwired seam cannot authorize anything; refusing is the only safe
		// reading. Logged at Error because it is a composition-root defect, not
		// a request-level one.
		log.Error().Ctx(c).Msg("action handler has no ActorOwner wired; refusing every actor-scoped request")
		c.AbortWithStatus(http.StatusNotFound)
		return false
	}
	ownerCid, err := h.owner.OwnerOf(c.Request.Context(), collection, actorId)
	if err != nil {
		// IMPLEMENTATION CHOICE, NOT A SPEC REQUIREMENT. tasks.md 7.7 item (3)
		// records that no scenario in this change decides whether an
		// ActorOwner lookup ERROR should fail open or closed (unlike
		// request-authorization's corporation-resolution seam, which
		// explicitly fails open). This handler fails CLOSED: the seam exists
		// solely to authorize, so an unanswered "who owns this?" cannot be
		// read as "you do". The failure is indistinguishable from absence, as
		// every other rejection on these endpoints is.
		log.Error().Ctx(c).Err(err).Str("actor", actorId).Msg("resolving an action actor's owner failed")
		c.AbortWithStatus(http.StatusNotFound)
		return false
	}
	if ownerCid == "" || ownerCid != requesterCid {
		c.AbortWithStatus(http.StatusNotFound)
		return false
	}
	return true
}

// ownedAction loads the action a request names and returns it only to the
// corporation that owns its underlying actor; on false the 404 is already
// written.
func (h *Handler) ownedAction(c *gin.Context) (*Action, bool) {
	actionId := common.RequiredHttpParam(c, "actionId")
	if actionId == "" {
		return nil, false // RequiredHttpParam already aborted with 400
	}
	a, err := h.svc.Get(c.Request.Context(), actionId)
	if err != nil {
		h.respond(c, nil, err)
		return nil, false
	}
	if !h.ownsActor(c, a.ActorCollection, a.Actor) {
		return nil, false
	}
	return a, true
}

// Inbox query parameter names. Named constants rather than
// common.RequiredQueryParam/OptionalQueryParam: the required-param helper
// aborts with its own body ("Missing required parameter: actor") and an
// Error-level log, which is not the 400 contract this endpoint already serves.
const (
	actorQueryParam  = "actor"
	statusQueryParam = "status"
)

func (h *Handler) Inbox(c *gin.Context) {
	actor := c.Query(actorQueryParam)
	if actor == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "actor query param is required"})
		return
	}
	// The inbox names an actor id and no collection — hence the empty
	// collection argument. The check runs before the query, so a foreign
	// actor's actions are never read, let alone served.
	if !h.ownsActor(c, "", actor) {
		return
	}
	var statuses []Status
	if s := c.Query(statusQueryParam); s != "" {
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
	a, ok := h.ownedAction(c)
	if !ok {
		return
	}
	h.respond(c, a, nil)
}

func (h *Handler) Acknowledge(c *gin.Context) {
	owned, ok := h.ownedAction(c)
	if !ok {
		return
	}
	a, err := h.svc.Acknowledge(c.Request.Context(), owned.Id)
	h.respond(c, a, err)
}

func (h *Handler) Cancel(c *gin.Context) {
	owned, ok := h.ownedAction(c)
	if !ok {
		return
	}
	a, err := h.svc.Cancel(c.Request.Context(), owned.Id, nil)
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
