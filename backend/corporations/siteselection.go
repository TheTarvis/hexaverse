package corporations

import (
	"errors"
	"hash/fnv"
	"math"
	"math/rand"
	"sort"

	"hexaverse/galaxy"
)

// ErrNoSpawnSite means no system satisfies all three criteria. Unreachable while
// the world is near-empty (the placeholder constants pass trivially), but a real
// possibility once the graph fills — the wake-up flow surfaces it rather than
// softlocking on a bad pick.
var ErrNoSpawnSite = errors.New("no spawn site satisfies the criteria")

// selectSpawnSite runs the three #0009 criteria over the live graph and returns
// the wake-up system: (a) bootstrap-guaranteed — ≥1 Mineable body on the
// skeleton; (b) unclaimed — ≥ MinSpawnDistance lane-hops from every claimed
// (explored) system; (c) frontier-weighted — a periphery-biased random pick among
// qualifiers. The pick is seeded from accountId, so a spawn that partially failed
// re-picks the SAME site on retry (reinforcing idempotency).
func selectSpawnSite(gal *galaxy.GeneratedGalaxy, claimed map[string]bool, params SpawnParams, accountId string) (*galaxy.System, error) {
	if gal == nil || len(gal.Systems) == 0 {
		return nil, ErrNoSpawnSite
	}
	adj := buildAdjacency(gal)

	// (b) unclaimed: hops from the nearest already-explored system. A system with
	// no entry is unreachable from claimed space (or there's no claimed space at
	// all) — maximally unclaimed, so it qualifies.
	claimDist := multiSourceBFS(adj, claimedIDs(claimed, gal))

	// (c) frontier proxy: lane-hops from the graph-central system (the node nearest
	// the coordinate centroid). Farther = more peripheral = heavier weight. A cheap
	// O(N) stand-in for true graph eccentricity, which waits for whole-graph tuning.
	periphery := multiSourceBFS(adj, []string{centralSystemID(gal)})

	type candidate struct {
		sys    *galaxy.System
		weight float64
	}
	var cands []candidate
	for i := range gal.Systems {
		s := &gal.Systems[i]
		if params.RequireMineable && !hasMineableBody(s) { // (a)
			continue
		}
		if d, ok := claimDist[s.Id]; ok && d < params.MinSpawnDistance { // (b)
			continue
		}
		weight := 1 + params.PeripheryWeight*float64(periphery[s.Id]) // (c)
		cands = append(cands, candidate{sys: s, weight: weight})
	}
	if len(cands) == 0 {
		return nil, ErrNoSpawnSite
	}

	// Deterministic weighted pick: sort by id for a stable base order, then draw
	// against the cumulative weight with an account-seeded RNG.
	sort.Slice(cands, func(i, j int) bool { return cands[i].sys.Id < cands[j].sys.Id })
	var total float64
	for _, c := range cands {
		total += c.weight
	}
	rng := rand.New(rand.NewSource(seedFromAccount(accountId)))
	draw := rng.Float64() * total
	for i := range cands {
		draw -= cands[i].weight
		if draw <= 0 {
			return cands[i].sys, nil
		}
	}
	return cands[len(cands)-1].sys, nil // float slack — last qualifier
}

// hasMineableBody reports whether the skeleton carries the bootstrap guarantee.
func hasMineableBody(s *galaxy.System) bool {
	for _, b := range s.Skeleton.Bodies {
		if b.Mineable {
			return true
		}
	}
	return false
}

// buildAdjacency turns the lane list into an undirected adjacency map.
func buildAdjacency(gal *galaxy.GeneratedGalaxy) map[string][]string {
	adj := make(map[string][]string, len(gal.Systems))
	for _, l := range gal.Lanes {
		adj[l.AId] = append(adj[l.AId], l.BId)
		adj[l.BId] = append(adj[l.BId], l.AId)
	}
	return adj
}

// claimedIDs is the subset of the claimed set present in the live graph — the BFS
// sources for the unclaimed-distance test.
func claimedIDs(claimed map[string]bool, gal *galaxy.GeneratedGalaxy) []string {
	if len(claimed) == 0 {
		return nil
	}
	present := make(map[string]bool, len(gal.Systems))
	for i := range gal.Systems {
		present[gal.Systems[i].Id] = true
	}
	out := make([]string, 0, len(claimed))
	for id := range claimed {
		if present[id] {
			out = append(out, id)
		}
	}
	sort.Strings(out) // BFS distances are order-independent, but keep it deterministic
	return out
}

// multiSourceBFS returns lane-hop distance from the nearest source to every
// reachable system. Systems absent from the result are unreachable from any source.
func multiSourceBFS(adj map[string][]string, sources []string) map[string]int {
	dist := make(map[string]int, len(adj))
	queue := make([]string, 0, len(sources))
	for _, s := range sources {
		if _, seen := dist[s]; seen {
			continue
		}
		dist[s] = 0
		queue = append(queue, s)
	}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, nb := range adj[cur] {
			if _, seen := dist[nb]; seen {
				continue
			}
			dist[nb] = dist[cur] + 1
			queue = append(queue, nb)
		}
	}
	return dist
}

// centralSystemID is the system nearest the coordinate centroid — the reference
// the periphery proxy measures outward from.
func centralSystemID(gal *galaxy.GeneratedGalaxy) string {
	var cx, cy, cz float64
	n := float64(len(gal.Systems))
	for i := range gal.Systems {
		cx += gal.Systems[i].Coords.X
		cy += gal.Systems[i].Coords.Y
		cz += gal.Systems[i].Coords.Z
	}
	cx, cy, cz = cx/n, cy/n, cz/n
	bestID, best := gal.Systems[0].Id, math.MaxFloat64
	for i := range gal.Systems {
		c := gal.Systems[i].Coords
		d := (c.X-cx)*(c.X-cx) + (c.Y-cy)*(c.Y-cy) + (c.Z-cz)*(c.Z-cz)
		if d < best {
			best, bestID = d, gal.Systems[i].Id
		}
	}
	return bestID
}

// seedFromAccount derives a stable RNG seed from the account id, so the weighted
// pick is reproducible per account (idempotent re-spawn lands the same system).
func seedFromAccount(accountId string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(accountId))
	return int64(h.Sum64())
}
