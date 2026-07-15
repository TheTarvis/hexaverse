package action

import (
	"context"
	"errors"
	"testing"

	"hexaverse/common"

	"github.com/google/uuid"
)

// noopResolver is a minimal registered effect so Commit accepts the type.
func noopResolver(context.Context, Resolution) (ResolveResult, error) {
	return ResolveResult{Outcome: "ok"}, nil
}

// TestCommit_TwoChannelsCoexist pins #0006 Decision #19: movement and sensor
// are separate single-slot channels on the same actor. A fleet mid-burn can
// commit a scan (different channel), but a second action on an occupied
// channel is rejected, and cancel releases exactly its own channel's slot.
//
// Spec: 0006/S4
func TestCommit_TwoChannelsCoexist(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "actions", "fleets")

	ctx := context.Background()
	clk := &fakeClock{}
	svc := NewServiceWith(NewDaoWith(fs, clk), clk, nil)
	svc.RegisterResolver("move-t", KindKinematic, noopResolver)
	svc.RegisterResolver("scan-t", KindMutating, noopResolver)

	fleetID := "fleet-" + uuid.NewString()
	if err := fs.Set(ctx, "fleets", fleetID, map[string]interface{}{"id": fleetID}); err != nil {
		t.Fatalf("seed fleet: %v", err)
	}

	move, err := svc.Commit(ctx, CommitSpec{
		Type: "move-t", Actor: fleetID, ActorCollection: "fleets",
		Scope: "sys-1", Eta: 1_000, Slot: SlotMovement,
	})
	if err != nil {
		t.Fatalf("movement commit: %v", err)
	}

	// The sensor channel is free while the movement channel is claimed.
	scan, err := svc.Commit(ctx, CommitSpec{
		Type: "scan-t", Actor: fleetID, ActorCollection: "fleets",
		Scope: "sys-1", Eta: 2_000, Slot: SlotSensor,
	})
	if err != nil {
		t.Fatalf("sensor commit while movement is running: %v (channels must be independent)", err)
	}

	// Each channel is still single-slot.
	if _, err := svc.Commit(ctx, CommitSpec{
		Type: "scan-t", Actor: fleetID, ActorCollection: "fleets",
		Scope: "sys-1", Eta: 3_000, Slot: SlotSensor,
	}); !errors.Is(err, ErrActiveActionExists) {
		t.Fatalf("second sensor commit = %v, want ErrActiveActionExists", err)
	}

	// The actor doc carries both claims independently.
	doc, err := fs.Get(ctx, "fleets", fleetID)
	if err != nil {
		t.Fatalf("read actor: %v", err)
	}
	data := doc.Data()
	if data[SlotMovement] != move.Id {
		t.Errorf("movement slot = %v, want %s", data[SlotMovement], move.Id)
	}
	if data[SlotSensor] != scan.Id {
		t.Errorf("sensor slot = %v, want %s", data[SlotSensor], scan.Id)
	}

	// Cancelling the scan releases the sensor slot — and only that one.
	if _, err := svc.Cancel(ctx, scan.Id, nil); err != nil {
		t.Fatalf("cancel scan: %v", err)
	}
	doc, err = fs.Get(ctx, "fleets", fleetID)
	if err != nil {
		t.Fatalf("re-read actor: %v", err)
	}
	data = doc.Data()
	if got, _ := data[SlotSensor].(string); got != "" {
		t.Errorf("sensor slot after cancel = %q, want released", got)
	}
	if data[SlotMovement] != move.Id {
		t.Errorf("movement slot must survive a sensor cancel, got %v", data[SlotMovement])
	}

	// A released channel accepts a fresh claim.
	if _, err := svc.Commit(ctx, CommitSpec{
		Type: "scan-t", Actor: fleetID, ActorCollection: "fleets",
		Scope: "sys-1", Eta: 4_000, Slot: SlotSensor,
	}); err != nil {
		t.Fatalf("recommit on released sensor slot: %v", err)
	}
}
