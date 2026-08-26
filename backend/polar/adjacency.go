package polar

// IsAdjacent decides whether two polar cells touch, in integer arithmetic
// alone (openspec board-tactical-math, "Lattice Adjacency Is True Corner
// Contact"). Two cells are adjacent when their rings differ by at most one
// and — where neither is the core — twice their angular separation does not
// exceed the sum of the two cells' angular widths: true corner contact,
// admitting exactly the cell pairs that geometrically touch (edge or corner)
// and no others. Where either cell is the core, the ring difference alone
// decides. Corner contact counts: a step that changes both ring and slot is
// adjacent, and a path is permitted to take one (an edge-only variant fails
// 97% of swept paths — design.md).
//
// Tightened 2026-08-25 (rewrite-board-on-polar-lattice, closing the fork the
// landed loose predicate `g·min(Sa,Sb) ≤ D` recorded): at a doubling
// boundary the loose bound counted a coarse cell adjacent to one outer cell
// beyond each of its angular edges despite half a fine cell of empty lattice
// between them. Under true corner contact those two phantom neighbors are
// not adjacent; within a band and at the core the two bounds coincide, so
// this is the only behavior change. ArcPath's stitch pass (path.go) repairs
// the sampler steps this retightening makes illegal.
func IsAdjacent(a, b Cell, s Schedule) bool {
	dr := a.Ring - b.Ring
	if dr < 0 {
		dr = -dr
	}
	if dr > 1 {
		return false
	}
	if a.Ring <= 0 || b.Ring <= 0 {
		return true // ring difference alone decides at the core (dr ≤ 1 here)
	}
	sa := int64(s.Slots(a.Ring))
	sb := int64(s.Slots(b.Ring))
	d := max(sa, sb)
	// Both slots scaled onto the finer ring's grid (the schedule's 1:2 steps
	// make d an exact multiple of both), then the wrapped shorter-way
	// separation g in 1/d-turn units. In those units cell widths are d/Sa and
	// d/Sb, so true corner contact `2g ≤ D/Sa + D/Sb` is already integer.
	pa := int64(a.Slot) * (d / sa)
	pb := int64(b.Slot) * (d / sb)
	g := ((pa-pb)%d + d) % d
	g = min(g, d-g)
	return 2*g <= d/sa+d/sb
}
