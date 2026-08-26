package board

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"hash"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/polar"
)

// fixturesPath is the repo-root shared fixtures file. Both this Go suite and
// the TS lib/board suite assert their implementations reproduce it — the
// determinism-by-contract seam (openspec cross-stack-determinism, "Shared
// Board Math Is Pinned By a Cross-Language Golden Fixture"). Regenerate with
// UPDATE_FIXTURES=1 and commit the result.
//
// Every recorded case names the slot schedule it was generated under
// (openspec board-tactical-math, "The Production Slot Schedule Is Pinned to
// Isotropic") — a future schedule change cannot silently invalidate a case.
//
// Since the polar rewrite the recorded outputs are integer-derived end to
// end (the FMA-contractable float paths left with the hex lattice), so
// regenerating on arm64 is safe; the one float input — the lane-gate
// bearing — is discretized with off-bisector recorded cases, and the amd64
// leg of /check re-asserts every case either way.
const fixturesPath = "../../fixtures/board/cases.json"

// The pinned coordinate table's three on-disk copies: the canonical
// fixtures/board artifact, the Go-embedded copy, and the TS mirror's copy.
// The recording flow writes all three with identical bytes; the assert path
// checks byte-identity (openspec board-tactical-math, "A Pinned Coordinate
// Table Grounds Board Geometry"; cross-stack-determinism, "Pinned Constant
// Tables Are Recorded, Asserted, Never Recomputed").
const (
	tablePathCanonical = "../../fixtures/board/coordinate-table.json"
	tablePathGoEmbed   = "coordtable.json"
	tablePathTSMirror  = "../../frontend/lib/board/coordtable.json"
)

// tableSlotCounts is the pinned Isotropic family's distinct slot counts: the
// core's 1, then innerSlots 6 doubled at each of the five boundaries. The
// family is finite regardless of board radius because the schedule has no
// boundary past ring 17.
var tableSlotCounts = []int{1, 6, 12, 24, 48, 96, 192}

// generateCoordTable is THE fixture-recording flow's table generator — the
// sole place the table's trigonometry ever executes (recording-flow
// exemption; runtime code loads the committed bytes and never recomputes).
// Rounded once, here, at record time.
func generateCoordTable() []byte {
	type slotCountEntry struct {
		Slots  int        `json:"slots"`
		Points [][2]int64 `json:"points"`
	}
	table := struct {
		Scale      int64            `json:"scale"`
		SlotCounts []slotCountEntry `json:"slotCounts"`
	}{Scale: TableScale}
	for _, slots := range tableSlotCounts {
		e := slotCountEntry{Slots: slots, Points: make([][2]int64, 0, slots)}
		for s := 0; s < slots; s++ {
			angle := 2 * math.Pi * float64(s) / float64(slots)
			x := int64(math.Round(math.Cos(angle) * TableScale))
			y := int64(math.Round(math.Sin(angle) * TableScale))
			e.Points = append(e.Points, [2]int64{x, y})
		}
		table.SlotCounts = append(table.SlotCounts, e)
	}
	data, err := json.MarshalIndent(table, "", "  ")
	if err != nil {
		panic(err)
	}
	return append(data, '\n')
}

// --- fixture case shapes -----------------------------------------------------

type fixtureMeta struct {
	GeneratedOn generatedOn `json:"generatedOn"`
}

type generatedOn struct {
	GOARCH  string `json:"goarch"`
	GOAMD64 string `json:"goamd64,omitempty"`
}

// namedSchedule records the banded parameters and the counts they expand to;
// every case references a name from the schedules map.
type namedSchedule struct {
	InnerSlots int   `json:"innerSlots"`
	DoubleAt   []int `json:"doubleAt"`
	MaxRing    int   `json:"maxRing"`
	Counts     []int `json:"counts"`
}

type distCase struct {
	Schedule string `json:"schedule"`
	A        Cell   `json:"a"`
	B        Cell   `json:"b"`
	Distance int    `json:"distance"`
}

type orbCase struct {
	Schedule string             `json:"schedule"`
	Orbit    Orbit              `json:"orbit"`
	T        common.WorldMillis `json:"t"`
	Cell     Cell               `json:"cell"`
}

type backCase struct {
	Schedule string             `json:"schedule"`
	Cell     Cell               `json:"cell"`
	At       common.WorldMillis `json:"at"`
	Period   common.WorldMillis `json:"period"`
	Dir      int                `json:"dir"`
	Angle0   int                `json:"angle0"`
}

type solveCellCase struct {
	Schedule   string             `json:"schedule"`
	From       Cell               `json:"from"`
	Dest       Cell               `json:"dest"`
	Now        common.WorldMillis `json:"now"`
	MsPerTile  common.WorldMillis `json:"msPerTile"`
	Path       []Cell             `json:"path"`
	MeetCell   Cell               `json:"meetCell"`
	ArriveTime common.WorldMillis `json:"arriveTime"`
}

type solveInterceptCase struct {
	Schedule   string             `json:"schedule"`
	From       Cell               `json:"from"`
	Orbit      Orbit              `json:"orbit"`
	Now        common.WorldMillis `json:"now"`
	MsPerTile  common.WorldMillis `json:"msPerTile"`
	Horizon    common.WorldMillis `json:"horizon"`
	Path       []Cell             `json:"path"`
	MeetCell   Cell               `json:"meetCell"`
	ArriveTime common.WorldMillis `json:"arriveTime"`
}

type gateCase struct {
	Schedule  string  `json:"schedule"`
	SelfX     float64 `json:"selfX"`
	SelfY     float64 `json:"selfY"`
	NeighborX float64 `json:"neighborX"`
	NeighborY float64 `json:"neighborY"`
	Radius    int     `json:"radius"`
	Gate      Cell    `json:"gate"`
}

type stateAtCase struct {
	Schedule string             `json:"schedule"`
	State    MovementState      `json:"state"`
	T        common.WorldMillis `json:"t"`
	Out      MovementState      `json:"out"`
}

type shipPosCase struct {
	Schedule string             `json:"schedule"`
	State    MovementState      `json:"state"`
	T        common.WorldMillis `json:"t"`
	Cell     Cell               `json:"cell"`
	Ok       bool               `json:"ok"`
}

type losCase struct {
	Schedule  string     `json:"schedule"`
	Origin    Cell       `json:"origin"`
	Target    Cell       `json:"target"`
	Occluders []Occluder `json:"occluders"`
	Visible   bool       `json:"visible"`
}

type beamCase struct {
	Schedule string     `json:"schedule"`
	Origin   Cell       `json:"origin"`
	Aim      Cell       `json:"aim"`
	Params   BeamParams `json:"params"`
	Cells    []Cell     `json:"cells"`
}

// tableCase pins the coordinate table as its own fixture case: the SHA-256
// of the canonical artifact's bytes, which both suites assert their loaded
// copies match byte-for-byte.
type tableCase struct {
	Scale      int64  `json:"scale"`
	SlotCounts []int  `json:"slotCounts"`
	Digest     string `json:"digest"`
}

type sweepCase struct {
	Schedule string `json:"schedule"`
	MaxRing  int    `json:"maxRing"`
	Lines    int    `json:"lines"`
	Digest   string `json:"digest"`
}

type orbitSweepCase struct {
	Schedule string               `json:"schedule"`
	MaxRing  int                  `json:"maxRing"`
	Periods  []common.WorldMillis `json:"periods"`
	Offsets  string               `json:"offsets"`
	Lines    int                  `json:"lines"`
	Digest   string               `json:"digest"`
}

type solveCellSweepCase struct {
	Schedule  string             `json:"schedule"`
	MaxRing   int                `json:"maxRing"`
	Now       common.WorldMillis `json:"now"`
	MsPerTile common.WorldMillis `json:"msPerTile"`
	Lines     int                `json:"lines"`
	Digest    string             `json:"digest"`
}

type losSweepCase struct {
	Schedule  string     `json:"schedule"`
	MaxRing   int        `json:"maxRing"`
	Occluders []Occluder `json:"occluders"`
	Lines     int        `json:"lines"`
	Digest    string     `json:"digest"`
}

type beamSweepCase struct {
	Schedule string     `json:"schedule"`
	MaxRing  int        `json:"maxRing"`
	Params   BeamParams `json:"params"`
	Lines    int        `json:"lines"`
	Digest   string     `json:"digest"`
}

type fixtures struct {
	Meta              *fixtureMeta             `json:"_meta,omitempty"`
	Schedules         map[string]namedSchedule `json:"schedules"`
	CoordinateTable   tableCase                `json:"coordinateTable"`
	Distance          []distCase               `json:"distance"`
	OrbState          []orbCase                `json:"orbState"`
	OrbitThrough      []backCase               `json:"orbitThrough"`
	SolveCell         []solveCellCase          `json:"solveCell"`
	SolveIntercept    []solveInterceptCase     `json:"solveIntercept"`
	LaneGate          []gateCase               `json:"laneGate"`
	StateAt           []stateAtCase            `json:"stateAt"`
	ShipPos           []shipPosCase            `json:"shipPos"`
	LineOfSight       []losCase                `json:"lineOfSight"`
	Beam              []beamCase               `json:"beam"`
	DistanceSweep     []sweepCase              `json:"distanceSweep"`
	OrbStateSweep     []orbitSweepCase         `json:"orbStateSweep"`
	OrbitThroughSweep []orbitSweepCase         `json:"orbitThroughSweep"`
	SolveCellSweep    []solveCellSweepCase     `json:"solveCellSweep"`
	LineOfSightSweep  []losSweepCase           `json:"lineOfSightSweep"`
	BeamSweep         []beamSweepCase          `json:"beamSweep"`
}

// fixtureSchedules are the named schedules recorded in the file — all
// Isotropic (the pinned production family), differing only in maxRing
// (board radius is per-system).
func fixtureSchedules() map[string]namedSchedule {
	entry := func(maxRing int) namedSchedule {
		return namedSchedule{
			InnerSlots: InnerSlots,
			DoubleAt:   DoubleAt(),
			MaxRing:    maxRing,
			Counts:     Schedule(maxRing).Counts,
		}
	}
	return map[string]namedSchedule{
		"isotropic16": entry(16),
		"isotropic10": entry(10),
	}
}

func scheduleByName(t testing.TB, name string) polar.Schedule {
	ns, ok := fixtureSchedules()[name]
	if !ok {
		t.Fatalf("fixture case names unknown schedule %q", name)
	}
	return polar.Schedule{MaxRing: ns.MaxRing, Counts: ns.Counts}
}

// sweepPeriods is the fixed, named period list the orbit sweeps record: 1
// and 7 exercise degenerate and non-divisible quotients, 12 divides the
// inner rings' slot counts, 5000 is a plausible world period, and 10^15
// forces the wide-integer path while staying exactly representable in a
// float64 (the TS side parses JSON numbers).
var sweepPeriods = []common.WorldMillis{1, 7, 12, 5_000, 1_000_000_000_000_000}

// --- sweep serializations ----------------------------------------------------
//
// Preimages are newline-joined decimal serializations (no trailing newline),
// hashed incrementally. Cell-pair enumeration order everywhere: fromRing,
// fromSlot, toRing, toSlot ascending; orbit sweeps by ring, slot, period
// (listed order), direction (−1, +1), then offset (listed order).

type sweepHash struct {
	h     hash.Hash
	lines int
}

func newSweepHash() *sweepHash { return &sweepHash{h: sha256.New()} }

func (s *sweepHash) line(l string) {
	if s.lines > 0 {
		s.h.Write([]byte{'\n'})
	}
	s.h.Write([]byte(l))
	s.lines++
}

func (s *sweepHash) sum() string { return hex.EncodeToString(s.h.Sum(nil)) }

func cellsSerial(cells []Cell) string {
	var sb strings.Builder
	for i, c := range cells {
		if i > 0 {
			sb.WriteByte(',')
		}
		fmt.Fprintf(&sb, "%d:%d", c.Ring, c.Slot)
	}
	return sb.String()
}

func sweepDistance(s polar.Schedule, maxRing int) (int, string) {
	sh := newSweepHash()
	for fr := 0; fr <= maxRing; fr++ {
		for fs := range s.Slots(fr) {
			for tr := 0; tr <= maxRing; tr++ {
				for ts := range s.Slots(tr) {
					sh.line(fmt.Sprintf("%d", Distance(Cell{Ring: fr, Slot: fs}, Cell{Ring: tr, Slot: ts}, s)))
				}
			}
		}
	}
	return sh.lines, sh.sum()
}

func sweepOffsets(period common.WorldMillis) []common.WorldMillis {
	out := make([]common.WorldMillis, 0, 5)
	for k := int64(0); k <= 4; k++ {
		out = append(out, common.WorldMillis(int64(period)*k/4))
	}
	return out
}

func sweepOrbState(s polar.Schedule, maxRing int) (int, string) {
	sh := newSweepHash()
	for ring := 0; ring <= maxRing; ring++ {
		for slot := range s.Slots(ring) {
			for _, period := range sweepPeriods {
				for _, dir := range []int{-1, 1} {
					for _, t := range sweepOffsets(period) {
						c := OrbState(Orbit{Ring: ring, Angle0: slot, Period: period, Dir: dir}, t, s)
						sh.line(fmt.Sprintf("%d:%d", c.Ring, c.Slot))
					}
				}
			}
		}
	}
	return sh.lines, sh.sum()
}

func sweepOrbitThrough(s polar.Schedule, maxRing int) (int, string) {
	sh := newSweepHash()
	for ring := 0; ring <= maxRing; ring++ {
		for slot := range s.Slots(ring) {
			for _, period := range sweepPeriods {
				for _, dir := range []int{-1, 1} {
					for _, at := range sweepOffsets(period) {
						o := OrbitThrough(Cell{Ring: ring, Slot: slot}, at, period, dir, s)
						sh.line(fmt.Sprintf("%d:%d", o.Ring, o.Angle0))
					}
				}
			}
		}
	}
	return sh.lines, sh.sum()
}

func sweepSolveCell(s polar.Schedule, maxRing int, now, msPerTile common.WorldMillis) (int, string) {
	sh := newSweepHash()
	for fr := 0; fr <= maxRing; fr++ {
		for fs := range s.Slots(fr) {
			for tr := 0; tr <= maxRing; tr++ {
				for ts := range s.Slots(tr) {
					sol := SolveCell(Cell{Ring: fr, Slot: fs}, Cell{Ring: tr, Slot: ts}, now, msPerTile, s)
					sh.line(cellsSerial(sol.Path) + "|" + fmt.Sprintf("%d", sol.ArriveTime))
				}
			}
		}
	}
	return sh.lines, sh.sum()
}

func sweepLineOfSight(s polar.Schedule, maxRing int, occluders []Occluder) (int, string) {
	sh := newSweepHash()
	for fr := 0; fr <= maxRing; fr++ {
		for fs := range s.Slots(fr) {
			for tr := 0; tr <= maxRing; tr++ {
				for ts := range s.Slots(tr) {
					if LineOfSight(Cell{Ring: fr, Slot: fs}, Cell{Ring: tr, Slot: ts}, occluders, s) {
						sh.line("1")
					} else {
						sh.line("0")
					}
				}
			}
		}
	}
	return sh.lines, sh.sum()
}

func sweepBeam(s polar.Schedule, maxRing int, p BeamParams) (int, string) {
	sh := newSweepHash()
	for fr := 0; fr <= maxRing; fr++ {
		for fs := range s.Slots(fr) {
			for tr := 0; tr <= maxRing; tr++ {
				for ts := range s.Slots(tr) {
					sh.line(cellsSerial(BeamCells(Cell{Ring: fr, Slot: fs}, Cell{Ring: tr, Slot: ts}, p, s)))
				}
			}
		}
	}
	return sh.lines, sh.sum()
}

// --- golden ------------------------------------------------------------------

// computeFixtures builds the golden cases from the current implementation.
func computeFixtures(t testing.TB) fixtures {
	f := fixtures{Schedules: fixtureSchedules()}
	s10 := scheduleByName(t, "isotropic10")
	// isotropic16 is named by the laneGate cases; LaneGateCell derives its
	// own schedule from the radius, so the map entry is the record, not an
	// input here.
	_ = scheduleByName(t, "isotropic16")

	// The pinned coordinate table, as data: the canonical artifact's digest.
	canonical, err := os.ReadFile(tablePathCanonical)
	if err != nil {
		t.Fatalf("read canonical coordinate table: %v", err)
	}
	sum := sha256.Sum256(canonical)
	f.CoordinateTable = tableCase{Scale: TableScale, SlotCounts: tableSlotCounts, Digest: hex.EncodeToString(sum[:])}

	for _, c := range []struct {
		a, b Cell
	}{
		{Cell{Ring: 5, Slot: 3}, Cell{Ring: 5, Slot: 3}},
		{Cell{Ring: 5, Slot: 3}, Cell{Ring: 5, Slot: 4}},
		{Cell{Ring: 4, Slot: 0}, Cell{Ring: 5, Slot: 2}}, // the loose fork's phantom pair — two hops now
		{Cell{Ring: 0, Slot: 0}, Cell{Ring: 2, Slot: 0}},
		{Cell{Ring: 1, Slot: 0}, Cell{Ring: 1, Slot: 3}}, // cuts through the core
		{Cell{Ring: 10, Slot: 90}, Cell{Ring: 2, Slot: 3}},
	} {
		f.Distance = append(f.Distance, distCase{Schedule: "isotropic10", A: c.a, B: c.b, Distance: Distance(c.a, c.b, s10)})
	}

	orbits := []Orbit{
		{Ring: 3, Angle0: 2, Period: 1_000_000_000_000_000, Dir: 1}, // static (huge period, float64-exact)
		{Ring: 2, Angle0: 0, Period: 12_000, Dir: 1},                // moving prograde
		{Ring: 4, Angle0: 7, Period: 48_000, Dir: -1},               // moving retrograde
	}
	for _, o := range orbits {
		for _, tm := range []common.WorldMillis{0, 3_000, 6_000, 24_000} {
			f.OrbState = append(f.OrbState, orbCase{Schedule: "isotropic10", Orbit: o, T: tm, Cell: OrbState(o, tm, s10)})
		}
	}

	for _, c := range []struct {
		cell       Cell
		at, period common.WorldMillis
		dir        int
	}{
		{Cell{Ring: 4, Slot: 7}, 123_456, 48_000, -1},
		{Cell{Ring: 2, Slot: 5}, 10, 7, 1}, // truncating, period smaller than elapsed
		{Cell{Ring: 0, Slot: 0}, 987_654, 12_000, 1},
		{Cell{Ring: 9, Slot: 42}, 2_600_000_000_000_000, 1_000_000_000_000_000, 1}, // wide-integer path
	} {
		o := OrbitThrough(c.cell, c.at, c.period, c.dir, s10)
		f.OrbitThrough = append(f.OrbitThrough, backCase{
			Schedule: "isotropic10", Cell: c.cell, At: c.at, Period: c.period, Dir: c.dir, Angle0: o.Angle0,
		})
	}

	for _, c := range []struct {
		from, dest Cell
		now, mspt  common.WorldMillis
	}{
		{Cell{Ring: 0, Slot: 0}, Cell{Ring: 5, Slot: 0}, 0, 1000}, // core departure, purely radial
		{Cell{Ring: 2, Slot: 0}, Cell{Ring: 7, Slot: 10}, 10_000, 500},
		{Cell{Ring: 5, Slot: 1}, Cell{Ring: 5, Slot: 25}, 0, 2_500},    // across the star: the arc, no detour
		{Cell{Ring: 2, Slot: 0}, Cell{Ring: 1, Slot: 1}, 5_000, 2_500}, // stitched tail
	} {
		sol := SolveCell(c.from, c.dest, c.now, c.mspt, s10)
		f.SolveCell = append(f.SolveCell, solveCellCase{
			Schedule: "isotropic10", From: c.from, Dest: c.dest, Now: c.now, MsPerTile: c.mspt,
			Path: sol.Path, MeetCell: sol.MeetCell, ArriveTime: sol.ArriveTime,
		})
	}

	for _, c := range []struct {
		from            Cell
		orbit           Orbit
		now, mspt, hori common.WorldMillis
	}{
		{Cell{Ring: 0, Slot: 0}, Orbit{Ring: 5, Angle0: 3, Period: 1_000_000_000_000_000, Dir: 1}, 0, 1000, 10_000_000}, // static → collapse
		{Cell{Ring: 0, Slot: 0}, Orbit{Ring: 6, Angle0: 0, Period: 600_000, Dir: 1}, 0, 1000, 5_000_000},
		// Mid-window order time against a moving body — pins that arrival is
		// the body's slot-ENTRY instant (the glide seam), not now + travel.
		{Cell{Ring: 6, Slot: 30}, Orbit{Ring: 2, Angle0: 0, Period: 12_000, Dir: 1}, 650, 300, 60_000},
		// Retrograde, period NOT divisible by the slot count — pins the ceil
		// rounding of the entry instant across Go int64 and TS BigInt.
		{Cell{Ring: 5, Slot: 0}, Orbit{Ring: 4, Angle0: 7, Period: 50_000, Dir: -1}, 1_234, 700, 300_000},
	} {
		sol := SolveIntercept(c.from, c.orbit, c.now, c.mspt, c.hori, s10)
		f.SolveIntercept = append(f.SolveIntercept, solveInterceptCase{
			Schedule: "isotropic10", From: c.from, Orbit: c.orbit, Now: c.now, MsPerTile: c.mspt, Horizon: c.hori,
			Path: sol.Path, MeetCell: sol.MeetCell, ArriveTime: sol.ArriveTime,
		})
	}

	// Lane gates: a bearing in the galaxy XY-disk projected onto the gate
	// ring. Angles are deliberately offset from slot bisectors so a float-ULP
	// difference between Go and TS can never flip the chosen slot.
	for _, c := range []struct {
		selfX, selfY, nbX, nbY float64
		radius                 int
	}{
		{0, 0, 100, 8.7, 16},    // ~5° east-ish
		{0, 0, 64, 76, 16},      // ~50°
		{0, 0, -8.7, 100, 16},   // ~95°
		{0, 0, -77, 64, 16},     // ~140°
		{0, 0, -100, -8.7, 16},  // ~185°
		{0, 0, -64, -76, 16},    // ~230°
		{0, 0, 8.7, -100, 16},   // ~275°
		{0, 0, 77, -64, 16},     // ~320°
		{10, -20, 110, -12, 16}, // self offset, ~5° relative
		{5, 5, 30, 90, 6},       // smaller board radius
	} {
		f.LaneGate = append(f.LaneGate, gateCase{
			Schedule: "isotropic16", SelfX: c.selfX, SelfY: c.selfY, NeighborX: c.nbX, NeighborY: c.nbY,
			Radius: c.radius, Gate: LaneGateCell(c.selfX, c.selfY, c.nbX, c.nbY, c.radius),
		})
	}

	// StateAt — the effective-state fold. A past-ETA burn IS its settled
	// state on both sides of the wire; the folded coast's Period additionally
	// pins the world's orbital law (OrbitBasePeriod × ring) across Go and TS.
	burnPath := polar.ArcPath(Cell{Ring: 1, Slot: 0}, Cell{Ring: 6, Slot: 0}, s10)
	cellBurn := &Burn{
		Path:       burnPath,
		StartTime:  1_000,
		ArriveTime: 13_500,
		Target:     Target{Cell: &Cell{Ring: 6, Slot: 0}},
	}
	dockBurn := &Burn{
		Path:         polar.ArcPath(Cell{Ring: 2, Slot: 1}, Cell{Ring: 4, Slot: 9}, s10),
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
		EntryGate:  Cell{Ring: 13, Slot: 0},
	}
	// lateBurn arrives past the midpoint of its ring-cell window (16_000 on
	// ring 6's 4_500ms window), so the settled coast's boundary-snap rounds
	// UP — pinning the snap direction across Go and TS, not just the floor
	// case.
	lateBurn := &Burn{
		Path:       burnPath,
		StartTime:  3_000,
		ArriveTime: 16_000,
		Target:     Target{Cell: &Cell{Ring: 6, Slot: 0}},
	}
	for _, c := range []struct {
		st MovementState
		t  common.WorldMillis
	}{
		{MovementState{Mode: ModeBurn, Burn: cellBurn}, 7_000},                  // mid-flight — unchanged
		{MovementState{Mode: ModeBurn, Burn: cellBurn}, 13_500},                 // exactly at arrival — folds to coast
		{MovementState{Mode: ModeBurn, Burn: cellBurn}, 262_000},                // long past — the same coast (anchored at arrival)
		{MovementState{Mode: ModeBurn, Burn: lateBurn}, 16_000},                 // arrival late in the cell window — snap rounds up
		{MovementState{Mode: ModeBurn, Burn: dockBurn}, 20_000},                 // dock-on-arrive — folds to docked
		{MovementState{Mode: ModeLaneTransit, LaneTransit: dueTransit}, 99_999}, // due transit — NOT folded (arrival is effectful)
	} {
		f.StateAt = append(f.StateAt, stateAtCase{Schedule: "isotropic10", State: c.st, T: c.t, Out: StateAt(c.st, c.t, s10)})
	}

	// ShipPos — the computed board position (a NEW family: the hex fixture
	// never covered it, flagged in the old coverage inventory).
	legBurn := &Burn{Path: burnPath, StartTime: 1_000, ArriveTime: 1_000 + common.WorldMillis(len(burnPath)-1)*2_500}
	boardLegTransit := &LaneTransit{
		BoardLeg: &BoardLeg{Path: burnPath, StartTime: 0, GateEta: 10_000},
		Route:    []string{"a", "b"}, LegEtas: []common.WorldMillis{10_000, 50_000},
		ArriveTime: 50_000, EntryGate: Cell{Ring: 13, Slot: 0},
	}
	coast := CoastAt(Cell{Ring: 4, Slot: 7}, 123_456, s10)
	for _, c := range []struct {
		st MovementState
		t  common.WorldMillis
	}{
		{coast, 200_000}, // live orbital position
		{MovementState{Mode: ModeBurn, Burn: legBurn}, 8_500},                                          // mid-burn interpolation
		{MovementState{Mode: ModeBurn, Burn: legBurn}, legBurn.ArriveTime + 50_000},                    // settled — folds to coast position
		{MovementState{Mode: ModeDocked, Docked: &Docked{ParentId: "feat-9"}}, 5_000},                  // no board cell
		{MovementState{Mode: ModeLaneTransit, LaneTransit: boardLegTransit}, 5_000},                    // board leg — on board
		{MovementState{Mode: ModeLaneTransit, LaneTransit: boardLegTransit}, 20_000},                   // out on the lane
		{MovementState{Mode: ModeLaneHold, LaneHold: &LaneHold{From: "a", To: "b", Fraction: 0.5}}, 0}, // parked mid-lane
	} {
		cell, ok := ShipPos(c.st, c.t, s10)
		f.ShipPos = append(f.ShipPos, shipPosCase{Schedule: "isotropic10", State: c.st, T: c.t, Cell: cell, Ok: ok})
	}

	// Line of sight (#0006 Decision #16, polar form): strictly-between chord
	// occlusion on pinned centers; the star occludes across the core.
	star := Occluder{Cell: Cell{Ring: 0, Slot: 0}, Radius2: StarOcclusionRadius2}
	planet := Occluder{Cell: Cell{Ring: 4, Slot: 0}, Radius2: PlanetOcclusionRadius2}
	for _, c := range []struct {
		origin, target Cell
		occ            []Occluder
	}{
		{Cell{Ring: 6, Slot: 0}, Cell{Ring: 6, Slot: 24}, []Occluder{star}},         // across the core — blocked
		{Cell{Ring: 6, Slot: 0}, Cell{Ring: 6, Slot: 4}, []Occluder{star}},          // same side — clear
		{Cell{Ring: 1, Slot: 0}, Cell{Ring: 8, Slot: 0}, []Occluder{planet}},        // radially behind the planet — blocked
		{Cell{Ring: 1, Slot: 0}, Cell{Ring: 4, Slot: 0}, []Occluder{planet}},        // the occluder itself — visible
		{Cell{Ring: 1, Slot: 0}, Cell{Ring: 3, Slot: 0}, []Occluder{planet}},        // in front — visible
		{Cell{Ring: 1, Slot: 0}, Cell{Ring: 8, Slot: 12}, []Occluder{planet}},       // off-axis — visible
		{Cell{Ring: 2, Slot: 3}, Cell{Ring: 9, Slot: 40}, nil},                      // no occluders at all
		{Cell{Ring: 8, Slot: 40}, Cell{Ring: 2, Slot: 2}, []Occluder{star, planet}}, // two occluders
	} {
		f.LineOfSight = append(f.LineOfSight, losCase{
			Schedule: "isotropic10", Origin: c.origin, Target: c.target, Occluders: c.occ,
			Visible: LineOfSight(c.origin, c.target, c.occ, s10),
		})
	}

	// The beam corridor (#0006 Decision #15, polar form): widening corridor
	// around the origin→aim ray, exact rational spread, clipped at the rim.
	for _, c := range []struct {
		origin, aim Cell
		params      BeamParams
	}{
		{Cell{Ring: 1, Slot: 0}, Cell{Ring: 5, Slot: 0}, BeamParams{HalfWidthBase: TableScale / 2, SpreadNum: 1, SpreadDen: 4, RimRing: 8}},
		{Cell{Ring: 4, Slot: 20}, Cell{Ring: 0, Slot: 0}, BeamParams{HalfWidthBase: TableScale / 2, SpreadNum: 1, SpreadDen: 4, RimRing: 8}},
		{Cell{Ring: 2, Slot: 3}, Cell{Ring: 7, Slot: 40}, BeamParams{HalfWidthBase: 0, SpreadNum: 1, SpreadDen: 3, RimRing: 10}},
	} {
		f.Beam = append(f.Beam, beamCase{
			Schedule: "isotropic10", Origin: c.origin, Aim: c.aim, Params: c.params,
			Cells: BeamCells(c.origin, c.aim, c.params, s10),
		})
	}

	// --- exhaustive sweeps (bounded, ordered, digest-pinned) ---------------

	const offsetsNote = "floor(period*k/4) for k in 0..4"
	{
		// maxRing 5 keeps the TS BFS re-enumeration fast (13,225 pairs)
		// while still spanning three doubling boundaries.
		lines, digest := sweepDistance(s10, 5)
		f.DistanceSweep = []sweepCase{{Schedule: "isotropic10", MaxRing: 5, Lines: lines, Digest: digest}}
	}
	{
		lines, digest := sweepOrbState(s10, 10)
		f.OrbStateSweep = []orbitSweepCase{{Schedule: "isotropic10", MaxRing: 10, Periods: sweepPeriods, Offsets: offsetsNote, Lines: lines, Digest: digest}}
	}
	{
		lines, digest := sweepOrbitThrough(s10, 10)
		f.OrbitThroughSweep = []orbitSweepCase{{Schedule: "isotropic10", MaxRing: 10, Periods: sweepPeriods, Offsets: offsetsNote, Lines: lines, Digest: digest}}
	}
	{
		lines, digest := sweepSolveCell(s10, 10, 1_000, 2_500)
		f.SolveCellSweep = []solveCellSweepCase{{Schedule: "isotropic10", MaxRing: 10, Now: 1_000, MsPerTile: 2_500, Lines: lines, Digest: digest}}
	}
	{
		occ := []Occluder{star, planet}
		lines, digest := sweepLineOfSight(s10, 8, occ)
		f.LineOfSightSweep = []losSweepCase{{Schedule: "isotropic10", MaxRing: 8, Occluders: occ, Lines: lines, Digest: digest}}
	}
	{
		p := BeamParams{HalfWidthBase: TableScale / 2, SpreadNum: 1, SpreadDen: 4, RimRing: 4}
		lines, digest := sweepBeam(s10, 4, p)
		f.BeamSweep = []beamSweepCase{{Schedule: "isotropic10", MaxRing: 4, Params: p, Lines: lines, Digest: digest}}
	}

	return f
}

// TestCoordinateTable_ByteIdentical asserts the three committed copies of
// the pinned coordinate table are byte-identical (tasks.md 3.2): canonical
// fixtures artifact, the Go-embedded copy this package computes with, and
// the TS mirror's copy. It also asserts the runtime loader parses the
// embedded bytes (a load failure panics).
func TestCoordinateTable_ByteIdentical(t *testing.T) {
	canonical, err := os.ReadFile(tablePathCanonical)
	if err != nil {
		t.Fatalf("read canonical table: %v", err)
	}
	if !bytes.Equal(coordTableRaw, canonical) {
		t.Fatal("backend/board/coordtable.json differs from fixtures/board/coordinate-table.json — re-record via UPDATE_FIXTURES=1")
	}
	tsCopy, err := os.ReadFile(tablePathTSMirror)
	if err != nil {
		t.Fatalf("read TS mirror table: %v", err)
	}
	if !bytes.Equal(tsCopy, canonical) {
		t.Fatal("frontend/lib/board/coordtable.json differs from fixtures/board/coordinate-table.json — re-record via UPDATE_FIXTURES=1")
	}
	for _, slots := range tableSlotCounts {
		if got := len(tablePoints(slots)); got != slots {
			t.Fatalf("loaded table has %d points for slot count %d", got, slots)
		}
	}
}

func TestFixtures_MatchGolden(t *testing.T) {
	if os.Getenv("UPDATE_FIXTURES") == "1" {
		// The recording flow generates the pinned coordinate table FIRST —
		// the only place its trigonometry executes — and writes the three
		// byte-identical copies. If the generated bytes differ from the
		// embedded copy the test binary computed cases with, stop: rebuild
		// and re-run so the recorded cases use the new table.
		generated := generateCoordTable()
		for _, path := range []string{tablePathCanonical, tablePathGoEmbed, tablePathTSMirror} {
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, generated, 0o644); err != nil {
				t.Fatal(err)
			}
		}
		if !bytes.Equal(generated, coordTableRaw) {
			t.Fatal("the regenerated coordinate table differs from the embedded copy this binary was built with — " +
				"the three copies have been rewritten; rebuild and re-run UPDATE_FIXTURES=1 so the recorded cases use the new table")
		}

		computed := computeFixtures(t)
		// Provenance stamp: the build target this regeneration ran on
		// (openspec cross-stack-determinism, provenance requirement).
		computed.Meta = &fixtureMeta{GeneratedOn: generatedOn{
			GOARCH:  runtime.GOARCH,
			GOAMD64: os.Getenv("GOAMD64"),
		}}
		data, err := json.MarshalIndent(computed, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(fixturesPath, append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote fixtures to %s", fixturesPath)
		return
	}

	computed := computeFixtures(t)
	raw, err := os.ReadFile(fixturesPath)
	if err != nil {
		t.Fatalf("read golden fixtures (regenerate with UPDATE_FIXTURES=1): %v", err)
	}
	var golden fixtures
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	// The provenance stamp is where the file was RECORDED; this assert runs
	// on every target in the build matrix, so the stamp must not participate
	// in the comparison.
	golden.Meta = nil
	if !reflect.DeepEqual(golden, computed) {
		t.Fatal("board output drifted from committed /fixtures/board/cases.json — " +
			"if intentional, regenerate with UPDATE_FIXTURES=1 (and update the TS side)")
	}
}
