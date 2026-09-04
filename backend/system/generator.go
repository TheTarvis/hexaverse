package system

import (
	"fmt"
	"math/rand"

	"hexaverse/galaxy"
	"hexaverse/space"
)

func newRand(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

// Generate is the pure interior generator: a deterministic function of the
// per-system seed, the graph-tier region (the character dial), and the eager
// skeleton rolled in #0001. It extends that skeleton with the paid detail —
// small bodies, belts, moons, anomalies/ruins, hazards — never contradicting it
// (same seed derivation, skeleton bodies present in the interior).
//
// Two RNG streams, both always live: r is the primary stream (which bodies
// exist, what they are made of), r2 the continuous stream (each body's orbital
// element set and size). They were split so a body's continuous draw could not
// perturb which bodies got generated (openspec pin-system-generation-
// determinism, design.md Decision 2); the split survives that reason, because
// the two streams still answer two different questions and mixing them would
// make a size retune move a lode.
func Generate(seed int64, region string, skeleton galaxy.Skeleton, params GenerationParams) GeneratedInterior {
	r := newRand(seed)
	r2 := newRand(continuousSeed(seed))

	dial := params.dialFor(region)

	// The disk's dominant spin: every disk-born body (skeleton majors, belts,
	// hazards) orbits prograde in it; only capture-plausible detail may rarely run
	// against it (see diskOrCaptured).
	sysDir := DominantOrbitDirection(seed)

	features := make([]Feature, 0, 16)

	// Star at the centre — the one parentless body, carrying no orbital
	// element set at all; its size comes from its class alone, never drawn
	// (design.md Decision 4).
	features = append(features, Feature{
		Id: "feat-star", Type: FeatureStar, Name: "Star (" + skeleton.StarClass + ")",
		Size: StarSize(skeleton.StarClass),
	})

	// Skeleton major bodies → star-parented features at their skeleton
	// ordinals (extends #0001). The orbital index is the RAW skeleton ordinal
	// b.Ring: it is what ContinuousRadius consumes, and design.md Decision 2's
	// central finding is that two skeleton bodies sharing a coarse index must
	// still receive strictly different continuous radii.
	var giantIDs []string
	for i, b := range skeleton.Bodies {
		ft := featureTypeForBody(b.Type)
		id := fmt.Sprintf("feat-body-%d", i)
		f := orbitFeature(id, ft)
		f.Resources = resourcesFor(bandForRing(b.Ring, params), ft, dial.RichnessMult, r)
		continuousStarParented(&f, b.Ring, sysDir, r2)
		features = append(features, f)
		if ft == FeatureGasGiant {
			giantIDs = append(giantIDs, id)
		}
	}

	// --- Detail, dialed by character -------------------------------------

	// Extra small/dark bodies. The orbital index is an integer draw in
	// [1, params.Radius] — an ordinal ContinuousRadius consumes and a band
	// boundary reads, with no geometry of its own.
	for i := 0; i < dial.ExtraPlanets; i++ {
		ring := 1 + r.Intn(params.Radius)
		ft := FeatureRocky
		if bandForRing(ring, params) == BandOuter {
			ft = FeatureIce
		}
		// The side is decided ONCE, here, on the primary stream, and is then
		// the sole source of the body's inclination side (see
		// continuousStarParented).
		dir := diskOrCaptured(sysDir, params.RetrogradeChance, r)
		f := orbitFeature(fmt.Sprintf("feat-extra-%d", i), ft)
		f.Resources = resourcesFor(bandForRing(ring, params), ft, dial.RichnessMult, r)
		continuousStarParented(&f, ring, dir, r2)
		features = append(features, f)
	}

	// Belts (metals inner, ice outer).
	for i := 0; i < dial.Belts; i++ {
		ring := 2 + r.Intn(params.Radius-2)
		features = append(features, beltFeature(fmt.Sprintf("feat-belt-%d", i), ring, sysDir, r, params, dial, r2))
	}

	// Moons riding gas giants — body-parented, so ContinuousRadius never
	// applies (design.md Decision 2); their local radius follows Decision
	// 16's named band instead, anchored on the parent's own already-drawn
	// continuous size.
	for i, gid := range giantIDs {
		m := Feature{
			Id: fmt.Sprintf("feat-moon-%d", i), Type: FeatureMoon,
			Resources: resourcesFor(BandOuter, FeatureMoon, dial.RichnessMult, r),
		}
		parentSize := featureSizeById(features, gid)
		localRadius := MoonOrbitLocalRadius(space.Body{Id: gid, Size: parentSize}, r2.Float64())
		period := space.InsertionPeriod(localRadius)
		// A moon's side comes from the system's dominant direction directly
		// (design.md Decision 17) — it is disk-born around its parent.
		incl := inclinationFor(sysDir < 0, r2.Float64())
		m.Space = &space.Orbit{
			ParentId: gid, Radius: localRadius, PeriodMs: period,
			Phase: wrapSubTurnFraction(r2.Float64()), Inclination: incl, Node: wrapSubTurnFraction(r2.Float64()),
		}
		m.Size = drawFeatureSize(FeatureMoon, r2)
		features = append(features, m)
	}

	// Mid-band anomalies / ruins.
	for i := 0; i < dial.Specials; i++ {
		ring := params.InnerMaxRing + 1 + r.Intn(maxInt(1, params.MidMaxRing-params.InnerMaxRing))
		ft := FeatureAnomaly
		if r.Float64() < 0.5 {
			ft = FeatureRuin
		}
		dir := diskOrCaptured(sysDir, params.RetrogradeChance, r)
		f := orbitFeature(fmt.Sprintf("feat-special-%d", i), ft)
		if ft == FeatureAnomaly {
			// The float64() conversion is load-bearing: it forces the
			// intermediate rounding that inhibits FMA contraction on arm64.
			// Assigning the product to a local does NOT — gc fuses across
			// statements. Do not "simplify" this (openspec
			// pin-system-generation-determinism, design.md Decision 1).
			f.Resources = []Resource{{Kind: ResourceExotic, Richness: 0.4 + float64(0.6*r.Float64()*dial.RichnessMult)}}
		} else {
			// Same load-bearing float64() guard as the anomaly branch above.
			f.Resources = []Resource{{Kind: ResourceResearch, Richness: 0.3 + float64(0.5*r.Float64()*dial.RichnessMult)}}
		}
		continuousStarParented(&f, ring, dir, r2)
		features = append(features, f)
	}

	// Hazards (features with effects payloads).
	for i := 0; i < dial.Hazards; i++ {
		features = append(features, hazardFeature(fmt.Sprintf("feat-hazard-%d", i), sysDir, r, params, r2))
	}

	return GeneratedInterior{
		Interior: SystemInterior{
			Seed:      seed,
			Character: region,
			StarClass: skeleton.StarClass,
			Version:   1,
			// Extent is the continuous upper bound over every star-parented
			// family's radius (design.md Decision 2) — persisted here, at
			// generation time, since it is what a gate anchors on.
			Extent: ContinuousRadius(params.Radius),
		},
		Features: features,
	}
}

// featureSizeById returns the already-generated size of the feature with the
// given id, scanning the slice built so far. Used only for a moon's parent
// (skeleton major bodies are always generated before their moons in this
// function), so the small linear scan costs nothing observable.
func featureSizeById(features []Feature, id string) float64 {
	for _, f := range features {
		if f.Id == id {
			return f.Size
		}
	}
	return 0
}

// --- Feature builders ------------------------------------------------------

// orbitFeature builds a star-parented body's identity. Its POSITION is not set
// here: the caller attaches it through continuousStarParented, which draws the
// whole orbital element set from the continuous stream. This function exists
// so the three families that share that shape (skeleton majors, extra bodies,
// specials) read the same way at their call sites.
func orbitFeature(id string, ft FeatureType) Feature {
	return Feature{Id: id, Type: ft}
}

// DominantOrbitDirection is a system's disk spin (+1 / −1), a PURE function of
// the per-system seed. Every disk-born feature of that system's interior orbits
// in it, and so does the system's trading station (#0011) — which is why this is
// exported: the station store derives its orbit without reading the interior,
// and both must agree.
//
// Deliberately NOT a draw from the generator's rand stream. Sharing that stream
// would couple the station's direction to generation draw ORDER, so inserting
// one roll anywhere earlier in Generate would silently flip stations against
// their own disks — the exact divergence this being one function prevents.
func DominantOrbitDirection(seed int64) int {
	// splitmix64 finalizer: adjacent seeds (systems in one galaxy share a
	// derivation base) must not correlate into visible banding.
	x := uint64(seed) + 0x9E3779B97F4A7C15
	x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
	x = (x ^ (x >> 27)) * 0x94D049BB133111EB
	x ^= x >> 31
	if x&1 == 0 {
		return -1
	}
	return 1
}

// diskOrCaptured rolls a capture-plausible body's direction: the disk's
// dominant direction almost always, or — with the tuned RetrogradeChance —
// against it, so a retrograde body reads as a captured object (a Triton),
// not generator noise.
func diskOrCaptured(sysDir int, retrogradeChance float64, r *rand.Rand) int {
	if r.Float64() < retrogradeChance {
		return -sysDir
	}
	return sysDir
}

func beltFeature(id string, ring, dir int, r *rand.Rand, params GenerationParams, dial CharacterDial, r2 *rand.Rand) Feature {
	kind := ResourceMetals
	if bandForRing(ring, params) == BandOuter {
		kind = ResourceWater
	}
	f := Feature{
		Id: id, Type: FeatureBelt,
		// The float64() conversion is load-bearing: it forces the
		// intermediate rounding that inhibits FMA contraction on arm64.
		// Assigning the product to a local does NOT — gc fuses across
		// statements. Do not "simplify" this (openspec
		// pin-system-generation-determinism, design.md Decision 1).
		Resources: []Resource{{Kind: kind, Richness: 0.3 + float64(0.5*r.Float64()*dial.RichnessMult)}},
	}
	continuousStarParented(&f, ring, dir, r2)
	// Width is the belt's full radial thickness, persisted at generation
	// time rather than re-derived on read (design.md Decision 5): a later
	// retune of BeltWidthFraction must never retroactively move an
	// already-materialized belt's members.
	f.Width = float64(BeltWidthFraction * f.Space.Radius)
	return f
}

func hazardFeature(id string, dir int, r *rand.Rand, params GenerationParams, r2 *rand.Rand) Feature {
	ring := 1 + r.Intn(params.Radius)
	band := bandForRing(ring, params)
	var ft FeatureType
	var eff Effects
	switch {
	case ring <= 1:
		ft, eff = FeatureGravityWell, Effects{MoveMod: 0.5, ScanMod: 0.8}
	case band == BandInner:
		ft, eff = FeatureRadiation, Effects{ScanMod: 0.6}
	case band == BandOuter:
		ft, eff = FeatureNebula, Effects{ScanMod: 0.4, MoveMod: 0.8}
	default:
		ft, eff = FeatureDebris, Effects{MoveMod: 0.7}
	}
	f := Feature{Id: id, Type: ft, Effects: &eff}
	continuousStarParented(&f, ring, dir, r2)
	return f
}

// --- Resource + type mapping ----------------------------------------------

func resourcesFor(band Band, ft FeatureType, richnessMult float64, r *rand.Rand) []Resource {
	if ft == FeatureGasGiant {
		return []Resource{{Kind: ResourceVolatiles, Richness: rich(0.4, 0.9, richnessMult, r)}}
	}
	switch band {
	case BandInner, BandCore:
		return []Resource{{Kind: ResourceMetals, Richness: rich(0.4, 0.9, richnessMult, r)}}
	case BandMid:
		kind := ResourceOrganics
		if r.Float64() < 0.5 {
			kind = ResourceWater
		}
		return []Resource{{Kind: kind, Richness: rich(0.3, 0.8, richnessMult, r)}}
	default: // outer
		kind := ResourceVolatiles
		if r.Float64() < 0.5 {
			kind = ResourceWater
		}
		return []Resource{{Kind: kind, Richness: rich(0.3, 0.8, richnessMult, r)}}
	}
}

func rich(lo, hi, mult float64, r *rand.Rand) float64 {
	// Both float64() conversions are load-bearing: the inner one guards the
	// fusible `lo + (hi-lo)*r.Float64()` shape, forcing the intermediate
	// rounding that inhibits FMA contraction on arm64; the outer one guards
	// the multiply-by-mult defensively, so a later edit adding a downstream
	// term cannot silently re-open the site. Assigning either product to a
	// local does NOT inhibit fusion — gc fuses across statements. Do not
	// "simplify" this (openspec pin-system-generation-determinism, design.md
	// Decision 1).
	v := float64(float64(lo+float64((hi-lo)*r.Float64())) * mult)
	if v > 1 {
		v = 1
	}
	return v
}

func featureTypeForBody(t galaxy.BodyType) FeatureType {
	switch t {
	case galaxy.BodyGasGiant:
		return FeatureGasGiant
	case galaxy.BodyIce:
		return FeatureIce
	default: // rocky, molten, oceanic, barren → rocky (feature family has no sub-rock types)
		return FeatureRocky
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
