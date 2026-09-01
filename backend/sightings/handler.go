package sightings

import (
	"net/http"
	"strconv"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// Handler serves the sighting pile's read endpoint.
type Handler struct {
	svc *Service
}

// NewHandler constructs a Handler over svc.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterRoutes wires GET /v1/sightings.
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup) {
	authorized.GET("/sightings", h.List)
}

// List serves the caller's own corporation's sighting pile, newest
// pulse-reach first, bounded to a page (query params: limit, cursor).
// GET /v1/sightings
//
// A corpless requester's pile is empty — this change's own delta leaves that
// case unpinned by any scenario (tasks.md 7.7 item 1); the empty-response
// treatment mirrors this capability's other corpless-read precedent
// (system-interior's empty `contacts` array) rather than erroring.
func (h *Handler) List(c *gin.Context) {
	cid := common.ActorCorp(c)
	if cid == "" {
		c.JSON(http.StatusOK, gin.H{"sightings": []Sighting{}, "nextCursor": ""})
		return
	}

	limit := 0
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	cursor := c.Query("cursor")

	records, nextCursor, err := h.svc.List(c.Request.Context(), cid, limit, cursor)
	if err != nil {
		log.Error().Ctx(c).Err(err).Msg("Failed to read sighting pile")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	if records == nil {
		records = []Sighting{}
	}
	c.JSON(http.StatusOK, gin.H{"sightings": records, "nextCursor": nextCursor})
}
