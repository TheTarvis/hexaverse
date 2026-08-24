package market

import (
	"testing"

	"hexaverse/common"
	"hexaverse/stations"
)

const testNow = common.WorldMillis(1_000_000)

func testParams() Params {
	p := DefaultParams()
	p.EpochWidth = 3_600_000
	return p
}

func stationWith(reqs ...stations.Request) *stations.Station {
	return &stations.Station{SystemId: "sys-1", FeatureId: "feat-station", Requests: reqs}
}

func liveRequest(id, kind string, price int64, qty float64) stations.Request {
	return stations.Request{
		Id: id, Kind: kind, UnitPrice: price,
		RemainingQuantity: qty, ExpiresAt: testNow + 1_000_000,
	}
}

// --- floors ------------------------------------------------------------------

func TestFloorFor_MissingEntryIsNotTradableNotZero(t *testing.T) {
	p := testParams()

	// A configured pair prices normally.
	if price, ok := p.FloorFor("normal", "metals"); !ok || price <= 0 {
		t.Errorf("FloorFor(normal, metals) = (%d, %v), want a positive price", price, ok)
	}
	// The dead region has no research entry at all. That must report NOT TRADABLE
	// — never a price of zero, which would pass every numeric validation while
	// being economically nonsense, and never an interpolated value, which would
	// itself be the pricing engine this version rules out.
	price, ok := p.FloorFor("dead", "research")
	if ok {
		t.Errorf("FloorFor(dead, research) reported tradable at %d; the table has no such entry", price)
	}
	if price != 0 {
		t.Errorf("an untradable pair returned price %d; callers must read the bool, not the number", price)
	}
	// An unknown region likewise.
	if _, ok := p.FloorFor("no-such-region", "metals"); ok {
		t.Error("an unknown region reported a tradable floor")
	}
}

func TestDemandFor_UntradableKindReportsNotTradable(t *testing.T) {
	p := testParams()
	entries, tradable := p.DemandFor(stationWith(), "dead", "research", testNow)
	if tradable {
		t.Error("an untradable kind reported tradable")
	}
	if len(entries) != 0 {
		t.Errorf("an untradable kind produced %d demand entries, want none", len(entries))
	}
}

// --- the uniform demand list -------------------------------------------------

func TestDemandFor_FloorIsTheEntryOfLastResort(t *testing.T) {
	p := testParams()
	floor, _ := p.FloorFor("normal", "metals")

	entries, tradable := p.DemandFor(
		stationWith(liveRequest("r1", "metals", floor+40, 30)), "normal", "metals", testNow)
	if !tradable {
		t.Fatal("metals should be tradable in a normal region")
	}
	if len(entries) != 2 {
		t.Fatalf("got %d entries, want the request plus the floor", len(entries))
	}
	// Price-descending, with the floor last and unlimited.
	if entries[0].Source != SourceRequest {
		t.Errorf("first entry source = %q, want the premium request", entries[0].Source)
	}
	last := entries[len(entries)-1]
	if last.Source != SourceFloor {
		t.Errorf("last entry source = %q, want the floor", last.Source)
	}
	if !last.Unlimited {
		t.Error("the floor entry is not unlimited; it is the entry of last resort and never runs out")
	}
	if last.UnitPrice != floor {
		t.Errorf("floor entry price = %d, want %d", last.UnitPrice, floor)
	}
}

func TestDemandFor_OrdersPriceDescending(t *testing.T) {
	p := testParams()
	entries, _ := p.DemandFor(stationWith(
		liveRequest("low", "metals", 120, 10),
		liveRequest("high", "metals", 160, 10),
		liveRequest("mid", "metals", 140, 10),
	), "normal", "metals", testNow)

	for i := 1; i < len(entries); i++ {
		if entries[i-1].UnitPrice < entries[i].UnitPrice {
			t.Fatalf("entries are not price-descending: %+v", entries)
		}
	}
	if entries[0].RequestId != "high" {
		t.Errorf("first entry = %q, want the highest-priced request", entries[0].RequestId)
	}
}

func TestDemandFor_ExhaustedAndExpiredRequestsStopQuoting(t *testing.T) {
	p := testParams()

	exhausted := liveRequest("drained", "metals", 200, 0)
	expired := stations.Request{
		Id: "lapsed", Kind: "metals", UnitPrice: 200,
		RemainingQuantity: 50, ExpiresAt: testNow - 1, // already past its lifetime
	}
	entries, _ := p.DemandFor(stationWith(exhausted, expired), "normal", "metals", testNow)

	for _, e := range entries {
		if e.Source == SourceRequest {
			t.Errorf("a %s request is still quoting: %+v", e.RequestId, e)
		}
	}
	if len(entries) != 1 || entries[0].Source != SourceFloor {
		t.Errorf("want only the floor left, got %+v", entries)
	}

	// Expired-with-quantity is distinguishable from exhausted at the model level,
	// which is what lets the UI say which happened.
	if expired.Expired(testNow) == false {
		t.Error("a request past its lifetime does not report expired")
	}
	if exhausted.Expired(testNow) {
		t.Error("a drained but unexpired request reports expired; it is exhausted, not lapsed")
	}
	if expired.Fillable(testNow) || exhausted.Fillable(testNow) {
		t.Error("neither an expired nor an exhausted request may be fillable")
	}
}

func TestDemandFor_OtherKindsAreIgnored(t *testing.T) {
	p := testParams()
	entries, _ := p.DemandFor(stationWith(
		liveRequest("water-req", "water", 999, 100),
	), "normal", "metals", testNow)

	if len(entries) != 1 || entries[0].Source != SourceFloor {
		t.Errorf("a water request leaked into the metals quote: %+v", entries)
	}
}

// --- provisioning ------------------------------------------------------------

func TestEpochAt_BucketsTime(t *testing.T) {
	p := testParams()
	if p.EpochAt(0) != p.EpochAt(p.EpochWidth-1) {
		t.Error("times within one window landed in different epochs")
	}
	if p.EpochAt(p.EpochWidth-1) == p.EpochAt(p.EpochWidth) {
		t.Error("the window boundary did not advance the epoch")
	}
}

// --- budget / absorption ceilings -------------------------------------------
