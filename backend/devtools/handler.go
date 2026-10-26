package devtools

import (
	"github.com/gin-gonic/gin"
	"hexaverse/config"
	"hexaverse/tuning"
	"strings"
)

func Gate() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		// SSE subscriptions never mutate gameplay and remain open indefinitely.
		// Holding a read lock for their lifetime would prevent Apply and reset.
		stream := c.Request.Method == "GET" && strings.HasPrefix(path, "/v1/channels/") && strings.HasSuffix(path, "/stream")
		if !config.LocalTuningAllowed() || !tuning.Enabled() || strings.HasPrefix(path, "/v1/dev/tuning") || stream {
			c.Next()
			return
		}
		gate.RLock()
		defer gate.RUnlock()
		c.Next()
	}
}
func RegisterRoutes(r *gin.RouterGroup, s *Service) {
	if !config.LocalTuningAllowed() || !tuning.Enabled() {
		return
	}
	g := r.Group("/dev/tuning")
	g.GET("", func(c *gin.Context) { c.JSON(200, tuning.Get()) })
	g.PUT("", func(c *gin.Context) {
		var p tuning.Profile
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if err := tuning.Validate(p, tuning.Get().Fields); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if err := s.Apply(c.Request.Context(), p); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, tuning.Get())
	})
	g.POST("/import", func(c *gin.Context) {
		var p tuning.Profile
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if err := tuning.Validate(p, tuning.Get().Fields); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		gate.Lock()
		defer gate.Unlock()
		if err := tuning.Stage(p); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, tuning.Get())
	})
	g.POST("/regenerate", func(c *gin.Context) {
		if err := s.Regenerate(c.Request.Context()); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, tuning.Get())
	})
}
