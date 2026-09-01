package system

// Test for openspec change replace-observation-with-sightings, tasks.md 3.5
// (specs/sighting-records/spec.md — "A Sighting Is Never Consulted To
// Decide Live Disclosure": "no package that constructs a `contacts`
// response element — currently `system` alone — SHALL import `sightings`",
// scenario "No live-disclosure-assembly package imports sightings").
//
// design.md's own "narrow rule" (Decision 17 of the parent design; restated
// in this capability's own spec) is the reason this lives HERE rather than
// inside backend/sightings: the guarantee is a property of what SYSTEM is
// allowed to import, not of what sightings exposes — sightings could be
// written with perfect discipline and the rule would still break the moment
// system's interior handler (task 4.5, a LATER section) reaches for a
// "we already saw this one, keep it in contacts" shortcut. Same species as
// disclosure/purity_test.go and disclosure/never_imports_charts_test.go: an
// AST scan of the package's own production import set, not a read-through
// confirmation.
//
// fleet is DELIBERATELY not checked by any test of this shape — it is where
// the focused-scan resolver that MINTS sighting records lives (task 5.8),
// and minting from inside a resolve transaction is not assembling a live-
// disclosure response (fleet's own read endpoints compute no partial-
// visibility snapshot of a foreign fleet — "Fleet Read Endpoints Serve Own
// Fleets In Full and Foreign Fleets As Contacts").
//
// SDET NOTE ON REDNESS: this assertion is TRUE both before and after
// backend/sightings is scaffolded — system has no reason to import it until
// some future implementer adds exactly the shortcut this rule forbids, and
// nothing in tasks.md ever asks for one. This is a PERMANENT structural
// regression net, not red-phase evidence of missing behavior: it does not
// fail today, and a correct implementation of this whole change never makes
// it fail either. See the SDET handoff report.

import (
	"go/parser"
	"go/token"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

func sightingsGuardProductionFilesOnly(fi fs.FileInfo) bool {
	return !strings.HasSuffix(fi.Name(), "_test.go")
}

func TestSystemPackageNeverImportsSightings(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", sightingsGuardProductionFilesOnly, 0)
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
					t.Errorf("%s imports hexaverse/sightings — system constructs the `contacts` response "+
						"element (system-interior's Foreign Presence Is Served As System Contacts), and no "+
						"package that does so may import the sighting pile: a target's absence or presence in "+
						"contacts must be decided solely by the live disclosure union, never by whether a "+
						"sighting for it exists (sighting-records \"A Sighting Is Never Consulted To Decide Live "+
						"Disclosure\")", name)
				}
			}
		}
	}
}
