package system

import (
	"context"
	"sort"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
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
	// LaneId is this crossing's lane id, derived purely from the unordered
	// pair of system ids (galaxy.LaneIdBetween — replace-observation-with-
	// sightings tasks.md 4.11, system-interior "Lane-Gate Bodies Carry Their
	// Lane Id"). Set at construction (LaneGates below), never by a
	// degradable post-pass like fillGateGeometry: unlike Space/Size, it has
	// no missing-data case — it is a pure function of two known system ids
	// — so it must never zero-value. It is the id POST
	// /v1/fleets/:fleetId/jump accepts, served regardless of charted
	// knowledge, exactly as the gate body itself is.
	LaneId string `json:"laneId"`
	// Space/Size are the gate body's continuous position and physical
	// radius, additive alongside Cell (replace-observation-with-sightings
	// design.md Decisions 5/26; tasks.md 4.7 — "every body, bodies and gate
	// bodies alike, carries a continuous position and size"). Zero-valued
	// when no body table was available to resolve them (GetInterior's own
	// degradation) — filled by the interior handler, never by LaneGates
	// itself, which has no body table to resolve them from.
	Space space.Vec3 `json:"space"`
	Size  float64    `json:"size"`
}

// fillGateGeometry additively populates gates' Space/Size fields from a
// resolved body table — a second pass over LaneGates' own output rather
// than a BodyTable parameter threaded through LaneGates itself, since
// LaneGates' existing signature and tests (gates_test.go) predate this
// capability and name no such dependency. Degrades a gate to a zero
// Space/Size (never dropping it, never failing the read) when its body
// isn't resolvable in bt — the same "an unfiltered body list may still
// individually degrade" posture BodyTable's own gate derivation already
// takes (bodies.go: addGates).
func fillGateGeometry(gates []LaneGate, bt *BodyTable, now common.WorldMillis) {
	if bt == nil {
		return
	}
	for i := range gates {
		body, ok := bt.Body(gateId(gates[i].DestSystemId))
		if !ok {
			continue
		}
		pos, err := space.Position(bt, gateId(gates[i].DestSystemId), now)
		if err != nil {
			continue
		}
		gates[i].Space = pos
		gates[i].Size = body.Size
	}
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
			LaneId:       galaxy.LaneIdBetween(systemID, nb),
		})
	}
	// Deterministic order so the read is stable across requests.
	sort.Slice(gates, func(i, j int) bool { return gates[i].DestSystemId < gates[j].DestSystemId })
	return gates, nil
}
