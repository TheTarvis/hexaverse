package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"
)

// fakeArrivals records the reveal call and returns no writes (the write shape is
// tested in the observation package).
type fakeArrivals struct {
	dest   string
	onward []string
}

func (f *fakeArrivals) ArrivalWrites(_ string, dest string, onward []string, _ map[string]observation.Tier, _ common.WorldMillis) []action.DocWrite {
	f.dest = dest
	f.onward = onward
	return nil
}

// The travel resolver lands the fleet coasting at the destination's entry gate,
// flips its systemId to the destination, and triggers the arrival reveal.
// Spec: 0008/S3
func TestTravelResolver_LandsAtEntryGateAndReveals(t *testing.T) {
	entry := board.Hex{Q: 16, R: -2}
	lt := &board.LaneTransit{
		Route:      []string{"A", "B", "C"},
		LegEtas:    []common.WorldMillis{100, 700, 1300},
		ArriveTime: 1300,
		EntryGate:  entry,
		Onward:     []string{"D"},
	}
	f := Fleet{Id: "fleet_1", CorporationId: "corp", SystemId: "A",
		State: board.MovementState{Mode: board.ModeLaneTransit, LaneTransit: lt}}

	arr := &fakeArrivals{}
	resolver := TravelResolver(DefaultMovementParams(), arr, &fakeTiers{m: map[string]observation.Tier{}})
	res, err := resolver(context.Background(), action.Resolution{
		At:          1300,
		DecodeActor: func(target interface{}) error { *(target.(*Fleet)) = f; return nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := res.ActorState["systemId"]; got != "C" {
		t.Fatalf("systemId = %v, want C", got)
	}
	st, ok := res.ActorState["state"].(board.MovementState)
	if !ok || st.Mode != board.ModeCoast || st.Coast == nil {
		t.Fatalf("expected coast state, got %+v", res.ActorState["state"])
	}
	// Coasting exactly at the entry gate ring/position.
	if board.OrbState(*st.Coast, 1300) != entry {
		t.Fatalf("coast not at entry gate")
	}
	if arr.dest != "C" || len(arr.onward) != 1 || arr.onward[0] != "D" {
		t.Fatalf("reveal call wrong: dest=%s onward=%v", arr.dest, arr.onward)
	}
}
