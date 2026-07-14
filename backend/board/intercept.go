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
//
// Arrival is always a cell-ENTRY instant of the target's orbit, not just any
// feasible moment. The renderer glides an orbiting glyph toward its next cell
// by the absolute window fraction, so the glyph sits on its logical hex centre
// only as it enters the cell; a burn glide ends on the meet-hex centre exactly.
// Meeting mid-window drew the ship a fraction of a tile behind the body and the
// dock fold then snapped it forward onto the parent glyph. Arriving on the
// entry instant makes ship and body glyphs kiss — the ETA reads slightly
// stretched (the ship paces itself to the window) rather than the burn lying.
func SolveIntercept(from Hex, target Orbit, now, msPerTile, horizon common.WorldMillis) Solution {
	// Already co-occupying the target's hex → dock in place, no burn to pace.
	// The glide fraction is absolute per ring, so the glyphs already coincide.
	nowPos := OrbState(target, now)
	if nowPos == from {
		return Solution{Path: []Hex{from}, MeetHex: from, ArriveTime: now}
	}
	if target.Ring > 0 && target.Period > 0 {
		steps := int64(6 * target.Ring)
		// k counts the body's cell advances since the epoch (OrbState's trunc
		// division); its k-th cell entry is the first world-ms where the
		// advance reaches k. Walk entries after `now` until one is reachable.
		k := int64(now) * steps / int64(target.Period)
		for {
			k++
			tk := common.WorldMillis((k*int64(target.Period) + steps - 1) / steps)
			if tk > now+horizon {
				break
			}
			pos := OrbState(target, tk)
			path := RouteAround(from, pos)
			travel := common.WorldMillis(len(path)-1) * msPerTile
			if now+travel <= tk {
				return Solution{Path: path, MeetHex: pos, ArriveTime: tk}
			}
		}
	}
	// No cell entry within the horizon — an effectively static body (motion
	// off/slow, drawn snapped to its cell centre) — or none reachable: aim at
	// the body's current position, plain-burn ETA.
	path := RouteAround(from, nowPos)
	return Solution{
		Path:       path,
		MeetHex:    nowPos,
		ArriveTime: now + common.WorldMillis(len(path)-1)*msPerTile,
	}
}
