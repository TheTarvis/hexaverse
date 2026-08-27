// Package space is the continuous-space kinematics capability (openspec
// change add-space-kinematics): vectors, rails orbits, cubic transfer
// curves on a brachistochrone profile, the moving-target intercept solve,
// parking modes, and the StateAt-style effective-state fold. It is the
// sole authority for every rule-bearing value it defines (design.md
// Decision 1) — no TypeScript mirror exists, now or later — and it takes
// bodies through an injected interface (body.go) rather than minting or
// storing any of its own (design.md Decision 9). It imports only
// hexaverse/common (for WorldMillis): no Firestore, no clock, no
// time.Now().
package space

import "math"

// Vec3 is a point or displacement in continuous R^3. Never fixed-point
// (design.md Decision 4): the language seam that motivated fixed-point
// elsewhere in this codebase does not exist here (Go is sole authority),
// and the transcendental that made board's coordinate math inexact is gone
// too (angles are resolved through the pinned turn table, turn.go/table.go).
type Vec3 struct {
	X, Y, Z float64
}

// Add returns the component-wise sum.
func (v Vec3) Add(o Vec3) Vec3 {
	return Vec3{X: v.X + o.X, Y: v.Y + o.Y, Z: v.Z + o.Z}
}

// Sub returns the component-wise difference.
func (v Vec3) Sub(o Vec3) Vec3 {
	return Vec3{X: v.X - o.X, Y: v.Y - o.Y, Z: v.Z - o.Z}
}

// Scale returns v scaled by s. Every product is wrapped in an explicit
// float64(...) conversion: assigning a product to a local does not inhibit
// Go's FMA fusion on arm64 (design.md Decision 5) — only the conversion is
// spec-guaranteed to force the intermediate rounding.
func (v Vec3) Scale(s float64) Vec3 {
	return Vec3{X: float64(v.X * s), Y: float64(v.Y * s), Z: float64(v.Z * s)}
}

// Dot returns the dot product, each product guarded per Decision 5. For a
// squared distance between two points, use DistSq rather than composing
// Sub and Dot at the call site.
func (v Vec3) Dot(o Vec3) float64 {
	return float64(v.X*o.X) + float64(v.Y*o.Y) + float64(v.Z*o.Z)
}

// DistSq returns the squared Euclidean distance between v and o, each
// product guarded per Decision 5 and with no math.Sqrt anywhere in it.
//
// This is the operation every proximity comparison is required to run on
// (openspec proximity-disclosure: "Proximity Comparisons Are Squared, Never
// Rooted"): only the ORDERING of a distance against a range is ever
// consumed, so the square root is pure cost, and dropping it keeps the
// comparison inside this file's guarded-product set. It lives here rather
// than at each caller so that no caller hand-rolls `d := b.Sub(a);
// d.Dot(d)` — an inlined rewrite of that shape is exactly where an
// unguarded multiply-add reappears.
//
// Not bit-equal to Length() squared: Length rounds once at the sqrt and
// again at the squaring, so the two agree only to within a few ULP
// (vec_test.go pins the tolerance). DistSq is the exact one.
func (v Vec3) DistSq(o Vec3) float64 {
	dx := v.X - o.X
	dy := v.Y - o.Y
	dz := v.Z - o.Z
	return float64(dx*dx) + float64(dy*dy) + float64(dz*dz)
}

// Cross returns the cross product v x o, each product guarded per Decision 5.
func (v Vec3) Cross(o Vec3) Vec3 {
	return Vec3{
		X: float64(v.Y*o.Z) - float64(v.Z*o.Y),
		Y: float64(v.Z*o.X) - float64(v.X*o.Z),
		Z: float64(v.X*o.Y) - float64(v.Y*o.X),
	}
}

// Length returns the Euclidean length as one correctly-rounded math.Sqrt
// over guarded products. math.Hypot is deliberately not used here: Go's
// Hypot is a scaled iterative algorithm, not a single correctly-rounded
// operation, so it is not in this capability's exact-arithmetic set
// (design.md Decision 6).
func (v Vec3) Length() float64 {
	return math.Sqrt(float64(v.X*v.X) + float64(v.Y*v.Y) + float64(v.Z*v.Z)) // determinism:allow(pinned) sqrt is correctly-rounded and identical across Go build targets
}

// normalizeEpsilon is the small-length floor below which Normalize reports
// ok=false rather than dividing by a length indistinguishable from zero.
const normalizeEpsilon = 1e-9

// Normalize returns the unit vector in v's direction, or ok=false if v's
// length is below normalizeEpsilon.
func (v Vec3) Normalize() (Vec3, bool) {
	l := v.Length()
	if l < normalizeEpsilon {
		return Vec3{}, false
	}
	inv := 1 / l
	return Vec3{X: float64(v.X * inv), Y: float64(v.Y * inv), Z: float64(v.Z * inv)}, true
}
