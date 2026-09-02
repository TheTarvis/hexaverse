package stations

// trading-station, "Docking to the station involves no lattice predicate"
// (re-express-economy-positions tasks.md 6.3). AST-based, scoped by FILE
// and by CALL SITE, never by symbol name: stations never imports
// board.ModeDocked, board.Within, or board.LineOfSight today, so a
// symbol-name deny-list (mine/market's own lattice_symbols_absent_test.go
// shape) would assert nothing useful here. What actually needs pinning is
// narrower and more surgical — per Q1 (design.md), `hexaverse/board` stays
// imported for the board renderer's Footprint derivation until link 8/9,
// but ONLY in placement.go (the ring/slot/period/direction derivation) and
// within service.go's FeatureOf (which turns a stored orbit back into a
// board.Cell Footprint on read) — no other file, and no other function in
// service.go, may reference it.
//
// stations/model.go:37 and stations/service.go:53,204,212 all mention
// "board." in comment prose today and must NOT trip this guard — go/parser
// does not walk comments into the ast.Node tree ast.Inspect below visits,
// so this is scoped to CODE by construction, not by a text-blocklist trick.
//
// EXPECTED GREEN TODAY: a source grep already confirms hexaverse/board is
// imported by exactly placement.go and service.go, and that every
// board.-prefixed selector in service.go falls within lines 223-243
// (FeatureOf's own body) — this test pins that shape against a future
// regression (e.g. a developer reaching for board.Canon or
// board.ProductionSchedule from a NEW dock/co-location check elsewhere in
// this package, mistaking FeatureOf's retained Footprint derivation for
// license to compute board-cell geometry anywhere else here).

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPackage_Scenario_BoardImportScopedToPlacementAndFeatureOf(t *testing.T) {
	dirEntries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/stations: %v", err)
	}
	var names []string
	for _, e := range dirEntries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue // scoped to this package's own PRODUCTION source, never its test files
		}
		names = append(names, name)
	}

	fset := token.NewFileSet()
	var violations []string
	for _, name := range names {
		file, err := parser.ParseFile(fset, filepath.Join(".", name), nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}

		imports := false
		for _, imp := range file.Imports {
			if strings.Trim(imp.Path.Value, `"`) == "hexaverse/board" {
				imports = true
			}
		}
		if imports && name != "placement.go" && name != "service.go" {
			violations = append(violations, name+": imports hexaverse/board outside placement.go/service.go")
		}

		var featureOfStart, featureOfEnd token.Pos
		if name == "service.go" {
			for _, decl := range file.Decls {
				if fn, ok := decl.(*ast.FuncDecl); ok && fn.Name.Name == "FeatureOf" {
					featureOfStart, featureOfEnd = fn.Pos(), fn.End()
				}
			}
			if featureOfStart == token.NoPos {
				t.Fatalf("service.go declares no FeatureOf function — this guard's fixture is out of sync with the source and must be updated by whoever moves/renames it")
			}
		}

		ast.Inspect(file, func(n ast.Node) bool {
			sel, ok := n.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			ident, ok := sel.X.(*ast.Ident)
			if !ok || ident.Name != "board" {
				return true
			}
			switch name {
			case "placement.go":
				// Unrestricted within this file — Q1 retains placement.go's
				// board usage wholesale (the ring/slot/period/direction
				// derivation itself).
			case "service.go":
				if n.Pos() < featureOfStart || n.End() > featureOfEnd {
					violations = append(violations, name+": board."+sel.Sel.Name+" referenced outside FeatureOf")
				}
			default:
				violations = append(violations, name+": references board."+sel.Sel.Name+" outside placement.go/service.go")
			}
			return true
		})
	}
	if len(violations) > 0 {
		t.Errorf("lattice-predicate scope violated (%d violation(s)) — docking must involve no lattice predicate, and the retained Footprint derivation must stay confined to placement.go/FeatureOf:\n  %s",
			len(violations), strings.Join(violations, "\n  "))
	}
}
