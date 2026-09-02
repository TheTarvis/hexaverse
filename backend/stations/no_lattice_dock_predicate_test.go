package stations

// trading-station, "Docking to the station involves no lattice predicate"
// (re-express-economy-positions tasks.md 3.5). NO CODE CHANGE EXPECTED.
//
// This package itself implements NO co-location or dock predicate of its
// own at all — dock resolution for the station happens entirely in
// mine/market, both of which read only fleet.Fleet.DockedTo() (mine's own
// direct call, mine/service.go) or the thin
// fleet.CargoDebitPlan.DockedAt() wrapper over that exact same stored
// AttachedTo relationship (market's call, inside its transactional
// cargo-debit plan, fleet/cargo_tx.go). Grepping stations/*.go for the
// vocabulary a board-cell/lattice or kinematic-mode dock check would use
// (AttachedTo, DockedTo, ModeDocked) finds nothing, because this package
// never asks "is a fleet docked to me" at all — the station is a passive
// body other packages resolve attachment against, not an active
// participant in the check. mine/service_test.go's ErrNotDocked coverage
// and market/service_test.go's ErrNotDockedAtStation coverage are the
// behavioral proof that DockedTo()/DockedAt() are the actual, sole
// mechanism; this test is the structural proof that stations carries none
// of its own for a future dock check to accidentally duplicate or diverge
// from.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPackage_Scenario_NoDockPredicateOfItsOwn(t *testing.T) {
	forbidden := []string{"AttachedTo", "DockedTo", "ModeDocked"}

	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/stations: %v", err)
	}
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
		for _, sym := range forbidden {
			if strings.Contains(src, sym) {
				t.Errorf("%s references %q — stations must compute no co-location/dock predicate of its own; docking resolves entirely through fleet's own AttachedTo/DockedTo, called from mine/market, never from here", name, sym)
			}
		}
	}
}
