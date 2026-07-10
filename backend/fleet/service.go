package fleet

import (
	"context"
	"errors"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"
	"hexaverse/system"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// burnType is the action dispatch key for a fleet's map-move. The burn is a thin
// lifecycle wrapper (ETA, status, inbox, single slot) around the order that lives
// in fleet.State.Burn — never a second copy of motion state (#0005 Decision #6).
const burnType = "burn"

// scanType is the action dispatch key for the scan verb (#0006). The fleet is
// the actor (it carries the sensor), so scan COMMITS here — mirroring burn —
// while the reveal RESOLVES in the observation domain (its registered resolver
// mints the observations). Fleet imports observation only for the scan tuning.
const scanType = "scan"

// actorCollection is where fleet docs live, so the action domain can claim and
// release the single-action slot generically without importing this package.
const actorCollection = "fleets"

var (
	ErrNotFound      = errors.New("fleet not found")
	ErrFeatureAbsent = errors.New("target feature not found in system")
)

type ServiceInterface interface {
	Get(ctx context.Context, id string) (*Fleet, error)
	// ListInSystem returns every fleet currently in a system (unfiltered — the
	// handler applies audience fog per fleet). Read-only: it never settles a due
	// arrival, so it's side-effect-free (the authoritative settle runs on Get).
	ListInSystem(ctx context.Context, systemID string) ([]Fleet, error)
	OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error)
	Cancel(ctx context.Context, id string) (*Fleet, error)
	Scan(ctx context.Context, id string) (*Fleet, error)
	SeedFleet(ctx context.Context, systemID, corporationID string, at board.Hex) (*Fleet, error)
	// Position resolves a fleet's live hex at the current world time (docked
	// fleets need the interior, so this lives on the service, not board).
	Position(ctx context.Context, f *Fleet) (board.Hex, error)
}

type Service struct {
	dao       Dao
	systemSvc system.ServiceInterface
	actions   action.CommitInterface
	clock     common.WorldTime
	params    MovementParams
}

func NewService() *Service {
	params := DefaultMovementParams()
	actions := action.NewService()
	actions.RegisterResolver(burnType, action.KindKinematic, BurnResolver(params))
	return &Service{
		dao:       NewDao(),
		systemSvc: system.NewService(),
		actions:   actions,
		clock:     common.WorldClock(),
		params:    params,
	}
}

func NewServiceWith(dao Dao, systemSvc system.ServiceInterface, actions action.CommitInterface, clock common.WorldTime) *Service {
	return &Service{dao: dao, systemSvc: systemSvc, actions: actions, clock: clock, params: DefaultMovementParams()}
}

// Get returns the fleet, opportunistically resolving a completed burn (arrival
// is a computed fact, not a fired event — #0004 Decision #12; no scheduler). When
// the burn is wrapped in an action (the normal path since M5), resolution runs
// through the spine so the motion-state settle AND the slot release happen in one
// transaction. A burn with no action (dev-seeded/legacy) still settles locally.
func (s *Service) Get(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	if !board.Arrived(f.State, now) {
		return f, nil
	}
	if f.ActiveActionId != "" {
		// Resolve the due burn through the action spine (settles state + releases
		// the slot + flips the action to done, atomically), then re-read.
		if _, err := s.actions.ResolveActive(ctx, id); err != nil {
			return nil, err
		}
		return s.load(ctx, id)
	}
	// No wrapping action — settle motion state directly (there's no slot to free).
	s.settleArrival(f)
	f.UpdatedAt = now
	if err := s.dao.Save(ctx, *f); err != nil {
		return nil, err
	}
	return f, nil
}

// ListInSystem returns every fleet currently in a system. Unlike Get it does not
// settle due arrivals — the board is a read surface, so it reports each fleet's
// stored state and lets the client animate; the arrival settle stays on the
// fleet's own Get/resolve path (one authoritative writer).
func (s *Service) ListInSystem(ctx context.Context, systemID string) ([]Fleet, error) {
	return s.dao.ListBySystem(ctx, systemID)
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

	burnState := board.MovementState{
		Mode: board.ModeBurn,
		Burn: &board.Burn{
			Path:         sol.Path,
			StartTime:    now,
			ArriveTime:   sol.ArriveTime,
			Target:       req.Target,
			DockOnArrive: dockOnArrive,
		},
	}

	// Re-task: releasing the current slot before claiming a new one (a running
	// action while ordering is the norm mid-burn). ErrNotRunning means it already
	// resolved — the slot is free, so proceed.
	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, nil); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
	}

	// Commit the burn THROUGH the action spine: the action doc + the single-slot
	// claim + the fleet's flip to burn all land in one transaction. Fleet still
	// owns motion state — it rides in ActorState, not duplicated into params.
	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            burnType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           f.SystemId,
		Params:          map[string]interface{}{"target": req.Target, "dockOnArrive": dockOnArrive},
		Eta:             sol.ArriveTime,
		ActorState:      map[string]interface{}{"state": burnState, "updatedAt": int64(now)},
	})
	if err != nil {
		return nil, err
	}
	f.State = burnState
	f.ActiveActionId = a.Id
	f.UpdatedAt = now
	log.Info().Ctx(ctx).Str("fleetId", id).Str("actionId", a.Id).Int("pathLen", len(sol.Path)).
		Int64("arriveTime", int64(sol.ArriveTime)).Msg("Fleet ordered to burn")
	return f, nil
}

// Cancel drops the fleet to coast from wherever it currently is, releasing its
// action slot in the same transaction (the coast state rides in ActorState).
func (s *Service) Cancel(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	cur, err := s.Position(ctx, f)
	if err != nil {
		return nil, err
	}
	coast := s.coastAt(cur)
	now := s.clock.Now()

	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, map[string]interface{}{
			"state": coast, "updatedAt": int64(now),
		}); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
		f.State = coast
		f.ActiveActionId = ""
		f.UpdatedAt = now
		return f, nil
	}

	// No wrapping action — coast directly.
	f.State = coast
	f.UpdatedAt = now
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

// Scan commits a scan action for the fleet through the action spine: the ETA is
// frozen at commit (now + scan duration), the single slot is claimed, and the
// observation domain's registered resolver mints the survey at resolution. A
// fleet already running an action (e.g. mid-burn) can't scan — the slot guard
// rejects it (action.ErrActiveActionExists).
func (s *Service) Scan(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	scanParams := observation.DefaultScanParams()
	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            scanType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           f.SystemId,
		Params:          map[string]interface{}{"radius": scanParams.Radius},
		Eta:             now.Add(scanParams.Duration),
	})
	if err != nil {
		return nil, err
	}
	f.ActiveActionId = a.Id
	f.UpdatedAt = now
	log.Info().Ctx(ctx).Str("fleetId", id).Str("actionId", a.Id).
		Int64("eta", int64(now.Add(scanParams.Duration))).Msg("Fleet ordered to scan")
	return f, nil
}

// FleetsForCorp implements observation.FleetSource: every unit a corporation
// owns, with its live hex resolved, so the fog domain can compute the corp's
// sensor union. Passive sensors ride any moving unit, so all fleets contribute
// regardless of movement mode.
func (s *Service) FleetsForCorp(ctx context.Context, corporationID string, _ common.WorldMillis) ([]observation.FleetPos, error) {
	fleets, err := s.dao.ListByCorporation(ctx, corporationID)
	if err != nil {
		return nil, err
	}
	out := make([]observation.FleetPos, 0, len(fleets))
	for i := range fleets {
		f := &fleets[i]
		hex, err := s.Position(ctx, f)
		if err != nil {
			return nil, err
		}
		out = append(out, observation.FleetPos{
			Id:            f.Id,
			CorporationId: f.CorporationId,
			SystemId:      f.SystemId,
			Hex:           hex,
		})
	}
	return out, nil
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
	return coastState(h, s.params.CoastPeriod)
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
