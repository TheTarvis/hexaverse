package space

import (
	"math"
	"testing"

	"hexaverse/common"
)

// space-kinematics: "A Committed Burn's Geometry Is Fixed at Commit and
// Evaluated Closed-Form", "Flight Time Is the Brachistochrone of the
// Curve's Arc Length" (the closed-form-value half; the curve-vs-chord and
// minimum-arc-length halves need SolveBurn and live in solve_test.go),
// "Burn Timing Quantizes to Integer World-Milliseconds by Ceiling", "Burn
// Speed Follows an Accelerate-Flip-Decelerate Profile", "Position Along the
// Curve Follows Arc Length, Not the Curve Parameter", and "A Burn's Delta-V
// Price Equals Commanded Acceleration Times Flight Time".
//
// Every Burn in this file is hand-constructed (every field is public per
// the assumed contract in helpers_test.go) rather than produced by
// SolveBurn — Position/Tangent/Speed/Progress/DeltaV are specified as
// generic evaluators of whatever is stored on the burn (design.md: "derive
// the ship's position, tangent, and speed at any time from those stored
// fields and that time alone"), so they are testable independently of the
// solve that would normally produce a self-consistent set of fields.
//
// This file adds one more function to the assumed contract, because
// Requirement "Flight Time Is the Brachistochrone..." states its own
// acceptance criterion as evaluating a standalone closed-form function, not
// a burn:
//
//	func FlightSeconds(curveLength, accel float64) float64 // 2*sqrt(curveLength/accel)
//
// and Requirement "Burn Timing Quantizes..." likewise names the
// ceiling-quantization rule as its own testable unit, independent of the
// (geometry-dependent, therefore hard-to-pin-exactly) full SolveBurn
// pipeline:
//
//	func QuantizeArrival(departMs common.WorldMillis, flightSeconds float64) common.WorldMillis // departMs + ceil(flightSeconds*1000)

// sampleBurn's Accel/duration pair must satisfy the brachistochrone relation
// this very file's own FlightSeconds documents (T = 2*sqrt(L/a)) — a
// hand-built fixture that picks Accel, duration, and Length independently is
// internally inconsistent (adjudicated test defect: the original fixture
// paired Accel=5 with an 8s duration against a curve whose actual length
// requires T=9.5314s, so the two scenarios below could never hold). Fixing
// the half-duration at a power of two (4s) makes every step of the
// derivation below an exact power-of-two multiply/divide in float64 (no
// rounding), so the brachistochrone identity — and therefore the
// arc-length-at-half-duration identity
// TestBurn_Scenario_HalfDurationIsHalfArcLengthNotHalfParameter pins — holds
// bit-exactly, not just approximately within a tolerance:
//
//	half = 4s, accel = length/half^2 = length/16
//	FlightSeconds(length, accel) == 2*sqrt(length/(length/16)) == 2*sqrt(16) == 8s exactly
//
// so the resulting 8-second window needs no ceiling quantization at all
// (departMs/arriveMs land on an exact integer millisecond boundary either
// way).
func sampleBurn() Burn {
	c := asymmetricCurve()
	length := c.Length()
	const halfSeconds = 4.0
	accel := length / (halfSeconds * halfSeconds)
	const departMs common.WorldMillis = 1_000
	const arriveMs common.WorldMillis = departMs + common.WorldMillis(2*halfSeconds*1000) // 8 seconds of flight, == 2*halfSeconds
	return Burn{
		Origin:    c.P0,
		Target:    Target{Point: &c.P5},
		Intercept: c.P5,
		Curve:     c,
		Length:    length,
		DepartMs:  departMs,
		ArriveMs:  arriveMs,
		Accel:     accel,
	}
}

// Scenario: Position at depart is exactly the origin.
func TestBurn_Scenario_PositionAtDepartIsOrigin(t *testing.T) {
	b := sampleBurn()
	if got := b.Position(b.DepartMs); got != b.Origin {
		t.Errorf("Position(depart) = %v, want origin %v", got, b.Origin)
	}
}

// Scenario: Position at arrive is exactly the intercept.
func TestBurn_Scenario_PositionAtArriveIsIntercept(t *testing.T) {
	b := sampleBurn()
	if got := b.Position(b.ArriveMs); got != b.Intercept {
		t.Errorf("Position(arrive) = %v, want intercept %v", got, b.Intercept)
	}
}

// Scenario: A time before depart clamps to the origin, never extrapolating.
func TestBurn_Scenario_BeforeDepartClampsToOrigin(t *testing.T) {
	b := sampleBurn()
	for _, before := range []common.WorldMillis{b.DepartMs - 1, b.DepartMs - 500, 0} {
		if got := b.Position(before); got != b.Origin {
			t.Errorf("Position(t=%d, before depart) = %v, want origin %v", before, got, b.Origin)
		}
	}
}

// Scenario: A time after arrive clamps to the intercept at zero speed.
func TestBurn_Scenario_AfterArriveClampsToInterceptAtZeroSpeed(t *testing.T) {
	b := sampleBurn()
	for _, after := range []common.WorldMillis{b.ArriveMs + 1, b.ArriveMs + 500, b.ArriveMs + 1_000_000} {
		if got := b.Position(after); got != b.Intercept {
			t.Errorf("Position(t=%d, after arrive) = %v, want intercept %v", after, got, b.Intercept)
		}
		if speed := b.Speed(after); speed != 0 {
			t.Errorf("Speed(t=%d, after arrive) = %v, want 0", after, speed)
		}
	}
}

// Scenario: The same burn evaluated twice at the same time is identical.
func TestBurn_Scenario_EvaluatedTwiceIsIdentical(t *testing.T) {
	b := sampleBurn()
	mid := (b.DepartMs + b.ArriveMs) / 2
	if a, c := b.Position(mid), b.Position(mid); a != c {
		t.Fatalf("Position not pure: %v then %v", a, c)
	}
}

// Scenario: Flight time matches the closed-form brachistochrone value.
func TestFlightSeconds_Scenario_MatchesBrachistochroneValue(t *testing.T) {
	got := FlightSeconds(200, 8)
	if got != 10 {
		t.Fatalf("FlightSeconds(200, 8) = %v, want exactly 10", got)
	}
}

// Scenario: A fractional flight time quantizes upward, never downward.
func TestQuantizeArrival_Scenario_FractionalQuantizesUpward(t *testing.T) {
	const departMs common.WorldMillis = 5_000
	got := QuantizeArrival(departMs, 1.4001)
	want := departMs + 1_401
	if got != want {
		t.Fatalf("QuantizeArrival(%d, 1.4001) = %d, want %d (ceil, not floor/round)", departMs, got, want)
	}
	if wrong := departMs + 1_400; got == wrong {
		t.Fatalf("QuantizeArrival rounded down to %d instead of up", wrong)
	}
}

// Scenario: An exact millisecond flight time is not over-rounded.
func TestQuantizeArrival_Scenario_ExactMillisecondNotOverRounded(t *testing.T) {
	const departMs common.WorldMillis = 5_000
	// 2.5s is exactly representable in float64 and *1000 = 2500.0 exactly,
	// so this case cannot be confused with floating-point representation
	// slop the way e.g. 1.4 could be.
	got := QuantizeArrival(departMs, 2.5)
	want := departMs + 2_500
	if got != want {
		t.Fatalf("QuantizeArrival(%d, 2.5) = %d, want exactly %d, not one millisecond later", departMs, got, want)
	}
}

// Scenario: Speed peaks at the arc-length midpoint.
func TestBurn_Scenario_SpeedPeaksAtMidpoint(t *testing.T) {
	b := sampleBurn()
	mid := (b.DepartMs + b.ArriveMs) / 2
	atMid := b.Speed(mid)
	before := b.Speed(mid - 1)
	after := b.Speed(mid + 1)
	if !(atMid > before) {
		t.Errorf("Speed(mid)=%v not greater than Speed(mid-1)=%v", atMid, before)
	}
	if !(atMid > after) {
		t.Errorf("Speed(mid)=%v not greater than Speed(mid+1)=%v", atMid, after)
	}
}

// Scenario: The flip indicator flags the first half of the burn only.
func TestBurn_Scenario_BeforeFlipFlagsFirstHalfOnly(t *testing.T) {
	b := sampleBurn()
	mid := (b.DepartMs + b.ArriveMs) / 2
	if !b.BeforeFlip(mid - 1) {
		t.Errorf("BeforeFlip(mid-1) = false, want true")
	}
	if b.BeforeFlip(mid + 1) {
		t.Errorf("BeforeFlip(mid+1) = true, want false")
	}
}

// Scenario: Speed is zero at both ends of the burn.
func TestBurn_Scenario_SpeedIsZeroAtBothEnds(t *testing.T) {
	b := sampleBurn()
	if s := b.Speed(b.DepartMs); s != 0 {
		t.Errorf("Speed(depart) = %v, want 0", s)
	}
	if s := b.Speed(b.ArriveMs); s != 0 {
		t.Errorf("Speed(arrive) = %v, want 0", s)
	}
}

// Scenario: Half the flight duration places the ship at half the arc
// length — and that is NOT the curve evaluated at parameter 0.5, for a
// curve whose control points make those two points differ (asymmetricCurve
// is built specifically to make them differ).
func TestBurn_Scenario_HalfDurationIsHalfArcLengthNotHalfParameter(t *testing.T) {
	b := sampleBurn()
	mid := (b.DepartMs + b.ArriveMs) / 2

	// The arc-length-based point: ArcParam(0.5) maps the arc-length
	// fraction 0.5 to a curve parameter u, and Point(u) is what Position
	// must return.
	uAtHalfLength, _ := b.Curve.ArcParam(0.5)
	wantByArcLength := b.Curve.Point(uAtHalfLength)

	got := b.Position(mid)
	if got != wantByArcLength {
		t.Errorf("Position(mid) = %v, want the arc-length-half point %v", got, wantByArcLength)
	}

	paramHalf := b.Curve.Point(0.5)
	if got == paramHalf {
		t.Fatalf("test fixture is degenerate: the arc-length-half point coincides with Point(0.5) — "+
			"asymmetricCurve must produce distinct points, got %v for both", got)
	}
}

// Scenario: Distance travelled between two instants matches the integral of
// the reported speed, for a small d in the first half of the flight.
func TestBurn_Scenario_DistanceMatchesIntegralOfSpeed(t *testing.T) {
	b := sampleBurn()
	flightSeconds := float64(b.ArriveMs-b.DepartMs) / 1000
	half := flightSeconds / 2
	tau := half * 0.3 // comfortably in the first half
	const d = 0.001   // 1ms — "a small d"

	covered := func(tauSeconds float64) float64 {
		if tauSeconds <= half {
			return 0.5 * b.Accel * tauSeconds * tauSeconds
		}
		return b.Length - 0.5*b.Accel*(flightSeconds-tauSeconds)*(flightSeconds-tauSeconds)
	}
	wantArc := covered(tau+d) - covered(tau)

	t1 := b.DepartMs + common.WorldMillis(math.Round(tau*1000))
	t2 := b.DepartMs + common.WorldMillis(math.Round((tau+d)*1000))
	chordArc := dist(b.Position(t1), b.Position(t2))

	// SDET-chosen tolerance (not spec-pinned). 1ms is the FLOOR of "small
	// d" here (WorldMillis is integer-quantized), and at that floor d is
	// not small relative to Curve.ArcParam's own 64-segment table: within
	// whichever single segment brackets tau, ArcParam assumes arc length is
	// linear in curve parameter, which is only an approximation for a curve
	// whose speed (ds/du) genuinely varies across that segment —
	// asymmetricCurve is built to do exactly that (curve_test.go). That
	// per-segment linearization bias is measured (not guessed) to run up to
	// ~2.8% of wantArc at this fixture's 1ms floor across the whole first
	// half (verified by sampling every percent of tau across [0.05,0.49]*
	// half), and — unlike a true curvature-of-motion term — it does NOT
	// shrink below the millisecond floor, so 5% is the generous-but-honest
	// bound: comfortably above the table's own worst-case bias, while still
	// tight enough to fail a profile that is wrong by more than that (e.g.
	// a Speed()/Position() mismatch of a missing factor, a wrong half, or a
	// raw-parameter-instead-of-arc-length regression).
	if !almostEqual(chordArc, wantArc, math.Max(looseTolerance, 0.05*wantArc)) {
		t.Errorf("arc length between t=%.4fs and t=%.4fs = %v, want coveredLength delta %v", tau, tau+d, chordArc, wantArc)
	}
}

// Scenario: The arc length that prices the flight is the arc length that
// places the ship — the curve length stored on the burn is exactly the
// total arc length the 64-step table implies.
func TestBurn_Scenario_ArcLengthPricingMatchesArcLengthPlacement(t *testing.T) {
	b := sampleBurn()
	table := b.Curve.ArcTable()
	if b.Length != table[64] {
		t.Fatalf("Burn.Length = %v, want exactly the curve's 64-step arc table total %v", b.Length, table[64])
	}
}

// Scenario: Price equals acceleration times flight duration, strictly
// positive.
func TestBurn_Scenario_DeltaVEqualsAccelTimesFlightDuration(t *testing.T) {
	b := sampleBurn()
	got := b.DeltaV()
	want := b.Accel * (float64(b.ArriveMs-b.DepartMs) / 1000)
	if got != want {
		t.Fatalf("DeltaV() = %v, want accel*duration = %v", got, want)
	}
	if !(got > 0) {
		t.Fatalf("DeltaV() = %v, want strictly positive", got)
	}
}

// Scenario: A slower burn over the same path costs proportionally less —
// the exact numbers the spec pins: a curve of length 200 at accel 8 yields
// a 10,000ms flight and an 80-unit price; the same curve at accel 2 yields
// a 20,000ms flight and a 40-unit price.
func TestBurn_Scenario_SlowerBurnCostsProportionallyLess(t *testing.T) {
	const curveLength = 200.0
	const departMs common.WorldMillis = 0

	fast := Burn{Length: curveLength, Accel: 8, DepartMs: departMs, ArriveMs: QuantizeArrival(departMs, FlightSeconds(curveLength, 8))}
	slow := Burn{Length: curveLength, Accel: 2, DepartMs: departMs, ArriveMs: QuantizeArrival(departMs, FlightSeconds(curveLength, 2))}

	if fast.ArriveMs-fast.DepartMs != 10_000 {
		t.Errorf("fast burn duration = %dms, want 10000ms", fast.ArriveMs-fast.DepartMs)
	}
	if slow.ArriveMs-slow.DepartMs != 20_000 {
		t.Errorf("slow burn duration = %dms, want 20000ms", slow.ArriveMs-slow.DepartMs)
	}
	if fast.DeltaV() != 80 {
		t.Errorf("fast DeltaV() = %v, want 80", fast.DeltaV())
	}
	if slow.DeltaV() != 40 {
		t.Errorf("slow DeltaV() = %v, want 40", slow.DeltaV())
	}
	if slow.DeltaV() != fast.DeltaV()/2 {
		t.Errorf("slow burn (%v) is not exactly half the fast burn's price (%v)", slow.DeltaV(), fast.DeltaV())
	}
}
