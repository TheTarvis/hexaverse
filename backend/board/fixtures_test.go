package board

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"hexaverse/common"
)

// fixturesPath is the repo-root shared fixtures file. Both this Go suite and
// M7's TS lib/hex suite assert their implementations reproduce it — the
// determinism-by-contract seam (build order cross-cutting rule). Regenerate
// with UPDATE_FIXTURES=1 and commit the result.
const fixturesPath = "../../fixtures/board/cases.json"

type lineCase struct {
	From Hex   `json:"from"`
	To   Hex   `json:"to"`
	Path []Hex `json:"path"`
}

type orbCase struct {
	Orbit Orbit              `json:"orbit"`
	T     common.WorldMillis `json:"t"`
	Hex   Hex                `json:"hex"`
}

type solveCase struct {
	From       Hex                `json:"from"`
	Dest       *Hex               `json:"dest,omitempty"`
	Orbit      *Orbit             `json:"orbit,omitempty"`
	Now        common.WorldMillis `json:"now"`
	MsPerTile  common.WorldMillis `json:"msPerTile"`
	Horizon    common.WorldMillis `json:"horizon,omitempty"`
	Path       []Hex              `json:"path"`
	MeetHex    Hex                `json:"meetHex"`
	ArriveTime common.WorldMillis `json:"arriveTime"`
}

type routeCase struct {
	From Hex   `json:"from"`
	To   Hex   `json:"to"`
	Path []Hex `json:"path"`
}

type gateCase struct {
	SelfX     float64 `json:"selfX"`
	SelfY     float64 `json:"selfY"`
	NeighborX float64 `json:"neighborX"`
	NeighborY float64 `json:"neighborY"`
	Radius    int     `json:"radius"`
	Gate      Hex     `json:"gate"`
}

type stateAtCase struct {
	State MovementState      `json:"state"`
	T     common.WorldMillis `json:"t"`
	Out   MovementState      `json:"out"`
}

type fixtures struct {
	Line           []lineCase    `json:"line"`
	RouteAround    []routeCase   `json:"routeAround"`
	OrbState       []orbCase     `json:"orbState"`
	SolveHex       []solveCase   `json:"solveHex"`
	SolveIntercept []solveCase   `json:"solveIntercept"`
	LaneGate       []gateCase    `json:"laneGate"`
	StateAt        []stateAtCase `json:"stateAt"`
}

// computeFixtures builds the golden cases from the current board implementation.
func computeFixtures() fixtures {
	var f fixtures

	for _, c := range [][2]Hex{{{0, 0}, {3, -1}}, {{0, 0}, {-2, 5}}, {{2, -4}, {5, 1}}} {
		f.Line = append(f.Line, lineCase{From: c[0], To: c[1], Path: Line(c[0], c[1])})
	}

	for _, c := range [][2]Hex{
		{{1, 0}, {-1, 0}},  // straight through the core → detour around the star
		{{3, -2}, {-3, 2}}, // across the system through the core → detour
		{{2, -1}, {-2, 1}}, // another crossing pair → detour
		{{3, -1}, {5, -2}}, // nowhere near the core → straight line
		{{0, 0}, {5, 0}},   // from the core itself → nothing to avoid, straight
	} {
		f.RouteAround = append(f.RouteAround, routeCase{From: c[0], To: c[1], Path: RouteAround(c[0], c[1])})
	}

	orbits := []Orbit{
		{Ring: 3, Angle0: 2, Period: 1 << 60, Dir: 1}, // static
		{Ring: 2, Angle0: 0, Period: 12_000, Dir: 1},  // moving prograde
		{Ring: 4, Angle0: 7, Period: 48_000, Dir: -1}, // moving retrograde
	}
	for _, o := range orbits {
		for _, tm := range []common.WorldMillis{0, 3_000, 6_000, 24_000} {
			f.OrbState = append(f.OrbState, orbCase{Orbit: o, T: tm, Hex: OrbState(o, tm)})
		}
	}

	hexSolves := []struct {
		from, dest Hex
		now, mspt  common.WorldMillis
	}{
		{Hex{0, 0}, Hex{5, 0}, 0, 1000},
		{Hex{1, -1}, Hex{-3, 4}, 10_000, 500},
	}
	for _, c := range hexSolves {
		s := SolveHex(c.from, c.dest, c.now, c.mspt)
		dest := c.dest
		f.SolveHex = append(f.SolveHex, solveCase{
			From: c.from, Dest: &dest, Now: c.now, MsPerTile: c.mspt,
			Path: s.Path, MeetHex: s.MeetHex, ArriveTime: s.ArriveTime,
		})
	}

	interSolves := []struct {
		from            Hex
		orbit           Orbit
		now, mspt, hori common.WorldMillis
	}{
		{Hex{0, 0}, Orbit{Ring: 5, Angle0: 3, Period: 1 << 60, Dir: 1}, 0, 1000, 10_000_000},
		{Hex{0, 0}, Orbit{Ring: 6, Angle0: 0, Period: 600_000, Dir: 1}, 0, 1000, 5_000_000},
		// Mid-window order time against a moving body — pins that arrival is the
		// body's cell-ENTRY instant (the glide seam), not now + travel.
		{Hex{6, -3}, Orbit{Ring: 2, Angle0: 0, Period: 12_000, Dir: 1}, 650, 300, 60_000},
		// Retrograde, period NOT divisible by steps — pins the ceil rounding of
		// the entry instant across Go int64 and TS BigInt.
		{Hex{5, 0}, Orbit{Ring: 4, Angle0: 7, Period: 50_000, Dir: -1}, 1_234, 700, 300_000},
	}
	for _, c := range interSolves {
		s := SolveIntercept(c.from, c.orbit, c.now, c.mspt, c.hori)
		orb := c.orbit
		f.SolveIntercept = append(f.SolveIntercept, solveCase{
			From: c.from, Orbit: &orb, Now: c.now, MsPerTile: c.mspt, Horizon: c.hori,
			Path: s.Path, MeetHex: s.MeetHex, ArriveTime: s.ArriveTime,
		})
	}

	// Lane gates: a bearing in the galaxy XY-disk projected onto the board rim.
	// Angles are deliberately offset from rim-tile bisectors so a float-ULP
	// difference between Go and TS can never flip the chosen tile.
	gates := []struct {
		selfX, selfY, nbX, nbY float64
		radius                 int
	}{
		{0, 0, 100, 8.7, 16},    // ~5° east-ish
		{0, 0, 64, 76, 16},      // ~50°
		{0, 0, -8.7, 100, 16},   // ~95° (near north)
		{0, 0, -77, 64, 16},     // ~140°
		{0, 0, -100, -8.7, 16},  // ~185° (near west)
		{0, 0, -64, -76, 16},    // ~230°
		{0, 0, 8.7, -100, 16},   // ~275° (near south)
		{0, 0, 77, -64, 16},     // ~320°
		{10, -20, 110, -12, 16}, // self offset, ~5° relative
		{5, 5, 30, 90, 6},       // smaller board radius
	}
	for _, c := range gates {
		f.LaneGate = append(f.LaneGate, gateCase{
			SelfX: c.selfX, SelfY: c.selfY, NeighborX: c.nbX, NeighborY: c.nbY,
			Radius: c.radius, Gate: LaneGateHex(c.selfX, c.selfY, c.nbX, c.nbY, c.radius),
		})
	}

	// StateAt — the effective-state fold. A past-ETA burn IS its settled state on
	// both sides of the wire; the folded coast's Period additionally pins the
	// world's orbital law (OrbitBasePeriod × ring) across Go and TS — if the
	// backend retunes, the TS mirror must follow or this golden breaks.
	hexBurn := &Burn{
		Path:       Line(Hex{1, 0}, Hex{6, 0}),
		StartTime:  1_000,
		ArriveTime: 13_500,
		Target:     Target{Hex: &Hex{6, 0}},
	}
	dockBurn := &Burn{
		Path:         Line(Hex{2, -1}, Hex{4, 2}),
		StartTime:    2_000,
		ArriveTime:   9_000,
		Target:       Target{FeatureId: "feat-9"},
		DockOnArrive: "feat-9",
	}
	dueTransit := &LaneTransit{
		Route:      []string{"sys-0", "sys-2"},
		LegEtas:    []common.WorldMillis{5_000, 30_000},
		DepartTime: 1_000,
		ArriveTime: 30_000,
		EntryGate:  Hex{16, 0},
	}
	// lateBurn arrives past the midpoint of its ring-cell window (15_500 on a
	// 6_000ms window), so the settled coast's boundary-snap rounds UP — pinning
	// the snap direction across Go and TS, not just the floor case.
	lateBurn := &Burn{
		Path:       Line(Hex{1, 0}, Hex{6, 0}),
		StartTime:  3_000,
		ArriveTime: 15_500,
		Target:     Target{Hex: &Hex{6, 0}},
	}
	stateAts := []struct {
		s MovementState
		t common.WorldMillis
	}{
		{MovementState{Mode: ModeBurn, Burn: hexBurn}, 7_000},   // mid-flight — unchanged
		{MovementState{Mode: ModeBurn, Burn: hexBurn}, 13_500},  // exactly at arrival — folds to coast
		{MovementState{Mode: ModeBurn, Burn: hexBurn}, 262_000}, // long past — the same coast (anchored at arrival)
		{MovementState{Mode: ModeBurn, Burn: lateBurn}, 15_500}, // arrival late in the cell window — snap rounds up
		{MovementState{Mode: ModeBurn, Burn: dockBurn}, 20_000}, // dock-on-arrive — folds to docked
		{MovementState{Mode: ModeLaneTransit, LaneTransit: dueTransit}, 99_999}, // due transit — NOT folded (arrival is effectful)
	}
	for _, c := range stateAts {
		f.StateAt = append(f.StateAt, stateAtCase{State: c.s, T: c.t, Out: StateAt(c.s, c.t)})
	}

	return f
}

func TestFixtures_MatchGolden(t *testing.T) {
	computed := computeFixtures()

	if os.Getenv("UPDATE_FIXTURES") == "1" {
		if err := os.MkdirAll(filepath.Dir(fixturesPath), 0o755); err != nil {
			t.Fatal(err)
		}
		data, _ := json.MarshalIndent(computed, "", "  ")
		if err := os.WriteFile(fixturesPath, append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote fixtures to %s", fixturesPath)
		return
	}

	raw, err := os.ReadFile(fixturesPath)
	if err != nil {
		t.Fatalf("read golden fixtures (regenerate with UPDATE_FIXTURES=1): %v", err)
	}
	var golden fixtures
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	if !reflect.DeepEqual(golden, computed) {
		t.Fatal("board output drifted from committed /fixtures/board/cases.json — " +
			"if intentional, regenerate with UPDATE_FIXTURES=1 (and update the TS side)")
	}
}
