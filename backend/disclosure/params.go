package disclosure

// Tuning constants for backend/disclosure, defaulted by
// add-proximity-disclosure's design.md Decision 6 rather than left blocking
// — the README's three open knobs (identity gating, plume scaling,
// focused-scan pricing) get named placeholder values here so the sighting
// model that consumes this capability inherits numbers instead of holes.
//
// None of these values is spec-pinned. Every one is a feel dial, calibrated
// against the PoC generator's actual scale (spike/space-3d/sim.ts: star size
// 6, planets 1.6-4.2, innermost orbit 20-26, each subsequent orbit
// x1.38-1.60, 5-7 planets, so an outer orbit lands around 150-250 units),
// and named here — never written as a bare literal at a call site — exactly
// so a later feel-tuning pass has one place to change. Same discipline, and
// the same reason, as space/params_const.go and corporations/siteselection.go.
//
// The one default here that is not a number is identity gating, and it is
// not a constant because it is expressed structurally: Contact carries no
// owner field (contact.go). Anonymous is picked as the restrictive
// direction — anonymous to identified is an additive change to a response
// shape, while identified to anonymous is a disclosure regression that
// requires auditing everything which could leak identity anyway.

// PassiveRange is the default radius within which a fleet detects an
// unmasked, unoccluded foreign fleet with its drive cold. Set below the
// PoC's innermost orbit (20) so a fleet cannot passively watch the inner
// system from a neighbouring orbit: scouting has to close distance.
const PassiveRange float64 = 12

// PlumeFloor is the minimum radius an emitting fleet's plume reaches,
// however gently the burn was commanded. It sits above PassiveRange with
// margin, which is what answers the README's open question — "a floor so
// ignition is always an event?" — in the affirmative: lighting a drive is
// always detectable by anyone who could already see you dark.
// params_test.go asserts that relationship rather than trusting this
// comment.
const PlumeFloor float64 = 20

// PlumePerDriveOutput is the k in plumeRadius = k * driveOutput *
// commandedAccel. Calibrated so a mid-class hull at the nominal
// acceleration space/params_const.go already cites (8) is loud across a
// good fraction of a system without being system-wide: engine classes
// 1/2/3 at accel 8 give radii of 64, 128, and 192 against outer orbits
// around 150-250.
const PlumePerDriveOutput float64 = 8.0

// MinCommandedAccel floors silent running, so a burn cannot be commanded
// arbitrarily quiet. At a default class-2 hull it yields a raw radius of 16,
// which PlumeFloor then clamps up to 20 — about 6x quieter than the same
// hull at nominal accel, bought with roughly 2.8x the flight time (the
// brachistochrone's sqrt(L/a)). Meaningfully stealthy, meaningfully slow,
// neither free.
const MinCommandedAccel float64 = 1.0

// FocusedScanRange is how far a fleet may reach to sweep a host for the
// ships masked at it. Four times PassiveRange: masking is beatable, but
// sweeping every body in a system is not free.
const FocusedScanRange float64 = 48

// ScanEmissionFloor is the minimum radius a running focused scan's sweep
// emits at, however close its target. Set equal to PlumeFloor — a sweep is
// at least as loud as the quietest possible burn — and, like PlumeFloor, it
// sits above PassiveRange with margin: sweeping is always detectable by
// anyone who could already see the sweeper cold. params_test.go asserts
// that relationship rather than trusting this comment (design.md Decision
// 9).
const ScanEmissionFloor float64 = 20

// ScanEmissionPerRange is the k in scanEmissionRadius = k * d, d being the
// commit-time range from the scanning fleet to its host. Calibrated so
// sweeping at FocusedScanRange (48) reaches 96 — comparable to, and
// strictly below, a nominal class-2 burn's plume radius of 128
// (PlumeRadius(2, 8)) — delivering "a thorough search is the most
// detectable thing a fleet can do short of burning" as an emergent property
// of one constant. params_test.go pins the ordering (design.md Decision 9).
const ScanEmissionPerRange float64 = 2.0

// scanEmissionRadius derives how far a running focused scan's own emission
// reaches, from the commit-time range to its host — clamped up to
// ScanEmissionFloor, exactly as PlumeRadius clamps up to PlumeFloor.
// Package-private: it is consumed only by detectionRadius, itself
// unexported, and by this package's own tests.
func scanEmissionRadius(d float64) float64 {
	r := ScanEmissionPerRange * d
	if r < ScanEmissionFloor {
		return ScanEmissionFloor
	}
	return r
}
