package corporations

import (
	"fmt"
	"testing"

	"hexaverse/board"
)

// corporation-spawn, MODIFIED requirement "One Starting Hull at a
// Deterministic Rim Position" — scenario "The starting hull never lands on
// the core". SDET NOTE: this scenario had NO existing test in the
// pre-migration corpus (no "core" reference anywhere in corporations/*_test.go)
// — filed here as a genuine coverage gap this migration's rimHex→rimCell
// rename (design.md Decision 5) makes newly convenient to close, since
// rimCell is now a pure function of (accountId, schedule) rather than an
// enumerate-then-index call.
//
// design.md Decision 5 pins rimCell's exact signature:
//
//	func (s *Service) rimCell(accountId string, sched polar.Schedule) board.Cell
func TestRimCell_Scenario_NeverTheCore(t *testing.T) {
	svc := &Service{params: DefaultSpawnParams()}
	sched := board.Schedule(svc.params.RimRing + 5) // headroom above RimRing
	for i := 0; i < 200; i++ {
		accountId := fmt.Sprintf("account-%d", i)
		got := svc.rimCell(accountId, sched)
		if got == (board.Cell{Ring: 0, Slot: 0}) {
			t.Fatalf("rimCell(%q) = the core — a starting hull must never land there", accountId)
		}
		if got.Ring != svc.params.RimRing {
			t.Fatalf("rimCell(%q) ring = %d, want the configured RimRing %d", accountId, got.Ring, svc.params.RimRing)
		}
	}
}

// A healed retry (re-spawn attempt for the same account) must place the hull
// at the exact same rim cell.
func TestRimCell_Scenario_DeterministicPerAccount(t *testing.T) {
	svc := &Service{params: DefaultSpawnParams()}
	sched := board.Schedule(svc.params.RimRing + 5)
	a := svc.rimCell("account-heal-me", sched)
	b := svc.rimCell("account-heal-me", sched)
	if a != b {
		t.Fatalf("rimCell is not deterministic per account: %+v vs %+v", a, b)
	}
}

// design.md Decision 5: "No RingCells call... asking Slots(ring) and taking
// the modulus is the same answer with no allocation". This proves the slot
// index is drawn from the LIVE SCHEDULE's slot count on RimRing, not a fixed
// per-ring enumeration — two-sided per the coincidence-ring hazard: RimRing
// itself may happen to be a coincidence ring under default tuning, so this
// sweeps a RANGE of gate rings to find non-coincidence RimRing values and
// proves the slot distribution reaches beyond 6×RimRing on at least one.
func TestRimCell_Scenario_UsesLiveScheduleSlotCountNotFixedPerRing(t *testing.T) {
	proven := false
	for _, rimRing := range []int{3, 5, 9, 15} {
		sched := board.Schedule(rimRing + 1)
		if sched.Slots(rimRing) <= 6*rimRing {
			continue // coincidence ring at this radius; skip
		}
		svc := &Service{params: SpawnParams{RimRing: rimRing}}
		reachedBeyond := false
		for i := 0; i < 5000; i++ {
			got := svc.rimCell(fmt.Sprintf("acct-%d-%d", rimRing, i), sched)
			if got.Slot < 0 || got.Slot >= sched.Slots(rimRing) {
				t.Fatalf("rimCell slot %d out of range [0,%d) for ring %d", got.Slot, sched.Slots(rimRing), rimRing)
			}
			if got.Slot >= 6*rimRing {
				reachedBeyond = true
			}
		}
		if reachedBeyond {
			proven = true
		}
	}
	if !proven {
		t.Fatal("across every non-coincidence RimRing tried, rimCell never drew a slot at or above 6×RimRing — " +
			"a derivation still bounded by 6×ring (the retired RingCells-length assumption) would pass this test's absence")
	}
}
