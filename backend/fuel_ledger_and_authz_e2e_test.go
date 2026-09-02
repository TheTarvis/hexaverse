package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 7.1,
// 7.2, 7.3, 7.4 — housekeeping deltas across corporation-credits and
// request-authorization:
//
//   - corporation-credits "Append-Only Trade Ledger": "A fuel-purchase
//     entry records its fleet, quantity, and negative amount"
//   - request-authorization "Per-Corporation Write Quota on Player-Initiated
//     Trade Routes": "A corporation exceeding its quota via refuel requests
//     is rejected the same way as via sale requests"
//   - request-authorization "The Sell and Refuel Endpoints Ignore a
//     Client-Supplied Corporation Id": "A client-supplied corporation id in
//     the refuel body has no effect"
//   - corporation-credits "Reconciliation Runs On a Stated Cadence...":
//     "A corporation with a confirmed divergence cannot refuel either"

import (
	"net/http"
	"strconv"
	"testing"

	"hexaverse/config"
)

func TestLedger_Scenario_FuelPurchaseEntryRecordsFleetQuantityAndNegativeAmount(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Ledger Fuel Entry Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)

	code, _ := refuel(t, router, sp.token, sp.fleetId, 12.0, "sdet-ledger-entry-shape-1")
	if code != http.StatusOK {
		t.Fatalf("refuel: status = %d", code)
	}

	entry := ledgerEntry(t, sp.corpId, "sdet-ledger-entry-shape-1")
	if len(entry) == 0 {
		t.Fatalf("no ledger entry found at corporations/%s/ledger/sdet-ledger-entry-shape-1", sp.corpId)
	}
	if fleetId, _ := entry["fleetId"].(string); fleetId != sp.fleetId {
		t.Errorf("corporation-credits \"A fuel-purchase entry records its fleet, quantity, and negative "+
			"amount\": ledger entry fleetId = %q, want %q", fleetId, sp.fleetId)
	}
	if qty, ok := entry["quantity"].(float64); !ok || qty != 12.0 {
		t.Errorf("ledger entry quantity = %v, want exactly 12", entry["quantity"])
	}
	if amount, ok := entry["amount"].(int64); !ok || amount >= 0 {
		t.Errorf("ledger entry amount = %v, want a strictly negative int64", entry["amount"])
	}
	if kind, _ := entry["kind"].(string); kind == "" {
		t.Errorf("ledger entry kind = %q, want a non-empty entry-kind naming this as a fuel purchase", kind)
	}
}

// TestWriteQuota_Scenario_CorporationExceedingQuotaViaRefuelRequestsIsRejectedSameAsSale
// runs against a SEPARATE router built with rate limiting forcibly enabled
// (backend/.env.test sets DISABLE_RATE_LIMITING=true for every other test in
// this suite, which would otherwise make the per-corporation write quota a
// no-op — router.go's own `if config.ServiceConfig.DisableRateLimiting`
// branch covers both the per-IP tiers and the corp write quota with the
// same flag). config.ServiceConfig is a process-wide mutable global; this
// test flips it for its own duration only and restores it via defer BEFORE
// any other test in this (sequential, non-parallel) suite can observe the
// changed value.
func TestWriteQuota_Scenario_CorporationExceedingQuotaViaRefuelRequestsIsRejectedSameAsSale(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	original := config.ServiceConfig.DisableRateLimiting
	config.ServiceConfig.DisableRateLimiting = false
	t.Cleanup(func() { config.ServiceConfig.DisableRateLimiting = original })

	router := SetupRouter() // built AFTER the flag flip, so its quota middleware is live, not a no-op

	sp := spawnFuelCorp(t, router, "SDET Write Quota Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000_000)

	// market.NewCorpWriteQuota(60, time.Minute) (router.go) is this
	// capability's own configured default quota — 61 requests in one
	// window must push at least one over it.
	const attempts = 61
	var sawTooManyRequests bool
	for i := 0; i < attempts; i++ {
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/refuel", sp.token,
			map[string]any{"tons": 1.0, "operationKey": "sdet-write-quota-" + strconv.Itoa(i)}, nil)
		requireRouteImplemented(t, w)
		if w.Code == http.StatusTooManyRequests {
			sawTooManyRequests = true
			break
		}
	}
	if !sawTooManyRequests {
		t.Errorf("request-authorization \"A corporation exceeding its quota via refuel requests is rejected "+
			"the same way as via sale requests\": %d refuel requests from one corporation in one window never "+
			"produced a 429 — refuel must be named alongside sell in the per-corporation write-quota wiring",
			attempts)
	}
}

func TestClientSuppliedCorpId_Scenario_RefuelBodyIgnoresClientSuppliedCorporationId(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	owner := spawnFuelCorp(t, router, "SDET Refuel Client Corp Id Owner")
	other := spawnFuelCorp(t, router, "SDET Refuel Client Corp Id Other")
	dockFleetAtStation(t, owner)
	setCorpCredits(t, owner.corpId, 1_000_000)
	setCorpCredits(t, other.corpId, 1_000_000)
	beforeFuel := fleetCargoFuel(t, owner.fleetId) // NOT assumed to be 0 — spawn's own starting-fuel grant may apply

	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+owner.fleetId+"/refuel", owner.token,
		map[string]any{"tons": 4.0, "operationKey": "sdet-client-corp-id-1", "corporationId": other.corpId}, nil)
	requireRouteImplemented(t, w)
	if w.Code != http.StatusOK {
		t.Fatalf("refuel with a spoofed corporationId field: status = %d, body = %s", w.Code, w.Body.String())
	}

	if got := fleetCargoFuel(t, owner.fleetId); got != beforeFuel+4.0 {
		t.Errorf("request-authorization \"A client-supplied corporation id in the refuel body has no effect\": "+
			"owner's fleet fuel = %v, want exactly %v (started at %v, plus 4 — the requester's OWN corporation "+
			"must settle, regardless of a corporationId field naming a different one)", got, beforeFuel+4.0, beforeFuel)
	}
	if got := corpCredits(t, other.corpId); got != 1_000_000 {
		t.Errorf("request-authorization \"A client-supplied corporation id in the refuel body has no effect\": "+
			"the NAMED (other) corporation's balance = %d, want unchanged at 1,000,000 — it must never be "+
			"debited by a request it did not make", got)
	}
}

func TestReconciliation_Scenario_ConfirmedDivergenceBlocksRefuelToo(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Divergence Blocks Refuel Corp")
	dockFleetAtStation(t, sp)
	setCorpCredits(t, sp.corpId, 1_000_000)
	beforeFuel := fleetCargoFuel(t, sp.fleetId) // NOT assumed to be 0 — spawn's own starting-fuel grant may apply
	markCorpReconciliationDivergent(t, sp.corpId)

	code, _ := refuel(t, router, sp.token, sp.fleetId, 1.0, "sdet-divergence-refuel-1")
	if code == http.StatusOK {
		t.Errorf("corporation-credits \"A corporation with a confirmed divergence cannot refuel either\": a " +
			"refuel against a corporation with a confirmed, unresolved reconciliation divergence returned 200, " +
			"want the same distinguishable rejection a sale would receive")
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != beforeFuel {
		t.Errorf("fleet fuel changed (%v -> %v) despite a confirmed divergence — no fuel may be credited until "+
			"an operator resolves it via an adjustment entry", beforeFuel, got)
	}
}
