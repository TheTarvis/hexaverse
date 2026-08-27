package space

import (
	"math"

	"hexaverse/common"
)

// twoPi is math.Pi doubled — a compile-time numeric constant, not a call to
// a runtime trigonometric function, so it carries none of the cross-target
// hazard design.md Decision 3 guards against (it is the identical bit
// pattern on every Go build target, baked in at compile time).
const twoPi = 2 * math.Pi

// Orbit holds a body's (or an orbit park's) orbital elements: which body it
// revolves around, at what radius and period, starting from what phase, and
// the plane's tilt (inclination) and orientation (node). Angles are
// SubTurns, never floating-point radians or degrees (design.md Decision 3).
// Orbit itself carries no epoch — its phase is always relative to the world
// epoch (world time 0); Park (park.go) is the type that stores an EpochMs,
// since a park's orbit begins at whatever world time it was created or
// released, not at world time zero.
type Orbit struct {
	ParentId    string
	Radius      float64
	PeriodMs    common.WorldMillis
	Phase       SubTurns
	Inclination SubTurns
	Node        SubTurns
}

// PhaseAt returns the orbit's raw advanced phase index at world time t,
// before the inclination/node rotation LocalPosition/LocalVelocity apply.
// Advance is truncating integer arithmetic over the pinned table's domain
// (design.md Decision 3): idx = (phase + ((t-epoch) % period) * SubTurn /
// period) % SubTurn, with epoch fixed at world time 0 for a bare Orbit. The
// "% period before the * SubTurn multiply" step is load-bearing, not
// defensive — (t-epoch) * 2^20 overflows int64 at plausible world times,
// while the reduced form's worst case (period * 2^20) does not (design.md
// Decision 3 / the same fix polar's own orbital advance already documents).
// A period at or below zero holds the orbit motionless at its stored phase,
// performing no division (space-kinematics: "A non-positive period is
// motionless").
func (o Orbit) PhaseAt(t common.WorldMillis) SubTurns {
	if o.PeriodMs <= 0 {
		return o.Phase
	}
	elapsed := int64(t) // epoch is world time 0 for a bare Orbit
	period := int64(o.PeriodMs)
	mod := floorMod(elapsed, period) // in [0, period) — see floorMod's doc for why a bare '%' breaks periodicity here
	advance := mod * int64(SubTurn) / period
	return wrapSubTurn(int64(o.Phase) + advance)
}

// rotateInclinationNode applies the orbit's inclination (a rotation about
// the line of nodes, fixed at raw phase index 0, tilting the out-of-plane
// component) and then its node (a rotation about the Y axis, reorienting
// the resulting plane in space, which leaves Y untouched) to a planar
// (x, 0, z) offset. Both rotations reuse the same pinned-table CosSin
// lookup LocalPosition/LocalVelocity already need — no runtime trig.
//
// Sign convention (documented here, the one place it is chosen, per
// design.md Decision 3's inclination guidance): inclining tilts the offset
// so that Y = -z*sinIncl, z' = z*cosIncl. This is an arbitrary but fixed
// choice — no requirement pins which side of the plane "up" is.
func rotateInclinationNode(x, z float64, incl, node SubTurns) Vec3 {
	cosI, sinI := CosSin(incl)
	y := float64(-z * sinI)
	zIncl := float64(z * cosI)

	cosN, sinN := CosSin(node)
	xFinal := float64(x*cosN) - float64(zIncl*sinN)
	zFinal := float64(x*sinN) + float64(zIncl*cosN)
	return Vec3{X: xFinal, Y: y, Z: zFinal}
}

// LocalPosition returns the orbit's offset from its parent at world time t —
// a closed-form function of stored elements and t alone, via table lookup
// only, no runtime trig (space-kinematics: "Orbital Position Is a
// Closed-Form Function of Time").
func (o Orbit) LocalPosition(t common.WorldMillis) Vec3 {
	idx := o.PhaseAt(t)
	cosT, sinT := CosSin(idx)
	x := float64(o.Radius * cosT)
	z := float64(o.Radius * sinT)
	return rotateInclinationNode(x, z, o.Inclination, o.Node)
}

// angularRateScale computes r * 2*pi / period in seconds, the magnitude of
// orbital velocity for radius r and period periodMs. 2*pi is math.Pi, a
// compile-time constant baked into the binary — not a call to a runtime
// trigonometric function, so it carries none of the cross-target hazard
// design.md Decision 3 guards against; it is the same constant on every Go
// build target.
func angularRateScale(radius float64, periodMs common.WorldMillis) float64 {
	periodSeconds := float64(periodMs) / 1000
	return float64(radius*twoPi) / periodSeconds
}

// LocalVelocity returns the orbit's instantaneous local velocity at world
// time t: the analytic tangent of the circle it sweeps, never a finite
// difference (space-kinematics: "A Body's Velocity Is Computed
// Analytically"). It is the same table lookup LocalPosition uses at the
// same phase index, with cos and sin swapped and one sign flipped so that
// velocity points toward increasing phase index (documented here, the one
// place this sign convention is chosen), scaled by 2*pi*radius/period, then
// rotated by the same inclination/node transform as position. A
// non-positive period is motionless, so its velocity is the zero vector.
func (o Orbit) LocalVelocity(t common.WorldMillis) Vec3 {
	if o.PeriodMs <= 0 {
		return Vec3{}
	}
	idx := o.PhaseAt(t)
	cosT, sinT := CosSin(idx)
	scale := angularRateScale(o.Radius, o.PeriodMs)
	// d/dt (r cosθ, r sinθ) = r * dθ/dt * (-sinθ, cosθ): swap cos/sin, flip
	// the sign on the (now sin-derived) x term.
	vx := float64(-sinT * scale)
	vz := float64(cosT * scale)
	rotated := rotateInclinationNode(vx, vz, o.Inclination, o.Node)
	return rotated
}
