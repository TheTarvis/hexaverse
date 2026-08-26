package fleet

import (
	"context"
	"errors"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/observation"

	"go.uber.org/mock/gomock"
)

// TestScan_CommitOnSensorChannel: the scan verb commits through the spine on
// the SENSOR channel — origin system AND emission cell pinned in params
// (#0006 Decision #26), eta = now + duration — and claims the fleet's scan
// slot. No aim: the sweep is all-around (#0006 Decision #21).
func TestScan_CommitOnSensorChannel(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(coastFleetAtCentre(), nil)

	f, err := svc.Scan(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if fa.committed == nil || fa.committed.Type != scanType {
		t.Fatalf("expected a scan commit, got %+v", fa.committed)
	}
	if fa.committed.Slot != action.SlotSensor {
		t.Fatalf("scan committed on slot %q, want the sensor channel %q", fa.committed.Slot, action.SlotSensor)
	}
	if fa.committed.Params["systemId"] != "sys-0" {
		t.Fatalf("scan params must pin the origin system, got %v", fa.committed.Params)
	}
	// The wire/action-dispatch shape: origin must be the ENCODED {ring,slot}
	// map (board.EncodeCell), never a raw board.Cell struct — a raw struct in
	// Params is exactly what action.Commit's allowlist now rejects
	// (action-dispatch's Commit Rejects Non-Primitive Action Parameters).
	if _, ok := board.DecodeCell(fa.committed.Params["origin"]); !ok {
		t.Fatalf("scan params must pin the emission cell as an encoded {ring,slot} map (#0006 Decision #26), got %v (%T)", fa.committed.Params["origin"], fa.committed.Params["origin"])
	}
	if want := clk.now.Add(observation.DefaultScanParams().Duration); fa.committed.Eta != want {
		t.Fatalf("eta = %d, want now + scan duration = %d", fa.committed.Eta, want)
	}
	if f.ActiveScanId != "action_test" {
		t.Fatalf("expected the scan slot claimed, got %q", f.ActiveScanId)
	}
	if f.ActiveActionId != "" {
		t.Fatalf("a scan must not touch the movement slot, got %q", f.ActiveActionId)
	}
}

// TestScan_WhileBurning: a mid-burn fleet can scan — the sensor channel is
// independent of the movement channel, so the burn keeps running (not
// cancelled, not replaced) while the scan commits beside it.
//
// Spec: 0006/S3
func TestScan_WhileBurning(t *testing.T) {
	clk := &fakeClock{now: 1_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		ActiveActionId: "action_burn",
		State: board.MovementState{Mode: board.ModeBurn, Burn: &board.Burn{
			Path:       arcPath(board.Cell{Ring: 3, Slot: 0}, board.Cell{Ring: 3, Slot: testSched().Slots(3) / 2}),
			StartTime:  0,
			ArriveTime: 60_000,
		}},
	}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil)

	f, err := svc.Scan(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("a burning fleet must be able to scan: %v", err)
	}
	if len(fa.cancelled) != 0 {
		t.Fatalf("scanning must not cancel the running burn, cancelled %v", fa.cancelled)
	}
	if f.ActiveActionId != "action_burn" {
		t.Fatalf("movement slot must survive the scan commit, got %q", f.ActiveActionId)
	}
	if f.ActiveScanId != "action_test" {
		t.Fatalf("expected the scan slot claimed, got %q", f.ActiveScanId)
	}
	// The emission cell is where the burn HAS the ship at commit — pinned there
	// (#0006 Decision #26), not re-read at eta.
	wantOrigin, _ := board.ShipPos(board.StateAt(burning.State, clk.now, testSched()), clk.now, testSched())
	got, ok := board.DecodeCell(fa.committed.Params["origin"])
	if !ok || got != wantOrigin {
		t.Fatalf("scan origin (decoded) = %v ok=%v, want the mid-burn position at commit %v — encoded via board.EncodeCell, per action-dispatch's Params allowlist", got, ok, wantOrigin)
	}
}

// TestScan_RejectsMidLane: a fleet out on a lane has no system around it —
// nothing to sweep.
func TestScan_RejectsMidLane(t *testing.T) {
	clk := &fakeClock{now: 5_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	held := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: board.MovementState{Mode: board.ModeLaneHold,
			LaneHold: &board.LaneHold{From: "sys-0", To: "sys-1", Fraction: 0.5}},
	}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(held, nil)

	if _, err := svc.Scan(context.Background(), "fleet_1"); err != ErrNotOnBoard {
		t.Fatalf("scan mid-lane: err = %v, want ErrNotOnBoard", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected scan must not commit, got %+v", fa.committed)
	}
}

// TestScan_ResolvesFinishedScanBeforeCommitting: a scan whose eta passed while
// nobody read the fleet still holds the sensor slot (resolution is
// read-triggered, #0005). A new scan commit must run the fold first — settling
// the finished sweep and freeing the slot — instead of 409ing on the stale
// claim. The mirror of orderBurn's arrived-order rule, on the sensor channel.
func TestScan_ResolvesFinishedScanBeforeCommitting(t *testing.T) {
	clk := &fakeClock{now: 100_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// First load: the stale claim from the finished sweep. The resolve fold
	// (fakeActions records it) frees the slot; the re-read returns the settled doc.
	stale := coastFleetAtCentre()
	stale.ActiveScanId = "action_old_scan"
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(stale, nil)
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(coastFleetAtCentre(), nil)

	f, err := svc.Scan(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("a finished scan must not block the next one: %v", err)
	}
	if len(fa.resolved) != 1 || fa.resolved[0] != "fleet_1" {
		t.Fatalf("expected the due-action fold to run for the fleet, got %v", fa.resolved)
	}
	if fa.committed == nil || fa.committed.Type != scanType {
		t.Fatalf("expected the new scan committed after the fold, got %+v", fa.committed)
	}
	if f.ActiveScanId != "action_test" {
		t.Fatalf("expected the fresh scan claimed, got %q", f.ActiveScanId)
	}
}

// TestScan_LeavesRunningScanToTheSlotGuard: the fold is a no-op for a scan
// short of its eta (the fake frees nothing), so a genuinely-running scan still
// lands on the spine's single-slot guard — the 409 keeps meaning "actually
// scanning", never "stale claim".
func TestScan_LeavesRunningScanToTheSlotGuard(t *testing.T) {
	clk := &fakeClock{now: 5_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	running := coastFleetAtCentre()
	running.ActiveScanId = "action_running_scan"
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(running, nil).Times(2)
	fa.commitErr = action.ErrActiveActionExists

	if _, err := svc.Scan(context.Background(), "fleet_1"); !errors.Is(err, action.ErrActiveActionExists) {
		t.Fatalf("err = %v, want the spine's ErrActiveActionExists", err)
	}
}
