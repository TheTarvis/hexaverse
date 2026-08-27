package galaxy

import (
	"math"
	"sort"

	opensimplex "github.com/ojrac/opensimplex-go"
)

// The galaxy is no longer generated once into a finite disc. It is DISCOVERED:
// Field (field.go) is the pure infinite star field for (seed, params), and this
// file holds what stays shared — the region noise, and the start-area
// materialization that seeding and the frozen logged-out asset both build from.

// --- Noise field -----------------------------------------------------------

// fractalNoise sums several octaves of 3D simplex noise into a value in ~[-1,1].
// Coordinate-pure and unbounded, so it needed no change when space did.
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
		// Wrapped so the accumulate cannot fuse into an FMA (cross-target
		// divergence on a rule-bearing path). The library's own internals are
		// still out of reach — see the deviation register.
		sum += float64(amp * f.noise.Eval3(x*freq, y*freq, z*freq))
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

// --- Start area -------------------------------------------------------------

// StartAreaBlocks is the block set seeding materializes up front: the square of
// StartAreaBlockRadius blocks around the origin block, in a stable order.
func StartAreaBlocks(params GenerationParams) []Block {
	r := params.StartAreaBlockRadius
	if r < 0 {
		r = 0
	}
	var out []Block
	for x := -r; x <= r; x++ {
		for y := -r; y <= r; y++ {
			out = append(out, Block{X: x, Y: y})
		}
	}
	return out
}

// GenerateStartArea materializes the start-area blocks in memory — the pure
// slice of the field that seeding persists and that `cmd/seed start-area`
// freezes into the logged-out asset. Lanes with an endpoint outside the start
// area are dropped: the asset must never draw a lane to a node it does not
// carry.
func GenerateStartArea(seed int64, params GenerationParams) GeneratedGalaxy {
	f := NewField(seed, params)
	blocks := StartAreaBlocks(params)

	var systems []System
	present := map[string]bool{}
	for _, b := range blocks {
		for _, s := range f.BlockSystems(b) {
			systems = append(systems, s)
			present[s.Id] = true
		}
	}

	seen := map[string]bool{}
	var lanes []Lane
	for _, b := range blocks {
		for _, l := range f.BlockLanes(b) {
			if seen[l.Id] || !present[l.AId] || !present[l.BId] {
				continue
			}
			seen[l.Id] = true
			lanes = append(lanes, l.Lane)
		}
	}

	sort.Slice(systems, func(i, j int) bool { return systems[i].Id < systems[j].Id })
	sort.Slice(lanes, func(i, j int) bool { return lanes[i].Id < lanes[j].Id })

	bounds, _ := boundsOfSystems(systems)
	return GeneratedGalaxy{
		Galaxy: Galaxy{
			Seed:           seed,
			Params:         params,
			Bounds:         bounds,
			Version:        2,
			OriginSystemId: originSystemId(f, systems),
			BlockCount:     len(blocks),
		},
		Systems: systems,
		Lanes:   lanes,
	}
}

// originSystemId is the surviving candidate nearest the field coordinate origin
// within the start area, ties broken by the candidates' deterministic hash
// priority (D4). Defined once, recorded on the galaxy document at seed time,
// and read — never re-derived — by runtime consumers.
func originSystemId(f *Field, systems []System) string {
	best := ""
	bestD := math.MaxFloat64
	for _, s := range systems {
		d := float64(s.Coords.X*s.Coords.X) + float64(s.Coords.Y*s.Coords.Y) + float64(s.Coords.Z*s.Coords.Z)
		switch {
		case best == "" || d < bestD:
			best, bestD = s.Id, d
		case d == bestD:
			// Exact tie — break by the same priority order placement kills by.
			a, _ := CellForSystemId(s.Id)
			b, _ := CellForSystemId(best)
			if stronger(f.candidateAt(a), f.candidateAt(b)) {
				best = s.Id
			}
		}
	}
	return best
}

// --- Start-area validation (seed time) --------------------------------------

// StartAreaReport is what seed-time validation measures about a candidate seed:
// the origin system, the size of its lane component within the start area, and
// whether that component can bootstrap a player.
type StartAreaReport struct {
	OriginSystemId  string
	ComponentSize   int
	ComponentHasOre bool
}

// InspectStartArea walks the start area's lane graph from the origin system.
// Pure — the seed path calls it before anything goes live.
func InspectStartArea(gen GeneratedGalaxy) StartAreaReport {
	rep := StartAreaReport{OriginSystemId: gen.Galaxy.OriginSystemId}
	if rep.OriginSystemId == "" {
		return rep
	}
	adj := map[string][]string{}
	for _, l := range gen.Lanes {
		adj[l.AId] = append(adj[l.AId], l.BId)
		adj[l.BId] = append(adj[l.BId], l.AId)
	}
	byId := make(map[string]*System, len(gen.Systems))
	for i := range gen.Systems {
		byId[gen.Systems[i].Id] = &gen.Systems[i]
	}

	seen := map[string]bool{rep.OriginSystemId: true}
	queue := []string{rep.OriginSystemId}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		rep.ComponentSize++
		if s := byId[cur]; s != nil && HasMineableBody(s) {
			rep.ComponentHasOre = true
		}
		for _, nb := range adj[cur] {
			if seen[nb] {
				continue
			}
			seen[nb] = true
			queue = append(queue, nb)
		}
	}
	return rep
}

// HasMineableBody reports whether a system's skeleton carries the bootstrap
// guarantee — at least one mineable major body. Shared with spawn site
// selection, which enforces the same criterion.
func HasMineableBody(s *System) bool {
	for _, b := range s.Skeleton.Bodies {
		if b.Mineable {
			return true
		}
	}
	return false
}
