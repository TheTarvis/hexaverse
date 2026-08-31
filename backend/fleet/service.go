package fleet

import (
	"context"
	"errors"
	"fmt"
	"math"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/disclosure"
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

// jumpType is the action dispatch key for a fleet's single-hop lane jump
// (design.md Decision 10; fleet-movement "Lane Jump From a Docked Gate") —
// a thin lifecycle wrapper around the transit that lives in fleet.Jump,
// exactly as burnType wraps fleet.State.Burn.
const jumpType = "jump"

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
	// ErrJumpNotAttached rejects a jump ordered against a fleet not attached
	// to the named lane's own gate body (fleet-movement "Lane Jump From a
	// Docked Gate": "jumping without attachment is rejected").
	ErrJumpNotAttached = errors.New("fleet: jump requires attachment to the lane's own gate body")
	// ErrLaneNotCharted rejects a jump ordered over a lane the fleet's
	// corporation has not charted (fleet-movement "Lane Jump From a Docked
	// Gate": "jumping an uncharted lane is rejected").
	ErrLaneNotCharted = errors.New("fleet: jump requires the corporation to have charted the lane")
)

// BodySource resolves a system's body table — the space.Bodies implementation
// every burn solve, position read, and resolve folds through (design.md
// Decision 16). Satisfied by *system.Service. Resolved ONCE per request and
// threaded as a parameter — never fetched per body, never memoized in
// package-level state, and never used to enumerate Ids() into a response.
type BodySource interface {
	BodyTable(ctx context.Context, systemID string) (*system.BodyTable, error)
}

// TierSource resolves which lanes a corporation has charted — the jump
// verb's own narrowed use of what routing.go's pre-migration TierSource used
// to also cover for multi-hop planning (design.md Decision 10, 21A narrows
// it to ChartedLanes alone).
type TierSource interface {
	ChartedLanes(ctx context.Context, cid string) (map[string]bool, error)
}

// GraphSource resolves one lane's crossing geometry: the destination system
// id and the two endpoint systems' RAW galaxy coordinates (never a
// precomputed length), so Jump itself is what calls space.Vec3{...}.Length()
// (design.md Decision 10's own text names that call explicitly).
type GraphSource interface {
	LaneCrossing(ctx context.Context, laneId, fromSystemId string) (destSystemId string, from, to space.Vec3, err error)
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
	// Jump commits a single-hop lane crossing from a docked gate
	// (fleet-movement "Lane Jump From a Docked Gate").
	Jump(ctx context.Context, id, laneId string) (*Fleet, error)
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
	// tiers resolves a corporation's charted-lane set — Jump's own
	// eligibility check (design.md Decision 10). Wired via WithTierSource.
	tiers TierSource
	// graph resolves a lane's crossing geometry — Jump's own length input
	// (design.md Decision 10). Wired via WithGraph.
	graph GraphSource
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

// WithTierSource wires the charted-lane source Jump validates against.
func (s *Service) WithTierSource(ts TierSource) *Service {
	s.tiers = ts
	return s
}

// WithGraph wires the lane-crossing-geometry source Jump prices through.
func (s *Service) WithGraph(g GraphSource) *Service {
	s.graph = g
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
	// A due, unresolved jump settles the same opportunistic way (fleet-
	// movement "Jump Arrival Parks Near the Destination Gate, Unmasked").
	// Deliberately NOT folded onto settleIfDue (tasks.md 5.0's own scope
	// note: Get's signature carries no body table). Once settled, the
	// destination system's interior is materialized (create-if-absent)
	// STRICTLY AFTER the resolve transaction completes — a resolver may
	// perform no writes of its own (action.Resolution's own contract), and
	// GetOrCreateInterior against a cold system WRITES a freshly generated
	// interior (design.md Decision 16).
	if f.Jump != nil && s.clock.Now() >= f.Jump.ArriveMs {
		settled, err := s.resolveDue(ctx, f)
		if err != nil {
			return nil, err
		}
		if _, err := s.bodiesFor(ctx, settled.SystemId); err != nil {
			log.Warn().Ctx(ctx).Err(err).Str("fleetId", id).Str("systemId", settled.SystemId).
				Msg("Fleet jump settled but the destination interior failed to materialize")
		}
		return settled, nil
	}
	return f, nil
}

// ListInSystem returns every fleet currently in a system. Read-only — it does
// not settle a due arrival.
func (s *Service) ListInSystem(ctx context.Context, systemID string) ([]Fleet, error) {
	return s.dao.ListBySystem(ctx, systemID)
}

// ListForCorp returns every fleet a corporation owns, opportunistically
// settling any active burn whose ETA has already passed — the same
// fold-first predicate OrderTo/CutDrive/Jump evaluate through settleIfDue
// (tasks.md 5.0). The roster is now the corp's only fleet surface
// (SystemBoardView -> useMyFleets -> GET /v1/fleets?mine=true -> this
// method), so a fleet that has actually docked must read that way here too,
// not just through the single-fleet Get path — otherwise a body-targeted
// burn whose AttachedTo is set only at resolve (tasks.md 3.1) reads as
// forever mid-burn from the roster's point of view.
//
// A corp's fleets can span multiple systems, so settling the list requires a
// per-system BodySource, not one fixed table (settleIfDue's bt parameter is
// scoped to a single system). This resolves the body table ONCE PER DISTINCT
// SystemId present in the result — never once per fleet — mirroring
// bodiesFor's own "resolved once per request" contract (design.md Decision
// 16) at list scope instead of single-fleet scope. Fleets are grouped by
// system and each one is decided through the existing settleIfDue seam
// itself (no reimplemented "is it due" predicate), so a parked fleet running
// a co-resident mine on the same movement slot (settleIfDue's ModeBurn-only
// guard) is left untouched exactly as it is on every other door.
//
// Neither a body-table failure nor a per-fleet settle failure fails the
// whole list: each degrades to returning that system's (or that fleet's)
// entry unsettled, logged at Warn so the degradation is never silent. This
// mirrors two existing precedents rather than inventing a third: Get's own
// body-source failure on a settled jump's destination-interior materialize
// is caught and logged, never propagated (service.go's Get, "Fleet jump
// settled but the destination interior failed to materialize"); and
// system.BodyTable's own rule that a per-body/per-feature read failure
// degrades to a smaller table rather than failing the whole build
// (system/bodies.go: "The Table Degrades to Fewer Bodies Rather Than a
// Failed Build"). A list read that already has other corp fleets to show is
// the same shape of "partial data beats no data" as those two — one
// system's transient Firestore hiccup should not blank the whole roster.
func (s *Service) ListForCorp(ctx context.Context, corporationID string) ([]Fleet, error) {
	fleets, err := s.dao.ListByCorporation(ctx, corporationID)
	if err != nil {
		return nil, err
	}

	bySystem := make(map[string][]int, len(fleets))
	for i := range fleets {
		bySystem[fleets[i].SystemId] = append(bySystem[fleets[i].SystemId], i)
	}

	for systemID, idxs := range bySystem {
		bt, err := s.bodiesFor(ctx, systemID)
		if err != nil {
			log.Warn().Ctx(ctx).Err(err).Str("corporationId", corporationID).Str("systemId", systemID).
				Msg("ListForCorp: resolving the body table failed; returning this system's fleets unsettled")
			continue
		}
		for _, i := range idxs {
			settled, due, serr := s.settleIfDue(ctx, &fleets[i], bt)
			if serr != nil {
				log.Warn().Ctx(ctx).Err(serr).Str("corporationId", corporationID).Str("fleetId", fleets[i].Id).
					Msg("ListForCorp: settling a due arrival failed; returning this fleet unsettled")
				continue
			}
			if due {
				fleets[i] = *settled
			}
		}
	}

	return fleets, nil
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

// settleIfDue folds a fleet's stored, still-active burn through
// space.StateAt and, if the fold reveals the burn already reached its
// arrival — a due arrival never yet read/resolved — settles it through the
// action spine (motion settle + slot release, one transaction) and reloads
// the settled doc. This is the ONE seam OrderTo, CutDrive, and Jump all
// evaluate the SAME fold-first predicate through (tasks.md 5.0: "has this
// fleet's active burn already arrived?", previously encoded three different
// ways — a direct field check in Get, a fold-and-compare in OrderTo, a
// reactive catch of space.ErrCutAfterArrival in the cut path).
//
// A fleet with no active action, or whose stored state is not currently a
// burn (already parked or drifting — e.g. a docked fleet running a
// co-resident mine action on the same slot), is left untouched: there is no
// "has the active burn arrived" question to ask of it, and folding one
// anyway would spuriously re-resolve an unrelated, still-running action.
//
// Get is deliberately NOT retrofitted onto this seam — its signature
// (ctx, id) carries no body table, and mine.FleetSource/market depend on
// that exact shape (tasks.md 5.0's own scope note; a cross-package interface
// change recorded for separate sequencing).
func (s *Service) settleIfDue(ctx context.Context, f *Fleet, bt *system.BodyTable) (settled *Fleet, due bool, err error) {
	if f.ActiveActionId == "" || f.State.Mode != space.ModeBurn {
		return f, false, nil
	}
	folded, err := space.StateAt(bt, f.State, s.clock.Now())
	if err != nil {
		return nil, false, fmt.Errorf("fleet: folding active state: %w", err)
	}
	if folded.Mode == space.ModeBurn {
		return f, false, nil
	}
	settled, err = s.resolveDue(ctx, f)
	if err != nil {
		return nil, false, err
	}
	return settled, true, nil
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
	// the settled doc — via the shared fold-first seam (tasks.md 5.0).
	if settled, due, serr := s.settleIfDue(ctx, f, bt); serr != nil {
		return nil, serr
	} else if due {
		f = settled
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

	bt, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return nil, err
	}
	// An already-arrived-but-unresolved burn is a settled fact, not a drift
	// to mint: resolve it through the shared fold-first seam (tasks.md 5.0)
	// rather than leaving the stored burn unsettled. The cut itself is still
	// rejected — with this same named reason — since there is no longer a
	// live burn left to cut.
	if _, due, serr := s.settleIfDue(ctx, f, bt); serr != nil {
		return nil, serr
	} else if due {
		return nil, space.ErrCutAfterArrival
	}

	drift, err := space.CutDrive(*f.State.Burn, now)
	if err != nil {
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

// Jump commits POST /v1/fleets/:fleetId/jump {laneId} — a single-hop lane
// crossing from a docked gate (design.md Decision 10; fleet-movement "Lane
// Jump From a Docked Gate"). Accepted only when the fleet is attached to the
// lane's own gate body and its corporation has charted the lane; jump-
// eligible the SAME world millisecond it attaches — no dwell — which is why
// a due-but-unresolved arrival is settled through the shared fold-first seam
// (settleIfDue, tasks.md 5.0) before attachment is evaluated at all. Costs
// no delta-v: the fleet's kinematic State is left completely untouched —
// Jump alone carries the transit, and design.md Decision 4's own words are
// that the stale State "SHALL NOT be evaluated by any reader" while it is
// set. Replaces any active movement order, exactly as OrderTo/Stop do.
func (s *Service) Jump(ctx context.Context, id, laneId string) (*Fleet, error) {
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
	if settled, due, serr := s.settleIfDue(ctx, f, bt); serr != nil {
		return nil, serr
	} else if due {
		f = settled
	}

	if s.graph == nil {
		return nil, fmt.Errorf("fleet: no GraphSource configured: %w", ErrNoBodySource)
	}
	destId, from, to, err := s.graph.LaneCrossing(ctx, laneId, f.SystemId)
	if err != nil {
		return nil, fmt.Errorf("fleet: resolving lane crossing: %w", err)
	}

	// Jump-eligible only from the lane's OWN gate body, named by the
	// destination it leads to (system.gateId's own convention, mirrored here
	// since system does not export it).
	if f.AttachedTo != "gate-"+destId {
		return nil, ErrJumpNotAttached
	}

	if s.tiers == nil {
		return nil, fmt.Errorf("fleet: no TierSource configured: %w", ErrNoBodySource)
	}
	charted, err := s.tiers.ChartedLanes(ctx, f.CorporationId)
	if err != nil {
		return nil, fmt.Errorf("fleet: resolving charted lanes: %w", err)
	}
	if !charted[laneId] {
		return nil, ErrLaneNotCharted
	}

	now := s.clock.Now()
	// The lane's 3D length through space's own guarded, pinned arithmetic,
	// divided by the fleet's derived lane rate — a SPEED (roster.go: "3D
	// lane-length-units / unit-world-time") — then quantized by ceiling like
	// every other stored duration (design.md Decision 10, corrected 2026-08-31).
	length := space.Vec3{X: to.X - from.X, Y: to.Y - from.Y, Z: to.Z - from.Z}.Length()
	rate := DerivedLaneRate(*f, s.classStats)
	// A single division (length / (rate*1000)) rather than length/rate
	// followed by a second /1000 — the latter round-trips through an extra
	// float64 rounding step that can push an exact-in-world-ms crossing
	// (e.g. 700/0.35) a whole millisecond past QuantizeArrival's ceiling.
	flightSeconds := length / (rate * 1000)
	eta := space.QuantizeArrival(now, flightSeconds)

	jump := &JumpTransit{LaneId: laneId, DestSystemId: destId, DepartMs: now, ArriveMs: eta}

	// Re-task: release the current slot before claiming a new one — a
	// running action while jumping is the norm (a docked fleet mining, or a
	// completed-but-unresolved burn already folded away above).
	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, nil); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
	}

	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            jumpType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           f.SystemId,
		Params:          map[string]interface{}{"laneId": laneId, "destSystemId": destId},
		Eta:             eta,
		ActorState: map[string]interface{}{
			"jump": *jump, "updatedAt": int64(now),
		},
	})
	if err != nil {
		return nil, err
	}

	f.Jump = jump
	f.ActiveActionId = a.Id
	f.UpdatedAt = now
	log.Info().Ctx(ctx).Str("fleetId", id).Str("laneId", laneId).Str("actionId", a.Id).
		Int64("arriveMs", int64(eta)).Msg("Fleet jumped")
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
