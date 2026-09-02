// Package mine is the mine-extraction verb (#0010 / add-mine-extraction): the
// action-dispatch spine's first mutating resolver. Handler → service, per
// backend/CLAUDE.md's domain shape; the service reads/writes fleets and
// features through their services (FleetSource/FeatureSource), never DAOs
// directly, and rides action.CommitInterface (+Get) for the spine.
package mine

import (
	"fmt"
	"math"

	"hexaverse/system"
)

// ReasonCode is the structured clamp/rejection classifier a resolved mine
// action carries alongside its Outcome prose (design.md "Resolve Clamps
// Yield to Reality" / Decision #15's extension, Decision #19). Mirrored onto
// action.Action.ReasonCode / action.ResolveResult.ReasonCode (an SDET-invented
// action-dispatch surface addition — see the SDET handoff report).
type ReasonCode string

const (
	// ReasonClean: the full requested tonnage was taken — neither the lode nor
	// free hold bound below params.tons.
	ReasonClean ReasonCode = "clean"
	// ReasonLodeDry: the lode's remaining tonnage at ETA bound the take below
	// params.tons (possibly to zero).
	ReasonLodeDry ReasonCode = "lodeDry"
	// ReasonHoldFull: the fleet's free hold at resolve bound the take below
	// params.tons (possibly to zero). Defensive in this change — see design.md
	// "Resolve Clamps Yield to Reality".
	ReasonHoldFull ReasonCode = "holdFull"
)

// mineType is the action-dispatch key mine registers/commits under (design.md
// task 2.2(f); shares the fleet's MOVEMENT channel per Decision #9, never a
// dedicated one).
const mineType = "mine"

// MineRequest is the body of POST /v1/fleets/:fleetId/mine.
type MineRequest struct {
	FeatureId string              `json:"featureId"`
	Kind      system.ResourceKind `json:"kind"`
	Tons      float64             `json:"tons"`
}

// MineParams are mine's tuning knobs (design.md Open Questions — starting
// numbers are tuning-time, not pinned here).
//
// STUB: red-phase compile contract, golang-dev implements DefaultMineParams'
// real tuned values (task 2.2a). Tests that need concrete numbers construct
// their own MineParams literal rather than depend on the default.
type MineParams struct {
	// MinRunTons is the minimum tons a single commit may request — bounds a
	// feature's total ledger delta count to ⌈lodeTonnage / MinRunTons⌉
	// ("Minimum Mine Run Size").
	MinRunTons float64
	// MaxLedgerDeltas ceilings a feature type's total delta count
	// (⌈startTons/MinRunTons⌉) — Decision #18's named, configured ceiling
	// ("Minimum Mine Run Size Is Bounded By Lode Tonnage"). Keyed by
	// system.FeatureType.
	MaxLedgerDeltas map[system.FeatureType]int
	// TonsPerRichness converts a feature's resources[kind].Richness (0..1) into
	// startTons at commit (Decision #8): startTons = richness × TonsPerRichness.
	TonsPerRichness float64
	// MaxFeatureIdBytes bounds a client-supplied featureId's UTF-8 byte length
	// (re-express-economy-positions design.md Decision 2a / "A Client-Supplied
	// Feature Id Is Validated Before Resolution"), below Firestore's 1500-byte
	// document-id limit. A zero value disables the length check entirely (test
	// fixtures that don't set this field, e.g. this package's own
	// validParams(), never wanted the length check exercised) — only
	// DefaultMineParams' 256-byte default enforces it in production.
	MaxFeatureIdBytes int
}

// Tuning-time "starting numbers" (design.md Open Questions / Decision #18).
// MinRunTons (5t) bounds a lode's ledger delta count to
// ⌈startTons/MinRunTons⌉; TonsPerRichness (400t at richness=1.0) sizes a
// typical mid-richness (~0.5..0.9) lode at roughly 200-360 tons — comparable
// to a seed hull's hold (fleet.defaultSeedHoldCapacity, 200t), so a single
// run rarely empties a lode in one hold's worth. defaultMaxLedgerDeltas
// (100) is the named ceiling Decision #18 requires: it is chosen to exceed
// ⌈startTons/MinRunTons⌉ for every resource-bearing feature type under this
// curve (richness is generated in 0..1, so worst case ⌈400/5⌉=80 < 100),
// honoring the ceiling by construction rather than an active runtime check.
const (
	defaultMinRunTons          = 5.0
	defaultTonsPerRichness     = 400.0
	defaultMaxLedgerDeltasCeil = 100
	// defaultMaxFeatureIdBytes is the production featureId length ceiling
	// (design.md Decision 2a): comfortably below Firestore's 1500-byte
	// document-id limit while remaining well past any id this generator
	// mints.
	defaultMaxFeatureIdBytes = 256
)

// DefaultMineParams sources the live tuning knobs (design.md Open Questions;
// Decision #18's named, configured ceiling). MaxLedgerDeltas covers every
// resource-bearing feature type the system-interior generator mints
// (system/generator.go): belts, gas giants, rocky/ice bodies, moons,
// anomalies, and ruins.
//
// validateMineParams asserts the ceiling this comment claims "by construction"
// actually holds, at construction time — see its doc comment.
func DefaultMineParams() MineParams {
	ceil := defaultMaxLedgerDeltasCeil
	p := MineParams{
		MinRunTons:        defaultMinRunTons,
		TonsPerRichness:   defaultTonsPerRichness,
		MaxFeatureIdBytes: defaultMaxFeatureIdBytes,
		MaxLedgerDeltas: map[system.FeatureType]int{
			system.FeatureBelt:     ceil,
			system.FeatureGasGiant: ceil,
			system.FeatureRocky:    ceil,
			system.FeatureIce:      ceil,
			system.FeatureMoon:     ceil,
			system.FeatureAnomaly:  ceil,
			system.FeatureRuin:     ceil,
		},
	}
	validateMineParams(p)
	return p
}

// validateMineParams enforces design.md Decision #18 / the spec's "Minimum
// Mine Run Size Is Bounded By Lode Tonnage" as a runtime invariant, not just a
// code comment's claim: for every resource-bearing feature type carrying a
// MaxLedgerDeltas ceiling, the worst-case number of take-bearing ledger
// deltas a fully-depleted lode of that type can ever accumulate —
// ⌈worstCaseCurveTons / MinRunTons⌉, where worstCaseCurveTons =
// TonsPerRichness × 1.0 (richness is clamped to [0,1] at generation, see
// system/generator.go's rich(), so richness=1.0 is the maximum tonnage the
// richness→tons curve can produce) — must not exceed that type's configured
// ceiling. This is a startup/config invariant: a future retune of
// MinRunTons, TonsPerRichness, or a feature type's ceiling that would
// silently reintroduce the unbounded-ledger-growth risk the ceiling exists
// to prevent (see "Unbounded ledger growth" in design.md's Risks) panics
// here, at construction, rather than surfacing later as a slow or failing
// transactional fold in production.
func validateMineParams(p MineParams) {
	if p.MinRunTons <= 0 {
		panic(fmt.Sprintf("mine: invalid MineParams: MinRunTons must be positive, got %g", p.MinRunTons))
	}
	if p.MaxFeatureIdBytes <= 0 {
		panic(fmt.Sprintf("mine: invalid MineParams: MaxFeatureIdBytes must be positive, got %d", p.MaxFeatureIdBytes))
	}
	worstCaseCurveTons := p.TonsPerRichness * 1.0
	worstCaseDeltas := int(math.Ceil(worstCaseCurveTons / p.MinRunTons))
	for featureType, ledgerCeil := range p.MaxLedgerDeltas {
		if worstCaseDeltas > ledgerCeil {
			panic(fmt.Sprintf(
				"mine: invalid MineParams: feature type %q's MaxLedgerDeltas ceiling (%d) is below the worst-case delta count a fully-depleted lode can accumulate (⌈%g / %g⌉ = %d, from TonsPerRichness=%g at richness=1.0 and MinRunTons=%g) — retune MinRunTons, TonsPerRichness, or MaxLedgerDeltas[%q] so the ceiling holds",
				featureType, ledgerCeil, worstCaseCurveTons, p.MinRunTons, worstCaseDeltas, p.TonsPerRichness, p.MinRunTons, featureType,
			))
		}
	}
}

// LedgerKey builds mine's per-feature, per-kind depletion ledger key: a
// Firestore-document-id-safe `::`-join of systemId, featureId, and kind —
// never `/` (design.md Decisions #12/#14; "Ledger Key Is
// System-And-Kind-Qualified, Channel Scope Is Per-System").
func LedgerKey(systemId, featureId string, kind system.ResourceKind) string {
	return systemId + "::" + featureId + "::" + string(kind)
}
