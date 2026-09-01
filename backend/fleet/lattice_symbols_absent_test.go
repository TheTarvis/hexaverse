package fleet

// RED-phase test for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.10 — "Delete fleet/service.go's ErrRingOutOfRange,
// ErrNotOnBoard, validateFleetRing, maxStateRing, msPerTileFor,
// msPerLaneUnitFor, featureOrbit, featureAnchor, haltState, and Scan"
// (design.md Decision 21A).
//
// EXPECTED TO PASS ON FIRST RUN: a source grep of the package's own
// non-test .go files (as of this SDET pass) finds none of these ten
// symbols already — the deletion landed as part of section 3's broader
// rewrite (commit 290ff03, "fly curves instead of hopping cells"), ahead of
// section 4's own checklist catching up to it. This test exists to PIN that
// absence against regression — a later refactor (e.g. porting board-derived
// helpers back in while wiring the jump verb in section 5) could
// reintroduce one of these names, and nothing else in the suite would
// notice, since none of them fail to compile if reintroduced as dead code
// (design.md Decision 21A names the deletion; this is the durable assertion
// of it). Mirrors the source-scan pattern the pin-system-generation-
// determinism change used to pin a retired constant's absence
// (system/cross_target_test.go's TestLatticeIdentityTest_Scenario_
// RetiredConstantAndComparisonAreDeleted).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// lattice-era symbols design.md Decision 21A names for deletion from this
// package's own (non-test) source files.
var deletedLatticeSymbols = []string{
	"ErrRingOutOfRange",
	"ErrNotOnBoard",
	"validateFleetRing",
	"maxStateRing",
	"msPerTileFor",
	"msPerLaneUnitFor",
	"featureOrbit",
	"featureAnchor",
	"haltState",
}

func TestPackage_Scenario_LatticeEraSymbolsAreAbsent(t *testing.T) {
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
		for _, sym := range deletedLatticeSymbols {
			if strings.Contains(src, sym) {
				violations = append(violations, name+": "+sym)
			}
		}
	}
	if len(violations) > 0 {
		t.Errorf("found %d lattice-era symbol reference(s) design.md Decision 21A names for deletion, want 0 "+
			"(migrate-fleet-to-continuous-burns tasks.md 4.10):\n  %s", len(violations), strings.Join(violations, "\n  "))
	}
}

// TestPackage_Scenario_ScanVerbMethodIsAbsent (DELETED —
// replace-observation-with-sightings tasks.md 5.2) used to prove
// service.go declared no `func (s *Service) Scan(` — design.md Decision
// 21A's deletion of the lattice-era radial-echo scan (observation's live
// half). That absence is REMOVED by replace-observation-with-sightings'
// own focused-scan verb, which adds exactly that method signature
// (specs/focused-scan/spec.md "A Focused Sweep Commits On the Sensor
// Channel"). This test's own doc comment already anticipated the day this
// would happen: "the sensor channel itself (ActiveScanId) is retained,
// declared and unwritten, for link 5's focused scan." Deleted rather than
// inverted, per the same test-immutability protocol
// TestHandler_Scenario_ScanEndpointIsGone (routing_deletion_test.go),
// TestJump_Scenario_RejectedUnchartedLane, and
// TestGetInterior_LaneGatesFogFilterToCharted document: an authorized
// change, where a LATER capability's own spec legitimately supersedes an
// EARLIER capability's regression guard.
