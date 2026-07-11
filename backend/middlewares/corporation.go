package middlewares

import (
	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// ResolveCorporation resolves the requester's living corporation once per request
// and stashes it under common.CorpIdKey — the single seam common.ActorCorp reads
// (#0009). Non-blocking: an account with no corp (the wake-up flow's own POST
// /corporations, or any read before waking) simply carries an empty corp, so it
// is never rejected here — ownership checks downstream see "" and behave as
// corpless (baseline fog, no owned assets).
//
// Runs AFTER FirebaseUidToAccountMiddleware (it needs the resolved account id).
func ResolveCorporation(resolve func(ctx *gin.Context, accountId string) (string, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		accountId := common.Actor(c)
		if accountId == "" {
			c.Next()
			return
		}
		corpID, err := resolve(c, accountId)
		if err != nil {
			// A resolution error must not fail every read — log and continue
			// corpless (fail-open to baseline, never leak another corp's view).
			log.Warn().Ctx(c).Err(err).Str("account_id", accountId).Msg("Corporation resolution failed; continuing corpless")
			c.Next()
			return
		}
		if corpID != "" {
			c.Set(common.CorpIdKey, corpID)
		}
		c.Next()
	}
}
