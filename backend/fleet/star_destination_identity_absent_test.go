package fleet

// RED-phase structural guard for openspec change
// serve-orbital-elements-and-burn-preview, tasks.md 3.6 — fleet-movement's
// "A preview against the star is rejected by the curve's clearance guard, not
// by a destination check": "no destination-identity comparison against the
// star's body id takes part in the rejection".
//
// WHY A SOURCE SCAN AND NOT ONLY A BEHAVIOURAL TEST. The behavioural half is
// covered end to end (backend/burn_preview_e2e_test.go asserts a NON-star point
// inside the star's clearance radius is rejected identically to the star's own
// body id — an outcome a destination-identity check cannot produce). This file
// covers the one thing that test cannot see: the sentinel the deleted identity
// check used coming BACK, on the new preview path, as a short-circuit "for
// latency" (design.md Decision 3 records and rejects exactly that argument).
// star_destination_test.go's own doc comment says it "deliberately does NOT
// reference fleet.ErrCoreDestination", which leaves nothing in the suite
// asserting the name stays gone.
//
// EXPECTED TO PASS ON FIRST RUN, and said so plainly rather than left to look
// like a red test that isn't: ErrCoreDestination is already absent from this
// package. This is a durable pin against its reintroduction alongside the
// preview handler, in the same shape as this package's own
// this package's other absent-symbol guards.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPackage_Scenario_NoStarDestinationIdentitySentinelIsReintroduced(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/fleet: %v", err)
	}
	scanned := 0
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue // this package's own PRODUCTION source only
		}
		raw, err := os.ReadFile(filepath.Join(".", name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		scanned++
		if strings.Contains(string(raw), "ErrCoreDestination") {
			t.Errorf("%s reintroduces ErrCoreDestination. design.md Decision 14 of "+
				"migrate-fleet-to-continuous-burns deleted that sentinel and its destination-identity "+
				"special case; design.md Decision 3 of serve-orbital-elements-and-burn-preview rejects "+
				"reintroducing it on the preview path as a latency short-circuit, because \"the clearance "+
				"guard also rejects targets that are not the star but sit inside its clearance radius — a "+
				"case an identity check misses entirely\"", name)
		}
	}
	if scanned == 0 {
		t.Fatal("scanned zero production source files — the guard above never ran")
	}
}
