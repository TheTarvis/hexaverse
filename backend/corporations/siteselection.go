package corporations

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"math/rand"
	"sort"

	"hexaverse/galaxy"
	"hexaverse/system"
)

// ErrNoSpawnSite is the DEFENSIVE RAIL, not an expected outcome. Since the
// endless-galaxy change the walk grows the world ahead of itself, so
// accumulating players can never exhaust it; reaching this error means
// misconfiguration (an artificially low walk cap), field degeneracy (a finite
// origin component — the D4 residual risk), or exhausted re-picks under
// pathological reservation contention.
var ErrNoSpawnSite = errors.New("no spawn site satisfies the criteria")

// ErrInvalidSpawnParams means the placement knobs are unusable — a boot-time
// misconfiguration, surfaced rather than silently walking forever.
var ErrInvalidSpawnParams = errors.New("invalid spawn params")

// spawnWalk is the outward breadth-first search over the LANE GRAPH that
// replaced "scan the finite graph and fail" (D6). It starts from settled space
// (or the recorded origin system in a fresh world) and expands hop by hop,
// materializing each visited system's full lane horizon BEFORE expanding past
// it — so the world always grows one horizon ahead of the search and the
// frontier can never stall against unpersisted space.
type spawnWalk struct {
	graph  GraphSource
	params SpawnParams
	// claimed is the union of every OTHER living corporation's explored systems.
	claimed map[string]bool
	// reserved is the spawn-reservation set — the authoritative concurrency
	// signal, because a corporation's explored set is only written AFTER its
	// commit transaction.
	reserved map[string]bool
	// blockSize measures expansion depth in block-hops.
	blockSize int
	// ensuredBlocks dedupes horizon materialization within one walk: adjacent
	// systems share almost all of their 3×3 window, so this collapses the walk's
	// storage cost to roughly one ensure per new block.
	ensuredBlocks map[galaxy.Block]bool
	// seed is the live galaxy's seed, the input the station derivation needs.
	seed int64
}

// selectSpawnSite walks outward from settled space and returns the first
// qualifying home. Qualification is (a) a mineable skeleton body — the bootstrap
// guarantee; (b) at least MinSpawnDistance lane-hops from every other living
// corporation's explored systems; (c) no existing spawn reservation; (d) the home station's orbital shell clears
// its star's clearance radius. The walk
// stops at the FIRST hop-ring holding a qualifier and draws uniformly among that
// ring's qualifiers with an account-seeded source, so new corporations land just
// beyond the settled fringe and the same account against the same world state
// always re-derives the same pick.
func selectSpawnSite(
	ctx context.Context,
	graph GraphSource,
	params SpawnParams,
	claimed, reserved map[string]bool,
	accountId string,
) (*galaxy.System, error) {
	if err := params.Validate(); err != nil {
		return nil, err
	}
	meta, err := graph.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}
	sources, err := walkSources(claimed, meta)
	if err != nil {
		return nil, err
	}

	w := &spawnWalk{
		graph:         graph,
		params:        params,
		claimed:       claimed,
		reserved:      reserved,
		blockSize:     meta.Params.BlockSize,
		seed:          meta.Seed,
		ensuredBlocks: map[galaxy.Block]bool{},
	}
	return w.run(ctx, sources, accountId)
}

// walkSources is where the search begins: settled space, or the origin system
// RECORDED on the galaxy document when no corporation is living (read, never
// re-derived — a later StartAreaBlockRadius change cannot move the anchor).
func walkSources(claimed map[string]bool, meta *galaxy.Galaxy) ([]string, error) {
	if len(claimed) > 0 {
		out := make([]string, 0, len(claimed))
		for id := range claimed {
			out = append(out, id)
		}
		sort.Strings(out) // BFS distances are order-independent; keep it deterministic
		return out, nil
	}
	if meta.OriginSystemId == "" {
		return nil, fmt.Errorf("%w: the live galaxy records no origin system", ErrNoSpawnSite)
	}
	return []string{meta.OriginSystemId}, nil
}

func (w *spawnWalk) run(ctx context.Context, sources []string, accountId string) (*galaxy.System, error) {
	// Expansion depth is measured from the blocks the walk STARTED in — never a
	// count of blocks touched (which would grow with the frontier's width and
	// make the cap population-dependent) and never a distance from the field
	// origin (which would be a world boundary).
	startBlocks := w.blocksOf(sources)

	// With no claimed space at all, criterion (b) is vacuous — the first
	// corporation in a fresh world may take the origin system itself.
	minHop := 0
	if len(w.claimed) > 0 {
		minHop = w.params.MinSpawnDistance
	}

	frontier := sources
	seen := make(map[string]bool, len(sources))
	for _, id := range frontier {
		seen[id] = true
	}

	// The walk advances a whole hop-RING at a time, and every storage call it
	// makes is batched over that ring: one horizon ensure, one adjacency read,
	// one qualification fan-out. Per-system calls made the search's cost scale
	// with the settled frontier's width, which is exactly the thing this change
	// must not be sensitive to.
	for hop := 0; len(frontier) > 0; hop++ {
		var reachable []string
		for _, id := range frontier {
			if w.depth(id, startBlocks) > w.params.MaxSpawnWalkBlocks {
				continue // beyond the defensive rail — never expanded past
			}
			reachable = append(reachable, id)
		}
		if len(reachable) == 0 {
			break
		}
		sort.Strings(reachable)

		// The walk's materialization rule: a system's true incident lanes must
		// exist before the walk expands past it (adversary R2-B2).
		if err := w.ensureHorizons(ctx, reachable); err != nil {
			return nil, err
		}

		if hop >= minHop {
			qualifiers, err := w.qualify(ctx, reachable)
			if err != nil {
				return nil, err
			}
			if len(qualifiers) > 0 {
				return pickUniform(qualifiers, accountId), nil
			}
		}

		adjacency, err := w.graph.NeighborsOfMany(ctx, reachable)
		if err != nil {
			return nil, err
		}
		var next []string
		for _, id := range reachable {
			for _, nb := range adjacency[id] {
				if seen[nb] {
					continue
				}
				seen[nb] = true
				next = append(next, nb)
			}
		}
		sort.Strings(next)
		frontier = next
	}

	// Either the reachable graph ran out (a finite origin component) or every
	// remaining system sat past the depth cap. Both are hard failures.
	return nil, ErrNoSpawnSite
}

// qualify filters one ring to the candidates that satisfy all four criteria.
// (b) and (c) are cheap in-memory set tests, so they run first and keep the
// storage fan-out down to the systems that could actually be picked.
func (w *spawnWalk) qualify(ctx context.Context, ring []string) ([]galaxy.System, error) {
	var ids []string
	for _, id := range ring {
		if !w.claimed[id] && !w.reserved[id] {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}
	systems, err := w.graph.GetLiveSystems(ctx, ids)
	if err != nil {
		return nil, err
	}
	var out []galaxy.System
	for _, sys := range systems {
		if sys.Discovery != nil && sys.Discovery.OwnerCorpId != "" {
			continue
		}
		if w.params.RequireMineable && !galaxy.HasMineableBody(&sys) {
			continue
		}
		// (d): the station's whole orbital shell stays outside the star's
		// clearance, so a fleet docked there is never refused for its origin.
		if !system.StationShellClearsStar(w.seed, sys.Id, sys.Skeleton) {
			continue
		}
		out = append(out, sys)
	}
	return out, nil
}

// ensureHorizons materializes one ring's full lane horizons, skipping blocks
// this walk already ensured.
func (w *spawnWalk) ensureHorizons(ctx context.Context, ring []string) error {
	blocks, err := w.graph.LaneHorizonBlocks(ctx, ring)
	if err != nil {
		return err
	}
	var missing []galaxy.Block
	for _, b := range blocks {
		if w.ensuredBlocks[b] {
			continue
		}
		w.ensuredBlocks[b] = true
		missing = append(missing, b)
	}
	if len(missing) == 0 {
		return nil
	}
	return w.graph.EnsureBlocks(ctx, missing...)
}

// depth is the Chebyshev block distance from the nearest starting block.
func (w *spawnWalk) depth(systemID string, start []galaxy.Block) int {
	b, ok := galaxy.BlockOfSystem(systemID, galaxy.GenerationParams{BlockSize: w.blockSize})
	if !ok || len(start) == 0 {
		return 0 // a non-field id has no measurable depth; never fence it out
	}
	best := -1
	for _, s := range start {
		d := chebyshev(b, s)
		if best < 0 || d < best {
			best = d
		}
	}
	return best
}

func (w *spawnWalk) blocksOf(systemIDs []string) []galaxy.Block {
	seen := map[galaxy.Block]bool{}
	var out []galaxy.Block
	for _, id := range systemIDs {
		b, ok := galaxy.BlockOfSystem(id, galaxy.GenerationParams{BlockSize: w.blockSize})
		if !ok || seen[b] {
			continue
		}
		seen[b] = true
		out = append(out, b)
	}
	return out
}

func chebyshev(a, b galaxy.Block) int {
	dx, dy := a.X-b.X, a.Y-b.Y
	if dx < 0 {
		dx = -dx
	}
	if dy < 0 {
		dy = -dy
	}
	if dx > dy {
		return dx
	}
	return dy
}

// pickUniform draws uniformly among a ring's qualifiers, ordered by system id
// and seeded from the account — so the pick is reproducible per account (an
// interrupted spawn re-derives the same site) without any frontier weighting
// (retired with the finite galaxy: the nearest-qualifying-ring rule already
// places new corporations just beyond the settled fringe).
func pickUniform(qualifiers []galaxy.System, accountId string) *galaxy.System {
	sort.Slice(qualifiers, func(i, j int) bool { return qualifiers[i].Id < qualifiers[j].Id })
	rng := rand.New(rand.NewSource(seedFromAccount(accountId)))
	return &qualifiers[rng.Intn(len(qualifiers))]
}

// seedFromAccount derives a stable RNG seed from the account id, so the pick is
// reproducible per account (idempotent re-spawn lands the same system).
func seedFromAccount(accountId string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(accountId))
	return int64(h.Sum64())
}
