package main

// One real-router journey follows the system storyboard's resource loop and
// the user's requested scan-after-arrival order. Spawn/cargo/credits are real;
// only committed action deadlines are advanced, using the existing resolver
// helpers, so the test needs no wall-clock sleeps or fabricated arrivals.
// Concurrent-update guarantees remain in action/actorstate_producer_test.go;
// this sequential player journey does not claim to exercise a transaction race.

import (
	"context"
	"math"
	"net/http"
	"testing"

	"hexaverse/fleet"
	"hexaverse/market"
	refuelpkg "hexaverse/refuel"
	"hexaverse/space"
	"hexaverse/system"
)

func TestTutorialJourney_SpawnBurnScanMineReturnSellRefuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)
	ctx := context.Background()
	var sp fuelSpawn
	var bodyID, kind string
	var initialFuel float64
	var initialCredits int64
	const sampleTons = 10.0
	const purchaseTons = 10.0

	// A failed stage stops the sequence: later stages cannot pass against a
	// missing premise, and the one account is reused throughout the journey.
	step := func(name string, run func(*testing.T)) {
		t.Helper()
		if !t.Run(name, run) {
			t.FailNow()
		}
	}
	step("spawn docked at the home station with the real starting grants", func(t *testing.T) {
		sp = spawnFuelCorp(t, router, "Tutorial Resource Loop")
		got, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
		if code != http.StatusOK || got.AttachedTo != sp.stationId || got.State.Mode != space.ModeParked ||
			got.State.Park == nil || got.State.Park.Kind != space.ParkOrbit || got.State.Park.BodyId != sp.stationId {
			t.Fatalf("spawn must be station-hosted: status=%d fleet=%+v", code, got)
		}
		initialFuel = fleetCargoFuel(t, sp.fleetId)
		initialCredits = corpCredits(t, sp.corpId)
		if initialFuel != fleet.DefaultFuelParams().StartingFuelTons || initialCredits <= 0 {
			t.Fatalf("missing starting grants: fuel=%g credits=%d", initialFuel, initialCredits)
		}
		bodyID, kind = tutorialResourceDestination(t, router, sp, initialFuel)
	})

	step("burn to the resource body and reject refuel while travelling", func(t *testing.T) {
		burn, _, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": bodyID})
		if code != http.StatusOK || burn.State.Mode != space.ModeBurn || burn.State.Burn == nil || burn.AttachedTo != "" {
			t.Fatalf("departure was not committed: status=%d fleet=%+v", code, burn)
		}
		wantFuel := initialFuel - expectedFuelCostTons(burn.State.Burn, 1)
		if got := fleetCargoFuel(t, sp.fleetId); !almostEqual(got, wantFuel, 1e-6) {
			t.Fatalf("departure fuel=%g want=%g", got, wantFuel)
		}
		code, rejected := refuel(t, router, sp.token, sp.fleetId, purchaseTons, "tutorial-refuel-in-flight")
		if code != http.StatusBadRequest || rejected["error"] != refuelpkg.ErrNotDockedAtStation.Error() {
			t.Fatalf("in-flight refuel must reject for station attachment: status=%d body=%v", code, rejected)
		}
		if !almostEqual(fleetCargoFuel(t, sp.fleetId), wantFuel, 1e-6) || corpCredits(t, sp.corpId) != initialCredits {
			t.Fatal("rejected refuel changed fuel or credits")
		}
		forceBurnArrivalPast(t, sp.fleetId)
		tutorialRequireDock(t, router, sp, bodyID)
	})

	step("scan the docked host and receive its sighting record", func(t *testing.T) {
		fuelBefore := fleetCargoFuel(t, sp.fleetId)
		if w := scanReq(t, router, sp.token, sp.fleetId, bodyID); w.Code != http.StatusOK {
			t.Fatalf("scan commit: status=%d body=%s", w.Code, w.Body.String())
		}
		scanning := readFleet(t, fdao, ctx, sp.fleetId)
		if scanning.Scan == nil || scanning.Scan.HostId != bodyID || scanning.ActiveScanId == "" {
			t.Fatalf("scan did not start against the arrived host: %+v", scanning)
		}
		actionID := scanning.ActiveScanId
		timeSkipAction(t, client, actionID)
		settleScope(t, router, sp.token, sp.homeId)
		act := readAction(t, router, sp.token, actionID)
		if act["status"] != "done" || (act["reasonCode"] != nil && act["reasonCode"] != "") {
			t.Fatalf("scan did not complete cleanly: %v", act)
		}
		if got := readFleet(t, fdao, ctx, sp.fleetId); got.ActiveScanId != "" || got.Scan != nil {
			t.Fatal("settled scan did not release the sensor channel")
		}
		var pile struct {
			Sightings []struct {
				HostID string `json:"hostId"`
			} `json:"sightings"`
		}
		w := doJSON(t, router, http.MethodGet, "/v1/sightings", sp.token, nil, &pile)
		if w.Code != http.StatusOK {
			t.Fatalf("sightings read: status=%d body=%s", w.Code, w.Body.String())
		}
		found := false
		for _, sighting := range pile.Sightings {
			found = found || sighting.HostID == bodyID
		}
		if !found || fleetCargoFuel(t, sp.fleetId) != fuelBefore {
			t.Fatal("scan must file a record for its host without consuming cargo fuel")
		}
	})

	step("mine the sample into the hold without turning ore into fuel", func(t *testing.T) {
		fuelBefore := fleetCargoFuel(t, sp.fleetId)
		oreBefore := fleetCargoKind(t, sp.fleetId, kind)
		var committed struct {
			ActionID string `json:"actionId"`
		}
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/mine", sp.token,
			map[string]any{"featureId": bodyID, "kind": kind, "tons": sampleTons}, &committed)
		if w.Code != http.StatusOK || committed.ActionID == "" {
			t.Fatalf("mine commit: status=%d body=%s", w.Code, w.Body.String())
		}
		if fleetCargoKind(t, sp.fleetId, kind) != oreBefore {
			t.Fatal("mine credited cargo before completion")
		}
		timeSkipAction(t, client, committed.ActionID)
		settleScope(t, router, sp.token, sp.homeId)
		act := readAction(t, router, sp.token, committed.ActionID)
		if act["status"] != "done" || act["reasonCode"] != "clean" ||
			!almostEqual(fleetCargoKind(t, sp.fleetId, kind), oreBefore+sampleTons, 1e-6) {
			t.Fatalf("sample was not collected in full: action=%v cargo=%g", act, fleetCargoKind(t, sp.fleetId, kind))
		}
		if fleetCargoFuel(t, sp.fleetId) != fuelBefore {
			t.Fatal("mining changed fuel instead of only adding resource cargo")
		}
	})

	step("return to the home station with cargo intact", func(t *testing.T) {
		fuelBefore := fleetCargoFuel(t, sp.fleetId)
		oreBefore := fleetCargoKind(t, sp.fleetId, kind)
		burn, _, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": sp.stationId})
		if code != http.StatusOK || burn.State.Burn == nil || burn.AttachedTo != "" {
			t.Fatalf("return was not committed: status=%d fleet=%+v", code, burn)
		}
		wantFuel := fuelBefore - expectedFuelCostTons(burn.State.Burn, 1)
		forceBurnArrivalPast(t, sp.fleetId)
		tutorialRequireDock(t, router, sp, sp.stationId)
		if !almostEqual(fleetCargoFuel(t, sp.fleetId), wantFuel, 1e-6) || fleetCargoKind(t, sp.fleetId, kind) != oreBefore {
			t.Fatal("return must debit only fuel and preserve mined cargo")
		}
	})

	step("sell the sample then buy fuel at the station", func(t *testing.T) {
		fuelBefore := fleetCargoFuel(t, sp.fleetId)
		oreBefore := fleetCargoKind(t, sp.fleetId, kind)
		creditsBefore := corpCredits(t, sp.corpId)
		var sale market.SellResult
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/sell", sp.token,
			map[string]any{"featureId": sp.stationId, "kind": kind, "tons": sampleTons, "operationKey": "tutorial-sell-sample"}, &sale)
		if w.Code != http.StatusOK || sale.TotalProceeds <= 0 || sale.Balance != creditsBefore+sale.TotalProceeds ||
			corpCredits(t, sp.corpId) != sale.Balance || !almostEqual(fleetCargoKind(t, sp.fleetId, kind), oreBefore-sampleTons, 1e-6) {
			t.Fatalf("sale did not settle cargo and credits: status=%d body=%s", w.Code, w.Body.String())
		}
		if fleetCargoFuel(t, sp.fleetId) != fuelBefore {
			t.Fatal("selling resource cargo changed fuel")
		}
		_, served, readCode := fuelGetFleet(t, router, sp.token, sp.fleetId)
		priceRaw, found := fieldAnywhere(served, "fuelPricePerTon")
		price, numeric := asFloat(priceRaw)
		if readCode != http.StatusOK || !found || !numeric || price <= 0 {
			t.Fatal("station fuel purchase has no valid served price")
		}
		wantCost := int64(math.Ceil(purchaseTons * price))
		var purchase refuelpkg.Result
		w = doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/refuel", sp.token,
			map[string]any{"tons": purchaseTons, "operationKey": "tutorial-buy-fuel"}, &purchase)
		if w.Code != http.StatusOK || purchase.Cost != wantCost || purchase.Balance != sale.Balance-purchase.Cost ||
			corpCredits(t, sp.corpId) != purchase.Balance || !almostEqual(purchase.Cargo["fuel"], fuelBefore+purchaseTons, 1e-6) ||
			!almostEqual(fleetCargoFuel(t, sp.fleetId), fuelBefore+purchaseTons, 1e-6) {
			t.Fatalf("refuel did not settle fuel and credits: status=%d body=%s", w.Code, w.Body.String())
		}
	})
}

func tutorialRequireDock(t *testing.T, router http.Handler, sp fuelSpawn, host string) {
	t.Helper()
	got, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK || got.State.Mode != space.ModeParked || got.State.Burn != nil ||
		got.State.Park == nil || got.State.Park.BodyId != host || got.AttachedTo != host {
		t.Fatalf("arrival must attach to %s: status=%d fleet=%+v", host, code, got)
	}
}

// Select a resource body from the real interior and affordable served quotes,
// reserving most starting fuel for the return. No generated body is injected.
func tutorialResourceDestination(t *testing.T, router http.Handler, sp fuelSpawn, fuel float64) (string, string) {
	t.Helper()
	var interior struct {
		Features []system.Feature `json:"features"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+sp.homeId, sp.token, nil, &interior)
	if w.Code != http.StatusOK {
		t.Fatalf("interior read: status=%d body=%s", w.Code, w.Body.String())
	}
	bestCost := math.Inf(1)
	var bodyID, kind string
	for _, feature := range interior.Features {
		if feature.Id == sp.stationId || feature.Type == system.FeatureStar || len(feature.Resources) == 0 {
			continue
		}
		var quote struct {
			Affordable bool    `json:"affordable"`
			FuelCost   float64 `json:"fuelCostTons"`
		}
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders/preview", sp.token,
			map[string]any{"bodyId": feature.Id}, &quote)
		if w.Code != http.StatusOK && w.Code != http.StatusConflict {
			t.Fatalf("destination quote: status=%d body=%s", w.Code, w.Body.String())
		}
		if w.Code == http.StatusOK && quote.Affordable && quote.FuelCost > 0 && quote.FuelCost < fuel*0.4 && quote.FuelCost < bestCost {
			bodyID, kind, bestCost = feature.Id, string(feature.Resources[0].Kind), quote.FuelCost
		}
	}
	if bodyID == "" {
		t.Fatalf("home %s has no affordable resource destination with a return reserve", sp.homeId)
	}
	return bodyID, kind
}
