package board

// Lane-gate geometry (#0008 Decision #10): each charted lane meets a system's
// board at ONE fixed cell, so known choke points are stable geography. The cell
// is the lane's galaxy-tier bearing projected onto the gate ring — deterministic,
// so the server and every client agree. Mirrored in lib/board, pinned by
// /fixtures/board/cases.json. The server is authoritative (it stamps gate cells
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

// LaneGateCell returns the cell on the gate ring (GateRing(radius)) where the
// lane from `self` toward `neighbor` meets self's board. The bearing is the
// lane's azimuth in the galaxy's flattened XY-disk (#0001 coords, z ignored —
// the disk is thin in z); the gate is the gate-ring slot whose pinned-table
// direction has the maximum dot product with that bearing vector, ties
// resolved to the lower slot index (openspec board-tactical-math,
// "Deterministic Lane Gate Projection"). radius <= 0 degenerates to the core.
//
// The bearing inputs remain floats from the galaxy generator: they are
// rule-bearing only through this discretized, tie-broken argmax — the same
// hazard class as the retired LaneGateHex, governed by cross-stack-determinism's
// discretized-choice requirement and its near-tie deviation-register entry
// (docs/defects/2026-08-25-lanegate-near-tie-divergence.md). The float64(...)
// conversions around each product force the intermediate rounding the Go spec
// otherwise lets arm64 fuse (FMA), keeping the dot values identical across
// build targets for all but true near-ties.
func LaneGateCell(selfX, selfY, neighborX, neighborY float64, radius int) Cell {
	if radius <= 0 {
		return Cell{Ring: 0, Slot: 0}
	}
	ring := GateRing(radius)
	slots := Schedule(radius).Slots(ring)
	points := tablePoints(slots)
	bx := neighborX - selfX
	by := neighborY - selfY
	best := 0
	bestDot := dot(points[0], bx, by) // determinism:allow(discretized)
	for slot := 1; slot < slots; slot++ {
		if d := dot(points[slot], bx, by); d > bestDot { // determinism:allow(discretized)
			bestDot = d
			best = slot
		}
	}
	return Cell{Ring: ring, Slot: best}
}

// dot is the pinned-table direction's dot product with a bearing vector. The
// explicit float64 conversions around each product are load-bearing: they
// force the products to round before the add (the Go spec permits fusing
// a*b + c*d into FMA on arm64 otherwise — cross-stack-determinism's
// contraction clause).
func dot(p [2]int64, bx, by float64) float64 {
	return float64(float64(p[0])*bx) + float64(float64(p[1])*by) // determinism:allow(discretized)
}
