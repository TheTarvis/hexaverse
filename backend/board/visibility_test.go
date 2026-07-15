package board

import "testing"

// Spec: 0006/S2 — the geometry half of the shadow rule: a large body on the
// hex line between origin and target blocks everything strictly behind it,
// while the occluder's own hex stays visible (you see the planet, not past it).
func TestLineOfSight_OccluderShadowsBehind(t *testing.T) {
	origin := Hex{Q: 0, R: 0}
	occ := map[Hex]bool{{Q: 2, R: 0}: true}

	if !LineOfSight(origin, Hex{Q: 1, R: 0}, occ) {
		t.Errorf("hex in front of the occluder must be visible")
	}
	if !LineOfSight(origin, Hex{Q: 2, R: 0}, occ) {
		t.Errorf("the occluder itself must be visible (first body on the line is seen)")
	}
	if LineOfSight(origin, Hex{Q: 3, R: 0}, occ) {
		t.Errorf("hex directly behind the occluder must be shadowed")
	}
	if LineOfSight(origin, Hex{Q: 5, R: 0}, occ) {
		t.Errorf("hex far behind the occluder must be shadowed")
	}
	if !LineOfSight(origin, Hex{Q: 0, R: 3}, occ) {
		t.Errorf("hex off the occluded axis must be visible")
	}
	if !LineOfSight(origin, origin, occ) {
		t.Errorf("a hex always sees itself")
	}
}

func TestLineOfSight_NoOccludersIsAlwaysClear(t *testing.T) {
	if !LineOfSight(Hex{Q: -3, R: 1}, Hex{Q: 4, R: -2}, nil) {
		t.Errorf("empty occluder set must never block")
	}
}

// The beam is a straightish corridor: a hex-line spine from the origin through
// the aim, extended to the rim, widened by w(i) = base + floor(spread·i) hexes
// at spine index i (#0006 Decision #15). Pure membership here — occlusion is
// LineOfSight's job, composed by the caller.
func TestBeamHexes_CorridorWidensAndClipsAtRim(t *testing.T) {
	origin := Hex{Q: 0, R: 0}
	aim := Hex{Q: 1, R: 0}
	p := BeamParams{HalfWidthBase: 0, Spread: 0.34, RimRing: 6}

	beam := BeamHexes(origin, aim, p)
	set := make(map[Hex]bool, len(beam))
	for _, h := range beam {
		set[h] = true
	}

	// The spine reaches the rim even though the aim hex is adjacent.
	for q := 0; q <= 6; q++ {
		if !set[Hex{Q: q, R: 0}] {
			t.Errorf("spine hex (%d,0) missing from beam", q)
		}
	}
	// Near the origin the corridor is a bare line (w=0)…
	if set[Hex{Q: 1, R: 1}] || set[Hex{Q: 1, R: -1}] {
		t.Errorf("corridor should not have widened yet at spine index 1")
	}
	// …and widens with distance (w(3)=1 at spread 0.34).
	if !set[Hex{Q: 3, R: -1}] || !set[Hex{Q: 3, R: 1}] {
		t.Errorf("corridor should be ±1 hex wide at spine index 3")
	}
	// Perpendicular hexes never join.
	if set[Hex{Q: 0, R: 3}] {
		t.Errorf("hex far off the beam axis must not be in the corridor")
	}
	// Nothing ships beyond the rim.
	for _, h := range beam {
		if Ring(h) > p.RimRing {
			t.Errorf("beam hex %v lies beyond the rim ring %d", h, p.RimRing)
		}
	}
	// The origin is always covered (index 0).
	if !set[origin] {
		t.Errorf("beam must include its origin")
	}
}

func TestBeamHexes_AimOnOriginIsEmpty(t *testing.T) {
	if got := BeamHexes(Hex{Q: 2, R: 2}, Hex{Q: 2, R: 2}, BeamParams{RimRing: 6}); len(got) != 0 {
		t.Errorf("a beam with no direction must be empty, got %d hexes", len(got))
	}
}
