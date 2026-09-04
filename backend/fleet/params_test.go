package fleet

import "testing"

// The default movement params carry sane graph-tier travel knobs (#0008).
//
// The former radius leg is gone with MovementParams' own radius field: lane
// gates are bodies with continuous orbits now, so fleet holds no generation
// radius to keep in lockstep with anything. The surviving guard that the
// system generator still follows the central knob lives in
// corporations/params_test.go.
func TestDefaultMovementParams_TravelKnobs(t *testing.T) {
	p := DefaultMovementParams()
	if p.LaneMsPerDistance <= 0 {
		t.Fatalf("LaneMsPerDistance must be positive, got %v", p.LaneMsPerDistance)
	}
}
