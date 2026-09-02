package system

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 7.5
// — system-interior "The Fuel Resource-Kind Name Is Reserved From
// Generation" (ADDED):
//
//   - "No declared mineable resource kind equals the reserved fuel name"
//   - "The six existing resource kinds are unaffected"
//
// REVISION LOG (SDET, 2026-09-02) — spec adjudication, not a dispute I
// initiated: the requirement was reworded by the orchestrator after my own
// red-phase report flagged that "system generation is invoked with a
// resource-kind configuration that includes fuel" presumed a configuration
// surface that does not exist (GenerationParams carries no resource-kind
// field; Generate returns no error; the six kinds are hardcoded directly in
// generator.go). The requirement's own body already said the real intent —
// "a tested invariant rather than an accidental absence" — so the mechanism
// is now a guard over the DECLARED CONSTANTS, never a Generate-time
// rejection. This file is rewritten against that shape: it asserts over a
// `ReservedFuelResourceKind` constant (new production surface, not yet
// landed — a developer adds it) that no declared `ResourceKind` equals it.
// `ValidateResourceKind`/`ErrReservedResourceKind` from the prior revision
// are DROPPED — that function is not being built.
//
// ROBUSTNESS, PER THE REVISION'S OWN INSTRUCTION ("a test that hardcodes
// six literals passes forever even if someone adds ResourceFuel next to
// them"): the "declared" set below is not a copy-pasted literal list. It is
// parsed directly out of model.go's own source via go/ast — every
// `ResourceKind`-typed const value declared anywhere in that file — so a
// future seventh kind (fuel included, if ever mistakenly added) is picked
// up automatically with no hand-maintained enumeration to fall out of sync.

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"testing"
)

// declaredResourceKinds parses model.go and returns every ResourceKind
// value declared as a const there — the single source of truth this file
// checks against, so adding a new kind to model.go is automatically
// covered without touching this test.
func declaredResourceKinds(t *testing.T) []ResourceKind {
	t.Helper()
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "model.go", nil, 0)
	if err != nil {
		t.Fatalf("parsing model.go to enumerate declared ResourceKind constants: %v", err)
	}

	var kinds []ResourceKind
	for _, decl := range f.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			ident, ok := vs.Type.(*ast.Ident)
			if !ok || ident.Name != "ResourceKind" {
				continue
			}
			for _, v := range vs.Values {
				lit, ok := v.(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					continue
				}
				unquoted, err := strconv.Unquote(lit.Value)
				if err != nil {
					t.Fatalf("unquoting ResourceKind literal %s: %v", lit.Value, err)
				}
				kinds = append(kinds, ResourceKind(unquoted))
			}
		}
	}
	return kinds
}

func TestGeneration_Scenario_NoDeclaredMineableResourceKindEqualsTheReservedFuelName(t *testing.T) {
	declared := declaredResourceKinds(t)
	if len(declared) == 0 {
		t.Fatal("declaredResourceKinds parsed ZERO ResourceKind constants out of model.go — this test would be " +
			"vacuous; the parser is almost certainly looking at the wrong shape")
	}
	for _, kind := range declared {
		if kind == ReservedFuelResourceKind {
			t.Errorf("system-interior \"No declared mineable resource kind equals the reserved fuel name\": "+
				"a declared ResourceKind constant equals ReservedFuelResourceKind (%q) — \"fuel\" is a reserved "+
				"cargo kind (fleet-movement's \"Fleet Cargo Pool\") and must never also be a declared mineable "+
				"resource kind, or a mined feature's credit would silently collide with the cargo kind this "+
				"change introduces", ReservedFuelResourceKind)
		}
	}
}

func TestGeneration_Scenario_TheSixExistingResourceKindsAreUnaffected(t *testing.T) {
	declared := declaredResourceKinds(t)
	want := map[ResourceKind]bool{
		ResourceMetals: true, ResourceVolatiles: true, ResourceWater: true,
		ResourceOrganics: true, ResourceResearch: true, ResourceExotic: true,
	}
	got := map[ResourceKind]bool{}
	for _, kind := range declared {
		got[kind] = true
	}
	for kind := range want {
		if !got[kind] {
			t.Errorf("system-interior \"The six existing resource kinds are unaffected\": declared "+
				"ResourceKind constants no longer include %q — want all six pre-existing kinds present and "+
				"unchanged", kind)
		}
	}
	if len(want) != 6 {
		t.Fatalf("this test's own `want` set has %d entries, not 6 — the test itself is broken", len(want))
	}
}
