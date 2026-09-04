package fleet

// RED-phase tests for tasks.md 3.8 — `fleet.SeedFleet` re-pointed from a
// discrete cell to a `space` park: deterministic from the account id,
// idempotent per account (a healed retry reproduces the same position,
// never a second fleet), rejecting a position inside the system star's
// clearance radius (fleet-movement: "Spawn Fleet Seeding Places a Park").
//
// CONTRACT this file assumes (documented since design.md leaves the exact
// division of labour between `fleet` and `corporations` to the
// implementer — see the SDET handoff report): `SeedFleet(ctx, systemID,
// corporationID string, at space.Vec3, starSize float64) (*Fleet, error)`.
// Position DETERMINISM from the account id is corporations.Spawn's own
// pure function (tasks.md 3.9, tested in corporations/spawn_position_test.go);
// `fleet.SeedFleet`'s OWN contract, tested here, is (a) idempotency — a
// second call for a corporation that already has a hull returns the
// existing hull rather than minting a second one — and (b) the star-
// clearance rejection, both independent of how `at` was derived. Seeding
// SHALL place a `point` park (never `stationkeep`, which would start
// charging upkeep before the corp's first order).

import (
	"context"
	"testing"

	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// Scenario: Seeding is deterministic and idempotent per account — the
// "idempotent, no second fleet" half. (The "deterministic position" half is
// the CALLER's pure function, per this file's header; SeedFleet's own job
// is not minting a duplicate when given the same inputs twice.)
func TestSeedFleet_Scenario_IdempotentPerCorporation(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	at := space.Vec3{X: 30}
	const starSize = 6.0 // clearance = 2.5*6 = 15 < 30

	existing := Fleet{
		Id: "fleet_existing", CorporationId: "corp-1", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: at}},
	}
	dao.EXPECT().ListByCorporation(gomock.Any(), "corp-1").Return([]Fleet{existing}, nil)
	// No Save expected: a corp that already has a hull must not mint a second one.

	got, err := svc.SeedFleet(context.Background(), "sys-0", "corp-1", at, starSize)
	if err != nil {
		t.Fatalf("SeedFleet: %v", err)
	}
	if got.Id != existing.Id {
		t.Fatalf("SeedFleet minted/returned %q, want the existing hull %q — no second fleet for an account that already has one", got.Id, existing.Id)
	}
}

func TestSeedFleet_Scenario_FirstCallCreatesAPointPark(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	at := space.Vec3{X: 30}
	const starSize = 6.0

	dao.EXPECT().ListByCorporation(gomock.Any(), "corp-1").Return(nil, nil)
	var saved Fleet
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, f Fleet) error {
		saved = f
		return nil
	})

	got, err := svc.SeedFleet(context.Background(), "sys-0", "corp-1", at, starSize)
	if err != nil {
		t.Fatalf("SeedFleet: %v", err)
	}
	if got.State.Mode != space.ModeParked || got.State.Park == nil || got.State.Park.Kind != space.ParkPoint {
		t.Fatalf("seeded state = %+v, want a point park (never stationkeep, which would start charging upkeep before the first order)", got.State)
	}
	if got.State.Park.Point != at {
		t.Fatalf("seeded position = %+v, want %+v", got.State.Park.Point, at)
	}
	if saved.Id != got.Id {
		t.Fatalf("the fleet returned was not the one saved: returned %q, saved %q", got.Id, saved.Id)
	}
}

// Scenario: Seeding inside the star's clearance radius is rejected.
func TestSeedFleet_Scenario_InsideStarClearanceRejected(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	const starSize = 6.0 // clearance = 2.5*6 = 15
	inside := space.Vec3{X: 10}
	dao.EXPECT().ListByCorporation(gomock.Any(), "corp-1").Return(nil, nil)
	// No Save expected: a rejected seed position must not create a fleet.

	_, err := svc.SeedFleet(context.Background(), "sys-0", "corp-1", inside, starSize)
	if err == nil {
		t.Fatal("SeedFleet accepted a position inside the star's clearance radius")
	}
}

func TestSeedFleet_Scenario_AtExactlyTheClearanceBoundaryRejected(t *testing.T) {
	// SDET-added boundary probe: "at or inside" per the spec text — the
	// boundary itself must reject, not merely points strictly inside.
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	const starSize = 6.0
	clearance := space.StarClearanceRadius(starSize)
	dao.EXPECT().ListByCorporation(gomock.Any(), "corp-1").Return(nil, nil)

	_, err := svc.SeedFleet(context.Background(), "sys-0", "corp-1", space.Vec3{X: clearance}, starSize)
	if err == nil {
		t.Fatal("SeedFleet accepted a position exactly AT the star's clearance radius, want rejection (\"at or inside\")")
	}
}
