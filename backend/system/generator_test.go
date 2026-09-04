package system

import (
	"reflect"
	"testing"

	"hexaverse/galaxy"
)

func sampleSkeleton() galaxy.Skeleton {
	return galaxy.Skeleton{
		StarClass: "G",
		Bodies: []galaxy.Body{
			{Type: galaxy.BodyRocky, Ring: 2},
			{Type: galaxy.BodyRocky, Ring: 4},
			{Type: galaxy.BodyGasGiant, Ring: 8},
			{Type: galaxy.BodyIce, Ring: 11},
		},
	}
}

func TestGenerate_Deterministic(t *testing.T) {
	a := Generate(1234, "star_rich", sampleSkeleton(), DefaultParams())
	b := Generate(1234, "star_rich", sampleSkeleton(), DefaultParams())
	if !reflect.DeepEqual(a, b) {
		t.Fatal("same seed produced a different interior")
	}
}

func TestGenerate_StarIsTheParentlessBodyGeneratedFirst(t *testing.T) {
	g := Generate(1, "normal", sampleSkeleton(), DefaultParams())
	star := g.Features[0]
	if star.Type != FeatureStar {
		t.Fatalf("expected the star first, got %+v", star)
	}
	// The star is the ONE parentless body: it carries no orbital element set
	// at all, which is what "at the centre" means once position is continuous.
	if star.Space != nil {
		t.Fatalf("the star carries an orbital element set (%+v); it is the frame every other body orbits in", star.Space)
	}
	if star.Size <= 0 {
		t.Fatalf("star size = %v, want a positive radius from its class", star.Size)
	}
}

func TestGenerate_SkeletonBodiesPresent(t *testing.T) {
	sk := sampleSkeleton()
	g := Generate(7, "normal", sk, DefaultParams())
	// Each skeleton body must appear as a star-parented feature.
	bodyFeatures := 0
	for _, f := range g.Features {
		if len(f.Id) >= 9 && f.Id[:9] == "feat-body" {
			bodyFeatures++
			if f.Space == nil {
				t.Fatalf("skeleton body %s has no orbital element set", f.Id)
			}
			if f.Space.ParentId != "feat-star" {
				t.Fatalf("skeleton body %s orbits %q, want the star", f.Id, f.Space.ParentId)
			}
		}
	}
	if bodyFeatures != len(sk.Bodies) {
		t.Fatalf("expected %d skeleton body features, got %d", len(sk.Bodies), bodyFeatures)
	}
}

func TestGenerate_EveryNonStarFeatureHasPosition(t *testing.T) {
	g := Generate(3, "star_rich", sampleSkeleton(), DefaultParams())
	for _, f := range g.Features {
		if f.Type == FeatureStar {
			continue
		}
		if f.Space == nil {
			t.Fatalf("feature %s (%s) has no position (no orbital element set)", f.Id, f.Type)
		}
		if f.Space.ParentId == "" {
			t.Fatalf("feature %s (%s) names no parent; only the star is parentless", f.Id, f.Type)
		}
	}
}

func TestGenerate_HasBeltAndMoonRidesGiant(t *testing.T) {
	g := Generate(9, "star_rich", sampleSkeleton(), DefaultParams())

	var belts, moons int
	giantIDs := map[string]bool{}
	for _, f := range g.Features {
		switch f.Type {
		case FeatureBelt:
			belts++
			// A belt is an EXTENDED object, not a point body: its radial
			// thickness is what makes it one. (This is the continuous
			// successor of the old multi-cell-arc assertion.)
			if !(f.Width > 0) {
				t.Fatalf("belt %s has width %v, want a positive radial thickness", f.Id, f.Width)
			}
		case FeatureGasGiant:
			giantIDs[f.Id] = true
		case FeatureMoon:
			moons++
		}
	}
	if belts < 1 {
		t.Fatal("expected at least one belt")
	}
	if moons < 1 {
		t.Fatal("expected at least one moon (skeleton has a gas giant)")
	}
	for _, f := range g.Features {
		if f.Type == FeatureMoon && (f.Space == nil || !giantIDs[f.Space.ParentId]) {
			t.Fatalf("moon %s rides non-giant parent %+v", f.Id, f.Space)
		}
	}
}

func TestGenerate_DiskBornFeaturesShareDominantDirection(t *testing.T) {
	// Skeleton majors, belts, and hazards are disk-born: within any one system
	// they all orbit in the system's dominant direction, whatever the
	// capture-plausible detail does.
	for seed := int64(0); seed < 40; seed++ {
		g := Generate(seed, "star_rich", sampleSkeleton(), DefaultParams())
		dirs := map[bool]bool{}
		for _, f := range g.Features {
			if f.Space == nil || f.Space.ParentId != "feat-star" {
				continue
			}
			switch f.Type {
			case FeatureRocky, FeatureGasGiant, FeatureIce:
				if len(f.Id) >= 9 && f.Id[:9] == "feat-body" {
					dirs[isRetrogradeInclination(f.Space.Inclination)] = true
				}
			case FeatureBelt, FeatureGravityWell, FeatureRadiation, FeatureNebula, FeatureDebris:
				dirs[isRetrogradeInclination(f.Space.Inclination)] = true
			}
		}
		if len(dirs) != 1 {
			t.Fatalf("seed %d: disk-born features split across directions %v", seed, dirs)
		}
	}
}

func TestGenerate_DominantDirectionVariesAcrossSystems(t *testing.T) {
	// Half the galaxy's disks spin each way (viewed top-down): across a seed
	// sweep both dominant directions must occur.
	seen := map[bool]bool{}
	for seed := int64(0); seed < 40; seed++ {
		g := Generate(seed, "normal", sampleSkeleton(), DefaultParams())
		for _, f := range g.Features {
			if f.Space != nil && len(f.Id) >= 9 && f.Id[:9] == "feat-body" {
				seen[isRetrogradeInclination(f.Space.Inclination)] = true
				break
			}
		}
	}
	if !seen[true] || !seen[false] {
		t.Fatalf("dominant direction never varied across 40 seeds: %v", seen)
	}
}

func TestGenerate_RetrogradeChanceKnob(t *testing.T) {
	// The knob at 0 makes every orbit prograde; at 1 every capture-plausible
	// detail feature (extra body, anomaly, ruin) runs against the dominant
	// direction while disk-born features stay prograde.
	for seed := int64(0); seed < 10; seed++ {
		zero := DefaultParams()
		zero.RetrogradeChance = 0
		g := Generate(seed, "star_rich", sampleSkeleton(), zero)
		dirs := map[bool]bool{}
		for _, f := range g.Features {
			if f.Space != nil && f.Space.ParentId == "feat-star" {
				dirs[isRetrogradeInclination(f.Space.Inclination)] = true
			}
		}
		if len(dirs) != 1 {
			t.Fatalf("seed %d: RetrogradeChance=0 still produced mixed directions %v", seed, dirs)
		}

		always := DefaultParams()
		always.RetrogradeChance = 1
		g = Generate(seed, "star_rich", sampleSkeleton(), always)
		// The disk's own side, read off a disk-born skeleton major.
		var diskRetrograde bool
		for _, f := range g.Features {
			if f.Space != nil && len(f.Id) >= 9 && f.Id[:9] == "feat-body" {
				diskRetrograde = isRetrogradeInclination(f.Space.Inclination)
				break
			}
		}
		for _, f := range g.Features {
			if f.Space == nil || f.Space.ParentId != "feat-star" {
				continue
			}
			against := isRetrogradeInclination(f.Space.Inclination) != diskRetrograde
			switch f.Type {
			case FeatureAnomaly, FeatureRuin:
				if !against {
					t.Fatalf("seed %d: %s should run against the disk at chance 1, got inclination %d (disk retrograde=%v)", seed, f.Id, f.Space.Inclination, diskRetrograde)
				}
			}
			if len(f.Id) >= 10 && f.Id[:10] == "feat-extra" && !against {
				t.Fatalf("seed %d: %s should run against the disk at chance 1, got inclination %d (disk retrograde=%v)", seed, f.Id, f.Space.Inclination, diskRetrograde)
			}
		}
	}
}

func TestGenerate_CharacterDial_RichVsDead(t *testing.T) {
	sk := sampleSkeleton()
	rich := Generate(5, "star_rich", sk, DefaultParams())
	dead := Generate(5, "dead", sk, DefaultParams())

	if len(rich.Features) <= len(dead.Features) {
		t.Fatalf("star_rich (%d features) should be denser than dead (%d)",
			len(rich.Features), len(dead.Features))
	}

	// And richer: average resource richness higher in star_rich.
	if avgRichness(rich) <= avgRichness(dead) {
		t.Fatalf("star_rich richness %.3f should exceed dead %.3f",
			avgRichness(rich), avgRichness(dead))
	}
}

func TestGenerate_BandRadialGradient(t *testing.T) {
	// Inner bodies skew metals; outer skew volatiles/water. Check the tendency
	// across many systems rather than a single roll.
	params := DefaultParams()
	innerMetals, outerIceGas := 0, 0
	for seed := int64(0); seed < 40; seed++ {
		g := Generate(seed, "star_rich", sampleSkeleton(), params)
		for _, f := range g.Features {
			// Star-parented bodies only: a moon's radius is measured against
			// its parent, not the star, so it names no radial band.
			if f.Space == nil || f.Space.ParentId != "feat-star" || len(f.Resources) == 0 {
				continue
			}
			band := bandForRadius(f.Space.Radius, params)
			for _, res := range f.Resources {
				if band == BandInner && res.Kind == ResourceMetals {
					innerMetals++
				}
				if band == BandOuter && (res.Kind == ResourceVolatiles || res.Kind == ResourceWater) {
					outerIceGas++
				}
			}
		}
	}
	if innerMetals == 0 || outerIceGas == 0 {
		t.Fatalf("radial gradient absent: innerMetals=%d outerIceGas=%d", innerMetals, outerIceGas)
	}
}

func avgRichness(g GeneratedInterior) float64 {
	sum, n := 0.0, 0
	for _, f := range g.Features {
		for _, r := range f.Resources {
			sum += r.Richness
			n++
		}
	}
	if n == 0 {
		return 0
	}
	return sum / float64(n)
}

// bandForRadius is bandForRing's continuous reading, for a STAR-parented
// body: ContinuousRadius is strictly increasing in the orbital index, so the
// band boundaries the generator drew against (InnerMaxRing, MidMaxRing) map
// to radius thresholds without needing the index itself, which is no longer
// stored on anything.
func bandForRadius(radius float64, p GenerationParams) Band {
	switch {
	case radius <= ContinuousRadius(p.InnerMaxRing):
		return BandInner
	case radius <= ContinuousRadius(p.MidMaxRing):
		return BandMid
	default:
		return BandOuter
	}
}
