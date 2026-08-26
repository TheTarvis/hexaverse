package board

import (
	"encoding/json"
	"fmt"
	"sync"

	_ "embed"
)

// The pinned coordinate table (openspec board-tactical-math, "A Pinned
// Coordinate Table Grounds Board Geometry"): for each distinct slot count in
// the pinned Isotropic schedule family and each slot below it, the
// fixed-point (x, y) of that slot's angle at unit radius, scaled by 2^16 and
// rounded ONCE at record time. A cell's center is ring × entry. The table is
// generated only by the fixture-recording flow (the sole place its
// trigonometry ever executes), committed as data, and LOADED — never
// recomputed — here and in the TS mirror. fixtures/board/coordinate-table.json
// is the canonical artifact; this embedded copy and the TS mirror's copy are
// asserted byte-identical to it by both fixture suites (and across the Go
// build-target matrix). All runtime geometry over table values is exact
// integer arithmetic: squared distances, cross products, cross-multiplied
// comparisons — no runtime trig, no runtime sqrt.
//
//go:embed coordtable.json
var coordTableRaw []byte

// TableScale is the pinned fixed-point scale: 2^16 table units per unit
// radius. Squared quantities (occluder radii, beam half-widths) are expressed
// in squared table units.
const TableScale = 65536

type coordTableFile struct {
	Scale      int64 `json:"scale"`
	SlotCounts []struct {
		Slots  int        `json:"slots"`
		Points [][2]int64 `json:"points"`
	} `json:"slotCounts"`
}

var (
	tableOnce sync.Once
	table     map[int][][2]int64 // slot count → per-slot unit-radius (x, y)
)

// tablePoints returns the pinned unit-radius points for a slot count. Panics
// on a slot count outside the pinned family — that is a programmer error (a
// schedule this game does not ship), not a lattice answer.
func tablePoints(slots int) [][2]int64 {
	tableOnce.Do(loadTable)
	pts, ok := table[slots]
	if !ok {
		panic(fmt.Sprintf("board: slot count %d is outside the pinned coordinate table's family", slots))
	}
	return pts
}

func loadTable() {
	var f coordTableFile
	if err := json.Unmarshal(coordTableRaw, &f); err != nil {
		panic(fmt.Sprintf("board: embedded coordinate table is invalid: %v", err))
	}
	if f.Scale != TableScale {
		panic(fmt.Sprintf("board: embedded coordinate table scale %d != pinned TableScale %d", f.Scale, TableScale))
	}
	table = make(map[int][][2]int64, len(f.SlotCounts))
	for _, e := range f.SlotCounts {
		if len(e.Points) != e.Slots {
			panic(fmt.Sprintf("board: coordinate table slot count %d carries %d points", e.Slots, len(e.Points)))
		}
		table[e.Slots] = e.Points
	}
}

// CellCenter returns a cell's pinned integer board coordinates: ring × the
// slot's unit-radius table entry, in table units (2^16 per radial unit).
func CellCenter(c Cell, slots int) (x, y int64) {
	if c.Ring <= 0 {
		return 0, 0
	}
	p := tablePoints(slots)[c.Slot%slots]
	return int64(c.Ring) * p[0], int64(c.Ring) * p[1]
}
