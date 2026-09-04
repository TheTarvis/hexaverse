package fleet

import (
	"context"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// anyParkedState is a valid, minimal stored kinematic state — every fixture
// in this file needs SOME decodable state (fleet-movement ADDED "Undecodable
// Stored Kinematic State Is Rejected, Never Panicked": a fleet document with
// no stored state at all is rejected by name, never defaulted), and these
// tests are about corporation-scoping / roster fallback, not about which
// kinematic mode is stored.
func anyParkedState() space.ShipState {
	return space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}}
}

// TestListByCorporation proves the coverage input query returns only a
// corporation's own fleets — the boundary fog isolation rides on.
func TestListByCorporation(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, firestoreCollection)

	ctx := context.Background()
	dao := NewDaoWithClient(fs)
	for _, f := range []Fleet{
		{Id: "f1", CorporationId: "corp-A", SystemId: "s1", State: anyParkedState()},
		{Id: "f2", CorporationId: "corp-A", SystemId: "s2", State: anyParkedState()},
		{Id: "f3", CorporationId: "corp-B", SystemId: "s1", State: anyParkedState()},
	} {
		if err := dao.Save(ctx, f); err != nil {
			t.Fatalf("seed %s: %v", f.Id, err)
		}
	}

	got, err := dao.ListByCorporation(ctx, "corp-A")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("got %d fleets for corp-A, want 2 (corp-B's must not leak)", len(got))
	}
	for _, f := range got {
		if f.CorporationId != "corp-A" {
			t.Errorf("foreign fleet %s leaked into corp-A's list", f.Id)
		}
	}
}

// DELETED (migrate-fleet-to-continuous-burns, design.md Decision 4): this
// file used to carry TestDao_CoastPeriod_RehydratedFromLiveTuning, pinning
// that a stored coast's Period was rehydrated from a LIVE, retunable,
// index-keyed world-tuning lookup on every read, rather than frozen at the
// pace in effect when the fleet last settled — because the stored coast kept
// only a discrete position and derived its period from that lookup.
//
// A space.Park (ParkOrbit/ParkStationkeep) has no successor lookup to
// rehydrate: PeriodMs is computed ONCE at settle time from the park's own
// Radius via space.InsertionPeriod(radius) — a pure function of a stored
// number, not a retunable ring-indexed rate looked up again at read time
// (space/park.go's InsertionPeriod; space-kinematics: "A Committed Burn's
// Geometry Is Fixed at Commit and Evaluated Closed-Form", extended to a
// park's own insertion elements by the same principle). There is nothing
// left to "rehydrate from live tuning" — the whole bug class (an operator
// retuning orbit pace and stranding already-settled ships at their old
// speed) cannot recur, because nothing about a stored park's motion is
// looked up again at read time in the first place.
