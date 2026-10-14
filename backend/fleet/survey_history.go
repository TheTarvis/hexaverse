package fleet

import (
	"hexaverse/action"
	"hexaverse/common"
)

// A journal exists only while Survey owns the sensor channel. State changes
// append the old trajectory, not sampled positions, so offline settlement can
// prove the entire interval even after a departure and return.
func surveyTransition(old, next map[string]interface{}, at common.WorldMillis) (map[string]interface{}, error) {
	raw, ok := old["survey"].(map[string]interface{})
	if !ok {
		return next, nil
	}
	if _, terminal := next["survey"]; terminal {
		return next, nil
	}
	_, motion := next["state"]
	_, jump := next["jump"]
	_, system := next["systemId"]
	if !motion && !jump && !system {
		return next, nil
	}
	if next == nil {
		next = map[string]interface{}{}
	}
	window := map[string]interface{}{}
	for k, v := range raw {
		window[k] = v
	}
	from := asWorldMillis(raw["lastMotionAt"])
	end := min(at, asWorldMillis(raw["arriveMs"]))
	if end > from {
		history, _ := raw["history"].([]interface{})
		copied := append([]interface{}{}, history...)
		copied = append(copied, map[string]interface{}{"from": int64(from), "to": int64(end), "state": old["state"]})
		window["history"] = copied
		window["lastMotionAt"] = int64(end)
	}
	if at <= asWorldMillis(raw["arriveMs"]) && (jump && next["jump"] != nil || system && next["systemId"] != old["systemId"]) {
		window["invalidReason"] = "leftSystem"
	}
	next["survey"] = window
	return next, nil
}

func RegisterSurveyHistory(a *action.Service) {
	a.RegisterActorTransition(actorCollection, surveyTransition)
}
