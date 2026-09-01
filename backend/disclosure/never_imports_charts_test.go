package disclosure

// Test for openspec change replace-observation-with-sightings, tasks.md 2.9
// (specs/galaxy-knowledge/spec.md — "A Knowledge Write Never Decides Live
// Disclosure": "Explored knowledge does not disclose a foreign fleet ... its
// stored knowledge tier plays no part in that outcome").
//
// purity_test.go's TestPackageImportsNothingThatCouldWrite already fails the
// build the instant this package imports anything outside {errors,
// hexaverse/common, hexaverse/space} — which already forecloses
// hexaverse/charts (and, before this change lands, hexaverse/observation).
// Task 2.9 asks for an explicit NAMED assertion on top of that general rule,
// so a reviewer of galaxy-knowledge's own test coverage finds this
// capability's guarantee by its own name rather than having to infer it from
// the general allow-list's absence of an entry.
//
// SDET note on redness: this assertion is TRUE both before and after
// backend/charts is scaffolded (task 2.2) — disclosure/purity_test.go's
// allow-list already makes the reverse import a compile error, so this test
// is not expected to go red at any point in a correct implementation. It is
// included as a permanent, explicitly-named regression net for this
// capability's own "no stored record decides live disclosure" rule, not as
// red-phase evidence of missing behavior — see the SDET handoff report.

import (
	"go/parser"
	"go/token"
	"strconv"
	"testing"
)

func TestPackageNeverImportsCharts(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", productionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			for _, imp := range file.Imports {
				path, err := strconv.Unquote(imp.Path.Value)
				if err != nil {
					t.Fatalf("%s: unquoting import %s: %v", name, imp.Path.Value, err)
				}
				if path == "hexaverse/charts" {
					t.Errorf("%s imports hexaverse/charts — galaxy-knowledge's own stored knowledge "+
						"(system tiers, charted lanes) must never be consulted to decide live disclosure; "+
						"disclosure's inputs are Ship/Body/World only", name)
				}
			}
		}
	}
}
