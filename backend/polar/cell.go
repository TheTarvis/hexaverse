// Package polar implements the polar (ring-and-slot) lattice — the candidate
// replacement for backend/board's cube-hex lattice (openspec capability:
// polar-lattice-math; docs/handoffs/2026-08-24-polar-lattice-migration.md).
//
// This package has ZERO consumers by design: it exists to prove Go↔TS parity
// on a new fixture family (/fixtures/polar/cases.json, mirrored by
// frontend/lib/polar) before any consumer migrates. backend/board remains the
// lattice every shipped consumer uses.
//
// The discipline (openspec cross-stack-determinism, applied here): every
// rule-bearing value — anything persisted, returned as a solve result, or fed
// into an ETA — is computed in integer or exact-rational arithmetic through to
// its final rounding. No floats, no trig, no sqrt anywhere in this package's
// rule-bearing surface; the only float in the package is RingRadius, which is
// render-side projection by declaration. Angles are rational turns
// (slot / slotsOnRing), never radians.
package polar

// Cell is a board position on the polar lattice: an integer (ring, slot)
// pair. Ring 0 is the single core cell and carries no angular index — its
// canonical form is always {0, 0}.
type Cell struct {
	Ring int `json:"ring"`
	Slot int `json:"slot"`
}

// NormalizeSlot wraps a raw slot index into [0, slots), in both directions
// (below zero and at or above the ring's slot count).
func NormalizeSlot(slot, slots int) int {
	return int(normalizeSlot64(int64(slot), int64(slots)))
}

func normalizeSlot64(slot, slots int64) int64 {
	return ((slot % slots) + slots) % slots
}

// canon returns the canonical form of a cell under a schedule: ring 0
// collapses to the single core cell, other rings wrap the slot index.
func canon(c Cell, s Schedule) Cell {
	if c.Ring <= 0 {
		return Cell{Ring: 0, Slot: 0}
	}
	return Cell{Ring: c.Ring, Slot: NormalizeSlot(c.Slot, s.Slots(c.Ring))}
}
