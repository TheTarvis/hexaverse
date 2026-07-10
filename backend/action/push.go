package action

import (
	"net/http"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// overdueThreshold is how late (in world ms) a resolved action must have been to
// warrant an ops warning. The sweep runs ~every 15 min, so anything much later
// than that window points at a stuck reader path worth investigating.
const overdueThreshold = common.WorldMillis(20 * 60 * 1000)

// RegisterPushRoutes wires the Scheduler-triggered sweep under the OIDC-verified
// /v1/push group. The sweep is an ordinary reader on a clock (#0005): it resolves
// everything due and logs overdue actions. Correctness never depends on it — all
// other behaviour holds with the sweep disabled.
func (h *Handler) RegisterPushRoutes(g *gin.RouterGroup) {
	g.POST("/action-sweep", h.Sweep)
}

func (h *Handler) Sweep(c *gin.Context) {
	ctx := c.Request.Context()
	now := h.clock.Now()
	resolved, err := h.svc.ResolveAllDue(ctx)
	if err != nil {
		log.Error().Ctx(c).Err(err).Msg("action sweep failed")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	overdue := 0
	for _, a := range resolved {
		if now-a.Eta > overdueThreshold {
			overdue++
			log.Warn().Ctx(c).Str("actionId", a.Id).Str("type", a.Type).
				Int64("eta", int64(a.Eta)).Int64("lateBy", int64(now-a.Eta)).
				Msg("Sweep resolved an overdue action")
		}
	}
	log.Info().Ctx(c).Int("resolved", len(resolved)).Int("overdue", overdue).Msg("Action sweep complete")
	c.JSON(http.StatusOK, gin.H{"resolved": len(resolved), "overdue": overdue, "worldTime": int64(now)})
}
