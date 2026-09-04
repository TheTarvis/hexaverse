package space

import (
	"bytes"
	"encoding/json"
	"math"
	"os"
	"runtime"
	"testing"
)

// turn_table_record_test.go is the sole call site of math.Sin/math.Cos in
// this package (design.md Decision 3: "The recording flow ... is the sole
// place math.Sin/math.Cos execute in this capability"). It regenerates
// fixtures/space/turn-table.json and this package's embedded copy
// (turn-table.json) only when UPDATE_FIXTURES=1 is set — normal test runs
// only assert the two are byte-identical: a recorded table with an embedded
// Go copy is recorded once and compared thereafter, never recomputed on
// whatever target happens to run the test.

const (
	turnTablePathCanonical = "../../fixtures/space/turn-table.json"
	turnTablePathGoEmbed   = "turn-table.json"
)

// generateTurnTable is THE fixture-recording flow's table generator.
// Rounded once, here, at record time; runtime code (table.go) only loads
// the committed bytes.
func generateTurnTable() []byte {
	f := turnTableFile{
		Meta: &turnTableMeta{
			GeneratedOn: turnTableGeneratedOn{
				GOARCH:    runtime.GOARCH,
				GOAMD64:   os.Getenv("GOAMD64"),
				JSRuntime: noJSLegStatement,
			},
		},
		SubTurn:    int64(SubTurn),
		CoarseSize: tableLevelSize,
		FineSize:   tableLevelSize,
		Coarse:     make([]trigEntry, tableLevelSize),
		Fine:       make([]trigEntry, tableLevelSize),
	}
	for i := 0; i < tableLevelSize; i++ {
		angle := 2 * math.Pi * float64(i) / float64(tableLevelSize)
		f.Coarse[i] = trigEntry{Cos: math.Cos(angle), Sin: math.Sin(angle)}
	}
	for j := 0; j < tableLevelSize; j++ {
		angle := 2 * math.Pi * float64(j) / float64(SubTurn)
		f.Fine[j] = trigEntry{Cos: math.Cos(angle), Sin: math.Sin(angle)}
	}
	// The default json.Marshal float64 encoding is the shortest
	// round-tripping decimal form, which is exact (Go -> Go) by
	// construction; a hand-formatted '%.15g'-style rounding would silently
	// change the committed bits (design.md's own verified precision
	// caution). Never reformat this output.
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		panic(err)
	}
	return append(data, '\n')
}

// TestTurnTable_ByteIdentical asserts the two committed copies of the
// pinned table (fixtures/space/turn-table.json, the canonical artifact, and
// this package's Go-embedded copy) are byte-identical — a pure file
// comparison, never a recomputation. This is deliberate and load-bearing
// for the cross-build-target matrix: Go's math.Sin/math.Cos are not
// guaranteed bit-identical across GOARCH (some targets carry
// architecture-specific assembly implementations), so a table VERIFIED by
// recomputing trigonometry on whatever target happens to run the test would
// itself reintroduce the cross-target hazard this pinned table exists to
// remove. The trigonometry runs exactly once, in
// TestTurnTable_RecordOrRegenerate's UPDATE_FIXTURES=1 branch, on whichever
// single machine performs the recording.
func TestTurnTable_ByteIdentical(t *testing.T) {
	canonical, err := os.ReadFile(turnTablePathCanonical)
	if err != nil {
		t.Fatalf("read %s: %v (regenerate with UPDATE_FIXTURES=1)", turnTablePathCanonical, err)
	}
	if !bytes.Equal(turnTableRaw, canonical) {
		t.Fatalf("%s (embedded copy) differs from %s — re-record via UPDATE_FIXTURES=1", turnTablePathGoEmbed, turnTablePathCanonical)
	}

	// The recording-provenance requirement (cross-stack-determinism's
	// "The fixture records its recording provenance" and "A Go-sole-
	// authority capability's mirror map runs in anti-mirror mode" siblings)
	// has no enforcement on its own — a table missing _meta.generatedOn
	// parses and byte-compares fine. Assert its presence explicitly here,
	// on every normal run, rather than relying on it being incidentally
	// exercised by another test calling CosSin.
	var f turnTableFile
	if err := json.Unmarshal(canonical, &f); err != nil {
		t.Fatalf("parse %s: %v", turnTablePathCanonical, err)
	}
	if f.Meta == nil {
		t.Fatalf("%s is missing its _meta recording provenance — re-record via UPDATE_FIXTURES=1", turnTablePathCanonical)
	}
	if f.Meta.GeneratedOn.GOARCH == "" {
		t.Fatalf("%s: _meta.generatedOn.goarch is empty — re-record via UPDATE_FIXTURES=1", turnTablePathCanonical)
	}
	if f.Meta.GeneratedOn.JSRuntime != noJSLegStatement {
		t.Fatalf("%s: _meta.generatedOn.jsRuntime = %q, want the pinned no-JS-leg statement %q — re-record via UPDATE_FIXTURES=1",
			turnTablePathCanonical, f.Meta.GeneratedOn.JSRuntime, noJSLegStatement)
	}
}

// TestTurnTable_RecordOrRegenerate regenerates the pinned table — the sole
// place this package's math.Sin/math.Cos ever execute — only when
// UPDATE_FIXTURES=1 is set; it is a no-op otherwise (byte verification is
// TestTurnTable_ByteIdentical's job, deliberately without recomputing).
func TestTurnTable_RecordOrRegenerate(t *testing.T) {
	if os.Getenv("UPDATE_FIXTURES") != "1" {
		t.Skip("set UPDATE_FIXTURES=1 to regenerate fixtures/space/turn-table.json")
	}
	data := generateTurnTable()
	if err := os.WriteFile(turnTablePathCanonical, data, 0o644); err != nil {
		t.Fatalf("write %s: %v", turnTablePathCanonical, err)
	}
	if err := os.WriteFile(turnTablePathGoEmbed, data, 0o644); err != nil {
		t.Fatalf("write %s: %v", turnTablePathGoEmbed, err)
	}
	t.Logf("regenerated turn table (%d bytes) at %s and %s — rebuild before re-running the suite so the embedded copy reflects it",
		len(data), turnTablePathCanonical, turnTablePathGoEmbed)
}

// TestTurnTable_ProvenanceTracksTheRecordingTarget asserts the recording
// flow stamps the target it ACTUALLY ran on, rather than a value that
// happens to read "arm64" because that is where the committed table was
// first recorded.
//
// tasks.md 8.4 [QA, 2026-08-27]: TestTurnTable_ByteIdentical's provenance
// assertions check that `_meta.generatedOn.goarch` is PRESENT and
// non-empty. That passes just as happily against a hard-coded literal, so
// cross-stack-determinism's "The fixture records its recording provenance"
// scenario — whose whole point is that "a claim that the check ran a target
// other than the one it was recorded on is verifiable rather than assumed"
// — was not actually enforced.
//
// This runs the recording flow in memory (no file is written) and asserts
// its stamp against the live build target. Run on the `GOARCH=amd64
// GOAMD64=v1` leg of the matrix it therefore asserts an amd64 stamp; run
// natively on arm64, an arm64 one. A regression that froze the stamp would
// fail on at least one leg of the matrix every change touches this package.
func TestTurnTable_ProvenanceTracksTheRecordingTarget(t *testing.T) {
	var recorded turnTableFile
	if err := json.Unmarshal(generateTurnTable(), &recorded); err != nil {
		t.Fatalf("parse the recording flow's own output: %v", err)
	}
	if recorded.Meta == nil {
		t.Fatal("the recording flow emitted no _meta block")
	}
	got := recorded.Meta.GeneratedOn

	if got.GOARCH != runtime.GOARCH {
		t.Errorf("_meta.generatedOn.goarch = %q, want the live build target %q — the stamp is not tracking the target that recorded it",
			got.GOARCH, runtime.GOARCH)
	}
	if want := os.Getenv("GOAMD64"); got.GOAMD64 != want {
		t.Errorf("_meta.generatedOn.goamd64 = %q, want the recording process's own GOAMD64 %q", got.GOAMD64, want)
	}
	if got.JSRuntime != noJSLegStatement {
		t.Errorf("_meta.generatedOn.jsRuntime = %q, want the pinned no-JS-leg statement", got.JSRuntime)
	}

	// And the committed file's stamp must name a target this repo's matrix
	// actually builds on — a typo or a placeholder is not provenance.
	canonical, err := os.ReadFile(turnTablePathCanonical)
	if err != nil {
		t.Fatalf("read %s: %v", turnTablePathCanonical, err)
	}
	var committed turnTableFile
	if err := json.Unmarshal(canonical, &committed); err != nil {
		t.Fatalf("parse %s: %v", turnTablePathCanonical, err)
	}
	switch committed.Meta.GeneratedOn.GOARCH {
	case "arm64", "amd64":
	default:
		t.Errorf("%s: _meta.generatedOn.goarch = %q, want one of the build-target matrix's own architectures (arm64, amd64)",
			turnTablePathCanonical, committed.Meta.GeneratedOn.GOARCH)
	}
}
