package fleet

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 1.2 — "Drop Jump's charted-lane precondition: jump-eligibility
// becomes 'attached to the lane's own gate body, no dwell' — delete
// ErrLaneNotCharted and the charted-lane check from fleet.Service.Jump"
// (design.md Decision 2, blocker 1: the charting circularity) — folded
// together with the constructor-shape half of blocker 3 that task 1.1's own
// text makes load-bearing for this section ("task 6.3 — there is no
// WithGraph to call; the constructor signature itself makes the dependency
// impossible to omit").
//
// This mirrors the established source-grep pattern
// (lattice_symbols_absent_test.go / routing_deletion_test.go): pinning an
// ABSENCE rather than a behavior, specifically because a behavioral test
// exercising Jump's construction seam (WithGraph/WithTierSource) would need
// to keep calling symbols this very task deletes — see the SDET handoff
// report's note on task 6.3's constructor-signature churn. A grep test
// references the deleted names only as string literals, so it never breaks
// to compile no matter how the replacement constructor shape lands; a
// behavioral construction test would.
//
// WAS RED WHEN WRITTEN: fleet/service.go declared all four symbols
// (ErrLaneNotCharted, TierSource, WithTierSource, WithGraph) and Jump still
// evaluated `charted[laneId]` before committing. Tasks 1.2 and 6.3 removed
// them; this file is now the standing regression net against their return.
//
// SDET note (see handoff report): WithGraph's own deletion is formally task
// 6.3 (section 6, out of the original dispatch's scope), but task 1.1
// explicitly requires it as part of THAT section's own work ("there is no
// WithGraph to call"), so it is pinned here rather than deferred.
//
// This file now carries TWO absence scenarios, with deliberately different
// scan mechanisms — see each one's own comment for why:
//   - the charting-era symbols (textual scan, deletedChartingSymbols)
//   - the deleted zero-/partial-dependency constructors added by task 6.3
//     (AST declaration scan, deletedConstructors)

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// productionSources lists this package's own PRODUCTION .go files (never its
// test files) — the scan surface both absence scenarios below share.
func productionSources(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/fleet: %v", err)
	}
	var files []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		files = append(files, filepath.Join(".", name))
	}
	if len(files) == 0 {
		t.Fatal("scanned backend/fleet and found ZERO production .go files — the scan is vacuous, " +
			"so neither absence scenario below is proving anything; fix the scan before trusting it")
	}
	return files
}

// deletedChartingSymbols are the lattice-permission-era identifiers design.md
// Decision 2/22 names for deletion from fleet/service.go.
var deletedChartingSymbols = []string{
	"ErrLaneNotCharted",
	"TierSource",
	"WithTierSource",
	"WithGraph",
}

// Scenario: Jumping from an attached gate commits — the charting-circularity
// half. Pinned here as the durable "must never reappear" regression net; the
// BEHAVIORAL half of this scenario (a real jump succeeding with zero charted
// knowledge) is exercised by the production-router end-to-end test
// (traversability_e2e_test.go in package main), which does not share this
// test's construction-seam churn risk.
func TestPackage_Scenario_ChartingCircularitySymbolsAreAbsent(t *testing.T) {
	var violations []string
	for _, path := range productionSources(t) {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		src := string(raw)
		for _, sym := range deletedChartingSymbols {
			if strings.Contains(src, sym) {
				violations = append(violations, filepath.Base(path)+": "+sym)
			}
		}
	}
	if len(violations) > 0 {
		t.Errorf("found %d charting-circularity-era symbol reference(s) design.md Decision 2/22 name for "+
			"deletion, want 0 (replace-observation-with-sightings tasks.md 1.2, 1.1/6.3):\n  %s",
			len(violations), strings.Join(violations, "\n  "))
	}
}

// deletedConstructors are the zero-/partial-dependency constructors
// replace-observation-with-sightings tasks.md 6.3 deletes, leaving
// NewServiceWith (graph required, positional) and NewHandlerWith as this
// package's ONLY constructors. Locking their absence is the point of the task:
// a fleet Service built without a GraphSource leaves Jump unreachable and
// fleets permanently stuck, and that bug shipped TWICE on this chain — both
// times through a constructor that let the dependency go unstated.
// NewServiceComplete was the transitional name; NewService/NewHandler were the
// singleton-wired pair.
var deletedConstructors = []string{
	"NewServiceComplete",
	"NewService",
	"NewHandler",
}

// Scenario: the zero-dependency constructors stay deleted — the constructor
// signature itself is what makes a graph-less fleet Service unconstructable
// (design.md Decision 22), so a reintroduced NewService()/NewHandler() would
// silently reopen the hole no behavioral test can see until a jump 500s in
// production.
//
// This scenario scans DECLARATIONS via go/ast rather than reusing the
// scenario above's strings.Contains grep, and deliberately so: "NewService"
// and "NewHandler" are proper substrings of the two SURVIVING constructors
// (NewServiceWith / NewHandlerWith), and handler.go's own doc comment names
// "NewHandler" in prose precisely to explain why it does not exist. A textual
// grep would therefore report three violations against a perfectly correct
// tree — failing for the wrong reason and training the next reader to ignore
// it. Matching declared function names is both exact at identifier boundaries
// and the sharper assertion anyway: what must never come back is a DECLARED
// constructor, not a mention of one.
func TestPackage_Scenario_ZeroDependencyConstructorsAreAbsent(t *testing.T) {
	banned := map[string]bool{}
	for _, name := range deletedConstructors {
		banned[name] = true
	}

	fset := token.NewFileSet()
	var violations []string
	declared := 0
	sawSurvivingConstructor := false
	for _, path := range productionSources(t) {
		file, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok {
				continue
			}
			declared++
			if fn.Name.Name == "NewServiceWith" || fn.Name.Name == "NewHandlerWith" {
				sawSurvivingConstructor = true
			}
			if banned[fn.Name.Name] {
				violations = append(violations, filepath.Base(path)+": func "+fn.Name.Name)
			}
		}
	}

	// Non-vacuity: a scan that parsed files but saw no declarations at all, or
	// that cannot even find the constructors this package DOES have, would
	// report "absent" for every symbol on earth.
	if declared == 0 {
		t.Fatal("parsed backend/fleet's production sources and found ZERO function declarations — " +
			"the AST scan is broken, so its 'absent' verdict is meaningless")
	}
	if !sawSurvivingConstructor {
		t.Fatalf("the AST scan saw %d function declarations but neither NewServiceWith nor NewHandlerWith "+
			"among them — the scan is not seeing this package's real constructors, so its 'absent' verdict "+
			"cannot be trusted", declared)
	}

	if len(violations) > 0 {
		t.Errorf("found %d deleted zero-/partial-dependency constructor declaration(s), want 0 "+
			"(replace-observation-with-sightings tasks.md 6.3, design.md Decision 22 — every fleet.Service "+
			"must state its GraphSource or fail to compile):\n  %s",
			len(violations), strings.Join(violations, "\n  "))
	}
}
