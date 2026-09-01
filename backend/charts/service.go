package charts

import (
	"context"
	"strings"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
)

// Service is the graph-knowledge domain: the monotonic system-tier ladder,
// the charted-lane set, and the arrival/attachment reveal writers
// (replace-observation-with-sightings design.md Decision 1).
type Service struct {
	dao   Dao
	clock common.WorldTime
}

// NewService constructs the production Service.
func NewService() *Service {
	return &Service{dao: NewDao(), clock: common.WorldClock()}
}

// NewServiceWith constructs a Service from explicit dependencies, for tests.
func NewServiceWith(dao Dao, clock common.WorldTime) *Service {
	return &Service{dao: dao, clock: clock}
}

// SystemTiers folds the corp's stored graph knowledge to a systemId→tier map.
// Systems absent from the map are star-visible (the free baseline); the
// caller defaults them. Monotonic by construction (the store never lowers a
// tier).
func (s *Service) SystemTiers(ctx context.Context, cid string) (map[string]Tier, error) {
	knowledge, err := s.dao.ListSystemKnowledge(ctx, cid)
	if err != nil {
		return nil, err
	}
	m := make(map[string]Tier, len(knowledge))
	for _, k := range knowledge {
		m[k.SystemId] = k.Tier
	}
	return m, nil
}

// ChartedLanes returns the corp's charted lane set (laneId → true) — the
// graph read's lane filter and routing's adjacency both key on it. Reads the
// corp's own charted-lane records; presence IS "charted", never derived from
// a system's tier.
func (s *Service) ChartedLanes(ctx context.Context, cid string) (map[string]bool, error) {
	lanes, err := s.dao.ListChartedLanes(ctx, cid)
	if err != nil {
		return nil, err
	}
	m := make(map[string]bool, len(lanes))
	for _, l := range lanes {
		m[l.LaneId] = true
	}
	return m, nil
}

// RevealArrival writes the arrival reveal directly through the DAO
// (destination → Explored, nothing else) — the non-action path spawn uses:
// waking IS arriving. Onward lanes are NOT charted: finding the roads is the
// first scan's job. Idempotent — re-running never lowers a tier — so it's
// safe on an idempotent re-spawn.
func (s *Service) RevealArrival(ctx context.Context, cid, destSystemID string, at common.WorldMillis) error {
	return s.dao.UpsertSystemKnowledge(ctx, cid, SystemKnowledge{
		SystemId: destSystemID, Tier: TierExplored, AsOf: at,
	})
}

// ArrivalWrites builds the destination-on-arrival reveal: the destination →
// Explored, and the lanes the trip actually crossed charted `via: traveled`.
// No onward-lane rumor — arrival explores, scanning/gates find the roads.
// Returned as action.DocWrite so a trip's resolver applies them in its
// resolve transaction (exactly-once with the motion settle). Explored is the
// top tier, so a blind MergeAll can never lower it; lane docs are keyed by
// laneId, so re-resolution is an idempotent overwrite. asOf = arrival time.
func (s *Service) ArrivalWrites(cid, destSystemID string, traveledLaneIds []string, at common.WorldMillis) []action.DocWrite {
	writes := []action.DocWrite{{
		Path: []string{corporationsCollection, cid, chartsCollection, destSystemID},
		Data: map[string]interface{}{
			"systemId": destSystemID,
			"tier":     string(TierExplored),
			"asOf":     int64(at),
		},
	}}
	for _, laneID := range traveledLaneIds {
		writes = append(writes, action.DocWrite{
			Path: []string{corporationsCollection, cid, chartedLanesCollection, laneID},
			Data: map[string]interface{}{"laneId": laneID, "via": ViaTraveled, "asOf": int64(at)},
		})
	}
	return writes
}

// gateBodyPrefix is system.gateId's own naming convention ("gate-"+
// destSystemId), duplicated here (unexported by system) exactly as fleet's
// own resolver already does — the only way a package outside system can
// recognize a gate body id without system exporting gateId.
const gateBodyPrefix = "gate-"

// GateAttachmentWrite charts a lane-gate body's lane, `via: gate`, the
// instant a fleet's movement state settles into an attached park at it
// (replace-observation-with-sightings design.md Decision 3, item 2;
// specs/galaxy-knowledge/spec.md — "Gate-Attachment Knowledge Write"). The
// lane id is derived PURELY from the two system ids via
// galaxy.LaneIdBetween — no read of the destination system, so the galaxy
// view can paint the lane before a fleet commits to crossing it. Attaching
// to a body that is not a lane gate charts nothing.
func GateAttachmentWrite(cid, fromSystemId, hostBodyId string, at common.WorldMillis) []action.DocWrite {
	destSystemId, ok := strings.CutPrefix(hostBodyId, gateBodyPrefix)
	if !ok {
		return nil
	}
	laneId := galaxy.LaneIdBetween(fromSystemId, destSystemId)
	return []action.DocWrite{{
		Path: []string{corporationsCollection, cid, chartedLanesCollection, laneId},
		Data: map[string]interface{}{"laneId": laneId, "via": ViaGate, "asOf": int64(at)},
	}}
}
