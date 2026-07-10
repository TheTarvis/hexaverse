package board

import (
	"testing"

	"hexaverse/common"
)

func wms(vs ...int64) []common.WorldMillis {
	out := make([]common.WorldMillis, len(vs))
	for i, v := range vs {
		out[i] = common.WorldMillis(v)
	}
	return out
}

func TestLaneFraction_BracketsAndClamps(t *testing.T) {
	// Board leg burns to the gate by t=100, then two lanes A→B→C landing at 300, 500.
	lt := LaneTransit{
		BoardLeg:   &BoardLeg{Path: []Hex{{0, 0}, {1, 0}, {2, 0}}, StartTime: 0, GateEta: 100},
		Route:      []string{"A", "B", "C"},
		LegEtas:    wms(100, 300, 500),
		ArriveTime: 500,
	}
	cases := []struct {
		t        int64
		from, to int
		frac     float64
	}{
		{0, 0, 1, 0},     // before the gate → first lane, fraction 0
		{100, 0, 1, 0},   // at the gate → entering the first lane
		{200, 0, 1, 0.5}, // halfway along A→B
		{300, 1, 2, 0},   // at B → entering B→C
		{400, 1, 2, 0.5}, // halfway along B→C
		{600, 1, 2, 1},   // past arrival → clamped to the last lane end
	}
	for _, c := range cases {
		from, to, frac, ok := LaneFraction(lt, common.WorldMillis(c.t))
		if !ok {
			t.Fatalf("t=%d: expected ok", c.t)
		}
		if from != c.from || to != c.to || frac != c.frac {
			t.Fatalf("t=%d: got %d/%d/%v, want %d/%d/%v", c.t, from, to, frac, c.from, c.to, c.frac)
		}
	}
}

func TestShipPos_LaneTransit_OnBoardOnlyDuringBoardLeg(t *testing.T) {
	lt := LaneTransit{
		BoardLeg:   &BoardLeg{Path: []Hex{{0, 0}, {1, 0}, {2, 0}}, StartTime: 0, GateEta: 100},
		Route:      []string{"A", "B"},
		LegEtas:    wms(100, 300),
		ArriveTime: 300,
	}
	s := MovementState{Mode: ModeLaneTransit, LaneTransit: &lt}

	// During the board leg the fleet is on the origin board burning to the gate.
	if h, ok := ShipPos(s, common.WorldMillis(50)); !ok || h != (Hex{1, 0}) {
		t.Fatalf("mid board-leg: got %v ok=%v, want {1 0} true", h, ok)
	}
	// Past the gate it's out on the lane — no board hex.
	if _, ok := ShipPos(s, common.WorldMillis(150)); ok {
		t.Fatalf("past the gate: expected ok=false (no board presence)")
	}
}

func TestArrived_LaneTransit(t *testing.T) {
	lt := LaneTransit{Route: []string{"A", "B"}, LegEtas: wms(100, 300), ArriveTime: 300}
	s := MovementState{Mode: ModeLaneTransit, LaneTransit: &lt}
	if Arrived(s, common.WorldMillis(299)) {
		t.Fatal("not yet arrived at t=299")
	}
	if !Arrived(s, common.WorldMillis(300)) {
		t.Fatal("arrived at t=300")
	}
}
