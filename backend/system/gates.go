package system

import (
	"context"
	"sort"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
)

// LaneGate is a charted lane's gate BODY in this system — a body like any
// other, with a continuous position, a size and an orbital element set,
// which is what a fleet burns to and attaches at. The gate's place in the
// world is `Space`/`OrbitElements`, resolved through the same body table
// every other continuous position folds through.
type LaneGate struct {
	// Id is this gate BODY's id in the system's own body table — the string
	// a burn order names as its `bodyId` and the string `fleet.AttachedTo`
	// reports once that burn settles (openspec build-production-space-view
	// tasks.md 9.1b; system-interior *Lane-Gate Bodies Carry Their Body
	// Id*). It is the ONLY identity a client has for a gate, which is why it
	// is served rather than left for every consumer to reconstruct from the
	// naming convention.
	//
	// Populated from gateId — the SAME function that names the gate body in
	// the body table — here at construction, never in the degradable
	// fillGateGeometry pass: like LaneId it is a pure function of known
	// system ids with no missing-data case, so it must never zero-value.
	Id           string `json:"id"`
	DestSystemId string `json:"destSystemId"`
	// LaneId is this crossing's lane id, derived purely from the unordered
	// pair of system ids (galaxy.LaneIdBetween — replace-observation-with-
	// sightings tasks.md 4.11, system-interior "Lane-Gate Bodies Carry Their
	// Lane Id"). Set at construction (LaneGates below), never by a
	// degradable post-pass like fillGateGeometry: unlike Space/Size, it has
	// no missing-data case — it is a pure function of two known system ids
	// — so it must never zero-value. It is the id POST
	// /v1/fleets/:fleetId/jump accepts, served regardless of charted
	// knowledge, exactly as the gate body itself is.
	LaneId string `json:"laneId"`
	// Space/Size are the gate body's continuous position and physical
	// radius (replace-observation-with-sightings
	// design.md Decisions 5/26; tasks.md 4.7 — "every body, bodies and gate
	// bodies alike, carries a continuous position and size"). Zero-valued
	// when no body table was available to resolve them (GetInterior's own
	// degradation) — filled by the interior handler, never by LaneGates
	// itself, which has no body table to resolve them from.
	Space space.Vec3 `json:"space"`
	Size  float64    `json:"size"`
	// OrbitElements is the gate body's continuous orbital element set
	// (serve-orbital-elements-and-burn-preview, system-interior "A lane-gate
	// body's read carries its full orbital element set"). Read from the
	// system's OWN body table — which already derives it once, at table
	// construction (bodies.go's gateOrbit) — never re-derived at read time:
	// gateOrbit stays a generation-time function with one caller. Filled by
	// the same degradable fillGateGeometry pass that resolves Space/Size, so
	// a gate whose body is unresolvable degrades exactly as it does today
	// (nil elements) rather than failing the read.
	OrbitElements *orbitElementsDTO `json:"orbitElements,omitempty"`
}

// fillGateGeometry additively populates gates' Space/Size fields from a
// resolved body table — a second pass over LaneGates' own output rather
// than a BodyTable parameter threaded through LaneGates itself, since
// LaneGates' existing signature and tests (gates_test.go) predate this
// capability and name no such dependency. Degrades a gate to a zero
// Space/Size (never dropping it, never failing the read) when its body
// isn't resolvable in bt — the same "an unfiltered body list may still
// individually degrade" posture BodyTable's own gate derivation already
// takes (bodies.go: addGates).
func fillGateGeometry(gates []LaneGate, bt *BodyTable, now common.WorldMillis) {
	if bt == nil {
		return
	}
	for i := range gates {
		body, ok := bt.Body(gateId(gates[i].DestSystemId))
		if !ok {
			continue
		}
		// Elements first, and independently of the position resolve: they are
		// the table's own stored derivation, not a resolution result, so a
		// gate whose live position cannot be folded still ships them.
		gates[i].OrbitElements = orbitElementsOf(body.Orbit)
		pos, err := space.Position(bt, gateId(gates[i].DestSystemId), now)
		if err != nil {
			continue
		}
		gates[i].Space = pos
		gates[i].Size = body.Size
	}
}

// LaneGates returns every lane gate of the given system: for each lane
// touching the system, the gate BODY it departs through, whose position and
// size the caller resolves from the system's own body table
// (fillGateGeometry). It takes no radius — a gate's place in the world is its
// continuous orbit, so there is nothing left to project onto. Unfiltered —
// every lane-gate body ships to every authenticated requester regardless of stored
// map knowledge (replace-observation-with-sightings design.md Decision 5;
// system-interior "Bodies Are Public; Ships Are Disclosed"): standing next to
// a physical gate and reading the sign on it is how a corporation finds the
// roads, and gating that would make a fresh corporation's galaxy
// untraversable.
func (s *Service) LaneGates(ctx context.Context, systemID string) ([]LaneGate, error) {
	gal, err := s.galaxySvc.GetLive(ctx)
	if err != nil {
		return nil, err
	}

	var self *galaxy.System
	coords := make(map[string]galaxy.Coords, len(gal.Systems))
	for i := range gal.Systems {
		sys := &gal.Systems[i]
		coords[sys.Id] = sys.Coords
		if sys.Id == systemID {
			self = sys
		}
	}
	if self == nil {
		return nil, ErrNotFound
	}

	var gates []LaneGate
	for _, l := range gal.Lanes {
		var nb string
		switch systemID {
		case l.AId:
			nb = l.BId
		case l.BId:
			nb = l.AId
		default:
			continue
		}
		// The neighbour must still be a system in the live galaxy; its
		// coordinates no longer matter here, now that a gate's place in the
		// world is its continuous orbit.
		if _, ok := coords[nb]; !ok {
			continue
		}
		gates = append(gates, LaneGate{
			Id:           gateId(nb),
			DestSystemId: nb,
			LaneId:       galaxy.LaneIdBetween(systemID, nb),
		})
	}
	// Deterministic order so the read is stable across requests.
	sort.Slice(gates, func(i, j int) bool { return gates[i].DestSystemId < gates[j].DestSystemId })
	return gates, nil
}
