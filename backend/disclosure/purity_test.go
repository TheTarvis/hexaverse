package disclosure

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
	"testing"
)

// allowedImports is the complete production import set of this capability.
// It is an ALLOW-LIST rather than a deny-list of the obviously-bad, because
// the requirement is not "no Firestore" — it is that a live disclosure
// decision is a pure function of its inputs. A clock, an HTTP client, or a
// global would each break that just as thoroughly as a database handle, and
// a deny-list would have to guess them all in advance.
var allowedImports = map[string]bool{
	"errors":           true,
	"hexaverse/common": true,
	"hexaverse/space":  true,
}

// Scenario: Live disclosure writes no record (proximity-disclosure › "Live
// Disclosure Is Recomputed, Never Persisted"). tasks.md 4.4.
//
// Asserted structurally rather than behaviourally: a test that called
// Disclose and then checked a store for writes would only prove the paths
// it happened to exercise. This proves it for every path there is or ever
// will be, because a package that cannot import a client cannot write, and
// World (world.go) carries no writer and no transaction for anything to
// write through.
func TestPackageImportsNothingThatCouldWrite(t *testing.T) {
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
				if !allowedImports[path] {
					t.Errorf("%s imports %q, which is outside this capability's allowed set %v — a live disclosure decision is a pure function of its inputs",
						name, path, keysOf(allowedImports))
				}
			}
		}
	}
}

// TestWorldCarriesNoWriter is the other half of the same argument: even
// with a permitted import set, a World handed a writer would let a caller
// smuggle persistence onto the path. Every field of World must be a READ
// affordance.
func TestWorldCarriesNoWriter(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", productionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	writerish := []string{"write", "writer", "client", "store", "tx", "txn", "transaction", "batch", "commit", "save"}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				spec, ok := n.(*ast.TypeSpec)
				if !ok || spec.Name.Name != "World" {
					return true
				}
				st, ok := spec.Type.(*ast.StructType)
				if !ok {
					return true
				}
				for _, field := range st.Fields.List {
					for _, id := range field.Names {
						lower := strings.ToLower(id.Name)
						for _, bad := range writerish {
							if strings.Contains(lower, bad) {
								t.Errorf("%s: World.%s reads as a write affordance; World is the READ side and nothing more", name, id.Name)
							}
						}
					}
				}
				return false
			})
		}
	}
}

// Scenario: No square root reaches a disclosure decision (proximity-
// disclosure › "Proximity Comparisons Are Squared, Never Rooted").
// tasks.md 8.2.
//
// The repo's transcendental-drift lint scopes this package too (it is named
// in .claude/scripts/check-transcendental.sh's rule-bearing package list),
// and that lint is the one that fails a build. This test is the colocated
// second copy: a lint that runs on changed files can be skipped by editing
// nothing, while `go test ./disclosure/` cannot.
//
// It also covers what the lint's regex does not: the `math` package is not
// imported here AT ALL, so a rooted comparison cannot appear without first
// failing TestPackageImportsNothingThatCouldWrite as well.
func TestNoSquareRootOnADisclosurePath(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", productionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	forbidden := map[string]bool{
		"Sqrt": true, "Hypot": true, "Pow": true, "Round": true,
		"Sin": true, "Cos": true, "Tan": true, "Atan": true, "Atan2": true,
		"Log": true, "Exp": true,
	}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				sel, ok := n.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				pkgIdent, ok := sel.X.(*ast.Ident)
				if !ok || pkgIdent.Name != "math" {
					return true
				}
				if forbidden[sel.Sel.Name] {
					t.Errorf("%s:%d: math.%s on a disclosure path. Comparisons here are squared and never rooted; if a call site is genuinely correctly-rounded and pinned, it needs a colocated determinism:allow(pinned) pragma and a reviewed reason.",
						name, fset.Position(sel.Pos()).Line, sel.Sel.Name)
				}
				return true
			})
		}
	}
}

// TestNoRoundingOfAPositionOnADisclosurePath (proximity-disclosure › "Every
// Disclosure Predicate Reads Position Through the Canonical Path": "no
// rounding, truncation, or quantization of a position component is found on
// a disclosure path").
//
// Rounding does not remove a knife edge, it relocates it onto the rounding
// boundary — and the shipped arithmetic is already bit-reproducible, so
// rounding would strictly degrade a guarantee that is already in hand. The
// one exact variant, quantizing positions onto an integer grid, is rejected
// precisely BECAUSE it is a grid: a finer one than the discrete board this
// codebase has since deleted, but the same object the pivot to continuous
// space exists to leave, reintroduced at the layer that most directly
// decides what a player sees.
func TestNoRoundingOfAPositionOnADisclosurePath(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", productionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				id, ok := call.Fun.(*ast.Ident)
				if !ok {
					return true
				}
				switch id.Name {
				case "int", "int32", "int64", "float32":
					t.Errorf("%s:%d: %s(...) narrows or truncates a value on a disclosure path; positions are never quantized here",
						name, fset.Position(call.Pos()).Line, id.Name)
				}
				return true
			})
		}
	}
}

func keysOf(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sortStrings(out)
	return out
}
