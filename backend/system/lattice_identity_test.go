package system

// The single highest-value test in openspec change add-orbital-system-bodies
// (design.md Decision 11: "This is an acceptance gate, not a hope"; tasks.md
// 2.3: "STOP and do not proceed past this section until this test is
// green").
//
// system-interior › "Interiors Emit Continuous Orbital Elements For Every
// Body" — Scenario: "Adding continuous elements leaves every lattice
// placement unchanged".
//
// UNLIKE every other test in this RED handoff, this one is a CHARACTERIZATION
// / golden-master test and is EXPECTED TO BE GREEN FROM THE START, not red.
// Its entire purpose is regression prevention: it pins Generate()'s lattice
// output (ring, angle0, dir, footprint, resources, effects, ids, generation
// order) as of TODAY — before the second RNG stream or any continuous draw
// exists — and must stay bit-identical after the developer adds them. If it
// goes red partway through implementation, the two RNG streams have crossed
// and the developer must stop (per Decision 11 and tasks.md 2.3's own STOP
// rule) rather than "fix" this test to match the new output.
//
// The pinned digest below was computed by actually running today's
// (pre-change) Generate() over the swept fixture set this file defines. It
// is intentionally NOT computed via a helper the developer could accidentally
// change; latticeDigest is defined once, here, over Feature fields that
// exist today.
import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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

// latticeDigest hashes the newline-joined canonical JSON projection of every
// fixture case, in order.
func latticeDigest(t *testing.T, cases []GeneratedInterior) string {
	t.Helper()
	h := sha256.New()
	for i, gen := range cases {
		proj := projectLattice(gen)
		b, err := json.Marshal(proj)
		if err != nil {
			t.Fatalf("case %d: marshal projection: %v", i, err)
		}
		if i > 0 {
			h.Write([]byte{'\n'})
		}
		h.Write(b)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// wantLatticeDigest was computed by running this exact test's fixture set
// against TODAY's Generate() (before any continuous element / second RNG
// stream exists) — see the file header. Do not update this value to make a
// failing test pass; a mismatch means the lattice draw sequence moved,
// which is precisely the regression Decision 11 exists to catch.
const wantLatticeDigest = "141cffd85106b1f9eced53adfa9968c8bc2cc224beca1341803328fd1b932241"

func TestGenerate_Scenario_AddingContinuousElementsLeavesLatticePlacementUnchanged(t *testing.T) {
	cases := latticeIdentityFixtures()
	if len(cases) == 0 {
		t.Fatal("fixture: no cases generated")
	}
	got := latticeDigest(t, cases)
	if got != wantLatticeDigest {
		t.Fatalf("lattice-identity digest mismatch: got %s, want %s\n"+
			"This means the second (continuous) RNG stream has perturbed the FIRST (lattice) stream's draw order — "+
			"STOP per design.md Decision 11 / tasks.md 2.3. Do not edit this test to match; find and fix the stream leak.",
			got, wantLatticeDigest)
	}
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
