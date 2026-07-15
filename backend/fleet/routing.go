package fleet

import (
	"context"
	"errors"
	"math"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/observation"
)

var (
	// ErrNoRoute means no path over the requester's charted lanes (plus one
	// Rumored terminal hop) reaches the destination — an unreached star, or one
	// only behind uncharted intermediates (#0008 routing contract). No blind jumps.
	ErrNoRoute = errors.New("no charted route to destination")
	// ErrSameSystem rejects a trip whose destination is the fleet's current system.
	ErrSameSystem = errors.New("destination is the current system")
)

// GraphSource is the galaxy-domain dependency routing needs: the live lane graph
// (system coords for lane length + gate bearings, lanes for adjacency). Defined
// here so fleet depends on an interface, not galaxy's concrete service, and tests
// inject a fake graph.
type GraphSource interface {
	GetLive(ctx context.Context) (*galaxy.GeneratedGalaxy, error)
}

// TierSource is the observation-domain dependency routing needs: the requester's
// per-system knowledge tiers AND their charted-lane set, so routing stays
// fog-honest — you travel only lanes you've charted (#0006 Decision #17).
type TierSource interface {
	SystemTiers(ctx context.Context, cid string) (map[string]observation.Tier, error)
	ChartedLanes(ctx context.Context, cid string) (map[string]bool, error)
}

// routePlan is the frozen output of a pathfind: the system chain origin..dest,
// the per-lane crossing times and ids, and the systems it references (coords
// for the caller's gate geometry).
type routePlan struct {
	route   []string             // [origin, ..., dest]
	legMs   []common.WorldMillis // len == len(route)-1
	laneIds []string             // len == len(route)-1; arrival charts these `via: traveled`
	systems map[string]galaxy.System
}

// planRoute finds the shortest-time lane path from origin to dest over the
// requester's CHARTED lanes (Dijkstra, weight = 3D lane length ÷ drive speed) —
// per-lane records, #0006 Decision #17: an uncharted lane is untravellable even
// between two systems you know. Intermediates must additionally be Explored
// (you can't route THROUGH a system you've never entered); the destination may
// be a single Rumored terminal hop past the frontier.
func (s *Service) planRoute(ctx context.Context, cid, origin, dest string) (*routePlan, error) {
	if origin == dest {
		return nil, ErrSameSystem
	}
	gal, err := s.graph.GetLive(ctx)
	if err != nil {
		return nil, err
	}
	systems := make(map[string]galaxy.System, len(gal.Systems))
	for _, sys := range gal.Systems {
		systems[sys.Id] = sys
	}
	if _, ok := systems[dest]; !ok {
		return nil, ErrNoRoute
	}

	charted, err := s.tiers.ChartedLanes(ctx, cid)
	if err != nil {
		return nil, err
	}
	type edge struct{ to, laneId string }
	adj := make(map[string][]edge, len(systems))
	for _, l := range gal.Lanes {
		if !charted[l.Id] {
			continue // an uncharted lane doesn't exist for this requester
		}
		adj[l.AId] = append(adj[l.AId], edge{to: l.BId, laneId: l.Id})
		adj[l.BId] = append(adj[l.BId], edge{to: l.AId, laneId: l.Id})
	}

	tiers, err := s.tiers.SystemTiers(ctx, cid)
	if err != nil {
		return nil, err
	}
	// You're physically in the origin, so it's always a valid start regardless of
	// its stored tier (a dev-seeded fleet may sit in an unexplored system).
	explored := func(id string) bool {
		return id == origin || tiers[id].AtLeast(observation.TierExplored)
	}
	rumored := func(id string) bool { return tiers[id] == observation.TierRumored }

	// Dijkstra over Explored nodes joined by charted lanes; a Rumored neighbor is
	// relaxable only when it IS the destination (a terminal hop) and is never
	// expanded further.
	dist := map[string]common.WorldMillis{origin: 0}
	prev := map[string]string{}
	prevLane := map[string]string{}
	visited := map[string]bool{}
	for {
		cur := ""
		var best common.WorldMillis
		for id, d := range dist {
			if visited[id] {
				continue
			}
			if cur == "" || d < best {
				cur, best = id, d
			}
		}
		if cur == "" || cur == dest {
			break
		}
		visited[cur] = true
		if !explored(cur) {
			continue // never route through a non-charted system
		}
		for _, e := range adj[cur] {
			if !explored(e.to) && !(e.to == dest && rumored(e.to)) {
				continue
			}
			w := legMs(systems[cur], systems[e.to], s.params.LaneMsPerDistance)
			nd := dist[cur] + w
			if od, ok := dist[e.to]; !ok || nd < od {
				dist[e.to] = nd
				prev[e.to] = cur
				prevLane[e.to] = e.laneId
			}
		}
	}

	if _, ok := dist[dest]; !ok {
		return nil, ErrNoRoute
	}
	route := reconstruct(prev, origin, dest)
	if len(route) == 0 || route[0] != origin {
		return nil, ErrNoRoute
	}
	legs := make([]common.WorldMillis, len(route)-1)
	laneIds := make([]string, len(route)-1)
	for i := 0; i < len(route)-1; i++ {
		legs[i] = legMs(systems[route[i]], systems[route[i+1]], s.params.LaneMsPerDistance)
		laneIds[i] = prevLane[route[i+1]]
	}
	return &routePlan{route: route, legMs: legs, laneIds: laneIds, systems: systems}, nil
}

// reconstruct walks the predecessor chain from dest back to origin, returning the
// forward path (origin..dest) or nil if the chain doesn't reach origin.
func reconstruct(prev map[string]string, origin, dest string) []string {
	var rev []string
	for at := dest; ; {
		rev = append(rev, at)
		if at == origin {
			break
		}
		p, ok := prev[at]
		if !ok {
			return nil
		}
		at = p
	}
	route := make([]string, len(rev))
	for i, id := range rev {
		route[len(rev)-1-i] = id
	}
	return route
}

// legMs is a lane's crossing time: 3D length between system coords × the drive's
// world-ms per unit distance, rounded to a whole millisecond.
func legMs(a, b galaxy.System, msPerDistance float64) common.WorldMillis {
	return common.WorldMillis(math.Round(laneLength(a, b) * msPerDistance))
}

// laneLength is the true 3D distance between two systems' coords (#0001: the
// map's geometry is load-bearing — cost is length-weighted).
func laneLength(a, b galaxy.System) float64 {
	dx := a.Coords.X - b.Coords.X
	dy := a.Coords.Y - b.Coords.Y
	dz := a.Coords.Z - b.Coords.Z
	return math.Sqrt(dx*dx + dy*dy + dz*dz)
}
