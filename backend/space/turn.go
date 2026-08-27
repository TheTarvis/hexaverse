package space

import "math"

// SubTurns is an angle expressed in 1/2^20 of one full revolution — exact,
// wrap-safe, and the index into the pinned turn table (table.go). An
// Orbit's phase, inclination, and node are all SubTurns, never floating-
// point radians or degrees (design.md Decision 3; space-kinematics:
// "Orbital Angles Resolve Through a Pinned Table, Never Runtime
// Trigonometry").
type SubTurns int64

// SubTurn is the number of sub-turn units in one full revolution.
const SubTurn SubTurns = 1 << 20

// DefaultPhaseIndex is the documented, fixed default phase used whenever a
// degenerate (zero-length, or zero-in-the-horizontal-plane) offset would
// otherwise leave a phase index undefined. Callers that can produce a
// degenerate offset (SolveBurn's insertion phase derivation, park.go's
// ReleaseStationkeep) check for it themselves and substitute this value —
// PhaseIndexOf itself is never asked to special-case zero (space-kinematics:
// "An offset exactly equidistant..." scenario note: "this scenario does not
// cover the zero offset; its resolution ... is defined by the requirements
// that produce it").
const DefaultPhaseIndex SubTurns = 0

// wrapSubTurn reduces an arbitrary int64 sub-turn value onto [0, SubTurn).
// SubTurn is a power of two, so a bitwise AND against SubTurn-1 is the exact
// modular reduction for every v, including negative v: Go's two's-complement
// integer representation makes v & (SubTurn-1) agree with the mathematical
// non-negative remainder unconditionally, whereas a bare '%' keeps the sign
// of the dividend and would hand a negative index to the pinned table —
// wrap-safety design.md Decision 3 and space-kinematics "The Time Domain Is
// Explicit..." both require, and Go's own '%' semantics make a documented
// hazard rather than a hypothetical one.
func wrapSubTurn(v int64) SubTurns {
	return SubTurns(v & int64(SubTurn-1))
}

// floorMod reduces a onto [0, n) using floor (not truncating) semantics —
// the remainder consistent with rounding the quotient toward negative
// infinity, unlike Go's built-in '%', which truncates the quotient toward
// zero and so returns a negative remainder for a negative dividend.
//
// This distinction is load-bearing for Orbit/Park's own periodic advance
// (design.md Decision 3's "(t-epoch) % periodMs before the * SubTurn
// multiply" step): reducing elapsed time onto [0, period) BEFORE the
// advance multiply is what keeps the intermediate product from overflowing
// int64, but only a floor-consistent remainder preserves exact periodicity
// — elapsed and elapsed+period must produce the IDENTICAL advance, and
// Go's truncating '%' breaks that identity the moment elapsed goes
// negative (elapsed=-40000, period=90000 truncates to -40000, while
// elapsed+period=50000 truncates to 50000 — two different remainders for
// what must be the same phase, off by one sub-turn index after the
// truncating divide that follows). floorMod(-40000, 90000) and
// floorMod(50000, 90000) both correctly return 50000.
func floorMod(a, n int64) int64 {
	m := a % n
	if m < 0 {
		m += n
	}
	return m
}

// octantOf classifies a horizontal-plane offset (x, z) into one of eight
// 45-degree sectors by sign and magnitude comparison alone — exact, no
// table lookup, no transcendental (design.md Decision 3: "an octant
// reduction by sign/magnitude comparison"). Octant k covers coarse-table
// indices [k*128, (k+1)*128), i.e. angles [k*45, (k+1)*45) degrees, matching
// the coarse table's own 1024-entry, 1/1024-turn spacing (1024 / 8 = 128
// exactly).
func octantOf(x, z float64) int {
	absX, absZ := math.Abs(x), math.Abs(z)
	switch {
	case x >= 0 && z >= 0 && absX >= absZ:
		return 0
	case x >= 0 && z >= 0:
		return 1
	case x < 0 && z >= 0 && absX < absZ:
		return 2
	case x < 0 && z >= 0:
		return 3
	case x < 0 && z < 0 && absX >= absZ:
		return 4
	case x < 0 && z < 0:
		return 5
	case x >= 0 && z < 0 && absX < absZ:
		return 6
	default: // x >= 0 && z < 0 && absX >= absZ
		return 7
	}
}

// crossAtOrBefore reports whether the table direction (dirX, dirZ) is at or
// before (offX, offZ) in the increasing-index (counter-clockwise) ordering,
// via the sign of the cross product dirX*offZ - dirZ*offX (design.md
// Decision 3: "bracketing by the sign of the cross product x*tz - z*tx").
// A zero cross product is an exact directional match and resolves to
// "at or before" (>= 0), which is what routes an offset that lies exactly
// on a table entry's own direction to that entry's own index rather than
// the one before it (space-kinematics: "An offset that lies exactly on a
// table entry's direction ... SHALL resolve to that entry's own index").
// Every product is float64(...)-guarded per Decision 5. This ordering is
// only valid across an angular span strictly less than 180 degrees — every
// call site here searches within a single octant (45 degrees) or a single
// coarse bracket (1/1024 turn), both comfortably inside that bound.
func crossAtOrBefore(dirX, dirZ, offX, offZ float64) bool {
	cross := float64(dirX*offZ) - float64(dirZ*offX)
	return cross >= 0
}

// phaseIndexSteps is the fixed total comparison count PhaseIndexOf always
// reports: 3 for the octant reduction, 7 to binary-search the 128-entry
// coarse span within that octant (128 = 2^7), and 10 to binary-search the
// 1024-entry fine span within the resolved coarse bracket (space-kinematics:
// "Fixed-Round Iteration Replaces Every Data-Dependent Loop Exit" — "a fixed
// twenty-comparison search, never an early-exit loop").
const phaseIndexSteps = 3 + 7 + 10

// PhaseIndexOf derives a phase index from a Cartesian offset's horizontal
// (X, Z) plane by table lookup alone — never math.Atan2 (design.md
// Decision 3). It always executes the full fixed twenty-comparison
// bracketing search (octant reduction, then coarse, then fine) and always
// reports steps == 20, with no early exit for an offset that lands exactly
// on a table entry.
func PhaseIndexOf(offset Vec3) (idx SubTurns, steps int) {
	x, z := offset.X, offset.Z

	oct := octantOf(x, z)
	coarseLo := SubTurns(oct * 128)
	coarseHi := coarseLo + 128

	for i := 0; i < 7; i++ {
		mid := (coarseLo + coarseHi) / 2
		dirX, dirZ := CosSin(mid << 10)
		if crossAtOrBefore(dirX, dirZ, x, z) {
			coarseLo = mid
		} else {
			coarseHi = mid
		}
	}
	// coarseLo is now the resolved coarse bracket's lower index.

	fineLo, fineHi := SubTurns(0), SubTurns(1024)
	for i := 0; i < 10; i++ {
		mid := (fineLo + fineHi) / 2
		full := (coarseLo << 10) | mid
		dirX, dirZ := CosSin(full)
		if crossAtOrBefore(dirX, dirZ, x, z) {
			fineLo = mid
		} else {
			fineHi = mid
		}
	}

	return wrapSubTurn(int64((coarseLo << 10) | fineLo)), phaseIndexSteps
}
