package board

import "math"

// Lane-gate geometry (#0008 Decision #10): each charted lane meets a system's
// board at ONE fixed rim tile, so known choke points are stable geography. The
// tile is the lane's galaxy-tier bearing projected onto the rim — deterministic,
// so the server and every client agree. Mirrored in lib/hex, pinned by
// /fixtures/board/cases.json. The server is authoritative (it stamps gate tiles
// into system reads and arrival); the client mirror drives previews only.

// LaneGateHex returns the rim tile (ring == radius) where the lane from `self`
// toward `neighbor` meets self's board. The bearing is the lane's azimuth in the
// galaxy's flattened XY-disk (#0001 coords, z ignored — the disk is thin in z);
// the gate is the rim hex whose board direction is angularly closest to it. Ties
// resolve to the earliest hex in RingHexes(radius) order (the RouteAround
// convention). radius <= 0 degenerates to the core.
func LaneGateHex(selfX, selfY, neighborX, neighborY float64, radius int) Hex {
	if radius <= 0 {
		return Hex{0, 0}
	}
	bearing := math.Atan2(neighborY-selfY, neighborX-selfX)
	best := Hex{}
	bestDelta := math.MaxFloat64
	for _, h := range RingHexes(radius) {
		hx, hy := hexDirection(h)
		delta := angleDelta(math.Atan2(hy, hx), bearing)
		if delta < bestDelta {
			bestDelta = delta
			best = h
		}
	}
	return best
}

// hexDirection is a hex's cartesian direction from the centre in the board's
// pointy-top layout (redblobgames, matching lib/hex/pixel.ts's hexToPixel), with
// the screen-down y negated so galactic-north maps to the top of the board. Only
// the direction matters, so the render scale (HEX_SIZE) is dropped.
func hexDirection(h Hex) (x, y float64) {
	return math.Sqrt(3) * (float64(h.Q) + float64(h.R)/2), -1.5 * float64(h.R)
}

// angleDelta is the absolute smallest angle between two bearings, in [0, π].
func angleDelta(a, b float64) float64 {
	d := math.Mod(a-b, 2*math.Pi)
	if d < 0 {
		d += 2 * math.Pi
	}
	if d > math.Pi {
		d = 2*math.Pi - d
	}
	return d
}
