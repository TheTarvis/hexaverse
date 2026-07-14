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

func TestRouteAround_AvoidsTheCore(t *testing.T) {
	// A straight line through the core must detour around it.
	crossing := [][2]Hex{{{1, 0}, {-1, 0}}, {{3, -2}, {-3, 2}}, {{2, -1}, {-2, 1}}}
	for _, c := range crossing {
		direct := Line(c[0], c[1])
		if !pathHitsCore(direct) {
			t.Fatalf("test setup: %v→%v does not cross the core", c[0], c[1])
		}
		path := RouteAround(c[0], c[1])
		if pathHitsCore(path) {
			t.Fatalf("routed path still crosses the core: %v→%v = %v", c[0], c[1], path)
		}
		// Still a valid contiguous path between the same endpoints.
		if path[0] != c[0] || path[len(path)-1] != c[1] {
			t.Fatalf("routed path endpoints wrong: %v", path)
		}
		for i := 1; i < len(path); i++ {
			if Distance(path[i-1], path[i]) != 1 {
				t.Fatalf("routed path not contiguous at %d: %v", i, path)
			}
		}
		// A core-avoiding path is never shorter than the straight line (which is a
		// shortest path); often it's the same length routed around, sometimes longer.
		if len(path) < len(direct) {
			t.Fatalf("detour %d shorter than direct %d", len(path), len(direct))
		}
	}
}

func TestRouteAround_DirectWhenClear(t *testing.T) {
	// A line that never touches the core is returned unchanged.
	for _, c := range [][2]Hex{{{3, -1}, {5, -2}}, {{2, -4}, {5, 1}}} {
		if got, want := RouteAround(c[0], c[1]), Line(c[0], c[1]); !equalPath(got, want) {
			t.Fatalf("clear route changed: %v→%v got %v want %v", c[0], c[1], got, want)
		}
	}
}

func equalPath(a, b []Hex) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
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

// TestSolveIntercept_ArrivesAsBodyEntersMeetCell pins the render seam of the
// lead-solve. The client draws an orbiting body glided TOWARD its next cell by
// the absolute window fraction, so the glyph sits on its logical cell centre
// only at the instant the body ENTERS the cell. An intercept that arrives
// mid-window is drawn a fraction of a tile behind the body, and the dock fold
// then snaps the ship forward onto the parent glyph. So arrival must be the
// body's cell-entry instant: on the meet hex at arriveTime, and not one
// millisecond before. (Static bodies are exempt — they render snapped to their
// cell centre; TestSolveIntercept_StaticEqualsSolveHex covers that path.)
func TestSolveIntercept_ArrivesAsBodyEntersMeetCell(t *testing.T) {
	o := Orbit{Ring: 2, Angle0: 0, Period: 12_000, Dir: 1} // one cell per second
	from := Hex{6, -3}
	for _, now := range []common.WorldMillis{0, 150, 400, 650, 900, 1_100} {
		sol := SolveIntercept(from, o, now, 300, 60_000)
		if got := OrbState(o, sol.ArriveTime); got != sol.MeetHex {
			t.Fatalf("now=%d: meet %v != body@arrive %v", now, sol.MeetHex, got)
		}
		if OrbState(o, sol.ArriveTime-1) == sol.MeetHex {
			t.Errorf("now=%d: arrival %d is mid-window — the body already occupied %v, so its glyph reads ahead of the meet hex",
				now, sol.ArriveTime, sol.MeetHex)
		}
	}
}

func TestShipPos_BurnInterpolatesEndToEnd(t *testing.T) {
	burn := Burn{Path: Line(Hex{0, 0}, Hex{4, 0}), StartTime: 0, ArriveTime: 4000}
	state := MovementState{Mode: ModeBurn, Burn: &burn}
	if p, _ := ShipPos(state, 0); p != (Hex{0, 0}) {
		t.Fatalf("burn start pos wrong: %v", p)
	}
	// Just before arrival the burn has carried the ship to its meet hex.
	if p, _ := ShipPos(state, 3999); p != (Hex{4, 0}) {
		t.Fatalf("burn end pos wrong: %v", p)
	}
	// At (and past) arrival the burn IS the settled coast (StateAt): on the meet
	// hex's ring, within the cell it's crossing — the coast anchor snaps to the
	// nearest cell-window boundary (see CoastAt), so the settle instant may sit
	// one cell shy of the meet hex until the boundary passes.
	if p, _ := ShipPos(state, 4000); Ring(p) != 4 || Distance(p, Hex{4, 0}) > 1 {
		t.Fatalf("arrived pos should coast the meet ring beside %v, got %v", Hex{4, 0}, p)
	}
	if p, _ := ShipPos(state, 2000); Ring(p) == 0 || Ring(p) == 4 {
		t.Fatalf("burn midpoint should be partway, got %v", p)
	}
}

// TestOrbitThrough_PassesThroughHexAtSettleTime is the anti-teleport property: an
// orbit built to settle at h at time `at` must actually BE at h at `at`. Angle0 is
// an EPOCH index, so a settle that naively stores "the index I'm at now" gets that
// index advanced by all the world-time since the epoch and lands the ship somewhere
// it never was. Invisible while fleets coasted with a near-infinite period; obvious
// the moment orbits got fast.
func TestOrbitThrough_PassesThroughHexAtSettleTime(t *testing.T) {
	periods := []common.WorldMillis{600, 9_600, 3_600_000, 1 << 60} // fast → motion-off
	times := []common.WorldMillis{0, 1_300, 16_000_000_000}         // epoch → a real "now"

	for _, ring := range []int{1, 4, 16} {
		for _, h := range RingHexes(ring) {
			for _, p := range periods {
				for _, at := range times {
					for _, dir := range []int{1, -1} {
						o := OrbitThrough(h, at, p, dir)
						if got := OrbState(o, at); got != h {
							t.Fatalf("ring %d, period %d, at %d, dir %d: settled at %+v but OrbState says %+v",
								ring, p, at, dir, h, got)
						}
					}
				}
			}
		}
	}
}

// TestOrbitThrough_ThenDrifts: having settled at h, the thing must actually MOVE
// afterwards (the point of the whole exercise) — one ring cell per period/(6·ring).
func TestOrbitThrough_ThenDrifts(t *testing.T) {
	const ring, at = 4, 10_000
	h := RingHexes(ring)[2]
	period := common.WorldMillis(9_600) // one cell every 400ms at ring 4 (24 cells)
	o := OrbitThrough(h, at, period, 1)

	perCell := period / common.WorldMillis(6*ring)
	if next := OrbState(o, at+perCell); next == h {
		t.Errorf("still at %+v one cell-time later — a coasting fleet must drift", h)
	}
	// A full revolution brings it home.
	if home := OrbState(o, at+period); home != h {
		t.Errorf("after one full period: at %+v, want %+v", home, h)
	}
}
