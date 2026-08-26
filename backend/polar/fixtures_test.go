package polar

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"hash"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"hexaverse/common"
)

// fixturesPath is the repo-root shared fixture file for the POLAR lattice —
// a sibling of /fixtures/board/cases.json, never an extension of it (that
// file is owned by backend/board's fixed regeneration struct, and this
// change is barred from touching backend/board). This Go suite OWNS the
// file: `UPDATE_FIXTURES=1 go test ./polar/...` regenerates it; the TS
// mirror (frontend/lib/polar/fixtures.test.ts) is a read-only consumer.
//
// Every recorded case names the slot schedule it was generated under
// (openspec polar-lattice-math, "A New Cross-Language Fixture Family Pins
// the Lattice") — resolving the open slot-schedule decision (Decision 2)
// must not silently invalidate a recorded case.
//
// The four sweep families pin the exhaustive enumerations of the "Sweep
// Domain Is Bounded" requirement: maxRing 10 under the tight6 schedule
// (451 cells, 203,401 ordered pairs — inside the sweep-eligibility bound of
// 10^6 the cross-stack-determinism schema pins), a fixed period list, and
// the fixed period-relative offsets ⌊period·k÷4⌋ for k in 0..4. Digests are
// SHA-256 over the newline-joined decimal serializations the spec fixes —
// never JSON, so Go and JS float/key-order formatting can't leak in.
const fixturesPath = "../../fixtures/polar/cases.json"

// sweepMaxRing is the concrete bound chosen for every sweep family
// (tasks.md 3.3 names it): rings 0–10 under tight6 = 451 cells.
const sweepMaxRing = 10

// sweepPeriods is the fixed, named, finite period list every orbit sweep
// records: 1 and 7 exercise degenerate and non-divisible quotients, 12
// divides the inner rings' slot counts, 5000 is a plausible world period,
// and 10^15 forces the wide-integer path (×96 slots ≈ 10^17 — beyond
// float64's 2^53, inside int64).
var sweepPeriods = []common.WorldMillis{1, 7, 12, 5_000, 1_000_000_000_000_000}

type fixtureMeta struct {
	GeneratedOn generatedOn `json:"generatedOn"`
}

type generatedOn struct {
	GOARCH    string `json:"goarch"`
	GOAMD64   string `json:"goamd64,omitempty"`
	JSRuntime string `json:"jsRuntime,omitempty"`
}

// namedSchedule records both the banded parameters and the counts they
// expand to; the bandedSchedule family asserts the expansion in both
// languages, and every other case references the name.
type namedSchedule struct {
	InnerSlots int   `json:"innerSlots"`
	DoubleAt   []int `json:"doubleAt"`
	MaxRing    int   `json:"maxRing"`
	Counts     []int `json:"counts"`
}

type bandedCase struct {
	Schedule string `json:"schedule"`
}

type normCase struct {
	Slot  int `json:"slot"`
	Slots int `json:"slots"`
	Out   int `json:"out"`
}

type schedValCase struct {
	Name     string   `json:"name"`
	Schedule Schedule `json:"schedule"`
	Valid    bool     `json:"valid"`
}

type adjCase struct {
	Schedule string `json:"schedule"`
	A        Cell   `json:"a"`
	B        Cell   `json:"b"`
	Adjacent bool   `json:"adjacent"`
}

type pathCase struct {
	Schedule string `json:"schedule"`
	From     Cell   `json:"from"`
	To       Cell   `json:"to"`
	Path     []Cell `json:"path"`
}

type advCase struct {
	Schedule string             `json:"schedule"`
	Orbit    Orbit              `json:"orbit"`
	T        common.WorldMillis `json:"t"`
	Cell     Cell               `json:"cell"`
}

type backCase struct {
	Schedule  string             `json:"schedule"`
	Cell      Cell               `json:"cell"`
	At        common.WorldMillis `json:"at"`
	Period    common.WorldMillis `json:"period"`
	Dir       int                `json:"dir"`
	EpochSlot int                `json:"epochSlot"`
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

type fixtures struct {
	Meta                *fixtureMeta             `json:"_meta,omitempty"`
	Schedules           map[string]namedSchedule `json:"schedules"`
	BandedSchedule      []bandedCase             `json:"bandedSchedule"`
	NormalizeSlot       []normCase               `json:"normalizeSlot"`
	ScheduleValidation  []schedValCase           `json:"scheduleValidation"`
	Adjacency           []adjCase                `json:"adjacency"`
	ArcPath             []pathCase               `json:"arcPath"`
	OrbitAdvance        []advCase                `json:"orbitAdvance"`
	OrbitBackSolve      []backCase               `json:"orbitBackSolve"`
	ArcPathSweep        []sweepCase              `json:"arcPathSweep"`
	AdjacencySweep      []sweepCase              `json:"adjacencySweep"`
	OrbitAdvanceSweep   []orbitSweepCase         `json:"orbitAdvanceSweep"`
	OrbitBackSolveSweep []orbitSweepCase         `json:"orbitBackSolveSweep"`
}

// fixtureSchedules are the schedules recorded in the file. tight6 is the
// spike's default banding, balanced12 its "Balanced" preset — recorded as
// two of the candidates, never as THE schedule (Decision 2 stays open).
func fixtureSchedules() map[string]namedSchedule {
	entry := func(inner int, doubleAt []int, maxRing int) namedSchedule {
		return namedSchedule{
			InnerSlots: inner,
			DoubleAt:   doubleAt,
			MaxRing:    maxRing,
			Counts:     NewBandedSchedule(inner, doubleAt, maxRing).Counts,
		}
	}
	return map[string]namedSchedule{
		"tight6":     entry(6, []int{2, 3, 5, 9, 17}, 20),
		"balanced12": entry(12, []int{3, 5, 9, 17}, 20),
	}
}

func scheduleByName(t testing.TB, name string) Schedule {
	ns, ok := fixtureSchedules()[name]
	if !ok {
		t.Fatalf("fixture case names unknown schedule %q", name)
	}
	return Schedule{MaxRing: ns.MaxRing, Counts: ns.Counts}
}

// --- sweep serializations ----------------------------------------------------
//
// Preimages are the newline-joined decimal serializations the spec fixes,
// hashed incrementally (no trailing newline). Enumeration order everywhere:
// fromRing, fromSlot, toRing, toSlot ascending; orbit sweeps by ring, slot,
// period (listed order), direction (−1, +1), then offset (listed order).

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

func sweepArcPath(s Schedule, maxRing int) (int, string) {
	sh := newSweepHash()
	var sb strings.Builder
	for fr := 0; fr <= maxRing; fr++ {
		for fs := range s.Slots(fr) {
			for tr := 0; tr <= maxRing; tr++ {
				for ts := range s.Slots(tr) {
					sb.Reset()
					for j, c := range ArcPath(Cell{fr, fs}, Cell{tr, ts}, s) {
						if j > 0 {
							sb.WriteByte(',')
						}
						fmt.Fprintf(&sb, "%d:%d", c.Ring, c.Slot)
					}
					sh.line(sb.String())
				}
			}
		}
	}
	return sh.lines, sh.sum()
}

func sweepAdjacency(s Schedule, maxRing int) (int, string) {
	sh := newSweepHash()
	for fr := 0; fr <= maxRing; fr++ {
		for fs := range s.Slots(fr) {
			for tr := 0; tr <= maxRing; tr++ {
				for ts := range s.Slots(tr) {
					if IsAdjacent(Cell{fr, fs}, Cell{tr, ts}, s) {
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

// sweepOffsets are the fixed period-relative world times: ⌊period·k÷4⌋ for
// k in 0..4 — never a rounded floating-point fraction of the period.
func sweepOffsets(period common.WorldMillis) []common.WorldMillis {
	out := make([]common.WorldMillis, 0, 5)
	for k := int64(0); k <= 4; k++ {
		out = append(out, common.WorldMillis(int64(period)*k/4))
	}
	return out
}

func sweepOrbitAdvance(s Schedule, maxRing int) (int, string) {
	sh := newSweepHash()
	for ring := 0; ring <= maxRing; ring++ {
		for slot := range s.Slots(ring) {
			for _, period := range sweepPeriods {
				for _, dir := range []int{-1, 1} {
					for _, t := range sweepOffsets(period) {
						c := CellAt(Orbit{Ring: ring, EpochSlot: slot, Period: period, Dir: dir}, t, s)
						sh.line(fmt.Sprintf("%d:%d", c.Ring, c.Slot))
					}
				}
			}
		}
	}
	return sh.lines, sh.sum()
}

func sweepOrbitBackSolve(s Schedule, maxRing int) (int, string) {
	sh := newSweepHash()
	for ring := 0; ring <= maxRing; ring++ {
		for slot := range s.Slots(ring) {
			for _, period := range sweepPeriods {
				for _, dir := range []int{-1, 1} {
					for _, at := range sweepOffsets(period) {
						o := OrbitThrough(Cell{ring, slot}, at, period, dir, s)
						sh.line(fmt.Sprintf("%d:%d", o.Ring, o.EpochSlot))
					}
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
	tight6 := scheduleByName(t, "tight6")
	balanced12 := scheduleByName(t, "balanced12")

	f.BandedSchedule = []bandedCase{{Schedule: "tight6"}, {Schedule: "balanced12"}}

	for _, c := range []struct{ slot, slots int }{
		{-1, 24}, {25, 24}, {0, 24}, {24, 24}, {-25, 24}, {7, 1},
	} {
		f.NormalizeSlot = append(f.NormalizeSlot, normCase{Slot: c.slot, Slots: c.slots, Out: NormalizeSlot(c.slot, c.slots)})
	}

	for _, c := range []struct {
		name string
		s    Schedule
	}{
		{"banded tight6", Schedule{MaxRing: tight6.MaxRing, Counts: tight6.Counts}},
		{"core-only board", Schedule{MaxRing: 0, Counts: []int{1}}},
		{"ring-1 slot count of three (core step exempt from the ratio rule)", Schedule{MaxRing: 1, Counts: []int{1, 3}}},
		{"zero-slot ring", Schedule{MaxRing: 1, Counts: []int{1, 0}}},
		{"one-slot ring", Schedule{MaxRing: 1, Counts: []int{1, 1}}},
		{"ratio 4", Schedule{MaxRing: 2, Counts: []int{1, 6, 24}}},
		{"decreasing", Schedule{MaxRing: 2, Counts: []int{1, 12, 6}}},
		{"ring 0 not the single core", Schedule{MaxRing: 1, Counts: []int{6, 6}}},
		{"undefined ring within own bound", Schedule{MaxRing: 2, Counts: []int{1, 6}}},
		{"counts beyond the declared bound", Schedule{MaxRing: 2, Counts: []int{1, 6, 12, 24}}},
	} {
		f.ScheduleValidation = append(f.ScheduleValidation, schedValCase{Name: c.name, Schedule: c.s, Valid: c.s.Validate() == nil})
	}

	adjInputs := []struct {
		sched string
		a, b  Cell
	}{
		{"tight6", Cell{5, 3}, Cell{5, 4}},     // consecutive slots
		{"tight6", Cell{5, 47}, Cell{5, 0}},    // consecutive across the wrap
		{"tight6", Cell{5, 3}, Cell{5, 5}},     // two slots apart
		{"tight6", Cell{3, 0}, Cell{5, 0}},     // two rings apart
		{"tight6", Cell{0, 0}, Cell{1, 4}},     // the core and ring 1
		{"tight6", Cell{0, 0}, Cell{2, 0}},     // the core and ring 2
		{"tight6", Cell{6, 0}, Cell{7, 1}},     // corner contact within a band
		{"tight6", Cell{4, 0}, Cell{5, 0}},     // doubling boundary, faced
		{"tight6", Cell{4, 0}, Cell{5, 1}},     // boundary: adjacent under loose AND true corner contact
		{"tight6", Cell{4, 0}, Cell{5, 2}},     // boundary: the loose-only side of the open fork
		{"tight6", Cell{4, 0}, Cell{5, 3}},     // boundary: beyond one coarse cell width
		{"balanced12", Cell{1, 0}, Cell{2, 1}}, // 12→12: corner contact on the exempt inner step
	}
	for _, c := range adjInputs {
		s := scheduleByName(t, c.sched)
		f.Adjacency = append(f.Adjacency, adjCase{Schedule: c.sched, A: c.a, B: c.b, Adjacent: IsAdjacent(c.a, c.b, s)})
	}

	pathInputs := []struct {
		sched    string
		from, to Cell
	}{
		{"tight6", Cell{8, 5}, Cell{8, 9}},      // same-ring transfer
		{"tight6", Cell{0, 0}, Cell{3, 5}},      // core departure
		{"tight6", Cell{2, 1}, Cell{0, 0}},      // core arrival, zero-sweep tie
		{"tight6", Cell{2, 11}, Cell{0, 0}},     // core arrival, zero-sweep tie at the wrap
		{"tight6", Cell{4, 20}, Cell{5, 41}},    // band-boundary crossing
		{"tight6", Cell{1, 0}, Cell{3, 7}},      // coarse inner → fine outer (finest-ring sampling)
		{"tight6", Cell{1, 0}, Cell{2, 0}},      // exact ring tie
		{"tight6", Cell{1, 0}, Cell{2, 1}},      // exact angular slot tie
		{"tight6", Cell{1, 0}, Cell{1, 3}},      // exact half-turn sweep
		{"tight6", Cell{1, 4}, Cell{1, 1}},      // exact half-turn sweep through the wrap
		{"tight6", Cell{5, 1}, Cell{5, 25}},     // across the star: near-half-turn, never touches the core
		{"tight6", Cell{10, 90}, Cell{2, 3}},    // long mixed inbound
		{"balanced12", Cell{1, 11}, Cell{3, 2}}, // second schedule, wrap + band step
		{"tight6", Cell{2, 0}, Cell{1, 1}},      // stitch: out→in skip on the destination tail
		{"tight6", Cell{2, 0}, Cell{1, 3}},      // stitch: out→in skip mid-path
		{"tight6", Cell{2, 0}, Cell{1, 5}},      // stitch: bridge steps through the slot wrap
		{"tight6", Cell{1, 0}, Cell{11, 7}},     // stitch: in→out skip at the ring-8/9 boundary
	}
	for _, c := range pathInputs {
		s := scheduleByName(t, c.sched)
		f.ArcPath = append(f.ArcPath, pathCase{Schedule: c.sched, From: c.from, To: c.to, Path: ArcPath(c.from, c.to, s)})
	}

	advInputs := []struct {
		sched string
		o     Orbit
		t     common.WorldMillis
	}{
		{"tight6", Orbit{Ring: 2, EpochSlot: 3, Period: 12_000, Dir: 1}, 12_000},                               // full period
		{"tight6", Orbit{Ring: 2, EpochSlot: 3, Period: 12_000, Dir: 1}, 6_000},                                // half period
		{"tight6", Orbit{Ring: 4, EpochSlot: 7, Period: 0, Dir: 1}, 99_999},                                    // non-positive period
		{"tight6", Orbit{Ring: 4, EpochSlot: 7, Period: -5, Dir: -1}, 99_999},                                  // negative period
		{"tight6", Orbit{Ring: 0, EpochSlot: 5, Period: 1_000, Dir: -1}, 123_456},                              // ring 0
		{"tight6", Orbit{Ring: 1, EpochSlot: 0, Period: 6, Dir: 0}, 1},                                         // direction 0 → +1
		{"tight6", Orbit{Ring: 1, EpochSlot: 0, Period: 6, Dir: -1}, 1},                                        // retrograde
		{"tight6", Orbit{Ring: 1, EpochSlot: 0, Period: 7, Dir: 1}, 6},                                         // truncating quotient
		{"tight6", Orbit{Ring: 9, EpochSlot: 0, Period: 1_000_000_000_000_000, Dir: 1}, 2_600_000_000_000_000}, // wide-integer path
	}
	for _, c := range advInputs {
		s := scheduleByName(t, c.sched)
		f.OrbitAdvance = append(f.OrbitAdvance, advCase{Schedule: c.sched, Orbit: c.o, T: c.t, Cell: CellAt(c.o, c.t, s)})
	}

	backInputs := []struct {
		sched      string
		c          Cell
		at, period common.WorldMillis
		dir        int
	}{
		{"tight6", Cell{4, 7}, 123_456, 48_000, -1},
		{"tight6", Cell{2, 5}, 10, 7, 1}, // truncating, period smaller than elapsed
		{"tight6", Cell{0, 0}, 987_654, 12_000, 1},
		{"tight6", Cell{9, 42}, 2_600_000_000_000_000, 1_000_000_000_000_000, 1},
	}
	for _, c := range backInputs {
		s := scheduleByName(t, c.sched)
		o := OrbitThrough(c.c, c.at, c.period, c.dir, s)
		f.OrbitBackSolve = append(f.OrbitBackSolve, backCase{
			Schedule: c.sched, Cell: c.c, At: c.at, Period: c.period, Dir: c.dir, EpochSlot: o.EpochSlot,
		})
	}

	const offsetsNote = "floor(period*k/4) for k in 0..4"
	{
		lines, digest := sweepArcPath(tight6, sweepMaxRing)
		f.ArcPathSweep = []sweepCase{{Schedule: "tight6", MaxRing: sweepMaxRing, Lines: lines, Digest: digest}}
	}
	{
		lines, digest := sweepAdjacency(tight6, sweepMaxRing)
		f.AdjacencySweep = []sweepCase{{Schedule: "tight6", MaxRing: sweepMaxRing, Lines: lines, Digest: digest}}
	}
	{
		lines, digest := sweepOrbitAdvance(tight6, sweepMaxRing)
		f.OrbitAdvanceSweep = []orbitSweepCase{{Schedule: "tight6", MaxRing: sweepMaxRing, Periods: sweepPeriods, Offsets: offsetsNote, Lines: lines, Digest: digest}}
	}
	{
		lines, digest := sweepOrbitBackSolve(tight6, sweepMaxRing)
		f.OrbitBackSolveSweep = []orbitSweepCase{{Schedule: "tight6", MaxRing: sweepMaxRing, Periods: sweepPeriods, Offsets: offsetsNote, Lines: lines, Digest: digest}}
	}

	_ = balanced12
	return f
}

func TestFixtures_MatchGolden(t *testing.T) {
	computed := computeFixtures(t)

	if os.Getenv("UPDATE_FIXTURES") == "1" {
		// Provenance stamp (openspec polar-lattice-math, "The Polar Fixture
		// File Reproduces On Every Build Target"): the build target this
		// regeneration ran on, plus the JS runtime the TS suite was last
		// verified against (set FIXTURES_JS_RUNTIME, or the prior file's
		// value is carried forward). Unlike fixtures/board, regenerating on
		// arm64 is safe here: every recorded output is integer-derived — no
		// FMA-contractable float expression exists on the rule-bearing path —
		// and the amd64 leg of /check re-asserts every case either way.
		jsRuntime := os.Getenv("FIXTURES_JS_RUNTIME")
		if jsRuntime == "" {
			if raw, err := os.ReadFile(fixturesPath); err == nil {
				var prior fixtures
				if json.Unmarshal(raw, &prior) == nil && prior.Meta != nil {
					jsRuntime = prior.Meta.GeneratedOn.JSRuntime
				}
			}
		}
		computed.Meta = &fixtureMeta{GeneratedOn: generatedOn{
			GOARCH:    runtime.GOARCH,
			GOAMD64:   os.Getenv("GOAMD64"),
			JSRuntime: jsRuntime,
		}}
		if err := os.MkdirAll(filepath.Dir(fixturesPath), 0o755); err != nil {
			t.Fatal(err)
		}
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

	raw, err := os.ReadFile(fixturesPath)
	if err != nil {
		t.Fatalf("read golden fixtures (regenerate with UPDATE_FIXTURES=1): %v", err)
	}
	var golden fixtures
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	// The provenance stamp is where the file was RECORDED; this assert runs
	// on every target in the build matrix (arm64, amd64/GOAMD64=v1, and the
	// TS suite in Node), so the stamp must not participate in the comparison.
	golden.Meta = nil
	if !reflect.DeepEqual(golden, computed) {
		t.Fatal("polar output drifted from committed /fixtures/polar/cases.json — " +
			"if intentional, regenerate with UPDATE_FIXTURES=1 (the TS mirror is a read-only consumer; fix it, not the golden)")
	}
}
