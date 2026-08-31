package fleet

import (
	"context"
	"errors"
	"fmt"
	"math"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/observation"
	"hexaverse/space"
	"hexaverse/system"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// burnType is the action dispatch key for a fleet's in-system burn. The burn
// is a thin lifecycle wrapper (ETA, status, inbox, single slot) around the
// order that lives in fleet.State.Burn — never a second copy of motion state
// (#0005 Decision #6).
const burnType = "burn"

// actorCollection is where fleet docs live, so the action domain can claim and
// release the single-action slot generically without importing this package.
const actorCollection = "fleets"

// defaultAccel is Stop's own nominal commanded acceleration for its
// velocity-nulling burn (design.md Decision 8) — matching space's own
// MinArcLength/StopInPlaceSpeedFloor worked examples (space/params_const.go).
// OrderTo no longer uses this: an omitted OrderRequest.Accel defaults to the
// roster-derived ceiling (DerivedAccelCeiling, design.md Decision 9).
const defaultAccel float64 = 8

var (
	ErrNotFound = errors.New("fleet not found")
	// ErrFleetInTransit is returned by Position (and anything that resolves
	// through it) for a fleet whose Jump is set — a fleet crossing a lane has
	// no position in either system (design.md Decision 4; fleet-movement
	// MODIFIED "Effective Position Resolution").
	ErrFleetInTransit = errors.New("fleet: fleet is in lane transit and has no position in either system")
	// ErrEmptyOrder rejects an order naming neither a body id nor a point.
	ErrEmptyOrder = errors.New("fleet: order must name a bodyId or a point")
	// ErrAmbiguousOrder rejects an order naming more than one of bodyId/point.
	ErrAmbiguousOrder = errors.New("fleet: order must name exactly one of bodyId or point")
	// ErrNotBurning rejects cut-drive on a fleet that isn't mid-burn.
	ErrNotBurning = errors.New("fleet: cut-drive requires a fleet mid-burn")
	// ErrSeedInsideClearance rejects a seed position at or inside the system
	// star's configured clearance radius (fleet-movement "Spawn Fleet Seeding
	// Places a Park").
	ErrSeedInsideClearance = errors.New("fleet: seed position is at or inside the star's clearance radius")
	// ErrNoBodySource is a programmer-error guard: a request path needing
	// bodies was reached before WithBodies wired one (design.md Decision 16).
	ErrNoBodySource = errors.New("fleet: no BodySource configured")
	// ErrAccelAboveCeiling rejects a commanded acceleration greater than the
	// fleet's roster-derived ceiling (design.md Decision 9; "Derived Fleet
	// Acceleration and Drive Output").
	ErrAccelAboveCeiling = errors.New("fleet: commanded acceleration exceeds the fleet's derived ceiling")
	// ErrAccelBelowFloor rejects a commanded acceleration below
	// disclosure.MinCommandedAccel, and — per design.md Decision 9's own
	// wording — every non-finite (NaN, ±Inf) or non-positive (zero,
	// negative) value too, checked FIRST and before either bound comparison
	// ever runs (tasks.md 4.11: a NaN would otherwise reach
	// space.SolveBurn's flight-time quantization, whose int64(NaN)
	// conversion diverges by architecture).
	ErrAccelBelowFloor = errors.New("fleet: commanded acceleration is below the minimum floor")
)

// BodySource resolves a system's body table — the space.Bodies implementation
// every burn solve, position read, and resolve folds through (design.md
// Decision 16). Satisfied by *system.Service. Resolved ONCE per request and
// threaded as a parameter — never fetched per body, never memoized in
// package-level state, and never used to enumerate Ids() into a response.
type BodySource interface {
	BodyTable(ctx context.Context, systemID string) (*system.BodyTable, error)
}

type ServiceInterface interface {
	Get(ctx context.Context, id string) (*Fleet, error)
	// ListInSystem returns every fleet currently in a system (unfiltered).
	// Read-only: it never settles a due arrival.
	ListInSystem(ctx context.Context, systemID string) ([]Fleet, error)
	// ListForCorp returns every fleet a corporation owns, across systems.
	// Read-only.
	ListForCorp(ctx context.Context, corporationID string) ([]Fleet, error)
	OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error)
	CutDrive(ctx context.Context, id string) (*Fleet, error)
	Stop(ctx context.Context, id string) (*Fleet, error)
	Cancel(ctx context.Context, id string) (*Fleet, error)
	SeedFleet(ctx context.Context, systemID, corporationID string, at space.Vec3, starSize float64) (*Fleet, error)
	// Position resolves a fleet's live position at the current world time,
	// through the injected bodies table (design.md Decision 16).
	Position(ctx context.Context, f *Fleet, bodies space.Bodies) (space.Vec3, error)
	// PositionOf is Position's convenience form for a caller with no
	// BodySource of its own (the HTTP handler): it resolves f's own system's
	// body table and delegates.
	PositionOf(ctx context.Context, f *Fleet) (space.Vec3, error)
	// HomeGeometry resolves a system's continuous extent and star size — what
	// a deterministic spawn-park derivation needs (corporations' own
	// homeSpawnPosition, design.md Open Question 3).
	HomeGeometry(ctx context.Context, systemID string) (extent, starSize float64, err error)
}

type Service struct {
	dao     Dao
	actions action.CommitInterface
	clock   common.WorldTime
	params  MovementParams
	// classStats is the roster stats table burn ETA / capacity computations
	// derive through (#0010 "Derived Fleet Speed" / "Derived Cargo Capacity
	// and Mining Rate").
	classStats map[ShipClass]ClassStats
	// bodies resolves a system's space.Bodies table (design.md Decision 16).
	// Wired via WithBodies post-construction (mirroring the pre-existing
	// WithTravel pattern) since it is also the constructor's second
	// positional argument for the common case where it's known up front.
	bodies BodySource
}

func NewService() *Service {
	params := DefaultMovementParams()
	actions := action.NewService()
	svc := &Service{
		dao:        NewDao(),
		actions:    actions,
		clock:      common.WorldClock(),
		params:     params,
		classStats: DefaultClassStats(),
		bodies:     system.NewService(),
	}
	actions.RegisterResolver(burnType, action.KindKinematic, BurnResolver(svc.bodies))
	return svc
}

// NewServiceWith wires a fleet Service from explicit dependencies. bodies
// satisfies BodySource (a *system.Service does, structurally) and seeds the
// service's default body source; WithBodies overrides it later (tests, or a
// dependency not available at construction time).
func NewServiceWith(dao Dao, bodies BodySource, actions action.CommitInterface, clock common.WorldTime) *Service {
	return &Service{
		dao: dao, bodies: bodies, actions: actions, clock: clock,
		params: DefaultMovementParams(), classStats: DefaultClassStats(),
	}
}

// WithBodies overrides the BodySource — the seam body_source_test.go uses to
// inject a call-counting spy, and the general post-construction wiring point
// for a dependency not available at NewServiceWith's call site.
func (s *Service) WithBodies(bodies BodySource) *Service {
	s.bodies = bodies
	return s
}

// Get returns the fleet, opportunistically resolving a completed burn
// (arrival is a computed fact, not a fired event — #0004 Decision #12; no
// scheduler). Resolution runs through the action spine so the state settle
// AND the slot release — which is what sets AttachedTo for a body-targeted
// burn (tasks.md 3.1) — happen in one transaction. mine/market's
// FleetSource.Get is this exact method, so a docked-at-arrival fleet reads
// as docked without either package needing its own resolve trigger.
func (s *Service) Get(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	if f.ActiveActionId != "" && f.State.Mode == space.ModeBurn && f.State.Burn != nil &&
		s.clock.Now() >= f.State.Burn.ArriveMs {
		return s.resolveDue(ctx, f)
	}
	return f, nil
}

// ListInSystem returns every fleet currently in a system. Read-only — it does
// not settle a due arrival.
func (s *Service) ListInSystem(ctx context.Context, systemID string) ([]Fleet, error) {
	return s.dao.ListBySystem(ctx, systemID)
}

// ListForCorp returns every fleet a corporation owns.
func (s *Service) ListForCorp(ctx context.Context, corporationID string) ([]Fleet, error) {
	return s.dao.ListByCorporation(ctx, corporationID)
}

// FleetsForCorp implements observation.FleetSource. The lattice-cell coverage
// it used to answer with has no successor after Decision 4 (a fleet has no
// board cell) — chain link 4's own scope stops at making the type change
// compile; deleting the five now-vacuous observation requirements this fed
// is link 4 section 7's job (design.md Decision 11). Degrading to "no
// coverage from any unit" here is the honest interim: it is strictly more
// restrictive than today, and it manufactures no shadow lattice position
// (the ground rules' standing prohibition) to keep the old shape alive.
func (s *Service) FleetsForCorp(_ context.Context, _ string, _ common.WorldMillis) ([]observation.FleetPos, error) {
	return nil, nil
}

// bodiesFor resolves the request-scoped body table for systemID exactly once
// (design.md Decision 16) — every caller in this file threads the result
// onward rather than resolving again.
func (s *Service) bodiesFor(ctx context.Context, systemID string) (*system.BodyTable, error) {
	if s.bodies == nil {
		return nil, ErrNoBodySource
	}
	return s.bodies.BodyTable(ctx, systemID)
}

// HomeGeometry resolves a system's continuous extent and star size —
// corporations' homeSpawnPosition needs both to derive a deterministic spawn
// park without corporations itself depending on the system package.
func (s *Service) HomeGeometry(ctx context.Context, systemID string) (extent, starSize float64, err error) {
	bt, err := s.bodiesFor(ctx, systemID)
	if err != nil {
		return 0, 0, err
	}
	return bt.Extent(), bt.StarSize(), nil
}

// Position resolves the fleet's live position at the current world time
// through space.StatePosition — the SOLE canonical position path (tasks.md
// 3.7; fleet-movement MODIFIED "Effective Position Resolution"). A docked
// fleet's position falls straight out of this fold too: its stored Park
// already rides its host (ParkOrbit/ParkStationkeep resolve the host's live
// position plus a local offset) — AttachedTo is a relationship marker, never
// a second position formula.
//
// A fleet mid-jump (Jump != nil) has no position in either system and
// reports ErrFleetInTransit regardless of what its stale pre-jump State
// holds.
func (s *Service) Position(_ context.Context, f *Fleet, bodies space.Bodies) (space.Vec3, error) {
	if f.Jump != nil {
		return space.Vec3{}, ErrFleetInTransit
	}
	return space.StatePosition(bodies, f.State, s.clock.Now())
}

// PositionOf resolves bodies for f's own system and delegates to Position —
// the convenience form callers with no BodySource of their own (the HTTP
// handler) use, so the read surface doesn't have to resolve a BodySource
// itself.
func (s *Service) PositionOf(ctx context.Context, f *Fleet) (space.Vec3, error) {
	bt, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return space.Vec3{}, err
	}
	return s.Position(ctx, f, bt)
}

// OrderTo solves and commits an in-system burn to a body id or an explicit
// point (design.md Decision 4; fleet-movement "In-System Burn Order to a
// Body or a Point"). Committing a burn clears AttachedTo immediately — a
// body-targeted burn only re-attaches once BurnResolver settles the arrival
// (tasks.md 3.1's pinned invariant).
func (s *Service) OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error) {
	var target space.Target
	switch {
	case req.BodyId != "" && req.Point != nil:
		return nil, ErrAmbiguousOrder
	case req.BodyId != "":
		target = space.Target{BodyId: req.BodyId}
	case req.Point != nil:
		target = space.Target{Point: req.Point}
	default:
		return nil, ErrEmptyOrder
	}

	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	if f.Jump != nil {
		return nil, ErrFleetInTransit
	}

	bt, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return nil, err
	}

	now := s.clock.Now()

	// An active movement action that already completed is a fact, not a
	// re-taskable order: resolve it first (settle + effects), then order from
	// the settled doc.
	if f.ActiveActionId != "" {
		folded, ferr := space.StateAt(bt, f.State, now)
		if ferr != nil {
			return nil, fmt.Errorf("fleet: folding active state: %w", ferr)
		}
		if folded.Mode != space.ModeBurn {
			if f, err = s.resolveDue(ctx, f); err != nil {
				return nil, err
			}
		}
	}

	from, err := s.Position(ctx, f, bt)
	if err != nil {
		return nil, err
	}

	// Commanded acceleration: an omitted value defaults to the fleet's
	// roster-derived ceiling (design.md Decision 9). Non-finite/non-positive
	// values are rejected FIRST, before either bound comparison, so a NaN or
	// ±Inf never reaches space.SolveBurn's flight-time quantization
	// (tasks.md 4.11).
	ceiling := DerivedAccelCeiling(*f, s.classStats)
	accel := ceiling
	if req.Accel != nil {
		accel = *req.Accel
	}
	if math.IsNaN(accel) || math.IsInf(accel, 0) || accel <= 0 {
		return nil, ErrAccelBelowFloor
	}
	if accel > ceiling {
		return nil, ErrAccelAboveCeiling
	}
	if accel < disclosure.MinCommandedAccel {
		return nil, ErrAccelBelowFloor
	}

	// Depart tangent to the fleet's LIVE motion at commit time, not a fresh
	// chord toward the new target (fleet-movement "In-System Burn Order to a
	// Body or a Point": "re-targeting mid-burn departs tangent to current
	// motion, not the original departure"). A fleet with no live velocity
	// (e.g. parked at a point) normalizes to nothing, and space.SolveBurn
	// falls back to its own chord direction exactly as before.
	vel, err := currentVelocity(bt, f.State, now)
	if err != nil {
		return nil, fmt.Errorf("fleet: resolving live velocity for burn departure: %w", err)
	}
	var departDir *space.Vec3
	if dir, ok := vel.Normalize(); ok {
		departDir = &dir
	}

	starClearance := space.StarClearanceRadius(bt.StarSize())

	sol, err := space.SolveBurn(bt, from, target, now, accel, departDir, starClearance, space.SolveRounds)
	if err != nil {
		return nil, fmt.Errorf("fleet: solving burn: %w", err)
	}
	burnState := space.ShipState{Mode: space.ModeBurn, Burn: &sol.Burn}

	// Re-task: release the current slot before claiming a new one (a running
	// action while ordering is the norm mid-burn). ErrNotRunning means it
	// already resolved — the slot is free, so proceed.
	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, nil); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
	}

	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            burnType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           f.SystemId,
		Params:          map[string]interface{}{"state": EncodeKinematicState(burnState)},
		Eta:             sol.Burn.ArriveMs,
		ActorState: map[string]interface{}{
			"state": EncodeKinematicState(burnState), "attachedTo": "", "updatedAt": int64(now),
		},
	})
	if err != nil {
		return nil, err
	}

	f.State = burnState
	// Committing a burn detaches the fleet from its host — at commit, not at
	// resolve (tasks.md 3.1; design.md Decision 4, 13).
	f.AttachedTo = ""
	f.ActiveActionId = a.Id
	f.UpdatedAt = now
	log.Info().Ctx(ctx).Str("fleetId", id).Str("actionId", a.Id).
		Int64("arriveMs", int64(sol.Burn.ArriveMs)).Msg("Fleet ordered to burn")
	return f, nil
}

// CutDrive converts an active burn to a drift at its live position and
// velocity (design.md Decision 6; fleet-movement "Cut Drive Converts the
// Burn to a Drift and Goes Dark") — free, instant, and dark: no delta-v, no
// ETA, no new action. AttachedTo was already cleared at the burn's own
// commit (tasks.md 3.1); cut-drive performs no further mutation of it.
func (s *Service) CutDrive(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	if f.State.Mode != space.ModeBurn || f.State.Burn == nil {
		return nil, ErrNotBurning
	}
	now := s.clock.Now()

	drift, err := space.CutDrive(*f.State.Burn, now)
	if err != nil {
		if errors.Is(err, space.ErrCutAfterArrival) {
			// An already-arrived-but-unresolved burn is a settled fact, not a
			// drift to mint: resolve it through the action spine (the same
			// fold-first pattern OrderTo/Cancel already apply to a stale
			// arrival) rather than leaving the stored burn unsettled. The cut
			// itself is still rejected — with this same named reason — since
			// there is no longer a live burn left to cut.
			if _, rerr := s.resolveDue(ctx, f); rerr != nil {
				return nil, rerr
			}
		}
		return nil, err
	}
	newState := space.ShipState{Mode: space.ModeDrift, Drift: &drift}

	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, map[string]interface{}{
			"state": EncodeKinematicState(newState), "updatedAt": int64(now),
		}); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
	}

	f.State = newState
	f.AttachedTo = ""
	f.ActiveActionId = ""
	f.UpdatedAt = now
	return f, nil
}

// currentVelocity folds s to its effective state at t and returns that
// state's velocity — Stop's own need (deciding the speed-floor branch) never
// re-derives a second formula: ModeBurn rides the curve's tangent scaled by
// its speed, ModeParked/ModeDrift ride their own analytic Velocity.
func currentVelocity(bodies space.Bodies, s space.ShipState, t common.WorldMillis) (space.Vec3, error) {
	folded, err := space.StateAt(bodies, s, t)
	if err != nil {
		return space.Vec3{}, err
	}
	switch folded.Mode {
	case space.ModeBurn:
		return folded.Burn.Tangent(t).Scale(folded.Burn.Speed(t)), nil
	case space.ModeParked:
		return folded.Park.Velocity(bodies, t)
	case space.ModeDrift:
		return folded.Drift.Velocity, nil
	default:
		return space.Vec3{}, space.ErrUnknownParkKind
	}
}

// Stop commits POST /v1/fleets/:fleetId/stop (design.md Decision 8;
// fleet-movement "Stop In Place Commits a Velocity-Nulling Burn"): at or
// below space.StopInPlaceSpeedFloor, an instant, free conversion to a point
// park at the current position; above it, an ordinary burn to a nearby point
// ahead of the fleet's current heading (which already ends at zero speed —
// the accelerate-flip-decelerate profile's own shape, no special "nulling"
// logic needed). AttachedTo clears the instant the order is accepted,
// unconditionally (tasks.md 3.1).
func (s *Service) Stop(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()

	bt, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return nil, err
	}

	pos, err := s.Position(ctx, f, bt)
	if err != nil {
		return nil, err
	}
	vel, err := currentVelocity(bt, f.State, now)
	if err != nil {
		return nil, fmt.Errorf("fleet: resolving velocity to stop: %w", err)
	}

	f.AttachedTo = ""

	if vel.Length() <= space.StopInPlaceSpeedFloor {
		newState := space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: pos}}
		if f.ActiveActionId != "" {
			if _, err := s.actions.Cancel(ctx, f.ActiveActionId, map[string]interface{}{
				"state": EncodeKinematicState(newState), "attachedTo": "", "updatedAt": int64(now),
			}); err != nil && !errors.Is(err, action.ErrNotRunning) {
				return nil, err
			}
		}
		f.State = newState
		f.ActiveActionId = ""
		f.UpdatedAt = now
		return f, nil
	}

	// Above the floor: an ordinary burn to a point a short distance ahead of
	// the fleet's current heading — it costs delta-v, takes time, and emits
	// for its duration, settling to a point park on arrival (the ordinary
	// accelerate-flip-decelerate profile already ends at zero speed).
	lead := pos
	if unit, ok := vel.Normalize(); ok {
		lead = pos.Add(unit.Scale(space.MinArcLength * 2))
	}
	starClearance := space.StarClearanceRadius(bt.StarSize())
	sol, err := space.SolveBurn(bt, pos, space.Target{Point: &lead}, now, defaultAccel, nil, starClearance, space.SolveRounds)
	if err != nil {
		return nil, fmt.Errorf("fleet: solving stop burn: %w", err)
	}
	newState := space.ShipState{Mode: space.ModeBurn, Burn: &sol.Burn}

	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, nil); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
	}
	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            burnType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           f.SystemId,
		Params:          map[string]interface{}{"state": EncodeKinematicState(newState)},
		Eta:             sol.Burn.ArriveMs,
		ActorState: map[string]interface{}{
			"state": EncodeKinematicState(newState), "attachedTo": "", "updatedAt": int64(now),
		},
	})
	if err != nil {
		return nil, err
	}
	f.State = newState
	f.ActiveActionId = a.Id
	f.UpdatedAt = now
	return f, nil
}

// Cancel releases the fleet's active movement-channel action, if any.
// Cancelling a mid-burn fleet converts it to a drift at the cancel instant
// (the same free, instant cut-drive conversion, via CutDrive itself).
//
// A burn whose ArriveMs has already passed — but was never re-read, so the
// doc still says burn — is a stale fact, not a live one: space.CutDrive
// deliberately rejects re-cutting it (ErrCutAfterArrival is the direct
// cut-drive verb's own guard), but Cancel's contract has no such carve-out —
// it unconditionally halts the fleet. It halts the same way a live cut
// would: a drift anchored at the burn's own terminal position and velocity.
// Burn.Position/Tangent/Speed all clamp at-or-after ArriveMs (space-
// kinematics: "A time after arrive clamps to the intercept at zero speed"),
// so evaluating them at or after arrival yields exactly the zero-velocity
// drift anchored at the intercept that a cut an instant before arrival
// would have produced — no special case, and no need to fold all the way
// into the settled park an ordinary read would answer with.
//
// Cancelling a non-movement verb sharing the channel (e.g. a running mine)
// — or a fleet with no active action at all — releases only that action's
// slot, leaving State and AttachedTo untouched (design.md Decision 20:
// "cancelling via the fleet endpoint while mining leaves the fleet docked"
// — a docked fleet has no motion to halt into a coast).
func (s *Service) Cancel(ctx context.Context, id string) (*Fleet, error) {
	f, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	if f.State.Mode == space.ModeBurn && f.State.Burn != nil {
		now := s.clock.Now()
		if now < f.State.Burn.ArriveMs {
			return s.CutDrive(ctx, id)
		}
		b := *f.State.Burn
		newState := space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{
			Anchor:   b.Position(now),
			Velocity: b.Tangent(now).Scale(b.Speed(now)),
			EpochMs:  now,
		}}
		if f.ActiveActionId != "" {
			if _, err := s.actions.Cancel(ctx, f.ActiveActionId, map[string]interface{}{
				"state": EncodeKinematicState(newState), "updatedAt": int64(now),
			}); err != nil && !errors.Is(err, action.ErrNotRunning) {
				return nil, err
			}
		}
		f.State = newState
		f.AttachedTo = ""
		f.ActiveActionId = ""
		f.UpdatedAt = now
		return f, nil
	}
	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, nil); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
		f.ActiveActionId = ""
	}
	return f, nil
}

// SeedFleet places a fleet at a deterministic park (design.md Decision
// 14/16; fleet-movement "Spawn Fleet Seeding Places a Park"). Idempotent per
// corporation: a corp that already has a hull returns it unchanged rather
// than minting a second one. Rejects a position at or inside the system
// star's configured clearance radius — the star is excluded by geometry
// alone (design.md Decision 14), with no destination-identity special case.
func (s *Service) SeedFleet(ctx context.Context, systemID, corporationID string, at space.Vec3, starSize float64) (*Fleet, error) {
	existing, err := s.dao.ListByCorporation(ctx, corporationID)
	if err != nil {
		return nil, err
	}
	if len(existing) > 0 {
		return &existing[0], nil
	}

	if at.Length() <= space.StarClearanceRadius(starSize) {
		return nil, ErrSeedInsideClearance
	}

	now := s.clock.Now()
	f := &Fleet{
		Id:            "fleet_" + uuid.NewString(),
		CorporationId: corporationID,
		SystemId:      systemID,
		// Seeding SHALL place a point park (never stationkeep, which would
		// start charging upkeep before the corp's first order).
		State:     space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: at}},
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

// resolveDue runs the authoritative settle for a fleet whose active action
// has reached its ETA: resolution through the action spine (motion settle +
// slot release + the exactly-once effects, one transaction), then a re-read
// of the settled doc.
func (s *Service) resolveDue(ctx context.Context, f *Fleet) (*Fleet, error) {
	if _, err := s.actions.ResolveActive(ctx, f.Id); err != nil {
		return nil, err
	}
	return s.load(ctx, f.Id)
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
