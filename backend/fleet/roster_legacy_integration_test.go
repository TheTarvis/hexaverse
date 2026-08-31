package fleet

import (
	"context"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// add-mine-extraction, fleet-movement spec delta: "Fleet Ship Composition" —
// the "pre-existing fleet with no stored roster" scenario, DBA MINOR finding:
// roster_test.go's
// TestFleetShipComposition_Scenario_PreExistingFleetNoStoredRosterDefaultsToOneSeedHull
// pins the fallback at the Fleet-struct level (a literal Go value with a nil
// Ships/Cargo). This test round-trips the SAME scenario through a real
// Firestore emulator decode: Ships/Cargo carry `firestore:"...,omitempty"`
// tags, so saving a Fleet with a nil roster produces a document that
// genuinely has no `ships`/`cargo` fields at all — exactly what a fleet
// document written before #0010 shipped looks like on disk. Reading it back
// through the fleet DAO (not constructing the struct in-process) proves the
// fallback survives the real encode/decode path, not just in-memory
// construction.
func TestFleetDao_Scenario_PreExistingFleetNoStoredRosterDecodesToOneSeedHullThroughFirestore(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, firestoreCollection)

	ctx := context.Background()
	dao := NewDaoWithClient(fs)

	// A fleet document exactly as SeedFleet wrote it before #0010 — no Ships,
	// no Cargo. Saved through the DAO (not a raw map) so the write path is the
	// real one; omitempty on both fields means the stored document has no
	// `ships`/`cargo` keys at all.
	//
	// The kinematic State itself is an ordinary modern space.ShipState (any
	// valid one) — migrate-fleet-to-continuous-burns' Migration Plan is
	// explicit that a PRE-CAPABILITY stored state (the old board.MovementState
	// shape) is not, and will not be made to, decode into a space.ShipState;
	// that is a deliberately separate concern (fail-closed on a disposable
	// document, not carried forward) from THIS scenario, which is purely
	// about the roster/cargo fallback surviving a real Firestore round trip.
	legacy := Fleet{
		Id:            "fleet-legacy-roster",
		CorporationId: "corp-legacy",
		SystemId:      "sys-legacy",
		State:         space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
	}
	if err := dao.Save(ctx, legacy); err != nil {
		t.Fatalf("seed legacy fleet: %v", err)
	}

	got, err := dao.Get(ctx, "fleet-legacy-roster")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got == nil {
		t.Fatal("Get: fleet not found")
	}
	if len(got.Ships) != 0 {
		t.Fatalf("decoded Ships = %v, want empty (the doc was written with no roster) — the fallback belongs in effectiveRoster, not a decode-time default", got.Ships)
	}

	stats := DefaultClassStats()
	seed := stats[ClassSeed]

	if cap := DerivedCapacity(*got, stats); cap != seed.HoldCapacity {
		t.Errorf("DerivedCapacity(legacy fleet decoded from Firestore) = %v, want %v (one default seed hull), never zero", cap, seed.HoldCapacity)
	}
	if rate := DerivedMiningRate(*got, stats); rate != seed.MiningRate {
		t.Errorf("DerivedMiningRate(legacy fleet decoded from Firestore) = %v, want %v (one default seed hull), never zero", rate, seed.MiningRate)
	}
	if held := FreeHold(*got, stats); held != seed.HoldCapacity {
		t.Errorf("FreeHold(legacy fleet decoded from Firestore) = %v, want %v (empty cargo, full seed-hull capacity)", held, seed.HoldCapacity)
	}
}
