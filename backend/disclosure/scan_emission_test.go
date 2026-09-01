package disclosure

// RED-phase tests for openspec change replace-observation-with-sightings §5,
// task 5.5 (specs/proximity-disclosure/spec.md ADDED "A Sweep's Emission
// Radius Scales With Its Range"; specs/focused-scan/spec.md "A Sweep Emits
// For Its Duration" — "A parked, sweeping fleet reports no plume emission
// from the sweep alone").
//
// SIGNATURE NOTE (SDET judgment call, open to dispute): design.md Decision
// 9's ruling names the function `scanEmissionRadius(d)` explicitly, "in
// disclosure/params.go", `d` being "the commit-time range to the host". This
// file assumes it is package-private (lowercase, like detectionRadius
// itself — neither PlumeRadius's exported-ness nor a new export is implied
// by the design text) with the signature:
//
//	func scanEmissionRadius(d float64) float64 {
//	    r := ScanEmissionPerRange * d
//	    if r < ScanEmissionFloor { return ScanEmissionFloor }
//	    return r
//	}
//
// and that `d` is read off the sweeping Ship's own `Scan.Range` (see
// scanning_test.go's contract note) inside `detectionRadius`, which this
// file assumes gains a sweep-emission branch parallel to its existing
// plume one:
//
//	func detectionRadius(obs Observer, target Ship, t common.WorldMillis) float64 {
//	    r := obs.PassiveRange
//	    loudest := 0.0
//	    if Emitting(target.State, t) {
//	        loudest = PlumeRadius(target.DriveOutput, target.State.Burn.Accel)
//	    }
//	    if Scanning(target, t) {
//	        if sweep := scanEmissionRadius(target.Scan.Range); sweep > loudest {
//	            loudest = sweep
//	        }
//	    }
//	    return r + loudest
//	}
//
// and that `Disclose` sets the returned `Contact.Scanning` field to
// `Scanning(target, t)`, independent of whatever disclosed it (passive,
// plume, or sweep emission alone).
//
// A developer landing a materially different but scenario-equivalent shape
// should raise it as a test dispute.
//
// EXPECTED RED TODAY: every test below either fails to compile (Ship.Scan,
// ScanWindow, Scanning, scanEmissionRadius, ScanEmissionFloor,
// ScanEmissionPerRange do not exist) or, once those compile, is genuinely
// behaviorally red — Contact.Scanning is wired to its zero value today per
// contact.go's own doc comment ("today every disclosed Contact carries
// Scanning at its zero value, false, until [§5] wires a stored sweep window
// for Disclose to read").

import (
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// sweepingAt builds a ship parked at p, running a focused scan committed
// against a host `d` units away at commit time — the frozen Range this
// section's emission-radius curve reads.
func sweepingAt(id string, p space.Vec3, depart, arrive common.WorldMillis, d float64) Ship {
	s := parkedAt(id, p)
	s.Scan = &ScanWindow{DepartMs: depart, ArriveMs: arrive, Range: d}
	return s
}

// Scenario: A closer sweep target yields a smaller emission radius than a
// farther one.
//
// Distances 15 and 40 are chosen so BOTH sides clear ScanEmissionFloor (20)
// with today's real constants (ScanEmissionFloor=20, ScanEmissionPerRange=
// 2.0: radii 30 and 80) — the strict inequality below is meaningless if
// either side is still clamped to the floor, which is exactly the gap a
// bare `t.Skip` used to leave open (a zeroed ScanEmissionPerRange would
// clamp both to the floor and this test would have silently skipped
// instead of failing — see the SDET handoff report's exploit check). There
// is no skip path left: if a future re-tuning of the constants ever moves
// this fixture back under the floor, that is exactly the kind of drift
// this test exists to catch, and it must fail loudly, not skip quietly.
//
// Deliberately non-tautological: neither side recomputes
// ScanEmissionPerRange * d itself — both radii are read from the real
// production scanEmissionRadius the same way a caller would, so a broken
// (e.g. zeroed) scaling constant collapses the two measured radii together
// and the strict inequality below catches it directly.
func TestScanEmissionRadius_ScalesWithCommitTimeRange(t *testing.T) {
	const near, far = 15.0, 40.0
	nearRadius := scanEmissionRadius(near)
	farRadius := scanEmissionRadius(far)

	if nearRadius <= ScanEmissionFloor || farRadius <= ScanEmissionFloor {
		t.Fatalf("fixture error: scanEmissionRadius(%v)=%v and scanEmissionRadius(%v)=%v must both clear "+
			"ScanEmissionFloor (%v) for this scenario to mean anything — re-tune the fixture distances, "+
			"never skip", near, nearRadius, far, farRadius, ScanEmissionFloor)
	}
	if !(nearRadius < farRadius) {
		t.Errorf("scanEmissionRadius(%v) = %v is not strictly less than scanEmissionRadius(%v) = %v — a farther "+
			"sweep target must yield a strictly larger emission radius", near, nearRadius, far, farRadius)
	}
}

// Scenario: A sweep at zero range still emits at the named floor.
func TestScanEmissionRadius_ZeroRangeClampsToFloor(t *testing.T) {
	if got := scanEmissionRadius(0); got != ScanEmissionFloor {
		t.Errorf("scanEmissionRadius(0) = %v, want the named floor %v (not zero)", got, ScanEmissionFloor)
	}
}

// Scenario: Scanning is reported on its own flag, not as emission — a
// parked ship, running a sweep, with no committed burn.
func TestDisclose_Scenario_ScanningReportedOnOwnFlagNotEmission(t *testing.T) {
	w := testWorld(nil)
	obs := observerAt(space.Vec3{})

	// Well within detection range so this scenario is about the FLAGS, not
	// the geometry: parked at the observer's own position.
	target := sweepingAt("sweeper", space.Vec3{}, 0, 10_000, 20)

	contact, ok, err := Disclose(w, obs, target, 5_000)
	if err != nil {
		t.Fatalf("Disclose: %v", err)
	}
	if !ok {
		t.Fatal("a parked, sweeping ship well inside passive range is not disclosed at all")
	}
	if !contact.Scanning {
		t.Error("Contact.Scanning = false for a fleet mid-sweep, want true")
	}
	if contact.Emitting {
		t.Error("Contact.Emitting = true for a parked, non-burning fleet — a sweep alone must not report plume emission")
	}
}

// Scenario: A ship burning and sweeping reports both flags.
func TestDisclose_Scenario_BurningAndSweepingReportsBothFlags(t *testing.T) {
	w := testWorld(nil)
	// Held well clear of the star (which sits at the world origin in this
	// fixture family — helpers_test.go's testWorld): an observer or a burn
	// origin placed AT the origin would sit inside/at the star itself and
	// spuriously occlude, exactly as contact_test.go's own fixtures are
	// careful to avoid.
	obs := observerAt(space.Vec3{Y: 300})

	target := burningFrom("both", space.Vec3{Y: 300}, space.Vec3{X: 100, Y: 300}, 0, 20_000, 8, 2)
	target.Scan = &ScanWindow{DepartMs: 0, ArriveMs: 20_000, Range: 10}

	contact, ok, err := Disclose(w, obs, target, 1_000)
	if err != nil {
		t.Fatalf("Disclose: %v", err)
	}
	if !ok {
		t.Fatal("expected the fleet disclosed by its own plume/proximity")
	}
	if !contact.Emitting || !contact.Scanning {
		t.Errorf("Contact = %+v, want both Emitting and Scanning true for a fleet doing both", contact)
	}
}

// Scenario: A parked, sweeping ship is disclosed by its sweep emission
// alone — positioned outside the observer's passive range but within
// passive range plus the ship's sweep-emission radius, with a clear
// sightline.
func TestDisclose_Scenario_ParkedSweepingShipDisclosedBySweepEmissionAlone(t *testing.T) {
	w := testWorld(nil)
	// Held well clear of the star (origin) — see the sibling test's own note.
	obsPos := space.Vec3{Y: 300}
	obs := observerAt(obsPos)

	// A generous commit-time range so the resulting sweep-emission radius is
	// well above PassiveRange and comfortably placeable between the two
	// boundaries below, whatever ScanEmissionPerRange turns out to be.
	sweepRadius := scanEmissionRadius(FocusedScanRange)
	if sweepRadius <= PassiveRange {
		t.Skip("scanEmissionRadius(FocusedScanRange) does not exceed PassiveRange with today's placeholder constants; " +
			"re-tune once real values land — ScanEmissionFloor > PassiveRange is pinned separately")
	}

	outsidePassive := obsPos.Add(space.Vec3{X: PassiveRange + 1})
	insideSweepReach := obsPos.Add(space.Vec3{X: PassiveRange + sweepRadius - 1})

	target := sweepingAt("far-sweeper", insideSweepReach, 0, 10_000, FocusedScanRange)

	if WithinRange(obs.Position, outsidePassive, PassiveRange) {
		t.Fatal("fixture error: the target position must be outside plain passive range for this scenario to mean anything")
	}
	contact, ok, err := Disclose(w, obs, target, 5_000)
	if err != nil {
		t.Fatalf("Disclose: %v", err)
	}
	if !ok {
		t.Fatal("a parked, sweeping ship within passive range + sweep-emission radius is not disclosed at all")
	}
	if !contact.Scanning || contact.Emitting {
		t.Errorf("Contact = %+v, want Scanning=true, Emitting=false", contact)
	}
}

// Scenario: Detection radius combines passive range with the louder of
// plume or sweep emission — asserted indirectly through Disclose's own
// boundary, since detectionRadius is unexported: a target placed exactly at
// the SWEEP boundary (which this fixture makes louder than any plume the
// ship could produce, since it is not burning at all) is disclosed, and a
// target one step beyond it is not.
func TestDisclose_Scenario_DetectionRadiusUsesTheLouderChannel(t *testing.T) {
	w := testWorld(nil)
	// Held well clear of the star (origin) — see this file's other tests'
	// own note on why.
	obsPos := space.Vec3{Y: 300}
	obs := observerAt(obsPos)

	sweepRadius := scanEmissionRadius(FocusedScanRange)
	reach := PassiveRange + sweepRadius

	atReach := sweepingAt("edge", obsPos.Add(space.Vec3{X: reach}), 0, 10_000, FocusedScanRange)
	beyond := sweepingAt("beyond", obsPos.Add(space.Vec3{X: reach + 1}), 0, 10_000, FocusedScanRange)

	if _, ok, err := Disclose(w, obs, atReach, 5_000); err != nil || !ok {
		t.Errorf("a sweeping ship exactly at passiveRange+sweepEmissionRadius is not disclosed (ok=%v err=%v)", ok, err)
	}
	if _, ok, err := Disclose(w, obs, beyond, 5_000); err != nil || ok {
		t.Errorf("a sweeping ship just beyond passiveRange+sweepEmissionRadius is disclosed (ok=%v err=%v)", ok, err)
	}
}
