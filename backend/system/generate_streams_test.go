package system

// RED-phase tests for openspec change pin-system-generation-determinism.
//
// system-interior › "Lattice Placement Is Independent Of The Continuous
// Stream" — every scenario in that requirement, PLUS
// cross-stack-determinism's "Interior Generation Reproduces Across Build
// Targets" is covered by cross_target_test.go alongside this file.
//
// This file exercises the unexported entry point design.md Decision 2 (and
// tasks.md 3.1) specifies:
//
//	generateWithStreams(seed int64, r, r2 *rand.Rand, region string,
//	    skeleton galaxy.Skeleton, params GenerationParams) GeneratedInterior
//
// which DOES NOT EXIST YET. Every test below therefore fails to COMPILE
// until a developer extracts Generate's body into it — that is the correct
// RED state for this file (see the RED-handoff report for confirmation:
// `go vet ./system/` / `go test ./system/ -short` both report
// "undefined: generateWithStreams").
//
// r2 == nil means "generate no continuous elements" (design.md Decision 2,
// point 2). The three nil-guards this requires — continuousStarParented's
// early return, the moon loop's Space/Size skip (NOT its resourcesFor draw
// or its append — those consume the LATTICE stream and must run identically
// in both modes), and beltFeature's f.Space != nil width guard — are
// production code for the developer to write, not this file's job.
//
// --- On the leak-injection sanity check design.md/the SDET brief require ---
//
// "Include a leak-injection sanity check proving your present-vs-absent
// test actually fails when such a leak is introduced" cannot be shipped as
// a permanently-running test in THIS repository: proving it requires a
// second, deliberately-broken copy of generateWithStreams that must never
// exist in the tree this suite protects. Per design.md's own methodology
// ("All of the following were run against a scratch copy of backend/; the
// working tree is untouched"), the SDET performed the equivalent
// verification against two throwaway module copies before this handoff:
//
//   - a CLEAN copy with generateWithStreams extracted exactly as specified
//     here (three guards, no other change);
//   - a LEAKY copy identical except for design.md's own one-line
//     counterexample in the moon loop: `m.Size = drawFeatureSize(FeatureMoon, r)`
//     instead of `r2` — a continuous draw pulled from the LATTICE stream.
//
// Running the present-vs-absent assertion below (verbatim) against both,
// over the same 80-case sweep interiorElementsFixtures() defines:
//
//	CLEAN copy:  cases=80 mismatches=0   (present-vs-absent: PASS)
//	LEAKY copy:  cases=80 mismatches=50  (present-vs-absent: FAILS, as required)
//
// and the two-seed supporting property (TestGenerate_Scenario_
// DifferingContinuousSeedsLeaveLatticeProjectionUnchanged's shape) against
// the same two copies:
//
//	CLEAN copy:  cases=80 mismatches=0   (two-seed: PASS)
//	LEAKY copy:  cases=80 mismatches=0   (two-seed: PASSES DESPITE THE LEAK)
//
// reproducing design.md's own finding exactly: present-vs-absent is the ONLY
// one of the two that catches this leak class. This is why the primary
// assertion below is present-vs-absent and the two-seed test two functions
// down is commented, per Decision 2, as supporting only — never as covering
// this leak class.

import (
	"encoding/json"
	"math/rand"
	"testing"

	"hexaverse/galaxy"
)

// --- the shared 80-case sweep -----------------------------------------------
//
// Reuses lattice_identity_test.go's existing skeleton/region/seed cross
// verbatim (design.md Decision 5: "interiorElements deliberately reuses the
// existing fixture set rather than inventing a new seed sweep"). Defined
// once here; lattice_identity_test.go, fixtures_test.go, and this file all
// read it, so retiring wantLatticeDigest (task 3.6) and recording
// fixtures/system/cases.json (task 4.5) stay a like-for-like swap a
// reviewer can check, per Decision 2's own text.

type interiorElementsCaseInput struct {
	Seed     int64
	Region   string
	Skeleton galaxy.Skeleton
}

// interiorElementsSkeletons/interiorElementsRegions are DUPLICATES, by
// value, of lattice_identity_test.go's latticeIdentityFixtures() sweep
// inputs — not a shared reference, so this file's tests never depend on
// lattice_identity_test.go surviving task 3.6's edit (deleting
// wantLatticeDigest/its Fatalf) unchanged. Both lists must stay
// byte-for-byte identical to that file's; that is what "interiorElements
// deliberately reuses the existing fixture set" (design.md Decision 5)
// means in practice, and it is checked by
// TestInteriorElementsSweep_MatchesLatticeIdentitySweep below.
var interiorElementsSkeletons = []galaxy.Skeleton{
	{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 0}}},
	{StarClass: "M", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 0}, {Type: galaxy.BodyGasGiant, Ring: 1}}},
	{StarClass: "K", Bodies: []galaxy.Body{
		{Type: galaxy.BodyMoltenz, Ring: 0}, {Type: galaxy.BodyRocky, Ring: 3},
		{Type: galaxy.BodyGasGiant, Ring: 7}, {Type: galaxy.BodyIce, Ring: 11},
	}},
	{StarClass: "O", Bodies: []galaxy.Body{
		{Type: galaxy.BodyRocky, Ring: 0}, {Type: galaxy.BodyOceanic, Ring: 2},
		{Type: galaxy.BodyBarrenz, Ring: 4}, {Type: galaxy.BodyGasGiant, Ring: 6},
		{Type: galaxy.BodyGasGiant, Ring: 8}, {Type: galaxy.BodyIce, Ring: 10},
		{Type: galaxy.BodyIce, Ring: 11},
	}},
}

var interiorElementsRegions = []string{"star_rich", "normal", "dead", "barrier"}

func interiorElementsInputs() []interiorElementsCaseInput {
	var out []interiorElementsCaseInput
	seed := int64(1)
	for _, sk := range interiorElementsSkeletons {
		for _, region := range interiorElementsRegions {
			for i := 0; i < 5; i++ {
				out = append(out, interiorElementsCaseInput{Seed: seed, Region: region, Skeleton: sk})
				seed++
			}
		}
	}
	return out
}

// TestInteriorElementsSweep_MatchesLatticeIdentitySweep is an SDET-added
// tripwire (not a spec scenario): it fails loudly if this file's duplicated
// sweep inputs ever drift from lattice_identity_test.go's own
// latticeIdentityFixtures() — comparing case COUNT and each case's
// generated lattice projection, since the two functions build
// galaxy.Skeleton/region/seed inputs independently and Go gives no
// compile-time way to assert two literal slices are equal.
func TestInteriorElementsSweep_MatchesLatticeIdentitySweep(t *testing.T) {
	fromLatticeIdentity := latticeIdentityFixtures()
	inputs := interiorElementsInputs()
	if len(fromLatticeIdentity) != len(inputs) {
		t.Fatalf("case count drifted: lattice_identity_test.go's sweep has %d cases, generate_streams_test.go's duplicate has %d", len(fromLatticeIdentity), len(inputs))
	}
	for i, in := range inputs {
		want := projectionJSON(t, fromLatticeIdentity[i])
		got := projectionJSON(t, Generate(in.Seed, in.Region, in.Skeleton, DefaultParams()))
		if want != got {
			t.Fatalf("case %d: duplicated sweep input produced a different interior than lattice_identity_test.go's own sweep at the same index — the two lists have drifted apart", i)
		}
	}
}

// projectionJSON is the primary assertion's comparator: the canonical JSON
// of projectLattice (lattice_identity_test.go) over one generated interior.
// Byte-equal JSON is sufficient for equality here because projectLattice's
// field order is fixed by its struct definition.
func projectionJSON(t testing.TB, gen GeneratedInterior) string {
	t.Helper()
	b, err := json.Marshal(projectLattice(gen))
	if err != nil {
		t.Fatalf("marshal lattice projection: %v", err)
	}
	return string(b)
}

// --- PRIMARY: present vs. absent --------------------------------------------

// Scenario: Lattice placement is unchanged whether continuous draws are
// present or absent (system-interior › "Lattice Placement Is Independent Of
// The Continuous Stream"). THE primary assertion (design.md Decision 2,
// point 3) — not the two-seed test below, which is demoted to supporting
// only.
func TestGenerate_Scenario_LatticePlacementUnchangedWhetherContinuousDrawsPresentOrAbsent(t *testing.T) {
	params := DefaultParams()
	inputs := interiorElementsInputs()
	if len(inputs) == 0 {
		t.Fatal("fixture: no cases generated")
	}
	mismatches := 0
	for _, in := range inputs {
		present := generateWithStreams(in.Seed, newRand(in.Seed), newRand(continuousSeed(in.Seed)), in.Region, in.Skeleton, params)
		absent := generateWithStreams(in.Seed, newRand(in.Seed), nil, in.Region, in.Skeleton, params)

		pj, aj := projectionJSON(t, present), projectionJSON(t, absent)
		if pj != aj {
			mismatches++
			t.Errorf("seed=%d region=%s: lattice projection differs between continuous-draws-present and continuous-draws-absent — "+
				"a continuous element draw has leaked into the LATTICE stream (r), perturbing placement.\n  present: %s\n  absent:  %s",
				in.Seed, in.Region, pj, aj)
		}
	}
	if mismatches > 0 {
		t.Fatalf("%d of %d cases: lattice placement is NOT independent of the continuous stream", mismatches, len(inputs))
	}
}

// --- SUPPORTING: two-seed property (design.md Decision 2, point 4) ---------
//
// States a differently-readable property ("the lattice output is a function
// of the lattice seed alone") but is NOT the primary assertion and does NOT
// cover the stream-leak class the primary assertion above exists to catch —
// see this file's header comment for the measured proof. Kept because it is
// cheap and readable, per Decision 2.

// Scenario: Differing continuous seeds leave the lattice projection
// unchanged.
func TestGenerate_Scenario_DifferingContinuousSeedsLeaveLatticeProjectionUnchanged(t *testing.T) {
	params := DefaultParams()
	for _, in := range interiorElementsInputs() {
		a := generateWithStreams(in.Seed, newRand(in.Seed), newRand(continuousSeed(in.Seed)+1), in.Region, in.Skeleton, params)
		b := generateWithStreams(in.Seed, newRand(in.Seed), newRand(continuousSeed(in.Seed)+2), in.Region, in.Skeleton, params)
		if aj, bj := projectionJSON(t, a), projectionJSON(t, b); aj != bj {
			t.Errorf("seed=%d region=%s: lattice projection differs between two runs sharing the lattice seed but using different continuous seeds", in.Seed, in.Region)
		}
	}
}

// continuousElementsLineOf is a per-feature canonical rendering of the
// continuous half only (Space + Size + Width) — used solely to detect that
// SOMETHING continuous differs between two runs, not to pin its exact value
// (that is fixtures_test.go's job).
type space_orbitSnapshot struct {
	ParentId    string
	Radius      float64
	PeriodMs    int64
	Phase       int64
	Inclination int64
	Node        int64
}

func continuousElementsLineOf(gen GeneratedInterior) string {
	type featSnap struct {
		Id    string               `json:"id"`
		Size  float64              `json:"size"`
		Width float64              `json:"width"`
		Space *space_orbitSnapshot `json:"space,omitempty"`
	}
	snap := struct {
		Extent   float64    `json:"extent"`
		Features []featSnap `json:"features"`
	}{Extent: gen.Interior.Extent}
	for _, f := range gen.Features {
		fs := featSnap{Id: f.Id, Size: f.Size, Width: f.Width}
		if f.Space != nil {
			fs.Space = &space_orbitSnapshot{
				ParentId: f.Space.ParentId, Radius: f.Space.Radius,
				PeriodMs: int64(f.Space.PeriodMs), Phase: int64(f.Space.Phase),
				Inclination: int64(f.Space.Inclination), Node: int64(f.Space.Node),
			}
		}
		snap.Features = append(snap.Features, fs)
	}
	b, err := json.Marshal(snap)
	if err != nil {
		panic(err)
	}
	return string(b)
}

// Scenario: Differing continuous seeds produce differing continuous
// elements — the guard against an accidentally-disconnected second stream
// (design.md Decision 2, point 4's "complementary assertion").
func TestGenerate_Scenario_DifferingContinuousSeedsProduceDifferingContinuousElements(t *testing.T) {
	params := DefaultParams()
	sawADifference := false
	for _, in := range interiorElementsInputs() {
		a := generateWithStreams(in.Seed, newRand(in.Seed), newRand(continuousSeed(in.Seed)+1), in.Region, in.Skeleton, params)
		b := generateWithStreams(in.Seed, newRand(in.Seed), newRand(continuousSeed(in.Seed)+2), in.Region, in.Skeleton, params)
		if continuousElementsLineOf(a) != continuousElementsLineOf(b) {
			sawADifference = true
			break
		}
	}
	if !sawADifference {
		t.Fatal("no case showed ANY difference in continuous elements (space position, size, width) between two different continuous seeds — " +
			"the continuous stream may be accidentally disconnected (system-interior: \"Differing continuous seeds produce differing continuous elements\")")
	}
}

// --- INDEPENDENT GUARD: the lattice draw-count pin --------------------------

// countingSource wraps a rand.Source64 and counts every word drawn from it.
// It MUST embed rand.Source64 and implement BOTH Int63 and Uint64 —
// math/rand's *rand.Rand type-asserts its Source for Source64, and a
// wrapper missing either method silently changes the sequence a *rand.Rand
// built on it produces (design.md Decision 2, point 5; tasks.md 3.5).
type countingSource struct {
	rand.Source64
	n *int64
}

func (c countingSource) Int63() int64 {
	*c.n++
	return c.Source64.Int63()
}

func (c countingSource) Uint64() uint64 {
	*c.n++
	return c.Source64.Uint64()
}

// newCountingRand builds a *rand.Rand seeded exactly as newRand(seed) would,
// wrapped to count every word it draws.
func newCountingRand(seed int64, n *int64) *rand.Rand {
	src, ok := rand.NewSource(seed).(rand.Source64)
	if !ok {
		panic("rand.NewSource no longer returns a rand.Source64 — countingSource's embedding assumption is stale")
	}
	return rand.New(countingSource{Source64: src, n: n})
}

// Scenario: The lattice stream's word consumption is pinned per case — the
// "instrument cannot alter what it measures" half. The VALUE each count
// must equal is pinned separately, in fixtures_test.go, against the
// interiorElements fixture family; this test is the structural guarantee
// that measuring the count changes nothing about what is measured.
func TestGenerate_Scenario_InstrumentedLatticeStreamMatchesUninstrumentedProjection(t *testing.T) {
	params := DefaultParams()
	for _, in := range interiorElementsInputs() {
		var count int64
		instrumented := generateWithStreams(in.Seed, newCountingRand(in.Seed, &count), newRand(continuousSeed(in.Seed)), in.Region, in.Skeleton, params)
		plain := generateWithStreams(in.Seed, newRand(in.Seed), newRand(continuousSeed(in.Seed)), in.Region, in.Skeleton, params)

		if pj, ij := projectionJSON(t, plain), projectionJSON(t, instrumented); pj != ij {
			t.Fatalf("seed=%d region=%s: instrumenting the lattice stream's word count CHANGED its lattice projection — "+
				"the counting wrapper is not sequence-preserving (did it lose Source64, or drop Uint64?)", in.Seed, in.Region)
		}
		if count <= 0 {
			t.Fatalf("seed=%d region=%s: instrumented lattice stream reports %d words drawn, want > 0", in.Seed, in.Region, count)
		}
	}
}
