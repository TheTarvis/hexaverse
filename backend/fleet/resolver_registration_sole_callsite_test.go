package fleet

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 6.2 — "Add an AST-scan test, in the same species as
// purity_test.go, asserting RegisterResolvers is the package's sole
// action.RegisterResolver call site."
//
// It is the structural half of task 6.1's landmine ("delete resolver
// registration from the constructor entirely — registration belongs at the
// composition root, not as a constructor side effect"; design.md Decision 22,
// "the byte-for-byte recurrence of the bug fixed in 3bcc726"). A behavioural
// test cannot catch this class: a constructor-side registration is not wrong
// in what it does, it is wrong in WHERE it lives — it silently wires a
// SECOND, partial resolver table (burn only; no jump, no scan) onto a
// throwaway action.Service, so any caller that reaches production through
// that constructor gets a fleet that cannot resolve a jump or a sweep at all,
// and every test that constructs its own service never notices.
//
// The historical offender was the zero-argument fleet.NewService(), itself
// deleted by task 6.3 (its absence is locked by jump_deletion_test.go's
// TestPackage_Scenario_ZeroDependencyConstructorsAreAbsent). This test stays
// because the RULE outlives that one function: it binds every constructor
// this package has now or grows later, including NewServiceWith.
//
// SDET DEVIATION FROM THE TASK'S LITERAL WORDING — READ BEFORE "FIXING" A
// FAILURE HERE. tasks.md 6.2 says "sole" call site, naming RegisterResolvers
// alone. That wording predates §5: task 5.8 deliberately landed a SECOND
// registration entry point, RegisterScanResolver (resolver.go), whose own
// doc comment records the reason ("kept as its own function, separate from
// RegisterResolvers, so router.go's composition root can supply the
// ShipSource dependency ... without changing RegisterResolvers' own
// established two-argument shape"), and router.go calls both from the
// composition root. A literal one-function check would therefore fail on
// production code §5 shipped on purpose, and the obvious way to make it pass
// — folding RegisterScanResolver into RegisterResolvers — would undo a
// documented §5 decision that no scenario asks to revisit. The rule this
// test encodes is the rule tasks 6.1/6.2 are actually about: a call to
// action.Service.RegisterResolver may appear ONLY inside this package's
// dedicated, composition-root-invoked registration functions, and NEVER
// inside a constructor or any other function. The deviation is escalated in
// the SDET handoff report rather than silently absorbed.
//
// WAS RED WHEN WRITTEN: fleet/service.go's zero-argument NewService() called
// actions.RegisterResolver(burnType, ...) directly from the constructor body.
// Task 6.1 deleted that call and task 6.3 deleted the constructor itself; this
// test is now the standing regression net against either coming back.

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"sort"
	"strings"
	"testing"
)

func registrationScanProductionFilesOnly(fi fs.FileInfo) bool {
	return !strings.HasSuffix(fi.Name(), "_test.go")
}

// registrationEntryPoints is the complete set of top-level functions in this
// package permitted to call action.Service.RegisterResolver. All are
// invoked exclusively from router.go's composition root; neither is a
// constructor. Survey adds a distinct sensor-channel verb in the discovery-naming spec. Adding a name here is a deliberate act that must be justified
// by a spec decision, exactly as RegisterScanResolver's own doc comment
// justifies its existence.
var registrationEntryPoints = map[string]bool{
	"RegisterResolvers":      true,
	"RegisterSurveyResolver": true,
	"RegisterScanResolver":   true,
}

// registerResolverCallSite is one `<something>.RegisterResolver(...)` call
// found in this package's production source.
type registerResolverCallSite struct {
	enclosingFunc string // "" when the call is not inside a top-level func body
	file          string
	line          int
}

func (c registerResolverCallSite) String() string {
	where := c.enclosingFunc
	if where == "" {
		where = "<not inside any top-level function>"
	}
	return fmt.Sprintf("%s:%d (inside %s)", c.file, c.line, where)
}

// Task 6.2 (design.md Decision 22): registration is a composition-root act,
// never a constructor side effect.
func TestRegisterResolver_Scenario_OnlyTheDedicatedRegistrationFunctionsRegister(t *testing.T) {
	sites := scanRegisterResolverCallSites(t)

	// Non-vacuity: if the scan finds nothing at all, either the package stopped
	// registering resolvers (a far bigger regression) or this test's own scan
	// broke. Either way it must not report success.
	if len(sites) == 0 {
		t.Fatalf("found ZERO `.RegisterResolver(...)` call sites in backend/fleet's production source — this test " +
			"is checking nothing. fleet must register at least burn, jump (RegisterResolvers) and scan " +
			"(RegisterScanResolver); if those moved, this scan needs updating, not deleting")
	}

	var offenders []string
	seenEntryPoints := map[string]bool{}
	for _, s := range sites {
		if registrationEntryPoints[s.enclosingFunc] {
			seenEntryPoints[s.enclosingFunc] = true
			continue
		}
		offenders = append(offenders, s.String())
	}

	if len(offenders) > 0 {
		sort.Strings(offenders)
		t.Errorf("tasks.md 6.1/6.2 (design.md Decision 22 — the byte-for-byte recurrence of the bug fixed in "+
			"3bcc726): action.Service.RegisterResolver is called from %d place(s) outside this package's "+
			"dedicated registration entry points %v:\n  %s\n"+
			"Resolver registration belongs at the composition root (router.go calls RegisterResolvers and "+
			"RegisterScanResolver), never as a side effect of a constructor: a constructor-side registration "+
			"silently builds a SECOND, PARTIAL resolver table (today: burn only — no jumpType, no scanType) on a "+
			"throwaway action.Service, so anything wired through it cannot resolve a jump or a sweep at all. "+
			"Fix by DELETING the offending call (task 6.1's wording: \"delete resolver registration from the "+
			"constructor entirely — never delegate to RegisterResolvers from inside it\"), not by adding its "+
			"enclosing function to registrationEntryPoints.",
			len(offenders), sortedKeys(registrationEntryPoints), strings.Join(offenders, "\n  "))
	}

	// The entry points must actually still register something — otherwise a
	// developer could satisfy the rule above by deleting every registration.
	for name := range registrationEntryPoints {
		if !seenEntryPoints[name] {
			t.Errorf("registration entry point %q contains no `.RegisterResolver(...)` call — the allow-listed "+
				"function is either gone or no longer registers anything, which would leave its action type(s) "+
				"undispatchable in production", name)
		}
	}
}

// TestRegisterResolver_Scenario_NoConstructorRegistersAResolver names the
// specific landmine tasks.md 6.1 describes, so a reader grepping for the
// constructor bug finds an assertion about it by name rather than having to
// infer it from the allow-list above. Deliberately overlapping with that
// test: this one reports the failure in the vocabulary of the defect
// ("a constructor registers a resolver"), the other in the vocabulary of the
// rule ("registration happens outside a registration function").
func TestRegisterResolver_Scenario_NoConstructorRegistersAResolver(t *testing.T) {
	for _, s := range scanRegisterResolverCallSites(t) {
		if strings.HasPrefix(s.enclosingFunc, "New") {
			t.Errorf("tasks.md 6.1: the constructor %s registers an action resolver at %s:%d. A constructor that "+
				"registers resolvers wires a partial table (burn only — jumpType and scanType are missing here) "+
				"onto an action.Service the composition root never sees. Delete the registration; router.go is "+
				"the only place that may register.", s.enclosingFunc, s.file, s.line)
		}
	}
}

// scanRegisterResolverCallSites parses backend/fleet's production source and
// returns every `<expr>.RegisterResolver(...)` call it contains, tagged with
// the top-level function (or method) whose body encloses it.
func scanRegisterResolverCallSites(t *testing.T) []registerResolverCallSite {
	t.Helper()
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", registrationScanProductionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	var out []registerResolverCallSite
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok || fn.Body == nil {
					continue
				}
				ast.Inspect(fn.Body, func(n ast.Node) bool {
					call, ok := n.(*ast.CallExpr)
					if !ok {
						return true
					}
					sel, ok := call.Fun.(*ast.SelectorExpr)
					if !ok || sel.Sel.Name != "RegisterResolver" {
						return true
					}
					out = append(out, registerResolverCallSite{
						enclosingFunc: fn.Name.Name,
						file:          name,
						line:          fset.Position(call.Pos()).Line,
					})
					return true
				})
			}
		}
	}
	return out
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
