package fleet

// The fleet-side consumer of /fixtures/space/cases.json's
// `stationkeepDryInstant` family (add-stationkeep-hold-verb task 1.5).
//
// WHY THIS FILE EXISTS. A fixture family nothing reads is this chain's
// signature defect — a derivation built, recorded, and reached by nothing.
// The family is RECORDED in backend/space's fixture generator, from a
// literal transcription of fleet-movement's own formula, and CONSUMED here,
// against this package's production `dryInstantFor` and `upkeepTons`. The two
// expressions are written independently, so a divide/multiply inversion or a
// dropped reserve subtraction in production fails this test rather than
// quietly agreeing with itself.
//
// Traces to fleet-movement "Station-Keeping Upkeep Is Settled at Discrete
// Events, Never Folded Into the Stored Cargo Pool" — the dry instant as the
// ceiling-quantized inverse of space.StationKeepUpkeep, against
// `(fuelAtHoldStart − FuelParams.StationKeepReserveTons) ×
// FuelParams.DeltaVPerTon`.

import (
	"encoding/json"
	"math"
	"math/rand"
	"os"
	"strconv"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

const spaceFixturesPath = "../../fixtures/space/cases.json"

// stationkeepDryInstantFixture mirrors the recorded shape. Inputs are plain
// JSON numbers; every recorded OUTPUT is strconv.FormatFloat(v, 'b', -1, 64),
// the same serialization the whole file uses — compared as strings, never
// parsed back, exactly as backend/space's own golden test compares them.
type stationkeepDryInstantFixture struct {
	Note                    string  `json:"note"`
	HoldStartMs             int64   `json:"holdStartMs"`
	FuelTons                float64 `json:"fuelTons"`
	StationKeepReserveTons  float64 `json:"stationKeepReserveTons"`
	DeltaVPerTon            float64 `json:"deltaVPerTon"`
	UpkeepRate              float64 `json:"upkeepRate"`
	DryInstantMs            int64   `json:"dryInstantMs"`
	SpendableTons           string  `json:"spendableTons"`
	AccrualAtDryInstantTons string  `json:"accrualAtDryInstantTons"`
	OneMsOfUpkeepTons       string  `json:"oneMillisecondOfUpkeepTons"`
}

func loadStationkeepDryInstantFixtures(t *testing.T) []stationkeepDryInstantFixture {
	t.Helper()
	raw, err := os.ReadFile(spaceFixturesPath)
	if err != nil {
		t.Fatalf("reading %s: %v", spaceFixturesPath, err)
	}
	var file struct {
		Cases []stationkeepDryInstantFixture `json:"stationkeepDryInstant"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("decoding %s: %v", spaceFixturesPath, err)
	}
	if len(file.Cases) == 0 {
		t.Fatalf("%s carries no `stationkeepDryInstant` family — the fixture this test consumes is the "+
			"cross-check on the dry instant's two conversions, and an empty family asserts nothing",
			spaceFixturesPath)
	}
	return file.Cases
}

func fmtb(v float64) string { return strconv.FormatFloat(v, 'b', -1, 64) }

// Scenario: the dry instant is the ceiling-quantized inverse of
// space.StationKeepUpkeep, computed against the spendable budget above the
// reserve.
func TestDryInstantFor_MatchesTheRecordedGoldenFixture(t *testing.T) {
	cases := loadStationkeepDryInstantFixtures(t)

	sawDeltaVPerTonAboveOne, sawNonZeroReserve := false, false
	for _, c := range cases {
		if c.DeltaVPerTon != 1 {
			sawDeltaVPerTonAboveOne = true
		}
		if c.StationKeepReserveTons != 0 {
			sawNonZeroReserve = true
		}
		t.Run(c.Note, func(t *testing.T) {
			params := FuelParams{DeltaVPerTon: c.DeltaVPerTon, StationKeepReserveTons: c.StationKeepReserveTons}
			holdStart := common.WorldMillis(c.HoldStartMs)

			got := dryInstantFor(holdStart, c.FuelTons, c.UpkeepRate, params)
			if int64(got) != c.DryInstantMs {
				t.Errorf("fleet-movement \"Station-Keeping Upkeep Is Settled at Discrete Events...\": "+
					"dryInstantFor(holdStart=%d, fuel=%v, rate=%v, reserve=%v, deltaVPerTon=%v) = %d "+
					"(offset %d ms), want the recorded %d (offset %d ms).\n"+
					"  A factor of %v means the DeltaVPerTon conversion was inverted — it is Δv PER TON, so "+
					"the budget side MULTIPLIES;\n"+
					"  a factor of 1000 means space.StationKeepUpkeep's own ms→s conversion was restated at "+
					"the call site;\n"+
					"  an offset longer by the reserve's own endurance means the reserve was not subtracted "+
					"from the spendable budget.",
					c.HoldStartMs, c.FuelTons, c.UpkeepRate, c.StationKeepReserveTons, c.DeltaVPerTon,
					int64(got), int64(got)-c.HoldStartMs, c.DryInstantMs, c.DryInstantMs-c.HoldStartMs,
					c.DeltaVPerTon*c.DeltaVPerTon)
			}

			// SDET RE-DERIVATION (2026-09-02). The three artifacts above —
			// this fixture, the helper it grew from, and production's own
			// `dryInstantFor` — all encoded ONE transcribed closed form,
			// `ceil((spendable/rate)*1000)`, and asserted integer equality
			// against each other. Agreement among three copies of one
			// inference is not evidence. The requirement states no closed
			// form: it states an INVERSE OF A NAMED FUNCTION, and that
			// inverse is a unique integer computable without knowing the
			// function's internals. Asserted here as the requirement states
			// it, so the association order stops being load-bearing.
			spendableDeltaV := (c.FuelTons - c.StationKeepReserveTons) * c.DeltaVPerTon
			atDry := space.StationKeepUpkeep(c.UpkeepRate, holdStart, common.WorldMillis(c.DryInstantMs))
			if atDry < spendableDeltaV {
				t.Errorf("fleet-movement \"...the earliest world time T, quantized UP to an integer "+
					"millisecond, at which space.StationKeepUpkeep(rate, holdStart, T) reaches or exceeds "+
					"the hold's spendable Δv budget\": at the recorded dry instant %d the accrual is %v Δv, "+
					"SHORT of the spendable budget %v. The quantization went DOWN — \"quantized up, never "+
					"down, so a hold is never folded dry one millisecond before it is truly exhausted\".",
					c.DryInstantMs, atDry, spendableDeltaV)
			}
			if prev := common.WorldMillis(c.DryInstantMs - 1); prev > holdStart {
				if before := space.StationKeepUpkeep(c.UpkeepRate, holdStart, prev); before >= spendableDeltaV {
					t.Errorf("fleet-movement \"...the EARLIEST world time T...\": one millisecond before the "+
						"recorded dry instant (%d) the accrual is already %v Δv, at or past the spendable "+
						"budget %v — so %d is not the earliest such instant and the hold runs a millisecond "+
						"longer than the requirement allows.", prev, before, spendableDeltaV, c.DryInstantMs)
				}
			}
			// And production's own value satisfies that same predicate — the
			// check that is independent of any transcription, in either
			// direction, because wantDryInstant solves the predicate rather
			// than restating a formula.
			if want := wantDryInstant(holdStart, c.FuelTons, c.UpkeepRate, params); got != want {
				t.Errorf("dryInstantFor = %d, but the earliest instant whose accrual reaches the spendable "+
					"budget is %d (offsets %d vs %d ms). Production's closed form and the requirement's "+
					"inverse-of-a-named-function disagree here; the requirement is the authority.",
					int64(got), int64(want), int64(got)-c.HoldStartMs, int64(want)-c.HoldStartMs)
			}

			if want, gotStr := c.SpendableTons, fmtb(c.FuelTons-c.StationKeepReserveTons); gotStr != want {
				t.Errorf("recorded spendableTons = %s, recomputed %s — the fixture's own inputs no longer "+
					"reproduce its recorded budget", want, gotStr)
			}
			accrual := upkeepTons(c.UpkeepRate, holdStart, common.WorldMillis(c.DryInstantMs), params)
			if gotStr := fmtb(accrual); gotStr != c.AccrualAtDryInstantTons {
				t.Errorf("upkeepTons(rate=%v, holdStart=%d, dryInstant=%d) = %s, want the recorded %s — "+
					"upkeepTons must DELEGATE to space.StationKeepUpkeep (which already converts "+
					"milliseconds to seconds) and divide by DeltaVPerTon, restating neither conversion",
					c.UpkeepRate, c.HoldStartMs, c.DryInstantMs, gotStr, c.AccrualAtDryInstantTons)
			}

			// Task 3.8's bounded interval, evaluated against production's own
			// arithmetic: at the stored dry instant the accrual is AT LEAST
			// the spendable budget and STRICTLY LESS than that budget plus one
			// millisecond's upkeep. The interval is exactly one millisecond
			// wide because the quantization is a ceiling, so an equality
			// assertion is unsatisfiable in general while this bound is both
			// correct and tight.
			spendable := c.FuelTons - c.StationKeepReserveTons
			oneMs := (c.UpkeepRate * 0.001) / c.DeltaVPerTon
			if accrual < spendable {
				t.Errorf("the accrual at the stored dry instant is %v tons, want AT LEAST the spendable "+
					"budget %v — quantizing DOWN folds a hold dry before it is truly exhausted",
					accrual, spendable)
			}
			if accrual >= spendable+oneMs {
				t.Errorf("the accrual at the stored dry instant is %v tons, want strictly less than %v (the "+
					"spendable budget %v plus one millisecond's upkeep %v)", accrual, spendable+oneMs, spendable, oneMs)
			}
			if gotStr := fmtb(oneMs); gotStr != c.OneMsOfUpkeepTons {
				t.Errorf("recomputed one-millisecond upkeep %s, want the recorded %s", gotStr, c.OneMsOfUpkeepTons)
			}

			// The recorded dry instant must be a value this capability's own
			// codec accepts: strictly after the hold start, so the park it is
			// stored on can be read back at all.
			if c.DryInstantMs <= c.HoldStartMs {
				t.Fatalf("the recorded dry instant %d is not strictly after the hold start %d — a park "+
					"carrying it fails to decode outright and bricks the fleet", c.DryInstantMs, c.HoldStartMs)
			}
			p := space.Park{Kind: space.ParkStationkeep, BodyId: "planet1",
				HoldStartMs: holdStart, DryInstantMs: got}
			if _, err := space.DecodePark(space.EncodePark(p)); err != nil {
				t.Errorf("the park this dry instant would be stored on does not round-trip: %v", err)
			}
		})
	}

	if !sawDeltaVPerTonAboveOne {
		t.Error("task 1.5: no recorded case carries a DeltaVPerTon other than 1, so a divide/multiply " +
			"inversion of that conversion would pass this fixture unnoticed")
	}
	if !sawNonZeroReserve {
		t.Error("task 1.5: no recorded case carries a non-zero StationKeepReserveTons, so a dropped reserve " +
			"subtraction would pass this fixture unnoticed")
	}
}

// SDET-ADDED (beyond the literal scenarios; task 1.5's fixture family records
// six points, and six points cannot distinguish a closed form from the
// requirement's inverse).
//
// Scenario: the dry instant is the ceiling-quantized inverse of
// space.StationKeepUpkeep — asserted as a PROPERTY of production's
// `dryInstantFor` across the whole reachable parameter domain, not at six
// recorded points.
//
// WHY THIS EXISTS. Production computes `ceil((spendable/rate) * 1000)`. The
// requirement states the inverse of a named function, not that expression.
// The two agree everywhere a fleet can actually reach: an independent sweep
// found the first disagreement only at hold windows past ~1e12 ms (tens of
// thousands of years), which needs a fuel load around 1e10 tons. Both
// candidate associations — `ceil((s/r)*1000)` and `ceil(1000*s/r)` — diverge
// from the requirement there, the second more often and, unlike the first,
// in the direction the requirement explicitly forbids (folding dry one
// millisecond EARLY). This test pins the requirement across the reachable
// domain so the choice of association can never quietly become load-bearing.
//
// Deterministic: a fixed-seed sweep plus hand-picked edges. No wall clock, no
// randomness that varies between runs.
func TestDryInstantFor_SatisfiesTheSpecPredicateAcrossTheReachableDomain(t *testing.T) {
	rnd := rand.New(rand.NewSource(20260902))
	def := DefaultFuelParams()

	type probe struct {
		holdStart              int64
		fuelTons, rate         float64
		reserveTons, deltaVPer float64
	}
	probes := []probe{
		// The configured tuning, at the configured upkeep floor and at a
		// fast-orbiting host — the two ends of StationKeepRate's own range.
		{1, def.StationKeepReserveTons + 1e-9, space.StationKeepFloor, def.StationKeepReserveTons, def.DeltaVPerTon},
		{1, def.StationKeepReserveTons + 1e-9, 1e4, def.StationKeepReserveTons, def.DeltaVPerTon},
		{1_000_000, def.StationKeepReserveTons + 100_000, space.StationKeepFloor, def.StationKeepReserveTons, def.DeltaVPerTon},
		{1_000_000, def.StationKeepReserveTons + 100_000, 1e4, def.StationKeepReserveTons, def.DeltaVPerTon},
		// A zero reserve, which the fixture family also records: the whole
		// load is spendable.
		{7, 1e5, space.StationKeepFloor, 0, def.DeltaVPerTon},
	}
	for i := 0; i < 20_000; i++ {
		probes = append(probes, probe{
			holdStart: 1 + rnd.Int63n(1_000_000_000),
			// Fuel spans a fleet's whole plausible range, from a hair above
			// the reserve to five orders of magnitude past it.
			fuelTons: def.StationKeepReserveTons + math.Exp(rnd.Float64()*math.Log(1e6))*1e-3,
			// Rate spans StationKeepRate's own output range: its configured
			// floor up through a very tight, fast host body.
			rate:        space.StationKeepFloor * math.Exp(rnd.Float64()*math.Log(1e6)),
			reserveTons: def.StationKeepReserveTons,
			deltaVPer:   def.DeltaVPerTon,
		})
	}

	for _, pr := range probes {
		params := FuelParams{DeltaVPerTon: pr.deltaVPer, StationKeepReserveTons: pr.reserveTons}
		holdStart := common.WorldMillis(pr.holdStart)
		spendableDeltaV := (pr.fuelTons - pr.reserveTons) * pr.deltaVPer
		if !(spendableDeltaV > 0) {
			continue
		}
		got := dryInstantFor(holdStart, pr.fuelTons, pr.rate, params)

		// "SHALL be rejected ... whenever this computation yields a
		// dryInstant that is not strictly after holdStart" — so for a
		// strictly positive spendable budget the value must be storable.
		if !(got > holdStart) {
			t.Fatalf("dryInstantFor(holdStart=%d, fuel=%v, rate=%v, reserve=%v, deltaVPerTon=%v) = %d, "+
				"which is not strictly after the hold start — a park carrying it fails to decode outright",
				pr.holdStart, pr.fuelTons, pr.rate, pr.reserveTons, pr.deltaVPer, int64(got))
		}
		if atDry := space.StationKeepUpkeep(pr.rate, holdStart, got); atDry < spendableDeltaV {
			t.Fatalf("QUANTIZED DOWN: dryInstantFor(holdStart=%d, fuel=%v, rate=%v, reserve=%v, "+
				"deltaVPerTon=%v) = %d, whose accrual %v Δv is SHORT of the spendable budget %v. "+
				"\"quantized up, never down ... so a hold is never folded dry one millisecond before it is "+
				"truly exhausted.\"",
				pr.holdStart, pr.fuelTons, pr.rate, pr.reserveTons, pr.deltaVPer, int64(got),
				atDry, spendableDeltaV)
		}
		if prev := got - 1; prev > holdStart {
			if before := space.StationKeepUpkeep(pr.rate, holdStart, prev); before >= spendableDeltaV {
				t.Fatalf("NOT THE EARLIEST: dryInstantFor(holdStart=%d, fuel=%v, rate=%v, reserve=%v, "+
					"deltaVPerTon=%v) = %d, but one millisecond earlier (%d) the accrual %v Δv already "+
					"reaches the spendable budget %v. The requirement is \"the EARLIEST world time T ... at "+
					"which space.StationKeepUpkeep(rate, holdStart, T) reaches or exceeds\" it.",
					pr.holdStart, pr.fuelTons, pr.rate, pr.reserveTons, pr.deltaVPer, int64(got),
					int64(prev), before, spendableDeltaV)
			}
		}
	}
}
