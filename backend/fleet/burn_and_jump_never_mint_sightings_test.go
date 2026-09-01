package fleet

// Test for openspec change replace-observation-with-sightings, tasks.md 3.6
// (specs/sighting-records/spec.md — "A Sighting Is Minted Only By a
// Resolving Sweep": "A burn resolution mints no sighting" — "a fleet's burn
// resolves into a park near a foreign fleet, or a lane-transit trip
// resolves into a system where a foreign fleet is present... no sighting
// record is minted for that encounter by the resolution itself").
//
// This is a STRUCTURAL guard, not a live-timing integration test, and
// deliberately so: forcing a REAL burn to resolve past its ETA through wall-
// clock time (rather than an injected fake clock, which the production
// router does not use) is exactly the kind of flaky, timing-dependent test
// the determinism rules warn against. Instead this scans fleet's own
// PRODUCTION resolver declarations — BurnResolver's returned closure and
// JumpResolver's body — the exact two resolvers task 5.8 will place
// ScanResolver "alongside" IN THE SAME FILE. Scoping the scan to these two
// named declarations (rather than the whole file or package, which fleet is
// explicitly NOT barred from importing sightings from — task 5.8 wires
// exactly that import for ScanResolver) means this test stays meaningful
// and green even after ScanResolver legitimately imports and calls into
// sightings right next to it.
//
// This is NOT vacuous today: fleet/resolver.go is real, shipped production
// code, and this scan runs against its actual current AST — it genuinely
// fails if either resolver is later changed to reference sightings.
//
// See router_sightings_no_auto_mint_test.go (package main) for this
// section's companion LIVE test: a real resolved jump (the "lane-transit
// trip resolves" half of the scenario, using the repo's proven eta-time-
// skip pattern) and repeated real reads, both confirmed to leave the pile
// empty. The BURN half of the disjunction is covered ONLY structurally here
// — see the SDET handoff report for why a live burn-resolution variant was
// not attempted.

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"strings"
	"testing"
)

func sightingsMintGuardProductionFilesOnly(fi fs.FileInfo) bool {
	return !strings.HasSuffix(fi.Name(), "_test.go")
}

// Scenario: A burn resolution mints no sighting (structural half)
// Scenario: A burn resolution mints no sighting — "or a lane-transit trip
// resolves" (structural half; router_sightings_no_auto_mint_test.go covers
// the live half)
func TestResolvers_Scenario_BurnAndJumpResolutionsNeverReferenceSightings(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", sightingsMintGuardProductionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	targets := map[string]bool{"BurnResolver": true, "JumpResolver": true}
	found := map[string]bool{}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok || fn.Recv != nil || !targets[fn.Name.Name] {
					continue
				}
				found[fn.Name.Name] = true
				ast.Inspect(fn.Body, func(n ast.Node) bool {
					id, ok := n.(*ast.Ident)
					if !ok {
						return true
					}
					if id.Name == "sightings" {
						t.Errorf("%s:%d: %s references the \"sightings\" package — sighting-records \"A Sighting "+
							"Is Minted Only By a Resolving Sweep\" forbids a burn or lane-transit resolution from "+
							"minting a sighting; only a resolving focused scan (task 5.8's ScanResolver) may",
							name, fset.Position(id.Pos()).Line, fn.Name.Name)
					}
					return true
				})
			}
		}
	}
	for want := range targets {
		if !found[want] {
			t.Fatalf("expected to find a top-level function declaration named %q in backend/fleet's production "+
				"source — this test's own scan target is missing, which means it is checking nothing", want)
		}
	}
}
