package mine

// mine-extraction, "Mine Commit Preconditions" — the not-docked check this
// guards is implemented entirely via fleet.DockedTo() (re-express-economy-
// positions tasks.md 6.1). Mirrors backend/fleet/lattice_symbols_absent_
// test.go's PATTERN (pin a retired/never-present symbol family against
// regression), but AST-based rather than a raw byte scan: the fleet
// precedent's raw `strings.Contains` scan is safe only because none of its
// target symbols appear in prose anywhere in that package; "board." DOES
// appear in comment prose elsewhere in this codebase (market/handler.go:33,
// market/service.go:146, stations/model.go:37,
// stations/service.go:53,204,212) — a raw scan of THIS repo's conventions
// would be fragile the moment a similar comment landed in mine. Parsing
// with go/parser and inspecting only the import set and selector
// expressions scopes the check to CODE, never comment text.
//
// EXPECTED GREEN TODAY: a source grep already confirms mine has zero
// hexaverse/board references (design.md Context: "a source grep of
// non-test mine/ and market/ for board. returns zero hits") — this test
// pins that baseline against a future regression (e.g. a developer reaching
// for board.Within/board.LineOfSight while implementing this change's own
// belt-member resolution work, instead of routing everything through
// fleet.Fleet.DockedTo() as design.md requires).

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPackage_Scenario_NoLatticeBoardSymbols(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/mine: %v", err)
	}
	fset := token.NewFileSet()
	var violations []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue // scoped to this package's own PRODUCTION source, never its test files
		}
		file, err := parser.ParseFile(fset, filepath.Join(".", name), nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}
		for _, imp := range file.Imports {
			if strings.Trim(imp.Path.Value, `"`) == "hexaverse/board" {
				violations = append(violations, name+": imports hexaverse/board")
			}
		}
		ast.Inspect(file, func(n ast.Node) bool {
			sel, ok := n.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			if ident, ok := sel.X.(*ast.Ident); ok && ident.Name == "board" {
				violations = append(violations, name+": references board."+sel.Sel.Name)
			}
			return true
		})
	}
	if len(violations) > 0 {
		t.Errorf("found %d lattice board.* reference(s) in mine's production source, want 0 (the not-docked check must stay fleet.DockedTo()-only):\n  %s",
			len(violations), strings.Join(violations, "\n  "))
	}
}
