package galaxy

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/space"
)

// ErrLaneNotFound means the named lane is not incident to fromSystemId in
// the materialized graph.
var ErrLaneNotFound = errors.New("galaxy: lane not found for this system")

// LaneEnd is one lane incident to a system: its id and the far endpoint.
// Formerly observation.LaneEnd (replace-observation-with-sightings design.md
// Decision 1) — moved here rather than into charts, since nothing outside
// this package's own LanesOf/LaneCrossing pair constructs or consumes it
// (the old scan-resolve-and-mint path that read it via
// observation.LaneSource is deleted with the package it lived in, and
// charts's arrival/gate-attachment writers take lane ids as plain strings,
// never a LaneEnd).
type LaneEnd struct {
	LaneId        string
	OtherSystemId string
}

// LanesOf is the lanes incident to a system, each with its far endpoint —
// fleet.GraphSource's LaneCrossing resolves a jump's crossing geometry
// through it. Reads the MATERIALIZED graph with a per-system query, so a
// caller pays for its own system's roads, not the whole world's.
//
// Callers that can look past the frontier must EnsureLaneHorizon first — after
// that, this is the system's true field adjacency and a caller can never
// report a false dead end.
func (s *Service) LanesOf(ctx context.Context, systemID string) ([]LaneEnd, error) {
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

// LaneCrossing implements fleet.GraphSource (replace-observation-with-
// sightings design.md Decision 22; tasks.md 1.1): resolves one lane's
// crossing geometry — the destination system id and the two endpoint
// systems' RAW galaxy coordinates, never a precomputed length, so the caller
// itself is what calls space.Vec3{...}.Length(). Reads the MATERIALIZED
// graph: a lane a fleet is actually attached to and jumping across is,
// definitionally, already materialized (its own gate body exists in the
// fleet's origin system's body table), so this never needs to
// EnsureLaneHorizon itself.
func (s *Service) LaneCrossing(ctx context.Context, laneId, fromSystemId string) (destSystemId string, from, to space.Vec3, err error) {
	ends, err := s.LanesOf(ctx, fromSystemId)
	if err != nil {
		return "", space.Vec3{}, space.Vec3{}, err
	}
	for _, e := range ends {
		if e.LaneId == laneId {
			destSystemId = e.OtherSystemId
			break
		}
	}
	if destSystemId == "" {
		return "", space.Vec3{}, space.Vec3{}, fmt.Errorf(
			"galaxy: lane %q not incident to system %q: %w", laneId, fromSystemId, ErrLaneNotFound)
	}

	fromSys, err := s.GetLiveSystem(ctx, fromSystemId)
	if err != nil {
		return "", space.Vec3{}, space.Vec3{}, err
	}
	toSys, err := s.GetLiveSystem(ctx, destSystemId)
	if err != nil {
		return "", space.Vec3{}, space.Vec3{}, err
	}
	from = space.Vec3{X: fromSys.Coords.X, Y: fromSys.Coords.Y, Z: fromSys.Coords.Z}
	to = space.Vec3{X: toSys.Coords.X, Y: toSys.Coords.Y, Z: toSys.Coords.Z}
	return destSystemId, from, to, nil
}

// lanesOf projects a lane list to the ends incident to one system.
func lanesOf(lanes []Lane, systemID string) []LaneEnd {
	var out []LaneEnd
	for _, l := range lanes {
		switch systemID {
		case l.AId:
			out = append(out, LaneEnd{LaneId: l.Id, OtherSystemId: l.BId})
		case l.BId:
			out = append(out, LaneEnd{LaneId: l.Id, OtherSystemId: l.AId})
		}
	}
	return out
}
