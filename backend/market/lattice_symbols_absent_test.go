package market

// goods-sale, "Sale Requires the Fleet Docked To the Buying Station"
// (re-express-economy-positions tasks.md 6.2). Same AST-based scan as
// backend/mine/lattice_symbols_absent_test.go, scoped to market's own
// non-test source files.
//
// market/handler.go:33 ("GetBoard serves the remote price board. GET
// /v1/market/board") and market/service.go:146 ("One unreachable station
// must not fail the whole board.") both contain the literal text "board."
// inside comment prose — a raw `strings.Contains` byte scan would false-
// positive on both. Parsing with go/parser and inspecting only the import
// set and selector expressions is what makes this test actually pass
// today despite that prose.
//
// EXPECTED GREEN TODAY: a source grep already confirms market has zero
// hexaverse/board references (design.md Context: "a source grep of
// non-test mine/ and market/ for board. returns zero hits") — market's own
// dockedTo (service.go) already resolves entirely through
// fleet.Fleet.DockedTo(). This test pins that baseline against regression.

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
		t.Fatalf("read backend/market: %v", err)
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
		t.Errorf("found %d lattice board.* reference(s) in market's production source, want 0 (the docked-at-station check must stay fleet.DockedTo()-only, even though the word \"board.\" legitimately appears in this package's comment prose):\n  %s",
			len(violations), strings.Join(violations, "\n  "))
	}
}
