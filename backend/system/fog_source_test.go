package system

import "testing"

// TestIsAstronomical marks only the star and the major-body skeleton as the free
// telescope layer; detail features are earned.
func TestIsAstronomical(t *testing.T) {
	cases := map[string]bool{
		"feat-star":    true,
		"feat-body-0":  true,
		"feat-body-12": true,
		"feat-belt-0":  false,
		"feat-moon-1":  false,
		"feat-hazard-0": false,
		"feat-extra-3": false,
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
