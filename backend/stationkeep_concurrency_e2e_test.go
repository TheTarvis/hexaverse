package main

// RED-PHASE SDET e2e SUITE for openspec change add-stationkeep-hold-verb —
// the THREE DISTINCT UNSERIALIZED-MUTATOR races (task 7.7, and the first half
// of task 7.13). Run against real concurrency through the real production
// router, not a harness that steps around the race.
//
// fleet-movement "Hold and Release Settle In One Transaction Against a
// Transactional Re-Read":
//   - "A concurrent release and refuel both take effect"
//   - "A double-submitted hold stores exactly one park"
//
// fleet-movement "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold
// First":
//   - "A settlement write racing a refuel never discards the purchased fuel"
//
// These are THREE DISTINCT CASES, not one: the requirement enumerates "four
// distinct mutators, none of which any channel slot orders against the other"
// — a refuel, a concurrent burn commit's debit, the settle-first write, and a
// second copy of the same hold/release request. Neither `hold` nor `release`
// creates an action, "so neither claims a channel slot, and NOTHING ELSE
// serializes them against any other `cargo.fuel` mutator".

import (
	"net/http"
	"sync"
	"testing"

	"hexaverse/space"
)

// Scenario: A concurrent release and refuel both take effect.
//
// DISCRIMINATING WITHOUT ARITHMETIC. The hold is rewound only 1/20 of its
// window, so the accrual the release settles is small (~5% of the spendable
// budget) while the refuel credits 20 tons. The three possible outcomes are
// then separated by inequality alone:
//
//	correct        : after = before − accrual + 20   (strictly above `before`)
//	refuel lost    : after = before − accrual        (strictly below `before`)
//	release lost   : after = before + 20             (exactly before + 20)
func TestHoldRelease_Scenario_AConcurrentReleaseAndRefuelBothTakeEffect(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Release-vs-Refuel Race Corp")
	setCorpCredits(t, sp.corpId, 1_000_000)

	// Docked at the home station AND station-keeping beside it — reachable
	// play, not a hypothetical: "`hold`, `release`, and `fuel-purchase`'s
	// docked-state precondition are independent of one another and nothing in
	// this capability prevents a fleet from being both attached to, and
	// station-keeping near, the same station."
	startFuel := reserve + 100
	arriveInOrbitAround(t, router, sp, sp.stationId, startFuel)
	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	h0, d0 := holdWindow(t, sp.fleetId)
	rewindHoldWindow(t, sp.fleetId, (d0-h0)/20) // a real, strictly positive accrual to settle
	before := fleetCargoFuel(t, sp.fleetId)

	const refuelTons = 20.0
	var wg sync.WaitGroup
	wg.Add(2)
	var releaseCode, refuelCode int
	var releaseBody, refuelBody string
	// NOTE: rawPost, never postRelease — t.Fatalf from a non-test goroutine is
	// illegal, and postRelease's requireRouteImplemented guard calls it. The
	// route check runs on the main goroutine, below.
	go func() {
		defer wg.Done()
		w := rawPost(t, router, sp.token, "/v1/fleets/"+sp.fleetId+"/release", map[string]any{})
		releaseCode, releaseBody = w.Code, w.Body.String()
	}()
	go func() {
		defer wg.Done()
		w := rawPost(t, router, sp.token, "/v1/fleets/"+sp.fleetId+"/refuel",
			map[string]any{"tons": refuelTons, "operationKey": "sdet-release-race-refuel-1"})
		refuelCode, refuelBody = w.Code, w.Body.String()
	}()
	wg.Wait()

	if releaseCode == http.StatusNotFound {
		t.Fatalf("the concurrent release returned 404 (body: %s) — POST /v1/fleets/:fleetId/release is not "+
			"registered at all, so this race has no second party", releaseBody)
	}
	if releaseCode != http.StatusOK {
		t.Fatalf("the concurrent release was itself rejected (status = %d, body = %s) — re-run isolated "+
			"before treating this as a race finding", releaseCode, releaseBody)
	}
	if refuelCode != http.StatusOK {
		t.Fatalf("the concurrent refuel was itself rejected (status = %d, body = %s) — re-run isolated "+
			"before treating this as a race finding", refuelCode, refuelBody)
	}

	after := fleetCargoFuel(t, sp.fleetId)
	if after <= before {
		t.Errorf("fleet-movement \"A concurrent release and refuel both take effect\": final cargo.fuel = %v, "+
			"against %v before the race and a %v-ton refuel credit. The purchased tonnage is GONE: the "+
			"refuel's write was silently overwritten by the release's stale, pre-transaction computation of "+
			"the resulting balance. \"the purchased fuel — and the credits spent on it — vanish; this is the "+
			"same class of defect as the refuel double-submit that turned out to be real in production, not "+
			"merely on paper.\"", after, before, refuelTons)
	}
	if after >= before+refuelTons {
		t.Errorf("fleet-movement \"A concurrent release and refuel both take effect\": final cargo.fuel = %v, "+
			"which is %v (before) + %v (the full refuel credit) with NO upkeep debited. The release's "+
			"settlement write was silently overwritten by the refuel's stale, pre-transaction computation — "+
			"a hold released for free.", after, before, refuelTons)
	}
	if got := storedParkKind(t, sp.fleetId); got != space.ParkOrbit {
		t.Errorf("stored park kind after the race = %v, want the released ParkOrbit — the release took effect",
			got)
	}
}

// Scenario: A double-submitted hold stores exactly one park.
func TestHoldRelease_Scenario_ADoubleSubmittedHoldStoresExactlyOnePark(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Double Hold Race Corp")
	arriveInOrbitAround(t, router, sp, sp.stationId, reserveTons(t)+100)

	var wg sync.WaitGroup
	wg.Add(2)
	codes := make([]int, 2)
	bodies := make([]string, 2)
	for i := range codes {
		go func(i int) {
			defer wg.Done()
			w := rawPost(t, router, sp.token, "/v1/fleets/"+sp.fleetId+"/hold", map[string]any{})
			codes[i], bodies[i] = w.Code, w.Body.String()
		}(i)
	}
	wg.Wait()

	// The route-existence guard runs HERE, on the test goroutine: an
	// unregistered Gin route answers 404 for every caller, which would let the
	// "exactly one succeeded" accounting below fail for a reason that has
	// nothing to do with serialization.
	for i, c := range codes {
		if c == http.StatusNotFound {
			t.Fatalf("concurrent hold #%d returned 404 (body: %s) — POST /v1/fleets/:fleetId/hold is not "+
				"registered at all, so this race has nothing to serialize", i, bodies[i])
		}
	}

	ok, rejected := 0, 0
	for i, c := range codes {
		switch {
		case c == http.StatusOK:
			ok++
		case c == http.StatusConflict:
			rejected++
		default:
			t.Errorf("concurrent hold #%d returned %d (body: %s), want either 200 or a 409 carrying the "+
				"not-orbiting reason — never a 5xx", i, c, bodies[i])
		}
	}
	if ok != 1 || rejected != 1 {
		t.Errorf("fleet-movement \"A double-submitted hold stores exactly one park\": %d of the two "+
			"concurrent holds succeeded and %d were rejected, want exactly one of each — \"the second "+
			"request observes the first's park and is rejected by the not-orbiting reason, never storing a "+
			"second park over the first's stamps\". Nothing serializes these two requests: neither verb "+
			"claims a channel slot, so only the transactional re-read can.", ok, rejected)
	}

	if got := storedParkKind(t, sp.fleetId); got != space.ParkStationkeep {
		t.Fatalf("stored park kind after the double submission = %v, want exactly one ParkStationkeep", got)
	}
	holdStart, dryInstant := holdWindow(t, sp.fleetId)
	if !(dryInstant > holdStart) {
		t.Errorf("the surviving park's stored window is holdStart=%d dryInstant=%d — \"exactly one "+
			"hold-start time and one dry instant computed from ONE transactional re-read\". A window whose "+
			"two halves came from different transactions is exactly the last-write-wins shape this "+
			"requirement exists to close, and a park with dryInstant <= holdStart fails to decode outright.",
			holdStart, dryInstant)
	}
}

// Scenario: A settlement write racing a refuel never discards the purchased
// fuel.
//
// The fourth unserialized mutator. "a refuel that had already settled the same
// hold to the reserve — folding it to its released orbit, no restamp applying
// to a hold already past its dry instant — and then credited its purchased
// tonnage in its own correct transaction is silently overwritten by a plain
// read's settlement, and the purchased tonnage and the credits spent on it are
// both lost."
//
// The racing settle-first write is issued here by a PLAIN FLEET READ, which is
// one of the eight consumers the requirement enumerates.
func TestSettleFirst_Scenario_ASettlementWriteRacingARefuelNeverDiscardsThePurchasedFuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	reserve := reserveTons(t)
	sp := spawnFuelCorp(t, router, "SDET Settle-vs-Refuel Race Corp")
	setCorpCredits(t, sp.corpId, 1_000_000)
	startFuel := reserve + 100
	arriveInOrbitAround(t, router, sp, sp.stationId, startFuel)
	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging the hold: status = %d, body = %s", w.Code, w.Body.String())
	}
	// The dry instant is now in the PAST, unobserved by any write: the next
	// reader's settle-first write and a concurrent refuel are both about to
	// touch cargo.fuel, and nothing serializes them.
	rewindHoldWindowPastDryInstant(t, sp.fleetId, 5_000)
	if stale := fleetCargoFuel(t, sp.fleetId); stale != startFuel {
		t.Fatalf("fixture invariant: the stored fuel must still show the stale %v (got %v)", startFuel, stale)
	}
	creditsBefore := corpCredits(t, sp.corpId)

	const refuelTons = 20.0
	var wg sync.WaitGroup
	wg.Add(2)
	var readCode, refuelCode int
	var refuelBody string
	go func() {
		defer wg.Done()
		readCode = rawGet(t, router, sp.token, "/v1/fleets/"+sp.fleetId).Code
	}()
	go func() {
		defer wg.Done()
		w := rawPost(t, router, sp.token, "/v1/fleets/"+sp.fleetId+"/refuel",
			map[string]any{"tons": refuelTons, "operationKey": "sdet-settle-race-refuel-1"})
		refuelCode, refuelBody = w.Code, w.Body.String()
	}()
	wg.Wait()

	if readCode != http.StatusOK {
		t.Fatalf("the concurrent fleet read failed (status = %d)", readCode)
	}
	if refuelCode != http.StatusOK {
		t.Fatalf("the concurrent refuel was itself rejected (status = %d, body = %s) — re-run isolated "+
			"before treating this as a race finding", refuelCode, refuelBody)
	}

	after := fleetCargoFuel(t, sp.fleetId)
	if after < reserve+refuelTons-1e-6 {
		t.Errorf("fleet-movement \"A settlement write racing a refuel never discards the purchased fuel\": "+
			"final cargo.fuel = %v, want at least %v (the settled reserve %v plus the refuel's full %v tons). "+
			"A value of exactly %v means the settle-first write performed an UNCONDITIONAL absolute set of "+
			"cargo.fuel to the reserve from a figure it read before the refuel landed — it must instead "+
			"re-read the park inside its own transaction and, finding the hold already settled and folded to "+
			"its released orbit, write NOTHING AT ALL. The purchased tonnage AND the credits spent on it are "+
			"both lost otherwise.", after, reserve+refuelTons, reserve, refuelTons, reserve)
	}
	if creditsAfter := corpCredits(t, sp.corpId); creditsAfter == creditsBefore {
		t.Errorf("the corporation's credits are unchanged (%d) — the refuel reported success but charged "+
			"nothing, so this race has no purchased tonnage to lose and cannot discriminate", creditsAfter)
	}
}
