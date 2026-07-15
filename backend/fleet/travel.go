package fleet

import (
	"context"
	"errors"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"

	"github.com/rs/zerolog/log"
)

// travelType is the action dispatch key for a graph-tier trip (#0008). Like burn
// it's kinematic-with-a-mutating-epilogue: the resolve settles the fleet at the
// destination rim (motion state) AND mints the arrival reveal (observations).
const travelType = "lane-travel"

// ErrTravelUnavailable means graph-tier travel isn't wired (no graph/tiers
// dependency) — a misconfiguration, surfaced rather than silently ignored.
var ErrTravelUnavailable = errors.New("graph-tier travel is not available")

// PreviewRoute pathfinds without committing: the system chain + frozen leg/total
// ETAs a client shows before departing (#0008). It solves exactly what a commit
// would freeze (including leg 0, the burn to the departure gate), so the preview
// numbers are the trip's truth, not an estimate.
func (s *Service) PreviewRoute(ctx context.Context, id, destSystemID string) (*RoutePreview, error) {
	if s.graph == nil || s.tiers == nil {
		return nil, ErrTravelUnavailable
	}
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	plan, err := s.planRoute(ctx, f.CorporationId, f.SystemId, destSystemID)
	if err != nil {
		return nil, err
	}
	trip, err := s.buildTrip(ctx, f, plan, now)
	if err != nil {
		return nil, err
	}
	departGate := trip.EntryGate
	if trip.BoardLeg != nil && len(trip.BoardLeg.Path) > 0 {
		departGate = trip.BoardLeg.Path[len(trip.BoardLeg.Path)-1]
	}
	return &RoutePreview{
		Route:      trip.Route,
		LegEtas:    trip.LegEtas,
		TotalEta:   trip.ArriveTime,
		DepartGate: departGate,
		WorldTime:  now,
	}, nil
}

// orderTravel commits a trip to destSystemID: pathfind → freeze the route + leg
// ETAs (leg 0 = the burn to the departure gate) as a lane-travel action while
// flipping the fleet to lane-transit, all in one transaction under the single
// slot guard. A new order replaces any active one (re-task / redirect).
func (s *Service) orderTravel(ctx context.Context, id, destSystemID string) (*Fleet, error) {
	if s.graph == nil || s.tiers == nil {
		return nil, ErrTravelUnavailable
	}
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()

	// An active order that already COMPLETED is a fact, not a re-taskable order:
	// resolve it through the spine first (settle + exactly-once effects), then
	// plan the trip from the settled doc. Mirrors orderBurn.
	if f.ActiveActionId != "" && board.Arrived(f.State, now) {
		if f, err = s.resolveDue(ctx, f); err != nil {
			return nil, err
		}
	}

	plan, err := s.planRoute(ctx, f.CorporationId, f.SystemId, destSystemID)
	if err != nil {
		return nil, err
	}
	trip, err := s.buildTrip(ctx, f, plan, now)
	if err != nil {
		return nil, err
	}
	state := board.MovementState{Mode: board.ModeLaneTransit, LaneTransit: trip}

	// Re-task: release the current slot before claiming a new one (ErrNotRunning
	// means it already resolved — the slot is free, so proceed).
	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, nil); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
	}

	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            travelType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           destSystemID, // resolve/SSE key is the destination (#0008)
		Params:          map[string]interface{}{"dest": destSystemID, "route": trip.Route},
		Eta:             trip.ArriveTime,
		ActorState:      map[string]interface{}{"state": state, "updatedAt": int64(now)},
	})
	if err != nil {
		return nil, err
	}
	f.State = state
	f.ActiveActionId = a.Id
	f.UpdatedAt = now
	log.Info().Ctx(ctx).Str("fleetId", id).Str("actionId", a.Id).
		Strs("route", trip.Route).Int64("arriveTime", int64(trip.ArriveTime)).
		Msg("Fleet ordered to travel")
	return f, nil
}

// buildTrip turns a route plan into the frozen lane-transit state: leg 0 (the
// burn from the fleet's current position to the first lane's departure gate),
// cumulative per-leg arrival stamps, and the destination-board entry gate.
func (s *Service) buildTrip(ctx context.Context, f *Fleet, plan *routePlan, now common.WorldMillis) (*board.LaneTransit, error) {
	route := plan.route
	n := len(route)

	origin := plan.systems[route[0]]
	next := plan.systems[route[1]]
	departGate := board.LaneGateHex(origin.Coords.X, origin.Coords.Y, next.Coords.X, next.Coords.Y, s.params.BoardRadius)

	from, err := s.Position(ctx, f)
	if err != nil {
		return nil, err
	}
	boardSol := board.SolveHex(from, departGate, now, s.params.MsPerTile)
	boardLeg := &board.BoardLeg{Path: boardSol.Path, StartTime: now, GateEta: boardSol.ArriveTime}

	// LegEtas[0] is the gate ETA (when the fleet enters the first lane); each lane
	// adds its frozen crossing time.
	legEtas := make([]common.WorldMillis, n)
	legEtas[0] = boardSol.ArriveTime
	for i := 1; i < n; i++ {
		legEtas[i] = legEtas[i-1] + plan.legMs[i-1]
	}

	dest := plan.systems[route[n-1]]
	prev := plan.systems[route[n-2]]
	entryGate := board.LaneGateHex(dest.Coords.X, dest.Coords.Y, prev.Coords.X, prev.Coords.Y, s.params.BoardRadius)

	return &board.LaneTransit{
		BoardLeg:   boardLeg,
		Route:      route,
		LegEtas:    legEtas,
		DepartTime: now,
		ArriveTime: legEtas[n-1],
		EntryGate:  entryGate,
		LaneIds:    plan.laneIds,
	}, nil
}
