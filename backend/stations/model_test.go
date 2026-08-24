package stations

import "testing"

// A request's two terminal states are NOT the same thing, and the model has to
// keep them apart: an EXPIRED request lapsed with tonnage still on it, an
// EXHAUSTED one was fully bought. The UI reports them differently.

func TestRequest_ExpiredIsDistinctFromExhausted(t *testing.T) {
	const now = 1000

	expired := Request{Id: "lapsed", RemainingQuantity: 50, ExpiresAt: now - 1}
	exhausted := Request{Id: "drained", RemainingQuantity: 0, ExpiresAt: now + 1000}
	live := Request{Id: "open", RemainingQuantity: 50, ExpiresAt: now + 1000}

	if !expired.Expired(now) {
		t.Error("a request past its lifetime does not report expired")
	}
	if exhausted.Expired(now) {
		t.Error("a drained but unlapsed request reports expired")
	}
	if live.Expired(now) {
		t.Error("a live request reports expired")
	}

	// Neither terminal state may be filled.
	if expired.Fillable(now) {
		t.Error("an expired request is fillable")
	}
	if exhausted.Fillable(now) {
		t.Error("an exhausted request is fillable")
	}
	if !live.Fillable(now) {
		t.Error("a live request is not fillable")
	}
}

func TestRequest_ExpiryIsInclusiveAtTheBoundary(t *testing.T) {
	// At exactly ExpiresAt the request has lapsed — a request that quotes on the
	// tick it expires would let a sale settle against demand that is gone.
	r := Request{RemainingQuantity: 10, ExpiresAt: 1000}
	if !r.Expired(1000) {
		t.Error("a request is still live at exactly its expiry tick")
	}
	if r.Expired(999) {
		t.Error("a request expired one tick early")
	}
}

func TestStationFeatureId_IsStable(t *testing.T) {
	// Derived and fixed, so a burn order can name the station without a store
	// read, and a healed re-provisioning keeps the same board identity.
	if StationFeatureId == "" {
		t.Error("the station feature id is empty")
	}
}
