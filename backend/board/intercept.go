package board

import (
	"hexaverse/common"
	"hexaverse/polar"
)

// Solution is the canonical output of a movement solve: the path the fleet
// traverses, the cell it meets/settles on, and the world time it arrives. The
// server persists this at commit; determinism makes "arrives at T" truth, not
// estimate (#0004).
type Solution struct {
	Path       []Cell
	MeetCell   Cell
	ArriveTime common.WorldMillis
}

// SolveCell plots a burn to a fixed cell: the arc path (stitch included) and
// an arrival time of now + (pathLength−1) × msPerTile — the ETA follows the
// emitted path's cell-step count (openspec board-tactical-math,
// "Deterministic Movement Solve to a Fixed Cell"). No routing or avoidance
// applies: the path IS the arc — a polar path reaches the core only if an
// endpoint is the core, so the retired RouteAround has no successor.
func SolveCell(from, dest Cell, now, msPerTile common.WorldMillis, s polar.Schedule) Solution {
	path := polar.ArcPath(from, dest, s)
	arrive := now + common.WorldMillis(len(path)-1)*msPerTile
	return Solution{Path: path, MeetCell: Canon(dest, s), ArriveTime: arrive}
}

// SolveIntercept is the deterministic lead-solve against a coasting body: the
// earliest future world time at which the fleet (from its current cell, at
// msPerTile) can be where the body WILL be. The game leads the target; the
// player never eyeballs the lead (#0004). With motion off/slow the body's
// position is constant and this collapses to SolveCell against its current
// cell — the motion-agnostic property, no special-case.
//
// The target's orbit is an ARGUMENT, never a feature lookup — that seam is
// where a future moon target passes a parent-composed orbit without this
// solve changing (rewrite design: "the intercept seam anticipates moons").
//
// Arrival is always a slot-ENTRY instant of the target's orbit, not just any
// feasible moment. The renderer glides an orbiting glyph toward its next cell
// by the absolute window fraction, so the glyph sits on its logical cell
// centre only as it enters the cell; a burn glide ends on the meet-cell
// centre exactly. Meeting mid-window drew the ship a fraction of a cell
// behind the body and the dock fold then snapped it forward onto the parent
// glyph. Arriving on the entry instant makes ship and body glyphs kiss — the
// ETA reads slightly stretched (the ship paces itself to the window) rather
// than the burn lying.
func SolveIntercept(from Cell, target Orbit, now, msPerTile, horizon common.WorldMillis, s polar.Schedule) Solution {
	// Already co-occupying the target's cell → dock in place, no burn to pace.
	// The glide fraction is absolute per ring, so the glyphs already coincide.
	from = Canon(from, s)
	nowPos := OrbState(target, now, s)
	if nowPos == from {
		return Solution{Path: []Cell{from}, MeetCell: from, ArriveTime: now}
	}
	if target.Ring > 0 && target.Period > 0 {
		steps := int64(s.Slots(target.Ring))
		// k counts the body's slot advances since the epoch (OrbState's trunc
		// division); its k-th slot entry is the first world-ms where the
		// advance reaches k. Walk entries after `now` until one is reachable.
		k := int64(now) * steps / int64(target.Period)
		for {
			k++
			tk := common.WorldMillis((k*int64(target.Period) + steps - 1) / steps)
			if tk > now+horizon {
				break
			}
			pos := OrbState(target, tk, s)
			path := polar.ArcPath(from, pos, s)
			travel := common.WorldMillis(len(path)-1) * msPerTile
			if now+travel <= tk {
				return Solution{Path: path, MeetCell: pos, ArriveTime: tk}
			}
		}
	}
	// No slot entry within the horizon — an effectively static body (motion
	// off/slow, drawn snapped to its cell centre) — or none reachable: aim at
	// the body's current position, plain-burn ETA.
	path := polar.ArcPath(from, nowPos, s)
	return Solution{
		Path:       path,
		MeetCell:   nowPos,
		ArriveTime: now + common.WorldMillis(len(path)-1)*msPerTile,
	}
}
