package system

// BodyTable — the `space.Bodies` implementation (openspec
// add-orbital-system-bodies, design.md Decision 9). A materialized,
// immutable, per-request snapshot: one interior read (already
// decode/cascade-clean by GetOrCreateInterior), the station splice (already
// done), derived belt members, and derived lane gates, composed into one
// map. It is an UNFILTERED, requester-agnostic internal seam — see Ids's own
// doc — never a response, in whole, in part, or as a derived count.
//
// Zero consumers today, exactly as `space` and `disclosure` were when they
// landed (design.md Non-Goals): `fleet` still flies the lattice,
// `observation` still serves fog, `mine`/`market`/`stations` still resolve
// through `board`.

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"hexaverse/disclosure"
	"hexaverse/galaxy"
	"hexaverse/space"

	"github.com/rs/zerolog/log"
)

// ErrInteriorPredatesContinuum is returned when a stored interior carries no
// (or a non-positive) Extent — it predates this capability, and a
// BodyTable can never be built from it: gate derivation would otherwise
// compute a zero-radius gate from a zero extent (design.md Decision 2/7;
// system-interior: "An Interior Predating This Capability Fails Closed,
// Never Silently").
var ErrInteriorPredatesContinuum = errors.New("system: interior predates continuous orbital elements (no stored extent)")

// ErrBodyTableNoStar is returned when a BodyTable build's interior yields no
// star feature, or a star feature whose size is not strictly positive.
// Never substituted with a default (system-body-table: "A Table Refuses to
// Build Without a Positively-Sized Star").
var ErrBodyTableNoStar = errors.New("system: interior has no positively-sized star feature")

// BodyTable is the materialized, immutable snapshot every space.Position /
// space.SolveBurn / disclosure predicate resolves a system's bodies
// through. Holds no package-level state and is safe to share across
// goroutines once built.
type BodyTable struct {
	bodies   map[string]space.Body
	starId   string
	starSize float64
	extent   float64
	ids      []string
}

// Body implements space.Bodies.
func (t *BodyTable) Body(id string) (space.Body, bool) {
	v, ok := t.bodies[id]
	return v, ok
}

// StarId is the system's star — the table's only parentless body.
func (t *BodyTable) StarId() string { return t.starId }

// StarSize is the star's radius — always strictly positive on a
// successfully built table.
func (t *BodyTable) StarSize() float64 { return t.starSize }

// Extent is the interior's continuous upper bound (SystemInterior.Extent).
func (t *BodyTable) Extent() float64 { return t.extent }

// Ids enumerates every body this table resolves, in a stable, deterministic
// order — identical across two builds of the same interior, station, and
// live lane set. This is an UNFILTERED, requester-agnostic internal seam:
// nothing here is fog-projected, and no handler may reference BodyTable or
// Ids() directly (system-body-table: "The Body Table Is an Unfiltered
// Internal Seam, Never a Response") — a consumer needing positions for a
// response must project this table through a disclosure filter first
// (link 5's job, not this one's).
func (t *BodyTable) Ids() []string { return t.ids }

var _ space.Bodies = (*BodyTable)(nil)

// asDisclosureWorld is a compile-time-only capability check (task 7.6):
// *BodyTable satisfies space.Bodies and carries exactly what
// disclosure.World needs (Bodies, StarId, StarSize) to be constructed from
// it. system has zero disclosure consumers today; this function is never
// called in production.
func asDisclosureWorld(t *BodyTable) disclosure.World {
	return disclosure.World{Bodies: t, StarId: t.StarId(), StarSize: t.StarSize()}
}

// BodyTable composes, in one pass, the system's persisted interior
// (materializing an unmaterialized system through the same
// GetOrCreateInterior create-if-absent path — never a second, divergent
// answer to "what is in this system"), the derived belt members, and the
// derived lane gates.
//
// Three independent degradation paths (system-body-table: "The Table
// Degrades to Fewer Bodies Rather Than a Failed Build"): a station-store
// failure (already absorbed by GetOrCreateInterior's own spliceStation)
// omits only the station; a live lane-set read failure omits only gates;
// an interior read failure — including an interior predating this
// capability, or one with no positively-sized star — fails the whole
// build, producing no table.
func (s *Service) BodyTable(ctx context.Context, systemID string) (*BodyTable, error) {
	gen, err := s.GetOrCreateInterior(ctx, systemID)
	if err != nil {
		return nil, err
	}
	if gen.Interior.Extent <= 0 {
		return nil, fmt.Errorf("system %s: %w", systemID, ErrInteriorPredatesContinuum)
	}

	bodies := make(map[string]space.Body, len(gen.Features)*2)
	var starId string
	var starSize float64
	for _, f := range gen.Features {
		if f.Type == FeatureStar {
			starId, starSize = f.Id, f.Size
			bodies[f.Id] = space.Body{Id: f.Id, Size: f.Size}
			continue
		}
		if f.Space == nil {
			// Already omitted by the decode/cascade guards in
			// GetOrCreateInterior; defensive, unreachable in practice.
			continue
		}
		bodies[f.Id] = space.Body{Id: f.Id, Size: f.Size, Orbit: f.Space}

		// Belt member synthesis: derived, never persisted, and only for a
		// belt that survived the cascade (design.md Decision 5).
		if f.Type == FeatureBelt {
			for k := 0; k < AsteroidsPerBelt; k++ {
				m := beltMemberOrbit(f, k)
				bodies[m.Id] = m
			}
		}
	}
	if starId == "" || !(starSize > 0) {
		return nil, fmt.Errorf("system %s: %w", systemID, ErrBodyTableNoStar)
	}

	s.addGates(ctx, systemID, gen.Interior.Extent, bodies)

	ids := make([]string, 0, len(bodies))
	for id := range bodies {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	return &BodyTable{
		bodies:   bodies,
		starId:   starId,
		starSize: starSize,
		extent:   gen.Interior.Extent,
		ids:      ids,
	}, nil
}

// gateId names a lane gate body deterministically by its destination
// system id.
func gateId(destSystemId string) string {
	return "gate-" + destSystemId
}

// addGates derives every lane gate for systemID's incident lanes and adds
// them to bodies — Decision 8's bounded neighbourhood read
// (galaxy.NeighborsOf + galaxy.GetLiveSystems over just the neighbours plus
// self), never a whole-galaxy scan, so cost is bounded independent of
// galaxy size. Degrades to omitting gates (never the whole build) on any
// read failure, and a degradation is recorded distinguishably from genuine
// absence: a real, empty neighbour set logs nothing.
func (s *Service) addGates(ctx context.Context, systemID string, extent float64, bodies map[string]space.Body) {
	neighbors, err := s.galaxySvc.NeighborsOf(ctx, systemID)
	if err != nil {
		log.Warn().Ctx(ctx).Err(err).Str("systemId", systemID).
			Msg("Live lane set unavailable; serving system body table without lane gates")
		return
	}
	if len(neighbors) == 0 {
		return
	}

	ids := append(append([]string{}, neighbors...), systemID)
	systems, err := s.galaxySvc.GetLiveSystems(ctx, ids)
	if err != nil {
		log.Warn().Ctx(ctx).Err(err).Str("systemId", systemID).
			Msg("Live lane set unavailable; serving system body table without lane gates")
		return
	}
	byId := make(map[string]galaxy.System, len(systems))
	for _, sys := range systems {
		byId[sys.Id] = sys
	}
	self, ok := byId[systemID]
	if !ok {
		log.Warn().Ctx(ctx).Str("systemId", systemID).
			Msg("This system's own coordinates were not resolvable in the live lane set; serving system body table without lane gates")
		return
	}

	// Sorted by destination system id (design.md Decision 8) — Ids()'s own
	// global sort makes this a belt-and-suspenders determinism choice, not
	// a load-bearing one, but it matches the design text verbatim.
	sortedNeighbors := append([]string{}, neighbors...)
	sort.Strings(sortedNeighbors)

	for _, destId := range sortedNeighbors {
		nb, ok := byId[destId]
		if !ok {
			log.Warn().Ctx(ctx).Str("systemId", systemID).Str("destSystemId", destId).
				Msg("Lane destination system unresolvable in the live lane set; omitting its gate")
			continue
		}
		orbit := gateOrbit(self.Coords, nb.Coords, extent)
		id := gateId(destId)
		bodies[id] = space.Body{Id: id, Size: GateSize, Orbit: &orbit}
	}
}

// gateOrbit derives a lane gate's continuous orbit purely from the galaxy
// layout (design.md Decision 7): bearing via space.PhaseIndexOf on the
// horizontal projection between the two systems' galaxy coordinates
// (Z — elevation — is dropped, a deliberate choice, not a rounding-away),
// radius extent*GateRadiusFactor (identical for every gate in one system),
// motionless (PeriodMs = 0), on the ecliptic (zero inclination, zero node —
// never a DominantOrbitDirection-sourced side, never jitter).
func gateOrbit(from, to galaxy.Coords, extent float64) space.Orbit {
	dx := to.X - from.X
	dz := to.Y - from.Y // horizontal projection; to.Z/from.Z (elevation) dropped
	var phase space.SubTurns
	if dx == 0 && dz == 0 {
		phase = space.DefaultPhaseIndex
	} else {
		phase, _ = space.PhaseIndexOf(space.Vec3{X: dx, Z: dz})
	}
	return space.Orbit{
		ParentId:    "feat-star",
		Radius:      float64(extent * GateRadiusFactor),
		PeriodMs:    0, // motionless (design.md Decision 1/7)
		Phase:       phase,
		Inclination: 0,
		Node:        0,
	}
}
