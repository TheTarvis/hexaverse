package fleet

import (
	"context"
	"net/http"

	"hexaverse/disclosure"
	"hexaverse/discovery"
	"hexaverse/space"

	"github.com/gin-gonic/gin"
)

func (h *Handler) Survey(c *gin.Context) {
	id, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	var input struct {
		BodyId string `json:"bodyId"`
	}
	if c.ShouldBindJSON(&input) != nil || input.BodyId == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "bodyId is required"})
		return
	}
	svc, ok := h.svc.(interface {
		Survey(context.Context, string, string) (*Fleet, error)
	})
	if !ok {
		c.AbortWithStatus(http.StatusNotImplemented)
		return
	}
	f, err := svc.Survey(c.Request.Context(), id, input.BodyId)
	h.respond(c, f, err)
}

// SurveyOptions serves prerequisites at the command fleet boundary. The client
// never computes survey geometry or entitlements from renderer coordinates.
func (s *Service) SurveyOptions(ctx context.Context, id string) (map[string]interface{}, error) {
	f, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	duration := s.surveyDuration
	if duration <= 0 {
		duration = DefaultSurveyDuration
	}
	targets := []map[string]interface{}{}
	if f.Jump == nil {
		bt, e := s.bodiesFor(ctx, f.SystemId)
		if e != nil {
			return nil, e
		}
		bodies, e := s.discovery.Targets(ctx, f.SystemId)
		if e != nil {
			return nil, e
		}
		p, e := space.StatePosition(bt, f.State, s.clock.Now())
		if e != nil {
			return nil, e
		}
		for _, body := range bodies {
			if !discovery.Eligible(body.Kind) {
				continue
			}
			q, e := space.Position(bt, body.BodyId, s.clock.Now())
			reason := ""
			if body.Protected {
				reason = "Protected place"
			} else if f.ActiveScanId != "" {
				reason = "Sensor channel is busy"
			} else if e != nil || p.Sub(q).Length() > disclosure.FocusedScanRange {
				reason = "Move within survey range"
			}
			targets = append(targets, map[string]interface{}{"bodyId": body.BodyId, "eligible": reason == "", "reason": reason})
		}

	}
	return map[string]interface{}{"targets": targets, "range": disclosure.FocusedScanRange, "durationMs": duration, "survey": f.Survey, "outcome": f.LastSurveyOutcome, "sensorBusy": f.ActiveScanId != "", "inTransit": f.Jump != nil}, nil
}

func (h *Handler) SurveyOptions(c *gin.Context) {
	id, ok := h.commandedFleetId(c)
	if !ok {
		return
	}
	svc, ok := h.svc.(interface {
		SurveyOptions(context.Context, string) (map[string]interface{}, error)
	})
	if !ok {
		c.AbortWithStatus(http.StatusNotImplemented)
		return
	}
	result, err := svc.SurveyOptions(c.Request.Context(), id)
	if err != nil {
		h.respond(c, nil, err)
		return
	}
	result["worldTime"] = h.clock.Now()
	result["scale"] = h.clock.Scale()
	c.JSON(http.StatusOK, result)
}
