package market

import "testing"

// The knobs live here rather than in common.GameTuning because pricing
// explicitly never responds to anything happening in a running world — which by
// definition makes it not a mid-session knob an operator would hot-retune.

func TestDefaultParams_ShipsCoherentBands(t *testing.T) {
	p := DefaultParams()

	if p.StartingCredits <= 0 {
		t.Errorf("StartingCredits = %d, want a positive opening grant", p.StartingCredits)
	}
	if p.PremiumBandLow <= 1.0 {
		t.Errorf("PremiumBandLow = %v, want > 1.0 — a premium below the floor is not a premium", p.PremiumBandLow)
	}
	if p.PremiumBandHigh < p.PremiumBandLow {
		t.Errorf("premium band is inverted: [%v, %v]", p.PremiumBandLow, p.PremiumBandHigh)
	}
	if p.QuantityBandHigh < p.QuantityBandLow || p.QuantityBandLow <= 0 {
		t.Errorf("quantity band is invalid: [%v, %v]", p.QuantityBandLow, p.QuantityBandHigh)
	}
	if p.RequestLifetime <= 0 || p.EpochWidth <= 0 {
		t.Errorf("lifetime (%d) and epoch width (%d) must both be positive", p.RequestLifetime, p.EpochWidth)
	}
	// Without a regeneration floor, demand refreshes instantly and the
	// "haul it before it's gone" tension the whole mechanic depends on evaporates.
	if p.RegenerationCadence <= 0 {
		t.Error("RegenerationCadence must be positive")
	}
	if p.BoardRefreshCadence <= 0 {
		t.Error("BoardRefreshCadence must be positive — freshness is a stated contract")
	}
}

func TestDefaultParams_CeilingsShipUnlimited(t *testing.T) {
	p := DefaultParams()
	// Unlimited this version: a pure faucet with no buy side has nothing to
	// balance against yet. Zero is the documented "unlimited" sentinel, and the
	// reject path stays tested via a fixtured finite value.
	if p.BudgetPerWindow != 0 || p.AbsorptionPerWindow != 0 {
		t.Errorf("ceilings = (%d, %v), want unlimited (0, 0) this version",
			p.BudgetPerWindow, p.AbsorptionPerWindow)
	}
}

func TestDefaultParams_EveryRequestKindIsTradableSomewhere(t *testing.T) {
	p := DefaultParams()
	for _, kind := range p.RequestKinds {
		found := false
		for region := range p.Floors {
			if _, ok := p.FloorFor(region, kind); ok {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("%q can be requested but has no floor in any region, so it could never settle", kind)
		}
	}
}

func TestDefaultParams_TradableKindsAllHaveAFloorSomewhere(t *testing.T) {
	p := DefaultParams()
	for _, kind := range p.TradableKinds {
		found := false
		for region := range p.Floors {
			if _, ok := p.FloorFor(region, kind); ok {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("%q is listed tradable but priced nowhere", kind)
		}
	}
}

func TestFloorsAreStringKeyed(t *testing.T) {
	// Both levels must be keyed by the STRING form, never a named string type:
	// fleet.Cargo's doc comment records a Firestore SDK reflection panic on
	// exactly that shape, and these tables would repeat it.
	p := DefaultParams()
	var _ map[string]map[string]int64 = p.Floors
	if len(p.Floors) == 0 {
		t.Fatal("no floors configured")
	}
}
