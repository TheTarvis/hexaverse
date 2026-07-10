package system

import "testing"

func TestHex_RingDistances(t *testing.T) {
	if d := hexDistance(Hex{0, 0}); d != 0 {
		t.Fatalf("centre distance = %d, want 0", d)
	}
	// Every hex returned by ringHexes(n) must be exactly n from the centre.
	for ring := 1; ring <= 6; ring++ {
		hs := ringHexes(ring)
		if len(hs) != 6*ring {
			t.Fatalf("ring %d has %d hexes, want %d", ring, len(hs), 6*ring)
		}
		for _, h := range hs {
			if got := hexDistance(h); got != ring {
				t.Fatalf("hex %+v on ring %d has distance %d", h, ring, got)
			}
		}
	}
}

func TestHex_AtRingAngleWraps(t *testing.T) {
	ring := 3
	n := len(ringHexes(ring))
	if hexAtRingAngle(ring, 0) != hexAtRingAngle(ring, n) {
		t.Fatal("angle should wrap around the ring")
	}
	if hexAtRingAngle(ring, -1) != hexAtRingAngle(ring, n-1) {
		t.Fatal("negative angle should wrap")
	}
}
