package disclosure

// SDET-added test for openspec change replace-observation-with-sightings,
// tasks.md 3.5 (specs/sighting-records/spec.md — "A Sighting Is Never
// Consulted To Decide Live Disclosure"; design.md Decision 17: "It [sightings]
// may import disclosure; disclosure may never import it").
//
// Not explicitly requested by tasks.md 3.5, which names `system` as the
// package under test (system constructs the `contacts` response element;
// disclosure does not — it is the predicate library system calls). Added
// here for the same reason task 2.9 added an explicit named assertion for
// charts on top of purity_test.go's general allow-list: this package's own
// TestPackageImportsNothingThatCouldWrite already fails the build the
// instant disclosure imports anything outside {errors, hexaverse/common,
// hexaverse/space} — which already forecloses hexaverse/sightings — but a
// reviewer of THIS capability's own narrow-rule guarantee should find it
// named here rather than having to infer it from the general allow-list's
// absence of an entry, exactly as never_imports_charts_test.go already does
// for charts.
//
// SDET NOTE ON REDNESS: like never_imports_charts_test.go, this is TRUE both
// before and after backend/sightings is scaffolded and is not expected to go
// red at any point in a correct implementation — a permanent regression net,
// not red-phase evidence of missing behavior.

import (
	"go/parser"
	"go/token"
	"strconv"
	"testing"
)

func TestPackageNeverImportsSightings(t *testing.T) {
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
				if path == "hexaverse/sightings" {
					t.Errorf("%s imports hexaverse/sightings — the pile is a stored, sellable-later record, "+
						"never an input to a live disclosure decision; disclosure's inputs are Ship/Body/World "+
						"only", name)
				}
			}
		}
	}
}
