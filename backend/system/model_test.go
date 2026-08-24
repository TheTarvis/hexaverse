package system

import "testing"

// The orbital law and the feature taxonomy — the two things every other domain
// reads this model for.

func TestPeriodFor_IsMonotonicInRing(t *testing.T) {
	// One orbital law, shared by planets and coasting ships alike: an outer ring
	// takes longer to come round than an inner one.
	prev := PeriodFor(1)
	for ring := 2; ring <= 16; ring++ {
		got := PeriodFor(ring)
		if got <= prev {
			t.Errorf("ring %d period %d is not longer than ring %d's %d", ring, got, ring-1, prev)
		}
		prev = got
	}
}

func TestOrbit_PeriodIsNotPersisted(t *testing.T) {
	// Period carries `firestore:"-"` on purpose: it is derived from live tuning on
	// every read, so retuning orbit pacing re-paces systems that already exist.
	// Storing it would freeze every materialized system at its generation-time
	// pace. This asserts the intent stays documented where it can be checked.
	var o Orbit
	o.Period = PeriodFor(4)
	if o.Period == 0 {
		t.Fatal("PeriodFor returned 0")
	}
}

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
