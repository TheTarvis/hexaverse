package board

import "hexaverse/common"

// Solution is the canonical output of a movement solve: the path the fleet
// traverses, the hex it meets/settles on, and the world time it arrives. The
// server persists this at commit; determinism makes "arrives at T" truth, not
// estimate (#0004).
type Solution struct {
	Path       []Hex
	MeetHex    Hex
	ArriveTime common.WorldMillis
}

// SolveHex plots a burn to a fixed hex: a contiguous path that routes around the
// star (RouteAround) and an arrival time of now + pathLength × msPerTile — the
// ETA follows the detour, not the straight-line distance.
func SolveHex(from, dest Hex, now, msPerTile common.WorldMillis) Solution {
	path := RouteAround(from, dest)
	arrive := now + common.WorldMillis(len(path)-1)*msPerTile
	return Solution{Path: path, MeetHex: dest, ArriveTime: arrive}
}

// SolveIntercept is the deterministic lead-solve against a coasting body: the
// earliest future world time at which the fleet (from its current hex, at
// msPerTile) can be where the body WILL be. The game leads the target; the
// player never eyeballs the lead (#0004). With motion off/slow the body's
// position is constant and this collapses to SolveHex against its current hex —
// the motion-agnostic property, no special-case.
func SolveIntercept(from Hex, target Orbit, now, msPerTile, horizon common.WorldMillis) Solution {
	step := msPerTile
	if step <= 0 {
		step = 1
	}
	for t := now; t <= now+horizon; t += step {
		pos := OrbState(target, t)
		path := RouteAround(from, pos)
		travel := common.WorldMillis(len(path)-1) * msPerTile
		if now+travel <= t {
			return Solution{Path: path, MeetHex: pos, ArriveTime: t}
		}
	}
	// No feasible lead within the horizon — aim at the body's current position.
	pos := OrbState(target, now)
	path := RouteAround(from, pos)
	return Solution{
		Path:       path,
		MeetHex:    pos,
		ArriveTime: now + common.WorldMillis(len(path)-1)*msPerTile,
	}
}
