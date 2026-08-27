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
// subspace tiers over the always-visible star map, plus their charted-lane set
// (#0006 Decision #17 — lanes are per-lane records written by travel and scan,
// not derived from tiers). The star layer renders regardless. Nil on the
// logged-out path and in unit tests (every system reads starVisible, every lane
// ships).
type GraphFog interface {
	SystemTiers(ctx context.Context, cid string) (map[string]observation.Tier, error)
	ChartedLanes(ctx context.Context, cid string) (map[string]bool, error)
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

// GetGalaxy serves the live galaxy's MATERIALIZED subset in the pinned #0002
// read contract — what collective observation has caused to exist, not "the
// galaxy" (the field is unbounded). It grows between calls as scans and spawns
// materialize new blocks, and its bounds track that extent. Every materialized
// system's star layer (position, region, skeleton) ships to everyone — newly
// materialized systems included, a deliberate decision: the field is public
// astronomy, and only activity LOCATION leaks, never actor identity, lanes, or
// tiers. The per-requester subspace tier decorates it (#0006). The read itself
// creates nothing.
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
	var charted map[string]bool
	if h.fog != nil {
		if cid := common.ActorCorp(c); cid != "" {
			tiers, err = h.fog.SystemTiers(c.Request.Context(), cid)
			if err != nil {
				log.Error().Ctx(c).Err(err).Msg("Failed to load subspace tiers")
				c.AbortWithStatus(http.StatusInternalServerError)
				return
			}
			charted, err = h.fog.ChartedLanes(c.Request.Context(), cid)
			if err != nil {
				log.Error().Ctx(c).Err(err).Msg("Failed to load charted lanes")
				c.AbortWithStatus(http.StatusInternalServerError)
				return
			}
			if charted == nil {
				charted = map[string]bool{} // a corp with no charted lanes sees none
			}
		}
	}
	c.JSON(http.StatusOK, ToDTO(gen, h.clock.Now(), tiers, charted))
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
	// Bridge marks a deterministic void-crossing stitch. The view renders it
	// distinctly (faint), but it behaves as an ordinary lane for every
	// interaction.
	Bridge bool `json:"bridge,omitempty"`
}

type galaxyDTO struct {
	Id      string      `json:"id"`
	Seed    int64       `json:"seed"`
	Bounds  Bounds      `json:"bounds"`
	Systems []systemDTO `json:"systems"`
	Lanes   []laneDTO   `json:"lanes"`
	// WorldTime satisfies the cross-cutting rule that every read returns it.
	WorldTime common.WorldMillis `json:"worldTime"`
}

// ToDTO maps the domain galaxy to the pinned wire contract. tiers is the
// requester's subspace knowledge (nil ⇒ every system star-visible); charted is
// their charted-lane set (nil ⇒ the no-fog baseline, every lane ships).
func ToDTO(gen *GeneratedGalaxy, now common.WorldMillis, tiers map[string]observation.Tier, charted map[string]bool) galaxyDTO {
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
	// Lanes are fog-filtered to the requester's charted network (#0006) — only
	// nodes are the free star map; unknown lanes never ship (no ship-and-hide).
	lanes := make([]laneDTO, 0, len(gen.Lanes))
	for _, l := range gen.Lanes {
		if !laneCharted(l, charted) {
			continue
		}
		lanes = append(lanes, laneDTO{Id: l.Id, AId: l.AId, BId: l.BId, Bridge: l.Bridge})
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

// laneCharted reports whether a lane belongs to the requester's charted network
// (#0006 Decision #17, 2026-07-14): a per-lane record written when the corp
// TRAVELED it or SCANNED a system it's incident to — no longer derived from
// Explored-incidence, so a fresh spawn sees no lanes at all until its first
// home scan. A nil set is the no-fog baseline (unit tests and the logged-out
// static start area, served separately) — every lane ships. The future third
// author of "charted" is purchased intel (the market); the schema leaves room,
// no writer yet.
func laneCharted(l Lane, charted map[string]bool) bool {
	if charted == nil {
		return true
	}
	return charted[l.Id]
}
