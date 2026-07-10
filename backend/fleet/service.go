package fleet

import (
	"context"
	"errors"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/system"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

var (
	ErrNotFound      = errors.New("fleet not found")
	ErrFeatureAbsent = errors.New("target feature not found in system")
)

type ServiceInterface interface {
	Get(ctx context.Context, id string) (*Fleet, error)
	OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error)
	Cancel(ctx context.Context, id string) (*Fleet, error)
	SeedFleet(ctx context.Context, systemID, corporationID string, at board.Hex) (*Fleet, error)
	// Position resolves a fleet's live hex at the current world time (docked
	// fleets need the interior, so this lives on the service, not board).
	Position(ctx context.Context, f *Fleet) (board.Hex, error)
}

type Service struct {
	dao       Dao
	systemSvc system.ServiceInterface
	clock     common.WorldTime
	params    MovementParams
}

func NewService() *Service {
	return &Service{dao: NewDao(), systemSvc: system.NewService(), clock: common.WorldClock(), params: DefaultMovementParams()}
}

func NewServiceWith(dao Dao, systemSvc system.ServiceInterface, clock common.WorldTime) *Service {
	return &Service{dao: dao, systemSvc: systemSvc, clock: clock, params: DefaultMovementParams()}
}

// Get returns the fleet, opportunistically resolving a completed burn to
// dock/coast (arrival is a computed fact, not a fired event — #0004 Decision
// #12). No scheduler needed for the position to be correct.
func (s *Service) Get(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	if board.Arrived(f.State, now) {
		s.settleArrival(f)
		f.UpdatedAt = now
		if err := s.dao.Save(ctx, *f); err != nil {
			return nil, err
		}
	}
	return f, nil
}

// OrderTo solves a burn to the target (hex or feature) from the fleet's current
// position and flips it to burn. Determinism makes the arriveTime truth. A new
// order replaces any active one (re-task).
func (s *Service) OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()

	from, err := s.Position(ctx, f)
	if err != nil {
		return nil, err
	}

	var sol board.Solution
	var dockOnArrive string
	switch {
	case req.Target.FeatureId != "":
		feat, err := s.resolveFeature(ctx, f.SystemId, req.Target.FeatureId)
		if err != nil {
			return nil, err
		}
		dockOnArrive = feat.Id
		if orb := featureOrbit(feat); orb != nil {
			sol = board.SolveIntercept(from, *orb, now, s.params.MsPerTile, s.params.InterceptHorizon)
		} else {
			// Fixed feature (e.g. the star) — a static hex, no lead-solve.
			sol = board.SolveHex(from, featureAnchor(feat), now, s.params.MsPerTile)
		}
	case req.Target.Hex != nil:
		sol = board.SolveHex(from, *req.Target.Hex, now, s.params.MsPerTile)
	default:
		return nil, errors.New("order target must be a hex or a featureId")
	}

	f.State = board.MovementState{
		Mode: board.ModeBurn,
		Burn: &board.Burn{
			Path:         sol.Path,
			StartTime:    now,
			ArriveTime:   sol.ArriveTime,
			Target:       req.Target,
			DockOnArrive: dockOnArrive,
		},
	}
	f.UpdatedAt = now
	if err := s.dao.Save(ctx, *f); err != nil {
		return nil, err
	}
	log.Info().Ctx(ctx).Str("fleetId", id).Int("pathLen", len(sol.Path)).
		Int64("arriveTime", int64(sol.ArriveTime)).Msg("Fleet ordered to burn")
	return f, nil
}

// Cancel drops the fleet to coast from wherever it currently is.
func (s *Service) Cancel(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	cur, err := s.Position(ctx, f)
	if err != nil {
		return nil, err
	}
	f.State = s.coastAt(cur)
	f.UpdatedAt = s.clock.Now()
	if err := s.dao.Save(ctx, *f); err != nil {
		return nil, err
	}
	return f, nil
}

// SeedFleet drops a fleet into a system, coasting at a hex — the dev stand-in
// for spawn (#0009 replaces it). corporationId is set now so ownership is not a
// retrofit.
func (s *Service) SeedFleet(ctx context.Context, systemID, corporationID string, at board.Hex) (*Fleet, error) {
	now := s.clock.Now()
	f := &Fleet{
		Id:            "fleet_" + uuid.NewString(),
		CorporationId: corporationID,
		SystemId:      systemID,
		State:         s.coastAt(at),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := s.dao.Save(ctx, *f); err != nil {
		return nil, err
	}
	return f, nil
}

// Position resolves the fleet's live hex at the current world time.
func (s *Service) Position(ctx context.Context, f *Fleet) (board.Hex, error) {
	now := s.clock.Now()
	if f.State.Mode == board.ModeDocked {
		if f.State.Docked == nil {
			return board.Hex{}, nil
		}
		feat, err := s.resolveFeature(ctx, f.SystemId, f.State.Docked.ParentId)
		if err != nil {
			return board.Hex{}, err
		}
		if orb := featureOrbit(feat); orb != nil {
			return board.OrbState(*orb, now), nil
		}
		return featureAnchor(feat), nil
	}
	pos, _ := board.ShipPos(f.State, now)
	return pos, nil
}

// --- internals -------------------------------------------------------------

func (s *Service) load(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.dao.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if f == nil {
		return nil, ErrNotFound
	}
	return f, nil
}

func (s *Service) settleArrival(f *Fleet) {
	b := f.State.Burn
	meet := b.Path[len(b.Path)-1]
	if b.DockOnArrive != "" {
		f.State = board.MovementState{Mode: board.ModeDocked, Docked: &board.Docked{ParentId: b.DockOnArrive}}
		return
	}
	f.State = s.coastAt(meet)
}

func (s *Service) coastAt(h board.Hex) board.MovementState {
	ring, idx := board.AngleOf(h)
	return board.MovementState{
		Mode:  board.ModeCoast,
		Coast: &board.Orbit{Ring: ring, Angle0: idx, Period: s.params.CoastPeriod, Dir: 1},
	}
}

func (s *Service) resolveFeature(ctx context.Context, systemID, featureID string) (*system.Feature, error) {
	interior, err := s.systemSvc.GetOrCreateInterior(ctx, systemID)
	if err != nil {
		return nil, err
	}
	for i := range interior.Features {
		if interior.Features[i].Id == featureID {
			return &interior.Features[i], nil
		}
	}
	return nil, ErrFeatureAbsent
}

func featureOrbit(f *system.Feature) *board.Orbit {
	if f.Orbit == nil {
		return nil
	}
	return &board.Orbit{Ring: f.Orbit.Ring, Angle0: f.Orbit.Angle0, Period: f.Orbit.Period, Dir: f.Orbit.Dir}
}

func featureAnchor(f *system.Feature) board.Hex {
	if len(f.Footprint) == 0 {
		return board.Hex{}
	}
	return board.Hex{Q: f.Footprint[0].Q, R: f.Footprint[0].R}
}
