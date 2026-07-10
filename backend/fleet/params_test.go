package fleet

import "testing"

// The default movement params carry sane graph-tier travel knobs (#0008) and a
// board radius that matches the system generator, so gate geometry lands on the
// rendered rim.
func TestDefaultMovementParams_TravelKnobs(t *testing.T) {
	p := DefaultMovementParams()
	if p.LaneMsPerDistance <= 0 {
		t.Fatalf("LaneMsPerDistance must be positive, got %v", p.LaneMsPerDistance)
	}
	if p.BoardRadius <= 0 {
		t.Fatalf("BoardRadius must be positive, got %d", p.BoardRadius)
	}
	// The invariant the gate math relies on: the fleet's board radius equals the
	// system generator's radius, so a gate's ring matches the board the client draws.
	if want := 16; p.BoardRadius != want {
		t.Fatalf("BoardRadius = %d, want %d (system.DefaultParams().Radius)", p.BoardRadius, want)
	}
}
