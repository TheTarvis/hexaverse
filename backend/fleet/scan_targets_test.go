package fleet

// Unit tests for Service.ScanTargets (add-scan-and-sightings-surface,
// tasks.md 3.2/3.3 — now implemented; these are real assertions against the
// shipped production code, added at check.py's request for a colocated
// package test of a new production file, not red-phase evidence).
//
// Mirrors this package's own established fixture pattern (newSvc,
// testBodyTable, orbitingFeature, stubBodySourceFixed) exactly, so these
// tests exercise the SAME BodySource/Dao seams the shipped Scan/ScanTargets
// pair shares (fleet/service.go's scanHostPosition/scanGeometry, task 3.1).

import (
	"context"
	"testing"

	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

func findScanTarget(targets []ScanTarget, hostId string) (ScanTarget, bool) {
	for _, tgt := range targets {
		if tgt.HostId == hostId {
			return tgt, true
		}
	}
	return ScanTarget{}, false
}

// Scenario: Served targets carry the correct kind ("body" for a body,
// "fleet" for an own fleet) and the merged list is ordered ascending by
// hostId (link8b-impl-contract.md §1.1).
func TestScanTargets_Scenario_KindEnumAndAscendingHostIdOrder(t *testing.T) {
	clk := &fakeClock{now: 10_000}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// Two bodies at the SAME radius/period (orbitingFeature's own zero-phase
	// default), so they resolve to the identical position at any given
	// world time — both trivially within range of a scanner placed there.
	bt := testBodyTable(t, "sys-0", 6.0, orbitingFeature("feat-body-z", 40, 2), orbitingFeature("feat-body-a", 40, 2))
	svc.WithBodies(stubBodySourceFixed{bt: bt})

	bodyPos, err := space.Position(bt, "feat-body-z", clk.now)
	if err != nil {
		t.Fatalf("resolving body position: %v", err)
	}

	scanner := &Fleet{
		Id: "scanner-1", CorporationId: "corp-me", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: bodyPos}},
	}
	ownFleet := Fleet{
		Id: "flt-own-mid", CorporationId: "corp-me", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: bodyPos}},
	}
	dao.EXPECT().Get(gomock.Any(), "scanner-1").Return(scanner, nil)
	dao.EXPECT().ListBySystem(gomock.Any(), "sys-0").Return([]Fleet{*scanner, ownFleet}, nil)

	targets, err := svc.ScanTargets(context.Background(), "scanner-1")
	if err != nil {
		t.Fatalf("ScanTargets: %v", err)
	}

	bodyZ, ok := findScanTarget(targets, "feat-body-z")
	if !ok || bodyZ.Kind != ScanTargetKindBody {
		t.Errorf("feat-body-z: kind = %+v, ok=%v, want kind %q", bodyZ, ok, ScanTargetKindBody)
	}
	fleetEntry, ok := findScanTarget(targets, "flt-own-mid")
	if !ok || fleetEntry.Kind != ScanTargetKindFleet {
		t.Errorf("flt-own-mid: kind = %+v, ok=%v, want kind %q", fleetEntry, ok, ScanTargetKindFleet)
	}

	for i := 0; i+1 < len(targets); i++ {
		if targets[i].HostId > targets[i+1].HostId {
			t.Fatalf("targets not ascending by hostId: %+v", targets)
		}
	}
	if len(targets) != 3 {
		t.Fatalf("targets = %+v, want exactly 3 (feat-body-a, feat-body-z, flt-own-mid)", targets)
	}
}

// Scenario (SDET-added, 9.2b/task 3.7's own guarantee): an empty target set
// serves as `[]`, never `nil` — the same guard sightings/handler.go's own
// empty-pile response applies.
func TestScanTargets_Scenario_EmptySetIsNeverNil(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// newSvc's default body table is "sys-0" with only a star — nothing
	// else in reach, and no other fleet in the system.
	scanner := &Fleet{
		Id: "scanner-1", CorporationId: "corp-me", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 100_000}}},
	}
	dao.EXPECT().Get(gomock.Any(), "scanner-1").Return(scanner, nil)
	dao.EXPECT().ListBySystem(gomock.Any(), "sys-0").Return([]Fleet{*scanner}, nil)

	targets, err := svc.ScanTargets(context.Background(), "scanner-1")
	if err != nil {
		t.Fatalf("ScanTargets: %v", err)
	}
	if targets == nil {
		t.Fatalf("ScanTargets returned nil, want a non-nil empty slice")
	}
	if len(targets) != 0 {
		t.Fatalf("targets = %+v, want empty (nothing in reach)", targets)
	}
}

// Scenario: the four exclusions unique to ScanTargets' own filtering — a
// derived belt member, a foreign fleet, an own fleet in lane transit, and
// the scanning fleet's own id — are all absent, while the belt FEATURE
// itself and an ordinary in-range own fleet are present. Runs through the
// SAME scanGeometry/EligibleIds helpers Scan's commit path shares (task
// 3.1), so this is a guard against the two ever drifting apart, not merely
// against ScanTargets alone.
func TestScanTargets_Scenario_ExclusionsThroughTheSharedHelper(t *testing.T) {
	clk := &fakeClock{now: 10_000}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	belt := system.Feature{
		Id: "feat-belt-0", Type: system.FeatureBelt,
		SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "feat-star", Radius: 200, PeriodMs: 500_000}),
		Width:    system.BeltWidthFraction * 200,
	}
	bt := testBodyTable(t, "sys-0", 6.0, belt)
	svc.WithBodies(stubBodySourceFixed{bt: bt})

	beltPos, err := space.Position(bt, "feat-belt-0", clk.now)
	if err != nil {
		t.Fatalf("resolving belt position: %v", err)
	}

	scanner := &Fleet{
		Id: "scanner-1", CorporationId: "corp-me", SystemId: "sys-0",
		// AT the belt's own position: distance 0 guarantees WithinRange
		// passes and Occluded's zero-length-segment early return applies —
		// no star-clearance reasoning needed (the same trick the self-sweep
		// and belt-member e2e fixtures use).
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: beltPos}},
	}
	ownInRange := Fleet{
		Id: "flt-own-inrange", CorporationId: "corp-me", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: beltPos}},
	}
	foreignInRange := Fleet{
		Id: "flt-foreign-inrange", CorporationId: "corp-other", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: beltPos}},
	}
	ownInTransit := Fleet{
		Id: "flt-own-transit", CorporationId: "corp-me", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: beltPos}},
		Jump:  &JumpTransit{LaneId: "lane-x", DestSystemId: "sys-elsewhere", DepartMs: 0, ArriveMs: 999_999_999},
	}
	dao.EXPECT().Get(gomock.Any(), "scanner-1").Return(scanner, nil)
	dao.EXPECT().ListBySystem(gomock.Any(), "sys-0").Return(
		[]Fleet{*scanner, ownInRange, foreignInRange, ownInTransit}, nil,
	)

	targets, err := svc.ScanTargets(context.Background(), "scanner-1")
	if err != nil {
		t.Fatalf("ScanTargets: %v", err)
	}

	if _, ok := findScanTarget(targets, "feat-belt-0"); !ok {
		t.Errorf("the belt feature itself is absent from the served set: %+v", targets)
	}
	if _, ok := findScanTarget(targets, "feat-belt-0#0"); ok {
		t.Errorf("focused-scan \"A belt is served as one host, never as its members\": a derived member "+
			"appeared: %+v", targets)
	}
	if _, ok := findScanTarget(targets, "scanner-1"); ok {
		t.Errorf("focused-scan \"The reading fleet is absent from its own target list\": the scanner's own "+
			"id appeared: %+v", targets)
	}
	if entry, ok := findScanTarget(targets, "flt-own-inrange"); !ok || entry.Kind != ScanTargetKindFleet {
		t.Errorf("an in-range own fleet is absent or mis-kinded: entry=%+v ok=%v, targets=%+v", entry, ok, targets)
	}
	if _, ok := findScanTarget(targets, "flt-foreign-inrange"); ok {
		t.Errorf("a foreign fleet appeared in the served set: %+v", targets)
	}
	if _, ok := findScanTarget(targets, "flt-own-transit"); ok {
		t.Errorf("an own fleet in lane transit appeared in the served set: %+v", targets)
	}
}
