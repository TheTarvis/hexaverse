package system

import (
	"reflect"
	"testing"

	"hexaverse/board"
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

func TestGenerate_StarAtCentreFixed(t *testing.T) {
	g := Generate(1, "normal", sampleSkeleton(), DefaultParams())
	star := g.Features[0]
	if star.Type != FeatureStar || !star.Fixed {
		t.Fatalf("expected fixed star first, got %+v", star)
	}
	if len(star.Footprint) != 1 || star.Footprint[0] != (board.Cell{Ring: 0, Slot: 0}) {
		t.Fatalf("star not at centre: %+v", star.Footprint)
	}
}

func TestGenerate_SkeletonBodiesPresent(t *testing.T) {
	sk := sampleSkeleton()
	g := Generate(7, "normal", sk, DefaultParams())
	// Each skeleton body must appear as an orbit feature at its (clamped) ring.
	bodyFeatures := 0
	for _, f := range g.Features {
		if len(f.Id) >= 9 && f.Id[:9] == "feat-body" {
			bodyFeatures++
			if f.Orbit == nil {
				t.Fatalf("skeleton body %s has no orbit", f.Id)
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
		if f.Orbit == nil && f.ParentId == "" && !f.Fixed {
			t.Fatalf("feature %s (%s) has no position (orbit/parent/fixed)", f.Id, f.Type)
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
			if len(f.Footprint) < 2 {
				t.Fatalf("belt %s should be a multi-cell arc, got %d cells", f.Id, len(f.Footprint))
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
		if f.Type == FeatureMoon && !giantIDs[f.ParentId] {
			t.Fatalf("moon %s rides non-giant parent %q", f.Id, f.ParentId)
		}
	}
}

func TestGenerate_DiskBornFeaturesShareDominantDirection(t *testing.T) {
	// Skeleton majors, belts, and hazards are disk-born: within any one system
	// they all orbit in the system's dominant direction, whatever the
	// capture-plausible detail does.
	for seed := int64(0); seed < 40; seed++ {
		g := Generate(seed, "star_rich", sampleSkeleton(), DefaultParams())
		dirs := map[int]bool{}
		for _, f := range g.Features {
			if f.Orbit == nil {
				continue
			}
			switch f.Type {
			case FeatureRocky, FeatureGasGiant, FeatureIce:
				if len(f.Id) >= 9 && f.Id[:9] == "feat-body" {
					dirs[f.Orbit.Dir] = true
				}
			case FeatureBelt, FeatureGravityWell, FeatureRadiation, FeatureNebula, FeatureDebris:
				dirs[f.Orbit.Dir] = true
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
	seen := map[int]bool{}
	for seed := int64(0); seed < 40; seed++ {
		g := Generate(seed, "normal", sampleSkeleton(), DefaultParams())
		for _, f := range g.Features {
			if f.Orbit != nil && len(f.Id) >= 9 && f.Id[:9] == "feat-body" {
				seen[f.Orbit.Dir] = true
				break
			}
		}
	}
	if !seen[1] || !seen[-1] {
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
		dirs := map[int]bool{}
		for _, f := range g.Features {
			if f.Orbit != nil {
				dirs[f.Orbit.Dir] = true
			}
		}
		if len(dirs) != 1 {
			t.Fatalf("seed %d: RetrogradeChance=0 still produced mixed directions %v", seed, dirs)
		}

		always := DefaultParams()
		always.RetrogradeChance = 1
		g = Generate(seed, "star_rich", sampleSkeleton(), always)
		var sysDir int
		for _, f := range g.Features {
			if f.Orbit != nil && len(f.Id) >= 9 && f.Id[:9] == "feat-body" {
				sysDir = f.Orbit.Dir
				break
			}
		}
		for _, f := range g.Features {
			if f.Orbit == nil {
				continue
			}
			switch f.Type {
			case FeatureAnomaly, FeatureRuin:
				if f.Orbit.Dir != -sysDir {
					t.Fatalf("seed %d: %s should be retrograde at chance 1, got dir %d (sysDir %d)", seed, f.Id, f.Orbit.Dir, sysDir)
				}
			}
			if len(f.Id) >= 10 && f.Id[:10] == "feat-extra" && f.Orbit.Dir != -sysDir {
				t.Fatalf("seed %d: %s should be retrograde at chance 1, got dir %d (sysDir %d)", seed, f.Id, f.Orbit.Dir, sysDir)
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
			if f.Orbit == nil || len(f.Resources) == 0 {
				continue
			}
			band := bandForRing(f.Orbit.Ring, params)
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
