// Package board holds the pure tactical-board math shared across the backend
// (system interiors, fleet movement) and mirrored on the client. It has no
// Firestore or clock dependency. The Go↔TS determinism seam lives here: the
// recorded cases in /fixtures/board are the contract both sides assert against
// (build order cross-cutting rule).
package board

// Hex is an axial board coordinate (redblobgames convention). The star sits at
// (0,0); a hex's ring is its distance from the star.
type Hex struct {
	Q int `json:"q" firestore:"q"`
	R int `json:"r" firestore:"r"`
}

type cube struct{ x, y, z int }

func (h Hex) toCube() cube { return cube{x: h.Q, z: h.R, y: -h.Q - h.R} }
func (c cube) toHex() Hex  { return Hex{Q: c.x, R: c.z} }

var cubeDirections = [6]cube{
	{1, -1, 0}, {1, 0, -1}, {0, 1, -1}, {-1, 1, 0}, {-1, 0, 1}, {0, -1, 1},
}

func cubeAdd(a, b cube) cube      { return cube{a.x + b.x, a.y + b.y, a.z + b.z} }
func cubeScale(c cube, k int) cube { return cube{c.x * k, c.y * k, c.z * k} }

// Distance is the hex (ring) distance between two hexes.
func Distance(a, b Hex) int {
	ac, bc := a.toCube(), b.toCube()
	return (abs(ac.x-bc.x) + abs(ac.y-bc.y) + abs(ac.z-bc.z)) / 2
}

// Ring is a hex's distance from the centre.
func Ring(h Hex) int { return Distance(Hex{0, 0}, h) }

// RingHexes returns the hexes on the given ring, walked in a fixed order so a
// stored angle index is stable across Go and TS.
func RingHexes(ring int) []Hex {
	if ring <= 0 {
		return []Hex{{0, 0}}
	}
	out := make([]Hex, 0, 6*ring)
	c := cubeScale(cubeDirections[4], ring)
	for side := 0; side < 6; side++ {
		for step := 0; step < ring; step++ {
			out = append(out, c.toHex())
			c = cubeAdd(c, cubeDirections[side])
		}
	}
	return out
}

// Line returns the contiguous hex line from a to b (inclusive of both ends)
// using cube linear interpolation + rounding — the path a burn traverses.
func Line(a, b Hex) []Hex {
	n := Distance(a, b)
	if n == 0 {
		return []Hex{a}
	}
	ac, bc := a.toCube(), b.toCube()
	out := make([]Hex, 0, n+1)
	for i := 0; i <= n; i++ {
		t := float64(i) / float64(n)
		out = append(out, cubeRound(
			lerp(float64(ac.x), float64(bc.x), t),
			lerp(float64(ac.y), float64(bc.y), t),
			lerp(float64(ac.z), float64(bc.z), t),
		).toHex())
	}
	return out
}

func lerp(a, b, t float64) float64 { return a + (b-a)*t }

// cubeRound rounds fractional cube coordinates to the nearest valid hex,
// preserving x+y+z==0.
func cubeRound(x, y, z float64) cube {
	rx, ry, rz := roundf(x), roundf(y), roundf(z)
	dx, dy, dz := absf(float64(rx)-x), absf(float64(ry)-y), absf(float64(rz)-z)
	switch {
	case dx > dy && dx > dz:
		rx = -ry - rz
	case dy > dz:
		ry = -rx - rz
	default:
		rz = -rx - ry
	}
	return cube{rx, ry, rz}
}

func roundf(f float64) int {
	if f < 0 {
		return -int(-f + 0.5)
	}
	return int(f + 0.5)
}

func absf(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
