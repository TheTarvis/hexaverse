package galaxy

import (
	"fmt"
	"math"

	opensimplex "github.com/ojrac/opensimplex-go"
)

// Generate is the pure heart of #0001: a deterministic function of (seed,
// params) producing a connected graph of star systems with noise-driven
// regional character and a major-body skeleton per node. No I/O, no clock — the
// same inputs always yield the same galaxy.
func Generate(seed int64, params GenerationParams) GeneratedGalaxy {
	noise := newFractalNoise(seed, params)
	points := placeSystems(seed, params, noise)
	systems := make([]System, len(points))
	for i, p := range points {
		id := fmt.Sprintf("sys-%d", i)
		systems[i] = System{
			Id:       id,
			Coords:   p.coords,
			Name:     systemName(seed, i),
			Region:   p.region,
			Skeleton: rollSkeleton(SystemSeed(seed, id), p.region, params),
		}
	}
	lanes := relativeNeighbourhoodLanes(points)

	return GeneratedGalaxy{
		Galaxy: Galaxy{
			Seed:    seed,
			Params:  params,
			Bounds:  boundsOf(points),
			Version: 1,
		},
		Systems: systems,
		Lanes:   lanes,
	}
}

// placedPoint is an accepted node during placement.
type placedPoint struct {
	coords Coords
	region Region
}

// --- Noise field -----------------------------------------------------------

// fractalNoise sums several octaves of 3D simplex noise into a value in ~[-1,1].
type fractalNoise struct {
	noise       opensimplex.Noise
	frequency   float64
	octaves     int
	invAmpTotal float64
}

func newFractalNoise(seed int64, params GenerationParams) *fractalNoise {
	octaves := params.NoiseOctaves
	if octaves < 1 {
		octaves = 1
	}
	// Normalizer so summed octaves stay within [-1,1] (persistence 0.5).
	ampTotal := 0.0
	amp := 1.0
	for o := 0; o < octaves; o++ {
		ampTotal += amp
		amp *= 0.5
	}
	return &fractalNoise{
		noise:       opensimplex.New(seed),
		frequency:   params.NoiseFrequency,
		octaves:     octaves,
		invAmpTotal: 1.0 / ampTotal,
	}
}

func (f *fractalNoise) at(x, y, z float64) float64 {
	sum := 0.0
	amp := 1.0
	freq := f.frequency
	for o := 0; o < f.octaves; o++ {
		sum += amp * f.noise.Eval3(x*freq, y*freq, z*freq)
		amp *= 0.5
		freq *= 2
	}
	return sum * f.invAmpTotal
}

// classify turns a noise value into a region. The barrier is the thin
// zero-crossing seam between positive (rich) and negative (dead) noise — a
// natural choke between clusters and voids.
func classify(n float64, params GenerationParams) Region {
	if math.Abs(n) < params.BarrierBand {
		return RegionBarrier
	}
	if n >= params.StarRichThreshold {
		return RegionStarRich
	}
	if n <= params.DeadThreshold {
		return RegionDead
	}
	return RegionNormal
}

// --- Poisson-disc placement (region-varied minimum spacing) ----------------

func placeSystems(seed int64, params GenerationParams, noise *fractalNoise) []placedPoint {
	rng := newRand(seed)
	var accepted []placedPoint

	// Spatial hash grid for O(1)-ish neighbour queries. Cell size = the largest
	// possible gap, so any conflicting neighbour is within the 3×3×3 block.
	cellSize := maxGap(params)
	grid := map[[3]int][]int{}
	cellOf := func(c Coords) [3]int {
		return [3]int{
			int(math.Floor(c.X / cellSize)),
			int(math.Floor(c.Y / cellSize)),
			int(math.Floor(c.Z / cellSize)),
		}
	}

	maxAttempts := params.TargetCount * params.MaxAttemptsPerNode
	if maxAttempts < params.TargetCount {
		maxAttempts = params.TargetCount * 40
	}

	for attempt := 0; attempt < maxAttempts && len(accepted) < params.TargetCount; attempt++ {
		// Uniform sample within the flattened disk.
		r := params.RadiusXY * math.Sqrt(rng.Float64())
		theta := 2 * math.Pi * rng.Float64()
		cand := Coords{
			X: r * math.Cos(theta),
			Y: r * math.Sin(theta),
			Z: (rng.Float64()*2 - 1) * params.HalfHeightZ,
		}
		region := classify(noise.at(cand.X, cand.Y, cand.Z), params)
		gap := params.MinGapByRegion[string(region)]

		if !clears(cand, gap, region, params, accepted, grid, cellOf) {
			continue
		}

		idx := len(accepted)
		accepted = append(accepted, placedPoint{coords: cand, region: region})
		cell := cellOf(cand)
		grid[cell] = append(grid[cell], idx)
	}

	return accepted
}

// clears reports whether a candidate is far enough from every existing node.
// The required separation between two nodes is the larger of their two region
// gaps, so a dense star-rich node never crowds a sparse dead one.
func clears(cand Coords, candGap float64, _ Region, params GenerationParams, accepted []placedPoint, grid map[[3]int][]int, cellOf func(Coords) [3]int) bool {
	base := cellOf(cand)
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			for dz := -1; dz <= 1; dz++ {
				cell := [3]int{base[0] + dx, base[1] + dy, base[2] + dz}
				for _, idx := range grid[cell] {
					other := accepted[idx]
					required := math.Max(candGap, params.MinGapByRegion[string(other.region)])
					if dist(cand, other.coords) < required {
						return false
					}
				}
			}
		}
	}
	return true
}

func maxGap(params GenerationParams) float64 {
	m := 1.0
	for _, g := range params.MinGapByRegion {
		if g > m {
			m = g
		}
	}
	return m
}

// --- Relative-neighbourhood graph (lanes) ----------------------------------

// relativeNeighbourhoodLanes keeps edge (a,b) iff no third node c lies in their
// lune (closer to both than they are to each other). The RNG contains the
// Euclidean MST, so the graph is connected by construction (#0001 Decision #8).
func relativeNeighbourhoodLanes(points []placedPoint) []Lane {
	n := len(points)
	var lanes []Lane
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			dij := dist(points[i].coords, points[j].coords)
			blocked := false
			for k := 0; k < n; k++ {
				if k == i || k == j {
					continue
				}
				if dist(points[i].coords, points[k].coords) < dij &&
					dist(points[j].coords, points[k].coords) < dij {
					blocked = true
					break
				}
			}
			if !blocked {
				lanes = append(lanes, Lane{
					Id:  fmt.Sprintf("lane-%d-%d", i, j),
					AId: fmt.Sprintf("sys-%d", i),
					BId: fmt.Sprintf("sys-%d", j),
				})
			}
		}
	}
	return lanes
}

// --- Geometry helpers ------------------------------------------------------

func dist(a, b Coords) float64 {
	dx, dy, dz := a.X-b.X, a.Y-b.Y, a.Z-b.Z
	return math.Sqrt(dx*dx + dy*dy + dz*dz)
}

func boundsOf(points []placedPoint) Bounds {
	if len(points) == 0 {
		return Bounds{}
	}
	minX, maxX := points[0].coords.X, points[0].coords.X
	minY, maxY := points[0].coords.Y, points[0].coords.Y
	minZ, maxZ := points[0].coords.Z, points[0].coords.Z
	for _, p := range points[1:] {
		minX, maxX = math.Min(minX, p.coords.X), math.Max(maxX, p.coords.X)
		minY, maxY = math.Min(minY, p.coords.Y), math.Max(maxY, p.coords.Y)
		minZ, maxZ = math.Min(minZ, p.coords.Z), math.Max(maxZ, p.coords.Z)
	}
	return Bounds{X: [2]float64{minX, maxX}, Y: [2]float64{minY, maxY}, Z: [2]float64{minZ, maxZ}}
}
