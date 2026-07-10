package galaxy

import (
	"reflect"
	"testing"
)

// smallParams keeps generation fast for unit tests while preserving structure.
func smallParams() GenerationParams {
	p := DefaultParams()
	p.TargetCount = 120
	p.RadiusXY = 300
	return p
}

func TestGenerate_Deterministic(t *testing.T) {
	a := Generate(7, smallParams())
	b := Generate(7, smallParams())

	if !reflect.DeepEqual(a.Systems, b.Systems) {
		t.Fatal("same seed produced different systems")
	}
	if !reflect.DeepEqual(a.Lanes, b.Lanes) {
		t.Fatal("same seed produced different lanes")
	}
	if !reflect.DeepEqual(a.Galaxy.Bounds, b.Galaxy.Bounds) {
		t.Fatal("same seed produced different bounds")
	}
}

func TestGenerate_DifferentSeedsDiffer(t *testing.T) {
	a := Generate(1, smallParams())
	b := Generate(2, smallParams())
	if reflect.DeepEqual(a.Systems, b.Systems) {
		t.Fatal("different seeds produced identical systems")
	}
}

func TestGenerate_Connectivity(t *testing.T) {
	g := Generate(42, smallParams())
	if len(g.Systems) < 2 {
		t.Fatalf("too few systems to test connectivity: %d", len(g.Systems))
	}

	// Build adjacency from lanes and BFS from node 0.
	adj := map[string][]string{}
	for _, l := range g.Lanes {
		adj[l.AId] = append(adj[l.AId], l.BId)
		adj[l.BId] = append(adj[l.BId], l.AId)
	}

	seen := map[string]bool{g.Systems[0].Id: true}
	queue := []string{g.Systems[0].Id}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, nb := range adj[cur] {
			if !seen[nb] {
				seen[nb] = true
				queue = append(queue, nb)
			}
		}
	}

	if len(seen) != len(g.Systems) {
		t.Fatalf("graph not connected: BFS reached %d of %d systems", len(seen), len(g.Systems))
	}
}

func TestGenerate_MinimumSpacingRespected(t *testing.T) {
	params := smallParams()
	g := Generate(9, params)
	for i := 0; i < len(g.Systems); i++ {
		for j := i + 1; j < len(g.Systems); j++ {
			d := dist(g.Systems[i].Coords, g.Systems[j].Coords)
			// The smallest legal separation is the tightest region gap.
			minGap := params.MinGapByRegion[string(RegionStarRich)]
			if d < minGap*0.999 {
				t.Fatalf("systems %d and %d are %.2f apart, below min gap %.2f", i, j, d, minGap)
			}
		}
	}
}

func TestGenerate_RegionDistribution_StarRichDenserThanDead(t *testing.T) {
	// Over the same volume, star-rich's tight gap must pack more systems per
	// unit volume than dead's sparse gap. Measure as count normalized by the
	// region's own cell volume expectation — simplest robust proxy: star-rich
	// count should exceed dead count materially at these thresholds.
	g := Generate(3, DefaultParams())
	counts := map[Region]int{}
	for _, s := range g.Systems {
		counts[s.Region]++
	}
	if counts[RegionStarRich] == 0 {
		t.Fatal("no star-rich systems generated")
	}
	// Density contrast: star-rich packs tighter, so in a noise field with
	// symmetric thresholds it should not be rarer than dead.
	if counts[RegionStarRich] < counts[RegionDead] {
		t.Fatalf("expected star-rich (%d) to be denser than dead (%d)",
			counts[RegionStarRich], counts[RegionDead])
	}
}

func TestGenerate_BarrierSeamsAreSparse(t *testing.T) {
	g := Generate(3, DefaultParams())
	counts := map[Region]int{}
	for _, s := range g.Systems {
		counts[s.Region]++
	}
	// Barriers are a thin zero-crossing band — they must be the rarest region.
	for _, r := range []Region{RegionStarRich, RegionNormal, RegionDead} {
		if counts[RegionBarrier] > counts[r] {
			t.Fatalf("barrier (%d) not sparse vs %s (%d)", counts[RegionBarrier], r, counts[r])
		}
	}
}

func TestGenerate_SkeletonDeterministicAndWellFormed(t *testing.T) {
	g := Generate(11, smallParams())
	for _, s := range g.Systems {
		if s.Skeleton.StarClass == "" {
			t.Fatalf("system %s has no star class", s.Id)
		}
		if len(s.Skeleton.Bodies) == 0 {
			t.Fatalf("system %s has no bodies", s.Id)
		}
		// Rings strictly ascending (distinct, inner-to-outer).
		for i := 1; i < len(s.Skeleton.Bodies); i++ {
			if s.Skeleton.Bodies[i].Ring <= s.Skeleton.Bodies[i-1].Ring {
				t.Fatalf("system %s rings not ascending/distinct: %+v", s.Id, s.Skeleton.Bodies)
			}
		}
	}

	// Re-derive one system's skeleton straight from the seed helper: identical.
	sys := g.Systems[0]
	again := rollSkeleton(SystemSeed(11, sys.Id), sys.Region, smallParams())
	if !reflect.DeepEqual(sys.Skeleton, again) {
		t.Fatal("skeleton not reproducible from SystemSeed")
	}
}

func TestGenerate_ReachesTargetCount(t *testing.T) {
	params := smallParams()
	g := Generate(5, params)
	// Poisson rejection may fall short, but should get most of the way there.
	if len(g.Systems) < params.TargetCount*7/10 {
		t.Fatalf("only placed %d of target %d systems", len(g.Systems), params.TargetCount)
	}
}

func TestGenerate_LanesReferenceRealSystems(t *testing.T) {
	g := Generate(8, smallParams())
	ids := map[string]bool{}
	for _, s := range g.Systems {
		ids[s.Id] = true
	}
	for _, l := range g.Lanes {
		if !ids[l.AId] || !ids[l.BId] {
			t.Fatalf("lane %s references missing system(s): %s/%s", l.Id, l.AId, l.BId)
		}
		if l.AId == l.BId {
			t.Fatalf("lane %s is a self-loop", l.Id)
		}
	}
}
