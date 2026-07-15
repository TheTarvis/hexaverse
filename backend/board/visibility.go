package board

import "sort"

// Visibility — the line-of-sight law both sensing modes obey (#0006 Decisions
// #15/#16): large bodies shadow everything strictly behind them on the hex
// line, for the aimed scan beam and the passive ambient bubble alike. Pure
// geometry; which features occlude (star, planets) is the caller's rule.

// LineOfSight reports whether target is visible from origin given the set of
// occluding hexes. Blocked iff an occluder sits STRICTLY between the two on
// the hex line — the endpoints never block themselves, so the first body on a
// line is itself seen (you see the planet, not past it).
func LineOfSight(origin, target Hex, occluders map[Hex]bool) bool {
	if len(occluders) == 0 {
		return true
	}
	line := Line(origin, target)
	for i := 1; i < len(line)-1; i++ {
		if occluders[line[i]] {
			return false
		}
	}
	return true
}

// BeamParams tunes the scan beam's corridor (#0006 Decision #15): a hex-line
// spine from the origin through the aim, extended to the rim, widened by
// w(i) = HalfWidthBase + floor(Spread·i) hexes at spine index i — a narrow
// cone that grows gently with distance.
type BeamParams struct {
	HalfWidthBase int     `json:"halfWidthBase"`
	Spread        float64 `json:"spread"`
	RimRing       int     `json:"rimRing"`
}

// BeamHexes returns the beam corridor's hex set, sorted (Q, then R) so the
// Go↔TS golden fixtures compare byte-stable. The spine is the hex line from
// origin through aim, extended until it leaves the rim; membership is pure
// geometry — occlusion is LineOfSight's job, composed by the caller. An aim
// on the origin has no direction and yields an empty beam.
func BeamHexes(origin, aim Hex, p BeamParams) []Hex {
	if origin == aim {
		return nil
	}
	// Extend the aim direction far past the rim, then walk the spine outward.
	// Ring-along-a-line is convex (max of |linear| coords), so once the spine
	// leaves the rim it never re-enters — safe to stop there.
	oc, ac := origin.toCube(), aim.toCube()
	k := 4*p.RimRing + 1
	far := cube{
		x: oc.x + (ac.x-oc.x)*k,
		y: oc.y + (ac.y-oc.y)*k,
		z: oc.z + (ac.z-oc.z)*k,
	}
	set := map[Hex]bool{}
	for i, s := range Line(origin, far.toHex()) {
		if Ring(s) > p.RimRing {
			break
		}
		w := p.HalfWidthBase + int(p.Spread*float64(i))
		for _, h := range Neighborhood(s, w) {
			if Ring(h) <= p.RimRing {
				set[h] = true
			}
		}
	}
	out := make([]Hex, 0, len(set))
	for h := range set {
		out = append(out, h)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Q != out[j].Q {
			return out[i].Q < out[j].Q
		}
		return out[i].R < out[j].R
	})
	return out
}

// Neighborhood returns every hex within the given radius of center (radius 0
// is just the center) — the filled disc, walked ring by ring in RingHexes'
// stable order.
func Neighborhood(center Hex, radius int) []Hex {
	if radius <= 0 {
		return []Hex{center}
	}
	cc := center.toCube()
	out := make([]Hex, 0, 1+3*radius*(radius+1))
	out = append(out, center)
	for ring := 1; ring <= radius; ring++ {
		for _, h := range RingHexes(ring) {
			out = append(out, cubeAdd(cc, h.toCube()).toHex())
		}
	}
	return out
}
