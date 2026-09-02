package mine

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

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

	// featureId validation sentinels (re-express-economy-positions
	// mine-extraction: "A Client-Supplied Feature Id Is Validated Before
	// Resolution"). Each rejection this family defines carries its own
	// distinguishable sentinel — none of these ever collapse onto
	// ErrUnknownKind or onto one another (design.md Decision 2a; "Mine
	// Commit Rejections Report a Distinguishable Reason" extended to this
	// family).
	//
	// Lexical phase — checked before the string is parsed for the belt-
	// member separator "#" at all.
	ErrFeatureIdPathSeparator  = errors.New("mine: featureId must not contain a path separator")
	ErrFeatureIdIsDot          = errors.New(`mine: featureId must not be exactly "."`)
	ErrFeatureIdIsDotDot       = errors.New(`mine: featureId must not be exactly ".."`)
	ErrFeatureIdReservedDunder = errors.New("mine: featureId must not match the reserved dunder pattern")
	ErrFeatureIdOverlong       = errors.New("mine: featureId exceeds the maximum configured length")
	// Resolution phase — checked only once the lexical phase has passed,
	// after "#" is parsed but before the resulting prefix resolves anything.
	ErrFeatureIdMultipleSeparators = errors.New("mine: featureId must contain at most one member separator")
	ErrFeatureIdSuffixNotNumeric   = errors.New("mine: featureId's member suffix is not a base-10 integer")
	ErrFeatureIdSuffixOutOfRange   = errors.New("mine: featureId's member suffix is outside the valid index range")
	ErrFeatureIdPrefixNotFound     = errors.New("mine: featureId's member prefix does not resolve to an existing feature")
	ErrFeatureIdPrefixNotBelt      = errors.New("mine: featureId's member prefix does not resolve to a belt feature")

	// errNotImplemented marks Commit's red-phase compile stub.
	errNotImplemented = errors.New("mine: Commit not implemented")
)

// featureIdDunderPattern is Firestore's own reserved document-id pattern
// (`^__.*__$`) — the lexical phase's third rejection.
var featureIdDunderPattern = regexp.MustCompile(`^__.*__$`)

// validateFeatureIdLexical is the LEXICAL phase of featureId validation
// (design.md Decision 2a): run before the string is parsed for the belt-
// member separator "#" at all. maxBytes <= 0 disables the length check
// (used only by test fixtures that never opted into it — DefaultMineParams'
// production default is always positive).
func validateFeatureIdLexical(featureId string, maxBytes int) error {
	if strings.Contains(featureId, "/") {
		return ErrFeatureIdPathSeparator
	}
	if featureId == "." {
		return ErrFeatureIdIsDot
	}
	if featureId == ".." {
		return ErrFeatureIdIsDotDot
	}
	if featureIdDunderPattern.MatchString(featureId) {
		return ErrFeatureIdReservedDunder
	}
	if maxBytes > 0 && len(featureId) > maxBytes {
		return ErrFeatureIdOverlong
	}
	return nil
}

// resolveFeatureId is the RESOLUTION phase of featureId validation (design.md
// Decision 2a) plus target lookup: run only on a featureId that has already
// passed validateFeatureIdLexical, after "#" is parsed but before the
// resulting prefix is used to resolve anything. A featureId with no "#" is
// resolved directly by exact id (existence/kind are the caller's concern, as
// today); a featureId of the form "<prefix>#<suffix>" resolves to its parent
// belt feature — never by searching interior.Features for the member id
// itself, which never appears there (mine-extraction: "Belt Member Targets
// Resolve Through Their Parent Belt Feature"). Returns the resolved feature
// (nil only for the no-separator, not-found case) and the resolved feature's
// own id — the value every caller must use for the ledger key and Params,
// never the raw client string (design.md Decision 2a).
func resolveFeatureId(featureId string, interior *system.GeneratedInterior) (*system.Feature, string, error) {
	sep := strings.IndexByte(featureId, '#')
	if sep < 0 {
		if f := findFeature(interior, featureId); f != nil {
			return f, f.Id, nil
		}
		return nil, featureId, nil
	}
	if strings.Count(featureId, "#") > 1 {
		return nil, "", ErrFeatureIdMultipleSeparators
	}
	prefix, suffix := featureId[:sep], featureId[sep+1:]
	idx, err := strconv.Atoi(suffix)
	if err != nil {
		return nil, "", ErrFeatureIdSuffixNotNumeric
	}
	if idx < 0 || idx >= system.AsteroidsPerBelt {
		return nil, "", ErrFeatureIdSuffixOutOfRange
	}
	parent := findFeature(interior, prefix)
	if parent == nil {
		return nil, "", ErrFeatureIdPrefixNotFound
	}
	if parent.Type != system.FeatureBelt {
		return nil, "", ErrFeatureIdPrefixNotBelt
	}
	return parent, parent.Id, nil
}

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
// docked-state → featureId validation → remaining preconditions (kind,
// lode-not-depleted, mining rate, free hold, movement slot free) → freeze
// params → commit through the action spine (design.md task 2.2).
//
// The resolved target — the value every downstream precondition (kind,
// richness/startTons, ledger key) reads — is either the named feature
// itself, or, for a validated belt-member id (`<beltFeatureId>#<k>`), its
// parent belt feature (re-express-economy-positions, mine-extraction: "Belt
// Member Targets Resolve Through Their Parent Belt Feature"); a member is
// never an independent lode of its own.
//
// The submitted featureId is validated in two phases, run strictly AFTER
// the ownership check and the not-docked rejection — never before, so an
// invalid or unresolvable id can never turn this endpoint into an existence
// oracle for a foreign fleet's target (mine-extraction: "A Client-Supplied
// Feature Id Is Validated Before Resolution"). A LEXICAL phase runs before
// the string is parsed for the belt-member separator "#" at all (rejects a
// path separator, exactly "." or "..", the reserved dunder pattern, or an
// overlong id). A RESOLUTION phase runs only on a string the lexical phase
// passed, after "#" is parsed but before the resulting prefix resolves
// anything (rejects more than one "#", a non-numeric or out-of-range member
// suffix, or a prefix that does not resolve to an existing belt-type
// feature). Each rejection carries its own distinguishable sentinel.
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

	// featureId validation (design.md Decision 2a) runs STRICTLY after
	// ownership and the not-docked rejection above, never before — an
	// invalid/unresolvable id rejected any earlier would let a caller probe
	// the shape or existence of a foreign fleet's docked target before
	// ownership is established, turning this endpoint into an existence
	// oracle (mine-extraction: "An unresolvable member rejection never
	// precedes ownership or the not-docked rejection").
	if err := validateFeatureIdLexical(req.FeatureId, s.params.MaxFeatureIdBytes); err != nil {
		return nil, err
	}

	interior, err := s.features.GetOrCreateInterior(ctx, f.SystemId)
	if err != nil {
		return nil, fmt.Errorf("mine: reading system interior: %w", err)
	}
	// Resolution phase + target lookup: a bare id resolves directly; a
	// validated member id (<beltFeatureId>#<k>) resolves through its parent
	// belt feature — never by searching interior.Features for the member id
	// itself, which never appears there (mine-extraction: "Belt Member
	// Targets Resolve Through Their Parent Belt Feature").
	feat, resolvedFeatureId, err := resolveFeatureId(req.FeatureId, interior)
	if err != nil {
		return nil, err
	}
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

	// The ledger key's feature component is always the RESOLVED feature's own
	// id (the named feature itself, or a member's resolved parent belt
	// feature) — never the raw client-supplied featureId string — and its
	// system component is always the fleet's own stored SystemId — never a
	// client-supplied system identifier (design.md Decision 2a;
	// mine-extraction: "A resolved run's ledger key never contains the raw
	// client string or a client-supplied system id").
	ledgerKey := LedgerKey(f.SystemId, resolvedFeatureId, req.Kind)
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
			"featureId": resolvedFeatureId, // resolved — never the raw client string
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
		Str("featureId", resolvedFeatureId).Str("kind", string(req.Kind)).Float64("tons", req.Tons).
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
