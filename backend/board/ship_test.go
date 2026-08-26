package board

import (
	"testing"

	"hexaverse/common"
	"hexaverse/polar"
)

// BurnPos interpolates by exact integer arithmetic: round-half-up index into
// the path from elapsed/total — no float anywhere (openspec
// board-tactical-math, "Computed Ship Board Position").
func TestBurnPos_IntegerIndexInterpolation(t *testing.T) {
	s := sched(t, 10)
	path := polar.ArcPath(Cell{Ring: 2, Slot: 0}, Cell{Ring: 6, Slot: 3}, s)
	b := Burn{Path: path, StartTime: 1_000, ArriveTime: 1_000 + common.WorldMillis(len(path)-1)*2_500}
	if got := BurnPos(b, 0); got != path[0] {
		t.Errorf("before start: %v, want %v", got, path[0])
	}
	if got := BurnPos(b, b.ArriveTime); got != path[len(path)-1] {
		t.Errorf("at arrival: %v, want %v", got, path[len(path)-1])
	}
	// One tile-time in: index 1 exactly.
	if got := BurnPos(b, b.StartTime+2_500); got != path[1] {
		t.Errorf("one tile in: %v, want %v", got, path[1])
	}
	// Half a tile-time in: elapsed×(n−1)/total = 0.5 — round-half-up → index 1.
	if got := BurnPos(b, b.StartTime+1_250); got != path[1] {
		t.Errorf("half a tile in (round-half-up): %v, want %v", got, path[1])
	}
	// Just under half: index 0.
	if got := BurnPos(b, b.StartTime+1_249); got != path[0] {
		t.Errorf("just under half a tile: %v, want %v", got, path[0])
	}
	// Strictly between endpoints mid-burn.
	mid := BurnPos(b, b.StartTime+common.WorldMillis(len(path)/2)*2_500)
	if mid == path[0] || mid == path[len(path)-1] {
		t.Errorf("mid-burn position %v should be strictly between the endpoints", mid)
	}
	// Degenerate window and empty path.
	if got := BurnPos(Burn{Path: path, StartTime: 5, ArriveTime: 5}, 10); got != path[0] {
		t.Errorf("zero window: %v, want start", got)
	}
	if got := BurnPos(Burn{}, 10); got != (Cell{Ring: 0, Slot: 0}) {
		t.Errorf("empty path: %v, want core", got)
	}
}

// CoastAt back-solves an orbit through the settle cell: evaluating the state
// at the (snapped) anchor reproduces a cell within one slot of the settle
// cell, and the orbit's period follows the world's one orbital law.
func TestCoastAt_SettlesWithoutTeleporting(t *testing.T) {
	s := sched(t, 10)
	c := Cell{Ring: 4, Slot: 7}
	at := common.WorldMillis(123_456)
	st := CoastAt(c, at, s)
	if st.Mode != ModeCoast || st.Coast == nil {
		t.Fatalf("CoastAt returned %+v, want a coast", st)
	}
	if got, want := st.Coast.Period, common.Tuning().OrbitPeriod(4); got != want {
		t.Errorf("coast period %d, want the orbital law's %d", got, want)
	}
	pos := OrbState(*st.Coast, at, s)
	if pos.Ring != c.Ring {
		t.Fatalf("settled on ring %d, want %d", pos.Ring, c.Ring)
	}
	// The anchor snaps to the nearest cell-window boundary, so the settle
	// cell may read one slot either side of c at `at` — never further.
	diff := (pos.Slot - c.Slot + s.Slots(4)) % s.Slots(4)
	if diff > 1 && diff < s.Slots(4)-1 {
		t.Errorf("settled at %v, more than one slot from %v", pos, c)
	}
}

func TestStateAt_FoldSemantics(t *testing.T) {
	s := sched(t, 10)
	path := polar.ArcPath(Cell{Ring: 1, Slot: 0}, Cell{Ring: 6, Slot: 0}, s)
	burn := &Burn{Path: path, StartTime: 1_000, ArriveTime: 13_500, Target: Target{Cell: &Cell{Ring: 6, Slot: 0}}}

	// In progress — unchanged.
	st := MovementState{Mode: ModeBurn, Burn: burn}
	if got := StateAt(st, 7_000, s); got.Mode != ModeBurn || got.Burn != burn {
		t.Errorf("mid-flight fold changed the state: %+v", got)
	}

	// At/past arrival — folds to a coast anchored at the arrival instant on
	// the final cell's ring.
	folded := StateAt(st, 13_500, s)
	if folded.Mode != ModeCoast || folded.Coast == nil {
		t.Fatalf("due burn folded to %+v, want coast", folded)
	}
	if folded.Coast.Ring != 6 {
		t.Errorf("folded coast ring %d, want 6", folded.Coast.Ring)
	}
	// The same coast much later — the fold is anchored at arrival, not `t`.
	later := StateAt(st, 262_000, s)
	if later.Mode != ModeCoast || *later.Coast != *folded.Coast {
		t.Errorf("fold at a later read %+v differs from the arrival fold %+v", later.Coast, folded.Coast)
	}

	// Dock-on-arrive — folds to docked.
	dock := MovementState{Mode: ModeBurn, Burn: &Burn{Path: path, StartTime: 2_000, ArriveTime: 9_000, Target: Target{FeatureId: "feat-9"}, DockOnArrive: "feat-9"}}
	if got := StateAt(dock, 20_000, s); got.Mode != ModeDocked || got.Docked == nil || got.Docked.ParentId != "feat-9" {
		t.Errorf("dock-on-arrive folded to %+v", got)
	}

	// A due lane transit does NOT fold — arrival is effectful.
	transit := MovementState{Mode: ModeLaneTransit, LaneTransit: &LaneTransit{
		Route: []string{"sys-0", "sys-2"}, LegEtas: []common.WorldMillis{5_000, 30_000},
		DepartTime: 1_000, ArriveTime: 30_000, EntryGate: Cell{Ring: 13, Slot: 0},
	}}
	if got := StateAt(transit, 99_999, s); got.Mode != ModeLaneTransit {
		t.Errorf("due lane transit folded to %v — it must wait for the authoritative resolve", got.Mode)
	}
}

func TestShipPos(t *testing.T) {
	s := sched(t, 10)
	path := polar.ArcPath(Cell{Ring: 1, Slot: 0}, Cell{Ring: 6, Slot: 0}, s)
	burn := &Burn{Path: path, StartTime: 1_000, ArriveTime: 1_000 + common.WorldMillis(len(path)-1)*2_500}

	// Mid-burn: on the path, strictly between the endpoints.
	pos, ok := ShipPos(MovementState{Mode: ModeBurn, Burn: burn}, burn.StartTime+common.WorldMillis(len(path)/2)*2_500, s)
	if !ok {
		t.Fatal("mid-burn ShipPos not ok")
	}
	found := false
	for _, c := range path[1 : len(path)-1] {
		if c == pos {
			found = true
		}
	}
	if !found {
		t.Errorf("mid-burn position %v not strictly inside the path", pos)
	}

	// Past arrival: the settled coast's live position, ok=true (the fold).
	pos, ok = ShipPos(MovementState{Mode: ModeBurn, Burn: burn}, burn.ArriveTime+50_000, s)
	if !ok {
		t.Fatal("settled burn ShipPos not ok")
	}
	if pos.Ring != 6 {
		t.Errorf("settled position ring %d, want the final cell's ring 6", pos.Ring)
	}

	// Docked / lane-hold: no board cell.
	if _, ok := ShipPos(MovementState{Mode: ModeDocked, Docked: &Docked{ParentId: "p"}}, 0, s); ok {
		t.Error("docked fleet reported a board cell")
	}
	if _, ok := ShipPos(MovementState{Mode: ModeLaneHold, LaneHold: &LaneHold{From: "a", To: "b", Fraction: 0.5}}, 0, s); ok {
		t.Error("lane-held fleet reported a board cell")
	}

	// Lane transit: on-board during the board leg, gone past the gate ETA.
	lt := MovementState{Mode: ModeLaneTransit, LaneTransit: &LaneTransit{
		BoardLeg: &BoardLeg{Path: path, StartTime: 0, GateEta: 10_000},
		Route:    []string{"a", "b"}, LegEtas: []common.WorldMillis{10_000, 50_000},
		ArriveTime: 50_000, EntryGate: Cell{Ring: 13, Slot: 0},
	}}
	if _, ok := ShipPos(lt, 5_000, s); !ok {
		t.Error("board-leg fleet should have a board cell before the gate ETA")
	}
	if _, ok := ShipPos(lt, 10_000, s); ok {
		t.Error("fleet past the gate ETA should be out on the lane, no board cell")
	}
}

func TestArrived(t *testing.T) {
	b := MovementState{Mode: ModeBurn, Burn: &Burn{Path: []Cell{{Ring: 1, Slot: 0}, {Ring: 1, Slot: 1}}, StartTime: 0, ArriveTime: 10}}
	if Arrived(b, 9) || !Arrived(b, 10) {
		t.Error("burn Arrived should flip exactly at ArriveTime")
	}
	lt := MovementState{Mode: ModeLaneTransit, LaneTransit: &LaneTransit{ArriveTime: 100}}
	if Arrived(lt, 99) || !Arrived(lt, 100) {
		t.Error("lane transit Arrived should flip exactly at ArriveTime")
	}
	if Arrived(MovementState{Mode: ModeCoast}, 1<<50) {
		t.Error("a coast never arrives")
	}
}

func TestLaneFraction(t *testing.T) {
	lt := LaneTransit{Route: []string{"a", "b", "c"}, LegEtas: []common.WorldMillis{10, 20, 40}}
	if _, _, _, ok := LaneFraction(LaneTransit{Route: []string{"a"}, LegEtas: []common.WorldMillis{1}}, 5); ok {
		t.Error("a one-system route has no lanes")
	}
	if from, to, frac, ok := LaneFraction(lt, 5); !ok || from != 0 || to != 1 || frac != 0 {
		t.Errorf("before the gate: %d→%d %.2f %v", from, to, frac, ok)
	}
	if from, to, frac, ok := LaneFraction(lt, 15); !ok || from != 0 || to != 1 || frac != 0.5 {
		t.Errorf("mid first lane: %d→%d %.2f %v", from, to, frac, ok)
	}
	if from, to, frac, ok := LaneFraction(lt, 30); !ok || from != 1 || to != 2 || frac != 0.5 {
		t.Errorf("mid second lane: %d→%d %.2f %v", from, to, frac, ok)
	}
	if from, to, frac, ok := LaneFraction(lt, 99); !ok || from != 1 || to != 2 || frac != 1 {
		t.Errorf("past arrival: %d→%d %.2f %v", from, to, frac, ok)
	}
}
