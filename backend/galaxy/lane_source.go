package galaxy

import (
	"context"

	"hexaverse/observation"
)

// LanesOf implements observation.LaneSource: the lanes incident to a system,
// each with its far endpoint — what a scan charts and rumors (#0006 Decision
// #17). Reads the live graph; the generated galaxy is immutable behind its
// live pointer, so this is as cacheable as GetLive itself.
func (s *Service) LanesOf(ctx context.Context, systemID string) ([]observation.LaneEnd, error) {
	gen, err := s.GetLive(ctx)
	if err != nil {
		return nil, err
	}
	return lanesOf(gen.Lanes, systemID), nil
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
