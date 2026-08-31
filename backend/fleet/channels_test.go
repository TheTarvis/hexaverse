package fleet

// RED-phase tests for tasks.md 3.4 — `activeActionId`/`activeScanId` stay
// independently claimable channels, unchanged in mechanism; `ActiveScanId`/
// `action.SlotSensor` stay declared and unwritten in this change (design.md
// Open Question 4; fleet-movement ADDED "Single Kinematic-State Fleet
// Record" — "The sensor channel persists declared and unwritten"; and its
// own text: "a scan can run while a burn is active").

import (
	"context"
	"testing"

	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// Scenario: The sensor channel persists declared and unwritten.
//
// WHEN a fleet is seeded and read back THEN ActiveScanId is present (the
// field exists on the struct — pinned merely by referencing it) and empty,
// and SeedFleet itself never writes a non-empty value to it.
func TestSeedFleet_Scenario_SensorChannelPersistsDeclaredAndUnwritten(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	dao.EXPECT().ListByCorporation(gomock.Any(), "dev-corp").Return(nil, nil)
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).Return(nil)

	bodies := testBodyTable(t, "sys-0", 6.0)
	f, err := svc.SeedFleet(context.Background(), "sys-0", "dev-corp", space.Vec3{X: 30}, bodies.StarSize())
	if err != nil {
		t.Fatalf("SeedFleet: %v", err)
	}
	if f.ActiveScanId != "" {
		t.Fatalf("ActiveScanId = %q on a freshly seeded fleet, want empty — no verb in this change claims the sensor channel", f.ActiveScanId)
	}
}

// Scenario: A scan can run while a burn is active (fleet-movement, "Single
// Kinematic-State Fleet Record"'s own text — the two channels are
// independent). Ordering a burn must neither require ActiveScanId to be
// empty nor clear/modify it — the two claims are orthogonal.
func TestOrderTo_Scenario_BurnCommitsWithAnUnrelatedScanSlotHeld(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	f := freshParkedFleet()
	f.ActiveScanId = "scan_running" // an unrelated, already-claimed sensor slot
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	point := space.Vec3{X: 60}
	got, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point})
	if err != nil {
		t.Fatalf("OrderTo must succeed while an unrelated scan is running: %v", err)
	}
	if got.ActiveScanId != "scan_running" {
		t.Fatalf("ActiveScanId = %q after a burn commit, want the untouched %q — the movement "+
			"channel commit must not disturb the independent sensor channel", got.ActiveScanId, "scan_running")
	}
	if fa.committed == nil || fa.committed.Type != burnType {
		t.Fatalf("expected a burn commit on the movement channel, got %+v", fa.committed)
	}
}
