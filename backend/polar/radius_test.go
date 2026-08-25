package polar

import "testing"

func TestRingRadius(t *testing.T) {
	// One radius per ring: the mapping takes the ring index alone — no slot
	// parameter exists to vary it — so a body confined to a ring holds a
	// constant radius through a full revolution by construction. What's left
	// to assert: the configured table is honored exactly, the fallback is
	// uniform unit spacing, and the core is radius zero under both.
	radii := []float64{0, 1, 1.75, 2.25, 4} // non-uniform: the open radial-spacing lever
	for ring, want := range radii {
		if got := RingRadius(ring, radii); got != want {
			t.Errorf("RingRadius(%d, table) = %v, want %v", ring, got, want)
		}
	}
	if got := RingRadius(7, radii); got != 7 {
		t.Errorf("RingRadius beyond the table = %v, want unit fallback 7", got)
	}
	if got := RingRadius(3, nil); got != 3 {
		t.Errorf("RingRadius(3, nil) = %v, want unit fallback 3", got)
	}
	if got := RingRadius(0, radii); got != 0 {
		t.Errorf("the core must project to the center, got %v", got)
	}
	if got := RingRadius(0, []float64{9, 9}); got != 0 {
		t.Errorf("the core is radius 0 even against a table claiming otherwise, got %v", got)
	}
}
