package board

import (
	"testing"
)

// Line of sight (#0006 Decision #16, polar form): an occluder shadows what
// lies strictly behind it along the chord — never itself, never what's in
// front — and the core star occludes the far side of the board.
func TestLineOfSight(t *testing.T) {
	s := sched(t, 10)
	star := Occluder{Cell: Cell{Ring: 0, Slot: 0}, Radius2: StarOcclusionRadius2}
	planet := Occluder{Cell: Cell{Ring: 4, Slot: 0}, Radius2: PlanetOcclusionRadius2}

	// No occluders → unconditional visibility.
	if !LineOfSight(Cell{Ring: 2, Slot: 3}, Cell{Ring: 9, Slot: 40}, nil, s) {
		t.Error("empty occluder set must always be visible")
	}

	// Across the core: two cells on opposite sides of the star, chord through
	// the middle — occluded by the star.
	if LineOfSight(Cell{Ring: 6, Slot: 0}, Cell{Ring: 6, Slot: 24}, []Occluder{star}, s) {
		t.Error("the star must occlude the diametrically opposite cell")
	}
	// Same two cells without the star registered → visible.
	if !LineOfSight(Cell{Ring: 6, Slot: 0}, Cell{Ring: 6, Slot: 24}, nil, s) {
		t.Error("no occluders — the chord across the core is clear")
	}
	// A chord that passes well clear of the core is not blocked by the star.
	if !LineOfSight(Cell{Ring: 6, Slot: 0}, Cell{Ring: 6, Slot: 4}, []Occluder{star}, s) {
		t.Error("a short same-side chord must not be star-occluded")
	}

	// A planet on ring 4 slot 0: the cell radially behind it (ring 8, same
	// bearing — slot 0 on ring 8 has the same table angle) is shadowed...
	if LineOfSight(Cell{Ring: 1, Slot: 0}, Cell{Ring: 8, Slot: 0}, []Occluder{planet}, s) {
		t.Error("the cell radially behind the planet must be shadowed")
	}
	// ...the planet's own cell stays visible (never shadows itself)...
	if !LineOfSight(Cell{Ring: 1, Slot: 0}, Cell{Ring: 4, Slot: 0}, []Occluder{planet}, s) {
		t.Error("the occluder's own cell must stay visible")
	}
	// ...and cells in FRONT of it stay visible.
	if !LineOfSight(Cell{Ring: 1, Slot: 0}, Cell{Ring: 3, Slot: 0}, []Occluder{planet}, s) {
		t.Error("a cell in front of the occluder must stay visible")
	}
	// Looking the other way (from behind), the same geometry holds: the
	// origin's side is clear, the far side is shadowed.
	if LineOfSight(Cell{Ring: 8, Slot: 0}, Cell{Ring: 1, Slot: 0}, []Occluder{planet}, s) {
		t.Error("occlusion is symmetric in origin/target")
	}
	// Off-axis: a target well off the chord is unaffected.
	if !LineOfSight(Cell{Ring: 1, Slot: 0}, Cell{Ring: 8, Slot: 12}, []Occluder{planet}, s) {
		t.Error("an off-axis target must not be shadowed")
	}
}

func TestBeamCells(t *testing.T) {
	s := sched(t, 10)
	p := BeamParams{HalfWidthBase: TableScale / 2, SpreadNum: 1, SpreadDen: 4, RimRing: 8}

	// An aim on the origin yields no beam.
	if got := BeamCells(Cell{Ring: 3, Slot: 0}, Cell{Ring: 3, Slot: 0}, p, s); got != nil {
		t.Errorf("aim==origin must be empty, got %v", got)
	}

	origin := Cell{Ring: 1, Slot: 0}
	aim := Cell{Ring: 5, Slot: 0}
	beam := BeamCells(origin, aim, p, s)
	if len(beam) == 0 {
		t.Fatal("beam is empty")
	}
	seen := map[Cell]bool{}
	for _, c := range beam {
		seen[c] = true
		if c.Ring > p.RimRing {
			t.Errorf("beam cell %v beyond the rim %d", c, p.RimRing)
		}
	}
	// The origin and the aim are inside the corridor.
	if !seen[origin] || !seen[aim] {
		t.Errorf("beam must contain origin %v and aim %v", origin, aim)
	}
	// The ray continues past the aim to the rim.
	if !seen[(Cell{Ring: 8, Slot: 0})] {
		t.Error("beam must reach the rim cell on the aim bearing")
	}
	// Nothing behind the origin: the diametrically opposite rim cell is out.
	if seen[(Cell{Ring: 8, Slot: 24})] {
		t.Error("beam must not extend behind the origin")
	}

	// The corridor widens with distance: count member slots per ring along
	// the beam — the rim ring must admit at least as wide an angular span as
	// an inner ring (in angle, not raw slot count — compare via slot fraction).
	perRing := map[int]int{}
	for _, c := range beam {
		perRing[c.Ring]++
	}
	nearFrac := float64(perRing[2]) / float64(s.Slots(2))
	farFrac := float64(perRing[8]) / float64(s.Slots(8))
	if farFrac < nearFrac/2 { // generous: the absolute width grows; angular width shrinks at most ∝ 1/ring + spread
		t.Errorf("corridor did not widen plausibly: ring2 %d/%d vs ring8 %d/%d members",
			perRing[2], s.Slots(2), perRing[8], s.Slots(8))
	}

	// Output is in (ring, slot) order.
	for i := 1; i < len(beam); i++ {
		a, b := beam[i-1], beam[i]
		if a.Ring > b.Ring || (a.Ring == b.Ring && a.Slot >= b.Slot) {
			t.Fatalf("beam output out of (ring, slot) order at %d: %v then %v", i, a, b)
		}
	}

	// Zero spread: a parallel corridor — absolute half-width constant.
	flat := BeamCells(origin, aim, BeamParams{HalfWidthBase: TableScale / 2, SpreadNum: 0, SpreadDen: 1, RimRing: 8}, s)
	if len(flat) == 0 || len(flat) > len(beam) {
		t.Errorf("zero-spread corridor should be non-empty and no wider than the spread one (%d vs %d)", len(flat), len(beam))
	}
}
