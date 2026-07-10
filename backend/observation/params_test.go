package observation

import "testing"

// TestDefaultParams_SaneBaselines guards the spike defaults: a positive ambient
// bubble, a positive scan duration feeding the ETA, and a scan that grants at
// least Surveyed knowledge (the collapsed slice scan).
func TestDefaultParams_SaneBaselines(t *testing.T) {
	sensor := DefaultSensorParams()
	if sensor.AmbientRadius <= 0 {
		t.Errorf("ambient radius = %d, want > 0 (a unit must sense its surroundings)", sensor.AmbientRadius)
	}

	scan := DefaultScanParams()
	if scan.Duration <= 0 {
		t.Errorf("scan duration = %d, want > 0 (it feeds the commit-time ETA)", scan.Duration)
	}
	if !scan.GrantsTier.AtLeast(TierSurveyed) {
		t.Errorf("scan grants %q, want at least surveyed", scan.GrantsTier)
	}
}
