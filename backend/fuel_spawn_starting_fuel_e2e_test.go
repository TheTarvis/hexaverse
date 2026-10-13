package main

// RED-PHASE SDET SUITE for openspec change add-fuel-as-cargo, tasks.md 5.1,
// 5.2, 5.3, 9.2 — corporation-spawn "Spawn Asset Healing" (MODIFIED),
// "Starting Fuel Is a Configured Constant, Guarded By a Reachability
// Sample" (ADDED), and "Session Bootstrap and Wake-Up Endpoints" (MODIFIED,
// "Concurrent bootstrap reads for one account heal exactly once"):
//
//   - "A corp with hull, fog, station, and balance but no starting-fuel
//     grant yet gets it credited on retry"
//   - "A hull that burned its starting fuel to exactly zero is never
//     re-granted"
//   - "A seeded hull can reach its home station on its starting fuel" — the
//     FLAGSHIP scenario named explicitly in this change's own tasks.md as
//     "the single most important scenario in this change", and the one
//     deliberate carve-out from every other reachability judgment's
//     floor-pricing rule: THIS ONE prices at the fleet's acceleration
//     CEILING (an omitted commanded acceleration defaults to the ceiling —
//     that is what a fresh corporation's real, unmodified first order
//     actually costs). Do not "fix" this test to the floor.
//   - "The guarantee is checked over a generated sample, not one fixture
//     account"
//   - "Concurrent bootstrap reads for one account heal exactly once" (widened
//     to a fourth healed asset)

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// orderOutcome separates the three things a fresh hull's own first order to
// its home station can come back as (fix-burn-order-geometry-refusals task
// 4.1). Before this change a geometry refusal was a bodyless 500 that these
// tests read as "unaffordable" and answered with "retune StartingFuelTons" —
// a wrong diagnosis that hid a spawn-placement defect. They are now distinct:
//
//   - orderAccepted: 200.
//   - orderUnaffordable: a non-200 whose `error` contains the fuel reason
//     ("exceeds available fuel") — the one outcome these tests sample, and the
//     only one for which a tuning message is right.
//   - orderGeometryRefusal: a non-200 whose `error` is one of the three burn
//     geometry refusals (origin or destination at or inside the star clearance,
//     or a curve below the minimum arc length). At a home that qualifies under
//     home-site criterion (d) this must NEVER happen: it FAILS the test and
//     names criterion (d) as the suspect. It is not a tuning signal.
//   - orderOther: anything else (reported with its status and body).
type orderOutcome int

const (
	orderAccepted orderOutcome = iota
	orderUnaffordable
	orderGeometryRefusal
	orderOther
)

// classifyOrder reads a non-200 order response's `error` text and branches on
// it; the fuel reason is checked first so an unaffordable order is never
// mistaken for a geometry one.
func classifyOrder(code int, body string) orderOutcome {
	if code == http.StatusOK {
		return orderAccepted
	}
	var parsed struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal([]byte(body), &parsed)
	switch {
	case strings.Contains(parsed.Error, "exceeds available fuel"):
		return orderUnaffordable
	case strings.Contains(parsed.Error, "origin is at or inside"),
		strings.Contains(parsed.Error, "destination is at or inside"),
		strings.Contains(parsed.Error, "minimum arc length"):
		return orderGeometryRefusal
	default:
		return orderOther
	}
}

// geometryRefusalMessage is the failure text for orderGeometryRefusal: it names
// home-site criterion (d) as the suspect and states this is not a tuning signal.
func geometryRefusalMessage(code int, body string) string {
	return "the fresh hull's own default burn order to its home station was REFUSED FOR GEOMETRY (status " +
		strconv.Itoa(code) + ", body " + body + "). A home chosen by site selection satisfies criterion (d) — its " +
		"station shell clears the star — so this refusal means criterion (d) is the suspect (the predicate, " +
		"its table, or its wiring into site selection). This is NOT a tuning signal: do not retune " +
		"FuelParams.StartingFuelTons"
}

// postStationOrder is the fresh hull's real, unmodified first order (no accel,
// so it defaults to the fleet's ceiling) to its home station. Unlike
// postOrder it keeps the body of a non-200, which the classification reads.
func postStationOrder(t *testing.T, router http.Handler, sp fuelSpawn) (resp fuelFleetDTO, code int, body string) {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, map[string]any{"bodyId": sp.stationId}, nil)
	if w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decoding order response for fleet %s: %v\nbody: %s", sp.fleetId, err, w.Body.String())
		}
	}
	return resp, w.Code, w.Body.String()
}

// TestSpawn_Scenario_ASeededHullCanReachItsHomeStationOnItsStartingFuel is
// the flagship. A fresh corporation's spawn grants NO fuel today (task 5 is
// wholly unimplemented) — a fresh hull's own real, unmodified first order
// (an omitted accel, defaulting to the fleet's DerivedAccelCeiling per "An
// omitted commanded acceleration defaults to the fleet's ceiling") to its
// own home station must be affordable on whatever `FuelParams.StartingFuelTons`
// spawn grants.
func TestSpawn_Scenario_ASeededHullCanReachItsHomeStationOnItsStartingFuel(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	sp := spawnFuelCorp(t, router, "SDET Station Hosted Spawn")
	requireStationHostedSpawn(t, router, sp)
}

func TestSpawn_Scenario_CorpWithHullFogStationBalanceButNoStartingFuelGrantGetsItOnRetry(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Fuel Grant On Retry Corp")
	// Simulate "no starting-fuel grant yet" for an otherwise-complete corp:
	// zero the fleet's fuel AND delete the grant marker (this is what a
	// corp that predates this change's grant step would look like —
	// hull/fog/station/balance all exist, but the fuel step never ran).
	//
	// REVISION (SDET, cause: orchestrator-adjudicated dispute — the
	// developer's "impossible to satisfy simultaneously" framing was
	// wrong; corrected rather than accepted): a real spawn creates the
	// marker in the SAME transaction as the grant, so simulating "predates
	// the grant" requires deleting the marker too, not just zeroing fuel.
	// Zeroing fuel ALONE would be indistinguishable from a hull that
	// legitimately burned its tank dry — which is exactly the OTHER
	// scenario in this file, and exactly what the marker exists to
	// disambiguate (never inferring "never granted" from fuel == 0).
	setFleetFuel(t, sp.fleetId, 0)
	deleteFuelGrantMarker(t, sp.corpId, sp.fleetId)

	// Re-run the same idempotent healing pass a session bootstrap runs.
	var me struct {
		Credits int64 `json:"credits"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/corporations/me", sp.token, nil, &me)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/corporations/me: status = %d, body = %s", w.Code, w.Body.String())
	}

	got := fleetCargoFuel(t, sp.fleetId)
	if got <= 0 {
		t.Errorf("corporation-spawn \"A corp with hull, fog, station, and balance but no starting-fuel grant "+
			"yet gets it credited on retry\": fleet fuel = %v after a session-bootstrap healing pass, want the "+
			"configured starting-fuel constant credited — a healing pass must top up a hull that never received "+
			"its starting-fuel grant, without re-seeding a hull, duplicating fog, re-provisioning a station, or "+
			"re-granting the opening balance", got)
	}
}

func TestSpawn_Scenario_AHullThatBurnedItsStartingFuelToExactlyZeroIsNeverReGranted(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET No Infinite Faucet Corp")
	granted := fleetCargoFuel(t, sp.fleetId)
	if granted <= 0 {
		t.Fatalf("fixture invariant broken: spawn granted %v starting fuel, want > 0 — this scenario needs a "+
			"REAL grant to legitimately burn down before it is meaningful", granted)
	}

	// Legitimately burn the tank to exactly zero (simulating play).
	setFleetFuel(t, sp.fleetId, 0)

	// A second session-bootstrap healing pass must NOT re-grant.
	w := doJSON(t, router, http.MethodGet, "/v1/corporations/me", sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/corporations/me: status = %d, body = %s", w.Code, w.Body.String())
	}
	got := fleetCargoFuel(t, sp.fleetId)
	if got != 0 {
		t.Errorf("corporation-spawn \"A hull that burned its starting fuel to exactly zero is never "+
			"re-granted\": fleet fuel = %v after a second healing pass against a hull that legitimately burned "+
			"its tank dry, want 0 (unchanged) — the healing pass MUST NOT infer \"never granted\" from a fuel "+
			"level of zero; the only signal for \"already granted\" is the per-fleet grant marker at "+
			"corporations/{corpId}/fuelGrants/{fleetId}, never fuel == 0 (which would be an infinite faucet)", got)
	}
}

func TestSpawn_Scenario_ConcurrentBootstrapReadsHealTheStartingFuelGrantExactlyOnce(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	// A fresh account that has never spawned: POST /v1/accounts, but not
	// yet POST /v1/corporations — two concurrent POST /v1/corporations
	// calls are this scenario's own "concurrent bootstrap reads for one
	// account" (session-bootstrap's GET /v1/corporations/me equally runs
	// the same healing pass; POST is used here since it also returns the
	// fleet id needed to check fuel without a second round trip).
	token := mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts: status = %d, body = %s", w.Code, w.Body.String())
	}

	var wg sync.WaitGroup
	wg.Add(2)
	results := make([]struct {
		code    int
		fleetId string
	}, 2)
	for i := 0; i < 2; i++ {
		i := i
		go func() {
			defer wg.Done()
			var spawn struct {
				Fleet struct{ Id string } `json:"fleet"`
			}
			w := doJSON(t, router, http.MethodPost, "/v1/corporations", token,
				map[string]any{"name": "SDET Concurrent Fuel Grant Corp"}, &spawn)
			results[i] = struct {
				code    int
				fleetId string
			}{w.Code, spawn.Fleet.Id}
		}()
	}
	wg.Wait()

	for _, r := range results {
		if r.code != http.StatusOK {
			t.Fatalf("one of the two concurrent POST /v1/corporations calls failed: status = %d", r.code)
		}
	}
	fleetId := results[0].fleetId
	if fleetId == "" || results[1].fleetId != fleetId {
		t.Fatalf("the two concurrent spawn calls resolved to different fleets (%q vs %q) — idempotent spawn "+
			"must resolve to the SAME hull", fleetId, results[1].fleetId)
	}

	// Exactly one grant: fuel must equal the configured starting constant,
	// not double it. Compared against the OTHER, sequential spawn's own
	// grant amount (fuel_spawn_starting_fuel_e2e_test.go's own flagship
	// test observes this same value) rather than a literal number this
	// suite would have to hardcode and keep in sync with a future tuning
	// change.
	reference := spawnFuelCorp(t, router, "SDET Concurrent Fuel Grant Reference Corp")
	referenceGrant := fleetCargoFuel(t, reference.fleetId)
	concurrentGrant := fleetCargoFuel(t, fleetId)
	if referenceGrant <= 0 {
		t.Fatalf("fixture invariant broken: reference (non-concurrent) spawn granted %v starting fuel, want > "+
			"0 — this scenario is vacuous until spawn actually grants starting fuel at all", referenceGrant)
	}

	if !almostEqual(concurrentGrant, referenceGrant, 1e-6) {
		t.Errorf("corporation-spawn \"Concurrent bootstrap reads for one account heal exactly once\" (widened "+
			"to the starting-fuel grant as a fourth healed asset): two concurrent POST /v1/corporations calls "+
			"for one never-spawned account left fuel = %v, want %v (the same single-grant amount a normal, "+
			"non-concurrent spawn produces) — a value of roughly double would mean the grant fired twice",
			concurrentGrant, referenceGrant)
	}
}

// TestSpawn_Scenario_StartingFuelReachabilitySample is task 5.2's
// generated-sample invariant, run over a modest N within this test's own
// time budget (not a claim that N spawns constitutes the FULL "large
// sample" a dedicated tuning-validation run would use — see the coverage
// table note on sizing this up separately if desired).
func TestSpawn_Scenario_StartingFuelReachabilitySample(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	const sampleSize = 8
	homes := map[string]bool{}
	for i := 0; i < sampleSize; i++ {
		t.Run(strconv.Itoa(i), func(t *testing.T) {
			sp := spawnFuelCorp(t, router, "SDET Station Spawn Sample "+strconv.Itoa(i))
			homes[sp.homeId] = true
			requireStationHostedSpawn(t, router, sp)
		})
	}
	if len(homes) < 2 {
		t.Fatal("generated sample did not span multiple home systems")
	}
}
