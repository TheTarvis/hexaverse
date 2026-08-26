// Package board holds the pure tactical-board math shared across the backend
// (system interiors, fleet movement) and mirrored on the client
// (frontend/lib/board). It has no Firestore or clock dependency. The Go↔TS
// determinism seam lives here: the recorded cases in /fixtures/board are the
// contract both sides assert against (openspec board-tactical-math,
// cross-stack-determinism).
//
// Since the polar migration (rewrite-board-on-polar-lattice, 2026-08-25) the
// board computes on ring-and-slot polar cells: backend/polar is the lattice
// core (adjacency, arc paths, orbital advance); this package owns the
// tactical layer — the pinned production schedule, the hop metric, movement
// state and solves, lane gates, and visibility on the pinned coordinate
// table. The hex lattice, its axial/cube machinery, and RouteAround are gone:
// a polar path structurally cannot cross the core unless an endpoint is the
// core, so there is nothing to route around.
package board

import (
	"sync"

	"hexaverse/common"
	"hexaverse/polar"
)

// Cell is a board position: an integer (ring, slot) pair on the polar
// lattice. Ring 0 is the single core cell (the star). The alias keeps every
// consumer speaking board.Cell while polar owns the lattice math.
type Cell = polar.Cell

// The production slot schedule is PINNED to Isotropic (openspec
// board-tactical-math, "The Production Slot Schedule Is Pinned to
// Isotropic"; settled 2026-08-25): ring 1 carries InnerSlots slots and the
// count doubles exactly at each ring in doubleAt. The values live HERE, not
// in polar — the lattice core stays value-agnostic (its schedule-shape
// validation is the invariant; these values are this game's choice). Every
// recorded fixture case names the schedule it was generated under.
const InnerSlots = 6

// DoubleAt returns the pinned doubling boundaries — a fresh slice each call
// so no caller can mutate the pinned values.
func DoubleAt() []int { return []int{2, 3, 5, 9, 17} }

// Schedule builds the production slot schedule for a board of the given
// maximum ring (inclusive). maxRing stays a parameter because board radius is
// per-system (the system generator sets it); the slot count of any given ring
// is the same under every maxRing, so schedules of different radii agree
// wherever they overlap.
func Schedule(maxRing int) polar.Schedule {
	return polar.NewBandedSchedule(InnerSlots, DoubleAt(), maxRing)
}

var (
	productionScheduleMu     sync.RWMutex
	productionScheduleRadius = -1 // sentinel: never a valid BoardRadius
	productionSchedule       polar.Schedule
)

// ProductionSchedule returns Schedule(common.Tuning().BoardRadius) — the
// default schedule source for every caller that does not hold a per-system
// radius (fleet, corporations, stations, mine, market, every action.Params
// decode; design.md Decision 3). Memoized on the RADIUS VALUE, not called
// once and cached forever: a live retune of common.Tuning().BoardRadius is
// observed on the next call.
func ProductionSchedule() polar.Schedule {
	radius := common.Tuning().BoardRadius

	productionScheduleMu.RLock()
	if productionScheduleRadius == radius {
		s := productionSchedule
		productionScheduleMu.RUnlock()
		return s
	}
	productionScheduleMu.RUnlock()

	productionScheduleMu.Lock()
	defer productionScheduleMu.Unlock()
	if productionScheduleRadius != radius {
		productionSchedule = Schedule(radius)
		productionScheduleRadius = radius
	}
	return productionSchedule
}

// Within returns every cell at most radius hops from center under the
// lattice hop metric — the set form of Distance's "within N" rule. It is the
// bounded form of the BFS Distance already runs (same neighbors enumeration,
// same polar.IsAdjacent predicate), stopping the frontier expansion at
// radius instead of walking until a single target is found. Go-only: fog
// coverage is server-side only, so there is no TS mirror and no fixture
// family (design.md Decision 6; fixtures/board/mirror-map.json's goOnly
// list).
func Within(center Cell, radius int, s polar.Schedule) map[Cell]bool {
	center = Canon(center, s)
	out := map[Cell]bool{center: true}
	if radius <= 0 {
		return out
	}
	frontier := []Cell{center}
	for hop := 0; hop < radius && len(frontier) > 0; hop++ {
		var next []Cell
		for _, c := range frontier {
			for _, nb := range neighbors(c, s) {
				if out[nb] {
					continue
				}
				out[nb] = true
				next = append(next, nb)
			}
		}
		frontier = next
	}
	return out
}

// RingCells returns the cells on a ring in slot order — the fixed enumeration
// a stored slot index refers to on both sides of the seam.
func RingCells(ring int, s polar.Schedule) []Cell {
	if ring <= 0 {
		return []Cell{{Ring: 0, Slot: 0}}
	}
	slots := s.Slots(ring)
	out := make([]Cell, 0, slots)
	for i := 0; i < slots; i++ {
		out = append(out, Cell{Ring: ring, Slot: i})
	}
	return out
}

// Distance is the lattice hop metric: the minimum number of adjacency steps
// between two cells — the graph metric induced by true corner contact
// (openspec board-tactical-math, "Lattice Hop Distance"). Pure integer
// arithmetic (a breadth-first walk over the lattice). This is the successor
// of hex distance for every "within N" rule: under the pinned near-square
// schedule one hop tracks one radial unit closely in every direction, which
// is what makes a hop budget a meaningful range.
func Distance(a, b Cell, s polar.Schedule) int {
	a = Canon(a, s)
	b = Canon(b, s)
	if a == b {
		return 0
	}
	// BFS from a until b is reached. The frontier only ever spans three rings,
	// but a plain visited-set walk is simple, exact, and fast enough for every
	// live caller (fog ambient radius, range checks).
	type node struct {
		c Cell
		d int
	}
	visited := map[Cell]bool{a: true}
	queue := []node{{a, 0}}
	for len(queue) > 0 {
		n := queue[0]
		queue = queue[1:]
		for _, nb := range neighbors(n.c, s) {
			if visited[nb] {
				continue
			}
			if nb == b {
				return n.d + 1
			}
			visited[nb] = true
			queue = append(queue, node{nb, n.d + 1})
		}
	}
	return -1 // unreachable on a connected lattice; keeps the signature total
}

// neighbors enumerates the cells adjacent to c under the tight predicate, in
// a fixed (ring, slot) order.
func neighbors(c Cell, s polar.Schedule) []Cell {
	out := make([]Cell, 0, 8)
	for ring := c.Ring - 1; ring <= c.Ring+1; ring++ {
		if ring < 0 || ring > s.MaxRing {
			continue
		}
		if ring == 0 {
			if c.Ring == 1 {
				out = append(out, Cell{Ring: 0, Slot: 0})
			}
			continue
		}
		if c.Ring == 0 {
			if ring == 1 {
				for slot := 0; slot < s.Slots(1); slot++ {
					out = append(out, Cell{Ring: 1, Slot: slot})
				}
			}
			continue
		}
		// Same or adjacent non-core ring: candidate slots near c's angular
		// position — scan the window of slots within one cell width either
		// side rather than the whole ring.
		slots := s.Slots(ring)
		cSlots := s.Slots(c.Ring)
		// c's position scaled onto the candidate ring's grid, floor and ceil.
		lo := (c.Slot*slots)/cSlots - 2
		hi := (c.Slot*slots)/cSlots + 3
		for raw := lo; raw <= hi; raw++ {
			nb := Cell{Ring: ring, Slot: polar.NormalizeSlot(raw, slots)}
			if nb == c {
				continue
			}
			if polar.IsAdjacent(c, nb, s) && !containsCell(out, nb) {
				out = append(out, nb)
			}
		}
	}
	return out
}

func containsCell(cells []Cell, c Cell) bool {
	for _, x := range cells {
		if x == c {
			return true
		}
	}
	return false
}

// Canon returns the canonical form of a cell under a schedule: ring 0 (and
// any negative ring) collapses to the single core cell, other rings wrap the
// slot index into range.
func Canon(c Cell, s polar.Schedule) Cell {
	if c.Ring <= 0 {
		return Cell{Ring: 0, Slot: 0}
	}
	return Cell{Ring: c.Ring, Slot: polar.NormalizeSlot(c.Slot, s.Slots(c.Ring))}
}
