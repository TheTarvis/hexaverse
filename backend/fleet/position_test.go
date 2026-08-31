package fleet

// RED-phase tests for tasks.md 3.7 — effective position resolution through
// `space.StatePosition(bodies, f.State, now)` as the capability's SOLE
// canonical position path: a docked fleet rides its host's live position
// (its orbit if it orbits, else its fixed anchor); a free-flying fleet
// resolves through its own folded burn/park/drift (fleet-movement MODIFIED
// "Effective Position Resolution"). The mid-jump half of this requirement
// is covered by jump_test.go.

import (
	"context"
	"testing"

	"hexaverse/space"
)

// Scenario: A free-flying fleet resolves through space.StatePosition.
func TestPosition_Scenario_FreeFlyingFleetResolvesThroughStatePosition(t *testing.T) {
	clk := &fakeClock{now: 500_000}
	svc, _, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	drift := space.Drift{Anchor: space.Vec3{X: 20}, Velocity: space.Vec3{X: 1}, EpochMs: 400_000}
	f := &Fleet{
		Id: "fleet_1", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeDrift, Drift: &drift},
	}

	got, err := svc.Position(context.Background(), f, bodies)
	if err != nil {
		t.Fatalf("Position: %v", err)
	}
	want := drift.Position(clk.now)
	if got != want {
		t.Fatalf("Position = %+v, want %+v (space.StatePosition's own drift fold, independently recomputed)", got, want)
	}
}

// Scenario: A docked fleet rides its parent's live position, not the
// position the docking burn ended on — proven by an orbiting host whose
// live position at read-time has visibly moved since the stored park's own
// epoch.
func TestPosition_Scenario_DockedFleetRidesHostsLivePosition(t *testing.T) {
	const epoch = 100_000
	const period = 400_000 // world-ms per full revolution
	clk := &fakeClock{now: epoch + period/4}
	svc, _, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	host := orbitingFeature("feat-body-a", 40, 2.0)
	bodies := testBodyTable(t, "sys-0", 6.0, host)

	// Docked (ParkOrbit riding "feat-body-a") since `epoch` — a quarter
	// revolution before `now`, so the host has visibly moved.
	f := &Fleet{
		Id: "fleet_1", SystemId: "sys-0", AttachedTo: "feat-body-a",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{
			Kind: space.ParkOrbit, BodyId: "feat-body-a", Radius: 3, PeriodMs: period, EpochMs: epoch,
		}},
	}

	got, err := svc.Position(context.Background(), f, bodies)
	if err != nil {
		t.Fatalf("Position: %v", err)
	}

	// Independently recompute the SAME fold via space.StatePosition — the
	// point of the "sole canonical path" requirement is that there is no
	// second formula for this anywhere, so re-deriving through the same
	// public function is the correct (non-tautological) check: this proves
	// Position delegates rather than reimplementing, and a wrong delegation
	// (e.g. evaluating at the park's epoch instead of `now`) would still be
	// caught by the epoch-at-read-time position below.
	want, err := space.StatePosition(bodies, f.State, clk.now)
	if err != nil {
		t.Fatalf("independent recompute: %v", err)
	}
	if got != want {
		t.Fatalf("Position = %+v, want %+v", got, want)
	}

	// And it must differ from the position at the park's OWN epoch — proving
	// this is the host's LIVE position, not the position the docking burn
	// ended on.
	atEpoch, err := space.StatePosition(bodies, f.State, epoch)
	if err != nil {
		t.Fatalf("recompute at epoch: %v", err)
	}
	if got == atEpoch {
		t.Fatalf("Position at now (%+v) equals the position at the docking instant (%+v) — "+
			"the host must have visibly moved over a quarter revolution", got, atEpoch)
	}
}
