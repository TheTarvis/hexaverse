package mine

import (
	"context"
	"errors"
	"fmt"
	"math"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/system"

	"github.com/rs/zerolog/log"
)

// fleetActorCollection is where fleet docs live — mirrors fleet package's own
// (unexported) actorCollection constant. Both must name the same Firestore
// collection; mine can't import the unexported constant, so it's repeated
// here (the same literal cancel_dock_test.go already pins for the fleet
// package's own actor doc reads).
const fleetActorCollection = "fleets"

// Sentinel errors — one per commit precondition, so the handler can report a
// distinguishing reason for every rejection this capability defines (design.md
// Decision #19 / "Mine Commit Rejections Report a Distinguishable Reason").
// No two of these may map to the same reason text at the HTTP layer.
var (
	// ErrUnauthenticated: no requester account resolved (defense in depth —
	// the authorized-group middleware chain already blocks this in
	// production; mine's own commit path re-checks per golang-engineering's
	// "explicit authz check at the domain operation").
	ErrUnauthenticated = errors.New("mine: requester is not authenticated")
	// ErrForeignFleet: the requester's corporation does not own :fleetId (or
	// the fleet doesn't exist) — hidden as 404 (design.md Decision #10).
	ErrForeignFleet = errors.New("mine: requester does not own this fleet")
	// ErrInvalidTonnage: tons is not a finite number > 0.
	ErrInvalidTonnage = errors.New("mine: tons must be a positive finite number")
	// ErrSubMinimumRun: tons is positive and finite but below
	// MineParams.MinRunTons.
	ErrSubMinimumRun = errors.New("mine: tons is below the minimum run size")
	// ErrNotDocked: the fleet's effective state is not docked to the named
	// feature.
	ErrNotDocked = errors.New("mine: fleet is not docked to the target feature")
	// ErrUnknownKind: the target feature carries no resource entry of the
	// requested kind.
	ErrUnknownKind = errors.New("mine: feature does not carry the requested resource kind")
	// ErrLodeDepleted: the feature's ledger-folded remaining tonnage of the
	// requested kind, as of now, is already at or below zero ("Already-Depleted
	// Lode Rejected At Commit").
	ErrLodeDepleted = errors.New("mine: lode's remaining tonnage is already at or below zero")
	// ErrNoMiningCapability: the fleet's derived mining rate is zero.
	ErrNoMiningCapability = errors.New("mine: fleet's derived mining rate is zero")
	// ErrStationNotMineable: the named feature is a trading station (#0011).
	// Dockable, sellable-at, but never mineable.
	ErrStationNotMineable = errors.New("mine: a trading station cannot be mined")
	// ErrOverFreeHold: the requested tons exceeds the fleet's current free
	// hold.
	ErrOverFreeHold = errors.New("mine: requested tons exceeds free hold")
	// errNotImplemented marks Commit's red-phase compile stub.
	errNotImplemented = errors.New("mine: Commit not implemented")
)

// FleetSource is the narrow fleet-domain read mine needs at commit: the live
// fleet doc (with any due arrival opportunistically settled — see
// fleet.Service.Get) so the docked-to-feature/roster/cargo preconditions read
// the fleet's true, current state. mine imports fleet only for this
// interface and for fleet.Fleet/fleet.ShipEntry/fleet.ClassStats — never
// fleet.Dao — per backend/CLAUDE.md's layering rule.
type FleetSource interface {
	Get(ctx context.Context, id string) (*fleet.Fleet, error)
}

// FeatureSource is the narrow system-domain dependency mine needs: the
// system's materialized features (for the target's docked/kind/richness
// checks). mine imports system only for this interface and for
// system.Feature/system.ResourceKind/system.FeatureType — never system.Dao.
type FeatureSource interface {
	GetOrCreateInterior(ctx context.Context, systemID string) (*system.GeneratedInterior, error)
}

// Actions is the action-spine dependency mine needs: action.CommitInterface
// (commit/cancel/resolve-active, mirroring fleet's use of the same narrow
// surface), a by-id read (used only to name which verb currently occupies a
// busy movement slot — design.md Decision #19), and the public commit-time
// ledger fold (design.md Decision #13 / task 0.2 — "Already-Depleted Lode
// Rejected At Commit"). *action.Service satisfies this directly.
type Actions interface {
	action.CommitInterface
	Get(ctx context.Context, id string) (*action.Action, error)
	Remaining(ctx context.Context, ledgerKey string, t common.WorldMillis) (float64, error)
}

// ServiceInterface is mine's HTTP-facing surface.
type ServiceInterface interface {
	// Commit validates every mine precondition (design.md task 2.2, Decisions
	// #4/#8/#9/#10/#12/#14) and commits the run through the action spine.
	// requesterCorpId is the resolved common.ActorCorp (empty ⇒
	// ErrUnauthenticated).
	Commit(ctx context.Context, requesterCorpId, fleetId string, req MineRequest) (*action.Action, error)
}

type Service struct {
	fleets   FleetSource
	features FeatureSource
	actions  Actions
	clock    common.WorldTime
	params   MineParams
	// classStats is the roster stats table Commit derives fleetMineRate/
	// capacity/freeHold through (fleet.DerivedMiningRate / FreeHold —
	// "ETA From Tonnage Target"). Injected (rather than reading
	// fleet.DefaultClassStats() internally) so it's a testable seam, mirroring
	// how every other service in this repo takes its dependencies through the
	// constructor rather than reading package-level config directly.
	classStats map[fleet.ShipClass]fleet.ClassStats
}

func NewServiceWith(fleets FleetSource, features FeatureSource, actions Actions, clock common.WorldTime, params MineParams, classStats map[fleet.ShipClass]fleet.ClassStats) *Service {
	return &Service{fleets: fleets, features: features, actions: actions, clock: clock, params: params, classStats: classStats}
}

// Commit is the mine verb's commit path: ownership → tonnage validity →
// remaining preconditions (docked, kind, lode-not-depleted, mining rate,
// free hold, movement slot free) → freeze params → commit through the action
// spine (design.md task 2.2).
func (s *Service) Commit(ctx context.Context, requesterCorpId, fleetId string, req MineRequest) (*action.Action, error) {
	// (a) ownership — resolved before any other precondition, existence hidden
	// (design.md Decision #10).
	if requesterCorpId == "" {
		return nil, ErrUnauthenticated
	}
	f, err := s.fleets.Get(ctx, fleetId)
	if err != nil || f == nil || f.CorporationId != requesterCorpId {
		return nil, ErrForeignFleet
	}

	// (b) tonnage validity.
	if math.IsNaN(req.Tons) || math.IsInf(req.Tons, 0) || req.Tons <= 0 {
		return nil, ErrInvalidTonnage
	}
	if req.Tons < s.params.MinRunTons {
		return nil, ErrSubMinimumRun
	}

	now := s.clock.Now()

	// (c) remaining preconditions, in spec order.

	// Docked to the named feature (fleet.Fleet.DockedTo — design.md Decision
	// 13; link 6, re-express-economy-positions, redefines what a valid host
	// is).
	host, docked := f.DockedTo()
	if !docked || host != req.FeatureId {
		return nil, ErrNotDocked
	}

	interior, err := s.features.GetOrCreateInterior(ctx, f.SystemId)
	if err != nil {
		return nil, fmt.Errorf("mine: reading system interior: %w", err)
	}
	feat := findFeature(interior, req.FeatureId)
	// A station is a dockable but NOT mineable feature (#0011). Checked before
	// the kind lookup so it reports its own reason: a station carries no
	// resources, so falling through would reject it as "feature does not carry
	// that kind" — true but misleading, and indistinguishable from naming a real
	// body that happens to lack the kind.
	if feat != nil && feat.Type == system.FeatureStation {
		return nil, ErrStationNotMineable
	}
	var res system.Resource
	var haveKind bool
	if feat != nil {
		res, haveKind = findResource(feat, req.Kind)
	}
	if !haveKind {
		return nil, ErrUnknownKind
	}

	ledgerKey := LedgerKey(f.SystemId, req.FeatureId, req.Kind)
	// The commit-time courtesy fold ("Already-Depleted Lode Rejected At
	// Commit") — the same fold the resolver folds at resolve, evaluated now.
	fold, err := s.actions.Remaining(ctx, ledgerKey, now)
	if err != nil {
		return nil, fmt.Errorf("mine: folding ledger at commit: %w", err)
	}
	startTons := res.Richness * s.params.TonsPerRichness
	remainingAtNow := startTons + fold
	if remainingAtNow < 0 {
		remainingAtNow = 0
	}
	// Decision #17 "Mine Ledger Depth Is Observable": the commit-time fold's
	// resulting signal, attributed to its ledger key, logged independent of
	// whether the commit itself succeeds. (The Actions surface exposes only
	// the folded total, not a raw delta-doc count — see the SDET handoff
	// report; the folded remaining is the closest countable signal available
	// through the layering-compliant public surface.)
	log.Info().Ctx(ctx).Str("ledgerKey", ledgerKey).Float64("foldedRemaining", remainingAtNow).
		Msg("Mine ledger folded at commit")
	if remainingAtNow <= 0 {
		return nil, ErrLodeDepleted
	}

	fleetRate := fleet.DerivedMiningRate(*f, s.classStats)
	if fleetRate <= 0 {
		return nil, ErrNoMiningCapability
	}

	freeHold := fleet.FreeHold(*f, s.classStats)
	if req.Tons > freeHold {
		return nil, ErrOverFreeHold
	}

	if f.ActiveActionId != "" {
		occupying := ""
		if a, gerr := s.actions.Get(ctx, f.ActiveActionId); gerr == nil && a != nil {
			occupying = a.Type
		}
		return nil, fmt.Errorf("%s: %w", BusyReason(occupying), action.ErrActiveActionExists)
	}

	// (d) freeze params — Decision #8: startTons is frozen at commit so resolve
	// is self-contained and immune to a tuning change moving an in-flight
	// run's yield.
	eta := now.Add(common.WorldMillis(math.Round(req.Tons / fleetRate)))
	a, err := s.actions.Commit(ctx, action.CommitSpec{
		Type:            mineType,
		Actor:           fleetId,
		ActorCollection: fleetActorCollection,
		Scope:           f.SystemId, // read-resolution/SSE stays system-aligned (Decision #12)
		LedgerKey:       ledgerKey,  // per-feature, per-kind depletion (Decisions #12/#14)
		Params: map[string]interface{}{
			"featureId": req.FeatureId,
			"kind":      string(req.Kind),
			"tons":      req.Tons,
			"rate":      fleetRate,
			"startTons": startTons,
		},
		Eta: eta,
	})
	if err != nil {
		return nil, err
	}
	log.Info().Ctx(ctx).Str("fleetId", fleetId).Str("actionId", a.Id).
		Str("featureId", req.FeatureId).Str("kind", string(req.Kind)).Float64("tons", req.Tons).
		Int64("eta", int64(eta)).Msg("Fleet ordered to mine")
	return a, nil
}

// findFeature locates a feature by id in a materialized interior, or nil.
func findFeature(interior *system.GeneratedInterior, featureID string) *system.Feature {
	if interior == nil {
		return nil
	}
	for i := range interior.Features {
		if interior.Features[i].Id == featureID {
			return &interior.Features[i]
		}
	}
	return nil
}

// findResource locates a feature's resource entry of the given kind.
func findResource(feat *system.Feature, kind system.ResourceKind) (system.Resource, bool) {
	for _, r := range feat.Resources {
		if r.Kind == kind {
			return r, true
		}
	}
	return system.Resource{}, false
}

// BusyReason maps an occupying action's Type to the player-facing name used
// in the busy-movement-slot rejection's distinguishing reason (design.md
// "Mine Commit Rejections Report a Distinguishable Reason": "burning, in lane
// transit, or already mining"). Recognizes the three action-dispatch type
// literals "burn" | "lane-travel" | "mine" (mirroring fleet's unexported
// burnType/travelType and mine's own mineType — golang-dev must keep these
// three string literals in sync with fleet/service.go and fleet/travel.go).
func BusyReason(activeType string) string {
	switch activeType {
	case "burn":
		return "fleet is burning"
	case "lane-travel":
		return "fleet is in lane transit"
	case "mine":
		return "fleet is already mining"
	default:
		return "fleet's movement slot is busy"
	}
}
