package observation

// service.go is the fog-of-war domain's surviving half after
// migrate-fleet-to-continuous-burns tasks.md 7.1-7.5 (design.md Decision 11):
// the graph-tier ladder (SystemTiers), the charted-lane set (ChartedLanes),
// and the two arrival reveal writers (RevealArrival, ArrivalWrites).
//
// TestChartedLanes_* (relocated intact from the now-deleted
// charted_lanes_gap_test.go) and TestArrivalWrites_* (relocated intact from
// the now-deleted arrival_test.go) call Service methods directly — no
// assertion changed in the move. TestSystemTiers_* and TestRevealArrival_*
// are new: SystemTiers and RevealArrival had no direct test anywhere in the
// package (graph_tier_ladder_gaps_test.go's two tests, which stay in their
// own file, exercise the DAO layer under SystemTiers's documented contract,
// not the Service method itself).

import (
	"context"
	"testing"

	"hexaverse/common"

	"github.com/google/uuid"
)

// --- SystemTiers -------------------------------------------------------

// Scenario (SDET-added): SystemTiers folds stored observations to a
// systemId→tier map, and a never-queried system is simply absent from that
// map (SystemTiers's own doc comment: "the caller defaults them" — the fold
// itself synthesizes no entry for an absent system).
func TestSystemTiers_Scenario_FoldsStoredObservationsToATierMap(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, nil, nil, nil, common.WorldClock())

	if err := dao.UpsertSystemObservation(ctx, corp, SystemObservation{SystemId: "sys-a", Tier: TierRumored, AsOf: 100}); err != nil {
		t.Fatalf("seed sys-a: %v", err)
	}
	if err := dao.UpsertSystemObservation(ctx, corp, SystemObservation{SystemId: "sys-b", Tier: TierExplored, AsOf: 200}); err != nil {
		t.Fatalf("seed sys-b: %v", err)
	}

	tiers, err := svc.SystemTiers(ctx, corp)
	if err != nil {
		t.Fatalf("SystemTiers: %v", err)
	}
	if tiers["sys-a"] != TierRumored {
		t.Errorf("sys-a tier = %q, want rumored", tiers["sys-a"])
	}
	if tiers["sys-b"] != TierExplored {
		t.Errorf("sys-b tier = %q, want explored", tiers["sys-b"])
	}
	if _, present := tiers["sys-never-queried"]; present {
		t.Errorf("SystemTiers minted an entry for a never-queried system; the fold must leave it absent, "+
			"not synthesize starVisible — got %v", tiers)
	}
	if len(tiers) != 2 {
		t.Errorf("tiers = %v, want exactly the 2 stored observations", tiers)
	}
}

// --- RevealArrival -------------------------------------------------------

// Scenario (SDET-added): RevealArrival writes the destination as Explored
// through the DAO — the non-action path (#0009 spawn) uses; waking IS
// arriving.
func TestRevealArrival_Scenario_WritesDestinationExplored(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, nil, nil, nil, common.WorldClock())

	if err := svc.RevealArrival(ctx, corp, "sys-home", 1000); err != nil {
		t.Fatalf("RevealArrival: %v", err)
	}

	got, err := dao.GetSystemObservation(ctx, corp, "sys-home")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got == nil {
		t.Fatalf("no observation stored for sys-home after RevealArrival")
	}
	if got.Tier != TierExplored {
		t.Errorf("tier = %q, want explored", got.Tier)
	}
	if got.AsOf != 1000 {
		t.Errorf("asOf = %d, want 1000 (the arrival stamp)", got.AsOf)
	}
}

// Scenario (SDET-added): RevealArrival is idempotent — re-running on an
// already-explored system never lowers it (safe on an idempotent re-spawn,
// per the method's own doc comment).
func TestRevealArrival_Scenario_IdempotentOnRepeat(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, nil, nil, nil, common.WorldClock())

	if err := svc.RevealArrival(ctx, corp, "sys-home", 1000); err != nil {
		t.Fatalf("first RevealArrival: %v", err)
	}
	if err := svc.RevealArrival(ctx, corp, "sys-home", 1000); err != nil {
		t.Fatalf("second RevealArrival: %v", err)
	}

	got, err := dao.GetSystemObservation(ctx, corp, "sys-home")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Tier != TierExplored {
		t.Errorf("tier = %q, want explored to survive the repeat", got.Tier)
	}
}

// --- ChartedLanes --------------------------------------------------------
//
// "Charted-Lane Set Projection" is one of observation's four SURVIVING
// requirements (design.md Decision 11 — it "carries no lattice geometry" and
// "is still read by jump validation and by the galaxy view"). Relocated
// intact from charted_lanes_gap_test.go.

// Scenario: An explored system with no charted lane grants none
//
// A corporation can be `explored` at a system (e.g. a dev-seeded starting
// position, or — after this change — a spawn/travel arrival reveal) without
// ever having scanned or traveled a specific lane. The charted-lane set is
// its own independent record (LaneObservation, presence-of-doc IS charted) —
// there is no derived-from-tier fallback.
func TestChartedLanes_Scenario_ExploredSystemWithNoChartedLaneGrantsNone(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	const sys = "sys-home"
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, nil, nil, nil, common.WorldClock())

	// The corp is Explored at sys-home (a dev-seeded starting position) but has
	// never scanned or traveled any of its lanes.
	if err := dao.UpsertSystemObservation(ctx, corp, SystemObservation{SystemId: sys, Tier: TierExplored, AsOf: 100}); err != nil {
		t.Fatalf("seed explored tier: %v", err)
	}
	// A DIFFERENT corp charted a lane incident to sys-home — proves the
	// projection is per-corp, not derived from the lane's own existence.
	other := "corp-" + uuid.NewString()
	if err := dao.UpsertLane(ctx, other, LaneObservation{LaneId: "lane-home-a", Via: ViaScanned, AsOf: 100}); err != nil {
		t.Fatalf("seed other corp's charted lane: %v", err)
	}

	charted, err := svc.ChartedLanes(ctx, corp)
	if err != nil {
		t.Fatalf("ChartedLanes: %v", err)
	}
	if len(charted) != 0 {
		t.Errorf("charted-lane set = %v, want empty — being Explored grants no lane by itself, "+
			"and another corp's charted lane must never leak in", charted)
	}
}

// Scenario boundary (SDET-added): charting is per-corp and reflects exactly
// the corp's own upserted lane records — the presence-of-doc rule stated
// directly, complementing the negative case above with a positive one.
func TestChartedLanes_Scenario_ChartedLaneAppearsInTheSet(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, nil, nil, nil, common.WorldClock())

	if err := dao.UpsertLane(ctx, corp, LaneObservation{LaneId: "lane-a", Via: ViaTraveled, AsOf: 200}); err != nil {
		t.Fatalf("seed charted lane: %v", err)
	}

	charted, err := svc.ChartedLanes(ctx, corp)
	if err != nil {
		t.Fatalf("ChartedLanes: %v", err)
	}
	if !charted["lane-a"] {
		t.Errorf("charted-lane set = %v, want lane-a present", charted)
	}
	if len(charted) != 1 {
		t.Errorf("charted-lane set = %v, want exactly 1 entry", charted)
	}
}

// --- ArrivalWrites --------------------------------------------------------
//
// Relocated intact from arrival_test.go.

// ArrivalWrites reveals the destination as Explored and charts the lanes the
// trip actually crossed `via: traveled` — and nothing else (#0006 Decision
// #17, 2026-07-14): no onward-lane rumor, no tier for anything but the
// destination. Explored is the top tier, so the blind MergeAll never lowers it.
func TestArrivalWrites_ExploredDestAndTraveledLanes(t *testing.T) {
	svc := &Service{}
	writes := svc.ArrivalWrites("corp", "dest", []string{"lane-1", "lane-2"}, 5000)

	// Destination write is always present and Explored.
	if len(writes) != 3 {
		t.Fatalf("expected the destination write + 2 lane writes, got %d", len(writes))
	}
	if got := writes[0].Data["tier"]; got != string(TierExplored) {
		t.Fatalf("destination tier = %v, want explored", got)
	}
	if writes[0].Path[len(writes[0].Path)-1] != "dest" {
		t.Fatalf("first write should target the destination, got %v", writes[0].Path)
	}

	// The crossed lanes are charted `via: traveled`; no other tier writes exist.
	charted := map[string]string{}
	for _, w := range writes[1:] {
		if w.Path[len(w.Path)-2] != lanesCollection {
			t.Fatalf("arrival minted a non-lane write beyond the destination: %v (onward rumor is scanning's job)", w.Path)
		}
		charted[w.Path[len(w.Path)-1]] = w.Data["via"].(string)
	}
	if charted["lane-1"] != ViaTraveled || charted["lane-2"] != ViaTraveled {
		t.Fatalf("crossed lanes should be charted via traveled, got %v", charted)
	}
}
