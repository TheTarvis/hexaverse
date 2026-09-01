package system

import (
	"context"
	"sort"

	"hexaverse/board"
	"hexaverse/galaxy"
)

// LaneGate is a charted lane's fixed gate cell on this system's board — the
// cell where the lane toward DestSystemId meets the gate ring, the inner edge
// of the outer band (#0008 Decision #10; radial placement refined
// 2026-07-14). The bearing is projected deterministically
// (board.LaneGateCell), so the server and every client agree on it, and it is
// the SAME projection the fleet uses to compute a departure gate
// (fleet/travel.go), so the rendered glyph and the cell a fleet actually
// burns to are one cell.
type LaneGate struct {
	DestSystemId string     `json:"destSystemId"`
	Cell         board.Cell `json:"cell"`
}

// LaneGates returns every lane gate on the given system's board: for each lane
// touching the system, the gate tile where it departs toward its neighbour,
// bearing-projected onto a board of the given radius. Unfiltered — every
// lane-gate body ships to every authenticated requester regardless of stored
// map knowledge (replace-observation-with-sightings design.md Decision 5;
// system-interior "Bodies Are Public; Ships Are Disclosed"): standing next to
// a physical gate and reading the sign on it is how a corporation finds the
// roads, and gating that would make a fresh corporation's galaxy
// untraversable.
func (s *Service) LaneGates(ctx context.Context, systemID string, radius int) ([]LaneGate, error) {
	gal, err := s.galaxySvc.GetLive(ctx)
	if err != nil {
		return nil, err
	}

	var self *galaxy.System
	coords := make(map[string]galaxy.Coords, len(gal.Systems))
	for i := range gal.Systems {
		sys := &gal.Systems[i]
		coords[sys.Id] = sys.Coords
		if sys.Id == systemID {
			self = sys
		}
	}
	if self == nil {
		return nil, ErrNotFound
	}

	var gates []LaneGate
	for _, l := range gal.Lanes {
		var nb string
		switch systemID {
		case l.AId:
			nb = l.BId
		case l.BId:
			nb = l.AId
		default:
			continue
		}
		nc, ok := coords[nb]
		if !ok {
			continue
		}
		gates = append(gates, LaneGate{
			DestSystemId: nb,
			Cell:         board.LaneGateCell(self.Coords.X, self.Coords.Y, nc.X, nc.Y, radius),
		})
	}
	// Deterministic order so the read is stable across requests.
	sort.Slice(gates, func(i, j int) bool { return gates[i].DestSystemId < gates[j].DestSystemId })
	return gates, nil
}
