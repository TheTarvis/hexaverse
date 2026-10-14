package space

import (
	"math"

	"hexaverse/common"
)

// StaysWithinRange proves bounds over trajectory intervals, subdividing only
// ambiguous intervals. It uses closed-form trajectories and Bezier convex
// hulls, not a simulation or accumulated per-tick state. Time is WorldMillis.
func StaysWithinRange(bodies Bodies, state ShipState, target string, from, to common.WorldMillis, limit float64) bool {
	if to < from {
		return false
	}
	if state.Park != nil && state.Park.BodyId == target && state.Park.Kind == ParkOrbit {
		return state.Park.Radius <= limit
	}
	var check func(common.WorldMillis, common.WorldMillis) bool
	check = func(a, b common.WorldMillis) bool {
		mid := a + (b-a)/2
		ship, err := StatePosition(bodies, state, mid)
		if err != nil {
			return false
		}
		host, err := Position(bodies, target, mid)
		if err != nil {
			return false
		}
		distance := ship.Sub(host).Length()
		if distance > limit {
			return false
		}
		spread := stateSpread(bodies, state, a, b, ship) + bodySpread(bodies, target, a, b, 0)
		if distance+spread <= limit {
			return true
		}
		if b-a <= 1 {
			for _, t := range []common.WorldMillis{a, b} {
				p, e := StatePosition(bodies, state, t)
				q, f := Position(bodies, target, t)
				if e != nil || f != nil || p.Sub(q).Length() > limit {
					return false
				}
			}
			return true
		}
		return check(a, mid) && check(mid+1, b)
	}
	return check(from, to)
}

func bodySpread(b Bodies, id string, from, to common.WorldMillis, depth int) float64 {
	if depth > 4 {
		return math.Inf(1)
	}
	body, ok := b.Body(id)
	if !ok {
		return math.Inf(1)
	}
	if body.Orbit == nil {
		return 0
	}
	o := body.Orbit
	spread := 0.0
	if o.PeriodMs > 0 {
		spread = math.Min(2*o.Radius, 2*math.Pi*o.Radius*(float64((to-from+1)/2)/float64(o.PeriodMs)+2/float64(SubTurn)))
	}
	return spread + bodySpread(b, o.ParentId, from, to, depth+1)
}
func stateSpread(b Bodies, s ShipState, from, to common.WorldMillis, center Vec3) float64 {
	if s.Burn != nil {
		burn := s.Burn
		if from >= burn.ArriveMs {
			folded, err := StateAt(b, s, from)
			if err != nil {
				return math.Inf(1)
			}
			return stateSpread(b, folded, from, to, center)
		}
		if to >= burn.ArriveMs {
			return math.Inf(1)
		}
		lo, _ := burn.Curve.ArcParam(burn.Progress(from))
		hi, _ := burn.Curve.ArcParam(burn.Progress(to))
		points := []Vec3{burn.Curve.P0, burn.Curve.C1, burn.Curve.C2, burn.Curve.C3, burn.Curve.C4, burn.Curve.P5}
		left, _ := splitHull(points, hi)
		if hi > 0 {
			_, left = splitHull(left, lo/hi)
		}
		spread := 0.0
		for _, p := range left {
			spread = math.Max(spread, p.Sub(center).Length())
		}
		return spread
	}
	if s.Drift != nil {
		return s.Drift.Velocity.Length() * float64((to-from+1)/2) / 1000
	}
	if s.Park == nil {
		return math.Inf(1)
	}
	p := s.Park
	if p.Kind == ParkPoint {
		return 0
	}
	if p.Kind == ParkStationkeep && from < p.DryInstantMs && to >= p.DryInstantMs {
		return math.Inf(1)
	}
	if p.Kind == ParkStationkeep && from >= p.DryInstantMs {
		folded, err := StateAt(b, s, from)
		if err != nil {
			return math.Inf(1)
		}
		return stateSpread(b, folded, from, to, center)
	}
	spread := bodySpread(b, p.BodyId, from, to, 0)
	if p.Kind == ParkOrbit && p.PeriodMs > 0 {
		spread += math.Min(2*p.Radius, 2*math.Pi*p.Radius*(float64((to-from+1)/2)/float64(p.PeriodMs)+2/float64(SubTurn)))
	}
	return spread
}
func splitHull(points []Vec3, t float64) ([]Vec3, []Vec3) {
	row := append([]Vec3{}, points...)
	left := []Vec3{row[0]}
	right := make([]Vec3, len(row))
	right[len(row)-1] = row[len(row)-1]
	for n := len(row) - 1; n > 0; n-- {
		for i := 0; i < n; i++ {
			row[i] = row[i].Scale(1 - t).Add(row[i+1].Scale(t))
		}
		left = append(left, row[0])
		right[n-1] = row[n-1]
	}
	return left, right
}
