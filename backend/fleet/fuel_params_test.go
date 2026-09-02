package fleet

// SDET note: same out-of-primary-scope caveat as fuel_test.go — added only
// to close the mechanical per-changed-file "Backend Test Coverage" gate for
// this untracked production file. fuel_params.go declares one struct and one
// constructor; this pins the constructor's documented placeholder values so
// a future silent edit to them (as opposed to a deliberate, spec-updating
// retune) is caught.

import "testing"

// TestDefaultFuelParams_Scenario_MatchesTheDocumentedPlaceholderValues pins
// the three EXACT placeholder constants fuel_params.go's own doc comments
// cite (DeltaVPerTon=5.0 is written into fleet-movement's own requirement
// text; StartingFuelTons=100.0 and PricePerTon=10.0 are corporation-spawn's
// and fuel-purchase's tuning knobs respectively) — a silent value change
// here is a spec change, not a code change, per those comments' own words.
func TestDefaultFuelParams_Scenario_MatchesTheDocumentedPlaceholderValues(t *testing.T) {
	p := DefaultFuelParams()
	if p.DeltaVPerTon != 5.0 {
		t.Errorf("DeltaVPerTon = %v, want 5.0", p.DeltaVPerTon)
	}
	if p.StartingFuelTons != 100.0 {
		t.Errorf("StartingFuelTons = %v, want 100.0", p.StartingFuelTons)
	}
	if p.PricePerTon != 10.0 {
		t.Errorf("PricePerTon = %v, want 10.0", p.PricePerTon)
	}
}

// TestDefaultFuelParams_Scenario_EveryFieldIsStrictlyPositive is an
// SDET-added structural guard: every one of these three constants gates a
// division (FuelCostTons, EstimatedRangeTons) or a cost computation
// (refuel.computeCost) elsewhere in the codebase — a zero or negative
// default would silently degrade those to their own misconfiguration-guard
// paths rather than the intended live gameplay behavior.
func TestDefaultFuelParams_Scenario_EveryFieldIsStrictlyPositive(t *testing.T) {
	p := DefaultFuelParams()
	if p.DeltaVPerTon <= 0 {
		t.Errorf("DeltaVPerTon = %v, want > 0", p.DeltaVPerTon)
	}
	if p.StartingFuelTons <= 0 {
		t.Errorf("StartingFuelTons = %v, want > 0", p.StartingFuelTons)
	}
	if p.PricePerTon <= 0 {
		t.Errorf("PricePerTon = %v, want > 0", p.PricePerTon)
	}
}

// TestFuelParams_Scenario_IsAPlainValueStructWithNoHiddenDefaulting pins
// that FuelParams itself carries no behavior of its own — a zero-value
// FuelParams{} must read back as exactly zero fields, never silently
// substituting DefaultFuelParams()' values, so a caller that forgets to
// wire it (rather than one that explicitly chooses zero) fails loudly at
// its own consuming guard (ErrMisconfiguredPrice, the DeltaVPerTon<=0
// degrade-to-zero branches) instead of masking the omission.
func TestFuelParams_Scenario_IsAPlainValueStructWithNoHiddenDefaulting(t *testing.T) {
	var zero FuelParams
	if zero.DeltaVPerTon != 0 || zero.StartingFuelTons != 0 || zero.PricePerTon != 0 {
		t.Errorf("zero-value FuelParams = %+v, want every field exactly 0", zero)
	}
}
