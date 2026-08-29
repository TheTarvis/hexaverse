package system

// Originally the home of the single highest-value test in openspec change
// add-orbital-system-bodies (design.md Decision 11 / tasks.md 2.3): a
// golden-master digest constant pinning Generate()'s lattice output across
// the sweep below, to catch the second (continuous) RNG stream perturbing
// the first (lattice) stream's draw order.
//
// That constant and its comparison were RETIRED by openspec change
// pin-system-generation-determinism, task 3.6: design.md Decision 2 notes
// the stream-non-crossing claim expired once there was no longer a
// "before link 3" tree to have been perturbed, and the digest itself was
// never cross-architecture-stable (see design.md Decision 1 — FMA
// contraction), so a hand-copied hex constant in a _test.go file is exactly
// the anti-pattern cross-stack-determinism's "Recorded Cross-Target Values
// Live In Fixtures, Not Test Constants" scenario forbids. The equivalent
// regression pinning now lives in fixtures/system/cases.json's
// interiorElements family (see fixtures_test.go) and in
// generate_streams_test.go's present-vs-absent assertion.
//
// projectLattice/latticeSnapshot/latCell/latticeIdentityFixtures below
// SURVIVE this retirement: generate_streams_test.go's
// TestInteriorElementsSweep_MatchesLatticeIdentitySweep still calls them
// directly to prove its own duplicated sweep hasn't drifted from this
// file's. TestClampRing_StaysMonotonicNonDecreasing, at the bottom of this
// file, is unrelated to any of the above (design.md Decision 2's
// monotonicity argument) and is untouched by this retirement.
import (
	"testing"

	"hexaverse/galaxy"
)

// latticeSnapshot captures exactly the fields design.md Decision 11 names —
// "ring, angle0, dir, footprint, resources, effects, ids, order" — and
// nothing else (deliberately NOT Orbit.Period, which is a live-tuning fill,
// and NOT any future Space/Size/Width field, which does not exist in this
// projection at all).
type latticeSnapshot struct {
	Id        string      `json:"id"`
	Type      FeatureType `json:"type"`
	Fixed     bool        `json:"fixed,omitempty"`
	Ring      *int        `json:"ring,omitempty"`
	Angle0    *int        `json:"angle0,omitempty"`
	Dir       *int        `json:"dir,omitempty"`
	ParentId  string      `json:"parentId,omitempty"`
	Footprint []latCell   `json:"footprint"`
	Resources []Resource  `json:"resources,omitempty"`
	Effects   *Effects    `json:"effects,omitempty"`
}

type latCell struct {
	Ring int `json:"ring"`
	Slot int `json:"slot"`
}

func projectLattice(gen GeneratedInterior) []latticeSnapshot {
	out := make([]latticeSnapshot, 0, len(gen.Features))
	for _, f := range gen.Features {
		snap := latticeSnapshot{
			Id: f.Id, Type: f.Type, Fixed: f.Fixed, ParentId: f.ParentId,
			Resources: f.Resources, Effects: f.Effects,
		}
		for _, c := range f.Footprint {
			snap.Footprint = append(snap.Footprint, latCell{Ring: c.Ring, Slot: c.Slot})
		}
		if f.Orbit != nil {
			ring, angle0, dir := f.Orbit.Ring, f.Orbit.Angle0, f.Orbit.Dir
			snap.Ring, snap.Angle0, snap.Dir = &ring, &angle0, &dir
		}
		out = append(out, snap)
	}
	return out
}

// latticeIdentityFixtures is the swept set: several seeds crossed with
// several hand-built skeletons (varying body counts and ring spans) and
// every region character dial, so the sweep exercises every branch in
// Generate (extra planets, belts, moons, specials, hazards) rather than only
// one shape.
func latticeIdentityFixtures() []GeneratedInterior {
	skeletons := []galaxy.Skeleton{
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
	regions := []string{"star_rich", "normal", "dead", "barrier"}
	params := DefaultParams()

	var out []GeneratedInterior
	seed := int64(1)
	for _, sk := range skeletons {
		for _, region := range regions {
			for i := 0; i < 5; i++ { // several seeds per (skeleton, region) combo
				out = append(out, Generate(seed, region, sk, params))
				seed++
			}
		}
	}
	return out
}

// TestClampRing_StaysMonotonicNonDecreasing pins the ordering-coherence
// argument design.md Decision 2 leans on ("clampRing is monotone
// non-decreasing, so ring_i < ring_j implies clamp(ring_i) <= clamp(ring_j)")
// — an SDET-added boundary probe: if this ever went false, the "continuous
// ordering never contradicts the lattice ordering" claim would be unsound.
func TestClampRing_StaysMonotonicNonDecreasing(t *testing.T) {
	const radius = 16
	prev := clampRing(0, radius)
	for ring := 1; ring <= radius+2; ring++ {
		cur := clampRing(ring, radius)
		if cur < prev {
			t.Fatalf("clampRing(%d, %d) = %d, which is less than clampRing(%d, %d) = %d — not monotone non-decreasing", ring, radius, cur, ring-1, radius, prev)
		}
		prev = cur
	}
}
