package system

import (
	"context"
	"sort"

	"hexaverse/board"
	"hexaverse/galaxy"
	"hexaverse/observation"
)

// LaneGate is a charted lane's fixed rim tile on this system's board — the tile
// where the lane toward DestSystemId meets the rim (#0008 Decision #10). The
// bearing is projected deterministically (board.LaneGateHex), so the server and
// every client agree on it, and it is the SAME projection the fleet uses to
// compute a departure gate (fleet/travel.go), so the rendered glyph and the tile
// a fleet actually burns to are one hex.
type LaneGate struct {
	DestSystemId string    `json:"destSystemId"`
	Hex          board.Hex `json:"hex"`
}

// LaneGates returns every lane gate on the given system's board: for each lane
// touching the system, the rim tile where it departs toward its neighbour,
// bearing-projected onto a board of the given radius. Unfiltered by fog — the
// read boundary applies the charted-lane rule per requester (chartedGates).
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
			Hex:          board.LaneGateHex(self.Coords.X, self.Coords.Y, nc.X, nc.Y, radius),
		})
	}
	// Deterministic order so the read is stable across requests.
	sort.Slice(gates, func(i, j int) bool { return gates[i].DestSystemId < gates[j].DestSystemId })
	return gates, nil
}

// chartedGates keeps only gates whose neighbour the requester has charted — a
// lane you know reaches somewhere (tier >= Rumored). Arrival at a system charts
// all its onward lanes to Rumored (observation.ArrivalWrites), so a system you
// have explored shows all its gates; and it never leaks an uncharted neighbour's
// existence — the same fog-honest rule routing uses (fleet/routing.go).
func chartedGates(gates []LaneGate, tiers map[string]observation.Tier) []LaneGate {
	out := make([]LaneGate, 0, len(gates))
	for _, g := range gates {
		if tiers[g.DestSystemId].AtLeast(observation.TierRumored) {
			out = append(out, g)
		}
	}
	return out
}
