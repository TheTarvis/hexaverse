package observation

// RED-phase test for openspec change migrate-fleet-to-continuous-burns,
// tasks.md section 7 ("`observation` live-half removal"), tasks 7.1-7.5
// (design.md Decision 11): the five REMOVED requirements from
// specs/observation-fog-and-scan/spec.md — Ambient Sensor Coverage From Own
// Units, Running Scan Echo Disc, Scan Resolution Mints the Reveal,
// Path-Swept Ambient Reveal on Move Resolution, Fleet Audience Visibility —
// and the lattice-hop coverage/echo/scan-mint machinery that implemented
// them.
//
// EXPECTED TO FAIL ON FIRST RUN (behavioral gap, not a compile error): as of
// this SDET pass none of these symbols have been deleted yet — that is
// exactly section 7.1-7.5's outstanding work. Mirrors the source-scan
// pattern backend/fleet/lattice_symbols_absent_test.go established for the
// same migration's fleet-side lattice deletions.
//
// Scope discipline: this list is deliberately the symbols 7.1-7.5's own
// task text names or that exist ONLY to serve them (Coverage and its
// constructors/methods, which have no caller left once the ambient bubble,
// echo disc, and audience-visibility union that built them are all gone).
// It deliberately does NOT include SensorParams/ScanParams, FeatureObservation,
// FeatureMemory, RememberedFeatures, or the Band/BandVisible/BandRemembered
// projection types — none of those are named by 7.1-7.5's task text, the
// sensor channel itself is explicitly retained "unwritten, for link 5's
// focused scan" (design.md Decision 11), and RememberedFeatures still has a
// caller (system's now-interim handler, until 7.7 lands) as of this pass.
// Left alone; see the SDET report for this ambiguity rather than guessing
// link 5's boundary.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// lattice-live-half symbols design.md Decision 11 / tasks.md 7.1-7.5 name
// for deletion from this package's own (non-test) source files. Grouped by
// which REMOVED requirement each belongs to, per the task's own parenthetical.
var (
	// 7.1 — Ambient Sensor Coverage From Own Units: the union-of-lattice-hop-
	// discs coverage computation and FleetSource/FleetPos.
	ambientCoverageSymbols = []string{
		"FleetSource",
		"FleetPos",
	}
	// 7.2 — Running Scan Echo Disc: the growing echo-front measured in
	// lattice hops from a fleet's board-cell emission point.
	echoDiscSymbols = []string{
		"echoDisc",
	}
	// 7.3 — Scan Resolution Mints the Reveal: the scan action's resolver and
	// its reveal mint.
	scanResolutionSymbols = []string{
		"ScanResolver",
		"MintScan",
		"buildScan",
		"revealWrites",
		"scanActor",
		"scanReveal",
		"const scanType",
	}
	// 7.4 — Path-Swept Ambient Reveal on Move Resolution: the fold over a
	// burn resolution's swept board.Cell path.
	pathSweptAmbientSymbols = []string{
		"AmbientWrites",
		"NewSweptCoverage",
	}
	// 7.5 — Fleet Audience Visibility: the lattice sensor-coverage union a
	// foreign fleet's visibility was computed from.
	fleetAudienceSymbols = []string{
		"FleetVisibleTo",
	}
	// Shared coverage machinery underlying all five (Coverage has no
	// surviving caller once 7.1/7.2/7.4/7.5 are gone — buildScan/occluders/
	// scanOrigin are 7.3-only helpers already listed above).
	sharedCoverageSymbols = []string{
		"type Coverage struct",
		"coverageDisc",
		"func NewCoverage(",
		"func NewCoverageWithOccluders(",
		"func (c Coverage)",
		"InteriorSource",
		"FeatureGeom",
		"occluders(feats",
		"scanOrigin",
		"paramCell(",
		"paramString(",
		"logCoordinateRejection",
	}
)

func TestPackage_Scenario_LatticeLiveHalfSymbolsAreAbsent(t *testing.T) {
	groups := map[string][]string{
		"7.1 Ambient Sensor Coverage From Own Units":              ambientCoverageSymbols,
		"7.2 Running Scan Echo Disc":                              echoDiscSymbols,
		"7.3 Scan Resolution Mints the Reveal":                    scanResolutionSymbols,
		"7.4 Path-Swept Ambient Reveal on Move Resolution":        pathSweptAmbientSymbols,
		"7.5 Fleet Audience Visibility":                           fleetAudienceSymbols,
		"shared Coverage machinery (no caller once 7.1-7.5 land)": sharedCoverageSymbols,
	}

	src := readPackageSource(t)

	for label, syms := range groups {
		label, syms := label, syms
		t.Run("Scenario: "+label+" code is deleted", func(t *testing.T) {
			var violations []string
			for file, text := range src {
				for _, sym := range syms {
					if strings.Contains(text, sym) {
						violations = append(violations, file+": "+sym)
					}
				}
			}
			if len(violations) > 0 {
				t.Errorf("found %d lattice-live-half symbol reference(s) design.md Decision 11 names for "+
					"deletion under %q, want 0 (migrate-fleet-to-continuous-burns tasks.md):\n  %s",
					len(violations), label, strings.Join(violations, "\n  "))
			}
		})
	}
}

// readPackageSource reads every production (non-test) .go file in this
// package's own directory, keyed by filename.
func readPackageSource(t *testing.T) map[string]string {
	t.Helper()
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/observation: %v", err)
	}
	out := map[string]string{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue // scoped to this package's own PRODUCTION source, never its test files
		}
		raw, err := os.ReadFile(filepath.Join(".", name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		out[name] = string(raw)
	}
	return out
}
