package system

// RED-phase tests for openspec change add-orbital-system-bodies.
//
// This file covers the PURE element laws that do not require a full
// Generate() call: the continuous-radius geometric law (Decision 2), the
// Kepler period law's shape (Decision 3), the size tables (Decision 4), the
// moon-orbit band (Decision 16), and the inclination convention's
// structural bounds (Decisions 1, 17). Generate()-level scenarios
// (whole-interior behavior) live in generator_continuous_test.go.
//
// The Decision-14 cross-capability calibration invariants and the other
// PROOF-BACKING tests params_continuous.go's own doc comments name live in
// params_continuous_test.go instead (moved there 2026-08-28 to satisfy the
// repo's one-test-file-per-source-file coverage convention — no assertion
// changed): TestMoonOrbitLocalRadius_Scenario_BandCeilingBelowBaseOrbitRadius,
// TestCalibration_Scenario_*, TestInclinationConvention_Scenario_JitterBelowQuarterTurnBoundary,
// and TestStationFallbackRadius_Scenario_ClearsStarShellAndStaysInsideExtent.
// TestCalibration_Scenario_NoSkeletonRingExceedsExtentIndex — which proves
// params.go's own `galaxy.DefaultParams().MaxRings-1 <= Radius` invariant —
// moved to params_test.go instead.
//
// SDET-CHOSEN CONTRACT, recorded once here for every new symbol this test
// suite assumes, so a developer's differently-shaped implementation is a
// mechanical rename dispute, not a behavior dispute, EXCEPT where design.md
// pins the exact name/signature already (noted below) — those are not
// choices, they are read directly from the design text.
//
// Pinned verbatim by design.md (not SDET choices):
//   - const BaseOrbitRadius float64 = 24.0                        (Decision 2)
//   - const RadiusGrowth float64 = 1.23                           (Decision 2)
//   - var/const MinOrbitSpacing = RadiusGrowth                    (Decision 2 / system-interior spec)
//   - func ContinuousRadius(idx int) float64                      (Decision 2)
//   - const MoonOrbitMin float64 = 4.0                            (Decision 16)
//   - const MoonOrbitMax float64 = 8.0                            (Decision 16)
//   - func MoonOrbitLocalRadius(parent space.Body, u float64) float64 (tasks.md 3.4)
//   - func StarSize(class string) float64                         (Decision 4)
//   - func MaxFeatureSize(ft FeatureType) float64                 (Decision 4)
//   - const BeltWidthFraction float64 = 0.06                      (Decision 5)
//   - const AsteroidsPerBelt int = 8                              (Decision 5)
//   - const BeltMemberSizeMin float64 = 0.3, BeltMemberSizeMax = 0.9 (Decision 4/5)
//   - const GateSize float64 = 1.2                                (Decision 4/7)
//   - const GateRadiusFactor float64 = 1.1                        (Decision 7)
//   - const StationStandoff float64 = 1.5                         (Decision 6)
//   - func continuousSeed(systemSeed int64) int64                 (Decision 11)
//
// SDET-chosen (name/signature not pinned beyond a bare mention; a
// differently-shaped equivalent is a mechanical rename, not a dispute):
//   - func keplerPeriodMs(radius float64) common.WorldMillis — the star-parented
//     Kepler period law (Decision 3's fixture family is literally named
//     `keplerPeriodMs`, lower-case, so unexported is assumed).
//   - const MaxInclinationJitter space.SubTurns — the configured jitter ceiling
//     (Decision 1/17's band boundaries; must be < SubTurn/8 per system-interior).
//
// --- tasks.md 9.7 addendum (migrate-fleet-to-continuous-burns) -------------
//
// keplerPeriodMs is unguarded against a non-finite or negative radius:
// math.Sqrt of a negative ratio is NaN, the existing `if ms < 1` clamp does
// NOT catch NaN (every comparison against NaN is false), and NaN falls
// straight through int64(NaN) — WorldMillis(0) on arm64,
// WorldMillis(-9223372036854775808) on amd64. This is the third instance of
// the int64-of-NaN class in this chain (after fleet's commanded-acceleration
// guard and task 4.11's fixture coverage of it).
//
// SDET-chosen rejection form: PANIC, not a sentinel error. Signature stays
// `func keplerPeriodMs(radius float64) common.WorldMillis` — unchanged.
// Justification:
//   - Precedent already in this repo for "never a runtime condition
//     production code should recover from": board/table.go's tablePoints
//     panics on an out-of-family slot count, space/table.go's loadTurnTable
//     panics on a corrupted embedded table. Both are internal-invariant
//     guards on values that can only be wrong via programmer/data error,
//     never live user input — exactly this case.
//   - keplerPeriodMs's SOLE caller (continuousStarParented) only ever passes
//     ContinuousRadius(idx), a pure geometric progression
//     (BaseOrbitRadius * RadiusGrowth^idx) off named positive constants —
//     never a request body, never Firestore-read data. A NaN/negative
//     radius here is unreachable today and can only mean a corrupted
//     constant or a future caller violating the precondition — a
//     programmer error, not a value to propagate as a typed error.
//   - A sentinel-error signature change would ripple through
//     continuousStarParented's 5 call sites in generator.go and then
//     Generate() itself, which has NO error return anywhere in the entire
//     generation pipeline today — a systemic, invasive change disproportionate
//     to guarding a currently-dead path. tasks.md 9.7 explicitly scopes
//     itself as "the bounded point fix only", deferring the systemic
//     guarded-conversion fix (a shared helper or lint) to its own change.
//   - A panic fails loud and immediately, with identical (non-target-
//     dependent) behavior on both arm64 and amd64 — unlike the silent,
//     architecture-diverging WorldMillis(0)/WorldMillis(MinInt64) it
//     replaces.
//
// The guard is gated on the INPUT radius (NaN, ±Inf, or radius < 0) —
// deliberately NOT radius <= 0 — so radius == 0 keeps taking today's
// existing path (ratio=0, sqrt=0, seconds=0, ms=0, clamped to the existing
// `if ms < 1 { ms = 1 }` floor) with NO behavior change. Zero is pinned
// below as an unchanged-behavior case, not a rejected one.
//
// Per tasks.md 9.7's explicit instruction, the NaN/Inf/negative cases are
// NOT added to any fixtures/system golden family (a value that diverges
// across the build-target matrix cannot be byte-identical, which is exactly
// what pin-system-generation-determinism's rule forbids recording) — they
// are asserted here, in an ordinary unit test, instead.

import (
	"math"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
)

// --- Decision 2 / "Orbital Radii Ascend With the Skeleton Ordinal..." ------

// Scenario: Successive skeleton radii strictly ascend.
func TestContinuousRadius_Scenario_SuccessiveSkeletonRadiiStrictlyAscend(t *testing.T) {
	for idx := 0; idx < galaxy.DefaultParams().MaxRings-1; idx++ {
		a := ContinuousRadius(idx)
		b := ContinuousRadius(idx + 1)
		if !(b > a) {
			t.Fatalf("ContinuousRadius(%d)=%v is not strictly less than ContinuousRadius(%d)=%v", idx, a, idx+1, b)
		}
	}
}

// Scenario: Each successive radius meets the configured minimum spacing.
func TestContinuousRadius_Scenario_MinimumSpacingMultipleHeld(t *testing.T) {
	if MinOrbitSpacing != RadiusGrowth {
		t.Fatalf("MinOrbitSpacing = %v, want exactly RadiusGrowth (%v) — no larger multiple is assertable", MinOrbitSpacing, RadiusGrowth)
	}
	const eps = 1e-9
	for idx := 0; idx < galaxy.DefaultParams().MaxRings-1; idx++ {
		inner := ContinuousRadius(idx)
		outer := ContinuousRadius(idx + 1)
		if ratio := outer / inner; ratio < MinOrbitSpacing-eps {
			t.Fatalf("ordinal %d->%d: ratio %v < MinOrbitSpacing %v", idx, idx+1, ratio, MinOrbitSpacing)
		}
	}
}

// Scenario: A single-body system still receives a valid radius.
func TestContinuousRadius_Scenario_SingleBodyStillValid(t *testing.T) {
	r := ContinuousRadius(0)
	if !(r > 0) {
		t.Fatalf("ContinuousRadius(0) = %v, want strictly positive", r)
	}
}

// Scenario: Adjacent skeleton ordinals receive distinct continuous radii.
//
// This is THE collision regression test design.md calls the defect the
// original text would have introduced 12.1% of the time. The generator used
// to clamp a raw skeleton ordinal into a coarse placement index before
// placing the body, and that clamp mapped ordinals 0 and 1 onto the SAME
// index — so a continuous-radius law keyed on the clamped value would give
// two distinct skeleton bodies the same orbit. ContinuousRadius is keyed on
// the RAW ordinal, and the clamp is gone entirely, but the property the
// clamp made non-obvious is the one that must hold: adjacent ordinals,
// including the 0/1 pair that used to collide, are strictly separated.
func TestContinuousRadius_Scenario_RawRingCollisionRegression(t *testing.T) {
	r0 := ContinuousRadius(0)
	r1 := ContinuousRadius(1)
	if r0 == r1 {
		t.Fatalf("ContinuousRadius(0)=%v equals ContinuousRadius(1)=%v — the raw-ordinal collision regression is back: "+
			"two skeleton bodies at adjacent ordinals must receive strictly different continuous radii", r0, r1)
	}
	if !(r1 > r0) {
		t.Fatalf("ContinuousRadius(1)=%v is not strictly greater than ContinuousRadius(0)=%v", r1, r0)
	}
}

// Scenario: A detail feature may share a skeleton major's orbital index.
//
// ContinuousRadius is a pure function of the orbital index alone — it takes
// no family/feature-type parameter — so two features (a skeleton major and
// an independently-drawn detail feature) that land on the SAME orbital
// index are, by construction, bit-identical in radius. This is the
// strongest form of the assertion: it holds regardless of which two
// features share the index.
func TestContinuousRadius_Scenario_DetailFeatureMaySharesSkeletonIndex(t *testing.T) {
	const sharedIdx = 5
	skeletonMajorRadius := ContinuousRadius(sharedIdx)
	detailFeatureRadius := ContinuousRadius(sharedIdx)
	if skeletonMajorRadius != detailFeatureRadius {
		t.Fatalf("ContinuousRadius(%d) is not stable across calls: %v vs %v", sharedIdx, skeletonMajorRadius, detailFeatureRadius)
	}
}

// Scenario: The largest generated radius stays inside the codec's extent.
//
// "Stays inside the codec's extent" is tested by actually round-tripping the
// radius through the real codec (space.EncodeOrbit/DecodeOrbit) rather than
// against a copied-literal 1e12 — the codec's own extent constant is
// unexported, and design.md is explicit that copying it is exactly the
// hazard this change forbids everywhere else.
func TestContinuousRadius_Scenario_LargestRadiusStaysInsideCodecExtent(t *testing.T) {
	maxIdx := galaxy.DefaultParams().MaxRings - 1
	r := ContinuousRadius(maxIdx)
	o := space.Orbit{ParentId: "feat-star", Radius: r, PeriodMs: 1000}
	enc := space.EncodeOrbit(o)
	dec, err := space.DecodeOrbit(enc)
	if err != nil {
		t.Fatalf("the largest configured skeleton radius (%v, at index %d) failed to round-trip through the orbital-element codec: %v", r, maxIdx, err)
	}
	if dec.Radius != r {
		t.Fatalf("round-tripped radius = %v, want %v", dec.Radius, r)
	}
}

// --- Decision 3 / "A Body-Parented Orbit's Continuous Period..." ----------

// Scenario: A star-parented period never decreases for a larger radius.
func TestKeplerPeriodMs_Scenario_NeverDecreasesForLargerRadius(t *testing.T) {
	radii := []float64{1, 10, 24, 50, 100, 234, 500, 658.7, 2000}
	for i := 1; i < len(radii); i++ {
		p1 := keplerPeriodMs(radii[i-1])
		p2 := keplerPeriodMs(radii[i])
		if p2 < p1 {
			t.Fatalf("keplerPeriodMs(%v)=%v > keplerPeriodMs(%v)=%v — period decreased for a larger radius", radii[i-1], p1, radii[i], p2)
		}
	}
}

// Scenario: A star-parented period strictly increases across one growth step.
func TestKeplerPeriodMs_Scenario_StrictlyIncreasesAcrossGrowthStep(t *testing.T) {
	for _, r := range []float64{BaseOrbitRadius, 50, 100, 234} {
		p1 := keplerPeriodMs(r)
		p2 := keplerPeriodMs(r * RadiusGrowth)
		if !(p2 > p1) {
			t.Fatalf("keplerPeriodMs(%v)=%v is not strictly less than keplerPeriodMs(%v*RadiusGrowth)=%v", r, p1, r, p2)
		}
	}
}

// Scenario: The same radius always derives the identical period (for the
// star-parented Kepler law).
func TestKeplerPeriodMs_Scenario_SameRadiusDerivesIdenticalPeriod(t *testing.T) {
	r := 123.456
	if keplerPeriodMs(r) != keplerPeriodMs(r) {
		t.Fatalf("keplerPeriodMs(%v) is not deterministic across calls", r)
	}
}

// keplerPeriodMs must also satisfy the shared strict-positivity /
// minimum-1ms-clamp requirement (system-interior: "A Retrograde Orbit Is
// Expressed By Inclination..." — "every feature with a continuous orbit
// carries a strictly positive continuous period").
func TestKeplerPeriodMs_NeverNonPositive(t *testing.T) {
	for _, r := range []float64{0.001, 0.5, 1, BaseOrbitRadius} {
		if p := keplerPeriodMs(r); p <= 0 {
			t.Fatalf("keplerPeriodMs(%v) = %v, want strictly positive (minimum 1ms clamp)", r, p)
		}
	}
}

// tasks.md 9.7 (migrate-fleet-to-continuous-burns): a non-finite or negative
// radius must be rejected — safely, not by falling through to
// int64(NaN)/int64(-Inf), which is WorldMillis(0) on arm64 and
// WorldMillis(math.MinInt64) on amd64. SDET-chosen rejection form: panic
// (see the file-header addendum above for the full justification). callKepler
// converts a panic into a normal, per-case test failure signal rather than
// crashing the whole `go test` process.
func callKepler(radius float64) (result common.WorldMillis, panicked bool, panicVal any) {
	defer func() {
		if r := recover(); r != nil {
			panicked = true
			panicVal = r
		}
	}()
	result = keplerPeriodMs(radius)
	return
}

// Scenario: a non-finite or negative radius panics rather than silently
// producing a target-dependent WorldMillis (NaN, +Inf, -Inf, and an ordinary
// negative radius — the class that reaches math.Sqrt of a negative ratio).
func TestKeplerPeriodMs_Scenario_NonFiniteOrNegativeRadiusPanics(t *testing.T) {
	cases := []struct {
		name   string
		radius float64
	}{
		{"NaN", math.NaN()},
		{"PositiveInfinity", math.Inf(1)},
		{"NegativeInfinity", math.Inf(-1)},
		{"NegativeRadius", -1},
		{"SmallNegativeRadius", -0.001},
		{"LargeNegativeRadius", -1e9},
	}
	for _, tc := range cases {
		t.Run("Scenario: "+tc.name, func(t *testing.T) {
			result, panicked, _ := callKepler(tc.radius)
			if !panicked {
				t.Fatalf("keplerPeriodMs(%v) = %v, no panic — want a panic guarding against a non-finite or negative radius (would otherwise reach int64(NaN)/int64(-Inf): WorldMillis(0) on arm64, WorldMillis(math.MinInt64) on amd64)", tc.radius, result)
			}
		})
	}
}

// Scenario: a zero radius is UNCHANGED by the guard — it is neither
// non-finite nor negative, so it keeps taking today's existing path
// (ratio=0, sqrt=0, seconds=0, ms=0) through the pre-existing `if ms < 1`
// clamp to a strictly-positive 1ms floor. This pins that the guard's
// boundary is `radius < 0`, not `radius <= 0`.
func TestKeplerPeriodMs_Scenario_ZeroRadiusUnaffectedByGuard(t *testing.T) {
	result, panicked, panicVal := callKepler(0)
	if panicked {
		t.Fatalf("keplerPeriodMs(0) panicked (%v) — a zero radius is neither non-finite nor negative and must keep taking the existing 1ms-clamp path, not be rejected by the new guard", panicVal)
	}
	const want common.WorldMillis = 1 // captured from the unguarded implementation, tasks.md 9.7
	if result != want {
		t.Fatalf("keplerPeriodMs(0) = %v, want %v (the guard must not change this already-produced value)", result, want)
	}
}

// Scenario: the guard changes NOTHING about the value produced for any
// finite, non-negative radius. Every expected value below was captured by
// running the UNGUARDED implementation (git history: continuous.go as it
// stood before tasks.md 9.7) — keplerPeriodMs feeds persisted orbital
// periods, so a behavior change on this domain would alter every generated
// system. covers 0, sub-1, BaseOrbitRadius, KeplerBaseRadius itself, and
// several representative ContinuousRadius(idx) outputs.
func TestKeplerPeriodMs_Scenario_PositiveRadiusValueUnchangedByGuard(t *testing.T) {
	cases := []struct {
		radius float64
		want   common.WorldMillis
	}{
		{0, 1},
		{0.001, 1},
		{1, 159},
		{BaseOrbitRadius, 18591},   // 24
		{KeplerBaseRadius, 40000},  // 40
		{100, 158114},
		{234, 565971},
		{658.7, 2673016},
		{ContinuousRadius(3), 47192},
		{ContinuousRadius(10), 414824},
	}
	for _, tc := range cases {
		if got := keplerPeriodMs(tc.radius); got != tc.want {
			t.Errorf("keplerPeriodMs(%v) = %v, want %v (unchanged from the pre-guard implementation)", tc.radius, got, tc.want)
		}
	}
}

// The body-parented period law is the ALREADY-SHIPPED space.InsertionPeriod
// — no new law (Decision 3). Scenario: "A body-parented period follows the
// shipped insertion-period law" is exercised at the Generate()-level in
// generator_continuous_test.go (a real moon's period against
// space.InsertionPeriod(itsLocalRadius)); this is a structural sanity check
// that InsertionPeriod itself is monotone, which the moon derivation relies on.
func TestSpaceInsertionPeriod_MonotoneAssumptionHolds(t *testing.T) {
	if !(space.InsertionPeriod(20) >= space.InsertionPeriod(10)) {
		t.Fatalf("space.InsertionPeriod is not monotone non-decreasing — the shared moon/park law assumption this change leans on is false")
	}
}

// --- Decision 4 / "Feature Size Is Drawn From a Per-Type Band..." ---------

// Scenario: MaxFeatureSize is total over every emitted feature type, and
// every ceiling is strictly positive.
func TestMaxFeatureSize_Scenario_TotalAndStrictlyPositive(t *testing.T) {
	types := []FeatureType{
		FeatureGasGiant, FeatureIce, FeatureRocky, FeatureMoon,
		FeatureAnomaly, FeatureRuin,
		FeatureGravityWell, FeatureRadiation, FeatureNebula, FeatureDebris,
		FeatureBelt, FeatureStation,
	}
	for _, ft := range types {
		c := MaxFeatureSize(ft)
		if !(c > 0) {
			t.Errorf("MaxFeatureSize(%s) = %v, want strictly positive", ft, c)
		}
	}
}

// Scenario: Every drawn size falls inside its own type's band — the
// STATIC half: the pinned ceilings/bands match the literal spec numbers.
// The DYNAMIC half (an actual drawn size never exceeds its band) is
// exercised over a swept seed set in generator_continuous_test.go.
func TestMaxFeatureSize_Scenario_MatchesConfiguredCeilings(t *testing.T) {
	cases := []struct {
		ft      FeatureType
		ceiling float64
	}{
		{FeatureGasGiant, 4.2},
		{FeatureIce, 2.7},
		{FeatureRocky, 2.4},
		{FeatureMoon, 1.0},
		{FeatureAnomaly, 1.6},
		{FeatureRuin, 1.6},
		{FeatureGravityWell, 3.0},
		{FeatureRadiation, 3.0},
		{FeatureNebula, 3.0},
		{FeatureDebris, 3.0},
		{FeatureBelt, 0.9},
		{FeatureStation, 0.9},
	}
	for _, c := range cases {
		if got := MaxFeatureSize(c.ft); got != c.ceiling {
			t.Errorf("MaxFeatureSize(%s) = %v, want %v (design.md Decision 4's pinned table)", c.ft, got, c.ceiling)
		}
	}
}

// Scenario: The star's size is a pure function of its class.
func TestStarSize_Scenario_PureFunctionOfClass(t *testing.T) {
	cases := map[string]float64{
		"O": 7.6, "B": 7.0, "A": 6.6, "F": 6.2, "G": 6.0, "K": 5.6, "M": 5.2,
	}
	for class, want := range cases {
		if got := StarSize(class); got != want {
			t.Errorf("StarSize(%q) = %v, want %v", class, got, want)
		}
	}
	// Named default for an unrecognized class.
	if got := StarSize("unrecognized-class-xyz"); got != 6.0 {
		t.Errorf("StarSize(unrecognized) = %v, want the named default 6.0", got)
	}
	// Two calls, same class, different "seeds" conceptually (StarSize takes
	// no seed at all — the strongest form of "identical, drawn from no RNG
	// stream").
	if StarSize("G") != StarSize("G") {
		t.Fatal("StarSize is not deterministic across calls")
	}
}

// --- Decision 16 / "A Body-Parented Child's Local Radius Clears..." -------

// Scenario: Every moon clears its parent's size and insertion standoff.
func TestMoonOrbitLocalRadius_Scenario_ClearsParentSizeAndStandoff(t *testing.T) {
	if MoonOrbitMin >= MoonOrbitMax {
		t.Fatalf("MoonOrbitMin (%v) must be strictly less than MoonOrbitMax (%v)", MoonOrbitMin, MoonOrbitMax)
	}
	parent := space.Body{Id: "feat-body-0", Size: 3.4} // smallest gas giant
	clearance := parent.Size + space.InsertionStandoff(parent)
	for _, u := range []float64{0, 0.25, 0.5, 0.75, 0.999} {
		r := MoonOrbitLocalRadius(parent, u)
		if !(r > clearance) {
			t.Errorf("MoonOrbitLocalRadius(parent, %v) = %v, want strictly greater than parentSize+InsertionStandoff = %v", u, r, clearance)
		}
	}
}

// --- Decisions 1 & 17 / retrograde-via-inclination structural bounds ------

// Scenario: A retrograde feature sweeps against a prograde one at the same
// node.
//
// This is the pinned-table-wart-aware version of the assertion: it does
// NOT assert Y == 0 for the retrograde body (the table's sin(SubTurn/2) is
// ~1.2246e-16, not exact zero — design.md Decision 1's own quantified wart).
// It asserts the vertical component of cross(localOffset, localVelocity) is
// non-zero for BOTH bodies and opposite in sign, which is exact.
func TestInclinationConvention_Scenario_RetrogradeSweepsAgainstProgradeAtSameNode(t *testing.T) {
	const radius = 100.0
	const periodMs = common.WorldMillis(100_000)
	const node = space.SubTurns(12345)
	prograde := space.Orbit{Radius: radius, PeriodMs: periodMs, Inclination: 100, Node: node}
	retrograde := space.Orbit{Radius: radius, PeriodMs: periodMs, Inclination: space.SubTurn/2 - 100, Node: node}

	for _, phase := range []common.WorldMillis{0, 12_345, 50_000, 99_999} {
		pOff, pVel := prograde.LocalPosition(phase), prograde.LocalVelocity(phase)
		rOff, rVel := retrograde.LocalPosition(phase), retrograde.LocalVelocity(phase)

		pY := pOff.Cross(pVel).Y
		rY := rOff.Cross(rVel).Y

		if pY == 0 || rY == 0 {
			t.Fatalf("at t=%v: expected both cross-product Y components non-zero, got prograde=%v retrograde=%v", phase, pY, rY)
		}
		if (pY > 0) == (rY > 0) {
			t.Fatalf("at t=%v: expected opposite-signed cross-product Y components (reversed sweep), got prograde=%v retrograde=%v (same sign)", phase, pY, rY)
		}
		// Explicitly NOT asserting either offset's Y (out-of-plane component)
		// is exactly zero — the pinned table's wart forbids that assertion.
	}
}

// isProgradeInclination / isRetrogradeInclination mirror the band
// membership test the generator itself must satisfy — used by
// generator_continuous_test.go's swept-seed inclination-band scenario.
func isProgradeInclination(i space.SubTurns) bool {
	return i >= 0 && i <= MaxInclinationJitter
}

func isRetrogradeInclination(i space.SubTurns) bool {
	return i >= space.SubTurn/2-MaxInclinationJitter && i <= space.SubTurn/2
}

func TestInclinationBandHelpers_NeverBothOrNeitherForBoundaryValues(t *testing.T) {
	// Sanity-check the helpers themselves are internally consistent: nothing
	// strictly between the two bands should be classified as either.
	mid := space.SubTurn / 4
	if isProgradeInclination(mid) || isRetrogradeInclination(mid) {
		t.Fatalf("a quarter-turn inclination (%v) must fall in neither the prograde nor the retrograde band", mid)
	}
}
