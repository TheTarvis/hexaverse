package system

import (
	"context"
	"errors"
	"net/http"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/observation"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// BoardFog is the interior read's one remaining fog dependency: the
// requester's graph-tier knowledge, so lane gates ship only for charted
// neighbours (chartedGates) — no leaking uncharted stars. Nil on the
// logged-out/dev path — the interior then ships every gate unfiltered.
//
// Until migrate-fleet-to-continuous-burns tasks.md 7.7 this interface also
// carried the two methods a per-requester feature projection read (a live
// sensor-coverage lookup and a stored per-feature memory lookup). Both are
// deleted along with that projection (design.md Decision 11): every feature
// now ships in full to every authenticated requester (see projectUnfogged),
// so nothing here needs either any more. Lane gate filtering by charted tier
// is the one piece of per-requester fog that survives this change
// (system-interior: "Charted Lane Gate Filtering").
type BoardFog interface {
	SystemTiers(ctx context.Context, cid string) (map[string]observation.Tier, error)
}

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
// (the dev-only trigger until #0008). Every feature ships in full to every
// authenticated requester (system-interior: "Interior Reads Are Fully
// Disclosed, A Deliberate Interim" — migrate-fleet-to-continuous-burns
// tasks.md 7.7, design.md Decision 11); the one piece of per-requester
// filtering that survives is lane gates, restricted to the requester's
// charted neighbours when a corp id resolves.
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

	// tasks.md 7.7 (design.md Decision 11): every feature ships in full to
	// every authenticated requester — no per-requester band computed, no
	// feature omitted. See fog.go's projectUnfogged doc comment for the
	// interim's scope and its stated successor (link 5,
	// replace-observation-with-sightings).
	features := projectUnfogged(gen)
	if h.fog != nil {
		if cid := common.ActorCorp(c); cid != "" {
			tiers, err := h.fog.SystemTiers(ctx, cid)
			if err != nil {
				log.Error().Ctx(c).Err(err).Str("systemId", systemID).Msg("Failed to load system tiers")
				c.AbortWithStatus(http.StatusInternalServerError)
				return
			}
			gates = chartedGates(gates, tiers)
		}
	}
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
