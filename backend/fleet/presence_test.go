package fleet

import (
	"context"
	"testing"

	"hexaverse/disclosure"
	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// golang-dev-authored unit test for replace-observation-with-sightings §5
// (tasks.md 5.1/5.5/5.9) — no file in the SDET's red suite exercises
// FleetsInSystem's own Scan wiring, so this is written test-first per the
// kickoff's own standing instruction ("write your own table-driven test
// FIRST, see it red, then implement — same discipline at every grain").
//
// Scenario: FleetsInSystem carries a running sweep's window onto the
// disclosure.Ship it builds (proximity-disclosure "A Sweep's Emission
// Radius Scales With Its Range" / focused-scan "A Sweep Emits For Its
// Duration" — a live read must actually see a running sweep, or the
// disclosure-side wiring task 5.1/5.5 landed is computed and never
// consumed).
//
// Scenario: A fleet whose sensor-channel slot has been released — by a
// resolved OR a cancelled sweep — never carries a stale Scan window onto
// the live disclosure.Ship, even if Fleet.Scan itself has not (yet) been
// cleared. This is the property that makes focused-scan's own "Cancelling
// a Sweep... Ends Emission" requirement true end to end: cancellation runs
// through the action-dispatch spine's GENERIC cancel surface (POST
// /v1/actions/:actionId/cancel), which releases ActiveScanId but writes no
// fleet-specific actorState (it cannot — action stays verb-agnostic) and so
// never clears Fleet.Scan itself. ActiveScanId — the single-slot claim — is
// therefore the authoritative "is a sweep actually running" signal a live
// read must gate on; Fleet.Scan is only ever the payload for one that is.
func TestFleetsInSystem_Scenario_ScanWindowWiredOntoDisclosureShip(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	clk := &fakeClock{now: 10_000}

	running := Fleet{
		Id: "f-running", CorporationId: "corp-1", SystemId: "sys-0",
		State:        space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 1}}},
		ActiveScanId: "action_scan_1",
		Scan:         &ScanWindow{HostId: "host-1", DepartMs: 1_000, ArriveMs: 9_000, Range: 30},
	}
	// A slot that has been released (resolved or cancelled) but whose Scan
	// payload was never cleared — the exact shape a generic action cancel
	// leaves behind (dao.Cancel's actorState is always nil for the scan
	// type; see action/handler.go's Cancel).
	stale := Fleet{
		Id: "f-stale", CorporationId: "corp-1", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 2}}},
		Scan:  &ScanWindow{HostId: "host-1", DepartMs: 1_000, ArriveMs: 9_000, Range: 30},
	}
	idle := Fleet{
		Id: "f-idle", CorporationId: "corp-1", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 3}}},
	}

	dao.EXPECT().ListBySystem(gomock.Any(), "sys-0").Return([]Fleet{running, stale, idle}, nil)
	// FleetsInSystem is a read; no jump is on its path, so the GraphSource is
	// the inert loud stub rather than nil (see fakeGraphUnused).
	svc := NewServiceWith(dao, stubBodySourceFixed{}, fakeGraphUnused{}, &fakeActions{}, clk)

	presences, _, err := svc.FleetsInSystem(context.Background(), "sys-0")
	if err != nil {
		t.Fatalf("FleetsInSystem: %v", err)
	}
	byID := map[string]disclosure.Ship{}
	for _, p := range presences {
		byID[p.Id] = p.Ship
	}

	got := byID["f-running"].Scan
	if got == nil {
		t.Fatal("a fleet with a claimed sensor-channel slot carries a nil disclosure.Ship.Scan")
	}
	if got.DepartMs != 1_000 || got.ArriveMs != 9_000 || got.Range != 30 {
		t.Errorf("disclosure.Ship.Scan = %+v, want the fleet's own committed window", got)
	}

	if got := byID["f-stale"].Scan; got != nil {
		t.Errorf("a fleet with NO claimed sensor-channel slot (ActiveScanId empty) carries a non-nil "+
			"disclosure.Ship.Scan = %+v, want nil — ActiveScanId, not the stale Scan payload, is authoritative "+
			"for whether a sweep is actually running (this is what makes a cancelled sweep stop reporting as "+
			"sweeping immediately, since the generic action-cancel surface never clears Fleet.Scan itself)", got)
	}

	if got := byID["f-idle"].Scan; got != nil {
		t.Errorf("a fleet with no stored Scan window at all carries a non-nil disclosure.Ship.Scan = %+v, want nil", got)
	}
}
