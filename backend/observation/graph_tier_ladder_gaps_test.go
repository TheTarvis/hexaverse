package observation

// SDET note (migrate-fleet-to-continuous-burns tasks.md 7.6): these two
// tests fill a coverage gap left by deleting scan_integration_test.go and
// service_test.go (tasks 7.1-7.5 — both files tested ONLY removed
// requirements and referenced the doomed FleetPos/Coverage/MintScan
// symbols). "Monotonic Graph-Tier Knowledge Ladder" is one of observation's
// four SURVIVING requirements (design.md Decision 11); its "never downgrades"
// scenario already has direct coverage in dao_test.go
// (TestUpsertSystemObservation_Monotonic) — verified still present and
// green, not duplicated here. Its other two scenarios — "no stored
// observation is star-visible" and "a higher-tier write upgrades the stored
// tier" — had no standalone test anywhere in the package; both are added
// here, at the same DAO level as their surviving sibling, and neither
// references FleetPos/Coverage/FleetSource or anything else scoped for
// deletion by tasks 7.1-7.5.

import (
	"context"
	"testing"

	"hexaverse/common"

	"github.com/google/uuid"
)

// Scenario: A system with no stored observation is star-visible
//
// SystemTiers's own doc comment states the contract precisely: "Systems
// absent from the map are star-visible (the free baseline); the caller
// defaults them" — a semantic/rank claim, not a claim about the Go zero
// value's literal string spelling (Tier's zero value is "", not the string
// "starVisible" — TierStarVisible is never stored, so nothing ever assigns
// that literal to an absent entry). This test pins the rank equivalence the
// doc comment actually promises: the Go zero value of Tier (what a missing
// SystemTiers map lookup yields) ranks exactly the same as the named
// TierStarVisible constant, neither above nor below. It also pins the DAO
// half of "never stored": a genuinely unqueried system reports no record at
// all (nil, nil), not a synthesized starVisible document.
func TestGraphTierLadder_Scenario_NoStoredObservationIsStarVisible(t *testing.T) {
	var zero Tier // the shape a missing SystemTiers map entry yields
	if !zero.AtLeast(TierStarVisible) || !TierStarVisible.AtLeast(zero) {
		t.Fatalf("Tier zero value %q and TierStarVisible %q do not rank equally — "+
			"a missing observation must read exactly as starVisible", zero, TierStarVisible)
	}
	if zero.AtLeast(TierRumored) {
		t.Errorf("a system with no stored observation must not rank at/above rumored")
	}

	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)
	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)

	got, err := dao.GetSystemObservation(ctx, corp, "sys-never-queried")
	if err != nil {
		t.Fatalf("GetSystemObservation: %v", err)
	}
	if got != nil {
		t.Fatalf("GetSystemObservation for a system with no stored observation = %+v, want nil (no record — "+
			"starVisible is never stored)", got)
	}
}

// Scenario: A higher-tier write upgrades the stored tier
//
// The counterpart to dao_test.go's TestUpsertSystemObservation_Monotonic
// (which pins the "never downgrades" direction): a system already at
// rumored, upgraded by an explored write, ends up explored.
func TestGraphTierLadder_Scenario_HigherTierWriteUpgrades(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	const sys = "sys-1"
	dao := NewDaoWithClient(service)

	if err := dao.UpsertSystemObservation(ctx, corp, SystemObservation{SystemId: sys, Tier: TierRumored, AsOf: 500}); err != nil {
		t.Fatalf("rumored upsert: %v", err)
	}
	if err := dao.UpsertSystemObservation(ctx, corp, SystemObservation{SystemId: sys, Tier: TierExplored, AsOf: 2_000}); err != nil {
		t.Fatalf("explored upsert: %v", err)
	}

	got, err := dao.GetSystemObservation(ctx, corp, sys)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Tier != TierExplored {
		t.Errorf("tier = %q, want explored (a higher-tier write must upgrade the stored tier)", got.Tier)
	}
	if got.AsOf != 2_000 {
		t.Errorf("asOf = %d, want 2000 (the upgrading write's stamp)", got.AsOf)
	}
}
