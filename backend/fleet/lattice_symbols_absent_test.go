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

// Scan is named separately: design.md 21A also deletes the Scan verb
// itself, which — unlike the other nine identifiers, all unexported and
// therefore uniquely named strings — is a common enough word that a naive
// grep would false-positive on unrelated identifiers (ActiveScanId,
// SlotSensor's own doc comments, "scan" the English word in prose). Scoped
// to the one shape that would actually be a violation: a METHOD named Scan
// on Service, i.e. a source line matching `func (s *Service) Scan(`.
func TestPackage_Scenario_ScanVerbMethodIsAbsent(t *testing.T) {
	raw, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatalf("read service.go: %v", err)
	}
	if strings.Contains(string(raw), "func (s *Service) Scan(") {
		t.Error("service.go still declares a Scan verb method — design.md Decision 21A deletes it with the " +
			"lattice-era radial-echo scan (observation's live half); the sensor channel itself (ActiveScanId) " +
			"is retained, declared and unwritten, for link 5's focused scan (design.md Open Question 4) — that " +
			"field is NOT what this test checks")
	}
}
