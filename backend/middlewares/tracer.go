package middlewares

import (
	"{{PROJECT_SLUG}}/common"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func tracer() gin.HandlerFunc {
	return func(c *gin.Context) {
		tracer := c.GetHeader(common.TracerKey)
		if tracer == "" {
			tracer = uuid.New().String()
		}
		c.Set(common.TracerKey, tracer)
	}
}

var TRACER = tracer()
