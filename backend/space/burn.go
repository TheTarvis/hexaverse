package space

import (
	"errors"
	"math"

	"hexaverse/common"
)

// Target names a burn's destination as exactly one of a body identity or an
// explicit point — the caller is never required to supply a
// precomputed target position (space-kinematics: "Targeting Names a Body or
// an Explicit Point, Never Requires a Precomputed Position").
type Target struct {
	BodyId string // non-empty => body target
	Point  *Vec3  // non-nil => explicit point target
}

// TargetPosition resolves a target's position at world time t: an explicit
// point resolves to itself, unchanged, at any time; a body target resolves
// through Position.
func TargetPosition(bodies Bodies, target Target, t common.WorldMillis) (Vec3, error) {
	if target.Point != nil {
		return *target.Point, nil
	}
	return Position(bodies, target.BodyId, t)
}

// Burn is a committed transfer: its geometry is fixed at commit and
// evaluated closed-form from these stored fields and a query time alone,
// never from additional persisted state (space-kinematics: "A Committed
// Burn's Geometry Is Fixed at Commit and Evaluated Closed-Form").
type Burn struct {
	Origin         Vec3
	Target         Target
	Intercept      Vec3
	Curve          Curve
	Length         float64
	DepartMs       common.WorldMillis
	ArriveMs       common.WorldMillis
	Accel          float64
	InsertionPhase SubTurns // meaningful only when Target.BodyId != ""
}

// flightSeconds is the burn's stored flight duration, in seconds — always
// derived from the stored integer ArriveMs/DepartMs, never re-derived from
// Length/Accel (space-kinematics: "Burn Timing Quantizes to Integer
// World-Milliseconds by Ceiling": "every computation that derives a
// duration from a stored burn or park ... SHALL use the stored integer
// duration").
func (b Burn) flightSeconds() float64 {
	return float64(b.ArriveMs-b.DepartMs) / 1000
}

// coveredLength is the accelerate-flip-decelerate profile's arc-length
// integral at burn-relative time tauSeconds: 0.5*accel*tau^2 up to half the
// flight duration, and length - 0.5*accel*(flightDuration-tau)^2 after it
// (space-kinematics: "Position Along the Curve Follows Arc Length, Not the
// Curve Parameter"). Every multiply-add is float64(...)-guarded (design.md
// Decision 5).
func (b Burn) coveredLength(tauSeconds float64) float64 {
	flight := b.flightSeconds()
	half := float64(flight / 2)
	if tauSeconds <= half {
		return float64(float64(0.5*b.Accel) * float64(tauSeconds*tauSeconds))
	}
	rem := flight - tauSeconds
	return float64(b.Length - float64(float64(0.5*b.Accel)*float64(rem*rem)))
}

// Progress returns the fraction of arc length covered at world time t,
// clamped to [0,1] — 0 at or before depart, 1 at or after arrive.
func (b Burn) Progress(t common.WorldMillis) float64 {
	if t <= b.DepartMs {
		return 0
	}
	if t >= b.ArriveMs {
		return 1
	}
	tau := float64(t-b.DepartMs) / 1000
	if b.Length <= 0 {
		return 1
	}
	frac := b.coveredLength(tau) / b.Length
	if frac < 0 {
		frac = 0
	}
	if frac > 1 {
		frac = 1
	}
	return frac
}

// Position places the ship at burn-relative time t: clamped exactly to the
// origin before depart and to the intercept at or after arrive, and
// otherwise at the point coveredLength(tau) of arc length along the curve
// — mapped through Curve.ArcParam, never the curve evaluated at parameter
// tau/flightDuration (space-kinematics: "Position Along the Curve Follows
// Arc Length, Not the Curve Parameter").
func (b Burn) Position(t common.WorldMillis) Vec3 {
	if t <= b.DepartMs {
		return b.Origin
	}
	if t >= b.ArriveMs {
		return b.Intercept
	}
	u, _ := b.Curve.ArcParam(b.Progress(t))
	return b.Curve.Point(u)
}

// Tangent returns the unit tangent direction at world time t, clamped to
// the stored window (space-kinematics: same requirement as Position).
func (b Burn) Tangent(t common.WorldMillis) Vec3 {
	u, _ := b.Curve.ArcParam(b.Progress(t))
	d := b.Curve.Derivative(u)
	if unit, ok := d.Normalize(); ok {
		return unit
	}
	return Vec3{}
}

// Speed returns the instantaneous speed at world time t per the
// accelerate-flip-decelerate profile: acceleration*tau up to the midpoint,
// acceleration*(flightDuration-tau) after it; zero at or beyond either end
// of the stored window (space-kinematics: "Burn Speed Follows an
// Accelerate-Flip-Decelerate Profile").
func (b Burn) Speed(t common.WorldMillis) float64 {
	if t <= b.DepartMs || t >= b.ArriveMs {
		return 0
	}
	tau := float64(t-b.DepartMs) / 1000
	half := float64(b.flightSeconds() / 2)
	if tau <= half {
		return float64(b.Accel * tau)
	}
	rem := b.flightSeconds() - tau
	return float64(b.Accel * rem)
}

// BeforeFlip reports whether world time t falls in the first (accelerating)
// half of the burn's stored window.
func (b Burn) BeforeFlip(t common.WorldMillis) bool {
	tau := float64(t-b.DepartMs) / 1000
	half := float64(b.flightSeconds() / 2)
	return tau <= half
}

// DeltaV prices the burn's delta-v cost as commanded acceleration times
// stored flight duration (space-kinematics: "A Burn's Delta-V Price Equals
// Commanded Acceleration Times Flight Time").
func (b Burn) DeltaV() float64 {
	return float64(b.Accel * b.flightSeconds())
}

// FlightSeconds is the brachistochrone flight time for a curve of the given
// length under the given acceleration: 2*sqrt(curveLength/acceleration)
// (space-kinematics: "Flight Time Is the Brachistochrone of the Curve's Arc
// Length").
func FlightSeconds(curveLength, accel float64) float64 {
	return float64(2 * math.Sqrt(float64(curveLength/accel))) // determinism:allow(pinned) family:travelTime — sqrt is correctly-rounded and identical across Go build targets; pinned by fixtures/space/cases.json's travelTime family (and family:burnSpeed for the delta-v price, which is this value times commanded accel)
}

// QuantizeArrival quantizes a float flight-seconds duration to an integer
// arrival by rounding UP (never to nearest, never truncating), so a burn is
// never resolvable before its physics indicate arrival (space-kinematics:
// "Burn Timing Quantizes to Integer World-Milliseconds by Ceiling").
func QuantizeArrival(departMs common.WorldMillis, flightSeconds float64) common.WorldMillis {
	ms := math.Ceil(float64(flightSeconds * 1000)) // determinism:allow(pinned) Ceil is in the exact-arithmetic set (design.md Decision 8)
	return departMs + common.WorldMillis(int64(ms))
}

// ErrArcTooShort is returned when a solved curve's length falls below the
// configured minimum arc length (space/params_const.go: MinArcLength).
var ErrArcTooShort = errors.New("space: curve length below the configured minimum")

// ErrEndpointInsideClearance is returned when a burn's origin or intercept
// lies at or inside the configured star-clearance radius.
var ErrEndpointInsideClearance = errors.New("space: endpoint at or inside the star-clearance radius")

// CurveResult is BuildCurve's output: the constructed (and, where
// necessary, star-avoidance-displaced) curve, the resolved intercept point,
// and — for a body target — the insertion phase index the intercept was
// built at.
type CurveResult struct {
	Curve          Curve
	Intercept      Vec3
	InsertionPhase SubTurns
}

// arcSampleCount is the fixed 33-sample evaluation star-avoidance checks
// closest approach over (space-kinematics: "A Burn Path Is Displaced
// Perpendicular to the Chord to Clear the Star").
const arcSampleCount = 33

// hermiteScaleDivisor is the standard cubic-Hermite-to-Bezier tangent
// scale: control points sit at P0 + tangent/3 and P3 - tangent/3.
const hermiteScaleDivisor = 3

// avoidanceRounds is the fixed number of star-avoidance correction passes
// (not a data-dependent early-exit loop: it always runs this many times,
// each pass a no-op once the curve already clears the clearance radius).
//
// Thirty-two, not the cubic era's six. The quintic's matched interior
// weight 10(1-u)^2*u^2 is smaller than the cubic's 3(1-u)*u everywhere and
// vanishes faster near the endpoints, so each pass corrects less and more
// passes are needed to clear the same star. The value is not a guess: a grid
// over (minAvoidanceWeight, avoidanceRounds) measured against the solveBurn
// sweep put clearance violations at 34/4853 for (0.01, 6), 8/4853 for
// (0.01, 12), 2/4853 for (0.01, 20) and ZERO for (0.01, 32) — the first
// setting at which every swept burn clears. The fixture family records that
// zero as `measured.starClearanceViolations`, so a regression fails it.
const avoidanceRounds = 32

// minAvoidanceWeight floors the Bernstein weight avoidStar sizes a push
// against, so a worst point very near either endpoint (where a C2/C3
// displacement has little effect) still gets a large-but-finite push
// rather than an unbounded one. The quintic's matched interior weight
// 10(1-u)^2*u^2 falls off as u^2 near an endpoint rather than the cubic's
// u, so this floor does more work than it used to — which is the same
// property that protects the end tangents (design.md Decision 11).
const minAvoidanceWeight = 0.01

// avoidanceMargin and avoidanceSafetyFactor pad each avoidStar correction
// pass beyond its computed minimum, so the fixed round count converges
// comfortably rather than exactly.
const (
	avoidanceMargin       = 0.5
	avoidanceSafetyFactor = 1.5
)

// BuildCurve constructs a transfer curve from an origin to a target,
// resolved at arriveMs, with an optional explicit departure direction
// override (nil derives it from the chord) and a star-clearance radius (<=0
// disables avoidance entirely). starClearance is the resolved clearance
// radius (see StarClearanceRadius) — BuildCurve takes it explicitly rather
// than resolving "the star" internally, since this package's only notion of
// "the star" is "whatever parentless body sits at the origin" and there is
// no dedicated accessor for it on Bodies.
func BuildCurve(bodies Bodies, from Vec3, target Target, arriveMs common.WorldMillis, departDir *Vec3, starClearance float64) (CurveResult, error) {
	var intercept Vec3
	var insertionPhase SubTurns
	var arrivalPark *Park

	if target.Point != nil {
		intercept = *target.Point
	} else {
		body, ok := bodies.Body(target.BodyId)
		if !ok {
			return CurveResult{}, ErrUnknownBody
		}
		bodyAt, err := Position(bodies, target.BodyId, arriveMs)
		if err != nil {
			return CurveResult{}, err
		}
		approach := from.Sub(bodyAt)
		var phase SubTurns
		if approach.X == 0 && approach.Z == 0 {
			phase = DefaultPhaseIndex
		} else {
			phase, _ = PhaseIndexOf(approach)
		}
		standoff := InsertionStandoff(body)
		park := Park{
			Kind:     ParkOrbit,
			BodyId:   target.BodyId,
			Radius:   standoff,
			PeriodMs: InsertionPeriodFor(bodies, standoff),
			Phase:    phase,
			EpochMs:  arriveMs,
		}
		interceptPos, err := park.Position(bodies, arriveMs)
		if err != nil {
			return CurveResult{}, err
		}
		intercept = interceptPos
		insertionPhase = phase
		arrivalPark = &park
	}

	if starClearance > 0 {
		if from.Length() <= starClearance || intercept.Length() <= starClearance {
			return CurveResult{}, ErrEndpointInsideClearance
		}
	}

	chord := intercept.Sub(from)
	chordLen := chord.Length()
	chordDir, chordOk := chord.Normalize()

	departDirection := chordDir
	if departDir != nil {
		if d, ok := departDir.Normalize(); ok {
			departDirection = d
		}
	}

	arriveDirection := chordDir
	if arrivalPark != nil {
		if vel, err := arrivalPark.Velocity(bodies, arriveMs); err == nil {
			if d, ok := vel.Normalize(); ok {
				arriveDirection = d
			}
		}
	}

	scale := 0.0
	if chordOk {
		scale = chordLen / hermiteScaleDivisor
	}
	// Build the Hermite cubic exactly as the geometry dictates, then
	// degree-elevate it to the quintic the package actually stores. The
	// elevation reproduces the identical curve — the extra control points
	// buy star avoidance two INTERIOR handles it can push without touching
	// either end tangent (design.md Decision 11).
	c1 := from.Add(departDirection.Scale(scale))
	c2 := intercept.Sub(arriveDirection.Scale(scale))
	curve := elevateCubicToQuintic(from, c1, c2, intercept)

	if starClearance > 0 {
		curve = avoidStar(curve, starClearance)
	}

	return CurveResult{Curve: curve, Intercept: intercept, InsertionPhase: insertionPhase}, nil
}

// minDistanceAndParamOf evaluates c.Point at n+1 equal steps of the curve
// parameter (matching the spec's own "fixed 33-sample evaluation" when
// n == arcSampleCount) and returns the minimum distance from the origin —
// the star, per this package's own notion of it (BuildCurve's doc comment) —
// along with the curve parameter the minimum occurred at. That parameter
// sizes the star-avoidance push against that specific point's own (possibly
// small, near either endpoint) Bernstein sensitivity to a C1/C2 displacement,
// rather than assuming every point responds equally to the same push.
func minDistanceAndParamOf(c Curve, n int) (dist float64, u float64) {
	dist = math.Inf(1)
	for i := 0; i <= n; i++ {
		ui := float64(i) / float64(n)
		if d := c.Point(ui).Length(); d < dist {
			dist = d
			u = ui
		}
	}
	return dist, u
}

// perpendicularToChord returns a unit vector perpendicular to chordDir,
// chosen as chordDir x (0,1,0) so it never depends on which side the star
// sits — the fixed direction the displacement always runs along, never the
// (possibly near-chord-parallel) radial direction from the star to the
// curve's closest approach (space-kinematics: "A Burn Path Is Displaced
// Perpendicular to the Chord to Clear the Star").
func perpendicularToChord(chordDir Vec3) (Vec3, bool) {
	perp := chordDir.Cross(Vec3{Y: 1})
	if unit, ok := perp.Normalize(); ok {
		return unit, true
	}
	// chordDir is parallel to the Y axis; any horizontal direction is
	// perpendicular to it.
	return Vec3{X: 1}, true
}

// avoidStar displaces a curve's control points perpendicular to its chord
// until its fixed 33-sample closest approach to the origin (the star)
// clears clearance, running a fixed number of correction passes (never a
// data-dependent early exit) — a curve already clear is returned unmodified
// (space-kinematics: "A Burn Path Is Displaced Perpendicular to the Chord
// to Clear the Star").
func avoidStar(curve Curve, clearance float64) Curve {
	original := curve
	chordVec := original.P5.Sub(original.P0)
	chordDir, ok := chordVec.Normalize()
	if !ok {
		return original
	}
	perpUnit, ok := perpendicularToChord(chordDir)
	if !ok {
		return original
	}

	// Orient perpUnit toward the far side of the star from the chord line,
	// using the closest point ON THE INFINITE CHORD LINE to the origin —
	// this determines a SIGN only; the displacement direction itself stays
	// perpendicular to the chord regardless of how that closest point's own
	// radial direction relates to the chord.
	tParam := float64(0) - chordDir.Dot(original.P0)
	closest := original.P0.Add(chordDir.Scale(tParam))
	if closest.Dot(perpUnit) < 0 {
		perpUnit = perpUnit.Scale(-1)
	}

	current := original
	pushMag := 0.0
	for i := 0; i < avoidanceRounds; i++ {
		d, uWorst := minDistanceAndParamOf(current, arcSampleCount)
		shortfall := clearance - d
		if shortfall > 0 {
			// A push applied equally to the two INTERIOR control points
			// moves Point(u) by 10*(1-u)^2*u^2*push (the Bernstein weight
			// of a matched C2/C3 offset) — small near either endpoint.
			// Size the push against the ACTUAL worst point's own weight,
			// not a fixed assumption, with a floor so a near-endpoint worst
			// point still gets a large-but-finite push rather than a
			// division blow-up.
			muWorst := 1 - uWorst
			weight := float64(10*float64(muWorst*muWorst)) * float64(uWorst*uWorst)
			if weight < minAvoidanceWeight {
				weight = minAvoidanceWeight
			}
			sum := shortfall/weight + avoidanceMargin
			delta := float64(sum * avoidanceSafetyFactor) // guarded product, its own statement — see curve.go's ArcParam note
			pushMag = pushMag + delta
			displacement := perpUnit.Scale(pushMag)
			// C1 and C4 are deliberately NOT displaced: they alone
			// determine the end tangents (5(C1-P0) and 5(P5-C4)), so
			// leaving them untouched makes both headings bit-identical
			// before and after avoidance, at any push magnitude
			// (space-kinematics: "Star avoidance leaves both end tangents
			// exactly unchanged").
			current = Curve{
				P0: original.P0,
				C1: original.C1,
				C2: original.C2.Add(displacement),
				C3: original.C3.Add(displacement),
				C4: original.C4,
				P5: original.P5,
			}
		}
	}
	return current
}

// SolveResult is SolveBurn's output: the solved burn and the number of
// fixed-point rounds it executed.
type SolveResult struct {
	Burn   Burn
	Rounds int
}

// SolveBurn solves a burn against a (possibly moving) target by fixed-point
// iteration: each round rebuilds the full transfer curve for the previous
// round's flight-time estimate and re-derives a new flight time from that
// curve's actual length. It always runs exactly `rounds` rounds — no
// round-to-round convergence check, no early exit (space-kinematics:
// "Intercept Against a Moving Target Converges in a Fixed Number of
// Rounds").
func SolveBurn(bodies Bodies, from Vec3, target Target, departMs common.WorldMillis, accel float64, departDir *Vec3, starClearance float64, rounds int) (SolveResult, error) {
	initialPos, err := TargetPosition(bodies, target, departMs)
	if err != nil {
		return SolveResult{}, err
	}
	chordLen := initialPos.Sub(from).Length()
	if chordLen <= 0 {
		chordLen = 1e-9
	}
	flightSeconds := FlightSeconds(chordLen, accel)

	var (
		built    CurveResult
		arriveMs common.WorldMillis
	)
	for i := 0; i < rounds; i++ {
		arriveMs = QuantizeArrival(departMs, flightSeconds)
		built, err = BuildCurve(bodies, from, target, arriveMs, departDir, starClearance)
		if err != nil {
			return SolveResult{}, err
		}
		flightSeconds = FlightSeconds(built.Curve.Length(), accel)
	}

	if built.Curve.Length() < MinArcLength {
		return SolveResult{}, ErrArcTooShort
	}

	burn := Burn{
		Origin:         from,
		Target:         target,
		Intercept:      built.Intercept,
		Curve:          built.Curve,
		Length:         built.Curve.Length(),
		DepartMs:       departMs,
		ArriveMs:       arriveMs,
		Accel:          accel,
		InsertionPhase: built.InsertionPhase,
	}
	return SolveResult{Burn: burn, Rounds: rounds}, nil
}
