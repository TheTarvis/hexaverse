package board

// Star avoidance: the star occupies the core hex (0,0), and a burn never flies
// through a sun. RouteAround is the movement-path function every solve uses; Line
// stays the pure geometric line (its fixtures are unchanged). Mirrored in
// lib/hex, pinned by /fixtures/board/cases.json.

// RouteAround returns the burn path from a to b that never crosses the core. It's
// Line unless the straight line would pass through (0,0), in which case it detours
// via the ring-1 hex beside the star that adds the least distance (ties resolve to
// the first such hex in RingHexes(1) order). When avoidance is impossible — an
// endpoint IS the core — it falls back to the direct line.
func RouteAround(a, b Hex) []Hex {
	direct := Line(a, b)
	if !pathHitsCore(direct) {
		return direct
	}
	var best []Hex
	for _, wp := range RingHexes(1) {
		aLeg := Line(a, wp)
		bLeg := Line(wp, b)
		if pathHitsCore(aLeg) || pathHitsCore(bLeg) {
			continue
		}
		merged := make([]Hex, 0, len(aLeg)+len(bLeg)-1)
		merged = append(merged, aLeg...)
		merged = append(merged, bLeg[1:]...)
		if best == nil || len(merged) < len(best) {
			best = merged
		}
	}
	if best == nil {
		return direct
	}
	return best
}

// pathHitsCore reports whether the path passes through the star at the core.
func pathHitsCore(path []Hex) bool {
	for _, h := range path {
		if h.Q == 0 && h.R == 0 {
			return true
		}
	}
	return false
}
