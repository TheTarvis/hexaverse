package sightings

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 3.1/3.2 — the Sighting model itself (specs/sighting-records/
// spec.md — "A Sighting Carries Its Own Provenance", "A Sighting Is
// Immutable and Never Expires", "A Clean Sweep Is a Record").
//
// EXPECTED TO FAIL ON FIRST RUN: compile error — backend/sightings does not
// exist yet (no model.go), so every reference to the Sighting type below is
// undefined. See the SDET handoff report for the exact contract these tests
// pin (field names, JSON/firestore tag shape, deterministic doc-id scheme in
// mint_test.go).
//
// The package's own DESIGN CONTRACT this file assumes (design.md Decisions
// 13/14/16/17, sighting-records spec.md):
//   - Sighting{CorporationId, ActionId, SystemId, TargetId, AsOf, Position,
//     Velocity, Emitting, HullCount, HullTypes, CleanSweep, HostId}
//   - TargetId is stored (firestore) but never serialized to the client
//     (json:"-" or equivalent) — Decision 16.
//   - AsOf is common.WorldMillis, stamped by the CALLER (the future §5
//     ScanResolver) at pulse-reach — this package's own code must never
//     compute or override it from a clock (Decision 14; see mint_test.go's
//     TestMintWrites_Scenario_NeverStampsItsOwnAsOf).
//   - No exported function anywhere in the package's production surface
//     updates, deletes, or invalidates an existing record (sighting-records
//     "There Is No Update or Delete Path").

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

func productionFilesOnly(fi fs.FileInfo) bool { return !strings.HasSuffix(fi.Name(), "_test.go") }

// fixtureSighting builds a fully-populated composition-bearing Sighting for
// field-presence and round-trip assertions.
func fixtureSighting() Sighting {
	return Sighting{
		CorporationId: "corp-alpha",
		ActionId:      "action_scan-1",
		SystemId:      "sys-42",
		TargetId:      "fleet_victim-99",
		AsOf:          common.WorldMillis(123_456),
		Position:      space.Vec3{X: 10, Y: 20, Z: 30},
		Velocity:      space.Vec3{X: 1, Y: 2, Z: 3},
		Emitting:      true,
		HullCount:     4,
		HullTypes:     []string{"frigate", "hauler"},
		CleanSweep:    false,
		HostId:        "gate-sys-7",
	}
}

// Scenario: A minted sighting carries its system
// Scenario: A minted sighting carries its provenance fields
// Scenario: A minted sighting carries its kinematic and composition payload
func TestSighting_Scenario_CarriesSystemProvenanceAndPayload(t *testing.T) {
	s := fixtureSighting()

	if s.SystemId != "sys-42" {
		t.Errorf("SystemId = %q, want the system the sighting was minted in", s.SystemId)
	}
	if s.CorporationId != "corp-alpha" {
		t.Errorf("CorporationId = %q, want the minting corporation", s.CorporationId)
	}
	if s.ActionId != "action_scan-1" {
		t.Errorf("ActionId = %q, want the resolving sweep's action id", s.ActionId)
	}
	if s.AsOf != common.WorldMillis(123_456) {
		t.Errorf("AsOf = %d, want the stamped pulse-reach world time", s.AsOf)
	}
	if s.Position != (space.Vec3{X: 10, Y: 20, Z: 30}) {
		t.Errorf("Position = %+v, want the frozen target position at AsOf", s.Position)
	}
	if s.Velocity != (space.Vec3{X: 1, Y: 2, Z: 3}) {
		t.Errorf("Velocity = %+v, want the frozen target velocity at AsOf", s.Velocity)
	}
	if !s.Emitting {
		t.Errorf("Emitting = false, want true (frozen composition payload)")
	}
	if s.HullCount != 4 {
		t.Errorf("HullCount = %d, want 4", s.HullCount)
	}
	if len(s.HullTypes) != 2 || s.HullTypes[0] != "frigate" || s.HullTypes[1] != "hauler" {
		t.Errorf("HullTypes = %v, want [frigate hauler]", s.HullTypes)
	}
}

// Scenario: The target id is stored but never serialized to the client
//
// A pure marshal test, independent of the handler — the guarantee belongs to
// the TYPE, not to any one caller of it, so a future handler that forgets to
// scrub the field is caught here regardless of which endpoint it's wired to.
func TestSighting_Scenario_TargetIdNeverSerializedToTheClient(t *testing.T) {
	s := fixtureSighting()
	if s.TargetId == "" {
		t.Fatal("test setup: fixtureSighting must set a non-empty TargetId for this assertion to mean anything")
	}

	b, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("json.Marshal(Sighting): %v", err)
	}
	body := string(b)

	if strings.Contains(body, s.TargetId) {
		t.Errorf("sighting-records \"The target id is stored but never serialized to the client\": the marshaled "+
			"JSON contains the literal target id %q — the response must carry no field identifying the target by "+
			"id. Marshaled: %s", s.TargetId, body)
	}

	var generic map[string]interface{}
	if err := json.Unmarshal(b, &generic); err != nil {
		t.Fatalf("json.Unmarshal into a generic map: %v", err)
	}
	for k := range generic {
		lower := strings.ToLower(k)
		if strings.Contains(lower, "target") {
			t.Errorf("sighting-records \"The target id is stored but never serialized to the client\": marshaled "+
				"JSON has a key %q — no field may identify the target, by id or otherwise named. Marshaled: %s",
				k, body)
		}
	}

	// The stored (non-wire) representation must still carry it — this is a
	// stored correlation key, not a deleted field (sighting-records "A Sighting
	// Carries Its Own Provenance": "the target id remains present on the
	// stored document"). Asserted via the firestore tag rather than JSON: the
	// struct field itself must still exist and be populated, only its JSON
	// projection is suppressed.
	if s.TargetId != "fleet_victim-99" {
		t.Errorf("TargetId = %q, want the stored value to survive independent of its wire suppression", s.TargetId)
	}
}

// Scenario: A clean sweep mints a record with no target (structural half —
// the MINTING itself is §5 work; see the SDET handoff report's owed-test
// list. This test only pins that the TYPE can represent a clean sweep with
// zero target/composition fields, which mint_test.go's
// TestMintWrites_Scenario_CleanSweepDocId then keys off of.)
func TestSighting_Scenario_CleanSweepCarriesNoTargetOrComposition(t *testing.T) {
	s := Sighting{
		CorporationId: "corp-alpha",
		ActionId:      "action_scan-2",
		SystemId:      "sys-42",
		AsOf:          common.WorldMillis(500),
		CleanSweep:    true,
		HostId:        "gate-sys-7",
	}
	if s.TargetId != "" {
		t.Errorf("a clean-sweep record must carry no target id, got %q", s.TargetId)
	}
	if s.HullCount != 0 || len(s.HullTypes) != 0 {
		t.Errorf("a clean-sweep record must carry no hull composition, got hullCount=%d hullTypes=%v",
			s.HullCount, s.HullTypes)
	}
	if s.HostId != "gate-sys-7" {
		t.Errorf("a clean-sweep record must still name the swept host, got %q", s.HostId)
	}
}

// Scenario: There is no update or delete path
//
// AST-scans the package's PRODUCTION files (test files excluded) for any
// exported top-level function whose name reads as a mutation of an existing
// record. This is the same species as disclosure/purity_test.go.
//
// SDET NOTE ON REDNESS: today this test cannot even RUN — the whole
// sightings package fails to compile (every sibling _test.go file in this
// package references undefined production symbols), so it fails for the
// same shared reason every other test in this package does, not for its
// own logic. Once the package is scaffolded (model.go/dao.go/service.go/
// mint.go exist) and compiles, this test starts exercising REAL production
// source and is expected to PASS IMMEDIATELY and stay passing — a correct
// implementation adds no update/delete function, so there is no
// red-to-green transition to demonstrate here. It is a permanent structural
// regression net (same character as disclosure/never_imports_charts_test.go),
// not red-phase evidence of missing behavior — flagged explicitly per the
// handoff report so it isn't mistaken for one.
func TestPackage_Scenario_NoUpdateOrDeletePathExists(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", productionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	forbiddenPrefixes := []string{"Update", "Delete", "Invalidate", "Remove", "Expire", "Patch", "Set"}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok || fn.Recv != nil || !fn.Name.IsExported() {
					continue // methods on non-exported receivers are covered by the Dao being unexported; only
					// package-level exported functions are the "public surface" the scenario means.
				}
				for _, bad := range forbiddenPrefixes {
					if strings.HasPrefix(fn.Name.Name, bad) {
						t.Errorf("%s: exported function %s reads as a mutation of an existing sighting record — "+
							"sighting-records \"There is no update or delete path\" forbids any such function on "+
							"this package's public surface", name, fn.Name.Name)
					}
				}
			}
		}
	}
}
