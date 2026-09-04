package system

import (
	"fmt"
	"math/rand"

	"hexaverse/board"
	"hexaverse/galaxy"
	"hexaverse/polar"
	"hexaverse/space"
)

func newRand(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

// Generate is the pure interior generator: a deterministic function of the
// per-system seed, the graph-tier region (the character dial), and the eager
// skeleton rolled in #0001. It extends that skeleton with the paid detail —
// small bodies, belts, moons, anomalies/ruins, hazards — never contradicting it
// (same seed derivation, skeleton bodies present in the interior).
//
// Placement is onto the pinned production slot schedule at this system's own
// radius (design.md Decision 3: system.Generate is one of the two callers that
// hold a per-system radius rather than defaulting to
// board.ProductionSchedule()) — board.Schedule(params.Radius), resolved once
// here and threaded to every placement helper.
//
// Delegates to generateWithStreams (openspec pin-system-generation-
// determinism, design.md Decision 2 / tasks.md 3.1) with both RNG streams
// live — production always generates with continuous elements present.
func Generate(seed int64, region string, skeleton galaxy.Skeleton, params GenerationParams) GeneratedInterior {
	return generateWithStreams(seed, newRand(seed), newRand(continuousSeed(seed)), region, skeleton, params)
}

// generateWithStreams is Generate's extracted body, taking both RNG streams
// as parameters rather than deriving them from seed internally (openspec
// pin-system-generation-determinism, design.md Decision 2 / tasks.md 3.1).
// Streams, not seeds, because both a nil-stream mode (below) and a counting
// stream (generate_streams_test.go) need to *construct* a *rand.Rand, and
// neither should require a test-only knob in production code. seed stays a
// parameter because DominantOrbitDirection(seed) and Interior.Seed consume
// it directly, independent of r/r2.
//
// r2 == nil means "generate no continuous elements" — the mode
// TestGenerate_Scenario_LatticePlacementUnchangedWhetherContinuousDrawsPresentOrAbsent
// (generate_streams_test.go) compares against a live-r2 run to prove the
// lattice tier never depends on the continuous stream (system-interior:
// "Lattice Placement Is Independent Of The Continuous Stream"). production
// code (Generate, above) never passes nil.
func generateWithStreams(seed int64, r, r2 *rand.Rand, region string, skeleton galaxy.Skeleton, params GenerationParams) GeneratedInterior {
	dial := params.dialFor(region)
	sched := board.Schedule(params.Radius)

	// The disk's dominant spin: every disk-born body (skeleton majors, belts,
	// hazards) orbits prograde in it; only capture-plausible detail may rarely run
	// against it (see diskOrCaptured).
	sysDir := DominantOrbitDirection(seed)

	features := make([]Feature, 0, 16)

	// Star at the centre — fixed, no orbit, no continuous element set (it is
	// the one parentless body); its size comes from its class alone, never
	// drawn (design.md Decision 4).
	features = append(features, Feature{
		Id: "feat-star", Type: FeatureStar, Name: "Star (" + skeleton.StarClass + ")",
		Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}},
		Size: StarSize(skeleton.StarClass),
	})

	// Skeleton major bodies → orbit features at their rings (extends #0001).
	// The continuous orbital index is the RAW, un-clamped skeleton ring
	// (b.Ring), never the clamped lattice ring `ring` — design.md Decision 2's
	// central finding: two skeleton bodies can clamp to the identical lattice
	// ring while remaining distinct raw ordinals.
	var giantIDs []string
	for i, b := range skeleton.Bodies {
		ring := clampRing(b.Ring, params.Radius)
		ft := featureTypeForBody(b.Type)
		id := fmt.Sprintf("feat-body-%d", i)
		f := orbitFeature(id, ft, ring, sysDir, r, sched)
		f.Resources = resourcesFor(bandForRing(ring, params), ft, dial.RichnessMult, r)
		continuousStarParented(&f, b.Ring, r2)
		features = append(features, f)
		if ft == FeatureGasGiant {
			giantIDs = append(giantIDs, id)
		}
	}

	// --- Detail, dialed by character -------------------------------------

	// Extra small/dark bodies.
	for i := 0; i < dial.ExtraPlanets; i++ {
		ring := 1 + r.Intn(params.Radius)
		ft := FeatureRocky
		if bandForRing(ring, params) == BandOuter {
			ft = FeatureIce
		}
		id := fmt.Sprintf("feat-extra-%d", i)
		f := orbitFeature(id, ft, ring, diskOrCaptured(sysDir, params.RetrogradeChance, r), r, sched)
		f.Resources = resourcesFor(bandForRing(ring, params), ft, dial.RichnessMult, r)
		continuousStarParented(&f, ring, r2)
		features = append(features, f)
	}

	// Belts as ring arcs (metals inner, ice outer).
	for i := 0; i < dial.Belts; i++ {
		ring := 2 + r.Intn(params.Radius-2)
		features = append(features, beltFeature(fmt.Sprintf("feat-belt-%d", i), ring, sysDir, r, params, dial, sched, r2))
	}

	// Moons riding gas giants — body-parented, so ContinuousRadius never
	// applies (design.md Decision 2); their local radius follows Decision
	// 16's named band instead, anchored on the parent's own already-drawn
	// continuous size.
	for i, gid := range giantIDs {
		m := Feature{
			Id: fmt.Sprintf("feat-moon-%d", i), Type: FeatureMoon, ParentId: gid,
			Footprint: []board.Cell{{Ring: 0, Slot: 0}}, // computed relative to parent at render time
			Resources: resourcesFor(BandOuter, FeatureMoon, dial.RichnessMult, r),
		}
		// NIL-GUARD serving TestGenerate_Scenario_LatticePlacementUnchangedWhetherContinuousDrawsPresentOrAbsent
		// (generate_streams_test.go / system-interior: "Lattice Placement Is
		// Independent Of The Continuous Stream"). Only the Space/Size block
		// below is skipped when r2 == nil — the resourcesFor draw above and
		// the append below consume the LATTICE stream (r) and MUST run
		// identically in both modes, or absent-mode would diverge from
		// present-mode on the lattice tier itself (design.md Decision 2,
		// point 2). Do not narrow this loop to skip moons entirely — that
		// silently guts the primary assertion instead of fixing the skip.
		if r2 != nil {
			parentSize := featureSizeById(features, gid)
			localRadius := MoonOrbitLocalRadius(space.Body{Id: gid, Size: parentSize}, r2.Float64())
			period := space.InsertionPeriod(localRadius)
			// Moons carry no lattice Dir at all — their side comes from the
			// system's dominant direction directly (design.md Decision 17), the
			// same source stations.DeriveOrbit already uses.
			incl := inclinationFor(sysDir < 0, r2.Float64())
			m.Space = &space.Orbit{
				ParentId: gid, Radius: localRadius, PeriodMs: period,
				Phase: wrapSubTurnFraction(r2.Float64()), Inclination: incl, Node: wrapSubTurnFraction(r2.Float64()),
			}
			m.Size = drawFeatureSize(FeatureMoon, r2)
		}
		features = append(features, m)
	}

	// Mid-band anomalies / ruins.
	for i := 0; i < dial.Specials; i++ {
		ring := params.InnerMaxRing + 1 + r.Intn(maxInt(1, params.MidMaxRing-params.InnerMaxRing))
		ring = clampRing(ring, params.Radius)
		ft := FeatureAnomaly
		if r.Float64() < 0.5 {
			ft = FeatureRuin
		}
		f := orbitFeature(fmt.Sprintf("feat-special-%d", i), ft, ring, diskOrCaptured(sysDir, params.RetrogradeChance, r), r, sched)
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
		continuousStarParented(&f, ring, r2)
		features = append(features, f)
	}

	// Hazards (features with effects payloads).
	for i := 0; i < dial.Hazards; i++ {
		features = append(features, hazardFeature(fmt.Sprintf("feat-hazard-%d", i), sysDir, r, params, sched, r2))
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

func orbitFeature(id string, ft FeatureType, ring, dir int, r *rand.Rand, sched polar.Schedule) Feature {
	orb := orbitFor(ring, dir, r, sched)
	return Feature{
		Id: id, Type: ft, Orbit: &orb,
		Footprint: []board.Cell{board.Canon(board.Cell{Ring: ring, Slot: orb.Angle0}, sched)},
	}
}

// orbitFor rolls a body's orbit. Ring/Angle0/Dir are the generator's dice and are
// persisted; Period is filled from live tuning here only so an in-memory interior
// (the just-generated one) matches a re-read one — see PeriodFor. Dir is not a
// per-body coin flip: the caller resolves it from the system's dominant
// direction (plus, for capture-plausible detail, diskOrCaptured). Angle0 draws
// from the LIVE schedule's slot count for the ring (never a fixed 6×ring — see
// design.md Decision 2's hazard).
func orbitFor(ring, dir int, r *rand.Rand, sched polar.Schedule) Orbit {
	return Orbit{
		Ring:   ring,
		Angle0: r.Intn(sched.Slots(ring)),
		Period: PeriodFor(ring),
		Dir:    dir,
	}
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

func beltFeature(id string, ring, dir int, r *rand.Rand, params GenerationParams, dial CharacterDial, sched polar.Schedule, r2 *rand.Rand) Feature {
	all := board.RingCells(ring, sched)
	// An arc: a contiguous run covering ~40–70% of the ring.
	arcLen := maxInt(1, len(all)*(4+r.Intn(4))/10)
	start := r.Intn(len(all))
	arc := make([]board.Cell, 0, arcLen)
	for i := 0; i < arcLen; i++ {
		arc = append(arc, all[(start+i)%len(all)])
	}
	kind := ResourceMetals
	if bandForRing(ring, params) == BandOuter {
		kind = ResourceWater
	}
	orb := orbitFor(ring, dir, r, sched)
	f := Feature{
		Id: id, Type: FeatureBelt, Orbit: &orb, Footprint: arc,
		// The float64() conversion is load-bearing: it forces the
		// intermediate rounding that inhibits FMA contraction on arm64.
		// Assigning the product to a local does NOT — gc fuses across
		// statements. Do not "simplify" this (openspec
		// pin-system-generation-determinism, design.md Decision 1).
		Resources: []Resource{{Kind: kind, Richness: 0.3 + float64(0.5*r.Float64()*dial.RichnessMult)}},
	}
	continuousStarParented(&f, ring, r2)
	// Width is the belt's full radial thickness, persisted at generation
	// time rather than re-derived on read (design.md Decision 5): a later
	// retune of BeltWidthFraction must never retroactively move an
	// already-materialized belt's members.
	//
	// NIL-GUARD serving TestGenerate_Scenario_LatticePlacementUnchangedWhetherContinuousDrawsPresentOrAbsent
	// (generate_streams_test.go): continuousStarParented leaves f.Space nil
	// when r2 == nil (continuous draws absent), and this line panics on nil
	// otherwise — the one non-obvious guard site, found by running it
	// (design.md Decision 2, point 2).
	if f.Space != nil {
		f.Width = float64(BeltWidthFraction * f.Space.Radius)
	}
	return f
}

func hazardFeature(id string, dir int, r *rand.Rand, params GenerationParams, sched polar.Schedule, r2 *rand.Rand) Feature {
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
	orb := orbitFor(ring, dir, r, sched)
	f := Feature{
		Id: id, Type: ft, Orbit: &orb,
		Footprint: []board.Cell{board.Canon(board.Cell{Ring: ring, Slot: orb.Angle0}, sched)},
		Effects:   &eff,
	}
	continuousStarParented(&f, ring, r2)
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

func clampRing(ring, radius int) int {
	if ring < 1 {
		return 1
	}
	if ring > radius {
		return radius
	}
	return ring
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
