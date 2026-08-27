package space

import (
	"math"
	"runtime"
	"strconv"
	"testing"
)

// vec_test.go closes the file-per-production-file test coverage gate
// (backend/space/vec.go) with direct unit coverage of Vec3's own
// primitives. Every other file in this package exercises these methods
// constantly, but no file asserts their behavior in isolation — this file
// is that direct coverage. SDET-added: space-kinematics does not name
// Vec3's own arithmetic in a `#### Scenario:` (it is the pure-computation
// building block every named scenario composes on top of), so every test
// here is a boundary/behavior probe, not a scenario citation.

func TestVec3_Add(t *testing.T) {
	a := Vec3{X: 1, Y: 2, Z: 3}
	b := Vec3{X: 4, Y: -5, Z: 6}
	got := a.Add(b)
	want := Vec3{X: 5, Y: -3, Z: 9}
	if got != want {
		t.Errorf("Add(%v, %v) = %v, want %v", a, b, got, want)
	}
}

func TestVec3_Sub(t *testing.T) {
	a := Vec3{X: 1, Y: 2, Z: 3}
	b := Vec3{X: 4, Y: -5, Z: 6}
	got := a.Sub(b)
	want := Vec3{X: -3, Y: 7, Z: -3}
	if got != want {
		t.Errorf("Sub(%v, %v) = %v, want %v", a, b, got, want)
	}
}

// SDET-added boundary probe: Sub is Add's exact inverse — the composition
// every displacement-then-recover computation in this package (e.g.
// BuildCurve's `from.Sub(bodyAt)`) relies on holding exactly, not just
// approximately.
func TestVec3_SubUndoesAddExactly(t *testing.T) {
	a := Vec3{X: 12.5, Y: -3.25, Z: 999.125}
	b := Vec3{X: -7, Y: 0.5, Z: 42}
	if got := a.Add(b).Sub(b); got != a {
		t.Errorf("a.Add(b).Sub(b) = %v, want exactly %v", got, a)
	}
}

func TestVec3_Scale(t *testing.T) {
	v := Vec3{X: 1, Y: -2, Z: 3}
	got := v.Scale(2.5)
	want := Vec3{X: 2.5, Y: -5, Z: 7.5}
	if got != want {
		t.Errorf("Scale(%v, 2.5) = %v, want %v", v, got, want)
	}
}

// SDET-added boundary probe: scaling by zero collapses to the zero vector
// regardless of the original vector's own magnitude.
func TestVec3_ScaleByZeroIsTheZeroVector(t *testing.T) {
	v := Vec3{X: 100, Y: -50, Z: 25}
	if got := v.Scale(0); got != (Vec3{}) {
		t.Errorf("Scale(%v, 0) = %v, want the zero vector", v, got)
	}
}

func TestVec3_Dot(t *testing.T) {
	a := Vec3{X: 1, Y: 2, Z: 3}
	b := Vec3{X: 4, Y: -5, Z: 6}
	got := a.Dot(b)
	const want = 1*4.0 + 2*(-5.0) + 3*6.0 // 4 - 10 + 18 = 12
	if got != want {
		t.Errorf("Dot(%v, %v) = %v, want %v", a, b, got, want)
	}
}

// SDET-added boundary probe: perpendicular vectors dot to exactly zero.
func TestVec3_DotOfPerpendicularVectorsIsZero(t *testing.T) {
	a := Vec3{X: 1, Y: 0, Z: 0}
	b := Vec3{X: 0, Y: 1, Z: 0}
	if got := a.Dot(b); got != 0 {
		t.Errorf("Dot(%v, %v) = %v, want exactly 0", a, b, got)
	}
}

func TestVec3_Cross(t *testing.T) {
	x := Vec3{X: 1, Y: 0, Z: 0}
	y := Vec3{X: 0, Y: 1, Z: 0}
	got := x.Cross(y)
	want := Vec3{X: 0, Y: 0, Z: 1} // the standard right-handed basis identity
	if got != want {
		t.Errorf("Cross(x, y) = %v, want %v (right-handed basis)", got, want)
	}
}

// SDET-added boundary probe: a vector crossed with a parallel vector
// (including itself) is exactly the zero vector.
func TestVec3_CrossOfParallelVectorsIsZero(t *testing.T) {
	a := Vec3{X: 3, Y: -6, Z: 9}
	b := Vec3{X: 1, Y: -2, Z: 3} // a == 3*b, parallel
	if got := a.Cross(b); got != (Vec3{}) {
		t.Errorf("Cross(%v, %v) = %v, want the zero vector (parallel inputs)", a, b, got)
	}
	if got := a.Cross(a); got != (Vec3{}) {
		t.Errorf("Cross(%v, %v) = %v, want the zero vector (a vector crossed with itself)", a, a, got)
	}
}

// Length is documented as "one correctly-rounded math.Sqrt over guarded
// products" (design.md Decision 6) — a Pythagorean fixture keeps the
// expected value exact rather than tolerance-based.
func TestVec3_Length(t *testing.T) {
	v := Vec3{X: 3, Y: 4, Z: 0}
	if got := v.Length(); got != 5 {
		t.Errorf("Length(%v) = %v, want exactly 5", v, got)
	}
}

func TestVec3_LengthOfZeroVectorIsZero(t *testing.T) {
	if got := (Vec3{}).Length(); got != 0 {
		t.Errorf("Length(zero vector) = %v, want exactly 0", got)
	}
}

// SDET-added: a 3-D Pythagorean fixture confirms Length guards all three
// components (X, Y, AND Z), not only a 2-D X/Z pair the way most of this
// package's own fixtures happen to be built (planar orbits).
func TestVec3_LengthUsesAllThreeComponents(t *testing.T) {
	v := Vec3{X: 2, Y: 4, Z: 4} // 2^2+4^2+4^2 = 4+16+16 = 36 -> length 6
	if got := v.Length(); !almostEqual(got, 6, tightTolerance) {
		t.Errorf("Length(%v) = %v, want ~6", v, got)
	}
}

func TestVec3_Normalize(t *testing.T) {
	v := Vec3{X: 3, Y: 4, Z: 0}
	got, ok := v.Normalize()
	if !ok {
		t.Fatalf("Normalize(%v) returned ok=false, want true", v)
	}
	want := Vec3{X: 0.6, Y: 0.8, Z: 0}
	if !almostEqualVec(got, want, tightTolerance) {
		t.Errorf("Normalize(%v) = %v, want %v", v, got, want)
	}
	if !almostEqual(got.Length(), 1, tightTolerance) {
		t.Errorf("Normalize(%v).Length() = %v, want ~1 (a unit vector)", v, got.Length())
	}
}

// Scenario coverage: the degenerate/zero-vector behavior Normalize's own
// doc comment names — reports ok=false below normalizeEpsilon rather than
// dividing by (near) zero.
func TestVec3_NormalizeZeroVectorReportsNotOk(t *testing.T) {
	got, ok := (Vec3{}).Normalize()
	if ok {
		t.Fatalf("Normalize(zero vector) returned ok=true, want false")
	}
	if got != (Vec3{}) {
		t.Errorf("Normalize(zero vector) = %v, want the zero vector on failure (never a partial/poisoned result)", got)
	}
}

// SDET-added boundary probe: a vector below normalizeEpsilon but not
// exactly zero still reports ok=false — the guard is a length floor, not a
// literal-zero check.
func TestVec3_NormalizeBelowEpsilonReportsNotOk(t *testing.T) {
	tiny := Vec3{X: normalizeEpsilon / 10, Y: 0, Z: 0}
	if _, ok := tiny.Normalize(); ok {
		t.Fatalf("Normalize(%v) (below normalizeEpsilon) returned ok=true, want false", tiny)
	}
}

// SDET-added boundary probe: a vector just above normalizeEpsilon
// normalizes successfully — confirms the floor is not overly conservative
// (it rejects only genuinely indistinguishable-from-zero lengths).
func TestVec3_NormalizeAboveEpsilonSucceeds(t *testing.T) {
	small := Vec3{X: normalizeEpsilon * 10, Y: 0, Z: 0}
	got, ok := small.Normalize()
	if !ok {
		t.Fatalf("Normalize(%v) (above normalizeEpsilon) returned ok=false, want true", small)
	}
	want := Vec3{X: 1, Y: 0, Z: 0}
	if !almostEqualVec(got, want, looseTolerance) {
		t.Errorf("Normalize(%v) = %v, want ~%v", small, got, want)
	}
}

// --- DistSq (openspec add-proximity-disclosure, tasks.md section 1) ---------
//
// DistSq is added to this package for one reason: every proximity predicate
// in the proximity-disclosure capability is required to compare squared
// distance against squared range, with no sqrt on the path. These tests pin
// the two properties that requirement rests on — that DistSq is exactly the
// subtract-and-dot a caller would otherwise hand-roll, and that its result
// is byte-identical across the build-target matrix.

// distSqTolerance is the documented tolerance between DistSq and Length()
// squared. DistSq rounds three products and two sums; Length() squared
// rounds the same three products, two sums, the correctly-rounded sqrt, and
// then the squaring — two extra roundings, so the two forms agree to a few
// ULP rather than exactly. Four ULP is measured slack on the sweep below,
// not a guess; DistSq is the exact form and is the one predicates use.
const distSqTolerance uint64 = 4

// TestVec3_DistSqIsSubtractAndDotBitForBit (tasks.md 1.3) — the whole point
// of DistSq existing is that a caller never writes `d := b.Sub(a);
// d.Dot(d)` themselves. That is only true if the two are the same value,
// bit for bit, everywhere: an inlined rewrite must never shift a result.
// Swept over the same continuous box the space fixture family draws its own
// positions from.
func TestVec3_DistSqIsSubtractAndDotBitForBit(t *testing.T) {
	r := newSweepRNG(0x5EED_D15C_0DE5)
	for i := 0; i < 20000; i++ {
		a := Vec3{X: r.box(-300, 300), Y: r.box(-300, 300), Z: r.box(-300, 300)}
		b := Vec3{X: r.box(-300, 300), Y: r.box(-300, 300), Z: r.box(-300, 300)}
		d := b.Sub(a)
		want := d.Dot(d)
		if got := a.DistSq(b); math.Float64bits(got) != math.Float64bits(want) {
			t.Fatalf("case %d: DistSq(%v,%v) = %s, want the subtract-and-dot form %s",
				i, a, b, strconv.FormatFloat(got, 'b', -1, 64), strconv.FormatFloat(want, 'b', -1, 64))
		}
		// Symmetric for the same reason: (a-b) is the exact negation of
		// (b-a) in IEEE-754, and squaring a negation is exact.
		if got, rev := a.DistSq(b), b.DistSq(a); math.Float64bits(got) != math.Float64bits(rev) {
			t.Fatalf("case %d: DistSq is not symmetric: %v vs %v", i, got, rev)
		}
	}
}

// TestVec3_DistSqAgreesWithLengthSquaredWithinTolerance (tasks.md 1.3) —
// the two forms are the same quantity computed two ways; DistSq is the one
// without the sqrt, and this pins how far apart the rounding lets them
// drift.
func TestVec3_DistSqAgreesWithLengthSquaredWithinTolerance(t *testing.T) {
	r := newSweepRNG(0x0FF5_E7C0_DE01)
	for i := 0; i < 20000; i++ {
		a := Vec3{X: r.box(-300, 300), Y: r.box(-300, 300), Z: r.box(-300, 300)}
		b := Vec3{X: r.box(-300, 300), Y: r.box(-300, 300), Z: r.box(-300, 300)}
		l := b.Sub(a).Length()
		if got, want := a.DistSq(b), float64(l*l); !ulpsWithin(got, want, distSqTolerance) {
			t.Fatalf("case %d: DistSq = %v, Length()^2 = %v — beyond the documented %d-ULP tolerance",
				i, got, want, distSqTolerance)
		}
	}
}

// TestVec3_DistSqDegenerateCases probes the boundaries a predicate actually
// hits: a point against itself (the coincident-observer case the occlusion
// requirement guards against dividing by), and an axis-aligned separation
// whose square is exactly representable.
func TestVec3_DistSqDegenerateCases(t *testing.T) {
	v := Vec3{X: 12.5, Y: -3.25, Z: 999.125}
	if got := v.DistSq(v); got != 0 {
		t.Errorf("DistSq(v, v) = %v, want exactly 0", got)
	}
	a := Vec3{X: 1, Y: 2, Z: 3}
	b := Vec3{X: 4, Y: 6, Z: 3}
	if got, want := a.DistSq(b), 25.0; got != want {
		t.Errorf("DistSq(%v, %v) = %v, want exactly %v", a, b, got, want)
	}
}

// distSqPins are inputs paired with their DistSq result serialized in the
// lossless binary-exponent form the space fixture family uses. A decimal
// literal could not express a last-ULP divergence; this form can.
//
// TestVec3_DistSqIsPinnedAcrossBuildTargets (tasks.md 1.4) is the
// cross-target assertion. The pins are the same source on every leg, so the
// suite passing under BOTH `GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1`
// (tasks.md 9.2) is the byte-identity claim — the same mechanism the
// fixture family uses, kept local because DistSq is one guarded expression
// rather than a family of its own. The cases are deliberately non-round:
// values whose products need the full mantissa are where a fused
// multiply-add on a contracting target would show up.
var distSqPins = []struct {
	a, b Vec3
	want string
}{
	{Vec3{X: 0.1, Y: 0.2, Z: 0.3}, Vec3{X: 0.4, Y: 0.5, Z: 0.6}, "4863887597560136p-54"},
	{Vec3{X: 1e-8, Y: 1e-8, Z: 1e-8}, Vec3{X: -1e-8, Y: 1e-8, Z: 1e-8}, "8112963841460669p-104"},
	{Vec3{X: 123.456789, Y: -987.654321, Z: 0.000123}, Vec3{X: -321.987654, Y: 456.123789, Z: 99.9}, "4923956598144420p-31"},
	{Vec3{X: 1e12, Y: 1e12, Z: 1e12}, Vec3{X: 1e12 + 1, Y: 1e12, Z: 1e12}, "4503599627370496p-52"},
	{Vec3{X: 3.7, Y: -2.9, Z: 8.3}, Vec3{X: 3.7000000000000006, Y: -2.9, Z: 8.3}, "4503599627370496p-154"},
}

func TestVec3_DistSqIsPinnedAcrossBuildTargets(t *testing.T) {
	for i, c := range distSqPins {
		if got := strconv.FormatFloat(c.a.DistSq(c.b), 'b', -1, 64); got != c.want {
			t.Errorf("pin %d: DistSq(%v, %v) = %s, want %s (this leg: %s/%s)",
				i, c.a, c.b, got, c.want, runtime.GOOS, runtime.GOARCH)
		}
	}
}
