package mine

import (
	"math"
	"testing"

	"hexaverse/system"
)

// mine-extraction spec: "Minimum Mine Run Size Is Bounded By Lode Tonnage"
// (design.md Decision #18). Automated now that DefaultMineParams carries
// concrete MinRunTons/TonsPerRichness/MaxLedgerDeltas numbers and
// validateMineParams enforces the bound at construction (previously
// unautomatable in the red phase — no concrete numbers existed yet).

// Scenario: A lode's maximum possible delta count is bounded. For every
// feature type DefaultMineParams configures a ceiling for, the worst-case
// number of ledger deltas a fully-depleted lode of that type could ever
// accumulate — ⌈(TonsPerRichness × 1.0) / MinRunTons⌉, richness=1.0 being the
// maximum the richness→tons curve can produce — must not exceed the
// configured MaxLedgerDeltas ceiling. This is a regression guard: it passes
// today (the numbers hold by construction per model.go's comment) and exists
// to fail loudly — here, at unit-test speed — if a future retune of
// MinRunTons/TonsPerRichness/a ceiling silently reopens the unbounded-ledger-
// growth risk the ceiling exists to prevent, well before validateMineParams'
// runtime panic would surface it in production.
func TestDefaultMineParams_CeilingHoldsForWorstCaseRichness(t *testing.T) {
	p := DefaultMineParams()

	if p.MinRunTons <= 0 {
		t.Fatalf("MinRunTons = %g, want > 0", p.MinRunTons)
	}
	if len(p.MaxLedgerDeltas) == 0 {
		t.Fatalf("MaxLedgerDeltas is empty — no feature type ceilings configured")
	}

	worstCaseCurveTons := p.TonsPerRichness * 1.0
	worstCaseDeltas := int(math.Ceil(worstCaseCurveTons / p.MinRunTons))

	for featureType, ceil := range p.MaxLedgerDeltas {
		if worstCaseDeltas > ceil {
			t.Errorf(
				"feature type %q: worst-case delta count ⌈%g/%g⌉=%d exceeds its configured MaxLedgerDeltas ceiling %d — a lode of this type could accumulate unbounded ledger deltas",
				featureType, worstCaseCurveTons, p.MinRunTons, worstCaseDeltas, ceil,
			)
		}
	}
}

// Scenario: every resource-bearing feature type the system-interior
// generator mints carries a configured ceiling (a gap here would mean a lode
// of that type mines with NO ledger-depth bound at all — the failure mode
// the "Minimum Mine Run Size Is Bounded By Lode Tonnage" scenario guards
// against just as much as an inadequate ceiling would). SDET-added: not a
// literal reading of the scenario text, but the same invariant applied to
// coverage rather than magnitude.
func TestDefaultMineParams_EveryResourceBearingFeatureTypeHasACeiling(t *testing.T) {
	p := DefaultMineParams()
	want := []system.FeatureType{
		system.FeatureBelt,
		system.FeatureGasGiant,
		system.FeatureRocky,
		system.FeatureIce,
		system.FeatureMoon,
		system.FeatureAnomaly,
		system.FeatureRuin,
	}
	for _, ft := range want {
		if _, ok := p.MaxLedgerDeltas[ft]; !ok {
			t.Errorf("feature type %q has no MaxLedgerDeltas ceiling configured", ft)
		}
	}
}

// Scenario: validateMineParams panics when a feature type's ceiling is set
// below the worst-case delta count the richness→tons curve can produce for
// it — the runtime invariant DefaultMineParams relies on
// (design.md Decision #18 / Risks "Unbounded ledger growth"). Constructed
// directly (validateMineParams is package-private; this test lives in the
// same package rather than requiring a production export).
func TestValidateMineParams_Scenario_PanicsWhenCeilingBelowWorstCase(t *testing.T) {
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("validateMineParams did not panic on a ceiling below the worst-case delta count")
		}
	}()

	// worst-case deltas = ceil(400/5) = 80; a ceiling of 79 must trip the panic.
	validateMineParams(MineParams{
		MinRunTons:      5.0,
		TonsPerRichness: 400.0,
		MaxLedgerDeltas: map[system.FeatureType]int{
			system.FeatureBelt: 79,
		},
	})
}

// Scenario: validateMineParams panics on a non-positive MinRunTons — a zero
// or negative minimum run size makes the ceiling computation itself
// meaningless (division by zero or a negative bound), so it must be rejected
// before the ceiling comparison runs at all.
func TestValidateMineParams_Scenario_PanicsOnNonPositiveMinRunTons(t *testing.T) {
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("validateMineParams did not panic on MinRunTons <= 0")
		}
	}()

	validateMineParams(MineParams{
		MinRunTons:      0,
		TonsPerRichness: 400.0,
		MaxLedgerDeltas: map[system.FeatureType]int{
			system.FeatureBelt: 100,
		},
	})
}
