package charts

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 2.2/2.3/2.5 — the DAO layer of the rehomed graph-tier ladder and
// charted-lane set, stored under the renamed collections
// corporations/{cid}/charts/* and corporations/{cid}/chartedLanes/* (task
// 2.5's rename, design.md Decision 1 — "no data carried", so the new
// collection names are load-bearing here, not cosmetic).
//
// TestUpsertSystemKnowledge_Monotonic and
// TestGraphKnowledgeLadder_Scenario_HigherTierWriteUpgrades are PORTS of
// observation/dao_test.go's TestUpsertSystemObservation_Monotonic and
// observation/graph_tier_ladder_gaps_test.go's
// TestGraphTierLadder_Scenario_HigherTierWriteUpgrades — same assertions,
// new package/collection names. TestSubcollectionPaths_* is NEW: task 2.11
// ("Add charts and chartedLanes to CleanupFirestoreTestData()") is the sixth
// instance of the hand-maintained-list species (design.md Decision 1); rather
// than pinning today's two names as a hardcoded expectation (itself a sixth
// hand-maintained list, on the test side this time), SubcollectionPaths is
// this package's OWN single source of truth for its Firestore collection
// names — mirroring galaxy.SubcollectionPaths (galaxy/dao.go) — and the
// structural test cross-checks every "*Collection" constant declared in
// dao.go against SubcollectionPaths's own source text, so a future collection
// added to the DAO but forgotten in cleanup fails a test instead of leaking
// silently between emulator runs.
//
// EXPECTED TO FAIL ON FIRST RUN: compile error (backend/charts does not
// exist).

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"hexaverse/common"

	"github.com/google/uuid"
)

// --- ported: the monotonic ladder at the DAO layer --------------------------

// Scenario: A lower-tier write never downgrades a higher stored tier
//
// Ported from observation/dao_test.go's TestUpsertSystemObservation_Monotonic.
func TestUpsertSystemKnowledge_Scenario_LowerTierWriteNeverDowngrades(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	const sys = "sys-1"
	dao := NewDaoWithClient(service)

	if err := dao.UpsertSystemKnowledge(ctx, corp, SystemKnowledge{SystemId: sys, Tier: TierSurveyed, AsOf: 2_000}); err != nil {
		t.Fatalf("surveyed upsert: %v", err)
	}
	// A stale, lower-tier write must not lower the stored tier.
	if err := dao.UpsertSystemKnowledge(ctx, corp, SystemKnowledge{SystemId: sys, Tier: TierRumored, AsOf: 500}); err != nil {
		t.Fatalf("stale upsert: %v", err)
	}
	got, err := dao.GetSystemKnowledge(ctx, corp, sys)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Tier != TierSurveyed {
		t.Errorf("tier lowered to %q; monotonicity broken (want surveyed)", got.Tier)
	}
	if got.AsOf != 2_000 {
		t.Errorf("asOf regressed to %d, want 2000 (the fresher survey)", got.AsOf)
	}
}

// Scenario: A higher-tier write upgrades the stored tier
//
// Ported from observation/graph_tier_ladder_gaps_test.go's
// TestGraphTierLadder_Scenario_HigherTierWriteUpgrades.
func TestGraphKnowledgeLadder_Scenario_HigherTierWriteUpgrades(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)

	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	const sys = "sys-1"
	dao := NewDaoWithClient(service)

	if err := dao.UpsertSystemKnowledge(ctx, corp, SystemKnowledge{SystemId: sys, Tier: TierRumored, AsOf: 500}); err != nil {
		t.Fatalf("rumored upsert: %v", err)
	}
	if err := dao.UpsertSystemKnowledge(ctx, corp, SystemKnowledge{SystemId: sys, Tier: TierExplored, AsOf: 2_000}); err != nil {
		t.Fatalf("explored upsert: %v", err)
	}

	got, err := dao.GetSystemKnowledge(ctx, corp, sys)
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

// Scenario (SDET-added, ports observation's "never stored" half): a
// genuinely unqueried system reports no record at all, not a synthesized
// starVisible document — the DAO half of "starVisible is never stored".
func TestGetSystemKnowledge_Scenario_UnqueriedSystemHasNoStoredRecord(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)
	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)

	got, err := dao.GetSystemKnowledge(ctx, corp, "sys-never-queried")
	if err != nil {
		t.Fatalf("GetSystemKnowledge: %v", err)
	}
	if got != nil {
		t.Fatalf("GetSystemKnowledge for a system with no stored knowledge = %+v, want nil", got)
	}
}

// --- ported: charted-lane record round trip ----------------------------

// Scenario (SDET-added boundary, ports observation/dao_test.go's charted-lane
// coverage at the round-trip level): an upserted lane is listed back keyed by
// laneId, idempotent overwrite on repeat.
func TestChartedLane_RoundTrip(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection)
	ctx := context.Background()
	corp := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(service)

	if err := dao.UpsertChartedLane(ctx, corp, ChartedLane{LaneId: "lane-a", Via: ViaTraveled, AsOf: 100}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	// Repeat pass — an idempotent overwrite, not a duplicate.
	if err := dao.UpsertChartedLane(ctx, corp, ChartedLane{LaneId: "lane-a", Via: ViaGate, AsOf: 300}); err != nil {
		t.Fatalf("re-upsert: %v", err)
	}

	lanes, err := dao.ListChartedLanes(ctx, corp)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(lanes) != 1 {
		t.Fatalf("listed %d charted lanes, want 1 (keyed by laneId)", len(lanes))
	}
	if lanes[0].Via != ViaGate || lanes[0].AsOf != 300 {
		t.Errorf("round-trip lost the overwrite: got %+v", lanes[0])
	}
}

// --- task 2.11: the collection-name cleanup registry, generalized ----------

// TestSubcollectionPaths_NamesBothRenamedCollections pins today's concrete
// requirement: a corp's charts and chartedLanes subcollections are both
// nameable for test cleanup, at the RENAMED paths (task 2.5) — not the old
// observations/lanes ones.
func TestSubcollectionPaths_NamesBothRenamedCollections(t *testing.T) {
	corp := "corp-example"
	paths := SubcollectionPaths(corp)

	wantCharts := corp + "/" + "charts"
	wantLanes := corp + "/" + "chartedLanes"
	var haveCharts, haveLanes bool
	for _, p := range paths {
		if strings.Contains(p, wantCharts) {
			haveCharts = true
		}
		if strings.Contains(p, wantLanes) {
			haveLanes = true
		}
		if strings.Contains(p, "/observations") || strings.Contains(p, "/lanes") {
			t.Errorf("SubcollectionPaths(%q) = %v contains an old observation-era collection name; "+
				"task 2.5's rename carries no data forward", corp, paths)
		}
	}
	if !haveCharts {
		t.Errorf("SubcollectionPaths(%q) = %v, want an entry naming the corp's %q subcollection", corp, paths, wantCharts)
	}
	if !haveLanes {
		t.Errorf("SubcollectionPaths(%q) = %v, want an entry naming the corp's %q subcollection", corp, paths, wantLanes)
	}
}

// TestSubcollectionPaths_CoversEveryDeclaredCollectionConstant is the
// GENERALIZED regression net task 2.11 asks for: it reads dao.go's own
// source and asserts every "xxxCollection = \"...\"" constant this package
// declares is referenced by name inside SubcollectionPaths's function body —
// so the NEXT collection this package's DAO grows (not just today's two)
// fails this test the moment its cleanup wiring is forgotten, rather than
// leaking silently between emulator test runs the way
// observation/dao_test.go's own cleanup calls (which never named
// observationsCollection or lanesCollection at all) did.
func TestSubcollectionPaths_CoversEveryDeclaredCollectionConstant(t *testing.T) {
	src := readDaoSource(t)

	declared := declaredCollectionConstants(t, src)
	if len(declared) == 0 {
		t.Fatalf("found no %q-suffixed collection constants in dao.go — either the scan is broken or the DAO declares its collection names some other way; update this test's assumption if so", "Collection")
	}

	fnStart := strings.Index(src, "func SubcollectionPaths")
	if fnStart < 0 {
		t.Fatalf("dao.go does not declare SubcollectionPaths — task 2.11 wants a single source of truth for this package's cleanup collection names, mirroring galaxy.SubcollectionPaths")
	}
	fnBody := src[fnStart:]

	for constName, value := range declared {
		if constName == "corporationsCollection" {
			continue // the parent collection, not one of THIS package's own subcollections
		}
		if !strings.Contains(fnBody, constName) {
			t.Errorf("dao.go declares collection constant %s = %q but SubcollectionPaths never references it by name — "+
				"a forgotten cleanup entry for this collection would leak emulator state silently between test runs",
				constName, value)
		}
	}
}

func readDaoSource(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(".", "dao.go"))
	if err != nil {
		t.Fatalf("read charts/dao.go: %v", err)
	}
	return string(raw)
}

// declaredCollectionConstants finds every `xxxCollection = "value"` constant
// declaration in the given source, by simple line scanning — deliberately not
// a full AST parse, since the property under test is purely textual
// (SubcollectionPaths must MENTION the constant's identifier).
func declaredCollectionConstants(t *testing.T, src string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, line := range strings.Split(src, "\n") {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, "Collection") || !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		name := strings.TrimSpace(parts[0])
		// Only bare identifiers ending in "Collection" — skip comments, struct
		// field references, etc.
		if !strings.HasSuffix(name, "Collection") || strings.ContainsAny(name, " \t.(){}") {
			continue
		}
		val := strings.TrimSpace(parts[1])
		if unquoted, err := strconv.Unquote(strings.TrimSuffix(strings.TrimSpace(val), ",")); err == nil {
			out[name] = unquoted
		}
	}
	return out
}
