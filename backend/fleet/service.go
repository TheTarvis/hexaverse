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
	// ErrCoreDestination rejects an order whose destination is the star at the
	// core (0,0): you can neither fly onto the core nor dock the star.
	ErrCoreDestination = errors.New("the star at the core cannot be a destination")
)

type ServiceInterface interface {
	Get(ctx context.Context, id string) (*Fleet, error)
	// ListInSystem returns every fleet currently in a system (unfiltered — the
	// handler applies audience fog per fleet). Read-only: it never settles a due
	// arrival, so it's side-effect-free (the authoritative settle runs on Get).
	ListInSystem(ctx context.Context, systemID string) ([]Fleet, error)
	// ListForCorp returns every fleet a corporation owns, across systems and
	// including those in lane transit — the galaxy view's fleet layer. Read-only.
	ListForCorp(ctx context.Context, corporationID string) ([]Fleet, error)
	OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error)
	// PreviewRoute pathfinds to a destination system without committing (#0008):
	// the route + per-leg/total ETA a client shows before departing.
	PreviewRoute(ctx context.Context, id, destSystemID string) (*RoutePreview, error)
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
	// graph + tiers power graph-tier travel (#0008). They're set after
	// construction via WithTravel because the fog service (TierSource) depends on
	// this fleet service (FleetSource) — a construction cycle. Nil ⇒ travel orders
	// are rejected (the fleet still moves inside a system).
	graph GraphSource
	tiers TierSource
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

// WithTravel wires the graph-tier travel dependencies (#0008): the galaxy graph
// for pathfinding + gate geometry, and the requester's knowledge tiers so routing
// stays fog-honest. Called at startup once the fog service exists (it can't be a
// constructor arg — fog depends on this service). Returns the receiver for
// chaining.
func (s *Service) WithTravel(graph GraphSource, tiers TierSource) *Service {
	s.graph = graph
	s.tiers = tiers
	return s
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
		return s.resolveDue(ctx, f)
	}
	// No wrapping action (dev-seeded/legacy) — fold the settle into the doc
	// directly; there's no slot to free and no effects to mint. A due lane
	// transit folds nowhere locally (only its resolve may move systems), so an
	// unchanged fold writes nothing.
	eff := board.StateAt(f.State, now)
	if eff.Mode == f.State.Mode {
		return f, nil
	}
	f.State = eff
	f.UpdatedAt = now
	if err := s.dao.Save(ctx, *f); err != nil {
		return nil, err
	}
	return f, nil
}

// resolveDue runs the authoritative settle for a fleet whose active action has
// reached its ETA: resolution through the action spine (motion settle + slot
// release + the exactly-once effects, one transaction), the #0003 first-arrival
// detail roll when a lane trip just changed systems, then a re-read of the
// settled doc. The settle establishes no new position fact — every read already
// answers with board.StateAt — it lands the effects and refreshes the cache.
func (s *Service) resolveDue(ctx context.Context, f *Fleet) (*Fleet, error) {
	// A lane arrival flips the fleet into a new system; remember the destination
	// so we can trigger the detail roll after the resolve.
	var arrivedAt string
	if f.State.Mode == board.ModeLaneTransit && f.State.LaneTransit != nil && len(f.State.LaneTransit.Route) > 0 {
		arrivedAt = f.State.LaneTransit.Route[len(f.State.LaneTransit.Route)-1]
	}
	if _, err := s.actions.ResolveActive(ctx, f.Id); err != nil {
		return nil, err
	}
	if arrivedAt != "" {
		// First-arrival detail roll (#0003): materialize the destination interior
		// create-if-absent. Idempotent and done post-resolve, so the heavy
		// generation stays out of the resolve transaction. Non-fatal on error —
		// the on-read trigger will materialize it later.
		if _, err := s.systemSvc.GetOrCreateInterior(ctx, arrivedAt); err != nil {
			log.Warn().Ctx(ctx).Err(err).Str("systemId", arrivedAt).Msg("Arrival detail roll deferred")
		}
	}
	return s.load(ctx, f.Id)
}

// ListInSystem returns every fleet currently in a system. It does not WRITE a
// due arrival — that stays on Get/resolve, one authoritative writer — but the
// wire carries the EFFECTIVE state (board.StateAt), so a ship that has arrived
// reads as the coast it settled into, never as a burn frozen on its last hex.
func (s *Service) ListInSystem(ctx context.Context, systemID string) ([]Fleet, error) {
	fleets, err := s.dao.ListBySystem(ctx, systemID)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	for i := range fleets {
		fleets[i].State = board.StateAt(fleets[i].State, now)
	}
	return fleets, nil
}

// ListForCorp returns every fleet a corporation owns (across systems, transit
// included) — the galaxy view's own-fleet layer. Read-only like ListInSystem,
// carrying effective state the same way.
func (s *Service) ListForCorp(ctx context.Context, corporationID string) ([]Fleet, error) {
	fleets, err := s.dao.ListByCorporation(ctx, corporationID)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	for i := range fleets {
		fleets[i].State = board.StateAt(fleets[i].State, now)
	}
	return fleets, nil
}

// OrderTo dispatches an order by tier: a systemId target is a graph-tier trip
// (#0008), anything else is an in-system burn (#0004). A new order replaces any
// active one (re-task), so this is also the redirect path for a traveling fleet.
func (s *Service) OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error) {
	if req.SystemId != "" {
		return s.orderTravel(ctx, id, req.SystemId)
	}
	return s.orderBurn(ctx, id, req)
}

// orderBurn solves a burn to the target (hex or feature) from the fleet's current
// position and flips it to burn. Determinism makes the arriveTime truth.
func (s *Service) orderBurn(ctx context.Context, id string, req OrderRequest) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()

	// An active order that already COMPLETED is a fact, not a re-taskable order:
	// resolve it through the spine first (settle + exactly-once effects — the
	// ambient sweep must not be lost to a cancel), then order from the settled doc.
	if f.ActiveActionId != "" && board.Arrived(f.State, now) {
		if f, err = s.resolveDue(ctx, f); err != nil {
			return nil, err
		}
	}

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

	// The star occupies the core (0,0). It is a body, not a destination: you can
	// neither fly a fleet onto it nor dock it. Burns already route AROUND the core
	// (board.RouteAround); this rejects the core as an endpoint.
	if sol.MeetHex == (board.Hex{}) {
		return nil, ErrCoreDestination
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

// Cancel halts the fleet where it currently is, releasing its action slot in the
// same transaction (the halt state rides in ActorState). An in-system move or a
// trip's board leg stops to coast; a fleet already out on a lane holds at its
// frozen fraction (#0008 Decision #12), visible until re-ordered.
func (s *Service) Cancel(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()

	// A completed order can't be cancelled — its arrival is already a fact.
	// Resolve it (settle + effects, releasing the slot) and return the settled
	// fleet; there is nothing left to halt.
	if f.ActiveActionId != "" && board.Arrived(f.State, now) {
		return s.resolveDue(ctx, f)
	}

	halt, err := s.haltState(ctx, f, now)
	if err != nil {
		return nil, err
	}

	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, map[string]interface{}{
			"state": halt, "updatedAt": int64(now),
		}); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
		f.State = halt
		f.ActiveActionId = ""
		f.UpdatedAt = now
		return f, nil
	}

	// No wrapping action — apply the halt directly (re-holding a lane-hold no-ops).
	f.State = halt
	f.UpdatedAt = now
	if err := s.dao.Save(ctx, *f); err != nil {
		return nil, err
	}
	return f, nil
}

// haltState computes where a cancel leaves a fleet: coast at its current board hex
// for an in-system move or a trip's board leg, or a lane-hold at the frozen
// fraction once it's out on a lane (#0008).
func (s *Service) haltState(ctx context.Context, f *Fleet, now common.WorldMillis) (board.MovementState, error) {
	if f.State.Mode == board.ModeLaneTransit && f.State.LaneTransit != nil {
		lt := f.State.LaneTransit
		// Still on the origin board burning to the gate — stop-burn to coast.
		if lt.BoardLeg != nil && now < lt.BoardLeg.GateEta {
			pos, _ := board.ShipPos(f.State, now)
			return board.CoastAt(pos, now), nil
		}
		// Out on a lane — hold at the current fraction between two systems.
		if fromIdx, toIdx, frac, ok := board.LaneFraction(*lt, now); ok {
			return board.MovementState{
				Mode:     board.ModeLaneHold,
				LaneHold: &board.LaneHold{From: lt.Route[fromIdx], To: lt.Route[toIdx], Fraction: frac},
			}, nil
		}
	}
	if f.State.Mode == board.ModeLaneHold {
		return f.State, nil // already held — cancel is a no-op
	}
	cur, err := s.Position(ctx, f)
	if err != nil {
		return board.MovementState{}, err
	}
	return board.CoastAt(cur, now), nil
}

// SeedFleet drops a fleet into a system, coasting at a hex — the dev stand-in
// for spawn (#0009 replaces it). corporationId is set now so ownership is not a
// retrofit.
func (s *Service) SeedFleet(ctx context.Context, systemID, corporationID string, at board.Hex) (*Fleet, error) {
	// Nothing rests on the star: a fleet can't be seeded onto the core (0,0), same
	// rule that forbids moving there.
	if at == (board.Hex{}) {
		return nil, ErrCoreDestination
	}
	now := s.clock.Now()
	f := &Fleet{
		Id:            "fleet_" + uuid.NewString(),
		CorporationId: corporationID,
		SystemId:      systemID,
		State:         board.CoastAt(at, now),
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
	now := s.clock.Now()
	out := make([]observation.FleetPos, 0, len(fleets))
	for i := range fleets {
		f := &fleets[i]
		// A fleet out on a lane (past its departure gate) or parked mid-lane has no
		// board presence, so it lends no sensor coverage to any system.
		if f.State.Mode == board.ModeLaneHold {
			continue
		}
		if f.State.Mode == board.ModeLaneTransit {
			lt := f.State.LaneTransit
			if lt == nil || lt.BoardLeg == nil || now >= lt.BoardLeg.GateEta {
				continue
			}
		}
		// Position answers from effective state, so a ship that docked onto an
		// orbiting body since its last write lends its sensor bubble from the
		// body's LIVE hex — not the hex the burn ended on, which the body has
		// since orbited away from (the ship would stop seeing the very thing
		// it's holding onto).
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

// Position resolves the fleet's live hex at the current world time. It answers
// from the EFFECTIVE state (board.StateAt): a burn whose arrival has passed is
// the coast — or the dock — it settled into, so a ship that docked onto an
// ORBITING body rides that body from the instant it arrives, whether or not the
// authoritative settle has written yet. (That also keeps the corp's own sensor
// bubble on the body a fleet is holding onto — see FleetsForCorp.)
func (s *Service) Position(ctx context.Context, f *Fleet) (board.Hex, error) {
	now := s.clock.Now()
	eff := board.StateAt(f.State, now)
	if eff.Mode == board.ModeDocked {
		if eff.Docked == nil {
			return board.Hex{}, nil
		}
		feat, err := s.resolveFeature(ctx, f.SystemId, eff.Docked.ParentId)
		if err != nil {
			return board.Hex{}, err
		}
		if orb := featureOrbit(feat); orb != nil {
			return board.OrbState(*orb, now), nil
		}
		return featureAnchor(feat), nil
	}
	pos, _ := board.ShipPos(eff, now)
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
