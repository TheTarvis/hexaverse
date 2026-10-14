package fleet

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"math"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/space"
	"hexaverse/system"

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

// scanType is the action dispatch key for a fleet's focused scan
// (focused-scan "A Focused Sweep Commits On the Sensor Channel"; design.md
// Decision 8) — committed on the sensor channel (action.SlotSensor),
// independent of the movement channel burn/jump claim.
const scanType = "scan"

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
	// to the named lane's own gate body (fleet-movement "Lane Jump From an
	// Attached Gate": "jumping without attachment to the named gate is
	// rejected"). Jump-eligibility is attachment alone, no dwell, and no
	// map-knowledge precondition (design.md Decision 2 of
	// replace-observation-with-sightings: charting is map knowledge and a
	// sellable intel product, never a permission).
	ErrJumpNotAttached = errors.New("fleet: jump requires attachment to the lane's own gate body")
	// ErrScanHostUnresolved rejects a focused scan whose hostId does not
	// resolve, at commit time, to a body or to a fleet owned by the
	// scanning fleet's own corporation, present in the scanning fleet's own
	// system (focused-scan "A Focused Sweep Commits On the Sensor
	// Channel"). A hostId naming a fleet owned by a DIFFERENT corporation is
	// rejected through this exact same sentinel, with no distinguishing
	// field — a distinguishable rejection would itself disclose that
	// foreign fleet's presence, range, and occlusion state.
	ErrScanHostUnresolved = errors.New("fleet: scan host does not resolve to a body or an own fleet in this system")
	// ErrDestinationNotReady rejects a jump commit whose destination's lane
	// horizon could not be materialized (replace-observation-with-sightings
	// design.md Decision 28, corrected 2026-09-01: EnsureLaneHorizon fails
	// closed at Jump commit). A distinguishable, retryable refusal — no
	// action is committed and the fleet remains attached to the originating
	// gate — mapped by the handler to 503.
	ErrDestinationNotReady = errors.New("fleet: destination's lane horizon could not be materialized")
	// ErrInvalidFuelCap rejects a negative or non-finite OrderRequest
	// .MaxFuelTons as a malformed request — never as an absent cap
	// (fleet-movement "A malformed cap is an invalid request, not an absent
	// cap").
	ErrInvalidFuelCap = errors.New("fleet: maxFuelTons must be a finite, non-negative number")
	// ErrQuotedCapExceeded is the burn commit's own quoted-cap rejection —
	// DISTINCT from ErrInsufficientFuel, which answers "this fleet cannot
	// pay" where this one answers "this cost is higher than the one the
	// requester agreed to" (fleet-movement "A Burn Commit Is Rejected When
	// Its Solved Fuel Cost Exceeds the Requester's Quoted Cap"). A fleet with
	// ample fuel can hit this one, and a fleet with a generous cap can hit
	// the other, so a caller must be able to tell them apart.
	//
	// Raised as a QuotedCapExceededError, which carries the true solved cost;
	// this sentinel is what errors.Is matches on.
	ErrQuotedCapExceeded = errors.New("fleet: solved fuel cost exceeds the requested maxFuelTons cap")
	// ErrPreviewLaneTarget rejects a preview naming a laneId. A jump has no
	// variable curve or delta-v to preview — it costs no delta-v and its ETA
	// is a direct function of lane length and the fleet's lane rate — so this
	// is its OWN named reason, deliberately distinct from ErrEmptyOrder,
	// which is what a laneId-only request would otherwise fall through to
	// (fleet-movement "A preview rejects a lane id").
	ErrPreviewLaneTarget = errors.New("fleet: a laneId names a jump, which has no burn to preview")
	// ErrPreviewChannelHeld refuses a preview for a fleet whose MOVEMENT
	// channel is already claimed by a non-burn verb — a running mine. It is
	// the PREVIEW PATH'S OWN reason and is deliberately not derived from any
	// commit rejection, because the commit path has none: OrderTo's re-task
	// branch cancels whatever holds the slot without inspecting its type, so
	// a burn ordered against a mining fleet is accepted today and the run is
	// destroyed (an open defect recorded in
	// docs/handoffs/defect-burn-cancels-running-mine.md,
	// which this additive change leaves exactly as it is). A preview cannot
	// mirror a commit that proceeds by cancelling a run, since a preview
	// never writes; refusing is the conservative choice while the defect
	// stands, so no player is handed a quote for an order whose commit would
	// silently destroy a committed run (fleet-movement "A preview against a
	// fleet mid-mine is refused, cancels nothing, and writes nothing").
	ErrPreviewChannelHeld = errors.New("fleet: preview unavailable while the movement channel is held by another run")
)

// QuotedCapExceededError is ErrQuotedCapExceeded carrying the order's TRUE
// solved fuel cost, so the requester can re-quote against the real figure
// without a second round trip (fleet-movement "The quoted-cap rejection
// carries the true solved cost").
//
// Its Error() text is fixed and carries neither figure: the rejection reason
// a caller reads must be the same string whether the cap was 0 or half the
// cost (fleet-movement "A cap of exactly zero is a present cap, not an absent
// one" pins that the two are the same rejection). The numbers ride the
// response body's own fields.
type QuotedCapExceededError struct {
	Cap            float64
	SolvedFuelTons float64
}

func (e *QuotedCapExceededError) Error() string { return ErrQuotedCapExceeded.Error() }

// Unwrap makes errors.Is(err, ErrQuotedCapExceeded) match, so every caller
// that only needs the reason can stay sentinel-shaped.
func (e *QuotedCapExceededError) Unwrap() error { return ErrQuotedCapExceeded }

// BodySource resolves a system's body table — the space.Bodies implementation
// every burn solve, position read, and resolve folds through (design.md
// Decision 16). Satisfied by *system.Service. Resolved ONCE per request and
// threaded as a parameter — never fetched per body, never memoized in
// package-level state, and never used to enumerate Ids() into a response.
type BodySource interface {
	BodyTable(ctx context.Context, systemID string) (*system.BodyTable, error)
}

// GraphSource resolves one lane's crossing geometry: the destination system
// id and the two endpoint systems' RAW galaxy coordinates (never a
// precomputed length), so Jump itself is what calls space.Vec3{...}.Length()
// (design.md Decision 10's own text names that call explicitly). It also
// exposes EnsureLaneHorizon — the destination-materialization seam Decision
// 28 of replace-observation-with-sightings hoists onto the jump path (tasks
// 10.2/10.3) — so a *galaxy.Service satisfies this interface structurally
// with no new constructor parameter (design.md Decision 22's
// required-positional-parameter discipline: the ONE dependency this package
// already threads covers both needs).
type GraphSource interface {
	LaneCrossing(ctx context.Context, laneId, fromSystemId string) (destSystemId string, from, to space.Vec3, err error)
	// EnsureLaneHorizon materializes systemID's full lane horizon —
	// idempotent and a pure function of the id (galaxy.Service.EnsureLaneHorizon).
	EnsureLaneHorizon(ctx context.Context, systemID string) error
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
	// Scan commits a focused sweep of a body or an own fleet in the
	// scanning fleet's own system, on the sensor channel, independent of
	// the movement channel a burn or jump claims (focused-scan "A Focused
	// Sweep Commits On the Sensor Channel").
	Scan(ctx context.Context, id, hostId string) (*Fleet, error)
	Cancel(ctx context.Context, id string) (*Fleet, error)
	// Hold converts an orbiting fleet to a station-keeping park at its
	// current offset, and Release converts it back — both instant, neither
	// creating an action or claiming a channel slot (fleet-movement
	// "Station-Keeping Hold and Release Are Fleet Verbs").
	Hold(ctx context.Context, id string) (*Fleet, error)
	Release(ctx context.Context, id string) (*Fleet, error)
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
	// ScanTargets serves the set of hosts a focused-scan commit by id would
	// accept right now, priced at the duration that commit would freeze
	// (focused-scan "Eligible Scan Targets Are Served Per Fleet, To Their
	// Owner Alone").
	ScanTargets(ctx context.Context, id string) ([]ScanTarget, error)
}

type Service struct {
	discovery      DiscoverySource
	surveyDuration common.WorldMillis
	dao            Dao
	actions        action.CommitInterface
	clock          common.WorldTime
	params         MovementParams
	// classStats is the roster stats table burn ETA / capacity computations
	// derive through (#0010 "Derived Fleet Speed" / "Derived Cargo Capacity
	// and Mining Rate").
	classStats map[ShipClass]ClassStats
	// bodies resolves a system's space.Bodies table (design.md Decision 16).
	// Supplied at construction; WithBodies overrides it later for a
	// dependency not available at the constructor's call site.
	bodies BodySource
	// graph resolves a lane's crossing geometry — Jump's own length input
	// (design.md Decision 10). Supplied at construction, as a required
	// positional parameter of the package's ONE constructor (design.md
	// Decision 22 of replace-observation-with-sightings, tasks.md 6.3: every
	// caller states this dependency or fails to compile, because an optional
	// post-construction accessor a wiring change can silently omit is exactly
	// what left Jump unreachable in production — twice).
	graph GraphSource
	// fuelParams holds the fuel-currency tuning knobs (add-fuel-as-cargo).
	// Sourced from DefaultFuelParams() at construction; tests override via
	// WithFuelParams.
	fuelParams FuelParams
}

// NewServiceWith wires a fleet Service from explicit dependencies — the
// package's only constructor (tasks.md 6.3). bodies satisfies BodySource and
// graph satisfies GraphSource (a *system.Service and a *galaxy.Service do,
// respectively, structurally); both are the resolved-dependency sources every
// commit path folds through, so they sit adjacent in the signature. Neither is
// optional: there is no zero-dependency variant and no post-construction
// accessor for graph, which is what makes a graph-less Service unconstructable
// rather than merely discouraged.
//
// It registers NO resolvers: registration is a composition-root act (router.go
// calls RegisterResolvers and RegisterScanResolver), never a constructor side
// effect (tasks.md 6.1, design.md Decision 22). A constructor-side
// registration builds a SECOND, PARTIAL resolver table on an action.Service
// the composition root never sees — the bug fixed in 3bcc726, which left
// fleets uncommandable because jump and scan were never registered on the
// table the request path actually dispatched through.
func NewServiceWith(dao Dao, bodies BodySource, graph GraphSource, actions action.CommitInterface, clock common.WorldTime) *Service {
	return &Service{
		dao: dao, bodies: bodies, graph: graph, actions: actions, clock: clock,
		params: DefaultMovementParams(), classStats: DefaultClassStats(),
		fuelParams: DefaultFuelParams(),
	}
}

// WithBodies overrides the BodySource — the seam body_source_test.go uses to
// inject a call-counting spy, and the general post-construction wiring point
// for a dependency not available at NewServiceWith's call site.
func (s *Service) WithBodies(bodies BodySource) *Service {
	s.bodies = bodies
	return s
}

// WithFuelParams overrides the fuel-currency tuning knobs — the seam a test
// uses to induce a deterministic affordability boundary.
func (s *Service) WithFuelParams(p FuelParams) *Service {
	s.fuelParams = p
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
	if f.Survey != nil {
		if s.clock.Now() >= f.Survey.ArriveMs {
			return s.resolveDue(ctx, f)
		}
		bt, err := s.bodiesFor(ctx, f.SystemId)
		if err != nil {
			return nil, err
		}
		probe := action.Action{Scope: f.SystemId, Eta: s.clock.Now(), Params: map[string]interface{}{"bodyId": f.Survey.BodyId}}
		if !surveyValid(bt, f, probe) {
			if _, err := s.actions.Cancel(ctx, f.ActiveScanId, map[string]interface{}{"survey": nil, "lastSurveyOutcome": "Survey cancelled: left range, departed, or target unavailable"}); err != nil && !errors.Is(err, action.ErrNotRunning) {
				return nil, err
			}
			return s.load(ctx, id)
		}
	}
	// Every decision this read feeds reads `cargo.fuel` — the roster's
	// FreeHold (handler.go), the estimated maximum range, and the persistent
	// stranded indication — so a `stationkeep` park at or after its stored
	// dry instant is settled DURABLY first, by the preceding, independent,
	// conditional write (fleet-movement "Every Decision Reading Fuel Settles
	// a Past-Dry-Instant Hold First"). An in-memory fold would satisfy every
	// "computed from the settled value" assertion while leaving the stored
	// figure stale for the next reader to trip over.
	if f, err = s.settleExpiredHoldFirst(ctx, f); err != nil {
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
		// Redundant idempotent confirmation of the destination's lane
		// horizon (replace-observation-with-sightings design.md Decision 28,
		// corrected 2026-09-01): commit time (Jump, above) is the
		// load-bearing ensure, so this call can only ever re-confirm an
		// already-materialized horizon or catch a future commit path that
		// forgets to call it. A failure here logs at Error and does not fail
		// the read — the flip has already committed, so failing would strand
		// a fleet that has genuinely arrived.
		if err := s.graph.EnsureLaneHorizon(ctx, settled.SystemId); err != nil {
			log.Error().Ctx(ctx).Err(err).Str("fleetId", id).Str("systemId", settled.SystemId).
				Msg("Jump arrival's redundant lane-horizon confirmation failed")
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
		if fleets[i].Survey != nil {
			if fresh, err := s.Get(ctx, fleets[i].Id); err == nil {
				fleets[i] = *fresh
			}
		}
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
			// The roster read is the SAME FreeHold / estimated-range /
			// stranded-indication consumer the single-fleet read is (one call
			// site, handler.go's rosterFieldsFor), so a past-dry-instant
			// station-keeping hold settles durably here too (fleet-movement
			// "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold
			// First"). Degrades exactly as the due-arrival settle above does:
			// one fleet's failure returns that fleet unsettled rather than
			// blanking the whole roster.
			held, herr := s.settleExpiredHoldFirst(ctx, &fleets[i])
			if herr != nil {
				log.Warn().Ctx(ctx).Err(herr).Str("corporationId", corporationID).Str("fleetId", fleets[i].Id).
					Msg("ListForCorp: settling an elapsed station-keeping hold failed; returning this fleet unsettled")
				continue
			}
			fleets[i] = *held
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

// orderSolve is everything solveOrder derives for one in-system burn order,
// before any decision is taken about it: the settled fleet it departs from,
// the table it was solved against, the instant it was solved at, the solved
// burn itself, and the whole fuel arithmetic — priced but not yet judged.
//
// It exists so the COMMIT (OrderTo) and the PREVIEW (PreviewOrder) share one
// solve and cannot drift (serve-orbital-elements-and-burn-preview tasks.md
// 3.1; fleet-movement "A preview returns the same curve, ETA, and cost a
// commit would produce"). Nothing here rejects: every rejection either
// happened inside solveOrder — and is therefore shared verbatim — or is the
// caller's own (the commit's insufficient-fuel and quoted-cap rejections; the
// preview reports affordability instead of rejecting on it).
type orderSolve struct {
	// Fleet is the SETTLED fleet the burn departs from — after the fold-first
	// due-arrival settlement, never the raw stored document.
	Fleet  *Fleet
	Bodies *system.BodyTable
	// Now is the world instant the burn was solved and priced at, read AFTER
	// any settle-first write so the two agree.
	Now    common.WorldMillis
	Result space.SolveResult
	// HullCount is the roster hull count read ONCE, at solve time.
	HullCount int
	// FuelCostTons is this order's solved cost — the figure both the commit's
	// affordability check and the preview's quote are taken from.
	FuelCostTons float64
	// Refund is the closed-form discard refund a running, not-yet-arrived
	// burn this order would supersede yields; zero when there is none.
	Refund      float64
	CurrentFuel float64
	FuelActive  bool
	// OpenHoldUpkeep prices an open station-keeping hold this order would
	// end. In memory only — a commit's authoritative debit is computed inside
	// its own transaction, from its own re-read.
	OpenHoldUpkeep float64
}

// Affordable reports whether the fleet can pay this order's solved cost out
// of what it holds, once a superseded burn's refund is credited and an open
// hold's accrued upkeep is settled — the exact predicate the commit rejects
// on (ErrInsufficientFuel) and the preview merely REPORTS (fleet-movement "A
// preview reports an unaffordable target as such").
func (o *orderSolve) Affordable() bool {
	if !o.FuelActive {
		return true
	}
	return o.CurrentFuel+o.Refund-o.OpenHoldUpkeep >= o.FuelCostTons
}

// RemainingFuel is what the fleet would hold after this order, clamped at
// zero — the same arithmetic the commit performs on its returned struct, so
// the preview's stranding evaluation runs against the same remainder.
func (o *orderSolve) RemainingFuel() float64 {
	remaining := o.CurrentFuel + o.Refund - o.OpenHoldUpkeep - o.FuelCostTons
	if remaining < 0 {
		remaining = 0
	}
	return remaining
}

// solveOrder is the solve half of an in-system burn order, shared verbatim by
// the commit and the preview (tasks.md 3.1). It performs, in this order:
// target resolution, the load, the lane-transit refusal, body-table
// resolution, the fold-first due-arrival settlement, optionally the
// settle-first expired-hold write, the departure position and tangent,
// commanded-acceleration validation, space.SolveBurn, and the fuel pricing.
//
// EVERY REJECTION IT RETURNS IS SHARED BY BOTH CALLERS, which is what makes
// "a preview is refused wherever the commit would be refused" a property of
// construction rather than of two maintained lists. That deliberately
// includes the star: a star target is excluded solely by space.BuildCurve's
// endpoint-clearance guard inside SolveBurn, and NO destination-identity
// check exists on either path (design.md Decision 3 — an identity check would
// also miss a non-star target sitting inside the same clearance radius).
//
// settleExpiredHold is the ONE behavioural difference between the two
// callers, and it is a WRITE, not a solve: a commit settles a past-dry-instant
// station-keeping hold durably first, because its decision reads `cargo.fuel`
// and its own transaction would otherwise discard that settlement
// (fleet-movement "Every Decision Reading Fuel Settles a Past-Dry-Instant
// Hold First"). A preview passes false: it "SHALL create no action, claim no
// channel slot, debit no fuel, and store no burn", and an upkeep settlement
// debits fuel.
func (s *Service) solveOrder(ctx context.Context, id string, req OrderRequest, route burnRoute, settleExpiredHold bool) (*orderSolve, error) {
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

	// An active movement action that already completed is a fact, not a
	// re-taskable order: resolve it first (settle + effects), then order from
	// the settled doc — via the shared fold-first seam (tasks.md 5.0).
	if settled, due, serr := s.settleIfDue(ctx, f, bt); serr != nil {
		return nil, serr
	} else if due {
		f = settled
	}

	// A burn commit's affordability check reads `cargo.fuel` TO DECIDE, and
	// its commit transaction rejects — so an elapsed station-keeping hold is
	// settled by a preceding, INDEPENDENT write, never inside the commit,
	// where action-dispatch's own abort semantics would discard it
	// (fleet-movement "Every Decision Reading Fuel Settles a Past-Dry-Instant
	// Hold First"). The commit's own re-read guards the window between the
	// two transactions; see its ActorStateFunc below.
	if settleExpiredHold {
		if f, err = s.settleExpiredHoldFirst(ctx, f); err != nil {
			return nil, err
		}
		fireSettleFirstSeam(id)
	}

	// Read AFTER the settle-first write, so the burn is solved and priced at
	// the instant the deciding transaction actually runs at.
	now := s.clock.Now()

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

	sol, err := solveBurnClassified(ctx, route, f.Id, f.SystemId, bt, from, target, now, accel, departDir, starClearance)
	if err != nil {
		return nil, fmt.Errorf("fleet: solving burn: %w", err)
	}

	// Fuel affordability (add-fuel-as-cargo, fleet-movement "A Burn Commit
	// Is Rejected When Its Fuel Cost Exceeds Available Fuel, Debited At
	// Commit Never At Resolve"). Hull count is read ONCE, here, from the
	// roster as it stands at commit. The discard refund of any PRIOR,
	// not-yet-arrived burn this order supersedes is precomputed entirely in
	// memory and checked BEFORE that prior action is ever cancelled — a
	// rejected re-target must leave the prior burn running and fuel
	// unchanged (task 2.1), which holds only because the cancel-and-refund
	// transaction below is never even attempted for an unaffordable
	// replacement.
	//
	// fuelTrackingEngaged(f): a fleet whose Cargo is genuinely nil has never
	// been touched by any cargo-mutating verb (every REAL fleet document —
	// SeedFleet — initializes a non-nil, empty Cargo map from the instant it
	// exists) — mirroring effectiveRoster's own "no stored Ships" migration
	// fallback in this same package, this is the one case fuel pricing
	// treats as "not yet engaged" rather than "holds zero", so a document
	// that predates cargo tracking entirely is never rejected for lacking a
	// currency it was never given the chance to hold.
	hullCount := len(effectiveRoster(*f))
	newCost := FuelCostTons(&sol.Burn, hullCount, s.fuelParams)
	refund := priorBurnRefund(f, now)
	currentFuel := f.Cargo["fuel"]
	fuelActive := fuelTrackingEngaged(f)
	// A burn ENDS an open station-keeping hold, so its accrued upkeep is
	// settled before the burn's own cost is evaluated against the remainder
	// (fleet-movement "A burn committed from an open station-keeping hold
	// settles its accrued upkeep and replaces the park, without restamping").
	// Priced here in memory only for the pre-check and the returned struct;
	// the authoritative debit is computed inside the commit transaction from
	// its OWN re-read.
	holdRate := s.holdRateFor(bt, f)
	openHoldUpkeep := s.openHoldUpkeep(f, holdRate, now)

	return &orderSolve{
		Fleet: f, Bodies: bt, Now: now, Result: sol,
		HullCount: hullCount, FuelCostTons: newCost, Refund: refund,
		CurrentFuel: currentFuel, FuelActive: fuelActive,
		OpenHoldUpkeep: openHoldUpkeep,
	}, nil
}

// OrderTo solves and commits an in-system burn to a body id or an explicit
// point (design.md Decision 4; fleet-movement "In-System Burn Order to a
// Body or a Point"). Committing a burn clears AttachedTo immediately — a
// body-targeted burn only re-attaches once BurnResolver settles the arrival
// (tasks.md 3.1's pinned invariant).
//
// The solve is solveOrder's, shared with the preview; everything below the
// solve is the commit's own — the affordability rejection, the requester's
// optional quoted-fuel cap, the re-task cancel/refund, and the commit
// transaction.
func (s *Service) OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error) {
	// A malformed cap is an invalid request, rejected before anything is
	// solved or settled (fleet-movement "A malformed cap is an invalid
	// request, not an absent cap").
	if err := req.validateFuelCap(); err != nil {
		return nil, err
	}

	solved, err := s.solveOrder(ctx, id, req, routeOrder, true)
	if err != nil {
		return nil, err
	}
	f, bt, now := solved.Fleet, solved.Bodies, solved.Now
	sol := solved.Result
	burnState := space.ShipState{Mode: space.ModeBurn, Burn: &sol.Burn}
	hullCount, newCost := solved.HullCount, solved.FuelCostTons
	refund, currentFuel, fuelActive := solved.Refund, solved.CurrentFuel, solved.FuelActive
	openHoldUpkeep := solved.OpenHoldUpkeep

	if fuelActive && !solved.Affordable() {
		return nil, ErrInsufficientFuel
	}

	// The requester's own quoted cap (fleet-movement "A Burn Commit Is
	// Rejected When Its Solved Fuel Cost Exceeds the Requester's Quoted
	// Cap"), evaluated BEFORE the channel claim, the fuel debit, and the burn
	// store — and carrying the true solved cost, so the caller can re-quote
	// without a second round trip. Absent, no cap is applied and the path
	// below is exactly what it was before this field existed; a cap of
	// exactly 0 is a PRESENT cap, which is why MaxFuelTons is a pointer.
	if quoted := req.MaxFuelTons; quoted != nil && newCost > *quoted {
		return nil, &QuotedCapExceededError{Cap: *quoted, SolvedFuelTons: newCost}
	}

	// settledUpkeep is the hold-ending upkeep the commit transaction's own
	// producer actually debited, captured so the returned in-memory struct
	// reports the same balance the stored document carries.
	settledUpkeep := openHoldUpkeep

	// Re-task: release the current slot before claiming a new one (a running
	// action while ordering is the norm mid-burn). ErrNotRunning means it
	// already resolved — the slot is free, so proceed. The refund (if any)
	// is credited in THIS cancellation, so the subsequent commit's own
	// transactional read already reflects it.
	if f.ActiveActionId != "" {
		cancelState := map[string]interface{}{"updatedAt": int64(now)}
		if fuelActive && refund != 0 {
			cancelState["cargo"] = map[string]interface{}{"fuel": currentFuel + refund}
		}
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, cancelState); err != nil && !errors.Is(err, action.ErrNotRunning) {
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
		ActorStateFunc: func(actorData map[string]interface{}) (map[string]interface{}, error) {
			merge := map[string]interface{}{
				"state": EncodeKinematicState(burnState), "attachedTo": "", "updatedAt": int64(now),
			}
			if !fuelActive {
				return merge, nil
			}
			// The TRANSACTIONAL read, never a stale pre-transaction snapshot
			// (action-dispatch "A transaction-scoped ActorState producer
			// computes its merge from the transactional read, not a stale
			// snapshot") — this is what keeps a concurrent, unserialized
			// refuel from ever being lost to a racing burn debit.
			fuel := readCargoFuel(actorData)
			// The in-transaction past-dry-instant guard (fleet-movement "A
			// hold whose dry instant passes between the settle-first write
			// and the commit is rejected, never restamped") and, for a hold
			// still open, its hold-ending settlement — both against THIS
			// transaction's own re-read. The burn replaces the park outright,
			// so nothing is restamped and no fresh dry instant is computed.
			if p, ok := storedStationkeepPark(actorData); ok {
				txNow := s.clock.Now()
				if isExpiredHold(p, txNow) {
					return nil, ErrHoldExpiredMidCommit
				}
				settledUpkeep = upkeepTons(stationKeepRateFor(bt, p.BodyId), p.HoldStartMs, txNow, s.fuelParams)
				fuel -= settledUpkeep
				if fuel < 0 {
					fuel = 0
				}
			}
			if fuel < newCost {
				return nil, ErrInsufficientFuel
			}
			merge["cargo"] = map[string]interface{}{"fuel": fuel - newCost}
			merge["burnFuelCostTons"] = newCost
			return merge, nil
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
	if fuelActive {
		f.BurnFuelCostTons = newCost
		f.Cargo["fuel"] = currentFuel + refund - settledUpkeep - newCost
		if f.Cargo["fuel"] < 0 {
			f.Cargo["fuel"] = 0
		}
		f.StrandingWarning = s.evaluateStrandingWarning(ctx, bt, f.SystemId, sol, hullCount, f.Cargo["fuel"])
	}
	log.Info().Ctx(ctx).Str("fleetId", id).Str("actionId", a.Id).
		Int64("arriveMs", int64(sol.Burn.ArriveMs)).Msg("Fleet ordered to burn")
	return f, nil
}

// --- the burn-order PREVIEW -------------------------------------------------
//
// The solve half of an in-system burn order, served without committing it
// (serve-orbital-elements-and-burn-preview, fleet-movement "Burn Order
// Preview Solves Without Committing"). It lives beside OrderTo, its sibling
// over the same solveOrder, because the whole point of the pair is that they
// cannot drift.
//
// It exists because space.SolveBurn had no HTTP surface at all: the only way
// to solve a burn was to commit it, so a pre-commit quote was unreachable
// without a client-side kinematics mirror that space-kinematics'
// sole-authority requirement forbids.

// BurnPreview is one solved-but-uncommitted burn: everything a client needs
// to draw the proposed transfer and price the decision, and nothing that
// implies the order was taken.
type BurnPreview struct {
	// Curve is the solved transfer's six control points, DepartMs/ArriveMs
	// its world-time window — the same figures the committed burn would
	// carry, because they come from the same space.SolveBurn call.
	Curve    space.Curve
	DepartMs common.WorldMillis
	ArriveMs common.WorldMillis
	// DeltaV is the burn's delta-v price and FuelCostTons its cost in fuel
	// tons at the fleet's current roster hull count.
	DeltaV       float64
	FuelCostTons float64
	// Affordable reports whether the fleet could pay for this order right now
	// — REPORTED, never a rejection. An unaffordable target is served in
	// full: the preview exists precisely so a player can discover a target is
	// out of reach before committing, and rejecting would leave them with no
	// arrival time, no delta-v and no fuel figure to plan a refuel or a
	// nearer target against.
	Affordable bool
	// StrandingWarning is the same advisory a commit's response carries: the
	// resulting park would leave the fleet unable to reach any station or
	// lane-gate body in the destination system at the acceleration floor.
	StrandingWarning bool
}

// PreviewOrder solves the burn OrderTo would solve for the same target from
// the same fleet state, and returns it without creating an action, claiming a
// channel slot, debiting fuel, or storing a burn.
//
// It shares solveOrder with the commit, so the returned curve, window,
// delta-v and fuel cost are the commit's own by construction, and every
// rejection below the laneId/channel guards is the commit's own too
// (fleet-movement "A preview returns the same curve, ETA, and cost a commit
// would produce", "A preview is refused wherever the commit would be
// refused"). Two refusal sets deliberately differ, both stated in the
// requirement:
//
//   - INSUFFICIENT FUEL IS NOT A REJECTION HERE. It is reported through
//     Affordable.
//   - A MOVEMENT CHANNEL HELD BY A RUNNING MINE REFUSES, with this path's own
//     reason (ErrPreviewChannelHeld), even though the commit path does not
//     refuse — see that sentinel's own doc comment.
//
// Its only permitted persisted effect is the settlement of an ALREADY-DUE
// arrival, which solveOrder performs through the same fold-first seam every
// other door onto a fleet runs. Solving from an unsettled state would
// disagree with the commit that immediately follows the preview in precisely
// the case the parity guarantee exists for: a fleet that just arrived
// somewhere and is being re-tasked. Beyond that settlement, an arbitrary
// number of previews of a fleet with nothing due write nothing at all.
func (s *Service) PreviewOrder(ctx context.Context, id string, req OrderRequest) (*BurnPreview, error) {
	// A laneId names a jump. Rejected FIRST, by its own reason, before the
	// fleet is even loaded — "no solve is attempted" — and deliberately not
	// by falling through to ErrEmptyOrder, which is what a laneId-only
	// OrderRequest does on the commit path.
	if req.LaneId != "" {
		return nil, ErrPreviewLaneTarget
	}

	solved, err := s.solveOrder(ctx, id, req, routePreview, false)
	if err != nil {
		return nil, err
	}

	// The movement channel, checked AFTER the fold-first settlement — a due
	// arrival's own settlement releases the slot, so a fleet that has merely
	// arrived must not be refused. A running BURN still holds the slot and is
	// explicitly previewable ("re-targeting mid-flight ... is the
	// highest-stakes order in the game, so forbidding its preview while
	// permitting its commit would remove the quote from the decision that
	// most needs one"), so the refusal is scoped to a slot held while the
	// fleet is not itself burning: today that is a mine.
	f := solved.Fleet
	if f.ActiveActionId != "" && f.State.Mode != space.ModeBurn {
		return nil, ErrPreviewChannelHeld
	}

	burn := solved.Result.Burn
	return &BurnPreview{
		Curve:        burn.Curve,
		DepartMs:     burn.DepartMs,
		ArriveMs:     burn.ArriveMs,
		DeltaV:       burn.DeltaV(),
		FuelCostTons: solved.FuelCostTons,
		Affordable:   solved.Affordable(),
		// Evaluated from the burn's own resulting position and arrival, at the
		// fuel the fleet WOULD hold once this order was paid for — the same
		// inputs the commit hands evaluateStrandingWarning, so the two agree.
		StrandingWarning: s.evaluateStrandingWarning(
			ctx, solved.Bodies, f.SystemId, solved.Result, solved.HullCount, solved.RemainingFuel()),
	}, nil
}

// fuelTrackingEngaged reports whether a fleet document participates in the
// fuel-currency system at all. A fleet whose Cargo is genuinely nil has
// never been touched by ANY cargo-mutating verb — SeedFleet always
// initializes Cargo to a non-nil, empty map, so this is never true of a
// real, spawned hull; it is true only of a fleet document that predates
// this capability entirely (or a hand-built test fixture that never
// constructs a Cargo field), mirroring effectiveRoster's own "no stored
// Ships" migration fallback (roster.go).
func fuelTrackingEngaged(f *Fleet) bool {
	return f.Cargo != nil
}

// priorBurnRefund computes, from f's own in-memory fields as loaded at the
// top of the calling verb, the closed-form discard refund a currently
// running, not-yet-arrived burn would yield if discarded right now
// (fleet-movement "Discarding a Running Burn Refunds Its Unspent Fuel,
// Closed-Form"). Returns 0 when there is no active burn to discard —
// including when the active action is some OTHER movement-channel verb
// (e.g. a co-resident mine while docked), which is never a burn to refund.
// Computed and checked BEFORE any mutation: task 2.1's own ordering
// requirement is that a rejected replacement never leaves the prior burn
// cancelled-and-refunded with nothing stored in its place, which holds only
// if this is evaluated before the prior action's own cancel transaction is
// ever opened.
func priorBurnRefund(f *Fleet, now common.WorldMillis) float64 {
	if f.ActiveActionId == "" || f.State.Mode != space.ModeBurn || f.State.Burn == nil {
		return 0
	}
	return DiscardRefundTons(f.BurnFuelCostTons, f.State.Burn.DepartMs, f.State.Burn.ArriveMs, now)
}

// evaluateStrandingWarning re-runs the shared floor-priced reachability
// evaluation (ReachableAtFloor) from a freshly committed burn's own
// resulting position and arrival time (fleet-movement "A Burn Commit Warns,
// But Does Not Block, When It Would Leave the Fleet Unable to Reach a
// Station or Gate"). Best-effort and non-blocking by construction: a scan
// failure is logged and never blocks or fails a commit that has already
// succeeded — the warning is advisory, never load-bearing.
//
// A burn whose OWN destination is itself a station or lane-gate body counts
// as reachable at zero cost on that candidate's account, checked directly
// against sol.Burn.Target.BodyId before any solve runs (fleet-movement's own
// text: "a burn whose own destination is a station or lane gate carries no
// stranding warning on that candidate's account"). This is deliberately NOT
// folded into reachableAtFloor's solve loop: that loop solves a candidate
// burn FROM the committed burn's resulting position back TO the candidate,
// and space.SolveBurn solves against a MOVING target — for an orbiting host,
// that candidate solve chases where the host will be at the CANDIDATE burn's
// own (new) arrival, not where this burn already put the fleet. That is not
// the near-zero arc space.ErrArcTooShort exists to catch; only a direct
// identity check against the burn's own already-committed destination
// reflects "the fleet just arrived here" correctly.
func (s *Service) evaluateStrandingWarning(ctx context.Context, bt *system.BodyTable, systemID string, sol space.SolveResult, hullCount int, remainingFuel float64) bool {
	if destID := sol.Burn.Target.BodyId; destID != "" {
		for _, candidateId := range s.candidateHosts(ctx, bt, systemID) {
			if candidateId == destID {
				return false
			}
		}
	}
	starClearance := space.StarClearanceRadius(bt.StarSize())
	reachable, err := s.reachableAtFloor(ctx, bt, systemID, sol.Burn.Intercept, sol.Burn.ArriveMs, hullCount, remainingFuel, starClearance)
	if err != nil {
		log.Warn().Ctx(ctx).Err(err).Msg("fleet: stranding-warning reachability scan failed; omitting warning")
		return false
	}
	return !reachable
}

// actionHistory is the READ half of the action spine — the inbox query the
// generic GET /v1/actions surface already runs, and the only way a verb can
// ask what the spine has already settled for its actor. It is deliberately
// NOT a second constructor parameter and NOT a With… accessor: the fleet
// Service already requires the spine (action.CommitInterface) as a mandatory
// dependency, and *action.Service — the one implementation any composition
// root passes — satisfies this structurally, so there is no wiring step a
// change can silently omit (the failure mode NewServiceWith's own doc comment
// records having shipped twice). A CommitInterface that does not expose the
// read side simply cannot answer the question, and the caller degrades to the
// coarser rejection rather than guessing.
type actionHistory interface {
	Inbox(ctx context.Context, actor string, statuses ...action.Status) ([]action.Action, error)
}

// parkedAtItsOwnBurnArrival reports whether the LAST thing that happened to
// this fleet was its own burn's arrival being settled — the durable trace an
// arrival settlement leaves behind, and the seam that lets cut-drive tell
// "your burn already arrived" from "this fleet was never burning" after the
// settlement has already happened (fleet-movement "Cutting an already-arrived
// burn resolves the arrival instead").
//
// Three signals, all durable, all read from state the settlement itself
// wrote:
//
//   - The fleet is parked, free of lane transit, and holds no movement-channel
//     claim — the exact shape BurnResolver settles a burn INTO (a park, the
//     slot released), and the shape neither a drift nor an in-transit fleet
//     can present.
//   - The spine holds a `done` burn action for this fleet whose frozen Eta is
//     the fleet document's own UpdatedAt. BurnResolver stamps
//     `updatedAt = r.At = the action's Eta` (resolver.go), so this equality
//     says precisely "the fleet document's most recent write IS that burn's
//     arrival settlement". It is self-limiting without any clearing step:
//     every later write to the fleet — a fresh order, a hold, a release, a
//     refuel, a mine credit, a jump — restamps UpdatedAt to its own instant
//     and the equality stops holding, at which point the fleet is an
//     ordinary parked fleet and cut-drive rejects it by the other name.
//   - The action's Type is the burn key. A jump or mine settling into a park
//     stamps UpdatedAt the same way, and neither is a burn to cut.
//
// Deliberately NOT derived from the park alone: a body-targeted arrival park
// carries the arrival millisecond as its EpochMs, but a POINT-targeted one
// (space.StateAt) carries no epoch at all, so a park-only rule would repair
// exactly half of the cases and leave the other half reporting the wrong
// reason.
//
// Answers false, never an error: this runs only on a path that is already
// rejecting, and a spine read that fails must not turn a well-named 409 into
// a bodyless 500 — it degrades to ErrNotBurning's coarser reason instead.
func (s *Service) parkedAtItsOwnBurnArrival(ctx context.Context, f *Fleet) bool {
	if f.Jump != nil || f.ActiveActionId != "" || f.State.Mode != space.ModeParked {
		return false
	}
	hist, ok := s.actions.(actionHistory)
	if !ok {
		return false
	}
	done, err := hist.Inbox(ctx, f.Id, action.StatusDone)
	if err != nil {
		log.Warn().Ctx(ctx).Err(err).Str("fleetId", f.Id).
			Msg("Could not read the fleet's settled actions; falling back to the not-burning rejection")
		return false
	}
	for _, a := range done {
		if a.Type == burnType && a.Eta == f.UpdatedAt {
			return true
		}
	}
	return false
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
		// A fleet with no live burn is TWO different rejections, and the two
		// live scenarios insist on distinct names for them: "Cutting an
		// already-arrived burn resolves the arrival instead" ("rejected with
		// its own named reason") and "Cutting a parked, drifting, or
		// in-transit fleet is rejected by name" ("distinct from the
		// already-arrived rejection"). Over HTTP the already-arrived case
		// NEVER reaches the settleIfDue branch below: Handler.commandedFleetId's
		// ownership pre-read calls Service.Get, which settles a due, unresolved
		// burn opportunistically (the no-scheduler arrival contract, and this
		// change's durable settle-first obligation) — so by the time CutDrive
		// loads, the arrival is already resolved and the fleet reads as parked.
		// The pre-read is required behaviour and is deliberately left alone
		// (design.md "commandedFleetId's ownership pre-read settles first");
		// the distinction is re-derived here from what that settlement LEFT
		// BEHIND instead.
		if s.parkedAtItsOwnBurnArrival(ctx, f) {
			return nil, space.ErrCutAfterArrival
		}
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

	// Cutting a burn credits its unspent fuel (fleet-movement "Cutting a
	// burn credits its unspent fuel"; "Discarding a Running Burn Refunds
	// Its Unspent Fuel, Closed-Form") — computed from f's own in-memory
	// fields, BEFORE the cancel, and folded into the SAME cancel call that
	// stores the drift transition. See fuelTrackingEngaged's own doc
	// comment (service.go, OrderTo) for why a genuinely nil Cargo skips
	// this entirely.
	refund := priorBurnRefund(f, now)
	currentFuel := f.Cargo["fuel"]
	fuelActive := fuelTrackingEngaged(f)
	cancelState := map[string]interface{}{
		"state": EncodeKinematicState(newState), "updatedAt": int64(now),
	}
	if fuelActive && refund != 0 {
		cancelState["cargo"] = map[string]interface{}{"fuel": currentFuel + refund}
	}

	if f.ActiveActionId != "" {
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, cancelState); err != nil && !errors.Is(err, action.ErrNotRunning) {
			return nil, err
		}
	}

	f.State = newState
	f.AttachedTo = ""
	f.ActiveActionId = ""
	f.UpdatedAt = now
	if fuelActive {
		f.BurnFuelCostTons = 0
		f.Cargo["fuel"] = currentFuel + refund
	}
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

	// The discard refund of any PRIOR, not-yet-arrived burn stop-in-place
	// supersedes — computed once, in memory, shared by BOTH branches below
	// (fleet-movement "A stop-in-place order that supersedes an active burn
	// refunds it before charging the stop", "Stop-in-place's free,
	// below-the-floor branch still refunds a preceding running burn": the
	// FREE branch owes this refund exactly as the burn branch does, even
	// though it charges no new delta-v of its own).
	refund := priorBurnRefund(f, now)
	currentFuel := f.Cargo["fuel"]
	fuelActive := fuelTrackingEngaged(f)

	if vel.Length() <= space.StopInPlaceSpeedFloor {
		newState := space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: pos}}

		// The free branch's own persistence, UNCONDITIONAL (add-stationkeep-
		// hold-verb task 4.5; write-up: docs/handoffs/
		// drift-stop-free-branch-no-write.md). Until this change its ONLY
		// write was s.actions.Cancel, guarded by ActiveActionId != "", and
		// Handler.Stop performs no DAO write of its own — so for a fleet with
		// no active movement action (which a station-keeping fleet always is,
		// `hold` claiming no slot) this branch computed a point park, a
		// cleared attachment and a refund entirely in memory and DROPPED
		// them, against the already-live "Stopping at or below the speed
		// floor is instant and free".
		//
		// The hold-ending settlement rides THIS write, deliberately not the
		// action cancellation: routing it through cancelState ships a green
		// test for a mining fleet (which does have an active action) while
		// forgiving the accrual for a gate camper, which is exactly the
		// defect the universal hold-ending rule exists to close.
		settledFuel, err := s.stopInPlaceWrite(ctx, f, bt, newState, now)
		if err != nil {
			return nil, err
		}
		if f.ActiveActionId != "" {
			if _, err := s.actions.Cancel(ctx, f.ActiveActionId,
				map[string]interface{}{"updatedAt": int64(now)}); err != nil && !errors.Is(err, action.ErrNotRunning) {
				return nil, err
			}
		}
		f.State = newState
		f.AttachedTo = ""
		f.ActiveActionId = ""
		f.UpdatedAt = now
		if fuelActive {
			f.BurnFuelCostTons = 0
			f.Cargo["fuel"] = settledFuel
		}
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
	sol, err := solveBurnClassified(ctx, routeStop, f.Id, f.SystemId, bt, pos, space.Target{Point: &lead}, now, defaultAccel, nil, starClearance)
	if err != nil {
		return nil, fmt.Errorf("fleet: solving stop burn: %w", err)
	}
	newState := space.ShipState{Mode: space.ModeBurn, Burn: &sol.Burn}

	// Fuel affordability — Stop's own committed-burn branch prices at
	// defaultAccel (a pre-existing inconsistency with an ordinary order's
	// roster-derived ceiling, flagged in design.md and NOT fixed here), but
	// is otherwise gated exactly like OrderTo's commit (task 2.1): checked,
	// and rejected if unaffordable, BEFORE the prior action is cancelled.
	hullCount := len(effectiveRoster(*f))
	newCost := FuelCostTons(&sol.Burn, hullCount, s.fuelParams)
	if fuelActive && currentFuel+refund-s.openHoldUpkeep(f, s.holdRateFor(bt, f), now) < newCost {
		return nil, ErrInsufficientFuel
	}

	// holdSettledFuel/holdEnded capture what the commit's own producer
	// settled, so the returned in-memory struct reports the same balance the
	// stored document carries.
	var holdSettledFuel float64
	var holdEnded bool

	if f.ActiveActionId != "" {
		cancelState := map[string]interface{}{"updatedAt": int64(now)}
		if fuelActive && refund != 0 {
			cancelState["cargo"] = map[string]interface{}{"fuel": currentFuel + refund}
		}
		if _, err := s.actions.Cancel(ctx, f.ActiveActionId, cancelState); err != nil && !errors.Is(err, action.ErrNotRunning) {
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
		ActorStateFunc: func(actorData map[string]interface{}) (map[string]interface{}, error) {
			merge := map[string]interface{}{
				"state": EncodeKinematicState(newState), "attachedTo": "", "updatedAt": int64(now),
			}
			if !fuelActive {
				return merge, nil
			}
			fuel := readCargoFuel(actorData)
			// Stop's committed-burn branch ends an open station-keeping hold
			// exactly as an ordinary burn commit does, and settles its accrual
			// in this same transaction, before its own cost is evaluated
			// against the remainder ("No path SHALL end a hold without
			// settling it"). A hold already past its dry instant settles by
			// the automatic fold instead — to exactly the reserve, with no
			// upkeepTons debit stacked on top of it. Unlike the ordinary burn
			// commit, this branch is deliberately NOT one of the three
			// transactions that owe a PRECEDING settlement write: the fold
			// rides the verb's own hold-ending transaction.
			if p, ok := storedStationkeepPark(actorData); ok {
				settled, _, ended := s.settledFuelInTx(p, fuel, stationKeepRateFor(bt, p.BodyId), s.clock.Now())
				if ended {
					holdSettledFuel, holdEnded = settled, true
					fuel = settled
				}
			}
			if fuel < newCost {
				return nil, ErrInsufficientFuel
			}
			merge["cargo"] = map[string]interface{}{"fuel": fuel - newCost}
			merge["burnFuelCostTons"] = newCost
			return merge, nil
		},
	})
	if err != nil {
		return nil, err
	}
	f.State = newState
	f.ActiveActionId = a.Id
	f.UpdatedAt = now
	if fuelActive {
		f.BurnFuelCostTons = newCost
		base := currentFuel + refund
		if holdEnded {
			base = holdSettledFuel
		}
		f.Cargo["fuel"] = base - newCost
		if f.Cargo["fuel"] < 0 {
			f.Cargo["fuel"] = 0
		}
		f.StrandingWarning = s.evaluateStrandingWarning(ctx, bt, f.SystemId, sol, hullCount, f.Cargo["fuel"])
	}
	return f, nil
}

// Jump commits POST /v1/fleets/:fleetId/jump {laneId} — a single-hop lane
// crossing from an attached gate (design.md Decision 10; fleet-movement "Lane
// Jump From an Attached Gate"). Accepted whenever the fleet is attached to
// the lane's own gate body — no map-knowledge precondition (design.md
// Decision 2 of replace-observation-with-sightings drops the charted-lane
// requirement: eligibility is attachment alone, which is what actually keeps
// the galaxy traversable for a corporation with nothing charted yet); jump-
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

	destId, from, to, err := s.graph.LaneCrossing(ctx, laneId, f.SystemId)
	if err != nil {
		return nil, fmt.Errorf("fleet: resolving lane crossing: %w", err)
	}

	// Jump-eligible only from the lane's OWN gate body, named by the
	// destination it leads to (system.gateId's own convention, mirrored here
	// since system does not export it). No map-knowledge check follows: the
	// gate body itself is the entire eligibility gate (design.md Decision 2).
	if f.AttachedTo != "gate-"+destId {
		return nil, ErrJumpNotAttached
	}

	// Materialize the destination's full lane horizon before committing the
	// jump (replace-observation-with-sightings design.md Decision 28,
	// corrected 2026-09-01: hoisted out of system.Service.addGates onto this
	// commit-time seam, the only site whose failure has a consequence for the
	// player). FAILS CLOSED: no action is committed, the fleet stays attached
	// to the originating gate, and the caller gets a distinguishable,
	// retryable rejection rather than a silently swallowed background
	// failure. Because materialization is monotonic and EnsureLaneHorizon is
	// a pure function of the id, a successful ensure here is permanent — no
	// unhealed state is left behind for a failed jump to worry about.
	if err := s.graph.EnsureLaneHorizon(ctx, destId); err != nil {
		log.Error().Ctx(ctx).Err(err).Str("systemId", destId).Str("fleetId", id).
			Msg("Jump rejected: the destination's lane horizon could not be materialized")
		return nil, ErrDestinationNotReady
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

	galaxyID := ""
	if source, ok := s.graph.(interface {
		LiveIdentity(context.Context) (string, error)
	}); ok {
		galaxyID, err = source.LiveIdentity(ctx)
		if err != nil {
			return nil, err
		}
	}
	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            jumpType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           f.SystemId,
		Params:          map[string]interface{}{"laneId": laneId, "destSystemId": destId, "galaxyId": galaxyID},
		Eta:             eta,
		ActorStateFunc: func(actorData map[string]interface{}) (map[string]interface{}, error) {
			merge := map[string]interface{}{"jump": *jump, "updatedAt": int64(now)}
			// A jump ABANDONS an open station-keeping hold, so its accrued
			// upkeep is settled in the same transaction that commits the jump
			// — before JumpResolver overwrites the stored park with a fresh
			// one at the destination and the unsettled hold is simply
			// discarded ("No path SHALL end a hold without settling it": a
			// fleet camping a gate under a hold and then jumping has paid for
			// the hold). The jump itself still costs no delta-v; this debit is
			// the HOLD's already-accrued upkeep, not a charge for the jump.
			//
			// A hold already past its dry instant settles by the automatic
			// fold instead — to exactly the reserve, with no upkeepTons debit
			// stacked on top — and that fold rides THIS transaction rather
			// than a preceding, independent write, because a jump reads
			// cargo.fuel neither to decide anything nor as a FreeHold
			// consumer. A rejected jump therefore ends no hold and leaves the
			// fleet holding for the next fuel-reading consumer to settle by
			// the ordinary rule: self-healing, not lossy.
			if p, ok := storedStationkeepPark(actorData); ok {
				s.holdEndingMergeInTx(merge, actorData, stationKeepRateFor(bt, p.BodyId), s.clock.Now())
			}
			return merge, nil
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

// Scan commits POST /v1/fleets/:fleetId/scan {hostId} — a focused sweep of
// a body or an own fleet in the scanning fleet's own system, on the SENSOR
// channel (action.SlotSensor), independent of the movement channel a burn
// or jump claims (focused-scan "A Focused Sweep Commits On the Sensor
// Channel"; design.md Decision 8). hostId is resolved and range/occlusion
// checked against LIVE positions at commit time, reusing disclosure's own
// predicates unchanged (design.md Decision 8's own text; task 5.4); a
// hostId that does not resolve to a body or an own-corp fleet in this
// system — including one naming a FOREIGN fleet — is rejected through the
// exact same ErrScanHostUnresolved, with no distinguishing field (task
// 5.2). Duration scales with range to the host, frozen at commit
// (roundTripMs, task 5.3): the committed window is
// [commitTime, commitTime + roundTripMs(d)] — depart is always the commit
// world time, so the emission interval, the masking break, and the
// action's own ETA are the same interval end to end.
func (s *Service) Scan(ctx context.Context, id, hostId string) (*Fleet, error) {
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
	from, err := s.Position(ctx, f, bt)
	if err != nil {
		return nil, err
	}

	hostPos, err := s.scanHostPosition(ctx, f, bt, hostId, now)
	if err != nil {
		return nil, err
	}

	starPos, err := space.Position(bt, bt.StarId(), now)
	if err != nil {
		return nil, fmt.Errorf("fleet: resolving star position for scan occlusion: %w", err)
	}
	if err := scanGeometry(from, hostPos, starPos, bt.StarSize()); err != nil {
		return nil, err
	}

	d := hostPos.Sub(from).Length()
	arrive := now + roundTripMs(d)
	window := &ScanWindow{HostId: hostId, DepartMs: now, ArriveMs: arrive, Range: d}

	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            scanType,
		Actor:           id,
		ActorCollection: actorCollection,
		Scope:           f.SystemId,
		Params:          map[string]interface{}{"hostId": hostId},
		Eta:             arrive,
		Slot:            action.SlotSensor,
		ActorState: map[string]interface{}{
			"scan": *window, "updatedAt": int64(now),
		},
	})
	if err != nil {
		return nil, err
	}

	f.Scan = window
	f.ActiveScanId = a.Id
	f.UpdatedAt = now
	log.Info().Ctx(ctx).Str("fleetId", id).Str("hostId", hostId).Str("actionId", a.Id).
		Int64("arriveMs", int64(arrive)).Msg("Fleet swept")
	return f, nil
}

// scanHostPosition resolves hostId to a live position at commit time: a body
// in the scanning fleet's own system, or a fleet owned by the SAME
// corporation present in that system. A hostId naming a body/fleet in a
// different system, a fleet owned by a different corporation, a fleet in
// lane transit, the SCANNING FLEET ITSELF, a derived belt member, or nothing
// at all is rejected through the exact same ErrScanHostUnresolved — no
// distinguishing field (focused-scan "A Foreign Fleet's Id Is Rejected
// Identically To An Unresolvable One", "A Fleet Is Never a Host For Its Own
// Sweep", "A commit naming a belt member is rejected as unresolvable").
//
// The self and belt-member checks run BEFORE the body-table lookup,
// deliberately: the table resolves every synthesized belt-member id
// (`{beltId}#{k}`) just like any other body, so a check placed after that
// lookup would never run for a belt member (link8b-impl-contract.md §2,
// task 3.4).
//
// Shared by Scan (the commit) and ScanTargets (the list) — one
// implementation of host resolution, so the two can never silently drift
// (link8b-impl-contract.md §1.11, task 3.1).
func (s *Service) scanHostPosition(ctx context.Context, scanner *Fleet, bt *system.BodyTable, hostId string, now common.WorldMillis) (space.Vec3, error) {
	if hostId == scanner.Id || system.IsDerivedBeltMember(hostId) {
		return space.Vec3{}, ErrScanHostUnresolved
	}
	if _, ok := bt.Body(hostId); ok {
		pos, err := space.Position(bt, hostId, now)
		if err != nil {
			return space.Vec3{}, fmt.Errorf("fleet: resolving scan host body position: %w", err)
		}
		return pos, nil
	}

	fleets, err := s.dao.ListBySystem(ctx, scanner.SystemId)
	if err != nil {
		return space.Vec3{}, err
	}
	for i := range fleets {
		host := &fleets[i]
		if host.Id != hostId {
			continue
		}
		if host.CorporationId != scanner.CorporationId || host.Jump != nil {
			return space.Vec3{}, ErrScanHostUnresolved
		}
		pos, err := space.StatePosition(bt, host.State, now)
		if err != nil {
			return space.Vec3{}, fmt.Errorf("fleet: resolving scan host fleet position: %w", err)
		}
		return pos, nil
	}
	return space.Vec3{}, ErrScanHostUnresolved
}

// scanGeometry applies the two live-position tests a focused-scan commit and
// the scan-target list both apply unchanged: FocusedScanRange (inclusive at
// the boundary) and star occlusion (strict — a sightline exactly tangent to
// the star is clear). Shared by Scan and ScanTargets so the two never apply
// two implementations of the same predicates (link8b-impl-contract.md
// §1.11, task 3.1).
func scanGeometry(from, hostPos, starPos space.Vec3, starSize float64) error {
	if !disclosure.WithinRange(from, hostPos, disclosure.FocusedScanRange) {
		return disclosure.ErrScanOutOfRange
	}
	if disclosure.Occluded(from, hostPos, starPos, starSize) {
		return disclosure.ErrScanOccluded
	}
	return nil
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
	return s.seedFleet(ctx, systemID, corporationID, at, starSize, "")
}

// SeedFleetAtStation creates only a new fleet, attached to its home station.
// Existing fleets are returned unchanged, including on spawn-healing retries.
func (s *Service) SeedFleetAtStation(ctx context.Context, systemID, corporationID, stationID string) (*Fleet, error) {
	return s.seedFleet(ctx, systemID, corporationID, space.Vec3{}, 0, stationID)
}

func (s *Service) seedFleet(ctx context.Context, systemID, corporationID string, at space.Vec3, starSize float64, stationID string) (*Fleet, error) {
	existing, err := s.dao.ListByCorporation(ctx, corporationID)
	if err != nil {
		return nil, err
	}
	if len(existing) > 0 {
		return &existing[0], nil
	}

	if stationID == "" && at.Length() <= space.StarClearanceRadius(starSize) {
		return nil, ErrSeedInsideClearance
	}

	now := s.clock.Now()
	park := &space.Park{Kind: space.ParkPoint, Point: at}
	if stationID != "" {
		bt, err := s.bodiesFor(ctx, systemID)
		if err != nil {
			return nil, err
		}
		body, ok := bt.Body(stationID)
		if !ok {
			return nil, space.ErrUnknownBody
		}
		radius := space.InsertionStandoff(body)
		park = &space.Park{Kind: space.ParkOrbit, BodyId: stationID, Radius: radius, PeriodMs: space.InsertionPeriod(radius), EpochMs: now}
		if _, err := park.Position(bt, now); err != nil {
			return nil, err
		}
	}
	f := &Fleet{
		Id:            fmt.Sprintf("fleet_seed_%x", sha256.Sum256([]byte(corporationID))),
		CorporationId: corporationID,
		SystemId:      systemID,
		// New station spawns use a free host orbit; legacy callers use a
		// point park. Neither charges upkeep before the first order.
		State:      space.ShipState{Mode: space.ModeParked, Park: park},
		AttachedTo: stationID,
		Ships:      []ShipEntry{{Class: ClassSeed}},
		Cargo:      map[string]float64{},
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	return s.dao.CreateIfAbsent(ctx, *f)
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

// FuelPricePerTon serves the configured global fuel price (fuel-purchase "A
// Single Global Fuel Price, Unlimited Station Supply, No Station-Side
// Write"; fleet-movement "Fleet Read Serves the Configured Fuel Price,
// Never Duplicated Client-Side") — one value, read from the server, backs
// both the refuel offer's client-side preview and the settlement's charged
// cost, so the two can never diverge.
func (s *Service) FuelPricePerTon() float64 { return s.fuelParams.PricePerTon }

// FuelStatus computes the acceleration-floor-priced estimated maximum range
// and the persistent stranded indication for an owning corporation's own
// fleet read (fleet-movement "Fleet Read Reports an Estimated Maximum Range
// From Current Fuel", "A Fleet's Read Reports a Persistent Stranded
// Indication, Computed at the Acceleration Floor") — re-running the SAME
// floor-priced reachability evaluation the commit-time warning uses, fresh
// on every read, never a cached commit-time result.
//
// A fleet mid-jump has no in-system position to evaluate reachability from;
// jump itself costs no delta-v and, once committed, always succeeds — such
// a fleet's estimated range is still reported (from held fuel alone) but it
// never reads as stranded while in transit.
func (s *Service) FuelStatus(ctx context.Context, f *Fleet) (estimatedRange float64, stranded bool, err error) {
	hullCount := len(effectiveRoster(*f))
	fuelTons := f.Cargo["fuel"]
	estimatedRange = EstimatedRangeTons(fuelTons, hullCount, s.fuelParams)

	bt, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return 0, false, err
	}
	now := s.clock.Now()
	pos, err := s.Position(ctx, f, bt)
	if err != nil {
		if errors.Is(err, ErrFleetInTransit) {
			return estimatedRange, false, nil
		}
		return 0, false, err
	}
	starClearance := space.StarClearanceRadius(bt.StarSize())
	reachable, err := s.reachableAtFloor(ctx, bt, f.SystemId, pos, now, hullCount, fuelTons, starClearance)
	if err != nil {
		return 0, false, err
	}
	return estimatedRange, !reachable, nil
}

// LoadUnsettled reads a fleet's stored document and SETTLES NOTHING — no due
// arrival resolved, no expired hold folded, no write of any kind
// (serve-orbital-elements-and-burn-preview, fleet-movement "A foreign preview
// is refused before anything is settled").
//
// It exists so the HTTP command surface can answer "who owns this fleet?"
// BEFORE it triggers any settlement. Get, the method every command endpoint
// resolved through until now, opportunistically resolves a due arrival and
// WRITES — so an unauthorized caller naming a victim's fleet could trigger a
// state-mutating write on it, and could time the 404 to learn whether that
// victim had an arrival due. The ownership check is meaningless as a
// disclosure boundary if reaching it already had an effect.
//
// This is the authorization read only. Once a caller is authorized, the
// command surface still resolves through Get exactly as before, so every
// verb's pre-settled preconditions are unchanged.
func (s *Service) LoadUnsettled(ctx context.Context, id string) (*Fleet, error) {
	return s.load(ctx, id)
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
