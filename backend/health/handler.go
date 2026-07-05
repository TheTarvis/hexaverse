package health

import (
	apiconfig "hexaverse/config"
	"net/http"

	"github.com/gin-gonic/gin"
)

type Payload struct {
	Healthy bool   `json:"healthy"`
	Version string `json:"version"`
	Name    string `json:"name"`
	Env     string `json:"env"`
	Test    bool   `json:"test"`
}

// @Title Health check
// @Description Get the health status of the API
// @Success 200 {object} Payload "API is healthy"
// @Resource health
// @Route /healthcheck [get]
func GetHealthcheck(c *gin.Context) {
	healthCheck := Payload{
		Healthy: true,
		Version: apiconfig.ServiceConfig.Version,
		Name:    apiconfig.ServiceConfig.ServiceName,
		Env:     apiconfig.ServiceConfig.Env,
		Test:    true,
	}
	c.IndentedJSON(http.StatusOK, healthCheck)
}
