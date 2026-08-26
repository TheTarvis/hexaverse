package system

import (
	"context"
	"testing"

	"hexaverse/board"

	"go.uber.org/mock/gomock"
)

// TestIsAstronomical marks only the star and the major-body skeleton as the free
// telescope layer; detail features are earned.
func TestIsAstronomical(t *testing.T) {
	cases := map[string]bool{
		"feat-star":     true,
		"feat-body-0":   true,
		"feat-body-12":  true,
		"feat-belt-0":   false,
		"feat-moon-1":   false,
		"feat-hazard-0": false,
		"feat-extra-3":  false,
	}
	for id, want := range cases {
		if got := isAstronomical(id); got != want {
			t.Errorf("isAstronomical(%q) = %v, want %v", id, got, want)
		}
	}
}

// TestFeatureDetail_MapsComposition maps a feature's resources/hazard into the
// scan-report shape the fog domain stores.
func TestFeatureDetail_MapsComposition(t *testing.T) {
	d := featureDetail(&Feature{
		Type:      FeatureRocky,
		Resources: []Resource{{Kind: ResourceMetals, Richness: 0.6}},
		Effects:   &Effects{Block: true},
	})
	if d.FeatureType != "rocky" {
		t.Errorf("featureType = %q, want rocky", d.FeatureType)
	}
	if len(d.Resources) != 1 || d.Resources[0].Kind != "metals" || d.Resources[0].Richness != 0.6 {
		t.Errorf("resources not mapped: %+v", d.Resources)
	}
	if d.Threat == "" {
		t.Errorf("a blocking hazard should surface a threat")
	}
}

// design.md Decision 1: occludes(FeatureType) bool becomes
// occlusionRadius2(FeatureType) int64 — StarOcclusionRadius2 for the star,
// PlanetOcclusionRadius2 for rocky/gas-giant/ice bodies, 0 (does not occlude)
// for everything else, INCLUDING the station (never generated, never in this
// table at all — it is excluded from the fog source entirely, see below).
func TestOcclusionRadius2_StarWidestPlanetsNarrowerEverythingElseZero(t *testing.T) {
	if got := occlusionRadius2(FeatureStar); got != board.StarOcclusionRadius2 {
		t.Errorf("occlusionRadius2(star) = %d, want board.StarOcclusionRadius2 (%d)", got, board.StarOcclusionRadius2)
	}
	for _, ft := range []FeatureType{FeatureRocky, FeatureGasGiant, FeatureIce} {
		if got := occlusionRadius2(ft); got != board.PlanetOcclusionRadius2 {
			t.Errorf("occlusionRadius2(%s) = %d, want board.PlanetOcclusionRadius2 (%d)", ft, got, board.PlanetOcclusionRadius2)
		}
	}
	if board.PlanetOcclusionRadius2 >= board.StarOcclusionRadius2 {
		t.Fatalf("fixture invariant broken: planet radius² (%d) must be strictly less than the star's (%d)",
			board.PlanetOcclusionRadius2, board.StarOcclusionRadius2)
	}
	for _, ft := range []FeatureType{FeatureBelt, FeatureMoon, FeatureAnomaly, FeatureRuin,
		FeatureNebula, FeatureGravityWell, FeatureDebris, FeatureRadiation, FeatureStation} {
		if got := occlusionRadius2(ft); got != 0 {
			t.Errorf("occlusionRadius2(%s) = %d, want 0 (does not occlude)", ft, got)
		}
	}
}

// design.md Decision 1 / tasks.md 2.5: "Add a regression test asserting a
// spliced station contributes no occluder" — this is now load-bearing a
// SECOND way (a station at ring 1-15 with a half-unit shadow would be a
// visible gameplay change). Exercises the REAL Service.Features path (the
// observation.InteriorSource implementation), not a hand-mimicked filter, so
// it fails if the splice/exclusion wiring ever regresses.
func TestFeatures_SplicedStationContributesNoOccluder(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	dao.EXPECT().GetInterior(gomock.Any(), "gal_1", "sys-station").
		Return(&SystemInterior{SystemId: "sys-station", Radius: 16}, nil)
	dao.EXPECT().ListFeatures(gomock.Any(), "gal_1", "sys-station").
		Return([]Feature{
			{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		}, nil)

	svc := NewServiceWith(dao, testGalaxy(), testClock()).
		WithStations(&fakeStationSource{feat: stationFeatureFixture()})

	geoms, err := svc.Features(context.Background(), "sys-station")
	if err != nil {
		t.Fatalf("Features: %v", err)
	}
	for _, g := range geoms {
		if g.Id == "feat-station" {
			t.Fatalf("the station reached the fog/scan feature source: %+v", g)
		}
	}
	// Only the star should be present (the fixture's one generated feature);
	// the station must not silently appear as a second occluder-eligible entry.
	if len(geoms) != 1 {
		t.Fatalf("Features returned %d geometries, want 1 (the station must contribute none)", len(geoms))
	}
}
