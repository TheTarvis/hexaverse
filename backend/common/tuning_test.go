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
	if d.CoastPeriod <= 0 {
		t.Errorf("CoastPeriod = %d, must be > 0 (orbit period divides by it)", d.CoastPeriod)
	}
	if d.BoardRadius <= 0 {
		t.Errorf("BoardRadius = %d, must be > 0", d.BoardRadius)
	}
}
