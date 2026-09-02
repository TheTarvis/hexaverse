package mine

import (
	"context"
	"testing"

	"hexaverse/system"
)

// mine-extraction, "Belt Member Targets Resolve Through Their Parent Belt
// Feature" — "A member's mine run depletes the same lode as its parent
// belt feature"; system-interior, "A Belt's Members Are Discrete Mineable
// Bodies On a Shared Radius" — "A member's mining draws from and depletes
// the belt's one shared lode" (re-express-economy-positions tasks.md 2.6).
//
// EXPECTED RED TODAY: mine.Service.Commit resolves a target by searching
// interior.Features for the EXACT featureId (findFeature, service.go) — a
// belt member id like "feat-belt-0#3" never appears there (the generator
// only ever synthesizes members into the system's derived body table,
// never into interior.Features — see system/bodies.go's belt-member
// synthesis loop), so committing against a member id fails with
// ErrUnknownKind today. Once tasks 2.3-2.5 land (resolving a member id to
// its parent belt feature for mineability/richness/ledger key alike),
// this test's very first commit call succeeds and both runs below fold
// into the identical `${systemId}::${beltFeatureId}::${kind}` ledger key.
//
// Fixture note: the fleet attached to the member id is seeded with
// AttachedTo set directly (mirroring section 2's own fixture style — the
// docked-state precondition is satisfied by the fixture, not by a real
// burn); fleet/belt_member_burn_target_test.go's
// TestOrderTo_Scenario_BurnToADerivedBeltMemberBodyIdAttaches (tasks.md
// 3.7) is what proves the game can actually reach this state through a
// real OrderTo commit + BurnResolver resolve.
func TestIntegration_Scenario_MemberAndParentDepleteTheSameLedger(t *testing.T) {
	// startTons = 0.5 richness x 200 = 100 tons — both 40-ton runs below fit
	// inside it, so both succeeding in full is itself evidence they share
	// ONE lode rather than each drawing from an independent 100-ton lode of
	// its own.
	stack, cleanup := newMineTestStack(t, MineParams{MinRunTons: 1, TonsPerRichness: 200}, stdStats)
	defer cleanup()
	ctx := context.Background()
	stack.sysFake.interiors["sys-1"] = &system.GeneratedInterior{
		Features: []system.Feature{beltFeature("feat-belt-0", system.ResourceMetals)},
	}
	const memberId = "feat-belt-0#3"
	stack.seedFleet(t, "fleet-1", "corp-A", "sys-1", memberId, nil)
	stack.seedFleet(t, "fleet-2", "corp-B", "sys-1", "feat-belt-0", nil)

	a1, err := stack.mineSvc.Commit(ctx, "corp-A", "fleet-1", MineRequest{FeatureId: memberId, Kind: system.ResourceMetals, Tons: 40})
	if err != nil {
		t.Fatalf("commit via belt member id %q: %v, want success (resolving through the parent belt feature, never searching interior.Features for the member itself)", memberId, err)
	}
	a2, err := stack.mineSvc.Commit(ctx, "corp-B", "fleet-2", MineRequest{FeatureId: "feat-belt-0", Kind: system.ResourceMetals, Tons: 40})
	if err != nil {
		t.Fatalf("commit via the parent belt feature's own id: %v", err)
	}

	stack.clk.set(a1.Eta + a2.Eta + 1000)
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}

	ledgerKey := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	if got := stack.foldLedger(t, ledgerKey, stack.clk.now); got != -80 {
		t.Errorf("ledger fold = %v, want -80 (40 via the member + 40 via the parent, one shared lode, one shared ledger key)", got)
	}
	if got := stack.readFleet(t, "fleet-1").Cargo[string(system.ResourceMetals)]; got != 40 {
		t.Errorf("fleet-1 (mined via the member id) cargo.metals = %v, want 40", got)
	}
	if got := stack.readFleet(t, "fleet-2").Cargo[string(system.ResourceMetals)]; got != 40 {
		t.Errorf("fleet-2 (mined via the parent id) cargo.metals = %v, want 40", got)
	}

	// A THIRD commit, via a DIFFERENT member id (feat-belt-0#5, not #3),
	// requesting more than the 20 tons the lode has left after the two
	// 40-ton runs above.
	//
	// SPEC ADJUDICATION (revised from an earlier draft of this test that
	// expected this 21-ton commit to be REJECTED as an "already-depleted-
	// lode commit-time clamp" — cause: a developer test dispute, adjudicated
	// against the original assertion): mine-extraction's "Minimum Mine Run
	// Size" is explicit that "nothing requires a committed run's tons to
	// fit within the lode's remaining tonnage (only that it not exceed free
	// hold), so the last take-bearing delta against a lode can be a
	// sub-MinRunTons dry-clamp tail" (spec.md:82-84); "Already-Depleted Lode
	// Rejected At Commit" rejects only when the folded remaining is AT OR
	// BELOW ZERO (spec.md:175-179) — 20 is positive, so this commit is
	// legal by design, and service_test.go's own must-stay-green
	// TestCommit_Scenario_ContestedLodeStillCommits already pins exactly
	// this shape (a positively-remaining, contested lode still commits).
	// The lode's true tonnage is enforced at RESOLVE, by "Resolve Clamps
	// Yield to Reality"'s max(0, ...) floor — never at commit. This
	// scenario's real intent survives unchanged: proving depletion is
	// visible CROSS-MEMBER (through a THIRD, different member id, not just
	// member<->parent) by folding the identical shared ledger key, and that
	// the eventual over-request still clamps correctly at resolve.
	stack.seedFleet(t, "fleet-3", "corp-C", "sys-1", "feat-belt-0#5", nil)
	a3, err := stack.mineSvc.Commit(ctx, "corp-C", "fleet-3", MineRequest{FeatureId: "feat-belt-0#5", Kind: system.ResourceMetals, Tons: 21})
	if err != nil {
		t.Fatalf("a 21-ton commit against a lode with 20 tons remaining (positive, per \"Already-Depleted Lode Rejected At Commit\") = %v, want accepted — the lode's tonnage is enforced at resolve, not at commit", err)
	}
	committedThird, err := stack.actionSvc.Get(ctx, a3.Id)
	if err != nil {
		t.Fatalf("reading the third commit's own action: %v", err)
	}
	if committedThird.LedgerKey != ledgerKey {
		t.Fatalf("fleet-3's commit (via a THIRD, different member id feat-belt-0#5) folded ledger key %q, want the identical shared key %q — cross-member visibility is the whole point of this scenario", committedThird.LedgerKey, ledgerKey)
	}
	// The commit-time fold, as seen through this THIRD member id, must
	// already reflect the 80 tons the first two runs took — 20 remaining,
	// never a fresh, independent 100-ton lode of feat-belt-0#5's own.
	if got := stack.foldLedger(t, ledgerKey, stack.clk.now); got != -80 {
		t.Fatalf("ledger fold as seen via the third member id = %v, want -80 (20 remaining) — a member must never re-derive an independent lode", got)
	}

	// Resolve the third run: it clamps to the 20 tons actually left, not
	// the 21 requested ("Resolve Clamps Yield to Reality" — a resolve-time
	// clamp, never a commit-time rejection).
	stack.clk.set(a3.Eta + 1000)
	if _, err := stack.actionSvc.ResolveDue(ctx, "sys-1"); err != nil {
		t.Fatal(err)
	}
	if got := stack.readFleet(t, "fleet-3").Cargo[string(system.ResourceMetals)]; got != 20 {
		t.Errorf("fleet-3's credited cargo = %v, want 20 (clamped from the requested 21 to what the shared lode actually had left)", got)
	}
	if got := stack.foldLedger(t, ledgerKey, stack.clk.now); got != -100 {
		t.Errorf("ledger fold after the clamp = %v, want -100 (the lode fully drained: 40+40+20)", got)
	}
}
