package common

import "testing"

// Tuning() must hand back the defaults on a fresh process — the baseline every
// domain's Default*Params() reads through.
func TestTuning_DefaultsOutOfTheBox(t *testing.T) {
	got := Tuning()
	want := DefaultTuning()
	if got != want {
		t.Fatalf("Tuning() = %+v, want the defaults %+v", got, want)
	}
}

// SetTuning is the seam a future admin page writes through: set it, and every
// subsequent Tuning() read (which is what Default*Params() do) sees the new value.
func TestSetTuning_IsObservedByLaterReads(t *testing.T) {
	original := Tuning()
	t.Cleanup(func() { SetTuning(original) })

	fast := DefaultTuning()
	fast.MsPerTile = 1_000
	SetTuning(fast)

	if got := Tuning().MsPerTile; got != 1_000 {
		t.Fatalf("after SetTuning, Tuning().MsPerTile = %d, want 1000", got)
	}
}

// The pacing knobs must be positive — a zero MsPerTile would make burns
// instantaneous (and a zero LaneMsPerDistance would make travel free), which is
// the kind of thing an admin page could ship by accident.
func TestDefaultTuning_PacingIsPositive(t *testing.T) {
	d := DefaultTuning()
	if d.MsPerTile <= 0 {
		t.Errorf("MsPerTile = %d, must be > 0 (else burns are instant)", d.MsPerTile)
	}
	if d.LaneMsPerDistance <= 0 {
		t.Errorf("LaneMsPerDistance = %f, must be > 0 (else travel is free)", d.LaneMsPerDistance)
	}
	if d.ScanDuration <= 0 {
		t.Errorf("ScanDuration = %d, must be > 0 (else scans resolve instantly)", d.ScanDuration)
	}
	if d.OrbitBasePeriod <= 0 {
		t.Errorf("OrbitBasePeriod = %d, must be > 0 (orbit math divides by the period)", d.OrbitBasePeriod)
	}
	if d.BoardRadius <= 0 {
		t.Errorf("BoardRadius = %d, must be > 0", d.BoardRadius)
	}
}

// OrbitPeriod is the world's ONE orbital law, shared by system bodies and coasting
// fleets — there is deliberately no second period for ships (there used to be, flat
// and un-scaled by ring, which made rim ships cross hexes faster than inner ones).
// These assertions pin the two properties that redundancy hid.
func TestOrbitPeriod_ScalesWithRing(t *testing.T) {
	d := DefaultTuning()

	// Period grows with radius: the further out, the longer to come round.
	if got, want := d.OrbitPeriod(1), d.OrbitBasePeriod; got != want {
		t.Errorf("OrbitPeriod(1) = %d, want %d", got, want)
	}
	if got, want := d.OrbitPeriod(12), d.OrbitBasePeriod*12; got != want {
		t.Errorf("OrbitPeriod(12) = %d, want %d (base × ring)", got, want)
	}

	// RETIRED 2026-08-26 (migrate-consumers-to-polar-board, tasks.md 1.8): this
	// used to assert "the ring factor cancels against a ring's 6 × N cells, so
	// the rate you SEE is uniform" — true only under the retired hex lattice,
	// where every ring had exactly 6 × ring cells. Under the pinned polar
	// Isotropic schedule that cancellation does NOT hold (ring 3 has 24 slots,
	// not 18; ring 5 has 48, not 30) — see system-interior's "Equal-Period
	// Rings With Different Slot Counts Advance Slots At Different Rates". The
	// replacement lives in tuning_schedule_test.go (package common_test, since
	// board/polar both import common and an internal test here cannot import
	// either). Cause: spec-superseding migration change, not a developer
	// dispute — logged per the SDET protocol's "test change with cause".

	// The star has no orbit; callers short-circuit on ring 0 and must not divide by
	// a period we pretended was meaningful.
	if got := d.OrbitPeriod(0); got != 0 {
		t.Errorf("OrbitPeriod(0) = %d, want 0 (the centre doesn't orbit)", got)
	}
}
