package fleet

// RED-phase test for openspec change replace-observation-with-sightings §5,
// task 5.9 (specs/focused-scan/spec.md "Cancelling a Sweep Releases the
// Slot, Mints Nothing, and Ends Emission" — "The fleet-level cancel endpoint
// never touches a running sweep").
//
// This exercises the ALREADY-SHIPPED `Service.Cancel` (service.go) exactly
// as it stands today — no new Scan-commit machinery is needed to observe
// this property, since Cancel's own body only ever reads/writes
// State/AttachedTo/ActiveActionId. The only reason this is red today is
// that `Fleet.Scan`/`ScanWindow` (task 5.1) do not exist yet — once they
// do, this documents (and permanently guards) that Cancel's existing
// movement-channel-only behavior extends correctly to the new field without
// requiring Cancel itself to change.
//
// CONTRACT this file assumes: `Fleet.Scan *ScanWindow{HostId, DepartMs,
// ArriveMs, Range}` (tasks.md 5.1's own literal field list) and
// `Fleet.ActiveScanId` (already declared today, per channels_test.go).

import (
	"context"
	"testing"

	"go.uber.org/mock/gomock"
)

// Scenario: The fleet-level cancel endpoint never touches a running sweep —
// exercised against a fleet with BOTH a running movement-channel burn and a
// running sensor-channel sweep. POST /v1/fleets/:fleetId/cancel must
// cancel only the burn; the sweep's slot, window, and host must survive
// completely untouched.
func TestCancel_Scenario_FleetLevelCancelNeverTouchesARunningSweep(t *testing.T) {
	clk := &fakeClock{now: 10_000}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	f := freshParkedFleet()
	f.ActiveActionId = "action_burn_running"
	f.ActiveScanId = "action_scan_running"
	f.Scan = &ScanWindow{HostId: "host-1", DepartMs: 9_000, ArriveMs: 20_000, Range: 30}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	got, err := svc.Cancel(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}

	if got.ActiveScanId != "action_scan_running" {
		t.Errorf("ActiveScanId = %q after POST .../cancel, want the untouched %q — the movement-channel cancel "+
			"endpoint must never release the sensor-channel slot", got.ActiveScanId, "action_scan_running")
	}
	if got.Scan == nil || got.Scan.HostId != "host-1" || got.Scan.ArriveMs != 20_000 {
		t.Errorf("Scan = %+v after POST .../cancel, want the untouched running sweep window", got.Scan)
	}
	for _, cancelled := range fa.cancelled {
		if cancelled == "action_scan_running" {
			t.Fatalf("the running sweep's action %q was cancelled through the fleet-level cancel endpoint; "+
				"it is releasable only through its own POST /v1/actions/:actionId/cancel", cancelled)
		}
	}
	if len(fa.cancelled) != 1 || fa.cancelled[0] != "action_burn_running" {
		t.Errorf("cancelled actions = %v, want exactly the running burn %q cancelled", fa.cancelled, "action_burn_running")
	}
}
