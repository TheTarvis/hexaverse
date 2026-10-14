package discovery

import (
	"errors"
	"net/http"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{s} }
func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("/systems/:systemId/bodies/:bodyId/name", h.Name)
}
func (h *Handler) Name(c *gin.Context) {
	sid := common.RequiredHttpParam(c, "systemId")
	bid := common.RequiredHttpParam(c, "bodyId")
	cid := common.ActorCorp(c)
	if cid == "" {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	var input struct {
		Name      string `json:"name"`
		Confirmed bool   `json:"confirmed"`
	}
	if c.ShouldBindJSON(&input) != nil || !input.Confirmed {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "preview and explicit confirmation are required"})
		return
	}
	result, err := h.svc.ConfirmName(c.Request.Context(), sid, bid, cid, input.Name)
	switch {
	case errors.Is(err, ErrInvalid):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrForbidden):
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, ErrConflict), errors.Is(err, ErrLocked):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, ErrNotFound):
		c.AbortWithStatus(http.StatusNotFound)
	case err != nil:
		c.AbortWithStatus(http.StatusInternalServerError)
	default:
		c.JSON(http.StatusOK, result)
	}
}
