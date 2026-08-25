package board

import "math"

// Lane-gate geometry (#0008 Decision #10): each charted lane meets a system's
// board at ONE fixed tile, so known choke points are stable geography. The tile
// is the lane's galaxy-tier bearing projected onto the gate ring — deterministic,
// so the server and every client agree. Mirrored in lib/hex, pinned by
// /fixtures/board/cases.json. The server is authoritative (it stamps gate tiles
// into system reads and arrival); the client mirror drives previews only.

// GateRing is the ring a lane mouth sits on: the inner edge of the outer band,
// three rings in from the rim (2026-07-14 decision — docs/plans/movement-board.md,
// movement-galaxy.md). Not the rim edge: the 3-ring shell outside it is the cold
// outer dark, maneuver/lurk room around an arrival, so interdiction has room on
// both sides of the door. Band-relative (a fixed −3 offset), clamped to a valid
// interior ring so small boards degrade gracefully.
func GateRing(radius int) int {
	if r := radius - 3; r >= 1 {
		return r
	}
	return 1
}

// LaneGateHex returns the tile on the gate ring (GateRing(radius)) where the lane
// from `self` toward `neighbor` meets self's board. The bearing is the lane's
// azimuth in the galaxy's flattened XY-disk (#0001 coords, z ignored — the disk is
// thin in z); the gate is the gate-ring hex whose board direction is angularly
// closest to it. Ties resolve to the earliest hex in RingHexes order (the
// RouteAround convention). radius <= 0 degenerates to the core.
func LaneGateHex(selfX, selfY, neighborX, neighborY float64, radius int) Hex {
	if radius <= 0 {
		return Hex{0, 0}
	}
	bearing := math.Atan2(neighborY-selfY, neighborX-selfX) // determinism:allow(discretized)
	best := Hex{}
	bestDelta := math.MaxFloat64
	for _, h := range RingHexes(GateRing(radius)) {
		hx, hy := hexDirection(h)
		delta := angleDelta(math.Atan2(hy, hx), bearing) // determinism:allow(discretized)
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
	return math.Sqrt(3) * (float64(h.Q) + float64(h.R)/2), -1.5 * float64(h.R) // determinism:allow(discretized)
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
