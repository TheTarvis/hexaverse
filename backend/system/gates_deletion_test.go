package system

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 1.3 — "Delete system/gates.go's chartedGates, system/handler.go's
// fog-seam SystemTiers tier lookup and its call site — every lane-gate body
// ships unfiltered to every authenticated requester, closing blocker 2."
// (design.md Decision 5; system-interior: "Bodies Are Public; Ships Are
// Disclosed"; system-body-table: "The Body Table Is an Unfiltered Internal
// Seam, Never a Response".)
//
// Mirrors fleet's own established source-grep pattern
// (fleet's own absent-symbol guards / routing_deletion_test.go / this
// package's own grep_helpers_test.go convention): pins an ABSENCE, immune to
// however the eventual seam gets reshaped, as the durable regression net
// alongside the BEHAVIORAL test in handler_test.go
// (TestGetInterior_Scenario_NoLaneGateOmittedForLackOfCharting) that this
// same task requires.
//
// EXPECTED TO BE RED TODAY: gates.go still declares chartedGates, and
// handler.go still calls h.fog.SystemTiers(...) + chartedGates(...) at
// GetInterior's one call site.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var deletedGateFilterSymbols = []string{
	"chartedGates",
	"SystemTiers",
}

func TestPackage_Scenario_ChartedGateFilterSymbolsAreAbsent(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/system: %v", err)
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
		for _, sym := range deletedGateFilterSymbols {
			if strings.Contains(src, sym) {
				violations = append(violations, name+": "+sym)
			}
		}
	}
	if len(violations) > 0 {
		t.Errorf("found %d charted-gate-filter-era symbol reference(s) design.md Decision 5 names for "+
			"deletion, want 0 (replace-observation-with-sightings tasks.md 1.3):\n  %s",
			len(violations), strings.Join(violations, "\n  "))
	}
}
