package board

import (
	"testing"

	"hexaverse/common"
)

func TestLine_ContiguousAndEndpoints(t *testing.T) {
	cases := [][2]Hex{
		{{0, 0}, {3, 0}},
		{{0, 0}, {-2, 5}},
		{{1, -3}, {4, 1}},
		{{0, 0}, {0, 0}},
	}
	for _, c := range cases {
		path := Line(c[0], c[1])
		if path[0] != c[0] || path[len(path)-1] != c[1] {
			t.Fatalf("line %v→%v endpoints wrong: %v", c[0], c[1], path)
		}
		if len(path) != Distance(c[0], c[1])+1 {
			t.Fatalf("line %v→%v length %d, want %d", c[0], c[1], len(path), Distance(c[0], c[1])+1)
		}
		for i := 1; i < len(path); i++ {
			if Distance(path[i-1], path[i]) != 1 {
				t.Fatalf("line not contiguous at %d: %v", i, path)
			}
		}
	}
}

func TestOrbState_StaticWhenSlow(t *testing.T) {
	// A huge period => effectively motionless within the slice window.
	o := Orbit{Ring: 4, Angle0: 5, Period: 1 << 60, Dir: 1}
	base := OrbState(o, 0)
	for _, tm := range []common.WorldMillis{0, 1000, 3_600_000} {
		if got := OrbState(o, tm); got != base {
			t.Fatalf("slow orbit moved: t=%d got %v want %v", tm, got, base)
		}
	}
	// The epoch position is exactly the angle0 slot.
	if base != RingHexes(4)[5] {
		t.Fatalf("epoch position wrong: %v", base)
	}
}

func TestOrbState_AdvancesOneRevPerPeriod(t *testing.T) {
	o := Orbit{Ring: 2, Angle0: 0, Period: 12_000, Dir: 1}
	// After exactly one period the body returns to its start (full revolution).
	if OrbState(o, 12_000) != OrbState(o, 0) {
		t.Fatal("one period should return to start")
	}
	// Half a period on ring 2 (12 slots) advances 6 slots.
	if got, want := OrbState(o, 6_000), RingHexes(2)[6]; got != want {
		t.Fatalf("half period: got %v want %v", got, want)
	}
}

func TestSolveIntercept_StaticEqualsSolveHex(t *testing.T) {
	from := Hex{0, 0}
	// Static body (huge period) at its epoch hex.
	o := Orbit{Ring: 5, Angle0: 3, Period: 1 << 60, Dir: 1}
	pos := OrbState(o, 0)

	msPerTile := common.WorldMillis(1000)
	inter := SolveIntercept(from, o, 0, msPerTile, 10_000_000)
	hex := SolveHex(from, pos, 0, msPerTile)

	if inter.MeetHex != hex.MeetHex || inter.ArriveTime != hex.ArriveTime {
		t.Fatalf("motion-off intercept != static solve: intercept=%+v hex=%+v", inter, hex)
	}
	// The meet hex is the body's position at arrival (intercept determinism).
	if inter.MeetHex != OrbState(o, inter.ArriveTime) {
		t.Fatalf("meet hex != body pos at arriveTime")
	}
}

func TestSolveIntercept_MeetEqualsBodyPosAtArrive(t *testing.T) {
	from := Hex{0, 0}
	o := Orbit{Ring: 6, Angle0: 0, Period: 600_000, Dir: 1} // moving
	sol := SolveIntercept(from, o, 0, common.WorldMillis(1000), 5_000_000)
	if sol.MeetHex != OrbState(o, sol.ArriveTime) {
		t.Fatalf("intercept not deterministic: meet %v != body@arrive %v",
			sol.MeetHex, OrbState(o, sol.ArriveTime))
	}
	// The fleet can physically make it: travel time ≤ elapsed time.
	travel := common.WorldMillis(Distance(from, sol.MeetHex)) * 1000
	if travel > sol.ArriveTime {
		t.Fatalf("infeasible intercept: travel %d > arrive %d", travel, sol.ArriveTime)
	}
}

func TestShipPos_BurnInterpolatesEndToEnd(t *testing.T) {
	burn := Burn{Path: Line(Hex{0, 0}, Hex{4, 0}), StartTime: 0, ArriveTime: 4000}
	state := MovementState{Mode: ModeBurn, Burn: &burn}
	if p, _ := ShipPos(state, 0); p != (Hex{0, 0}) {
		t.Fatalf("burn start pos wrong: %v", p)
	}
	if p, _ := ShipPos(state, 4000); p != (Hex{4, 0}) {
		t.Fatalf("burn end pos wrong: %v", p)
	}
	if p, _ := ShipPos(state, 2000); Ring(p) == 0 || Ring(p) == 4 {
		t.Fatalf("burn midpoint should be partway, got %v", p)
	}
}
