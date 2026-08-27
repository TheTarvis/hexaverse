package space

// Tuning constants for backend/space, carried over from the PoC as named
// placeholder constants (design.md Decision 9 / Open Questions: "Scale and
// tuning" — accel, insertion radii, the station-keep floor, and the
// star-clearance factor are PoC dials that graduate here honestly, the same
// way corporations/siteselection.go carries its own placeholder constants).
// None of these values is spec-pinned; each is named here (never a bare
// literal at a call site) precisely so a later feel-tuning pass has one
// place to change.

// StationKeepFloor is the minimum station-keep upkeep rate charged to any
// body, including a parentless one (space-kinematics: "Station-Keeping
// Draws a Positive, Body-Derived Upkeep").
const StationKeepFloor float64 = 0.05

// MinOrbitRadius is the minimum radius a released station-keep hold
// re-circularizes to when its held offset's planar magnitude would
// otherwise be smaller (space-kinematics: "Releasing a Station-Keep Hold
// Re-Circularizes...").
const MinOrbitRadius float64 = 3.0

// MinArcLength is the minimum solved curve length a burn may commit with —
// starting point per design.md Open Questions: one world-second of flight
// at the nominal 8 units/s^2 acceleration (FlightSeconds(L, 8) == 1 =>
// L == 2), pending a fixture-measured refinement (space-kinematics: "Flight
// Time Is the Brachistochrone of the Curve's Arc Length").
const MinArcLength float64 = 2.0

// insertionStandoffBase and insertionStandoffPerSize give InsertionStandoff
// its documented per-body linear form: base clearance plus a size-scaled
// term, so a larger body always gets a strictly larger standoff.
const (
	insertionStandoffBase    float64 = 2.5
	insertionStandoffPerSize float64 = 1.5
)

// insertionPeriodBaseSeconds and insertionPeriodPerRadius give
// InsertionPeriod its documented per-standoff-radius form (design.md
// Decision 5's own worked example: "insertionPeriod(r) = 5 + r*0.9").
const (
	insertionPeriodBaseSeconds float64 = 5
	insertionPeriodPerRadius   float64 = 0.9
)

// starClearanceFactor is the multiplier StarClearanceRadius applies to a
// star's size (design.md Risks: "the star-clearance factor (2.5x)").
const starClearanceFactor float64 = 2.5

// SolveRounds is the configured, unconditional fixed round count
// SolveBurn's fixed-point iteration runs (space-kinematics: "Intercept
// Against a Moving Target Converges in a Fixed Number of Rounds"). It is
// NOT a code-review guess: the value is validated by the `solveBurn`
// randomized sweep in fixtures/space/cases.json, whose recorded
// `measured.solveRoundResidualMs` is the largest quantized-arrival
// difference observed between round N-1 and round N across every swept
// case — zero for this N. Lowering it re-records a non-zero residual and
// fails the family rather than passing silently.
const SolveRounds int = 8

// ArrivalTangentAlignmentMin is the floor on the alignment (dot product of
// unit directions) between a burn's curve-end tangent and the settled
// park's velocity at the stored arrival millisecond — 0.95, the value the
// source design pins (space-kinematics: "Arrival Is Tangent to the
// Target's Settled Motion, With No Perceptible Discontinuity"). The
// fixture family records the MEASURED worst case alongside it and adopts
// the measured value as the recorded threshold only where it is stricter;
// a measured value looser than this constant is a requirement failure, not
// a re-baselining.
const ArrivalTangentAlignmentMin float64 = 0.95

// nominalAccel is the acceleration MinArcLength is expressed against —
// the PoC's own nominal burn acceleration, and the one every fixture case
// that speaks of "one world-second of flight" is measured at. It is a feel
// dial like every other constant in this file, named here rather than
// written as a literal at the two places that reference it.
const nominalAccel float64 = 8

// SolveRoundResidualP99BoundMs and SolveRoundResidualMaxBoundMs are the
// recorded ceilings on the difference between the quantized arrival at round
// N-1 and at round N, across this capability's fixture sweep
// (space-kinematics: "The round-to-round residual is measured and bounded,
// not assumed zero"; design.md Decision 12).
//
// Neither is zero, and that is a decision rather than an oversight. Against a
// target that moves appreciably during the flight the solve's iteration is
// not a contraction, and the ceiling quantization of the arrival makes its
// right-hand side a step function — so an exact fixed point need not exist at
// all. Measured evidence: explicit points and zero-period bodies measure
// exactly zero, and raising N from 8 to 24 barely moves the count.
//
// TWO bounds, because one number cannot do this job. The p99 bound is the
// tight one that catches a broad regression. The max bound is deliberately
// loose because the randomized sweep's box is adversarial — it draws
// positions uniformly in a 600-unit cube with a star-clearance radius up to
// 40, manufacturing near-star chords that demand enormous avoidance pushes
// and so enormous curve-length swings. On the enumerable realistic-traffic
// sweep recorded alongside it, the same measurement is p99 ~100 ms against a
// median flight of ~5 s. Judge acceptability by that one; judge regression by
// both.
//
// Raising either bound is a deliberate act needing a stated reason. A growing
// residual means the solve's geometry changed, not that a sweep got unlucky.
const (
	SolveRoundResidualP99BoundMs int64 = 2_000
	SolveRoundResidualMaxBoundMs int64 = 30_000
)
