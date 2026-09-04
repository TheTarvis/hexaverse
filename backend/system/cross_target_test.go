package system

// Originally the RED suite for openspec change
// pin-system-generation-determinism — the parts of cross-stack-determinism
// and system-interior about reproducing interior generation across Go build
// targets. (The sibling scenarios about the retired second placement tier's
// independence from the continuous stream went with that tier; the fixture
// sweep they shared survives in generate_streams_test.go and
// fixtures_test.go.) The production fix those tests were red against —
// design.md Decision 1's four float64(...) conversions in generator.go — has
// long since landed; this file is the standing regression guard for it.
//
// Covers:
//   - system-interior › "Interior Generation Reproduces Across Build
//     Targets" › "The compiled generator emits zero fused multiply-add
//     instructions"
//   - cross-stack-determinism › "Recorded Cross-Target Values Live In
//     Fixtures, Not Test Constants" › both scenarios
//   - cross-stack-determinism › "A Cross-Target Leg That Cannot Execute
//     Reports Loudly, Not Silently" › the greppable-marker half of the
//     first scenario (the pipeline-execution half of all three scenarios is
//     NOT automatable here — see the RED-handoff report)

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// --- "The compiled generator emits zero fused multiply-add instructions" --

var fmaSiteRe = regexp.MustCompile(`\(([^()]+\.go:[0-9]+)\)`)

// compiledArm64FMASitesForSystem builds ONLY backend/system for GOOS=linux
// GOARCH=arm64 with -gcflags=-S (design.md's own verified command) and
// returns the unique file:line sites where the compiler emitted a fused
// multiply-add — the compiler-output check the requirement names, not a
// value comparison (a passing test suite can dodge divergent inputs;
// design.md Decision 3, task 2.3).
func compiledArm64FMASitesForSystem(t testing.TB, backendDir string) []string {
	t.Helper()
	cmd := exec.Command("go", "build", "-gcflags=-S", "./system/")
	cmd.Dir = backendDir
	cmd.Env = append(os.Environ(), "GOOS=linux", "GOARCH=arm64", "CGO_ENABLED=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go build -gcflags=-S ./system/ (GOOS=linux GOARCH=arm64) failed — this is a build/toolchain problem, not a determinism finding: %v\n%s", err, out)
	}
	seen := map[string]bool{}
	var sites []string
	for _, line := range strings.Split(string(out), "\n") {
		if !strings.Contains(line, "FMADDD") && !strings.Contains(line, "FMSUBD") {
			continue
		}
		m := fmaSiteRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		file := m[1]
		if !strings.Contains(file, "system"+string(filepath.Separator)) {
			continue // this build also compiles system's dependencies (board, galaxy, polar, space, common); scope to system's own sources
		}
		if !seen[file] {
			seen[file] = true
			sites = append(sites, file)
		}
	}
	return sites
}

// Scenario: The compiled generator emits zero fused multiply-add
// instructions.
func TestGenerate_Scenario_CompiledGeneratorEmitsZeroFMA(t *testing.T) {
	sites := compiledArm64FMASitesForSystem(t, "..")
	if len(sites) > 0 {
		t.Fatalf("backend/system emits %d fused-multiply-add instruction site(s) on the arm64 leg, want 0 "+
			"(system-interior: \"The compiled generator emits zero fused multiply-add instructions\"):\n  %s\n"+
			"This is the compiler-output check, not a value comparison — recorded fixture cases can dodge divergent "+
			"inputs (design.md, task 2.3). Fix: wrap each of the four richness products in generator.go (lines 129, "+
			"131, 247, 308) in an explicit float64(...) conversion — assigning the product to a bare local does NOT "+
			"inhibit fusion (design.md Decision 1).",
			len(sites), strings.Join(sites, "\n  "))
	}
}

// --- "...carries no entry in the capability's deviation register" ---------

const determinismRegisterPath = "../../fixtures/determinism-register.json"

type deviationRegisterEntry struct {
	Site string `json:"site"`
	File string `json:"file"`
}

type deviationRegister struct {
	Entries []deviationRegisterEntry `json:"entries"`
}

// Scenario: The compiled generator emits zero fused multiply-add
// instructions — the register-entry half.
func TestGenerate_Scenario_NoDeviationRegisterEntryForSystem(t *testing.T) {
	raw, err := os.ReadFile(determinismRegisterPath)
	if err != nil {
		t.Fatalf("read %s: %v", determinismRegisterPath, err)
	}
	var reg deviationRegister
	if err := json.Unmarshal(raw, &reg); err != nil {
		t.Fatalf("unmarshal %s: %v", determinismRegisterPath, err)
	}
	var found []string
	for _, e := range reg.Entries {
		if e.File == "backend/system/generator.go" {
			found = append(found, e.Site)
		}
	}
	if len(found) > 0 {
		t.Fatalf("fixtures/determinism-register.json still carries %d entr(ies) for backend/system/generator.go, want 0 "+
			"(system-interior: \"backend/system carries no entry in the capability's deviation register\"):\n  %s\n"+
			"Discharging the register is independently verified — check-fma-contraction.sh does NOT fail on a stale "+
			"entry, it only WARNs (design.md Context: 'Registered sites that no longer emit: not a failure'), so this "+
			"assertion — not that script's exit code — is what proves the register was actually cleaned up in the same "+
			"commit as the fix (design.md Decision 3 step 3).",
			len(found), strings.Join(found, "\n  "))
	}
}

// --- "Recorded Cross-Target Values Live In Fixtures, Not Test Constants" --

// digestConstRe matches a Go const declaration whose value looks like a
// hand-copied hex digest (32+ hex characters) assigned directly in source —
// the shape cross-stack-determinism's "A hand-copied digest constant in a
// test file is a violation" names, independent of whether it currently
// reproduces on every build target.
var digestConstRe = regexp.MustCompile(`(?m)^\s*(?:const\s+(\w*[Dd]igest\w*)\s*=|(\w*[Dd]igest\w*)\s*=)\s*"([0-9a-fA-F]{32,})"`)

// Scenario: A hand-copied digest constant in a test file is a violation.
//
// Scans every _test.go file in backend/system (not just
// lattice_identity_test.go by name) for a source-level constant assignment
// whose value looks like a hex digest — the requirement's own wording ("A
// hand-copied digest constant... in that same test file") is about the
// SHAPE of the violation, not about one named file, so this test does not
// hard-code "lattice_identity_test.go" as the only place such a thing could
// reappear.
func TestSystemTestFiles_Scenario_NoHandCopiedDigestConstant(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/system: %v", err)
	}
	var violations []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, "_test.go") {
			continue
		}
		if name == "cross_target_test.go" || name == "fixtures_test.go" {
			continue // this file's own digest-matching regex, and the fixture harness's `digest` JSON field/sweepHash type, are not violations
		}
		raw, err := os.ReadFile(name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		for _, m := range digestConstRe.FindAllStringSubmatch(string(raw), -1) {
			ident := m[1]
			if ident == "" {
				ident = m[2]
			}
			violations = append(violations, name+": "+ident)
		}
	}
	if len(violations) > 0 {
		t.Fatalf("found %d hand-copied digest constant(s) in backend/system test files, want 0 "+
			"(cross-stack-determinism: \"A hand-copied digest constant in a test file is a violation\" — "+
			"this holds regardless of whether the constant currently reproduces on every build target):\n  %s\n"+
			"A package's standing cross-target regression baseline must be a fixture family under fixtures/system/, "+
			"asserted per fixtures_test.go, never a private constant local to one test file.",
			len(violations), strings.Join(violations, "\n  "))
	}
}

// TestLatticeIdentityTest_Scenario_RetiredConstantAndComparisonAreDeleted
// (DELETED) was the RETIREMENT half of the scenario above: it read
// lattice_identity_test.go AS A FILE and asserted that a specific
// hand-copied golden-master digest constant, and the comparison that read
// it, were both gone from it — pinning that a package's cross-target
// regression baseline had migrated from a private test constant to
// fixtures/system/cases.json's interiorElements family.
//
// That file no longer exists: it held only a projection of the retired
// second placement tier and a monotonicity probe on a clamp that is also
// gone, so it was deleted whole. A guard whose subject is a file is
// SATISFIED by that file's deletion, not violated by it — but it cannot say
// so, because os.ReadFile on a missing path is the same t.Fatalf as a
// genuine violation. The name-agnostic half above survives and is the
// stronger form anyway: it scans EVERY test file in this package for a
// hand-copied digest constant, so nothing can reintroduce one under a
// different filename.

// --- "A Cross-Target Leg That Cannot Execute Reports Loudly, Not Silently" -

const gitlabCIPath = "../../.gitlab-ci.yml"

// armLegBlock extracts the qemu-conditional arm64 block from .gitlab-ci.yml
// (bounded, rather than grepping the whole file) so a coincidental
// substring match elsewhere in the pipeline config can never produce a
// false pass.
func armLegBlock(t testing.TB) string {
	t.Helper()
	raw, err := os.ReadFile(gitlabCIPath)
	if err != nil {
		t.Fatalf("read %s: %v", gitlabCIPath, err)
	}
	content := string(raw)
	start := strings.Index(content, "QEMU=$(command -v qemu-aarch64-static")
	if start < 0 {
		t.Fatal(".gitlab-ci.yml's qemu arm64 leg block (starting 'QEMU=$(command -v qemu-aarch64-static') was not found — has it moved or been renamed?")
	}
	end := strings.Index(content[start:], "\n      fi")
	if end < 0 {
		t.Fatal(".gitlab-ci.yml's qemu arm64 leg block has no closing 'fi' within the expected shape")
	}
	return content[start : start+end]
}

// Scenario: An emulated leg missing its runtime reports a named, greppable
// warning.
func TestGitlabCI_Scenario_ArmLegUnassertedMarkerIsGreppableAndNamesPackages(t *testing.T) {
	block := armLegBlock(t)

	const marker = "DETERMINISM ARM64 LEG UNASSERTED"
	if !strings.Contains(block, marker) {
		t.Errorf(".gitlab-ci.yml's qemu arm64 leg fallback does not contain the literal greppable marker %q "+
			"(cross-stack-determinism: \"An emulated leg missing its runtime reports a named, greppable warning\")", marker)
	}
	// The packages the message must name are DERIVED from the leg's own
	// compile lines rather than hard-coded here. The property this scenario
	// pins is "the skip message enumerates the packages the leg actually
	// runs" — a message naming a package the leg does not run is a false
	// enforcement claim, and so is a hard-coded list in this test that has
	// drifted from the leg. Deriving both sides from one source is what makes
	// the assertion mean what the scenario says.
	run := armLegPackages(block)
	if len(run) == 0 {
		t.Fatal(".gitlab-ci.yml's qemu arm64 leg compiles no packages — the leg has no subject, so its skip message cannot be checked")
	}
	marked := block[strings.Index(block, marker):]
	for _, pkg := range run {
		if !strings.Contains(marked, pkg) {
			t.Errorf(".gitlab-ci.yml's qemu arm64 leg RUNS %s but its fallback message does not name it as unchecked", pkg)
		}
	}
	for _, pkg := range armLegNamedInMessage(marked) {
		if !contains(run, pkg) {
			t.Errorf(".gitlab-ci.yml's qemu arm64 leg fallback message names %s as unchecked, but the leg does not run it — "+
				"a skip message naming a package it does not run is a false enforcement claim", pkg)
		}
	}
	if !strings.Contains(block, "infra/docker/build-test-runner.sh") {
		t.Error(".gitlab-ci.yml's qemu arm64 leg fallback does not name the remedy command infra/docker/build-test-runner.sh")
	}
}

// armLegPackages extracts the package paths the qemu arm64 leg actually
// compiles, from its own `go test -c ... ./pkg/` lines.
func armLegPackages(block string) []string {
	var out []string
	for _, line := range strings.Split(block, "\n") {
		if !strings.Contains(line, "go test -c") {
			continue
		}
		for _, f := range strings.Fields(line) {
			if strings.HasPrefix(f, "./") && strings.HasSuffix(f, "/") && !contains(out, f) {
				out = append(out, f)
			}
		}
	}
	return out
}

// armLegNamedInMessage extracts the package paths the fallback message claims
// are unchecked.
func armLegNamedInMessage(message string) []string {
	var out []string
	for _, f := range strings.Fields(message) {
		// Trim surrounding quotes, then trailing punctuation ONLY — a cutset
		// containing '.' would eat the leading dot of "./space/" and make this
		// extraction return nothing at all, which reads as a pass.
		f = strings.Trim(f, "\"'")
		f = strings.TrimRight(f, ",.")
		if strings.HasPrefix(f, "./") && strings.HasSuffix(f, "/") && !contains(out, f) {
			out = append(out, f)
		}
	}
	return out
}

func contains(hay []string, needle string) bool {
	for _, h := range hay {
		if h == needle {
			return true
		}
	}
	return false
}

// Scenario: A degraded leg does not fail the pipeline by itself.
//
// SDET NOTE: verified that this test ALREADY PASSED against the unmodified
// .gitlab-ci.yml when it was written — task 6.1 only ADDED the
// marker/package list/remedy text the test above checks for; it did not
// need to change this property, since the existing skip line already has no
// trailing `exit`. This is therefore a regression GUARD, not a
// new-behavior red test, so a future edit to the fallback branch cannot
// silently turn the skip into a hard failure.
//
// NOT FULLY AUTOMATABLE as a unit test: whether a GitLab CI job's overall exit
// status is forced to fail is a property of the runner executing the YAML
// (the `else` branch's `echo ...` with no following `exit 1` — bash's
// default success exit status), not something inspectable from a checked-
// out file in isolation. The static shape this test CAN assert — that the
// fallback branch contains no explicit `exit 1`/`false`/`exit $ERR`-style
// failure — is asserted here as the closest available proxy; the scenario's
// full claim (the JOB's result) is out of reach without actually running
// the pipeline and is recorded as such in the RED-handoff report.
func TestGitlabCI_Scenario_DegradedLegHasNoExplicitFailureCommand(t *testing.T) {
	block := armLegBlock(t)
	for _, forbidden := range []string{"exit 1", "exit 2", "false", "exit $"} {
		if strings.Contains(block, forbidden) {
			t.Errorf(".gitlab-ci.yml's qemu arm64 leg fallback branch contains %q, which would force the job to fail "+
				"solely because the leg could not execute (cross-stack-determinism: \"A degraded leg does not fail the "+
				"pipeline by itself\")", forbidden)
		}
	}
}
