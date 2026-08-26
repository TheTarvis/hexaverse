package fleet

import (
	"context"
	"errors"
	"fmt"
	"math"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"
	"hexaverse/polar"
	"hexaverse/system"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// ErrRingOutOfRange is the stored-coordinate guard's sentinel (design.md
// Decision 3's risk; tasks.md 3.11): a fleet's stored motion state carries a
// ring beyond the live board schedule's maximum (a tuning.go radius
// reduction, a migration mismatch, or corruption). polar.Schedule.Slots
// panics above MaxRing, and board.Canon calls it — so this guard is what
// keeps a fleet read (and mine/sell, which inherit it through
// FleetSource.Get) failing closed instead of crashing.
var ErrRingOutOfRange = errors.New("fleet: stored position ring exceeds the live board schedule")

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
	// ErrNotOnBoard rejects a scan from a fleet with no board presence (out on a
	// lane or holding mid-lane) — there is no system around it to scan.
	ErrNotOnBoard = errors.New("fleet has no board position to scan from")
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
	SeedFleet(ctx context.Context, systemID, corporationID string, at board.Cell) (*Fleet, error)
	// Position resolves a fleet's live cell at the current world time (docked
	// fleets need the interior, so this lives on the service, not board).
	Position(ctx context.Context, f *Fleet) (board.Cell, error)
}

type Service struct {
	dao       Dao
	systemSvc system.ServiceInterface
	actions   action.CommitInterface
	clock     common.WorldTime
	params    MovementParams
	// classStats is the roster stats table burn ETA / lane routing / capacity
	// computations derive through (#0010 "Derived Fleet Speed" /
	// "Derived Cargo Capacity and Mining Rate"). Always DefaultClassStats() —
	// not a constructor param — mirroring how params defaults internally too;
	// tests exercise the derived-rate helpers directly (roster_test.go) rather
	// than injecting a fake table into the service.
	classStats map[ShipClass]ClassStats
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
		dao:        NewDao(),
		systemSvc:  system.NewService(),
		actions:    actions,
		clock:      common.WorldClock(),
		params:     params,
		classStats: DefaultClassStats(),
	}
}

func NewServiceWith(dao Dao, systemSvc system.ServiceInterface, actions action.CommitInterface, clock common.WorldTime) *Service {
	return &Service{dao: dao, systemSvc: systemSvc, actions: actions, clock: clock,
		params: DefaultMovementParams(), classStats: DefaultClassStats()}
}

// msPerTileFor is the fleet's effective burn-tile cost — the inverse of its
// roster-derived burn rate (#0010 "Derived Fleet Speed"), replacing the flat
// global MsPerTile constant at every point a burn ETA is solved. Falls back
// to the global default if the roster's derived rate is zero (defensive: a
// zero rate must never divide-by-zero into an infinite per-tile cost here —
// mine's commit path is what actually rejects a zero-mining-rate fleet;
// movement itself has no "can't move" precondition today).
func (s *Service) msPerTileFor(f *Fleet) common.WorldMillis {
	rate := DerivedBurnRate(*f, s.classStats)
	if rate <= 0 {
		return s.params.MsPerTile
	}
	return common.WorldMillis(math.Round(1.0 / rate))
}

// msPerLaneUnitFor is the fleet's effective per-lane-length-unit cost — the
// inverse of its roster-derived lane rate (#0010 "Derived Fleet Speed"),
// replacing the flat global LaneMsPerDistance constant. Falls back to the
// global default if the derived rate is zero.
func (s *Service) msPerLaneUnitFor(f *Fleet) float64 {
	rate := DerivedLaneRate(*f, s.classStats)
	if rate <= 0 {
		return s.params.LaneMsPerDistance
	}
	return 1.0 / rate
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
	sched := board.ProductionSchedule()
	if err := validateFleetRing(ctx, f, sched); err != nil {
		return nil, err
	}
	now := s.clock.Now()
	// A running scan resolves on read too (ResolveActive no-ops before its eta) —
	// the sensor channel has no arrival to trigger on, so the claim itself is the
	// signal.
	if !board.Arrived(f.State, now) {
		if f.ActiveScanId != "" {
			return s.resolveDue(ctx, f)
		}
		return f, nil
	}
	if f.ActiveActionId != "" || f.ActiveScanId != "" {
		return s.resolveDue(ctx, f)
	}
	// No wrapping action (dev-seeded/legacy) — fold the settle into the doc
	// directly; there's no slot to free and no effects to mint. A due lane
	// transit folds nowhere locally (only its resolve may move systems), so an
	// unchanged fold writes nothing.
	eff := board.StateAt(f.State, now, sched)
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

// validateFleetRing is the stored-coordinate guard (design.md Decision 3's
// risk; tasks.md 3.11): reject, before any lattice computation, a fleet
// whose stored motion state carries a ring beyond the live schedule's
// maximum — polar.Schedule.Slots panics above MaxRing, and board.Canon calls
// it, so this is what keeps a radius reduction (or corrupt/stale data) a
// failed read rather than a panicked one. mine and market inherit this
// automatically through FleetSource.Get (fleet.Service.Get IS both
// interfaces' FleetSource.Get — verified by reading their declarations), so
// neither package needs a guard of its own.
//
// This is a fleet-READ rejection, never an action-parameter decode, so per
// the shared structured-log vocabulary (tasks.md 3.11/4.5) it carries `cause`
// and `ring` but never `actionType`/an action id.
func validateFleetRing(ctx context.Context, f *Fleet, sched polar.Schedule) error {
	ring, has := maxStateRing(f.State)
	if !has || (ring >= 0 && ring <= sched.MaxRing) {
		return nil
	}
	log.Warn().Ctx(ctx).Str("fleetId", f.Id).Str("cause", "ring-out-of-range").
		Int("ring", ring).Int("maxRing", sched.MaxRing).
		Msg("Fleet stored position ring exceeds the live board schedule")
	return fmt.Errorf("%w: fleet %s ring %d exceeds max %d", ErrRingOutOfRange, f.Id, ring, sched.MaxRing)
}

// maxStateRing returns the highest ring embedded anywhere in a fleet's stored
// motion state (whichever shape is populated), so the guard can catch a
// corrupt ring wherever it hides — a coast orbit, a burn's path/target, or a
// lane transit's board leg/entry gate. has is false for a mode carrying no
// ring at all (docked, lane-hold).
func maxStateRing(st board.MovementState) (ring int, has bool) {
	max := -1
	consider := func(r int) {
		if r > max {
			max = r
		}
	}
	switch st.Mode {
	case board.ModeCoast:
		if st.Coast != nil {
			consider(st.Coast.Ring)
		}
	case board.ModeBurn:
		if st.Burn != nil {
			for _, c := range st.Burn.Path {
				consider(c.Ring)
			}
			if st.Burn.Target.Cell != nil {
				consider(st.Burn.Target.Cell.Ring)
			}
		}
	case board.ModeLaneTransit:
		if st.LaneTransit != nil {
			consider(st.LaneTransit.EntryGate.Ring)
			if st.LaneTransit.BoardLeg != nil {
				for _, c := range st.LaneTransit.BoardLeg.Path {
					consider(c.Ring)
				}
			}
		}
	}
	if max < 0 {
		return 0, false
	}
	return max, true
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
	sched := board.ProductionSchedule()
	now := s.clock.Now()
	for i := range fleets {
		fleets[i].State = board.StateAt(fleets[i].State, now, sched)
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
	sched := board.ProductionSchedule()
	now := s.clock.Now()
	for i := range fleets {
		fleets[i].State = board.StateAt(fleets[i].State, now, sched)
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

	sched := board.ProductionSchedule()
	msPerTile := s.msPerTileFor(f)
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
			sol = board.SolveIntercept(from, *orb, now, msPerTile, s.params.InterceptHorizon, sched)
		} else {
			// Fixed feature (e.g. the star) — a static cell, no lead-solve.
			sol = board.SolveCell(from, featureAnchor(feat), now, msPerTile, sched)
		}
	case req.Target.Cell != nil:
		sol = board.SolveCell(from, *req.Target.Cell, now, msPerTile, sched)
	default:
		return nil, errors.New("order target must be a cell or a featureId")
	}

	// The star occupies the core {ring:0, slot:0}. It is a body, not a
	// destination: you can neither fly a fleet onto it nor dock it. A polar
	// path structurally cannot cross the core unless an endpoint IS the core
	// (board-tactical-math, "A Path Reaches the Core Only If an Endpoint Is
	// the Core"), so rejecting the core as an endpoint here is sufficient on
	// its own — there is no routing step to route around it with; the retired
	// board.RouteAround has no successor because there is nothing left for one
	// to do.
	if sol.MeetCell == (board.Cell{}) {
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
		// The burn param carries board.EncodeTarget's Firestore-native map, not
		// the domain struct req.Target directly — action.Commit's validator
		// (design.md Decision 4) rejects a bare board.Target as a
		// non-primitive Params value.
		Params:     map[string]interface{}{"target": board.EncodeTarget(req.Target), "dockOnArrive": dockOnArrive},
		Eta:        sol.ArriveTime,
		ActorState: map[string]interface{}{"state": burnState, "updatedAt": int64(now)},
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

// haltState computes where a cancel leaves a fleet: coast at its current board
// cell for an in-system move or a trip's board leg, or a lane-hold at the
// frozen fraction once it's out on a lane (#0008).
func (s *Service) haltState(ctx context.Context, f *Fleet, now common.WorldMillis) (board.MovementState, error) {
	sched := board.ProductionSchedule()
	if f.State.Mode == board.ModeLaneTransit && f.State.LaneTransit != nil {
		lt := f.State.LaneTransit
		// Still on the origin board burning to the gate — stop-burn to coast.
		if lt.BoardLeg != nil && now < lt.BoardLeg.GateEta {
			pos, _ := board.ShipPos(f.State, now, sched)
			return board.CoastAt(pos, now, sched), nil
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
	// A docked fleet has no motion to halt into a coast (#0010 Decision #16):
	// mine shares the movement channel (Decision #9), so a docked+mining fleet
	// is a reachable state for the first time — releasing that co-resident
	// verb's slot must never force the fleet off its dock.
	if f.State.Mode == board.ModeDocked {
		return f.State, nil
	}
	cur, err := s.Position(ctx, f)
	if err != nil {
		return board.MovementState{}, err
	}
	return board.CoastAt(cur, now, sched), nil
}

// SeedFleet drops a fleet into a system, coasting at a cell — the dev stand-in
// for spawn (#0009 replaces it). corporationId is set now so ownership is not a
// retrofit.
func (s *Service) SeedFleet(ctx context.Context, systemID, corporationID string, at board.Cell) (*Fleet, error) {
	// Nothing rests on the star: a fleet can't be seeded onto the core
	// {ring:0, slot:0}, same rule that forbids moving there.
	if at == (board.Cell{}) {
		return nil, ErrCoreDestination
	}
	now := s.clock.Now()
	f := &Fleet{
		Id:            "fleet_" + uuid.NewString(),
		CorporationId: corporationID,
		SystemId:      systemID,
		State:         board.CoastAt(at, now, board.ProductionSchedule()),
		// A newly seeded fleet carries a default roster — never empty (#0010
		// "Fleet Ship Composition") — and an empty cargo pool ("Fleet Cargo
		// Pool"'s "a fresh fleet's cargo pool is empty").
		Ships:     []ShipEntry{{Class: ClassSeed}},
		Cargo:     map[string]float64{},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.dao.Save(ctx, *f); err != nil {
		return nil, err
	}
	return f, nil
}

// Scan commits a 360° sweep through the action spine on the SENSOR channel
// (#0006 Decisions #19/#21): one manual trigger, an automatic all-around
// sweep. The ETA is frozen at commit (now + scan duration), and the origin
// system AND the emission hex ride in params (#0006 Decision #26 — the pulse
// grows from where it was fired and stays there): the observation domain's
// registered resolver mints the sweep from that pinned hex at resolution,
// while a mid-burn fleet moves on and still collects the returns. Movement
// is untouched: only a second SCAN is rejected (the sensor slot guard,
// action.ErrActiveActionExists).
func (s *Service) Scan(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}

	// A held sensor slot may be a scan that already FINISHED: resolution is
	// read-triggered (#0005), so on a quiet board nothing has run the fold and
	// the stale claim would 409 this commit. Resolve due actions first — the
	// exact mirror of orderBurn's arrived-order rule — and commit from the
	// settled doc. A scan still short of its eta resolves to nothing, keeps its
	// claim, and the commit below returns ErrActiveActionExists as intended.
	if f.ActiveScanId != "" {
		if f, err = s.resolveDue(ctx, f); err != nil {
			return nil, err
		}
	}
	now := s.clock.Now()

	// A fleet out on a lane (or holding mid-lane) has no system around it.
	eff := board.StateAt(f.State, now, board.ProductionSchedule())
	if eff.Mode == board.ModeLaneHold ||
		(eff.Mode == board.ModeLaneTransit && (eff.LaneTransit == nil || eff.LaneTransit.BoardLeg == nil || now >= eff.LaneTransit.BoardLeg.GateEta)) {
		return nil, ErrNotOnBoard
	}

	// The emission cell, pinned at commit (#0006 Decision #26): the live front
	// and the resolve-time mint both grow from where the pulse was fired.
	origin, err := s.Position(ctx, f)
	if err != nil {
		return nil, err
	}

	scanParams := observation.DefaultScanParams()
	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            scanType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           f.SystemId,
		Slot:            action.SlotSensor,
		// board.EncodeCell, not the bare board.Cell — action.Commit's validator
		// (design.md Decision 4) rejects a domain struct in Params.
		Params: map[string]interface{}{"systemId": f.SystemId, "origin": board.EncodeCell(origin)},
		Eta:    now.Add(scanParams.Duration),
	})
	if err != nil {
		return nil, err
	}
	f.ActiveScanId = a.Id
	f.UpdatedAt = now
	log.Info().Ctx(ctx).Str("fleetId", id).Str("actionId", a.Id).
		Int64("eta", int64(now.Add(scanParams.Duration))).Msg("Fleet ordered to scan")
	return f, nil
}

// FleetsForCorp implements observation.FleetSource: every unit a corporation
// owns, with its live cell resolved, so the fog domain can compute the corp's
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
		// body's LIVE cell — not the cell the burn ended on, which the body has
		// since orbited away from (the ship would stop seeing the very thing
		// it's holding onto).
		cell, err := s.Position(ctx, f)
		if err != nil {
			return nil, err
		}
		out = append(out, observation.FleetPos{
			Id:            f.Id,
			CorporationId: f.CorporationId,
			SystemId:      f.SystemId,
			Cell:          cell,
			ActiveScanId:  f.ActiveScanId,
		})
	}
	return out, nil
}

// Position resolves the fleet's live cell at the current world time. It
// answers from the EFFECTIVE state (board.StateAt): a burn whose arrival has
// passed is the coast — or the dock — it settled into, so a ship that docked
// onto an ORBITING body rides that body from the instant it arrives, whether
// or not the authoritative settle has written yet. (That also keeps the
// corp's own sensor bubble on the body a fleet is holding onto — see
// FleetsForCorp.)
//
// A docked fleet whose parent feature cannot be resolved (e.g. an interior
// splice guard omitted it — trading-station's degrade-to-no-station rule, or
// system's own stored-ring guard) returns ErrFeatureAbsent, the ordinary
// missing-feature outcome, NEVER a silent zero-value Cell (the core) with a
// nil error — that would read as "docked at the star", which the fleet never
// is. Every caller must check the error before trusting the returned cell.
func (s *Service) Position(ctx context.Context, f *Fleet) (board.Cell, error) {
	sched := board.ProductionSchedule()
	if err := validateFleetRing(ctx, f, sched); err != nil {
		return board.Cell{}, err
	}
	now := s.clock.Now()
	eff := board.StateAt(f.State, now, sched)
	if eff.Mode == board.ModeDocked {
		if eff.Docked == nil {
			return board.Cell{}, nil
		}
		feat, err := s.resolveFeature(ctx, f.SystemId, eff.Docked.ParentId)
		if err != nil {
			return board.Cell{}, err
		}
		if orb := featureOrbit(feat); orb != nil {
			return board.OrbState(*orb, now, sched), nil
		}
		return featureAnchor(feat), nil
	}
	pos, _ := board.ShipPos(eff, now, sched)
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

// featureAnchor is a fixed feature's board cell — now a direct index, since
// system.Feature.Footprint is []board.Cell, the same type this package
// speaks (design.md Decision 2: no more per-boundary Hex↔Cell conversion).
func featureAnchor(f *system.Feature) board.Cell {
	if len(f.Footprint) == 0 {
		return board.Cell{}
	}
	return f.Footprint[0]
}
