package polar

// ArcPath is the lattice's straight line, which is an arc (openspec
// polar-lattice-math, "A Straight Path Is an Arc"). It is the spike's
// arcPath rebuilt on the exact-rational basis: linearly interpolate ring and
// angle between the endpoints, resolve the RING at each sample first, then
// pick the angularly nearest slot on that rounded ring — with every
// intermediate value an integer through to the final rounding, so there is
// no float to contract, drift, or disagree across the Go↔TS seam or across
// Go build targets (the FMA-contraction hazard class of
// docs/defects/2026-08-25-line-fma-arch-divergence.md has no expression to
// fuse here).
//
// Units: angles are measured in 1/L turns, where L is the slot count of the
// FINEST — outermost — ring the path spans. The schedule's 1:2 radial steps
// make L an exact integer multiple of both endpoints' slot counts, so both
// endpoint angles are exact integers in these units and the sweep carries no
// fractional remainder.
//
// Sampling is once per cell the path must cross, measured against the finest
// ring spanned — NOT the mean ring (the spike's mean-ring formula emits
// non-adjacent slot jumps on 12–26% of swept paths; finest-ring measured
// zero across every schedule tested — design.md's corrected per-cell-sampling
// decision). Oversampling is also wrong, in the other direction: it emits a
// ring change and a slot change as two separate cells instead of one
// diagonal step (dense sampling measured 121° max turn against 94° per-cell
// on the bench).
//
// The three exact-tie rules, fixed for determinism (any consistent choice
// would do; an unstated one is how two implementations fork):
//  1. interpolated ring exactly halfway between two integer rings → round
//     toward the DESTINATION ring;
//  2. interpolated angle exactly equidistant between two adjacent slots →
//     the slot in the sweep's direction of travel; where the sweep is zero
//     (every purely radial path, including any with the core as an endpoint)
//     → the HIGHER candidate slot index before normalization, so a tie
//     between the ring's last slot and slot 0 resolves to slot 0;
//  3. an angular difference of exactly half a turn → always sweep in the
//     increasing-slot-index direction.
//
// A core endpoint sweeps no angle: it inherits the non-core endpoint's
// bearing, which an inner ring with fewer slots represents only to within
// half of its own cell width. Corollary (openspec "A Path Reaches the Core
// Only If an Endpoint Is the Core"): the interpolated ring never rounds
// below min(from.Ring, to.Ring), so a path only reaches the core when an
// endpoint IS the core — routeAround has nothing to do here, and no cell is
// ever inserted or altered to avoid the core.
func ArcPath(from, to Cell, s Schedule) []Cell {
	from = canon(from, s)
	to = canon(to, s)
	if from == to {
		return []Cell{from}
	}

	finest := max(from.Ring, to.Ring)
	L := int64(s.Slots(finest))

	// Endpoint angles in 1/L turns. A core endpoint inherits the other end's
	// angle (purely radial departure/arrival). Both-core is caught above.
	var aFrom, aTo int64
	if from.Ring > 0 {
		aFrom = int64(from.Slot) * (L / int64(s.Slots(from.Ring)))
	}
	if to.Ring > 0 {
		aTo = int64(to.Slot) * (L / int64(s.Slots(to.Ring)))
	}
	if from.Ring == 0 {
		aFrom = aTo
	}
	if to.Ring == 0 {
		aTo = aFrom
	}

	// Shorter-direction sweep, wrapped into (-L/2, L/2]. An exact half-turn
	// (2d == L) keeps +L/2 — tie rule 3, the increasing-slot-index direction.
	d := ((aTo-aFrom)%L + L) % L
	if 2*d > L {
		d -= L
	}

	// N = max(2, |Δring|, sweep in slot units of the finest ring spanned):
	// one interpolation interval per cell the path must cross.
	dr := int64(to.Ring - from.Ring)
	adr := dr
	if adr < 0 {
		adr = -adr
	}
	ad := d
	if ad < 0 {
		ad = -ad
	}
	n := max(int64(2), adr, ad)

	out := make([]Cell, 0, n+1)
	for i := int64(0); i <= n; i++ {
		// Ring first. Interpolated ring = (from.Ring*n + Δring*i) / n — the
		// numerator is non-negative, so plain division is floor division.
		rn := int64(from.Ring)*n + dr*i
		q := rn / n
		rem := rn - q*n
		var ring int64
		switch {
		case 2*rem < n:
			ring = q
		case 2*rem > n:
			ring = q + 1
		default: // exactly halfway — tie rule 1: toward the destination ring
			if dr > 0 {
				ring = q + 1
			} else {
				ring = q
			}
		}

		var cell Cell
		if ring <= 0 {
			cell = Cell{Ring: 0, Slot: 0}
		} else {
			// Then the angle, on the rounded ring. Interpolated angle =
			// (aFrom*n + d*i) / n in 1/L turns; the nearest slot k on a ring
			// with slotCount slots minimizes |angle − k/slotCount| turns, i.e.
			// k = round(x/den) with x = (aFrom*n + d*i)·slotCount, den = n·L.
			slotCount := int64(s.Slots(int(ring)))
			x := (aFrom*n + d*i) * slotCount
			den := n * L
			k := floorDiv(x, den)
			krem := x - k*den
			switch {
			case 2*krem < den:
				// k stands
			case 2*krem > den:
				k++
			default: // exactly equidistant — tie rule 2
				switch {
				case d > 0:
					k++ // sweep travels toward increasing slots
				case d < 0:
					// sweep travels toward decreasing slots — k (the lower) stands
				default:
					k++ // zero sweep: the higher candidate; normalization wraps S→0
				}
			}
			cell = Cell{Ring: int(ring), Slot: int(normalizeSlot64(k, slotCount))}
		}

		if last := len(out) - 1; last < 0 || out[last] != cell {
			out = append(out, cell)
		}
	}
	return out
}

// floorDiv returns ⌊a/b⌋ for b > 0 (Go's / truncates toward zero, which
// differs from floor for negative numerators).
func floorDiv(a, b int64) int64 {
	q := a / b
	if a%b != 0 && (a < 0) != (b < 0) {
		q--
	}
	return q
}
