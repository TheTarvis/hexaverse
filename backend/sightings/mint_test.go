package sightings

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 3.3 — deterministic document paths so a retried resolve
// transaction converges rather than duplicating (design.md Decision 13, 17;
// specs/sighting-records/spec.md — "A Sighting Is Minted In the Resolve
// Transaction, Exactly Once").
//
// EXPECTED TO FAIL ON FIRST RUN: compile error — MintWrites does not exist
// (backend/sightings has no production files at all yet).
//
// CONTRACT THIS FILE PINS (design.md Decision 13, verbatim):
//
//	MintWrites(cid, actionId string, records []Sighting) []action.DocWrite
//
// building one action.DocWrite per record at:
//   - corporations/{cid}/sightings/{actionId}_{targetId}   (composition record)
//   - corporations/{cid}/sightings/{actionId}_clean         (clean-sweep record)
//
// so that action's own resolve-transaction machinery (action/dao.go's
// ResolveOne: `tx.Set(ref, w.Data, firestore.MergeAll)`) applies it
// idempotently on retry. This is the ONLY minting mechanism the package
// exposes — there is deliberately no separate Dao.Create/Set method for a
// sighting record (sighting-records "The mint is never a separate write
// after the transaction"): the sole path into existence for a sighting is a
// resolver's ResolveResult.Writes, which the fleet package's real
// ScanResolver (task 5.8, NOT built in this section) will call in
// production. This file exercises MintWrites and applies its output through
// the same raw Firestore primitive action/dao.go uses, WITHOUT depending on
// fleet or action at all — the store's own exactly-once contract stands on
// its own two feet.
//
// OWED TO §5: the actual DECISION of which sightings to mint (the masked
// chain beneath a swept host, or a clean-sweep marker when nothing is
// masked) is ScanResolver's job, not this package's. No test here can
// exercise "a resolving sweep mints sightings for the chain masked at its
// host" or "an empty host mints a clean-sweep record" as a real, wired path
// — those are the sighting-records/focused-scan scenarios explicitly owed
// to task 5.8 (see the SDET handoff report). What IS tested here is the
// store's side of the contract: given records a resolver decided to mint,
// the deterministic-id/exactly-once/no-side-clock guarantees hold.

import (
	"context"
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
)

// Scenario: A sighting's document id is deterministic
func TestMintWrites_Scenario_DocumentIdIsDeterministic(t *testing.T) {
	rec := Sighting{
		SystemId: "sys-1", TargetId: "fleet_victim", AsOf: 1000,
		Position: space.Vec3{X: 1}, HostId: "gate-sys-2",
	}
	want := "corporations/corp-1/sightings/action_abc_fleet_victim"

	for i := 0; i < 2; i++ {
		writes := MintWrites("corp-1", "action_abc", []Sighting{rec})
		if len(writes) != 1 {
			t.Fatalf("run %d: MintWrites returned %d writes, want 1", i, len(writes))
		}
		got := strings.Join(writes[0].Path, "/")
		if got != want {
			t.Errorf("run %d: doc path = %q, want %q (design.md Decision 13: "+
				"corporations/{cid}/sightings/{actionId}_{targetId})", i, got, want)
		}
	}
}

// Scenario: A clean sweep mints a record with no target (the doc-id half —
// see mint_test.go's file doc comment for the minting-decision half owed to
// §5).
func TestMintWrites_Scenario_CleanSweepDocId(t *testing.T) {
	rec := Sighting{SystemId: "sys-1", AsOf: 1000, CleanSweep: true, HostId: "gate-sys-2"}
	writes := MintWrites("corp-1", "action_xyz", []Sighting{rec})
	if len(writes) != 1 {
		t.Fatalf("MintWrites returned %d writes, want 1", len(writes))
	}
	want := "corporations/corp-1/sightings/action_xyz_clean"
	got := strings.Join(writes[0].Path, "/")
	if got != want {
		t.Errorf("clean-sweep doc path = %q, want %q (design.md Decision 13)", got, want)
	}
}

// Scenario: Records are ordered newest-minted-first (the derivation half) /
// SDET-added determinism guard: two distinct targets in the same resolve
// never collide on a path, and never depend on slice order.
func TestMintWrites_Scenario_DistinctTargetsNeverCollide(t *testing.T) {
	records := []Sighting{
		{TargetId: "fleet_a", AsOf: 1, HostId: "h"},
		{TargetId: "fleet_b", AsOf: 1, HostId: "h"},
	}
	writes := MintWrites("corp-1", "action_multi", records)
	if len(writes) != 2 {
		t.Fatalf("MintWrites returned %d writes, want 2 (one per target)", len(writes))
	}
	paths := map[string]bool{}
	for _, w := range writes {
		p := strings.Join(w.Path, "/")
		if paths[p] {
			t.Fatalf("duplicate doc path %q across distinct targets in one sweep", p)
		}
		paths[p] = true
	}
}

// Scenario: A retried resolve converges instead of duplicating
//
// Applies MintWrites' output TWICE through the exact primitive action's own
// resolve transaction uses (tx.Set with firestore.MergeAll) — modelling a
// transaction whose resolve function ran twice under contention before one
// attempt committed — and confirms exactly one document exists afterward,
// with every provenance/payload field intact.
func TestMintWrites_Scenario_RetriedResolveConverges(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "corporations")

	cid := "corp-" + uuid.NewString()
	rec := Sighting{
		CorporationId: cid,
		ActionId:      "action_retry",
		SystemId:      "sys-9",
		TargetId:      "fleet_victim",
		AsOf:          common.WorldMillis(42_000),
		Position:      space.Vec3{X: 5, Y: 6, Z: 7},
		Velocity:      space.Vec3{X: 0.5, Y: 0, Z: 0},
		Emitting:      true,
		HullCount:     3,
		HullTypes:     []string{"frigate"},
		HostId:        "gate-sys-8",
	}
	writes := MintWrites(cid, "action_retry", []Sighting{rec})
	if len(writes) != 1 {
		t.Fatalf("MintWrites returned %d writes, want 1", len(writes))
	}
	w := writes[0]

	ctx := context.Background()
	applyOnce := func() {
		t.Helper()
		if err := setAtPath(ctx, fs, w.Path, w.Data); err != nil {
			t.Fatalf("applying resolver write at %v: %v", w.Path, err)
		}
	}
	applyOnce() // first attempt of the "transaction"
	applyOnce() // retried attempt — must converge, not duplicate

	dao := NewDaoWithClient(fs)
	got, err := dao.Get(ctx, cid, w.Path[len(w.Path)-1])
	if err != nil {
		t.Fatalf("Get after two applications: %v", err)
	}
	if got == nil {
		t.Fatalf("expected exactly one sighting to exist at the deterministic path after two applications, got none")
	}
	if got.SystemId != rec.SystemId || got.HostId != rec.HostId || got.HullCount != rec.HullCount {
		t.Errorf("round-tripped record = %+v, want provenance/payload matching %+v", got, rec)
	}

	all, _, err := dao.List(ctx, cid, 10, "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("sighting-records \"A retried resolve converges instead of duplicating\": expected exactly ONE "+
			"record at the deterministic path after applying the same resolver write twice, got %d: %+v",
			len(all), all)
	}
}

// setAtPath applies data at an action.DocWrite-shaped path
// (["corporations", cid, "sightings", docId], alternating collection/doc
// segments) using the exact write primitive action/dao.go's ResolveOne uses
// (tx.Set(..., firestore.MergeAll) — merged, not created, so a duplicate
// resolve overwrites with the same state rather than failing). This
// deliberately does NOT import hexaverse/action's private DAO — only the
// public shape of action.DocWrite.Path plus the documented Firestore
// primitive, so this test's fate depends on the STORE's contract, not on
// action's own internals.
func setAtPath(ctx context.Context, fs common.FirestoreService, path []string, data map[string]interface{}) error {
	if len(path)%2 != 0 || len(path) < 2 {
		return errNotAPath(path)
	}
	ref := fs.Collection(path[0]).Doc(path[1])
	for i := 2; i < len(path); i += 2 {
		ref = ref.Collection(path[i]).Doc(path[i+1])
	}
	_, err := ref.Set(ctx, data, firestore.MergeAll)
	return err
}

type pathError struct{ path []string }

func (e pathError) Error() string {
	return "sightings test: malformed DocWrite path: " + strings.Join(e.path, "/")
}
func errNotAPath(path []string) error { return pathError{path} }

// Scenario (SDET-added structural guard; supports sighting-records "A
// clean-sweep record still names the host and the sweep": "an asOf equal to
// the pulse-reach instant... never the world time the resolve transaction
// ran"): MintWrites never stamps or overrides AsOf from a clock — it stores
// exactly the value the caller (the future ScanResolver) computed. This is
// the store-side half of Decision 14's contradiction-fix: whoever calls
// MintWrites owns pulse-reach arithmetic; the store must never quietly
// substitute resolution time, which is exactly the shipped bug design.md
// Decision 14 corrects. Same species as disclosure/purity_test.go's
// no-square-root scan: an AST inspection of the package's own production
// source for a live-clock reference, so the guarantee holds for every
// version of MintWrites there ever is, not just the one under test today.
//
// SDET NOTE ON REDNESS: as with model_test.go's
// TestPackage_Scenario_NoUpdateOrDeletePathExists, this test cannot RUN
// today — the package fails to compile — and is expected to PASS
// IMMEDIATELY once it can, scanning real production source from that point
// on. A permanent structural regression net, not red-phase evidence.
func TestPackage_Scenario_NeverReadsAWallOrWorldClock(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", productionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			for _, imp := range file.Imports {
				path, uqErr := strconv.Unquote(imp.Path.Value)
				if uqErr != nil {
					t.Fatalf("%s: unquoting import: %v", name, uqErr)
				}
				if path == "time" {
					t.Errorf("%s imports \"time\" — the sightings store must never derive AsOf from a wall clock; "+
						"AsOf is stamped by the caller at pulse-reach (design.md Decision 14)", name)
				}
			}
			ast.Inspect(file, func(n ast.Node) bool {
				sel, ok := n.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				id, ok := sel.X.(*ast.Ident)
				if !ok {
					return true
				}
				if id.Name == "common" && sel.Sel.Name == "WorldClock" {
					t.Errorf("%s calls common.WorldClock() — MintWrites must store the caller-supplied AsOf "+
						"verbatim, never recompute it from the world clock at mint time (design.md Decision 14: "+
						"pulse-reach, not resolution time)", name)
				}
				return true
			})
		}
	}
}
