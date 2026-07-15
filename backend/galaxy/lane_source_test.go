package galaxy

import "testing"

// lanesOf feeds the scan's lane charting (#0006 Decision #17): every lane
// incident to the scanned system, each with its far endpoint, whichever side
// of the lane record the system sits on.
func TestLanesOf_IncidentLanesWithFarEndpoints(t *testing.T) {
	lanes := []Lane{
		{Id: "l-ab", AId: "A", BId: "B"},
		{Id: "l-cb", AId: "C", BId: "B"},
		{Id: "l-cd", AId: "C", BId: "D"},
	}

	got := lanesOf(lanes, "B")
	if len(got) != 2 {
		t.Fatalf("lanesOf(B) = %v, want 2 incident lanes", got)
	}
	byLane := map[string]string{}
	for _, le := range got {
		byLane[le.LaneId] = le.OtherSystemId
	}
	if byLane["l-ab"] != "A" || byLane["l-cb"] != "C" {
		t.Fatalf("far endpoints wrong: %v (must be the OTHER side, whichever slot B is in)", byLane)
	}

	if got := lanesOf(lanes, "Z"); len(got) != 0 {
		t.Fatalf("lanesOf(unknown) = %v, want none", got)
	}
}
