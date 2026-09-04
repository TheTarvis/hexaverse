package system

// RED-phase tests for openspec change add-orbital-system-bodies —
// Generate()-level scenarios: whole-interior behavior that needs a full
// generation pass (as opposed to continuous_test.go's pure-law unit tests).
//
// Covers system-interior's:
//   - "Every Generated Body Carries a Continuous Orbital Element Set and a
//     Size" — the successor of the retired continuous-elements requirement
//     this file originally cited, whose title is not repeated here because a
//     verbatim retired title reads to the repo-wide dangling-citation sweep
//     exactly like a live one
//   - "Retrograde Motion Is Expressed By Inclination, Never By a
//     Non-Positive Period" (the Generate()-level scenarios) — likewise the
//     successor of the retired requirement that phrased the same guarantee
//     in terms of a non-positive period
//   - "A Body-Parented Orbit's Continuous Period Follows a Named Law..."
//     (the Generate()-level scenarios)
//   - "A Generated Parent Chain Never Exceeds the Resolver's Depth Bound"
//   - "A Belt's Members Are Discrete Mineable Bodies..." — only the
//     "no feature id contains #" scenario; the rest are in
//     belt_members_test.go
//   - "Feature Size Is Drawn From a Per-Type Band..." — the dynamic half

import (
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
)

// sweptSkeletons/sweptSeeds/sweptRegions give every Generate()-level test in
// this file a shared, generously varied sweep: several skeleton shapes
// (including one with 2 gas giants so moons/stations have parents to ride),
// crossed with every region dial and a run of seeds, so a property that
// holds "for every generated seed" is actually swept rather than
// hand-picked.
var sweptSkeletons = []galaxy.Skeleton{
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

var sweptRegions = []string{"star_rich", "normal", "dead", "barrier"}

func sweptInteriors(seedBase int64, seedsPer int) []GeneratedInterior {
	var out []GeneratedInterior
	seed := seedBase
	for _, sk := range sweptSkeletons {
		for _, region := range sweptRegions {
			for i := 0; i < seedsPer; i++ {
				out = append(out, Generate(seed, region, sk, DefaultParams()))
				seed++
			}
		}
	}
	return out
}

// bodiesFromInterior adapts a GeneratedInterior into a space.Bodies for
// space.Position/space.Velocity resolution — the test-side analogue of the
// production BodyTable (bodies_test.go), but built directly from generator
// output rather than through the DAO/service layer, so these tests exercise
// generation correctness independent of persistence and composition.
type bodiesFromInterior map[string]space.Body

func (b bodiesFromInterior) Body(id string) (space.Body, bool) {
	v, ok := b[id]
	return v, ok
}

func toBodies(gen GeneratedInterior) bodiesFromInterior {
	out := bodiesFromInterior{}
	for _, f := range gen.Features {
		out[f.Id] = space.Body{Id: f.Id, Size: f.Size, Orbit: f.Space}
	}
	return out
}

// --- "Every Generated Body Carries a Continuous Orbital Element Set and a
// --- Size" -----------------------------------------------------------------

// Scenario: Continuous elements are reproducible from the per-system seed.
func TestGenerate_Scenario_ContinuousElementsReproducibleFromSeed(t *testing.T) {
	sk := sweptSkeletons[2]
	a := Generate(777, "star_rich", sk, DefaultParams())
	b := Generate(777, "star_rich", sk, DefaultParams())
	if len(a.Features) != len(b.Features) {
		t.Fatalf("feature count differs between two generations from the same seed: %d vs %d", len(a.Features), len(b.Features))
	}
	for i := range a.Features {
		fa, fb := a.Features[i], b.Features[i]
		if fa.Size != fb.Size {
			t.Errorf("feature %d (%s): size differs: %v vs %v", i, fa.Id, fa.Size, fb.Size)
		}
		if (fa.Space == nil) != (fb.Space == nil) {
			t.Fatalf("feature %d (%s): one generation has a continuous orbit and the other does not", i, fa.Id)
		}
		if fa.Space != nil && *fa.Space != *fb.Space {
			t.Errorf("feature %d (%s): continuous orbit differs: %+v vs %+v", i, fa.Id, *fa.Space, *fb.Space)
		}
	}
}

// Scenario: The star carries no orbital element set.
func TestGenerate_Scenario_StarCarriesNoOrbitalElementSet(t *testing.T) {
	for _, gen := range sweptInteriors(1, 2) {
		for _, f := range gen.Features {
			if f.Type == FeatureStar {
				if f.Space != nil {
					t.Fatalf("star feature %s carries a non-nil continuous orbit: %+v", f.Id, *f.Space)
				}
			}
		}
	}
}

// Scenario: Every non-star feature names a parent present in the same
// interior.
func TestGenerate_Scenario_EveryNonStarFeatureNamesAPresentParent(t *testing.T) {
	for _, gen := range sweptInteriors(100, 3) {
		ids := map[string]bool{}
		for _, f := range gen.Features {
			ids[f.Id] = true
		}
		for _, f := range gen.Features {
			if f.Type == FeatureStar {
				continue
			}
			if f.Space == nil {
				t.Fatalf("non-star feature %s carries no continuous orbit at all", f.Id)
			}
			if !ids[f.Space.ParentId] {
				t.Fatalf("feature %s names parent %q, which is not present in the same interior", f.Id, f.Space.ParentId)
			}
		}
	}
}

// Scenario: Every angle is an integer sub-turn within range.
func TestGenerate_Scenario_EveryAngleIsIntegerSubTurnInRange(t *testing.T) {
	for _, gen := range sweptInteriors(200, 3) {
		for _, f := range gen.Features {
			if f.Space == nil {
				continue
			}
			for name, a := range map[string]space.SubTurns{"phase": f.Space.Phase, "inclination": f.Space.Inclination, "node": f.Space.Node} {
				if a < 0 || a >= space.SubTurn {
					t.Fatalf("feature %s: %s = %v, want in [0, SubTurn=%v)", f.Id, name, a, space.SubTurn)
				}
			}
		}
	}
}

// Scenario: Every feature has a strictly positive size.
func TestGenerate_Scenario_EveryFeatureHasStrictlyPositiveSize(t *testing.T) {
	for _, gen := range sweptInteriors(300, 3) {
		for _, f := range gen.Features {
			if !(f.Size > 0) {
				t.Fatalf("feature %s (%s) has size %v, want strictly positive", f.Id, f.Type, f.Size)
			}
		}
	}
}

// --- "Feature Size Is Drawn From a Per-Type Band..." (dynamic half) -------

// Scenario: Every drawn size falls inside its own type's band.
func TestGenerate_Scenario_EveryDrawnSizeFallsInsideItsOwnTypeBand(t *testing.T) {
	bands := map[FeatureType][2]float64{
		FeatureGasGiant:    {3.4, 4.2},
		FeatureIce:         {1.9, 2.7},
		FeatureRocky:       {1.6, 2.4},
		FeatureMoon:        {0.5, 1.0},
		FeatureAnomaly:     {0.8, 1.6},
		FeatureRuin:        {0.8, 1.6},
		FeatureGravityWell: {1.0, 3.0},
		FeatureRadiation:   {1.0, 3.0},
		FeatureNebula:      {1.0, 3.0},
		FeatureDebris:      {1.0, 3.0},
	}
	for _, gen := range sweptInteriors(400, 4) {
		for _, f := range gen.Features {
			band, ok := bands[f.Type]
			if !ok {
				continue // star / belt / station: constant or class-derived, not band-drawn
			}
			if f.Size < band[0] || f.Size > band[1] {
				t.Errorf("feature %s (%s): size %v outside its configured band [%v, %v]", f.Id, f.Type, f.Size, band[0], band[1])
			}
			if f.Size > MaxFeatureSize(f.Type) {
				t.Errorf("feature %s (%s): size %v exceeds MaxFeatureSize(%s)=%v", f.Id, f.Type, f.Size, f.Type, MaxFeatureSize(f.Type))
			}
		}
	}
}

// --- Inclination / retrograde, Generate()-level ---------------------------

// Scenario: Every generated orbiting feature has a strictly positive period.
func TestGenerate_Scenario_EveryOrbitingFeatureHasStrictlyPositivePeriod(t *testing.T) {
	for _, gen := range sweptInteriors(500, 3) {
		for _, f := range gen.Features {
			if f.Type == FeatureStar {
				continue
			}
			if f.Space == nil {
				t.Fatalf("non-star feature %s has no continuous orbit", f.Id)
			}
			if !(f.Space.PeriodMs > 0) {
				t.Fatalf("feature %s: continuous period = %v, want strictly positive", f.Id, f.Space.PeriodMs)
			}
		}
	}
}

// Scenario: Every generated inclination lies within its configured band.
func TestGenerate_Scenario_EveryGeneratedInclinationLiesWithinItsBand(t *testing.T) {
	for _, gen := range sweptInteriors(600, 4) {
		for _, f := range gen.Features {
			if f.Space == nil {
				continue
			}
			i := f.Space.Inclination
			if !isProgradeInclination(i) && !isRetrogradeInclination(i) {
				t.Fatalf("feature %s: inclination %v falls in neither the prograde nor the retrograde band", f.Id, i)
			}
		}
	}
}

// diskBornPrefixes are the id families whose orbital side is the system's
// dominant direction outright, with no capture roll of their own: skeleton
// major bodies, belts, and hazards. Used only as a fail-closed fixture guard
// below — the assertion itself filters on "not capture-plausible", so a
// disk-born family added later is covered automatically rather than silently
// skipped.
var diskBornPrefixes = []string{"feat-body-", "feat-belt-", "feat-hazard-"}

// TestGenerate_DiskBornFeatureSideFollowsDominantDirection is SDET-added
// (task 2.10b, link 9 of docs/plans/continous_space/chain.md) —
// deliberately NOT named with a `Scenario_` segment, because it is not a
// spec scenario and must never be greppable as one.
//
// The scenario that used to stand here is retired with NO successor, and
// system-interior's REMOVED block for the retired non-positive-period
// phrasing of the retrograde requirement — the predecessor of the ADDED
// requirement named below — says so in as many words (that block carries
// both the retired requirement title and the retired scenario's title, which
// this comment therefore does not repeat): it asserted agreement between two
// representations of one fact, and only one representation remains, so there
// is nothing left for it to agree with. It is not repointed, and it must not
// be reinvented under a scenario name.
//
// What survives it is substance, not a scenario. The retired test was the
// only sweep tying a DISK-BORN body's inclination band to
// DominantOrbitDirection at the DEFAULT RetrogradeChance and across every
// skeleton and region dial. The guarantee belongs to the ADDED requirement
// "Retrograde Motion Is Expressed By Inclination, Never By a Non-Positive
// Period" — "the system's DominantOrbitDirection for every disk-born feature
// (skeleton-derived bodies, belts, hazards)". Its SCENARIO-level coverage is
// TestGenerate_Scenario_CertainRetrogradeChanceInvertsCapturePlausibleFeatures
// below, which asserts the same anchoring but under one skeleton, one region,
// and only at the knob's extreme; generator_test.go's
// TestGenerate_DiskBornFeaturesShareDominantDirection asserts only that
// disk-born features agree with EACH OTHER, which a hard-coded side would
// satisfy. This probe re-sources the retired test onto the direction roll
// that task 2.5 makes the sole source of the side, and keeps its wider
// default-params sweep.
func TestGenerate_DiskBornFeatureSideFollowsDominantDirection(t *testing.T) {
	seenSign := map[int]bool{}
	seenFamily := map[string]bool{}
	for _, gen := range sweptInteriors(700, 4) {
		sysDir := DominantOrbitDirection(gen.Interior.Seed)
		seenSign[sysDir] = true
		diskIsRetrograde := sysDir < 0
		for _, f := range gen.Features {
			// Star-parented and disk-born only. A moon is excluded by the
			// parent filter (it takes the same dominant direction, but by its
			// own generator path, under its own scenario test above); a
			// capture-plausible detail feature is excluded because its side
			// is diskOrCaptured's per-feature roll on the primary stream,
			// which is not reconstructible from outside the generator — the
			// RetrogradeChance=0 and =1 scenarios below pin that half.
			if f.Space == nil || f.Space.ParentId != "feat-star" || isCapturePlausibleId(f.Id) {
				continue
			}
			for _, p := range diskBornPrefixes {
				if strings.HasPrefix(f.Id, p) {
					seenFamily[p] = true
				}
			}
			// The side must land on ITS OWN system's disk band — retrograde
			// when that system's dominant direction is negative, prograde
			// when it is positive — never a fixed absolute band.
			if isRetrogradeInclination(f.Space.Inclination) != diskIsRetrograde {
				t.Fatalf("seed %d (dominant dir=%d): disk-born feature %s continuous inclination %v does not sit on its own system's disk side", gen.Interior.Seed, sysDir, f.Id, f.Space.Inclination)
			}
		}
	}
	// Fail closed. Without these two guards the test is satisfiable by a
	// generator that hard-coded one side: a single-sign sweep would never
	// exercise the retrograde band, and a sweep that happened to generate no
	// belts or hazards would leave those families' side plumbing unasserted.
	if !seenSign[1] || !seenSign[-1] {
		t.Fatalf("fixture: the swept interiors must hit both signs of DominantOrbitDirection (saw +1=%v, -1=%v) — a single-sign sweep passes against a generator that always draws prograde", seenSign[1], seenSign[-1])
	}
	for _, p := range diskBornPrefixes {
		if !seenFamily[p] {
			t.Fatalf("fixture: the swept interiors generated no %s* feature — that disk-born family's side is untested", p)
		}
	}
}

// Scenario: A moon or the station takes its side from the system's dominant
// direction. (The station half is covered in backend/stations —
// continuous_orbit_test.go; this covers moons.)
func TestGenerate_Scenario_MoonTakesSideFromDominantDirection(t *testing.T) {
	for _, gen := range sweptInteriors(800, 4) {
		sysDir := DominantOrbitDirection(gen.Interior.Seed)
		for _, f := range gen.Features {
			if f.Type != FeatureMoon || f.Space == nil {
				continue
			}
			wantRetrograde := sysDir < 0
			if wantRetrograde != isRetrogradeInclination(f.Space.Inclination) {
				t.Errorf("moon %s: system dominant dir=%d but inclination %v does not match", f.Id, sysDir, f.Space.Inclination)
			}
		}
	}
}

// captureplausibleTypes are the detail-feature families whose orbital
// direction is a coin flip against RetrogradeChance (diskOrCaptured) —
// extra bodies (feat-extra-*) and specials (feat-special-*: anomaly/ruin).
// Skeleton bodies, belts, and hazards always draw the disk's own convention
// and must NOT flip even at RetrogradeChance=1.
func isCapturePlausibleId(id string) bool {
	return strings.HasPrefix(id, "feat-extra-") || strings.HasPrefix(id, "feat-special-")
}

// Scenario: Zero retrograde chance yields fully prograde detail features.
//
// "Prograde" here means the side of a system's OWN disk, not a fixed
// absolute band: design.md Decision 17 (and the spec's own wording — "falls
// on the same side as that system's disk-born features") pins the
// continuous inclination's side to the ABSOLUTE sign of the feature's own
// direction roll, and DominantOrbitDirection is a per-system coin flip that
// can land negative. At a negative dominant direction, RetrogradeChance=0
// correctly places every capture-plausible feature (roll=sysDir=-1) in the
// [SubTurn/2-MaxInclinationJitter, SubTurn/2] band — the disk's own band for
// that system, not the [0, MaxInclinationJitter] absolute-prograde band. The
// swept seed ranges below are confirmed (fixture check, not incidental) to
// hit both signs of DominantOrbitDirection, and the test fails closed if a
// future change to DominantOrbitDirection's internals stopped that.
func TestGenerate_Scenario_ZeroRetrogradeChanceYieldsFullyPrograde(t *testing.T) {
	params := DefaultParams()
	params.RetrogradeChance = 0
	sk := sweptSkeletons[3] // richest skeleton: more room for extra/special features
	sawPositiveDir, sawNegativeDir := false, false
	for seed := int64(900); seed < 950; seed++ {
		gen := Generate(seed, "star_rich", sk, params)
		sysDir := DominantOrbitDirection(gen.Interior.Seed)
		if sysDir > 0 {
			sawPositiveDir = true
		} else {
			sawNegativeDir = true
		}
		diskIsRetrograde := sysDir < 0
		for _, f := range gen.Features {
			if !isCapturePlausibleId(f.Id) {
				continue
			}
			// SDET (task 2.10b, link 9): this leg once carried a second
			// assertion against the retired board-era direction field — the
			// other side of the same guarantee. That assertion is dropped,
			// not repointed: task 2.5 re-sources continuousStarParented's
			// retrograde input from (DominantOrbitDirection/diskOrCaptured)
			// directly, and the field it would have compared against is
			// deleted (task 2.1), so no second representation of the side
			// remains. The surviving assertion below already reads its
			// expectation from DominantOrbitDirection alone, so it is
			// unaffected by that deletion and, on its own, still fails if
			// continuousStarParented's retrograde input silently becomes
			// always-false (proven by stub in a scratch copy; see the SDET
			// coverage report at docs/plans/continous_space/handoffs/
			// link9-red-coverage.md, task 2.10b).
			if f.Space == nil {
				continue
			}
			// The feature's continuous side must land on ITS OWN system's
			// disk band — retrograde when that system's dominant direction
			// is negative, prograde when it is positive — never a fixed
			// absolute band regardless of sysDir's sign.
			if isRetrogradeInclination(f.Space.Inclination) != diskIsRetrograde {
				t.Fatalf("seed %d (dominant dir=%d): capture-plausible feature %s continuous inclination %v does not sit on its own system's disk side at RetrogradeChance=0", seed, sysDir, f.Id, f.Space.Inclination)
			}
		}
	}
	if !sawPositiveDir || !sawNegativeDir {
		t.Fatalf("fixture: swept seed range 900-950 must hit both signs of DominantOrbitDirection (saw positive=%v, negative=%v) — the scenario is untested for the sign it missed", sawPositiveDir, sawNegativeDir)
	}
}

// Scenario: Certain retrograde chance inverts every capture-plausible
// feature's inclination, while skeleton bodies/belts/hazards still draw the
// disk's own convention.
//
// Same absolute-roll/relative-band distinction as the RetrogradeChance=0
// scenario above: at RetrogradeChance=1 a capture-plausible feature's
// direction roll is the NEGATION of its system's dominant direction, so its
// continuous side lands on the band OPPOSITE that system's own disk side —
// not a fixed absolute "always retrograde" band, which is unsatisfiable
// whenever sysDir is negative (disk-born features share that same negative
// sign and must NOT flip). Swept seeds are confirmed to hit both signs.
func TestGenerate_Scenario_CertainRetrogradeChanceInvertsCapturePlausibleFeatures(t *testing.T) {
	params := DefaultParams()
	params.RetrogradeChance = 1
	sk := sweptSkeletons[3]
	sawPositiveDir, sawNegativeDir := false, false
	for seed := int64(1000); seed < 1050; seed++ {
		gen := Generate(seed, "star_rich", sk, params)
		sysDir := DominantOrbitDirection(gen.Interior.Seed)
		if sysDir > 0 {
			sawPositiveDir = true
		} else {
			sawNegativeDir = true
		}
		diskIsRetrograde := sysDir < 0
		for _, f := range gen.Features {
			// SDET (task 2.10b, link 9): both cases below once carried a
			// second assertion against the retired board-era direction
			// field — see the ZeroRetrogradeChance test above for why that
			// leg is dropped, not repointed, and why the surviving
			// continuous-side assertions are unaffected by its deletion.
			switch {
			case isCapturePlausibleId(f.Id):
				if f.Space == nil {
					continue
				}
				// Opposite of the disk's own side — not an absolute
				// "always retrograde" assertion.
				if isRetrogradeInclination(f.Space.Inclination) != !diskIsRetrograde {
					t.Fatalf("seed %d (dominant dir=%d): capture-plausible feature %s continuous inclination %v is not on the side opposite its own system's disk at RetrogradeChance=1", seed, sysDir, f.Id, f.Space.Inclination)
				}
			case strings.HasPrefix(f.Id, "feat-body-"), strings.HasPrefix(f.Id, "feat-belt-"), strings.HasPrefix(f.Id, "feat-hazard-"):
				// Disk-born: always the dominant direction, unaffected by
				// RetrogradeChance — same band as the disk itself.
				if f.Space != nil && isRetrogradeInclination(f.Space.Inclination) != diskIsRetrograde {
					t.Fatalf("seed %d (dominant dir=%d): disk-born feature %s continuous inclination %v left its own system's disk side at RetrogradeChance=1", seed, sysDir, f.Id, f.Space.Inclination)
				}
			}
		}
	}
	if !sawPositiveDir || !sawNegativeDir {
		t.Fatalf("fixture: swept seed range 1000-1050 must hit both signs of DominantOrbitDirection (saw positive=%v, negative=%v) — the scenario is untested for the sign it missed", sawPositiveDir, sawNegativeDir)
	}
}

// --- Period law, Generate()-level ------------------------------------------

// Scenario: A body-parented period follows the shipped insertion-period law.
func TestGenerate_Scenario_MoonPeriodFollowsShippedInsertionLaw(t *testing.T) {
	found := false
	for _, gen := range sweptInteriors(1100, 4) {
		for _, f := range gen.Features {
			if f.Type != FeatureMoon || f.Space == nil {
				continue
			}
			found = true
			want := space.InsertionPeriod(f.Space.Radius)
			if f.Space.PeriodMs != want {
				t.Errorf("moon %s: period = %v, want space.InsertionPeriod(%v) = %v", f.Id, f.Space.PeriodMs, f.Space.Radius, want)
			}
		}
	}
	if !found {
		t.Fatal("fixture: no moon was generated across the swept set — the skeleton fixtures must include a gas giant")
	}
}

// Scenario: A persisted period round-trips exactly through the codec.
func TestGenerate_Scenario_PeriodRoundTripsExactlyThroughCodec(t *testing.T) {
	gen := Generate(1234, "star_rich", sweptSkeletons[2], DefaultParams())
	for _, f := range gen.Features {
		if f.Space == nil {
			continue
		}
		enc := space.EncodeOrbit(*f.Space)
		dec, err := space.DecodeOrbit(enc)
		if err != nil {
			t.Fatalf("feature %s: orbit failed to decode: %v", f.Id, err)
		}
		if dec.PeriodMs != f.Space.PeriodMs {
			t.Errorf("feature %s: decoded period %v != generated period %v", f.Id, dec.PeriodMs, f.Space.PeriodMs)
		}
	}
}

// Scenario: Retuning the period law leaves already-persisted features
// unchanged.
//
// This cannot flip a Go `const` at runtime, so it tests the STRUCTURAL fact
// the requirement actually depends on: the codec persists PeriodMs as its
// own stored value and never recomputes it from Radius on decode. Proof: if
// we corrupt the encoded radius (simulating "the law governing this radius
// changed") and decode, the period must come back UNCHANGED — a read-time
// re-derivation would instead produce a different period for the new radius.
func TestGenerate_Scenario_RetuningPeriodLawLeavesPersistedFeaturesUnchanged(t *testing.T) {
	gen := Generate(4321, "star_rich", sweptSkeletons[2], DefaultParams())
	var target Feature
	for _, f := range gen.Features {
		if f.Type != FeatureStar && f.Space != nil {
			target = f
			break
		}
	}
	if target.Id == "" {
		t.Fatal("fixture: no non-star feature found")
	}
	originalPeriod := target.Space.PeriodMs

	enc := space.EncodeOrbit(*target.Space)
	// Simulate "the law governing this radius later changed" by mutating the
	// PERSISTED radius to something a live re-derivation would treat
	// differently, while leaving periodMs as originally persisted.
	enc["radius"] = target.Space.Radius * 5

	dec, err := space.DecodeOrbit(enc)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if dec.PeriodMs != originalPeriod {
		t.Fatalf("decoded period %v != originally-generated period %v — the codec appears to be re-deriving period from radius rather than persisting it", dec.PeriodMs, originalPeriod)
	}
}

// --- "A Generated Parent Chain Never Exceeds the Resolver's Depth Bound" --

// Scenario: A moon's position composes its parent's.
func TestGenerate_Scenario_MoonPositionComposesParent(t *testing.T) {
	gen := Generate(2468, "star_rich", sweptSkeletons[2], DefaultParams())
	bodies := toBodies(gen)
	var moon *Feature
	for i := range gen.Features {
		if gen.Features[i].Type == FeatureMoon {
			moon = &gen.Features[i]
			break
		}
	}
	if moon == nil {
		t.Fatal("fixture: no moon generated")
	}
	const t0 = common.WorldMillis(50_000)
	parentPos, err := space.Position(bodies, moon.Space.ParentId, t0)
	if err != nil {
		t.Fatalf("resolving moon's parent position: %v", err)
	}
	moonPos, err := space.Position(bodies, moon.Id, t0)
	if err != nil {
		t.Fatalf("resolving moon position: %v", err)
	}
	want := parentPos.Add(moon.Space.LocalPosition(t0))
	if moonPos != want {
		t.Errorf("moon position = %+v, want parent position + local offset = %+v", moonPos, want)
	}
}

// Scenario: The deepest generated chain resolves with no error.
func TestGenerate_Scenario_DeepestGeneratedChainResolvesWithNoError(t *testing.T) {
	for _, gen := range sweptInteriors(3000, 3) {
		bodies := toBodies(gen)
		for _, f := range gen.Features {
			if _, err := space.Position(bodies, f.Id, 0); err != nil {
				t.Fatalf("feature %s failed to resolve through space.Position: %v", f.Id, err)
			}
		}
	}
}

// Scenario: No generated chain cycles.
func TestGenerate_Scenario_NoGeneratedChainCycles(t *testing.T) {
	for _, gen := range sweptInteriors(3100, 3) {
		byId := map[string]Feature{}
		for _, f := range gen.Features {
			byId[f.Id] = f
		}
		for _, f := range gen.Features {
			visited := map[string]bool{f.Id: true}
			cur := f
			for cur.Space != nil {
				parent, ok := byId[cur.Space.ParentId]
				if !ok {
					t.Fatalf("feature %s: chain names absent parent %q", f.Id, cur.Space.ParentId)
				}
				if visited[parent.Id] {
					t.Fatalf("feature %s: parent chain revisits %s — a cycle", f.Id, parent.Id)
				}
				visited[parent.Id] = true
				cur = parent
			}
			// cur is now the star (or a parentless feature) — chain terminated.
			if cur.Type != FeatureStar {
				t.Fatalf("feature %s: chain terminates at non-star parentless feature %s", f.Id, cur.Id)
			}
		}
	}
}

// --- Belt requirement's id-separator scenario (Generate()-level) ----------

// Scenario: No generated feature id contains the member separator.
func TestGenerate_Scenario_NoFeatureIdContainsMemberSeparator(t *testing.T) {
	for _, gen := range sweptInteriors(3200, 3) {
		for _, f := range gen.Features {
			if strings.Contains(f.Id, "#") {
				t.Fatalf("generated feature id %q contains the reserved '#' member separator", f.Id)
			}
		}
	}
}
