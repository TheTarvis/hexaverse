package fleet

// SDET fixture-consistency check for openspec change add-fuel-as-cargo,
// tasks.md 2.7 ("Fixture cases for the fuel-cost and refund conversions ...
// under a new fixtures/fleet/ (or equivalent) family") — golden cases live
// at repo-root fixtures/fleet/cases.json's new "fuelCost"/"discardRefund"
// keys, additive alongside the pre-existing "commandedAccelRejection"
// family (accel_nan_fixture_test.go).
//
// NOT YET WIRED AGAINST A PRODUCTION FUNCTION: this change has not landed
// FuelCostTons (or an equivalent exported symbol) or the discard-refund
// computation anywhere in backend/fleet — inventing that function's
// signature here, unreviewed, risks pinning a contract a developer then
// has to either adopt verbatim or dispute. This test instead checks the
// FIXTURE'S OWN internal arithmetic consistency (costTons really does equal
// accel*flightSeconds*hullCount/deltaVPerTon for every recorded case, and
// refundTons really does equal the closed-form ratio applied to the stored
// cost) — a regression net against a future hand-edit of the golden file
// introducing an arithmetic mistake, and the reference table a developer's
// real implementation (and the frontend SDET's TS mirror) can assert
// against once it exists. This is GREEN by construction (it is not
// production behavior), not a red-phase proof of a gap — reported as such
// in the SDET coverage table rather than claimed as adversarial coverage.

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
)

type fuelCostFixtureCase struct {
	Name         string  `json:"name"`
	Accel        float64 `json:"accel"`
	FlightSecond float64 `json:"flightSeconds"`
	HullCount    float64 `json:"hullCount"`
	DeltaVPerTon float64 `json:"deltaVPerTon"`
	DeltaV       float64 `json:"deltaV"`
	CostTons     float64 `json:"costTons"`
}

type discardRefundFixtureCase struct {
	Name             string  `json:"name"`
	StoredCostTons   float64 `json:"storedDebitedCostTons"`
	FlightDurationMs float64 `json:"flightDurationMs"`
	TauMs            float64 `json:"tauMs"`
	UnspentFraction  float64 `json:"unspentFraction"`
	RefundTons       float64 `json:"refundTons"`
}

type fuelFixtureFile struct {
	FuelCost      []fuelCostFixtureCase      `json:"fuelCost"`
	DiscardRefund []discardRefundFixtureCase `json:"discardRefund"`
}

func loadFuelFixture(t *testing.T) fuelFixtureFile {
	t.Helper()
	// backend/fleet -> ../../fixtures/fleet/cases.json
	path := filepath.Join("..", "..", "fixtures", "fleet", "cases.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	var out fuelFixtureFile
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("decoding %s: %v", path, err)
	}
	return out
}

func TestFuelCostFixture_CostFormulaIsInternallyConsistent(t *testing.T) {
	fx := loadFuelFixture(t)
	if len(fx.FuelCost) == 0 {
		t.Fatal("fixtures/fleet/cases.json's \"fuelCost\" array is empty — this check would be vacuous")
	}
	for _, c := range fx.FuelCost {
		t.Run(c.Name, func(t *testing.T) {
			wantDeltaV := c.Accel * c.FlightSecond
			if math.Abs(wantDeltaV-c.DeltaV) > 1e-9 {
				t.Errorf("recorded deltaV = %v, but accel(%v) * flightSeconds(%v) = %v — the fixture itself is "+
					"internally inconsistent", c.DeltaV, c.Accel, c.FlightSecond, wantDeltaV)
			}
			wantCost := wantDeltaV * c.HullCount / c.DeltaVPerTon
			if math.Abs(wantCost-c.CostTons) > 1e-9 {
				t.Errorf("recorded costTons = %v, but deltaV(%v) * hullCount(%v) / deltaVPerTon(%v) = %v — the "+
					"fixture itself is internally inconsistent", c.CostTons, wantDeltaV, c.HullCount,
					c.DeltaVPerTon, wantCost)
			}
		})
	}
}

func TestFuelCostFixture_RefundFormulaIsInternallyConsistent(t *testing.T) {
	fx := loadFuelFixture(t)
	if len(fx.DiscardRefund) == 0 {
		t.Fatal("fixtures/fleet/cases.json's \"discardRefund\" array is empty — this check would be vacuous")
	}
	for _, c := range fx.DiscardRefund {
		t.Run(c.Name, func(t *testing.T) {
			wantFraction := (c.FlightDurationMs - c.TauMs) / c.FlightDurationMs
			if math.Abs(wantFraction-c.UnspentFraction) > 1e-9 {
				t.Errorf("recorded unspentFraction = %v, but (flightDurationMs(%v) - tauMs(%v)) / "+
					"flightDurationMs(%v) = %v", c.UnspentFraction, c.FlightDurationMs, c.TauMs,
					c.FlightDurationMs, wantFraction)
			}
			wantRefund := c.StoredCostTons * wantFraction
			if math.Abs(wantRefund-c.RefundTons) > 1e-9 {
				t.Errorf("recorded refundTons = %v, but storedDebitedCostTons(%v) * unspentFraction(%v) = %v",
					c.RefundTons, c.StoredCostTons, wantFraction, wantRefund)
			}
		})
	}
}
