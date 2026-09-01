package charts

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 2.2-2.4 (specs/galaxy-knowledge/spec.md).
//
// TestSystemTiers_*, TestRevealArrival_*, TestChartedLanes_*, and
// TestArrivalWrites_* are PORTS of observation/service_test.go's tests of
// the same name (same assertions, charts.* names and the renamed
// collections) — this package's four surviving requirements carry no
// behavioral change from the rename itself. TestGateAttachmentWrite_* is
// NEW: task 2.4's gate-attachment writer has no predecessor anywhere in
// backend/observation.
//
// EXPECTED TO FAIL ON FIRST RUN: compile error (backend/charts does not
// exist). Once charts exists but GateAttachmentWrite does not, the ported
// tests would compile and pass (this package's four surviving requirements
// need no new logic) while TestGateAttachmentWrite_* still fails to compile
// or, if the symbol exists with different behavior, fails its assertions —
// that split-state is exactly what "mostly a rename" predicts and is called
// out explicitly in the SDET handoff report.

import (
	"context"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"

	"github.com/google/uuid"
)

func testClock() common.WorldTime { return common.WorldClock() }

// --- ported: SystemTiers -----------------------------------------------

// Scenario (ports observation/service_test.go's
// TestSystemTiers_Scenario_FoldsStoredObservationsToATierMap): SystemTiers
// folds stored knowledge to a systemId→tier map, and a never-queried system
// is simply absent from that map.
func TestSystemTiers_Scenario_FoldsStoredKnowledgeToATierMap(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, testClock())

	if err := dao.UpsertSystemKnowledge(ctx, corp, SystemKnowledge{SystemId: "sys-a", Tier: TierRumored, AsOf: 100}); err != nil {
		t.Fatalf("seed sys-a: %v", err)
	}
	if err := dao.UpsertSystemKnowledge(ctx, corp, SystemKnowledge{SystemId: "sys-b", Tier: TierExplored, AsOf: 200}); err != nil {
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
		t.Errorf("SystemTiers minted an entry for a never-queried system; want it absent, got %v", tiers)
	}
	if len(tiers) != 2 {
		t.Errorf("tiers = %v, want exactly the 2 stored knowledge records", tiers)
	}
}

// --- ported: RevealArrival / Spawn Arrival Knowledge Write --------------

// Scenario: Spawn arrival explores home with no lanes charted
//
// Ports observation/service_test.go's
// TestRevealArrival_Scenario_WritesDestinationExplored, extended to also
// assert the charted-lane set (the spec's own scenario names both: "the home
// system's tier becomes explored and no lane is charted").
func TestRevealArrival_Scenario_SpawnArrivalExploresHomeWithNoLanesCharted(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, testClock())

	if err := svc.RevealArrival(ctx, corp, "sys-home", 1000); err != nil {
		t.Fatalf("RevealArrival: %v", err)
	}

	got, err := dao.GetSystemKnowledge(ctx, corp, "sys-home")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got == nil {
		t.Fatalf("no knowledge stored for sys-home after RevealArrival")
	}
	if got.Tier != TierExplored {
		t.Errorf("tier = %q, want explored", got.Tier)
	}
	if got.AsOf != 1000 {
		t.Errorf("asOf = %d, want 1000 (the arrival stamp)", got.AsOf)
	}

	charted, err := svc.ChartedLanes(ctx, corp)
	if err != nil {
		t.Fatalf("ChartedLanes: %v", err)
	}
	if len(charted) != 0 {
		t.Errorf("charted-lane set after spawn arrival = %v, want empty — spawn charts no lanes", charted)
	}
}

// Scenario: Repeating the spawn arrival write is a no-op
//
// Ports observation/service_test.go's
// TestRevealArrival_Scenario_IdempotentOnRepeat, extended per the spec's own
// wording ("the home system's tier remains explored AND the charted-lane set
// is unchanged") to also assert the lane set.
func TestRevealArrival_Scenario_RepeatingTheSpawnArrivalWriteIsANoOp(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, testClock())

	if err := svc.RevealArrival(ctx, corp, "sys-home", 1000); err != nil {
		t.Fatalf("first RevealArrival: %v", err)
	}
	if err := svc.RevealArrival(ctx, corp, "sys-home", 1000); err != nil {
		t.Fatalf("second RevealArrival: %v", err)
	}

	got, err := dao.GetSystemKnowledge(ctx, corp, "sys-home")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Tier != TierExplored {
		t.Errorf("tier = %q, want explored to survive the repeat", got.Tier)
	}

	charted, err := svc.ChartedLanes(ctx, corp)
	if err != nil {
		t.Fatalf("ChartedLanes: %v", err)
	}
	if len(charted) != 0 {
		t.Errorf("charted-lane set after repeating spawn arrival = %v, want still empty", charted)
	}
}

// --- ported: ChartedLanes (Charted-Lane Set Projection) -----------------

// Scenario: An explored system with no charted lane grants none
//
// Ports observation/service_test.go's
// TestChartedLanes_Scenario_ExploredSystemWithNoChartedLaneGrantsNone.
func TestChartedLanes_Scenario_ExploredSystemWithNoChartedLaneGrantsNone(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	const sys = "sys-home"
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, testClock())

	if err := dao.UpsertSystemKnowledge(ctx, corp, SystemKnowledge{SystemId: sys, Tier: TierExplored, AsOf: 100}); err != nil {
		t.Fatalf("seed explored tier: %v", err)
	}
	other := "corp-" + uuid.NewString()
	if err := dao.UpsertChartedLane(ctx, other, ChartedLane{LaneId: "lane-home-a", Via: ViaTraveled, AsOf: 100}); err != nil {
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

// Scenario (SDET-added boundary, ports observation's positive counterpart):
// a corp's own charted lane appears in its set.
func TestChartedLanes_Scenario_ChartedLaneAppearsInTheSet(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)
	svc := NewServiceWith(dao, testClock())

	if err := dao.UpsertChartedLane(ctx, corp, ChartedLane{LaneId: "lane-a", Via: ViaTraveled, AsOf: 200}); err != nil {
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

// --- ported: ArrivalWrites (Travel Arrival Knowledge Write) --------------

// Scenario: Arrival explores the destination and charts the crossed lane
//
// Ports observation/service_test.go's
// TestArrivalWrites_ExploredDestAndTraveledLanes.
func TestArrivalWrites_Scenario_ExploresDestinationAndChartsCrossedLanes(t *testing.T) {
	svc := &Service{}
	writes := svc.ArrivalWrites("corp", "dest", []string{"lane-1", "lane-2"}, 5000)

	if len(writes) != 3 {
		t.Fatalf("expected the destination write + 2 lane writes, got %d", len(writes))
	}
	if got := writes[0].Data["tier"]; got != string(TierExplored) {
		t.Fatalf("destination tier = %v, want explored", got)
	}
	if writes[0].Path[len(writes[0].Path)-1] != "dest" {
		t.Fatalf("first write should target the destination, got %v", writes[0].Path)
	}

	chartedVia := map[string]string{}
	for _, w := range writes[1:] {
		if w.Path[len(w.Path)-2] != chartedLanesCollection {
			t.Fatalf("arrival minted a non-lane write beyond the destination: %v (onward rumor is not this write's job)", w.Path)
		}
		chartedVia[w.Path[len(w.Path)-1]] = w.Data["via"].(string)
	}
	if chartedVia["lane-1"] != ViaTraveled || chartedVia["lane-2"] != ViaTraveled {
		t.Fatalf("crossed lanes should be charted via traveled, got %v", chartedVia)
	}
}

// --- NEW: Gate-Attachment Knowledge Write (task 2.4) ---------------------
//
// No predecessor in backend/observation — this writer did not exist before
// link 5 (design.md Decision 3, item 2). The signature assumed here —
// GateAttachmentWrite(cid, fromSystemId, hostBodyId string, at
// common.WorldMillis) []action.DocWrite — is the SDET's reading of design.md
// Decision 3's description ("a gate id is 'gate-'+destSystemId ... the lane
// id is derivable purely — no read"); tasks.md pins the BEHAVIOR (chart
// via:gate on gate attachment, chart nothing on non-gate attachment,
// destination system's own tier untouched, no destination read) but not this
// exact function shape, so a developer who finds a materially better shape
// should dispute it rather than reshape production code around this literal
// signature. The gate id's "gate-" prefix convention mirrors
// system.gateId's own (system/bodies.go, unexported) — fleet's own tests
// already hardcode this same literal for the identical reason (system does
// not export it): see fleet/jump_verb_test.go's comment.

// Scenario: Docking at a gate charts its lane
func TestGateAttachmentWrite_Scenario_DockingAtAGateChartsItsLane(t *testing.T) {
	fromSys := galaxy.SystemIdFor(galaxy.Cell{X: 1, Y: 1})
	destSys := galaxy.SystemIdFor(galaxy.Cell{X: 1, Y: 2})
	hostBodyId := "gate-" + destSys

	writes := GateAttachmentWrite("corp-1", fromSys, hostBodyId, 4_000)

	if len(writes) != 1 {
		t.Fatalf("GateAttachmentWrite for a gate body = %d writes, want exactly 1 (chart the lane, nothing else)", len(writes))
	}
	w := writes[0]
	if w.Path[len(w.Path)-2] != chartedLanesCollection {
		t.Fatalf("write path = %v, want it to target the chartedLanes collection", w.Path)
	}
	wantLaneId := galaxy.LaneIdBetween(fromSys, destSys)
	if w.Path[len(w.Path)-1] != wantLaneId {
		t.Fatalf("charted lane id = %q, want %q (galaxy.LaneIdBetween(from, dest), computed with no destination read)",
			w.Path[len(w.Path)-1], wantLaneId)
	}
	if got := w.Data["via"]; got != ViaGate {
		t.Fatalf("via = %v, want %q", got, ViaGate)
	}

	// "the destination system's own knowledge tier is unaffected by this
	// write" — no write targets the charts (system-tier) collection at all.
	for _, w := range writes {
		if w.Path[len(w.Path)-2] == chartsCollection {
			t.Fatalf("GateAttachmentWrite wrote a system-tier record %v; docking at a gate must not touch the "+
				"destination's own knowledge tier (that is jump arrival's job, not attachment's)", w.Path)
		}
	}
}

// Scenario: Attaching to a non-gate body charts nothing
func TestGateAttachmentWrite_Scenario_AttachingToANonGateBodyChartsNothing(t *testing.T) {
	fromSys := galaxy.SystemIdFor(galaxy.Cell{X: 1, Y: 1})

	writes := GateAttachmentWrite("corp-1", fromSys, "feat-planet-3", 4_000)
	if len(writes) != 0 {
		t.Fatalf("GateAttachmentWrite for a non-gate body = %d writes, want 0, got %v", len(writes), writes)
	}
}

// Scenario boundary (SDET-added): GateAttachmentWrite computes the lane id
// purely from the two system ids — the same lane is charted whether it is
// derived here (attachment) or via ArrivalWrites (travel), since both must
// converge on galaxy.LaneIdBetween's single document id (task 2.1's own
// stated purpose — "so a gate-attachment write can derive its lane id
// without a lookup").
func TestGateAttachmentWrite_Scenario_LaneIdMatchesArrivalWritesForTheSameCrossing(t *testing.T) {
	fromSys := galaxy.SystemIdFor(galaxy.Cell{X: 2, Y: 5})
	destSys := galaxy.SystemIdFor(galaxy.Cell{X: 2, Y: 6})

	attach := GateAttachmentWrite("corp-1", fromSys, "gate-"+destSys, 1_000)
	if len(attach) != 1 {
		t.Fatalf("expected 1 write, got %d", len(attach))
	}
	attachLaneId := attach[0].Path[len(attach[0].Path)-1]

	svc := &Service{}
	arrival := svc.ArrivalWrites("corp-1", destSys, []string{galaxy.LaneIdBetween(fromSys, destSys)}, 1_000)
	// arrival[0] is the destination-tier write; arrival[1] is the lane write.
	if len(arrival) != 2 {
		t.Fatalf("expected 2 writes, got %d", len(arrival))
	}
	arrivalLaneId := arrival[1].Path[len(arrival[1].Path)-1]

	if attachLaneId != arrivalLaneId {
		t.Fatalf("gate-attachment lane id %q and travel-arrival lane id %q diverge for the same crossing (%s <-> %s)",
			attachLaneId, arrivalLaneId, fromSys, destSys)
	}
}
