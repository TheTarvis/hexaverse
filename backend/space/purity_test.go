package space

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// tasks.md 2.6: "Add a sibling purity test for space (mirroring
// disclosure/purity_test.go's structural import-allowlist assertion) —
// today the package's purity is doc-comment-true only, and this change is
// the one most likely to tempt a firestore: tag onto the codec extension."
//
// package space's own doc comment (vec.go) already claims: "It imports only
// hexaverse/common (for WorldMillis): no Firestore, no clock, no
// time.Now()." That claim is checked here structurally, the same way
// disclosure/purity_test.go checks its own doc-comment claim, rather than
// trusted as prose. table.go's pinned-artifact loader widens the true
// production set slightly (encoding/json, fmt, sync, embed, to load the
// embedded turn table) — recorded in the allowlist below as the actual,
// audited set, not "common" alone.

// allowedImports is the complete production import set of this capability,
// as an ALLOW-LIST (mirroring disclosure/purity_test.go's own reasoning: the
// requirement is not "no Firestore" specifically, it is that every
// rule-bearing kinematics computation is a pure function of its inputs and
// stored fields — a Firestore client, an HTTP client, or a clock would each
// break that identically, so a deny-list would have to guess them all).
var spaceAllowedImports = map[string]bool{
	"errors":           true,
	"math":             true,
	"fmt":              true,
	"sync":             true,
	"encoding/json":    true,
	"embed":            true,
	"hexaverse/common": true,
}

func spaceProductionFilesOnly(fi fs.FileInfo) bool { return !strings.HasSuffix(fi.Name(), "_test.go") }

// Scenario (space-kinematics, package-level invariant restated as a test,
// not merely a doc comment): this capability's production code imports
// nothing outside its audited set — no Firestore client, no
// hexaverse/action (Decision 15: the codec's OUTPUT satisfies action's
// allowlist without this package ever importing action), no clock package
// beyond the injected common.WorldMillis type.
func TestPackageImportsOnlyItsAuditedSet(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", spaceProductionFilesOnly, 0)
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
				if !spaceAllowedImports[path] {
					t.Errorf("%s imports %q, which is outside backend/space's audited set %v — this capability's rule-bearing kinematics must stay a pure function of its inputs and stored fields (vec.go's own doc comment: \"no Firestore, no clock, no time.Now()\")",
						name, path, spaceSortedKeys(spaceAllowedImports))
				}
			}
		}
	}
}

// Scenario (SDET-added, the specific temptation tasks.md 2.6 names by
// name): no struct field anywhere in this package's production code carries
// a `firestore:` tag. The widened codec (Burn/Park/Drift) is exactly the
// surface this change adds that would make a `firestore:` tag look
// convenient — and exactly the surface design.md Decision 21C item 3 says
// must NOT take that shortcut: a struct-tag route "would fail only against
// the emulator, not against a unit test", which is why the named codec
// (EncodeBurn/DecodeBurn/...) exists instead of Firestore struct tags at
// all.
func TestNoFirestoreStructTagAnywhereInThePackage(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", spaceProductionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				st, ok := n.(*ast.StructType)
				if !ok {
					return true
				}
				for _, field := range st.Fields.List {
					if field.Tag == nil {
						continue
					}
					tagVal, err := strconv.Unquote(field.Tag.Value)
					if err != nil {
						continue
					}
					if strings.Contains(tagVal, "firestore:") {
						fieldNames := "?"
						if len(field.Names) > 0 {
							names := make([]string, len(field.Names))
							for i, id := range field.Names {
								names[i] = id.Name
							}
							fieldNames = strings.Join(names, ",")
						}
						t.Errorf("%s:%d: field %q carries a `firestore:` struct tag; backend/space stores nothing directly — every stored value crosses the boundary through the named codec (EncodeBurn/EncodePark/EncodeDrift/...), never a struct-tag-driven Firestore decode",
							name, fset.Position(field.Pos()).Line, fieldNames)
					}
				}
				return true
			})
		}
	}
}

func spaceSortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
