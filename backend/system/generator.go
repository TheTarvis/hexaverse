package system

import (
	"fmt"
	"math/rand"

	"hexaverse/galaxy"
)

func newRand(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

// Generate is the pure interior generator: a deterministic function of the
// per-system seed, the graph-tier region (the character dial), and the eager
// skeleton rolled in #0001. It extends that skeleton with the paid detail —
// small bodies, belts, moons, anomalies/ruins, hazards — never contradicting it
// (same seed derivation, skeleton bodies present in the interior).
func Generate(seed int64, region string, skeleton galaxy.Skeleton, params GenerationParams) GeneratedInterior {
	r := newRand(seed)
	dial := params.dialFor(region)

	features := make([]Feature, 0, 16)

	// Star at the centre — fixed, no orbit.
	features = append(features, Feature{
		Id: "feat-star", Type: FeatureStar, Name: "Star (" + skeleton.StarClass + ")",
		Fixed: true, Footprint: []Hex{{Q: 0, R: 0}},
	})

	// Skeleton major bodies → orbit features at their rings (extends #0001).
	var giantIDs []string
	for i, b := range skeleton.Bodies {
		ring := clampRing(b.Ring, params.Radius)
		ft := featureTypeForBody(b.Type)
		id := fmt.Sprintf("feat-body-%d", i)
		f := orbitFeature(id, ft, ring, r)
		f.Resources = resourcesFor(bandForRing(ring, params), ft, dial.RichnessMult, r)
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
		f := orbitFeature(id, ft, ring, r)
		f.Resources = resourcesFor(bandForRing(ring, params), ft, dial.RichnessMult, r)
		features = append(features, f)
	}

	// Belts as ring arcs (metals inner, ice outer).
	for i := 0; i < dial.Belts; i++ {
		ring := 2 + r.Intn(params.Radius-2)
		features = append(features, beltFeature(fmt.Sprintf("feat-belt-%d", i), ring, r, params, dial))
	}

	// Moons riding gas giants.
	for i, gid := range giantIDs {
		features = append(features, Feature{
			Id: fmt.Sprintf("feat-moon-%d", i), Type: FeatureMoon, ParentId: gid,
			Footprint: []Hex{{Q: 0, R: 0}}, // computed relative to parent at render time
			Resources: resourcesFor(BandOuter, FeatureMoon, dial.RichnessMult, r),
		})
	}

	// Mid-band anomalies / ruins.
	for i := 0; i < dial.Specials; i++ {
		ring := params.InnerMaxRing + 1 + r.Intn(maxInt(1, params.MidMaxRing-params.InnerMaxRing))
		ring = clampRing(ring, params.Radius)
		ft := FeatureAnomaly
		if r.Float64() < 0.5 {
			ft = FeatureRuin
		}
		f := orbitFeature(fmt.Sprintf("feat-special-%d", i), ft, ring, r)
		if ft == FeatureAnomaly {
			f.Resources = []Resource{{Kind: ResourceExotic, Richness: 0.4 + 0.6*r.Float64()*dial.RichnessMult}}
		} else {
			f.Resources = []Resource{{Kind: ResourceResearch, Richness: 0.3 + 0.5*r.Float64()*dial.RichnessMult}}
		}
		features = append(features, f)
	}

	// Hazards (features with effects payloads).
	for i := 0; i < dial.Hazards; i++ {
		features = append(features, hazardFeature(fmt.Sprintf("feat-hazard-%d", i), r, params))
	}

	return GeneratedInterior{
		Interior: SystemInterior{
			Seed:      seed,
			Radius:    params.Radius,
			Character: region,
			StarClass: skeleton.StarClass,
			Version:   1,
		},
		Features: features,
	}
}

// --- Feature builders ------------------------------------------------------

func orbitFeature(id string, ft FeatureType, ring int, r *rand.Rand) Feature {
	orb := orbitFor(ring, r)
	return Feature{
		Id: id, Type: ft, Orbit: &orb,
		Footprint: []Hex{hexAtRingAngle(ring, orb.Angle0)},
	}
}

// orbitFor rolls a body's orbit. Ring/Angle0/Dir are the generator's dice and are
// persisted; Period is filled from live tuning here only so an in-memory interior
// (the just-generated one) matches a re-read one — see PeriodFor.
func orbitFor(ring int, r *rand.Rand) Orbit {
	dir := 1
	if r.Intn(2) == 0 {
		dir = -1
	}
	return Orbit{
		Ring:   ring,
		Angle0: r.Intn(maxInt(1, 6*ring)),
		Period: PeriodFor(ring),
		Dir:    dir,
	}
}

func beltFeature(id string, ring int, r *rand.Rand, params GenerationParams, dial CharacterDial) Feature {
	all := ringHexes(ring)
	// An arc: a contiguous run covering ~40–70% of the ring.
	arcLen := maxInt(1, len(all)*(4+r.Intn(4))/10)
	start := r.Intn(len(all))
	arc := make([]Hex, 0, arcLen)
	for i := 0; i < arcLen; i++ {
		arc = append(arc, all[(start+i)%len(all)])
	}
	kind := ResourceMetals
	if bandForRing(ring, params) == BandOuter {
		kind = ResourceWater
	}
	orb := orbitFor(ring, r)
	return Feature{
		Id: id, Type: FeatureBelt, Orbit: &orb, Footprint: arc,
		Resources: []Resource{{Kind: kind, Richness: 0.3 + 0.5*r.Float64()*dial.RichnessMult}},
	}
}

func hazardFeature(id string, r *rand.Rand, params GenerationParams) Feature {
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
	orb := orbitFor(ring, r)
	return Feature{
		Id: id, Type: ft, Orbit: &orb,
		Footprint: []Hex{hexAtRingAngle(ring, orb.Angle0)},
		Effects:   &eff,
	}
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
	v := (lo + (hi-lo)*r.Float64()) * mult
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
