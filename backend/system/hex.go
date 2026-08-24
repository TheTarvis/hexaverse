package system

// Hex is an axial board coordinate (redblobgames convention). Storage is axial;
// algorithms convert to cube. The star sits at (0,0); a hex's ring is its
// distance from the star, which is its orbital distance.
type Hex struct {
	Q int `json:"q" firestore:"q"`
	R int `json:"r" firestore:"r"`
}

// cube is the cube-coordinate form used for ring/distance/perimeter algorithms.
type cube struct{ x, y, z int }

func (h Hex) toCube() cube { return cube{x: h.Q, z: h.R, y: -h.Q - h.R} }
func (c cube) toHex() Hex  { return Hex{Q: c.x, R: c.z} }

func cubeAdd(a, b cube) cube       { return cube{a.x + b.x, a.y + b.y, a.z + b.z} }
func cubeScale(c cube, k int) cube { return cube{c.x * k, c.y * k, c.z * k} }

// cubeDirections are the six neighbour steps, ordered so a ring walk is
// deterministic.
var cubeDirections = [6]cube{
	{1, -1, 0}, {1, 0, -1}, {0, 1, -1}, {-1, 1, 0}, {-1, 0, 1}, {0, -1, 1},
}

// hexDistance is the ring number of h (distance from the centre).
func hexDistance(h Hex) int {
	c := h.toCube()
	return (abs(c.x) + abs(c.y) + abs(c.z)) / 2
}

// ringHexes returns the hexes on the given ring, walked in a fixed order so a
// stored angle index is stable. Ring 0 is just the centre.
func ringHexes(ring int) []Hex {
	if ring <= 0 {
		return []Hex{{0, 0}}
	}
	out := make([]Hex, 0, 6*ring)
	// Start at the hex `ring` steps along direction 4, then walk the six sides.
	c := cubeScale(cubeDirections[4], ring)
	for side := 0; side < 6; side++ {
		for step := 0; step < ring; step++ {
			out = append(out, c.toHex())
			c = cubeAdd(c, cubeDirections[side])
		}
	}
	return out
}

// hexAtRingAngle picks the position on `ring` at the given angle index,
// wrapping. This is the epoch anchor of an orbiting feature.
// HexAtRingAngle is the exported form: the station store derives its board hex
// from the same ring/angle law every orbiting feature obeys, without reaching
// into this package's unexported helpers.
func HexAtRingAngle(ring, angle int) Hex { return hexAtRingAngle(ring, angle) }

func hexAtRingAngle(ring, angle int) Hex {
	hs := ringHexes(ring)
	n := len(hs)
	idx := ((angle % n) + n) % n
	return hs[idx]
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
