package galaxy

import (
	"context"

	"hexaverse/observation"
)

// LanesOf implements observation.LaneSource: the lanes incident to a system,
// each with its far endpoint — what a scan charts and rumors (#0006 Decision
// #17). Reads the MATERIALIZED graph with a per-system query, so a scan pays
// for its own system's roads, not the whole world's.
//
// Callers that can look past the frontier must EnsureLaneHorizon first — after
// that, this is the system's true field adjacency and a scan can never report a
// false dead end.
func (s *Service) LanesOf(ctx context.Context, systemID string) ([]observation.LaneEnd, error) {
	id, err := s.dao.GetLivePointer(ctx)
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, ErrNoLiveGalaxy
	}
	lanes, err := s.dao.ListLanesForSystem(ctx, id, systemID)
	if err != nil {
		return nil, err
	}
	return lanesOf(lanes, systemID), nil
}

// lanesOf projects a lane list to the ends incident to one system.
func lanesOf(lanes []Lane, systemID string) []observation.LaneEnd {
	var out []observation.LaneEnd
	for _, l := range lanes {
		switch systemID {
		case l.AId:
			out = append(out, observation.LaneEnd{LaneId: l.Id, OtherSystemId: l.BId})
		case l.BId:
			out = append(out, observation.LaneEnd{LaneId: l.Id, OtherSystemId: l.AId})
		}
	}
	return out
}
