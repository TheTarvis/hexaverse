package fleet

// SDET note: this file is OUT OF the backend/refuel package this session was
// scoped to add coverage for — it exists only to close a mechanical
// per-changed-file gate (code-quality-checks' "Backend Test Coverage" check)
// that also flagged this untracked, testless production file. Scope is
// deliberately narrow: it wires the golden fixture tasks.md 2.7 already
// introduced (fuel_cost_fixture_test.go, written before FuelCostTons/
// DiscardRefundTons existed, and never re-wired against them once they
// landed) against the REAL production functions, plus direct unit coverage
// of EstimatedRangeTons and the small numeric-coercion helpers. It
// deliberately does NOT cover candidateHosts/reachableAtFloor (the two
// unexported *Service methods also in fuel.go) — those need a full
// system.BodyTable/gateSource/space fixture rig matching fleet-movement's
// own established test conventions, which is a fleet-movement chain-link
// SDET task, not this session's add-fuel-as-cargo/fuel-purchase one; flagged
// here rather than silently left uncovered.

import (
	"math"
	"testing"

	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/space"
)

// --- FuelCostTons: wires fixtures/fleet/cases.json's "fuelCost" family -----

func TestFuelCostTons_Scenario_MatchesTheGoldenFixture(t *testing.T) {
	fx := loadFuelFixture(t)
	if len(fx.FuelCost) == 0 {
		t.Fatal("fixtures/fleet/cases.json's \"fuelCost\" array is empty — this check would be vacuous")
	}
	for _, c := range fx.FuelCost {
		t.Run(c.Name, func(t *testing.T) {
			b := &space.Burn{
				Accel:    c.Accel,
				DepartMs: 0,
				ArriveMs: common.WorldMillis(c.FlightSecond * 1000),
			}
			params := FuelParams{DeltaVPerTon: c.DeltaVPerTon}
			got := FuelCostTons(b, int(c.HullCount), params)
			if math.Abs(got-c.CostTons) > 1e-9 {
				t.Errorf("FuelCostTons(...) = %v, want %v (fixture %q)", got, c.CostTons, c.Name)
			}
		})
	}
}

// TestFuelCostTons_Scenario_CostScalesLinearlyWithHullCountNeverLoadedMass
// pins fleet-movement's own requirement name directly: doubling hullCount
// with every other input held fixed must exactly double the cost, and
// FuelCostTons takes no mass/cargo parameter at all to have scaled by.
func TestFuelCostTons_Scenario_CostScalesLinearlyWithHullCountNeverLoadedMass(t *testing.T) {
	b := &space.Burn{Accel: 8, DepartMs: 0, ArriveMs: 10_000}
	params := FuelParams{DeltaVPerTon: 5}
	one := FuelCostTons(b, 1, params)
	ten := FuelCostTons(b, 10, params)
	if math.Abs(ten-one*10) > 1e-9 {
		t.Errorf("cost at 10 hulls = %v, want exactly 10x cost at 1 hull (%v)", ten, one*10)
	}
}

// TestFuelCostTons_Scenario_MisconfiguredDeltaVPerTonYieldsZeroNotDivideByZero
// is an SDET-added guard: DeltaVPerTon <= 0 must degrade to zero cost rather
// than a division producing +Inf/NaN.
func TestFuelCostTons_Scenario_MisconfiguredDeltaVPerTonYieldsZeroNotDivideByZero(t *testing.T) {
	b := &space.Burn{Accel: 8, DepartMs: 0, ArriveMs: 10_000}
	for _, dv := range []float64{0, -1} {
		if got := FuelCostTons(b, 1, FuelParams{DeltaVPerTon: dv}); got != 0 {
			t.Errorf("DeltaVPerTon=%v: FuelCostTons = %v, want 0", dv, got)
		}
	}
}

// --- DiscardRefundTons: wires the "discardRefund" fixture family ----------

func TestDiscardRefundTons_Scenario_MatchesTheGoldenFixture(t *testing.T) {
	fx := loadFuelFixture(t)
	if len(fx.DiscardRefund) == 0 {
		t.Fatal("fixtures/fleet/cases.json's \"discardRefund\" array is empty — this check would be vacuous")
	}
	for _, c := range fx.DiscardRefund {
		t.Run(c.Name, func(t *testing.T) {
			departMs := common.WorldMillis(0)
			arriveMs := common.WorldMillis(c.FlightDurationMs)
			atMs := common.WorldMillis(c.TauMs)
			got := DiscardRefundTons(c.StoredCostTons, departMs, arriveMs, atMs)
			if math.Abs(got-c.RefundTons) > 1e-9 {
				t.Errorf("DiscardRefundTons(...) = %v, want %v (fixture %q)", got, c.RefundTons, c.Name)
			}
		})
	}
}

// TestDiscardRefundTons_Scenario_AtOrAfterArrivalNeverProducesANegativeRefund
// and TestDiscardRefundTons_Scenario_BeforeDepartureNeverOverRefunds are
// SDET-added boundary probes on the clamp DiscardRefundTons' own doc comment
// describes.
func TestDiscardRefundTons_Scenario_AtOrAfterArrivalNeverProducesANegativeRefund(t *testing.T) {
	// atMs past arriveMs: tau would exceed duration without the clamp.
	got := DiscardRefundTons(16, 0, 10_000, 15_000)
	if got != 0 {
		t.Errorf("discard requested after arrival = %v, want exactly 0 (fully spent, not negative)", got)
	}
}

func TestDiscardRefundTons_Scenario_BeforeDepartureNeverOverRefunds(t *testing.T) {
	// atMs before departMs: tau would go negative without the clamp.
	got := DiscardRefundTons(16, 1_000, 11_000, 0)
	if math.Abs(got-16) > 1e-9 {
		t.Errorf("discard requested before departure = %v, want exactly the full stored cost (16), never over-refunded", got)
	}
}

func TestDiscardRefundTons_Scenario_ZeroOrNegativeDurationYieldsZero(t *testing.T) {
	if got := DiscardRefundTons(16, 5_000, 5_000, 5_000); got != 0 {
		t.Errorf("zero-duration burn: refund = %v, want 0", got)
	}
	if got := DiscardRefundTons(16, 5_000, 4_000, 4_500); got != 0 {
		t.Errorf("negative-duration (malformed) window: refund = %v, want 0, not a negative or divide-by-zero result", got)
	}
}

// --- EstimatedRangeTons ------------------------------------------------

// TestEstimatedRangeTons_Scenario_InvertsFuelCostAtTheAccelerationFloor pins
// fleet-movement "Fleet Read Reports an Estimated Maximum Range From
// Current Fuel": EstimatedRangeTons and FuelCostTons must round-trip at
// disclosure.MinCommandedAccel — the range this reports, fed back through
// FuelCostTons at the SAME floor acceleration, must reproduce (within
// floating-point tolerance) the fuel spent.
func TestEstimatedRangeTons_Scenario_InvertsFuelCostAtTheAccelerationFloor(t *testing.T) {
	params := FuelParams{DeltaVPerTon: 5}
	hullCount := 3
	fuelTons := 40.0

	deltaV := fuelTons * params.DeltaVPerTon / float64(hullCount)
	wantLength := (deltaV * deltaV) / (4 * disclosure.MinCommandedAccel)

	got := EstimatedRangeTons(fuelTons, hullCount, params)
	if math.Abs(got-wantLength) > 1e-9 {
		t.Errorf("EstimatedRangeTons(...) = %v, want %v", got, wantLength)
	}

	// Round-trip: a brachistochrone burn of exactly this length, at exactly
	// the floor acceleration, must cost back close to fuelTons (space.
	// FlightSeconds is the same brachistochrone formula EstimatedRangeTons
	// inverts). The tolerance is loose (1e-3, not 1e-9) because ArriveMs
	// quantizes flight time to whole milliseconds (space-kinematics' own
	// integer-world-millisecond rule) — a real, spec-mandated rounding step
	// this test must accommodate, not an arithmetic error to chase to zero.
	flightSeconds := space.FlightSeconds(got, disclosure.MinCommandedAccel)
	b := &space.Burn{Accel: disclosure.MinCommandedAccel, DepartMs: 0, ArriveMs: common.WorldMillis(flightSeconds * 1000)}
	roundTripCost := FuelCostTons(b, hullCount, params)
	if math.Abs(roundTripCost-fuelTons) > 1e-3 {
		t.Errorf("round-tripped fuel cost at the estimated range = %v, want close to %v", roundTripCost, fuelTons)
	}
}

// TestEstimatedRangeTons_Scenario_DegenerateInputsYieldExactlyZero pins the
// three named degenerate cases in EstimatedRangeTons' own doc comment.
func TestEstimatedRangeTons_Scenario_DegenerateInputsYieldExactlyZero(t *testing.T) {
	cases := map[string]struct {
		fuelTons     float64
		hullCount    int
		deltaVPerTon float64
	}{
		"zero fuel":                  {0, 3, 5},
		"negative fuel":              {-5, 3, 5},
		"zero hulls":                 {40, 0, 5},
		"misconfigured DeltaVPerTon": {40, 3, 0},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			got := EstimatedRangeTons(c.fuelTons, c.hullCount, FuelParams{DeltaVPerTon: c.deltaVPerTon})
			if got != 0 {
				t.Errorf("%s: EstimatedRangeTons(...) = %v, want exactly 0", name, got)
			}
		})
	}
}

// --- readCargoFuel / asFloat64 / asWorldMillis: the raw-transaction coercion

// TestAsFloat64_Scenario_CoercesEveryFirestoreNumericShape pins the whole
// reason this helper exists: a Firestore transaction's raw snapshot.Data()
// decodes a stored number as float64 OR int64 depending on how it was
// originally written, and both must coerce identically.
func TestAsFloat64_Scenario_CoercesEveryFirestoreNumericShape(t *testing.T) {
	cases := map[string]struct {
		in   interface{}
		want float64
	}{
		"float64":      {float64(12.5), 12.5},
		"int64":        {int64(7), 7},
		"int":          {int(3), 3},
		"absent (nil)": {nil, 0},
		"non-numeric":  {"not a number", 0},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			if got := asFloat64(c.in); got != c.want {
				t.Errorf("asFloat64(%v) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

func TestAsWorldMillis_Scenario_CoercesToWorldMillis(t *testing.T) {
	if got := asWorldMillis(float64(21_000)); got != common.WorldMillis(21_000) {
		t.Errorf("asWorldMillis(21000.0) = %v, want 21000", got)
	}
	if got := asWorldMillis(int64(21_000)); got != common.WorldMillis(21_000) {
		t.Errorf("asWorldMillis(int64(21000)) = %v, want 21000", got)
	}
	if got := asWorldMillis(nil); got != 0 {
		t.Errorf("asWorldMillis(nil) = %v, want 0", got)
	}
}

func TestReadCargoFuel_Scenario_ReadsTheFuelEntryOffARawTransactionSnapshot(t *testing.T) {
	actorData := map[string]interface{}{
		"cargo": map[string]interface{}{"fuel": float64(85.5), "metals": float64(10)},
	}
	if got := readCargoFuel(actorData); got != 85.5 {
		t.Errorf("readCargoFuel(...) = %v, want 85.5", got)
	}
}

func TestReadCargoFuel_Scenario_AbsentCargoOrFuelReadsAsZero(t *testing.T) {
	if got := readCargoFuel(map[string]interface{}{}); got != 0 {
		t.Errorf("readCargoFuel({}) = %v, want 0", got)
	}
	if got := readCargoFuel(map[string]interface{}{"cargo": map[string]interface{}{"metals": float64(10)}}); got != 0 {
		t.Errorf("readCargoFuel with no fuel entry = %v, want 0", got)
	}
}
