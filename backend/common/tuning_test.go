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
	fast.LaneMsPerDistance = 1_000
	SetTuning(fast)

	if got := Tuning().LaneMsPerDistance; got != 1_000 {
		t.Fatalf("after SetTuning, Tuning().LaneMsPerDistance = %f, want 1000", got)
	}
}

// The pacing knobs must be positive — a zero LaneMsPerDistance would make lane
// travel free, which is the kind of thing an admin page could ship by accident.
//
// The ScanDuration assertion that used to sit here was REMOVED 2026-09-01
// (replace-observation-with-sightings task 7.1, orchestrator-adjudicated): it
// pinned a knob nothing reads. The focused scan prices its own duration from
// fleet/params.go's roundTripMs (ScanBaseDurationMs + ceil(k·d), design.md
// Decision 8) and never consults common.Tuning(); Tuning().ScanDuration is the
// deleted lattice-era 360° sweep's flat constant, and 7.1 deletes the field
// itself. An assertion over a constant no behaviour reads protects nothing.
func TestDefaultTuning_PacingIsPositive(t *testing.T) {
	d := DefaultTuning()
	if d.LaneMsPerDistance <= 0 {
		t.Errorf("LaneMsPerDistance = %f, must be > 0 (else travel is free)", d.LaneMsPerDistance)
	}
	if d.BoardRadius <= 0 {
		t.Errorf("BoardRadius = %d, must be > 0", d.BoardRadius)
	}
}

// A test was DELETED from here. It pinned a single world-wide orbital law: one revolution priced as a base constant times a discrete index, shared
// by every body and every coasting ship, read live from this struct so an
// operator could re-pace a running world with it.
//
// There is no such law. A body's period is a Keplerian function of its own
// radius and is drawn once, at generation time; a parked ship's is computed
// once, at settle time, from the park's own radius. Neither consults tuning,
// so the knob and its accessor are gone and this test has no subject. The
// property it protected — period grows with distance — survives in a truer
// form in backend/system's Kepler-law tests, which assert it against the
// actual law rather than against a linear stand-in (authorized deletion;
// cause = the requirement it pinned was removed).
