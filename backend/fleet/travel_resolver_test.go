package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
)

// fakeArrivals records the reveal call and returns no writes (the write shape is
// tested in the observation package).
type fakeArrivals struct {
	dest    string
	laneIds []string
}

func (f *fakeArrivals) ArrivalWrites(_ string, dest string, traveledLaneIds []string, _ common.WorldMillis) []action.DocWrite {
	f.dest = dest
	f.laneIds = traveledLaneIds
	return nil
}

// The travel resolver lands the fleet coasting at the destination's entry gate,
// flips its systemId to the destination, and triggers the arrival reveal —
// which explores the destination and charts ONLY the lanes the trip crossed
// (#0006 Decision #17): the onward roads stay dark until a scan there.
//
// Spec: 0008/S3
// Spec: 0006/S7
func TestTravelResolver_LandsAtEntryGateAndReveals(t *testing.T) {
	entry := board.Hex{Q: 16, R: -2}
	lt := &board.LaneTransit{
		Route:      []string{"A", "B", "C"},
		LegEtas:    []common.WorldMillis{100, 700, 1300},
		ArriveTime: 1300,
		EntryGate:  entry,
		LaneIds:    []string{"l-ab", "l-bc"},
	}
	f := Fleet{Id: "fleet_1", CorporationId: "corp", SystemId: "A",
		State: board.MovementState{Mode: board.ModeLaneTransit, LaneTransit: lt}}

	arr := &fakeArrivals{}
	resolver := TravelResolver(DefaultMovementParams(), arr)
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
	// The reveal call carries the destination and exactly the crossed lanes —
	// nothing onward (C's lane to D is not among them).
	if arr.dest != "C" {
		t.Fatalf("reveal dest = %s, want C", arr.dest)
	}
	if len(arr.laneIds) != 2 || arr.laneIds[0] != "l-ab" || arr.laneIds[1] != "l-bc" {
		t.Fatalf("reveal laneIds = %v, want [l-ab l-bc] (traveled lanes only)", arr.laneIds)
	}
}
