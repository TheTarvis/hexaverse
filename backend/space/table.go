package space

import (
	"encoding/json"
	"fmt"
	"sync"

	_ "embed"
)

// The pinned two-level turn table (design.md Decision 3, the second
// instance of cross-stack-determinism's "Pinned Constant Tables Are
// Recorded, Asserted, Never Recomputed" — the first is backend/board's
// coordinate table). coarse[1024] holds {cos, sin} at i * SubTurn/1024 for
// i in [0,1024); fine[1024] holds {cos, sin} at j * SubTurn/2^20 for j in
// [0,1024). Any sub-turn angle's cosine/sine is reconstructed from these two
// levels by the angle-addition identity (CosSin, below) — sin/cos of a
// sub-turn index are never computed at runtime. fixtures/space/turn-table.json
// is the canonical artifact; this embedded copy is byte-identical to it
// (asserted by turn_table_record_test.go), generated only by that test's
// recording flow — the sole place this capability's math.Sin/math.Cos ever
// execute.
//
//go:embed turn-table.json
var turnTableRaw []byte

// tableLevelSize is the number of entries in each of the two table levels.
const tableLevelSize = 1024

// trigEntry is a single {cos, sin} pair at a table index.
type trigEntry struct {
	Cos float64 `json:"cos"`
	Sin float64 `json:"sin"`
}

// turnTableFile is the on-disk shape of turn-table.json.
type turnTableFile struct {
	Meta       *turnTableMeta `json:"_meta,omitempty"`
	SubTurn    int64          `json:"subTurn"`
	CoarseSize int            `json:"coarseSize"`
	FineSize   int            `json:"fineSize"`
	Coarse     []trigEntry    `json:"coarse"`
	Fine       []trigEntry    `json:"fine"`
}

// turnTableMeta is the fixture's recording-provenance envelope. It matches
// fixtures/space/turn-table.json's own `_meta.generatedOn` shape — the
// repo-wide convention for a recorded fixture — as closely as this
// package's no-TypeScript-mirror status (design.md Decision 1) allows: this
// package's table is asserted only across the Go build-target matrix, so
// generatedOn.JSRuntime is always populated with an explicit "no JS leg by
// design" statement rather than omitted — an absent field reads as an
// oversight, a stated one reads as a decision
// (cross-stack-determinism's "A Go-only fixture family has no
// JavaScript-runtime leg by design").
type turnTableMeta struct {
	GeneratedOn turnTableGeneratedOn `json:"generatedOn"`
}

// noJSLegStatement is the fixed statement recorded in every generated
// turn-table.json's generatedOn.jsRuntime field. It is not a value observed
// at record time (there is no JS leg to observe) — it is the explicit,
// constant record of that fact.
const noJSLegStatement = "none — backend/space is Go-sole-authority with no TypeScript mirror by design (design.md Decision 1); this table is asserted only across the Go build-target matrix"

// turnTableGeneratedOn is the recorded Go build target the table was
// generated on (GOARCH, and GOAMD64 where the recording process set it),
// plus the explicit no-JS-leg statement above.
type turnTableGeneratedOn struct {
	GOARCH    string `json:"goarch"`
	GOAMD64   string `json:"goamd64,omitempty"`
	JSRuntime string `json:"jsRuntime"`
}

var (
	turnTableOnce sync.Once
	coarseTable   [tableLevelSize]trigEntry
	fineTable     [tableLevelSize]trigEntry
)

// loadTurnTable parses the embedded table exactly once. It panics on a
// malformed or mis-sized embed — a programmer error (a corrupted commit),
// never a runtime condition production code should recover from, matching
// backend/board/table.go's loadTable precedent.
func loadTurnTable() {
	var f turnTableFile
	if err := json.Unmarshal(turnTableRaw, &f); err != nil {
		panic(fmt.Sprintf("space: embedded turn table is invalid: %v", err))
	}
	if f.SubTurn != int64(SubTurn) {
		panic(fmt.Sprintf("space: embedded turn table subTurn %d != pinned SubTurn %d", f.SubTurn, SubTurn))
	}
	if len(f.Coarse) != tableLevelSize || len(f.Fine) != tableLevelSize {
		panic(fmt.Sprintf("space: embedded turn table sizes wrong: coarse=%d fine=%d, want %d each",
			len(f.Coarse), len(f.Fine), tableLevelSize))
	}
	if f.Meta == nil || f.Meta.GeneratedOn.GOARCH == "" || f.Meta.GeneratedOn.JSRuntime == "" {
		panic("space: embedded turn table is missing its _meta.generatedOn recording provenance " +
			"(goarch and the no-JS-leg statement) — re-record via UPDATE_FIXTURES=1")
	}
	copy(coarseTable[:], f.Coarse)
	copy(fineTable[:], f.Fine)
}

// CosSin resolves the cosine and sine of a sub-turn angle by table lookup
// and the angle-addition identity, combining the coarse and fine levels —
// never by calling a runtime trigonometric function (design.md Decision 3).
// idx is reduced onto [0, SubTurn) by wrapSubTurn's sign-safe bitwise mask
// before decomposing into a coarse index (the high 10 bits) and a fine
// index (the low 10 bits): idx = hi*1024 + lo exactly, since
// 1024*1024 == 2^20 == SubTurn.
func CosSin(idx SubTurns) (cos, sin float64) {
	turnTableOnce.Do(loadTurnTable)
	wrapped := int64(wrapSubTurn(int64(idx)))
	hi := wrapped >> 10
	lo := wrapped & (tableLevelSize - 1)
	c := coarseTable[hi]
	f := fineTable[lo]
	// cos(A+B) = cosA cosB - sinA sinB; sin(A+B) = sinA cosB + cosA sinB.
	// Four guarded multiplies, one add, one subtract (design.md Decision 3) —
	// every product forced through an explicit float64(...) conversion so
	// Go's FMA fusion cannot merge a multiply into the following add/subtract
	// (design.md Decision 5).
	cos = float64(c.Cos*f.Cos) - float64(c.Sin*f.Sin)
	sin = float64(c.Sin*f.Cos) + float64(c.Cos*f.Sin)
	return cos, sin
}
