package action

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 6.5 — the SEAM half of action-dispatch's ADDED requirement
// "Action Endpoints Are Restricted to the Owning Corporation":
//
//	"inject an ActorOwner{OwnerOf(ctx, collection, actorId) (corpId string,
//	 err error)} into action.Handler, wired in router.go from the fleet
//	 service; 404 (not 403) on mismatch or no corporation across
//	 GET /v1/actions?actor=, GET /v1/actions/:id,
//	 POST /v1/actions/:id/acknowledge, POST /v1/actions/:id/cancel."
//
// WHY THIS IS AN AST SCAN AND NOT A COMPILE-TIME REFERENCE. The obvious TDD
// shape — a test that declares a fake ActorOwner and hands it to
// action.NewHandlerWith — cannot be written today without breaking the
// BUILD of every other test in this package, which would turn ~30 unrelated
// green tests red for a reason that has nothing to do with their subject
// and would leave the developer with no working suite to iterate against.
// This scan gets the same contract enforced (the type must exist, be named
// ActorOwner, carry exactly OwnerOf with exactly that signature, and be a
// field of Handler) while keeping the package compiling, so the BEHAVIOURAL
// half — backend/router_action_ownership_e2e_test.go, four endpoints through
// the real production router with no fake anywhere — stays runnable.
//
// This test pins the seam's SHAPE only. It deliberately pins NOTHING about
// what the handler should do when OwnerOf returns an ERROR: tasks.md 7.7
// item (3) records that as explicitly undecided by this change ("no scenario
// here says whether an ActorOwner lookup error should fail open ... or
// closed"). Only the definitive-owner and no-corporation paths are covered,
// here and in the e2e.
//
// EXPECTED TO BE RED TODAY: backend/action declares no ActorOwner type and
// action.Handler (handler.go) has only svc and clock fields.

import (
	"bytes"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"io/fs"
	"strings"
	"testing"
)

func actorOwnerSeamProductionFilesOnly(fi fs.FileInfo) bool {
	return !strings.HasSuffix(fi.Name(), "_test.go")
}

const actorOwnerTypeName = "ActorOwner"

// wantOwnerOfParams / wantOwnerOfResults are the exact signature tasks.md 6.5
// names: OwnerOf(ctx, collection, actorId) (corpId string, err error).
// Parameter and result NAMES are not pinned (they are documentation); the
// TYPES and their order are the contract every call site depends on.
var (
	wantOwnerOfParams  = []string{"context.Context", "string", "string"}
	wantOwnerOfResults = []string{"string", "error"}
)

// Scenario support for all six of action-dispatch's "Action Endpoints Are
// Restricted to the Owning Corporation" scenarios: each of them requires the
// handler to resolve "who owns this actor", and tasks.md 6.5 names this
// interface as the seam it resolves through.
func TestActorOwner_Seam_ExistsWithTheSignatureTask65Names(t *testing.T) {
	decls := parseActionPackage(t)

	iface, ok := decls.interfaces[actorOwnerTypeName]
	if !ok {
		t.Fatalf("backend/action declares no `type %s interface` in its production source. tasks.md 6.5 requires "+
			"the handler resolve an action's actor to an owning corporation through an injected seam:\n\n"+
			"    type %s interface {\n"+
			"        OwnerOf(ctx context.Context, collection, actorId string) (corpId string, err error)\n"+
			"    }\n\n"+
			"declared in package action (so action does not import fleet — the dependency already runs the other "+
			"way) and satisfied in router.go by the fleet service.", actorOwnerTypeName, actorOwnerTypeName)
	}

	methods := interfaceMethods(iface)
	ownerOf, ok := methods["OwnerOf"]
	if !ok {
		names := make([]string, 0, len(methods))
		for n := range methods {
			names = append(names, n)
		}
		t.Fatalf("%s declares methods %v but no OwnerOf. tasks.md 6.5 names the method exactly: "+
			"OwnerOf(ctx, collection, actorId) (corpId string, err error)", actorOwnerTypeName, names)
	}
	if len(methods) != 1 {
		t.Errorf("%s declares %d methods; it is a single-method resolution seam (OwnerOf) — anything else on it "+
			"is a second responsibility the requirement does not ask for", actorOwnerTypeName, len(methods))
	}

	params := flattenFieldTypes(ownerOf.Params)
	results := flattenFieldTypes(ownerOf.Results)
	if !equalStrings(params, wantOwnerOfParams) {
		t.Errorf("%s.OwnerOf takes (%s), want (%s) — the collection parameter is what lets action resolve an "+
			"actor's owner generically, without importing the verb package the actor lives in "+
			"(Action.ActorCollection is the field that feeds it)",
			actorOwnerTypeName, strings.Join(params, ", "), strings.Join(wantOwnerOfParams, ", "))
	}
	if !equalStrings(results, wantOwnerOfResults) {
		t.Errorf("%s.OwnerOf returns (%s), want (%s) — a corporation id and an error",
			actorOwnerTypeName, strings.Join(results, ", "), strings.Join(wantOwnerOfResults, ", "))
	}
}

// TestActorOwner_Seam_IsInjectedIntoTheHandler is the other half of the
// contract: a declared-but-unwired interface is one of the five "correct,
// unit-tested, green, and called by nothing" units this chain has already
// found. tasks.md 6.5 says the seam is injected INTO action.Handler, so the
// Handler struct must carry it as a field.
func TestActorOwner_Seam_IsInjectedIntoTheHandler(t *testing.T) {
	decls := parseActionPackage(t)

	handler, ok := decls.structs["Handler"]
	if !ok {
		t.Fatalf("backend/action declares no `type Handler struct` in its production source — this test's own scan " +
			"target is missing, which means it is checking nothing")
	}
	for _, field := range handler.Fields.List {
		if renderType(field.Type) == actorOwnerTypeName {
			return
		}
	}
	var have []string
	for _, field := range handler.Fields.List {
		have = append(have, renderType(field.Type))
	}
	t.Fatalf("action.Handler carries fields of types %v — none of them is %s. tasks.md 6.5: \"inject an "+
		"ActorOwner{...} into action.Handler, wired in router.go from the fleet service\". A seam declared but "+
		"never held by the handler is a seam nothing resolves through: the four endpoints would keep serving every "+
		"authenticated caller.", have, actorOwnerTypeName)
}

// TestActorOwner_Seam_HasAWiringPointForTheCompositionRoot pins the third
// piece: router.go must be able to SUPPLY the seam. A field with no
// constructor parameter and no setter can only ever be nil in production.
func TestActorOwner_Seam_HasAWiringPointForTheCompositionRoot(t *testing.T) {
	decls := parseActionPackage(t)
	if _, ok := decls.interfaces[actorOwnerTypeName]; !ok {
		t.Fatalf("no `type %s interface` in backend/action, so there is nothing for the composition root to "+
			"supply. (Deliberately a failure and not a skip: a self-skipping test is the one shape that lets a "+
			"missing seam read as green.)", actorOwnerTypeName)
	}
	for _, fn := range decls.funcs {
		if fn.Type.Params == nil {
			continue
		}
		for _, p := range fn.Type.Params.List {
			if renderType(p.Type) == actorOwnerTypeName {
				return
			}
		}
	}
	t.Fatalf("no function or method in backend/action takes an %s parameter, so router.go has no way to supply "+
		"one and the handler's seam can only ever be nil. Add it to a constructor (NewHandler/NewHandlerWith) or "+
		"a With%s setter.", actorOwnerTypeName, actorOwnerTypeName)
}

// --- AST plumbing -----------------------------------------------------------

type actionPackageDecls struct {
	interfaces map[string]*ast.InterfaceType
	structs    map[string]*ast.StructType
	funcs      []*ast.FuncDecl
}

func parseActionPackage(t *testing.T) actionPackageDecls {
	t.Helper()
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", actorOwnerSeamProductionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	out := actionPackageDecls{
		interfaces: map[string]*ast.InterfaceType{},
		structs:    map[string]*ast.StructType{},
	}
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			for _, decl := range file.Decls {
				switch d := decl.(type) {
				case *ast.FuncDecl:
					out.funcs = append(out.funcs, d)
				case *ast.GenDecl:
					for _, spec := range d.Specs {
						ts, ok := spec.(*ast.TypeSpec)
						if !ok {
							continue
						}
						switch typ := ts.Type.(type) {
						case *ast.InterfaceType:
							out.interfaces[ts.Name.Name] = typ
						case *ast.StructType:
							out.structs[ts.Name.Name] = typ
						}
					}
				}
			}
		}
	}
	if len(out.funcs) == 0 || len(out.structs) == 0 {
		t.Fatalf("the AST scan of backend/action found %d funcs and %d struct types — the scan itself is broken; "+
			"it must not report success", len(out.funcs), len(out.structs))
	}
	return out
}

func interfaceMethods(iface *ast.InterfaceType) map[string]*ast.FuncType {
	out := map[string]*ast.FuncType{}
	if iface.Methods == nil {
		return out
	}
	for _, m := range iface.Methods.List {
		ft, ok := m.Type.(*ast.FuncType)
		if !ok {
			continue
		}
		for _, name := range m.Names {
			out[name.Name] = ft
		}
	}
	return out
}

// flattenFieldTypes expands `(ctx context.Context, collection, actorId string)`
// into ["context.Context", "string", "string"] — one entry per parameter,
// not per grouped declaration.
func flattenFieldTypes(fl *ast.FieldList) []string {
	if fl == nil {
		return nil
	}
	var out []string
	for _, f := range fl.List {
		rendered := renderType(f.Type)
		n := len(f.Names)
		if n == 0 {
			n = 1
		}
		for i := 0; i < n; i++ {
			out = append(out, rendered)
		}
	}
	return out
}

func renderType(e ast.Expr) string {
	var buf bytes.Buffer
	if err := format.Node(&buf, token.NewFileSet(), e); err != nil {
		return "<unrenderable>"
	}
	return buf.String()
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
