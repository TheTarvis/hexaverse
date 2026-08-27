package space

import "testing"

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
