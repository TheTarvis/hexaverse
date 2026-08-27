package space

import (
	"encoding/json"
	"math"
	"testing"
)

// table_test.go closes the file-per-production-file test coverage gate
// (backend/space/table.go) with direct coverage of the pinned-table loader
// and lookup surface (design.md Decision 3's "second instance" of
// cross-stack-determinism's pinned-table idiom): the angle-addition combine
// CosSin performs, index wrap at the [0, SubTurn) boundary, and the
// embedded fixture's _meta provenance presence. turn_test.go already covers
// PhaseIndexOf (turn.go) end-to-end through this same table via CosSin;
// this file does not re-assert those PhaseIndexOf scenarios, only CosSin's
// own combine/wrap behavior and the loader's validation surface.
// turn_table_record_test.go is the developer's recording flow and is not
// touched or duplicated here.

// SDET-added: CosSin's angle-addition identity (cos(A+B) = cosA cosB -
// sinA sinB; sin(A+B) = sinA cosB + cosA sinB) must reduce EXACTLY to the
// coarse entry alone when the fine index is 0 (angle B=0, so cosB=1,
// sinB=0 exactly), and to the fine entry alone when the coarse index is 0
// (angle A=0). This directly exercises the combine step CosSin performs,
// independent of whatever concrete values the recording flow pinned.
func TestCosSin_CombinesCoarseAndFineByAngleAddition(t *testing.T) {
	// Force the once-loaded table before reaching into it directly below.
	CosSin(0)

	t.Run("fine index zero reduces to the coarse entry exactly", func(t *testing.T) {
		for _, hi := range []int64{0, 1, 500, 1023} {
			idx := SubTurns(hi << 10)
			gotCos, gotSin := CosSin(idx)
			want := coarseTable[hi]
			if gotCos != want.Cos || gotSin != want.Sin {
				t.Errorf("CosSin(hi=%d, lo=0) = (%v, %v), want the coarse entry (%v, %v) exactly",
					hi, gotCos, gotSin, want.Cos, want.Sin)
			}
		}
	})

	t.Run("coarse index zero reduces to the fine entry exactly", func(t *testing.T) {
		for _, lo := range []int64{0, 1, 500, 1023} {
			idx := SubTurns(lo)
			gotCos, gotSin := CosSin(idx)
			want := fineTable[lo]
			if gotCos != want.Cos || gotSin != want.Sin {
				t.Errorf("CosSin(hi=0, lo=%d) = (%v, %v), want the fine entry (%v, %v) exactly",
					lo, gotCos, gotSin, want.Cos, want.Sin)
			}
		}
	})
}

// SDET-added: a generic (non-axis-aligned) sub-turn angle's combined
// cos/sin still matches a reference math.Cos/math.Sin evaluation of the
// same angle to a generous, SDET-chosen tolerance — a correctness
// cross-check of the combine arithmetic itself, not a re-recording of the
// pinned fixture (turn_table_record_test.go owns that).
func TestCosSin_MatchesReferenceTrigAtGenericAngles(t *testing.T) {
	for _, idx := range []SubTurns{12345, 500_000, 1_000_000, SubTurn / 3, SubTurn/7 + 42} {
		gotCos, gotSin := CosSin(idx)
		theta := 2 * math.Pi * float64(idx) / float64(SubTurn)
		wantCos, wantSin := math.Cos(theta), math.Sin(theta)
		if !almostEqual(gotCos, wantCos, looseTolerance) {
			t.Errorf("CosSin(%d): cos = %v, want ~%v (reference math.Cos)", idx, gotCos, wantCos)
		}
		if !almostEqual(gotSin, wantSin, looseTolerance) {
			t.Errorf("CosSin(%d): sin = %v, want ~%v (reference math.Sin)", idx, gotSin, wantSin)
		}
	}
}

// Scenario: index wrap at the [0, SubTurn) boundary — CosSin resolves an
// index at, or beyond, one full turn (and a negative index) identically to
// its wrapped-in-range equivalent (table.go's own doc comment: "idx is
// reduced onto [0, SubTurn) by wrapSubTurn's sign-safe bitwise mask before
// decomposing").
func TestCosSin_WrapsAtSubTurnBoundary(t *testing.T) {
	wantCos, wantSin := CosSin(0)
	if gotCos, gotSin := CosSin(SubTurns(SubTurn)); gotCos != wantCos || gotSin != wantSin {
		t.Errorf("CosSin(SubTurn) = (%v, %v), want CosSin(0) = (%v, %v) (one full turn wraps to the same entry)",
			gotCos, gotSin, wantCos, wantSin)
	}

	wantCosMax, wantSinMax := CosSin(SubTurn - 1)
	if gotCos, gotSin := CosSin(SubTurns(-1)); gotCos != wantCosMax || gotSin != wantSinMax {
		t.Errorf("CosSin(-1) = (%v, %v), want CosSin(SubTurn-1) = (%v, %v) (negative index wraps into [0, SubTurn) from the top)",
			gotCos, gotSin, wantCosMax, wantSinMax)
	}

	const interior SubTurns = 777_777
	wantCosI, wantSinI := CosSin(interior)
	if gotCos, gotSin := CosSin(interior + SubTurn); gotCos != wantCosI || gotSin != wantSinI {
		t.Errorf("CosSin(interior+SubTurn) = (%v, %v), want CosSin(interior) = (%v, %v)",
			gotCos, gotSin, wantCosI, wantSinI)
	}
}

// SDET-added: the loader's own validated invariants (loadTurnTable panics
// if any of these do not hold), checked directly against the embedded
// artifact rather than by forcing a panic — the _meta provenance presence
// check plus the size/subTurn invariants the loader enforces.
func TestEmbeddedTurnTable_MetaProvenancePresent(t *testing.T) {
	var f turnTableFile
	if err := json.Unmarshal(turnTableRaw, &f); err != nil {
		t.Fatalf("embedded turn table failed to parse: %v", err)
	}
	if f.Meta == nil {
		t.Fatal("embedded turn table is missing its _meta block")
	}
	if f.Meta.GeneratedOn.GOARCH == "" {
		t.Error("embedded turn table _meta.generatedOn.goarch is empty")
	}
	if f.Meta.GeneratedOn.JSRuntime == "" {
		t.Error("embedded turn table _meta.generatedOn.jsRuntime is empty")
	}
	if f.SubTurn != int64(SubTurn) {
		t.Errorf("embedded turn table subTurn = %d, want the pinned SubTurn %d", f.SubTurn, SubTurn)
	}
	if f.CoarseSize != tableLevelSize || f.FineSize != tableLevelSize {
		t.Errorf("embedded turn table declared sizes: coarse=%d fine=%d, want %d each", f.CoarseSize, f.FineSize, tableLevelSize)
	}
	if len(f.Coarse) != tableLevelSize || len(f.Fine) != tableLevelSize {
		t.Errorf("embedded turn table entry counts: coarse=%d fine=%d, want %d each", len(f.Coarse), len(f.Fine), tableLevelSize)
	}
}
