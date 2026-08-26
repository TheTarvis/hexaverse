package board

import (
	"math/big"

	"hexaverse/polar"
)

// Visibility — the line-of-sight law both sensing modes obey (#0006 Decisions
// #15/#16): large bodies shadow everything strictly behind them along the
// straight chord between cell centers, for the aimed scan beam and the
// passive ambient bubble alike. Sight is a CHORD, not an arc — "behind the
// star" is a Euclidean statement — so this file computes real geometry, on
// the pinned coordinate table in exact integer arithmetic (openspec
// board-tactical-math, "A Pinned Coordinate Table Grounds Board Geometry"):
// squared distances, cross products, and cross-multiplied comparisons carried
// in big.Int where products of squares exceed int64 — no runtime trig, no
// runtime sqrt, no floats. Which features occlude (star, planets) is the
// caller's rule; their pinned radii live here.

// Pinned occlusion radii, SQUARED, in squared table units (TableScale = 2^16
// per radial unit). Tuning-owned gameplay constants: the star blots out a
// full radial unit around the core; a planet shadows half a unit around its
// center. Changing one is a rebalance, and a fixture re-record, not a formula
// change.
const (
	// StarOcclusionRadius2 = (1.0 radial unit)² — the core star.
	StarOcclusionRadius2 int64 = TableScale * TableScale
	// PlanetOcclusionRadius2 = (0.5 radial unit)² — a planet-sized body.
	PlanetOcclusionRadius2 int64 = (TableScale / 2) * (TableScale / 2)
)

// Occluder is a shadow-casting body: its cell and its pinned SQUARED
// occlusion radius (one of the constants above — the caller maps feature
// kind → radius).
type Occluder struct {
	Cell    Cell  `json:"cell"`
	Radius2 int64 `json:"radius2"`
}

// LineOfSight reports whether target is visible from origin given the
// occluding bodies (openspec board-tactical-math, "Occlusion-Aware Line of
// Sight"). Blocked iff some occluder's center lies STRICTLY between origin
// and target along the chord (projection parameter strictly inside (0,1))
// AND the chord passes within that occluder's pinned squared radius. An
// occluder's own cell, and everything in front of it, stays visible — only
// positions strictly behind it are shadowed; the endpoints never block
// themselves.
func LineOfSight(origin, target Cell, occluders []Occluder, s polar.Schedule) bool {
	if len(occluders) == 0 {
		return true
	}
	origin = Canon(origin, s)
	target = Canon(target, s)
	ox, oy := CellCenter(origin, s.Slots(origin.Ring))
	tx, ty := CellCenter(target, s.Slots(target.Ring))
	dx, dy := tx-ox, ty-oy
	d2 := dx*dx + dy*dy // ≤ (2·ring·2^16)² — safely inside int64 for any real board
	if d2 == 0 {
		return true // coincident centers — nothing can lie strictly between
	}
	for _, oc := range occluders {
		c := Canon(oc.Cell, s)
		cx, cy := CellCenter(c, s.Slots(c.Ring))
		px, py := cx-ox, cy-oy
		// Projection parameter t = (p·d)/d² strictly inside (0,1):
		dotPD := px*dx + py*dy
		if dotPD <= 0 || dotPD >= d2 {
			continue // at or before the origin, or at or beyond the target
		}
		// Chord passes within the occluder's radius: perpendicular distance²
		// ≤ r² ⟺ cross(p,d)² ≤ r²·d², cross-multiplied. cross and the products
		// exceed int64 (cross² ~ 10^26), so the comparison is big.Int — still
		// exact integers, still no sqrt (the comparison stays squared).
		cross := new(big.Int).Sub(
			new(big.Int).Mul(big.NewInt(px), big.NewInt(dy)),
			new(big.Int).Mul(big.NewInt(py), big.NewInt(dx)),
		)
		cross.Mul(cross, cross)
		bound := new(big.Int).Mul(big.NewInt(oc.Radius2), big.NewInt(d2))
		if cross.Cmp(bound) <= 0 {
			return false
		}
	}
	return true
}

// BeamParams tunes the scan beam's corridor (#0006 Decision #15): a widening
// corridor around the ray origin→aim, half-width at a cell =
// HalfWidthBase + Spread × (the cell's along-ray distance from the origin),
// clipped at the rim ring. All values are exact: the half-width base is in
// table units, the spread a rational — no float knob survives the polar
// rewrite (the retired hex beam's float Spread is why).
type BeamParams struct {
	// HalfWidthBase is the corridor's half-width at the origin, in table
	// units (TableScale = 2^16 per radial unit).
	HalfWidthBase int64 `json:"halfWidthBase"`
	// SpreadNum/SpreadDen is the dimensionless widening per unit of along-ray
	// distance. SpreadDen must be positive.
	SpreadNum int64 `json:"spreadNum"`
	SpreadDen int64 `json:"spreadDen"`
	// RimRing clips the corridor at the board's rim.
	RimRing int `json:"rimRing"`
}

// BeamCells returns the scan beam's cell set (openspec board-tactical-math,
// "Widening Scan Beam Corridor"): the cells at or within RimRing whose
// centers lie within the widening corridor around the ray from the origin
// cell's center through the aim cell's center, forward of the origin. An aim
// equal to the origin has no direction and yields an empty beam. Output in
// (ring, slot) order — the fixed enumeration both languages reproduce.
//
// The membership test is exact integer geometry on pinned centers. With
// p = cell − origin, d = aim − origin, membership is
// |cross(p,d)|/|d| ≤ base + spread × (p·d)/|d|, i.e. (× sd·|d|)
// A := sd·|cross(p,d)| − sn·(p·d) ≤ sd·base·|d|. The right side carries a
// lone |d| — an irrational square root — so the comparison is decided as an
// integer comparison against the quadratic surd rather than by computing any
// root: A ≤ 0 is membership outright (the bound is non-negative), and A > 0
// is membership iff A² ≤ sd²·base²·d². Exact at every input — a borderline
// cell is in or out identically in Go and TS and on every build target, by
// construction. cross and dot fit int64 on any real board; only the final
// squares need big.Int.
func BeamCells(origin, aim Cell, p BeamParams, s polar.Schedule) []Cell {
	origin = Canon(origin, s)
	aim = Canon(aim, s)
	if origin == aim || p.SpreadDen <= 0 {
		return nil
	}
	ox, oy := CellCenter(origin, s.Slots(origin.Ring))
	ax, ay := CellCenter(aim, s.Slots(aim.Ring))
	dx, dy := ax-ox, ay-oy
	// sd²·base²·d² — the squared bound A² is compared against.
	bound := new(big.Int).Mul(big.NewInt(p.SpreadDen*p.HalfWidthBase), big.NewInt(p.SpreadDen*p.HalfWidthBase))
	bound.Mul(bound, big.NewInt(dx*dx+dy*dy))

	rim := p.RimRing
	if rim > s.MaxRing {
		rim = s.MaxRing
	}
	var out []Cell
	for ring := 0; ring <= rim; ring++ {
		slots := s.Slots(ring)
		for slot := 0; slot < slots; slot++ {
			c := Cell{Ring: ring, Slot: slot}
			cx, cy := CellCenter(c, slots)
			px, py := cx-ox, cy-oy
			dotPD := px*dx + py*dy
			if dotPD < 0 {
				continue // behind the origin — the corridor is forward-only
			}
			cross := px*dy - py*dx
			if cross < 0 {
				cross = -cross
			}
			a := p.SpreadDen*cross - p.SpreadNum*dotPD
			if a <= 0 {
				out = append(out, c)
				continue
			}
			a2 := new(big.Int).Mul(big.NewInt(a), big.NewInt(a))
			if a2.Cmp(bound) <= 0 {
				out = append(out, c)
			}
		}
	}
	return out
}
