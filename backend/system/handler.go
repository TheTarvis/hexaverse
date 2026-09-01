package system

import (
	"context"
	"errors"
	"net/http"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// BoardFog previously restricted the interior read's lane gates to the
// requester's charted neighbours. Removed as of replace-observation-with-
// sightings design.md Decision 5: standing next to a physical gate and
// reading the sign on it is how a corporation finds the roads, so every
// lane-gate body now ships unfiltered to every authenticated requester
// (system-interior "Bodies Are Public; Ships Are Disclosed" — "No body is
// omitted for lack of stored knowledge"). The interface is kept, now with no
// required methods, purely so WithFog keeps a stable wiring seam; nothing
// reads it any more.
type BoardFog interface{}

// DueActions is the #0005 read-fold seam: resolving a scope's due actions.
// The interior read runs it first, so a verb that completed while nobody was
// reading (a scan on a quiet board) settles — slot released, effects minted —
// before this read's fog projects. That is what makes the client's poll/eta
// refetches actually DELIVER a reveal instead of re-reading stale fog.
type DueActions interface {
	ResolveDue(ctx context.Context, scope string) ([]action.Action, error)
}

type Handler struct {
	svc     ServiceInterface
	clock   common.WorldTime
	fog     BoardFog
	actions DueActions
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

// WithActions wires the #0005 read-fold into the interior read.
func (h *Handler) WithActions(actions DueActions) *Handler {
	h.actions = actions
	return h
}

func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	authorized.GET("/systems/:systemId", h.GetInterior)
}

// GetInterior serves a system's interior, materializing it on first request
// (the dev-only trigger until #0008). Every feature and every lane-gate body
// ships in full, unconditionally, to every authenticated requester
// (system-interior: "Bodies Are Public; Ships Are Disclosed" —
// replace-observation-with-sightings design.md Decisions 4/5): no per-
// requester band computed, no body omitted for lack of stored knowledge.
func (h *Handler) GetInterior(c *gin.Context) {
	systemID := common.RequiredHttpParam(c, "systemId")
	ctx := c.Request.Context()

	// The read-fold (#0005): settle this scope's due actions before projecting,
	// so a completed scan's observations are already minted in THIS response.
	// Opportunistic — the read still serves if the fold fails.
	if h.actions != nil {
		if _, err := h.actions.ResolveDue(ctx, systemID); err != nil {
			log.Warn().Ctx(c).Err(err).Str("systemId", systemID).Msg("Due-action resolve failed on interior read")
		}
	}

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

	gates, err := h.svc.LaneGates(ctx, systemID, gen.Interior.Radius)
	if err != nil {
		log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to compute lane gates")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Every feature and every lane-gate body ships in full to every
	// authenticated requester — no per-requester band computed, no body
	// omitted (replace-observation-with-sightings design.md Decisions 4/5).
	features := projectUnfogged(gen)
	c.JSON(http.StatusOK, interiorDTO{
		SystemId:  gen.Interior.SystemId,
		Radius:    gen.Interior.Radius,
		Character: gen.Interior.Character,
		StarClass: gen.Interior.StarClass,
		Features:  features,
		LaneGates: gates,
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
	LaneGates []LaneGate         `json:"laneGates"`
	WorldTime common.WorldMillis `json:"worldTime"`
}
