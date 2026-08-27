package space

// Curve is a QUINTIC Bezier transfer path: P0 is the departure point, P5 the
// arrival point, C1..C4 the interior control points.
//
// The degree is five, not three, and that is load-bearing rather than
// decorative (design.md Decision 11). A Bezier's end tangents are exactly
// 5(C1-P0) and 5(P5-C4), so the two control points ADJACENT to the endpoints
// are the arrival and departure headings and nothing else may touch them.
// Star avoidance (burn.go's avoidStar) therefore displaces only C2 and C3 —
// the two INTERIOR points — which leaves both end tangents bit-identical at
// any push magnitude. A cubic has no such interior point to spare: with both
// endpoints and both end-tangent directions fixed it retains only the two
// tangent magnitudes, which cannot satisfy an arbitrary clearance constraint
// and cannot bend the curve off the chord line at all when the control
// points are collinear. That shortage is what made a displaced cubic arrive
// pointing the wrong way (measured at the -1.0 floor in 6.8% of realistic
// transfers) — see design.md Decision 11 for the measurement.
type Curve struct {
	P0, C1, C2, C3, C4, P5 Vec3
}

// bernsteinPoint evaluates the quintic Bezier basis at u in [0,1]:
// mu^5*p0 + 5mu^4u*c1 + 10mu^3u^2*c2 + 10mu^2u^3*c3 + 5mu*u^4*c4 + u^5*p5.
// Every multiply-add is guarded with an explicit float64(...) conversion —
// the canonical FMA-hazard site design.md's own D-2 finding measured
// emitting fused FMA instructions on arm64 from the naive (unguarded) form
// (design.md Decision 5).
func bernsteinPoint(p0, c1, c2, c3, c4, p5 float64, u float64) float64 {
	mu := 1 - u
	mu2 := float64(mu * mu)
	mu3 := float64(mu2 * mu)
	mu4 := float64(mu3 * mu)
	mu5 := float64(mu4 * mu)
	u2 := float64(u * u)
	u3 := float64(u2 * u)
	u4 := float64(u3 * u)
	u5 := float64(u4 * u)
	term0 := float64(mu5 * p0)
	term1 := float64(5 * float64(mu4*u) * c1)
	term2 := float64(10 * float64(mu3*u2) * c2)
	term3 := float64(10 * float64(mu2*u3) * c3)
	term4 := float64(5 * float64(mu*u4) * c4)
	term5 := float64(u5 * p5)
	return float64(float64(float64(term0+term1)+float64(term2+term3)) + float64(term4+term5))
}

// Point evaluates the curve at parameter u in [0,1] via the quintic
// Bernstein basis. Point(0) == P0 and Point(1) == P5 exactly (mu=1,u=0 and
// mu=0,u=1 each zero out every term but one).
func (c Curve) Point(u float64) Vec3 {
	return Vec3{
		X: bernsteinPoint(c.P0.X, c.C1.X, c.C2.X, c.C3.X, c.C4.X, c.P5.X, u),
		Y: bernsteinPoint(c.P0.Y, c.C1.Y, c.C2.Y, c.C3.Y, c.C4.Y, c.P5.Y, u),
		Z: bernsteinPoint(c.P0.Z, c.C1.Z, c.C2.Z, c.C3.Z, c.C4.Z, c.P5.Z, u),
	}
}

// bernsteinDerivative is the analytic (non-unit) QUARTIC Bernstein
// derivative of the quintic — 5 * sum over the four control-point
// differences weighted by the quartic basis (coefficients 1,4,6,4,1) —
// replacing the PoC's finite difference of the curve at a fixed step
// (design.md Decision 6). At u=0 it is exactly 5(c1-p0) and at u=1 exactly
// 5(p5-c4): the invariant star avoidance is built to preserve.
func bernsteinDerivative(p0, c1, c2, c3, c4, p5 float64, u float64) float64 {
	mu := 1 - u
	mu2 := float64(mu * mu)
	mu3 := float64(mu2 * mu)
	mu4 := float64(mu3 * mu)
	u2 := float64(u * u)
	u3 := float64(u2 * u)
	u4 := float64(u3 * u)
	term0 := float64(5 * mu4 * (c1 - p0))
	term1 := float64(20 * float64(mu3*u) * (c2 - c1))
	term2 := float64(30 * float64(mu2*u2) * (c3 - c2))
	term3 := float64(20 * float64(mu*u3) * (c4 - c3))
	term4 := float64(5 * u4 * (p5 - c4))
	return float64(float64(term0+term1) + float64(float64(term2+term3)+term4))
}

// Derivative returns the curve's raw (non-unit) analytic derivative at
// parameter u — never a finite difference (design.md Decision 6).
func (c Curve) Derivative(u float64) Vec3 {
	return Vec3{
		X: bernsteinDerivative(c.P0.X, c.C1.X, c.C2.X, c.C3.X, c.C4.X, c.P5.X, u),
		Y: bernsteinDerivative(c.P0.Y, c.C1.Y, c.C2.Y, c.C3.Y, c.C4.Y, c.P5.Y, u),
		Z: bernsteinDerivative(c.P0.Z, c.C1.Z, c.C2.Z, c.C3.Z, c.C4.Z, c.P5.Z, u),
	}
}

// elevateCubicToQuintic returns the quintic Bezier that is the IDENTICAL
// curve as the cubic (p0, c1, c2, p3), by applying the standard degree-
// elevation formula twice (3 -> 4 -> 5): Q[i] = (i/n)*P[i-1] + (1-i/n)*P[i].
//
// Degree elevation reproduces the same curve exactly, so the undisplaced
// transfer geometry is unchanged by construction rather than by re-tuning —
// and it provably preserves the end tangents, which is the whole point:
// R1-R0 = (4/5)(Q1-Q0) = (4/5)(3/4)(c1-p0) = (3/5)(c1-p0), and the quintic's
// own derivative at 0 is 5(R1-R0) = 3(c1-p0), exactly the cubic's. The same
// holds at the far end (design.md Decision 11).
//
// Each blend is written as the sum of two independently guarded products —
// the shape curve.go's ArcParam documents as the one that actually inhibits
// arm64's fusion, rather than "non-product + guarded product".
func elevateCubicToQuintic(p0, c1, c2, p3 Vec3) Curve {
	blend := func(a, b Vec3, t float64) Vec3 {
		return Vec3{
			X: float64(float64(a.X*t) + float64(b.X*(1-t))),
			Y: float64(float64(a.Y*t) + float64(b.Y*(1-t))),
			Z: float64(float64(a.Z*t) + float64(b.Z*(1-t))),
		}
	}
	// 3 -> 4
	q1 := blend(p0, c1, 1.0/4.0)
	q2 := blend(c1, c2, 2.0/4.0)
	q3 := blend(c2, p3, 3.0/4.0)
	// 4 -> 5
	return Curve{
		P0: p0,
		C1: blend(p0, q1, 1.0/5.0),
		C2: blend(q1, q2, 2.0/5.0),
		C3: blend(q2, q3, 3.0/5.0),
		C4: blend(q3, p3, 4.0/5.0),
		P5: p3,
	}
}

// arcSteps is the fixed number of equal parameter steps the arc table
// samples (space-kinematics: "the cumulative chord sums of the curve
// sampled at 64 equal steps of the curve parameter").
const arcSteps = 64

// ArcTable returns the curve's cumulative chord-length table: 65 entries,
// [0] == 0, [64] == Length(), sampled at 64 equal steps of the curve
// parameter. This is a fixed-size sample, not a data-dependent loop
// (design.md Decision 7).
func (c Curve) ArcTable() [arcSteps + 1]float64 {
	var table [arcSteps + 1]float64
	prev := c.Point(0)
	for i := 1; i <= arcSteps; i++ {
		u := float64(i) / float64(arcSteps)
		cur := c.Point(u)
		table[i] = table[i-1] + prev.Sub(cur).Length()
		prev = cur
	}
	return table
}

// Length is the curve's total arc length: ArcTable()[64].
func (c Curve) Length() float64 {
	table := c.ArcTable()
	return table[arcSteps]
}

// arcParamSteps is ArcParam's fixed binary-search step count (64 = 2^6, so
// six halvings isolate a single bracketing segment).
const arcParamSteps = 6

// ArcParam maps an arc-length fraction (frac in [0,1], as a fraction of the
// curve's total length) to a curve parameter u, via an unconditional fixed
// six-step binary search over the 64-segment arc table — never a
// data-dependent loop exit (space-kinematics: "Fixed-Round Iteration
// Replaces Every Data-Dependent Loop Exit"). Within the bracketing segment
// the search resolves to, u is the linear interpolation between the
// segment's endpoints, in proportion to the target arc length's position
// within that segment (space-kinematics: "Position Along the Curve Follows
// Arc Length...").
func (c Curve) ArcParam(frac float64) (u float64, steps int) {
	if frac < 0 {
		frac = 0
	}
	if frac > 1 {
		frac = 1
	}
	table := c.ArcTable()
	target := float64(frac * table[arcSteps])

	lo, hi := 0, arcSteps
	for i := 0; i < arcParamSteps; i++ {
		mid := (lo + hi) / 2
		if table[mid] <= target {
			lo = mid
		} else {
			hi = mid
		}
	}
	// lo is the resolved bracket's lower index; lo+1 its upper (lo < 64
	// unless target hit the very top of the table, in which case lo==64==hi
	// and the segment [lo,lo] degenerates to a point at u=1).
	if lo >= arcSteps {
		return 1, arcParamSteps
	}
	segLen := table[lo+1] - table[lo]
	var frac2 float64
	if segLen > 0 {
		frac2 = float64(target-table[lo]) / segLen
	}
	uLo := float64(lo) / float64(arcSteps)
	uHi := float64(lo+1) / float64(arcSteps)
	// Linear interpolation expressed as a weighted blend of two
	// independently guarded products (the same shape bernsteinPoint uses
	// successfully above) rather than "non-product + guarded-product": the
	// latter shape still let arm64 fuse the surrounding add with the
	// product despite the inner float64(...) guard — a same-type
	// conversion of an already-float64 value is eliminated early enough in
	// this compiler's pipeline that a bare local addition next to it is not
	// a reliable fusion barrier, verified by disassembly (check-fma-
	// contraction.sh) rather than by the language spec's text alone.
	loTerm := float64(uLo * (1 - frac2))
	hiTerm := float64(uHi * frac2)
	u = float64(loTerm + hiTerm)
	return u, arcParamSteps
}
