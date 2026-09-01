package main

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 2.8 — "Delete backend/observation (package, FeatureObservation
// and its DAO paths, tests)." (design.md Decision 1: "The observation-fog-
// and-scan spec and the backend/observation package are deleted.")
//
// This lives at the module root (package main, alongside
// traversability_e2e_test.go / router_jump_wiring_test.go's own established
// convention for tests that must not import the thing they're pinning the
// absence of) rather than inside backend/observation itself, for the obvious
// reason: a test asserting a package's own deletion cannot live inside that
// package, or it deletes itself along with everything else the moment the
// task is done. It also deliberately does NOT `import "hexaverse/observation"`
// — importing it would make this test file itself a reason the package
// can't be deleted.
//
// EXPECTED TO FAIL ON FIRST RUN: backend/observation/ still exists today
// (dao.go, service.go, model.go, params.go, and their tests) — task 2.8 is
// exactly the work that makes this pass.
//
// Mirrors the established source-grep/existence-pinning pattern this
// change's §1 already used (fleet/jump_deletion_test.go,
// system/gates_deletion_test.go): pin an ABSENCE, not a behavior, so the
// test survives however the rehoming into backend/charts is actually shaped.

import (
	"os"
	"testing"
)

func TestBackendObservationPackageIsDeleted(t *testing.T) {
	info, err := os.Stat("observation")
	if os.IsNotExist(err) {
		return // deleted — the desired end state
	}
	if err != nil {
		t.Fatalf("stat backend/observation: %v", err)
	}
	if info.IsDir() {
		entries, readErr := os.ReadDir("observation")
		var names []string
		if readErr == nil {
			for _, e := range entries {
				names = append(names, e.Name())
			}
		}
		t.Fatalf("backend/observation still exists (%v) — task 2.8 deletes this package outright once its four "+
			"surviving requirements are rehomed into backend/charts (design.md Decision 1)", names)
	}
	t.Fatalf("backend/observation exists as a non-directory entry, want fully absent")
}
