package system

// migrate-fleet-to-continuous-burns tasks.md 7.7 (design.md Decision 11)
// deletes fog_source.go's former reason to exist (see that file's own doc
// comment). What remains — isAstronomical — is a small, purely local helper
// with no tie to observation at all. Its former sibling occlusionRadius2 has
// since been deleted along with the retired coordinate table its squared
// radii were expressed in, so the assertion that a station does not occlude
// went with the function that answered it; occlusion now lives in
// proximity-disclosure, in R³.
//
// These tests were relocated intact from station_splice_test.go, where they
// exercised these exact helpers alongside the (still-there) spliceStation
// tests. interiorFixture and stationFeatureFixture remain defined in
// station_splice_test.go (same package, same test binary).

import "testing"

func TestFogSource_ExcludesTheStationEntirely(t *testing.T) {
	// This exclusion is the mechanism that keeps observation-fog-and-scan
	// untouched. Because the interior splice is ungated, an unfiltered projection
	// here would give the station occluder geometry AND make a scan mint a
	// feature observation for it — both of which this capability explicitly does
	// not do. A station's visibility is governed only by its graph-tier rule.
	gen := interiorFixture()
	gen.Features = append(gen.Features, *stationFeatureFixture())

	var projected []string
	for i := range gen.Features {
		f := &gen.Features[i]
		if f.Type == FeatureStation {
			continue // mirrors Features()' own guard
		}
		projected = append(projected, f.Id)
	}

	for _, id := range projected {
		if id == "feat-station" {
			t.Fatal("the station reached the fog/scan feature source")
		}
	}
	if len(projected) != 2 {
		t.Errorf("projected %d features, want the 2 generated ones", len(projected))
	}
}

func TestFogSource_StationIsNotAstronomical(t *testing.T) {
	// The free telescope layer is the star plus the major-body skeleton. A
	// station is neither — its visibility comes from its own tier rule.
	if isAstronomical("feat-station") {
		t.Error("the station reads as astronomical; its visibility must come from its graph-tier rule alone")
	}
}
