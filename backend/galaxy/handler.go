package galaxy

import (
	"errors"
	"net/http"

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
	authorized.GET("/galaxy", h.GetGalaxy)
}

// GetGalaxy serves the live galaxy in the pinned #0002 read contract.
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
	c.JSON(http.StatusOK, ToDTO(gen, h.clock.Now()))
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
	Id     string      `json:"id"`
	Coords Coords      `json:"coords"`
	Name   string      `json:"name"`
	Region Region      `json:"region"`
	// discovered is a fog stub — always true until #0006 replaces it (build order).
	Discovered bool        `json:"discovered"`
	Skeleton   skeletonDTO `json:"skeleton"`
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

// ToDTO maps the domain galaxy to the pinned wire contract.
func ToDTO(gen *GeneratedGalaxy, now common.WorldMillis) galaxyDTO {
	systems := make([]systemDTO, len(gen.Systems))
	for i, s := range gen.Systems {
		bodies := make([]bodyDTO, len(s.Skeleton.Bodies))
		for j, b := range s.Skeleton.Bodies {
			bodies[j] = bodyDTO{Type: b.Type, Ring: b.Ring}
		}
		systems[i] = systemDTO{
			Id:         s.Id,
			Coords:     s.Coords,
			Name:       s.Name,
			Region:     s.Region,
			Discovered: true,
			Skeleton:   skeletonDTO{StarClass: s.Skeleton.StarClass, Bodies: bodies},
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
