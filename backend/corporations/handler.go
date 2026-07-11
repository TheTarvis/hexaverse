package corporations

import (
	"errors"
	"net/http"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	svc ServiceInterface
}

// NewHandler takes the shared service router.go constructs (spawn orchestrates
// through the live fleet/fog/galaxy singletons) — there's no zero-arg constructor.
func NewHandler(svc ServiceInterface) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes wires the spawn + session-bootstrap routes. strictLimit guards
// the spawn surface (account-creation-spam analog, like account POST).
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup, strictLimit gin.HandlerFunc) {
	g := authorized.Group("/corporations")
	{
		g.POST("", strictLimit, h.Spawn)
		g.GET("/me", h.GetMine)
	}
}

// Spawn is the wake-up call: POST /v1/corporations {name}. Idempotent per account
// — a second call returns the existing living corp (200, not 201) — so the client
// can call it optimistically from the wake-up flow.
func (h *Handler) Spawn(c *gin.Context) {
	accountId := common.Actor(c)

	var req SpawnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := h.svc.Spawn(c.Request.Context(), accountId, req.Name)
	switch {
	case errors.Is(err, ErrNameRequired):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "name is required"})
	case errors.Is(err, ErrForbidden):
		c.AbortWithStatus(http.StatusForbidden)
	case errors.Is(err, ErrNoSpawnSite):
		log.Error().Ctx(c).Err(err).Msg("No spawn site satisfies the criteria")
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "no spawn site available"})
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("Spawn failed")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, result)
	}
}

// GetMine returns the caller's living corporation (404 before they've woken) — the
// client's session bootstrap. GET /v1/corporations/me.
func (h *Handler) GetMine(c *gin.Context) {
	accountId := common.Actor(c)

	corp, err := h.svc.GetForAccount(c.Request.Context(), accountId)
	switch {
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case err != nil:
		log.Error().Ctx(c).Err(err).Msg("Failed to get corporation")
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, corp)
	}
}
