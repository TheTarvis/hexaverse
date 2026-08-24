package market

// Provisioning is derived, not stored: a station's request set for an epoch is a
// pure function of (worldSeed, stationId, epoch, region), so a concurrent
// re-derivation produces an identical set and there is nothing to reconcile.

import (
	"testing"

	"hexaverse/stations"
)

func TestProvisionRequests_IsDeterministicPerStationEpoch(t *testing.T) {
	p := testParams()
	a := p.ProvisionRequests(42, "sys-1", "normal", 7, testNow)
	b := p.ProvisionRequests(42, "sys-1", "normal", 7, testNow)

	if len(a) != len(b) {
		t.Fatalf("re-derivation produced %d vs %d requests", len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Errorf("request %d differs on re-derivation: %+v vs %+v", i, a[i], b[i])
		}
	}
}

func TestProvisionRequests_DiffersAcrossStationsAndEpochs(t *testing.T) {
	p := testParams()
	base := p.ProvisionRequests(42, "sys-1", "normal", 7, testNow)
	otherStation := p.ProvisionRequests(42, "sys-2", "normal", 7, testNow)
	otherEpoch := p.ProvisionRequests(42, "sys-1", "normal", 8, testNow)

	if sameRequests(base, otherStation) {
		t.Error("two stations in the same epoch minted identical requests")
	}
	if sameRequests(base, otherEpoch) {
		t.Error("two epochs at the same station minted identical requests")
	}
}

func TestProvisionRequests_AlwaysPriceAboveTheRegionFloor(t *testing.T) {
	p := testParams()
	for epoch := int64(0); epoch < 50; epoch++ {
		for _, region := range []string{"star_rich", "normal", "dead", "barrier"} {
			for _, r := range p.ProvisionRequests(42, "sys-1", region, epoch, testNow) {
				floor, ok := p.FloorFor(region, r.Kind)
				if !ok {
					t.Fatalf("minted a request for %s, which is not tradable in %s", r.Kind, region)
				}
				if r.UnitPrice <= floor {
					t.Errorf("%s request in %s priced %d at or below the floor %d — a premium must be a premium",
						r.Kind, region, r.UnitPrice, floor)
				}
				if r.RemainingQuantity < p.QuantityBandLow || r.RemainingQuantity > p.QuantityBandHigh {
					t.Errorf("quantity %v outside the configured band [%v, %v]",
						r.RemainingQuantity, p.QuantityBandLow, p.QuantityBandHigh)
				}
				if r.ExpiresAt <= testNow {
					t.Errorf("request expires at %d, which is not after now (%d)", r.ExpiresAt, testNow)
				}
			}
		}
	}
}

func TestProvisionRequests_DropsKindsWithNoRegionalFloor(t *testing.T) {
	p := testParams()
	// The dead region has no research/exotic floor. Requesting kinds include only
	// the four common ones, so force the issue by asking for research directly.
	p.RequestKinds = []string{"research"}
	if got := p.ProvisionRequests(42, "sys-1", "dead", 1, testNow); len(got) != 0 {
		t.Errorf("minted %d research requests in a region with no research floor, want 0", len(got))
	}
}

func TestBudgetCheck_UnlimitedByDefaultNeverRejects(t *testing.T) {
	p := testParams()
	st := stationWith()
	// This version ships both ceilings unlimited, so the reject path is
	// unreachable in play — but it stays specified and tested, exactly the way
	// mine's holdFull clamp does.
	if err := p.BudgetCheck(st, "metals", 1<<40, 1e9); err != nil {
		t.Errorf("the shipped unlimited default rejected a sale: %v", err)
	}
}

func TestBudgetCheck_FiniteCeilingRejectsInFull(t *testing.T) {
	p := testParams()
	p.BudgetPerWindow = 1000
	st := stationWith()
	st.WindowSpend = map[string]int64{"metals": 900}

	// 200 more credits would breach the 1000 ceiling by 100. The whole sale is
	// refused — never clamped to the 100 that would fit, because there is no
	// third buyer behind an exhausted ceiling to partially fill into.
	err := p.BudgetCheck(st, "metals", 200, 10)
	if err == nil {
		t.Fatal("a breach of the credit budget was accepted")
	}
	if got := p.BudgetCheck(st, "metals", 100, 10); got != nil {
		t.Errorf("a sale that exactly fits the remaining budget was rejected: %v", got)
	}
}

func TestBudgetCheck_AbsorptionCeilingRejectsInFull(t *testing.T) {
	p := testParams()
	p.AbsorptionPerWindow = 100
	st := stationWith()
	st.WindowAbsorbed = map[string]float64{"metals": 95}

	if err := p.BudgetCheck(st, "metals", 0, 10); err == nil {
		t.Fatal("a breach of the absorption ceiling was accepted")
	}
	if err := p.BudgetCheck(st, "metals", 0, 5); err != nil {
		t.Errorf("a sale that exactly fits the remaining absorption was rejected: %v", err)
	}
}

func TestBudgetCheck_CeilingsArePerKind(t *testing.T) {
	p := testParams()
	p.BudgetPerWindow = 1000
	st := stationWith()
	st.WindowSpend = map[string]int64{"metals": 1000}

	if err := p.BudgetCheck(st, "water", 500, 10); err != nil {
		t.Errorf("an exhausted metals budget blocked a water sale: %v", err)
	}
}

func sameRequests(a, b []stations.Request) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		// Ids embed the epoch, so compare the economically meaningful fields.
		if a[i].Kind != b[i].Kind || a[i].UnitPrice != b[i].UnitPrice ||
			a[i].RemainingQuantity != b[i].RemainingQuantity {
			return false
		}
	}
	return true
}
