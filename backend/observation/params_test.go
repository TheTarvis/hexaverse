package observation

import "testing"

// TestDefaultParams_SaneBaselines guards the tuned defaults: a positive ambient
// bubble and a positive scan duration feeding the ETA. No tier grant to check —
// scan grants no graph tier (#0006 Decision #20); no width knobs — the slice
// scan is a 360° sweep (#0006 Decision #21).
func TestDefaultParams_SaneBaselines(t *testing.T) {
	sensor := DefaultSensorParams()
	if sensor.AmbientRadius <= 0 {
		t.Errorf("ambient radius = %d, want > 0 (a unit must sense its surroundings)", sensor.AmbientRadius)
	}

	if scan := DefaultScanParams(); scan.Duration <= 0 {
		t.Errorf("scan duration = %d, want > 0 (it feeds the commit-time ETA)", scan.Duration)
	}
}
