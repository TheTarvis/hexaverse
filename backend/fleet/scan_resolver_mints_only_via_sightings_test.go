package fleet

// RED-phase structural-guard test for openspec change
// replace-observation-with-sightings §5 — Debt 2, the second of the two
// debts §3 explicitly recorded and deferred to this section: "Assert
// ScanResolver mints only via sightings.MintWrites returned through
// ResolveResult.Writes — converting a shape argument (the Dao interface has
// no write method) into a runnable assertion. Shapes drift."
//
// §3's own sightings.Dao (dao.go) already has no Create/Set/Update/Delete
// method — sightings/model_test.go and sightings/immutability_test.go pin
// THAT half structurally. What neither of those tests can see is fleet's
// OWN production code: whether ScanResolver actually routes its mint
// through sightings.MintWrites's returned action.DocWrite values (the ONLY
// path a resolver may use to persist an effect —
// action.ResolveResult.Writes, applied inside the SAME transaction as the
// status flip, per action/model.go's own doc comment) rather than, say,
// constructing []sightings.Sighting by hand and never calling MintWrites at
// all (which would still compile, still pass every scenario test in
// scan_resolver_test.go that only inspects res.Writes' raw map shape, and
// still be a live drift risk the moment MintWrites' own doc-path scheme
// changes).
//
// This scans ScanResolver's actual production AST (the function declared
// in fleet/resolver.go, "alongside BurnResolver" per design.md Decision 13)
// for a call expression selecting `sightings.MintWrites` — a real,
// selector-qualified call, not merely the string "sightings" anywhere in
// the file (which burn_and_jump_never_mint_sightings_test.go already
// guards the OPPOSITE way for BurnResolver/JumpResolver). Deliberately
// scoped to ScanResolver by name, exactly as that sibling test scopes
// itself to BurnResolver/JumpResolver by name — not the whole file or
// package, which fleet is explicitly permitted to import sightings from
// (task 3.5; sighting-records "A Sighting Is Never Consulted To Decide Live
// Disclosure" — "fleet... is not, and cannot become, a package this rule
// needs to constrain").
//
// EXPECTED RED TODAY: ScanResolver does not exist yet, so this test's own
// "found ScanResolver" self-check fails — a genuine, meaningful red (not a
// compile error): the test file itself compiles cleanly (it only inspects
// source text via go/ast, never references the ScanResolver symbol as Go
// code), and running it reports "expected to find a top-level function
// declaration named ScanResolver" rather than 0 tests executed.

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"strings"
	"testing"
)

func scanMintGuardProductionFilesOnly(fi fs.FileInfo) bool {
	return !strings.HasSuffix(fi.Name(), "_test.go")
}

// Scenario (Debt 2 — see file doc comment): ScanResolver mints only via
// sightings.MintWrites returned through ResolveResult.Writes.
func TestScanResolver_Scenario_MintsOnlyViaSightingsMintWrites(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", scanMintGuardProductionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}

	var found bool
	var callsMintWrites bool
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok || fn.Recv != nil || fn.Name.Name != "ScanResolver" {
					continue
				}
				found = true
				ast.Inspect(fn.Body, func(n ast.Node) bool {
					call, ok := n.(*ast.CallExpr)
					if !ok {
						return true
					}
					sel, ok := call.Fun.(*ast.SelectorExpr)
					if !ok {
						return true
					}
					pkgIdent, ok := sel.X.(*ast.Ident)
					if ok && pkgIdent.Name == "sightings" && sel.Sel.Name == "MintWrites" {
						callsMintWrites = true
					}
					return true
				})
			}
		}
	}

	if !found {
		t.Fatalf("expected to find a top-level function declaration named ScanResolver in backend/fleet's " +
			"production source (task 5.8, alongside BurnResolver/JumpResolver in resolver.go) — this test's own " +
			"scan target is missing, which means §5's mint path has not been implemented yet")
	}
	if !callsMintWrites {
		t.Error("ScanResolver's body contains no call to sightings.MintWrites(...) — every sighting it mints " +
			"must be built through that package's sole minting mechanism (sighting-records \"A Sighting Is " +
			"Minted In the Resolve Transaction, Exactly Once\"), not a hand-assembled []sightings.Sighting or a " +
			"direct write of any kind")
	}
}
