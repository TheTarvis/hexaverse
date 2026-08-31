package disclosure

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// Scenario: The floor makes ignition an event (proximity-disclosure ›
// "Plume Radius Derives From Drive Output and Is Floored").
//
// The floor is only meaningful relative to the passive range: it is what
// makes lighting a drive detectable by anyone who could already see you
// cold. That relationship is an INVARIANT between two independently
// editable knobs, so it is asserted here rather than trusted to a comment
// nobody re-reads while tuning.
func TestPlumeFloorExceedsPassiveRange(t *testing.T) {
	if !(PlumeFloor > PassiveRange) {
		t.Fatalf("PlumeFloor (%v) must exceed PassiveRange (%v), so that igniting a drive is always an event", PlumeFloor, PassiveRange)
	}
}

// knobValues are the dial values params.go names. A bare occurrence of one
// of these at a call site is the failure mode the named-constant discipline
// exists to prevent: a feel-tuning pass edits params.go and silently misses
// the copy.
//
// 1.0 (MinCommandedAccel) is deliberately absent from this set. It collides
// with the structural 0/1 of a clamped segment parameter, which is geometry
// rather than a dial, and it has no production call site to protect yet
// anyway — the burn-commit path that will enforce it does not exist in this
// capability.
var knobValues = map[float64]string{
	12: "PassiveRange",
	20: "PlumeFloor",
	8:  "PlumePerDriveOutput",
	48: "FocusedScanRange",
}

// TestKnobsAreNeverBareLiteralsAtACallSite (tasks.md 2.1) walks this
// package's own production sources and fails on any numeric literal equal
// to a knob's value.
//
// Constant DECLARATIONS are skipped: a named constant is the discipline,
// not a violation of it, and this package has one (maxAttachmentDepth)
// whose value collides with a knob's by coincidence.
func TestKnobsAreNeverBareLiteralsAtACallSite(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", func(fi fs.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go") && fi.Name() != "params.go"
	}, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				if decl, ok := n.(*ast.GenDecl); ok && decl.Tok == token.CONST {
					return false
				}
				lit, ok := n.(*ast.BasicLit)
				if !ok || (lit.Kind != token.INT && lit.Kind != token.FLOAT) {
					return true
				}
				v, err := strconv.ParseFloat(lit.Value, 64)
				if err != nil {
					return true
				}
				if knob, hit := knobValues[v]; hit {
					t.Errorf("%s:%d: bare literal %s — use the named constant %s (params.go)",
						name, fset.Position(lit.Pos()).Line, lit.Value, knob)
				}
				return true
			})
		}
	}
}

// TestEveryKnobIsReferencedOrDeliberatelyPending is the other half of the
// same discipline: a constant nobody reads is a dial that does not turn
// anything. MinCommandedAccel now has a production reference — fleet.OrderTo
// validates a commanded acceleration against it (migrate-fleet-to-continuous-
// burns, design.md Decision 9) — but that reference lives in backend/fleet,
// outside this test's own package-scoped parse, so it can never trip the
// `referenced["MinCommandedAccel"]` branch below; the retirement is this
// comment update, not a code change to the assertion itself.
func TestEveryKnobIsReferencedOrDeliberatelyPending(t *testing.T) {
	referenced := map[string]bool{}
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", func(fi fs.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go") && fi.Name() != "params.go"
	}, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				if id, ok := n.(*ast.Ident); ok {
					referenced[id.Name] = true
				}
				return true
			})
		}
	}
	for _, knob := range []string{"PassiveRange", "PlumeFloor", "PlumePerDriveOutput", "FocusedScanRange"} {
		if !referenced[knob] {
			t.Errorf("%s is declared but never read by production code — a dial that turns nothing", knob)
		}
	}
	if referenced["MinCommandedAccel"] {
		t.Log("MinCommandedAccel now has a production reference; the pending note in params_test.go can go")
	}
}
