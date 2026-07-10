package galaxy

import (
	"context"
	"errors"
	"net/http"

	"hexaverse/common"
	"hexaverse/observation"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// GraphFog is the fog dependency the graph read needs: the requester's monotonic
// subspace tiers over the always-visible star map (#0006). The star layer renders
// regardless; this only decorates each system with the requester's earned tier.
// Nil on the logged-out path and in unit tests (every system reads starVisible).
type GraphFog interface {
	SystemTiers(ctx context.Context, cid string) (map[string]observation.Tier, error)
}

type Handler struct {
	svc   ServiceInterface
	clock common.WorldTime
	fog   GraphFog
}

func NewHandler() *Handler {
	return &Handler{svc: NewService(), clock: common.WorldClock()}
}

func NewHandlerWith(svc ServiceInterface, clock common.WorldTime) *Handler {
	return &Handler{svc: svc, clock: clock}
}

// WithFog wires the per-Corporation fog filter into the graph read. Without it
// the read serves the free star map to everyone (no subspace tiers).
func (h *Handler) WithFog(fog GraphFog) *Handler {
	h.fog = fog
	return h
}

func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	authorized.GET("/galaxy", h.GetGalaxy)
}

// GetGalaxy serves the live galaxy in the pinned #0002 read contract. Every
// system's star layer (position, region, skeleton) ships to everyone; the
// per-requester subspace tier decorates it (#0006 — the discovered stub is gone).
func (h *Handler) GetGalaxy(c *gin.Context) {
	gen, err := h.svc.GetLive(c.Request.Context())
	switch {
	case errors.Is(err, ErrNoLiveGalaxy):
		c.AbortWithStatus(http.StatusNotFound)
		return
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("Failed to load live galaxy")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	var tiers map[string]observation.Tier
	if h.fog != nil {
		if cid := common.ActorCorp(c); cid != "" {
			tiers, err = h.fog.SystemTiers(c.Request.Context(), cid)
			if err != nil {
				log.Error().Ctx(c).Err(err).Msg("Failed to load subspace tiers")
				c.AbortWithStatus(http.StatusInternalServerError)
				return
			}
		}
	}
	c.JSON(http.StatusOK, ToDTO(gen, h.clock.Now(), tiers))
}

// --- Wire DTOs (the pinned #0002 contract) ---------------------------------

type bodyDTO struct {
	Type BodyType `json:"type"`
	Ring int      `json:"ring"`
}

type skeletonDTO struct {
	StarClass string    `json:"starClass"`
	Bodies    []bodyDTO `json:"bodies"`
}

type systemDTO struct {
	Id     string `json:"id"`
	Coords Coords `json:"coords"`
	Name   string `json:"name"`
	Region Region `json:"region"`
	// Tier is the requester's monotonic subspace knowledge over the free star map
	// (#0006 replaces the discovered stub): starVisible | rumored | surveyed |
	// explored. Absent observation ⇒ starVisible. The star layer renders regardless.
	Tier     string      `json:"tier"`
	Skeleton skeletonDTO `json:"skeleton"`
}

type laneDTO struct {
	Id  string `json:"id"`
	AId string `json:"aId"`
	BId string `json:"bId"`
}

type galaxyDTO struct {
	Id     string     `json:"id"`
	Seed   int64      `json:"seed"`
	Bounds Bounds     `json:"bounds"`
	Systems []systemDTO `json:"systems"`
	Lanes   []laneDTO   `json:"lanes"`
	// WorldTime satisfies the cross-cutting rule that every read returns it.
	WorldTime common.WorldMillis `json:"worldTime"`
}

// ToDTO maps the domain galaxy to the pinned wire contract. tiers is the
// requester's subspace knowledge (nil ⇒ every system star-visible).
func ToDTO(gen *GeneratedGalaxy, now common.WorldMillis, tiers map[string]observation.Tier) galaxyDTO {
	systems := make([]systemDTO, len(gen.Systems))
	for i, s := range gen.Systems {
		bodies := make([]bodyDTO, len(s.Skeleton.Bodies))
		for j, b := range s.Skeleton.Bodies {
			bodies[j] = bodyDTO{Type: b.Type, Ring: b.Ring}
		}
		tier := observation.TierStarVisible
		if t, ok := tiers[s.Id]; ok {
			tier = t
		}
		systems[i] = systemDTO{
			Id:       s.Id,
			Coords:   s.Coords,
			Name:     s.Name,
			Region:   s.Region,
			Tier:     string(tier),
			Skeleton: skeletonDTO{StarClass: s.Skeleton.StarClass, Bodies: bodies},
		}
	}
	lanes := make([]laneDTO, len(gen.Lanes))
	for i, l := range gen.Lanes {
		lanes[i] = laneDTO{Id: l.Id, AId: l.AId, BId: l.BId}
	}
	return galaxyDTO{
		Id:        gen.Galaxy.Id,
		Seed:      gen.Galaxy.Seed,
		Bounds:    gen.Galaxy.Bounds,
		Systems:   systems,
		Lanes:     lanes,
		WorldTime: now,
	}
}
