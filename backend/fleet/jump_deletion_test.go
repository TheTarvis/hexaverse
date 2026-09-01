package fleet

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 1.2 — "Drop Jump's charted-lane precondition: jump-eligibility
// becomes 'attached to the lane's own gate body, no dwell' — delete
// ErrLaneNotCharted and the charted-lane check from fleet.Service.Jump"
// (design.md Decision 2, blocker 1: the charting circularity) — folded
// together with the constructor-shape half of blocker 3 that task 1.1's own
// text makes load-bearing for this section ("task 6.3 — there is no
// WithGraph to call; the constructor signature itself makes the dependency
// impossible to omit").
//
// This mirrors the established source-grep pattern
// (lattice_symbols_absent_test.go / routing_deletion_test.go): pinning an
// ABSENCE rather than a behavior, specifically because a behavioral test
// exercising Jump's construction seam (WithGraph/WithTierSource) would need
// to keep calling symbols this very task deletes — see the SDET handoff
// report's note on task 6.3's constructor-signature churn. A grep test
// references the deleted names only as string literals, so it never breaks
// to compile no matter how the replacement constructor shape lands; a
// behavioral construction test would.
//
// EXPECTED TO BE RED TODAY: fleet/service.go currently declares all four
// symbols (ErrLaneNotCharted, TierSource, WithTierSource, WithGraph) and
// Jump still evaluates `charted[laneId]` before committing.
//
// SDET note (see handoff report): WithGraph's own deletion is formally task
// 6.3 (section 6, out of this dispatch's scope), but task 1.1 explicitly
// requires it as part of THIS section's own work ("there is no WithGraph to
// call"), so it is pinned here rather than deferred.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// deletedChartingSymbols are the lattice-permission-era identifiers design.md
// Decision 2/22 names for deletion from fleet/service.go.
var deletedChartingSymbols = []string{
	"ErrLaneNotCharted",
	"TierSource",
	"WithTierSource",
	"WithGraph",
}

// Scenario: Jumping from an attached gate commits — the charting-circularity
// half. Pinned here as the durable "must never reappear" regression net; the
// BEHAVIORAL half of this scenario (a real jump succeeding with zero charted
// knowledge) is exercised by the production-router end-to-end test
// (traversability_e2e_test.go in package main), which does not share this
// test's construction-seam churn risk.
func TestPackage_Scenario_ChartingCircularitySymbolsAreAbsent(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/fleet: %v", err)
	}
	var violations []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue // scoped to this package's own PRODUCTION source, never its test files
		}
		raw, err := os.ReadFile(filepath.Join(".", name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		src := string(raw)
		for _, sym := range deletedChartingSymbols {
			if strings.Contains(src, sym) {
				violations = append(violations, name+": "+sym)
			}
		}
	}
	if len(violations) > 0 {
		t.Errorf("found %d charting-circularity-era symbol reference(s) design.md Decision 2/22 name for "+
			"deletion, want 0 (replace-observation-with-sightings tasks.md 1.2, 1.1/6.3):\n  %s",
			len(violations), strings.Join(violations, "\n  "))
	}
}
