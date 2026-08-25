package polar

// IsAdjacent decides whether two polar cells touch, in integer arithmetic
// alone (openspec polar-lattice-math, "Lattice Adjacency Is an Integer
// Predicate"). Two cells are adjacent when their rings differ by at most one
// and — where neither is the core — their angular separation is within one
// cell width of the COARSER of the two rings (fewer slots span more angle
// per cell). Where either cell is the core, the ring difference alone
// decides. Corner contact counts: a step that changes both ring and slot is
// adjacent, and a path is permitted to take one (an edge-only variant fails
// 97% of swept paths — design.md).
//
// This is the exact-integer restatement of the spike's float isAdjacent with
// its `* 1.01` float-error fudge removed — verified to reproduce it on all
// ±1-ring ordered pairs with zero disagreements (the fudge covered float
// error and nothing else; see adjacency_test.go).
//
// Known looseness, deliberately preserved (open fork, Travis's call — see
// design.md Open Questions): at a doubling boundary this predicate counts a
// coarse cell adjacent to one outer cell beyond each of its angular edges
// that does not geometrically touch it; true corner contact would be the
// tighter bound 2g ≤ D/Sa + D/Sb.
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
	d, m := sa, sb // d = max, m = min
	if sb > sa {
		d, m = sb, sa
	}
	// Both slots scaled onto the finer ring's grid (the schedule's 1:2 steps
	// make d an exact multiple of both), then the wrapped shorter-way
	// separation g in 1/d-turn units. Adjacent when g ≤ d/m — one coarse cell
	// width — kept in cross-multiplied integer form.
	pa := int64(a.Slot) * (d / sa)
	pb := int64(b.Slot) * (d / sb)
	g := ((pa-pb)%d + d) % d
	g = min(g, d-g)
	return g*m <= d
}
