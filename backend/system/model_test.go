package system

import "testing"

// The feature taxonomy and the band partition — what every other domain reads
// this model for.
//
// Two tests were DELETED from here. They pinned a single global orbital law
// — one revolution priced as a base constant times a discrete index, read
// live from tuning on every read and deliberately never persisted — and both
// go with that law. A body's period is now a Keplerian function of its own
// continuous radius, drawn at generation time and persisted with the rest of
// its element set. The monotonicity property survives in a truer form
// (continuous_test.go's Kepler-law tests assert period grows with radius),
// and there is no unpersisted field left for the second test to be about
// (authorized deletion; cause = the requirement they pinned was removed).

func TestFeatureStation_IsItsOwnType(t *testing.T) {
	// The station is the one feature family that is neither generated nor stored
	// in the features subcollection — it is spliced in from its own store, and
	// excluded from the fog/scan source entirely.
	if FeatureStation == "" {
		t.Fatal("FeatureStation is empty")
	}
	for _, generated := range []FeatureType{
		FeatureStar, FeatureRocky, FeatureGasGiant, FeatureIce, FeatureBelt,
		FeatureMoon, FeatureAnomaly, FeatureRuin, FeatureNebula,
		FeatureGravityWell, FeatureDebris, FeatureRadiation,
	} {
		if FeatureStation == generated {
			t.Errorf("FeatureStation collides with the generated type %q", generated)
		}
	}
}

func TestFeature_OwnerCorpIdIsDtoOnly(t *testing.T) {
	// Populated solely on the spliced station feature. Nothing in this package
	// writes it, and it is never persisted (`firestore:"-"`), so generated
	// features always read empty.
	f := Feature{Id: "feat-body-0", Type: FeatureRocky}
	if f.OwnerCorpId != "" {
		t.Errorf("a generated feature carries an owner: %q", f.OwnerCorpId)
	}
}

func TestBandForRing_PartitionsTheBoard(t *testing.T) {
	p := DefaultParams()
	if bandForRing(0, p) != BandCore {
		t.Error("ring 0 is not the core")
	}
	if bandForRing(p.InnerMaxRing, p) != BandInner {
		t.Error("the inner boundary ring is not inner")
	}
	if bandForRing(p.InnerMaxRing+1, p) != BandMid {
		t.Error("one past the inner boundary is not mid")
	}
	if bandForRing(p.MidMaxRing+1, p) != BandOuter {
		t.Error("one past the mid boundary is not outer")
	}
}
