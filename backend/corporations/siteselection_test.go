package corporations

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"hexaverse/galaxy"
)

// lineGraph is an in-memory GraphSource over the path graph
// sys_0_0 — sys_1_0 — … — sys_(n-1)_0, with per-index control of the Mineable
// flag. A path makes hop distances trivially checkable (distance(i,j) = |i-j|),
// and the ids are real field coordinates so the walk's block-depth measure is
// exercised too.
//
// It also models the endless world: systems beyond `materialized` do not exist
// until the walk ensures the block that holds them, so a test can pin that the
// walk GREW the world rather than reading a pre-built graph.
type lineGraph struct {
	n            int
	mineable     func(i int) bool
	materialized int // ids with index < this are persisted; ensuring grows it
	blockSize    int
	// ensured records every EnsureBlocks call, so tests can assert the walk
	// materialized the frontier it visited.
	ensured *[]galaxy.Block
	// origin overrides the recorded origin system.
	origin string
}

func newLineGraph(n int, mineable func(i int) bool) *lineGraph {
	return &lineGraph{n: n, mineable: mineable, materialized: n, blockSize: 2, origin: "sys_0_0"}
}

func lineId(i int) string { return fmt.Sprintf("sys_%d_0", i) }

func lineIndex(id string) (int, bool) {
	var i int
	if _, err := fmt.Sscanf(id, "sys_%d_0", &i); err != nil {
		return 0, false
	}
	return i, true
}

func (g *lineGraph) GetLiveSystem(_ context.Context, id string) (*galaxy.System, error) {
	i, ok := lineIndex(id)
	if !ok || i < 0 || i >= g.materialized {
		return nil, galaxy.ErrSystemNotFound
	}
	return &galaxy.System{
		Id:     id,
		Coords: galaxy.Coords{X: float64(i)},
		Skeleton: galaxy.Skeleton{
			Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 1, Mineable: g.mineable(i)}},
		},
	}, nil
}

func (g *lineGraph) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) {
	return &galaxy.Galaxy{
		Id:             "gal_line",
		OriginSystemId: g.origin,
		Params:         galaxy.GenerationParams{BlockSize: g.blockSize},
	}, nil
}

func (g *lineGraph) GetLiveSystems(ctx context.Context, ids []string) ([]galaxy.System, error) {
	var out []galaxy.System
	for _, id := range ids {
		sys, err := g.GetLiveSystem(ctx, id)
		if err != nil {
			continue // absent from the materialized set
		}
		out = append(out, *sys)
	}
	return out, nil
}

func (g *lineGraph) LaneHorizonBlocks(_ context.Context, ids []string) ([]galaxy.Block, error) {
	seen := map[galaxy.Block]bool{}
	var out []galaxy.Block
	for _, id := range ids {
		b, ok := galaxy.BlockOfSystem(id, galaxy.GenerationParams{BlockSize: g.blockSize})
		if !ok {
			continue
		}
		for _, w := range galaxy.BlockWindow(b) {
			if seen[w] {
				continue
			}
			seen[w] = true
			out = append(out, w)
		}
	}
	return out, nil
}

func (g *lineGraph) EnsureBlocks(_ context.Context, blocks ...galaxy.Block) error {
	if g.ensured != nil {
		*g.ensured = append(*g.ensured, blocks...)
	}
	// Materializing a block makes its systems (and therefore the onward lanes)
	// exist — exactly what the real walk buys with EnsureLaneHorizon.
	for _, b := range blocks {
		if end := (b.X + 1) * g.blockSize; end > g.materialized && end <= g.n {
			g.materialized = end
		}
	}
	return nil
}

func (g *lineGraph) NeighborsOfMany(_ context.Context, ids []string) (map[string][]string, error) {
	out := map[string][]string{}
	for _, id := range ids {
		i, ok := lineIndex(id)
		if !ok {
			continue
		}
		for _, j := range []int{i - 1, i + 1} {
			if j >= 0 && j < g.n && j < g.materialized {
				out[id] = append(out[id], lineId(j))
			}
		}
	}
	return out, nil
}

func allMineable(int) bool { return true }

func walkParams() SpawnParams {
	p := DefaultSpawnParams()
	p.MinSpawnDistance = 0
	return p
}

func pick(t *testing.T, g *lineGraph, params SpawnParams, claimed, reserved map[string]bool, acct string) *galaxy.System {
	t.Helper()
	site, err := selectSpawnSite(context.Background(), g, params, claimed, reserved, acct)
	if err != nil {
		t.Fatalf("%s: unexpected error: %v", acct, err)
	}
	return site
}

// Every pick carries the bootstrap guarantee, even when only a minority of
// systems qualify. (Criterion a.)
// Spec: 0009/S3
func TestSiteSelection_RequiresMineable(t *testing.T) {
	for n := 0; n < 50; n++ {
		g := newLineGraph(8, func(i int) bool { return i%2 == 0 })
		acct := fmt.Sprintf("acct-%d", n)
		site := pick(t, g, walkParams(), nil, nil, acct)
		if !galaxy.HasMineableBody(site) {
			t.Fatalf("%s: picked non-mineable site %s", acct, site.Id)
		}
	}
}

// No pick lands within MinSpawnDistance lane-hops of a claimed (explored)
// system. (Criterion b.)
// Spec: 0009/S3
func TestSiteSelection_KeepsDistanceFromClaimed(t *testing.T) {
	params := DefaultSpawnParams()
	params.MinSpawnDistance = 3
	claimed := map[string]bool{lineId(0): true} // another corp owns the low end

	for n := 0; n < 50; n++ {
		g := newLineGraph(8, allMineable)
		acct := fmt.Sprintf("acct-%d", n)
		site := pick(t, g, params, claimed, nil, acct)
		idx, ok := lineIndex(site.Id)
		if !ok {
			t.Fatalf("bad id %s", site.Id)
		}
		if idx < params.MinSpawnDistance {
			t.Fatalf("%s: picked %s, only %d hops from claimed %s (want ≥ %d)",
				acct, site.Id, idx, lineId(0), params.MinSpawnDistance)
		}
	}
}

// The walk stops at the FIRST qualifying hop-ring — new corporations land just
// beyond the settled fringe, not at some weighted far edge (the periphery
// weighting retired with the finite galaxy).
func TestSiteSelection_StopsAtTheNearestQualifyingRing(t *testing.T) {
	params := DefaultSpawnParams()
	params.MinSpawnDistance = 3
	claimed := map[string]bool{lineId(0): true}

	g := newLineGraph(12, allMineable)
	site := pick(t, g, params, claimed, nil, "acct")
	idx, _ := lineIndex(site.Id)
	if idx != 3 {
		t.Fatalf("picked %s (hop %d); the first qualifying ring is hop 3", site.Id, idx)
	}
}

// The same account re-picks the same site against the same world state, so a
// spawn that partially failed heals to the same home (idempotency).
func TestSiteSelection_Deterministic(t *testing.T) {
	for _, acct := range []string{"a", "b", "carol", "acct-xyz"} {
		first := pick(t, newLineGraph(10, allMineable), walkParams(), nil, nil, acct)
		for i := 0; i < 5; i++ {
			again := pick(t, newLineGraph(10, allMineable), walkParams(), nil, nil, acct)
			if again.Id != first.Id {
				t.Fatalf("%s: non-deterministic pick %s vs %s", acct, again.Id, first.Id)
			}
		}
	}
}

// A reserved system never qualifies — the reservation is the authoritative
// concurrency signal, because a corporation's explored set lands only AFTER its
// commit transaction.
func TestSiteSelection_ReservedSystemNeverQualifies(t *testing.T) {
	g := newLineGraph(10, allMineable)
	first := pick(t, g, walkParams(), nil, nil, "acct")

	g2 := newLineGraph(10, allMineable)
	second := pick(t, g2, walkParams(), nil, map[string]bool{first.Id: true}, "acct")
	if second.Id == first.Id {
		t.Fatalf("the same account re-picked the reserved site %s", first.Id)
	}
}

// In a fresh world the walk begins at the origin system RECORDED on the galaxy
// document, rather than failing on an empty claimed set.
func TestSiteSelection_FreshWorldStartsAtTheRecordedOrigin(t *testing.T) {
	g := newLineGraph(10, func(i int) bool { return i == 0 })
	site := pick(t, g, walkParams(), nil, nil, "acct")
	if site.Id != lineId(0) {
		t.Fatalf("fresh world picked %s, want the recorded origin %s", site.Id, lineId(0))
	}
}

// Exhausting MATERIALIZED space must grow the world, not fail: this is the bug
// the whole change exists to kill.
func TestSiteSelection_GrowsTheWorldInsteadOfFailing(t *testing.T) {
	var ensured []galaxy.Block
	g := newLineGraph(16, func(i int) bool { return i >= 10 }) // nothing qualifies inside the start area
	g.materialized = 4                                         // ... and only the first four systems exist
	g.ensured = &ensured

	site := pick(t, g, walkParams(), nil, nil, "acct")
	idx, _ := lineIndex(site.Id)
	if idx < 10 {
		t.Fatalf("picked %s — the walk must reach the first mineable system at index 10", site.Id)
	}
	if len(ensured) == 0 {
		t.Fatal("the walk found a site without materializing anything — it cannot have grown the world")
	}
	if g.materialized <= 4 {
		t.Fatalf("materialized set never grew (%d) — the walk stalled at the persisted frontier", g.materialized)
	}
}

// A wide settled frontier must consume no extra depth budget: depth is measured
// from the walk's OWN starting blocks, never from the field origin.
func TestSiteSelection_WideFrontierConsumesNoExtraDepth(t *testing.T) {
	params := DefaultSpawnParams()
	params.MinSpawnDistance = 1
	params.MaxSpawnWalkBlocks = 2 // a tight cap the walk must still clear

	// Settled space spans indices 0..19 — many blocks wide, far from the origin.
	claimed := map[string]bool{}
	for i := 0; i < 20; i++ {
		claimed[lineId(i)] = true
	}
	g := newLineGraph(24, allMineable)
	site := pick(t, g, params, claimed, nil, "acct")
	if idx, _ := lineIndex(site.Id); idx < 20 {
		t.Fatalf("picked %s inside settled space", site.Id)
	}
}

// The defensive cap fails clearly when configured artificially low — the failure
// is not inducible in a well-formed world.
func TestSiteSelection_DepthCapFailsClearly(t *testing.T) {
	params := DefaultSpawnParams()
	params.MaxSpawnWalkBlocks = 1 // blocks are 2 systems wide, so ~4 systems of reach
	g := newLineGraph(40, func(i int) bool { return i >= 30 })

	_, err := selectSpawnSite(context.Background(), g, params, nil, nil, "acct")
	if !errors.Is(err, ErrNoSpawnSite) {
		t.Fatalf("err = %v, want ErrNoSpawnSite", err)
	}
}

// A finite reachable component (a pocketed field) exhausts the walk and fails as
// a clear service error — the D4 residual risk, surfaced rather than hidden.
func TestSiteSelection_FinitePocketFails(t *testing.T) {
	g := newLineGraph(4, func(int) bool { return false })
	_, err := selectSpawnSite(context.Background(), g, DefaultSpawnParams(), nil, nil, "acct")
	if !errors.Is(err, ErrNoSpawnSite) {
		t.Fatalf("err = %v, want ErrNoSpawnSite", err)
	}
}

// Degenerate rails are rejected before the walk runs a single step.
func TestSiteSelection_RejectsDegenerateParams(t *testing.T) {
	params := DefaultSpawnParams()
	params.MaxSpawnWalkBlocks = 0
	g := newLineGraph(10, allMineable)
	_, err := selectSpawnSite(context.Background(), g, params, nil, nil, "acct")
	if !errors.Is(err, ErrInvalidSpawnParams) {
		t.Fatalf("err = %v, want ErrInvalidSpawnParams", err)
	}
}
