package sightings

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 3.1-3.4 (specs/sighting-records/spec.md — "A Sighting Is
// Immutable and Never Expires": "A sighting still reports its minted
// position after the target moves", "No field of a sighting changes after
// it is minted").
//
// EXPECTED TO FAIL ON FIRST RUN: compile error — same undefined symbols as
// the rest of this package (see mint_test.go / dao_test.go).
//
// These exercise the STORE's own read path only: a sighting is seeded once
// (as if minted by a resolving sweep — the seeding technique is
// dao_test.go's seedSighting, itself built on the real MintWrites contract),
// an unrelated "target" document is separately mutated to simulate the
// sighted fleet moving on with its life, and the stored record is read
// TWICE. Nothing in backend/sightings itself re-derives a position live —
// there is no BodySource, no space.StateAt call, nothing to fold — so this
// is as much a structural argument as a behavioral one: the package simply
// has no mechanism BY WHICH a stored record could drift. These tests pin
// that as an observable read-path property rather than leaving it as an
// inference from the package's import list.

import (
	"context"
	"reflect"
	"testing"

	"hexaverse/common"
	"hexaverse/space"

	"github.com/google/uuid"
)

// Scenario: A sighting still reports its minted position after the target
// moves
func TestDao_Scenario_StillReportsMintedPositionAfterTargetMoves(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "corporations", "fleets")

	cid := "corp-" + uuid.NewString()
	targetId := "fleet_" + uuid.NewString()
	mintedPos := space.Vec3{X: 100, Y: 200, Z: 300}

	actionId := "action_" + uuid.NewString()
	rec := Sighting{
		CorporationId: cid, ActionId: actionId, SystemId: "sys-1",
		TargetId: targetId, AsOf: 1_000, Position: mintedPos, HostId: "gate-sys-2",
	}
	writes := MintWrites(cid, actionId, []Sighting{rec})
	if len(writes) != 1 {
		t.Fatalf("MintWrites returned %d writes, want 1", len(writes))
	}
	if err := setAtPath(context.Background(), fs, writes[0].Path, writes[0].Data); err != nil {
		t.Fatalf("seeding the minted sighting: %v", err)
	}

	// Simulate the sighted fleet moving on with its life — a completely
	// separate document the sighting has no reference to reading live.
	if err := fs.Set(context.Background(), "fleets", targetId, map[string]interface{}{
		"id": targetId, "position": map[string]interface{}{"x": 9999.0, "y": 9999.0, "z": 9999.0},
	}); err != nil {
		t.Fatalf("moving the (unrelated, live) target fleet doc: %v", err)
	}

	dao := NewDaoWithClient(fs)
	got, err := dao.Get(context.Background(), cid, writes[0].Path[len(writes[0].Path)-1])
	if err != nil {
		t.Fatalf("Get after the target moved: %v", err)
	}
	if got == nil {
		t.Fatalf("expected the minted sighting to still exist")
	}
	if got.Position != mintedPos {
		t.Errorf("sighting-records \"A sighting still reports its minted position after the target moves\": "+
			"stored Position = %+v after the target's live fleet doc moved, want the frozen minted position %+v",
			got.Position, mintedPos)
	}
}

// Scenario: No field of a sighting changes after it is minted
func TestDao_Scenario_NoFieldChangesBetweenTwoReads(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "corporations")

	cid := "corp-" + uuid.NewString()
	actionId := "action_" + uuid.NewString()
	rec := Sighting{
		CorporationId: cid, ActionId: actionId, SystemId: "sys-1",
		TargetId: "fleet_" + uuid.NewString(), AsOf: 5_000,
		Position: space.Vec3{X: 1, Y: 2, Z: 3}, Velocity: space.Vec3{X: 0.1, Y: 0.2, Z: 0.3},
		Emitting: true, HullCount: 5, HullTypes: []string{"frigate", "hauler"}, HostId: "gate-sys-9",
	}
	writes := MintWrites(cid, actionId, []Sighting{rec})
	if len(writes) != 1 {
		t.Fatalf("MintWrites returned %d writes, want 1", len(writes))
	}
	if err := setAtPath(context.Background(), fs, writes[0].Path, writes[0].Data); err != nil {
		t.Fatalf("seeding the minted sighting: %v", err)
	}

	dao := NewDaoWithClient(fs)
	id := writes[0].Path[len(writes[0].Path)-1]
	first, err := dao.Get(context.Background(), cid, id)
	if err != nil || first == nil {
		t.Fatalf("first Get: got=%v err=%v", first, err)
	}
	second, err := dao.Get(context.Background(), cid, id)
	if err != nil || second == nil {
		t.Fatalf("second Get: got=%v err=%v", second, err)
	}
	if !reflect.DeepEqual(*first, *second) {
		t.Errorf("sighting-records \"No field of a sighting changes after it is minted\": two reads of the same "+
			"record disagree: first=%+v second=%+v", *first, *second)
	}
}
