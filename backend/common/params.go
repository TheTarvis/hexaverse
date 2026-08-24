package common

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// Param wraps a string parameter and provides validation methods
type Param struct {
	value string
	name  string
	c     *gin.Context
}

// HttpParam returns a Param wrapper for the given parameter
func HttpParam(c *gin.Context, name string) Param {
	return Param{
		value: c.Param(name),
		name:  name,
		c:     c,
	}
}

func RequiredHttpParam(c *gin.Context, name string) string {
	return HttpParam(c, name).Required()
}

func AccountIdParam(c *gin.Context) string {
	return RequiredHttpParam(c, "accountId")
}

// Required checks if the parameter is present and returns its value
func (p Param) Required() string {
	if p.value == "" {
		log.Error().
			Ctx(p.c).
			Msgf("Missing required parameter: %s", p.name)

		p.c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
			"error": "Missing required parameter: " + p.name,
		})
	}
	return p.value
}

// QueryParam returns a Param wrapper for the given query parameter
func QueryParam(c *gin.Context, name string) Param {
	return Param{
		value: c.Query(name),
		name:  name,
		c:     c,
	}
}

// RequiredQueryParam returns the query parameter value, aborting with 400 if missing
func RequiredQueryParam(c *gin.Context, name string) string {
	return QueryParam(c, name).Required()
}

// OptionalQueryParam returns the query parameter value or empty string if not present
func OptionalQueryParam(c *gin.Context, name string) string {
	return c.Query(name)
}

func LimitQuery(c *gin.Context) string {
	return OptionalQueryParam(c, "limit")
}

func OffsetQuery(c *gin.Context) string {
	return OptionalQueryParam(c, "offset")
}

// CursorQuery is the opaque pagination cursor a keyset-paginated read continues
// from — the trade ledger's (worldTime, docId) pair today. Distinct from
// OffsetQuery: an offset re-scans everything before it, which does not age well
// on a collection with no upper bound on its size.
func CursorQuery(c *gin.Context) string {
	return OptionalQueryParam(c, "cursor")
}
