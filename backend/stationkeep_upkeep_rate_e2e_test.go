package main

// RED-phase end-to-end tests for openspec change
// serve-orbital-elements-and-burn-preview, tasks.md 1.8 / 5.1-5.3, 5.5 —
// fleet-movement's ADDED requirement "Fleet Read Serves the Station-Keeping
// Upkeep Rate in Fuel Tons" (all five of its scenarios).
//
// THE FIELD'S NAME IS NOT PINNED. The requirement describes the value ("the
// fleet's current station-keeping upkeep rate expressed in fuel tons per
// second") and names no wire key, so this suite discovers it DIFFERENTIALLY:
// the extra key an orbiting fleet's roster carries that a burning fleet's does
// not. That makes the assertions falsifiable without an SDET guess a developer
// would then have to be told about — and it makes "absent for a burn, a drift,
// or a point park" a property of the same discovery rather than a second
// guess.
//
// THE EXPECTED VALUE IS NOT RE-DERIVED FROM A FORMULA EITHER. It is computed
// by calling space.StationKeepRate over the system's OWN body table — the same
// function the requirement names — and dividing by
// fleet.DefaultFuelParams().DeltaVPerTon. What is under test here is the host
// selection, the conversion, and the presence rule; the rate function itself is
// already pinned by backend/space's own suite. Nothing here duplicates its
// arithmetic, so a retune of either constant changes no test.
//
// EXPECTED TO BE RED TODAY: fleet/handler.go's rosterDTO carries no such
// field, and space.StationKeepRate has zero production callers (design.md's
// own Context section).

import (
	"math"
	"net/http"
	"testing"

	"hexaverse/fleet"
	"hexaverse/space"
)

// expectedUpkeepTonsPerSecond is the rate the requirement defines, computed
// through the same space function it names, over the system's own body table.
func expectedUpkeepTonsPerSecond(t *testing.T, systemId, hostBodyId string) float64 {
	t.Helper()
	bt := homeBodyTable(t, systemId)
	rate, err := space.StationKeepRate(bt, hostBodyId)
	if err != nil {
		t.Fatalf("space.StationKeepRate(%s): %v", hostBodyId, err)
	}
	perTon := fleet.DefaultFuelParams().DeltaVPerTon
	if !(perTon > 0) {
		t.Fatalf("fleet.DefaultFuelParams().DeltaVPerTon = %v, want strictly positive", perTon)
	}
	return rate / perTon
}

// rosterKeys reads one fleet and returns the key set of its ROSTER OBJECT
// ALONE, for differential discovery of the unnamed rate field.
//
// Roster-only, deliberately: the requirement places the rate "on the owner-only
// roster surface", and the TOP-LEVEL keys legitimately differ between the
// arrangements this suite compares — an orbiting fleet carries `attachedTo`
// and a burning one does not, which is enough to make a whole-body differential
// report a false candidate and, worse, to make the "no rate for a host-less
// fleet" scenario pass on the strength of `attachedTo` alone. (It did, on the
// first red run.)
func rosterKeys(t *testing.T, router http.Handler, token, fleetId string) (map[string]bool, map[string]interface{}) {
	t.Helper()
	_, body, code := fuelGetFleet(t, router, token, fleetId)
	if code != http.StatusOK {
		t.Fatalf("GET /v1/fleets/%s: status = %d", fleetId, code)
	}
	roster, ok := body["roster"].(map[string]interface{})
	if !ok {
		t.Fatalf("GET /v1/fleets/%s served no owner-only `roster` object — the rate lives on that surface, "+
			"so without it this scenario has no subject", fleetId)
	}
	keys := map[string]bool{}
	for k := range roster {
		keys[k] = true
	}
	return keys, body
}

// pickStationKeepHost names the body in the spawn's home system whose
// station-keeping rate is HIGHEST, so the value assertion discriminates
// against an implementation that always returns space.StationKeepFloor. Falls
// back to the first candidate — and says so — if every candidate clamps to the
// floor.
func pickStationKeepHost(t *testing.T, router http.Handler, sp fuelSpawn) string {
	t.Helper()
	var interior struct {
		Features []struct {
			Id   string `json:"id"`
			Type string `json:"type"`
		} `json:"features"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+sp.homeId, sp.token, nil, &interior)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d", sp.homeId, w.Code)
	}
	bt := homeBodyTable(t, sp.homeId)

	best, bestRate := "", -1.0
	for _, f := range interior.Features {
		if f.Type == "star" || f.Id == sp.stationId {
			continue
		}
		rate, err := space.StationKeepRate(bt, f.Id)
		if err != nil {
			continue
		}
		if rate > bestRate {
			best, bestRate = f.Id, rate
		}
	}
	if best == "" {
		t.Skipf("test-environment issue, not the behaviour under test: home system %s generated no "+
			"non-star, non-station body to hold beside", sp.homeId)
	}
	if bestRate <= space.StationKeepFloor {
		t.Logf("NOTE: every candidate host in %s clamps to space.StationKeepFloor (%v), so the value "+
			"assertion below cannot distinguish the omega-squared-times-radius rate from the floor. It "+
			"still pins the tons conversion and the host selection.", sp.homeId, space.StationKeepFloor)
	}
	return best
}

// Scenario: An orbiting fleet's read carries the rate it would pay to hold
// Scenario: A fleet with no host body carries no rate  (the burn half)
func TestUpkeepRate_Scenario_AnOrbitingFleetsReadCarriesTheRateItWouldPayToHold(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Upkeep Rate Orbit Corp")
	hostId := pickStationKeepHost(t, router, sp)
	arriveInOrbitAround(t, router, sp, hostId, 1_000_000)

	orbitKeys, orbitBody := rosterKeys(t, router, sp.token, sp.fleetId)

	// The burning arrangement is the reference: same fleet, same corporation,
	// same read endpoint, no host body.
	if _, _, code := postOrder(t, router, sp.token, sp.fleetId, pointOrder()); code != http.StatusOK {
		t.Fatalf("arranging the burning reference read: POST /orders returned %d", code)
	}
	burnKeys, _ := rosterKeys(t, router, sp.token, sp.fleetId)

	extra := extraKeys(burnKeys, orbitKeys)
	if len(extra) == 0 {
		t.Fatalf("an ORBITING fleet's read carries no field a BURNING fleet's read does not. The roster "+
			"surface must carry \"the station-keeping upkeep rate in fuel tons per second for that "+
			"fleet's host body\" for an `orbit` park (what holding WOULD cost) and nothing for a burn.\n"+
			"  orbit keys: %v\n  burn keys:  %v", orbitKeys, burnKeys)
	}
	if len(extra) > 1 {
		t.Fatalf("an orbiting fleet's read carries %d fields a burning fleet's does not (%v) — this "+
			"differential cannot identify the upkeep rate unambiguously. Only the rate should differ "+
			"between these two reads", len(extra), extra)
	}
	rateKey := extra[0]

	want := expectedUpkeepTonsPerSecond(t, sp.homeId, hostId)
	got, ok := asFloat(mustLookup(t, orbitBody, rateKey))
	if !ok {
		t.Fatalf("the orbiting fleet's %q is not a number: %v", rateKey, mustLookup(t, orbitBody, rateKey))
	}
	if math.Abs(got-want) > 1e-9*math.Max(1, math.Abs(want)) {
		t.Errorf("%s = %v, want %v — space.StationKeepRate for the fleet's host body (%s), converted to "+
			"TONS by FuelParams.DeltaVPerTon (%v), without the hull-count multiplier. The value SHALL be "+
			"served in tons, never in delta-v: DeltaVPerTon is not on the wire, and requiring a client to "+
			"apply that conversion places a rule-bearing computation on the client",
			rateKey, got, want, hostId, fleet.DefaultFuelParams().DeltaVPerTon)
	}
	// Guard against the value being served as raw delta-v (the exact mistake
	// add-stationkeep-hold-verb records being made once already, at 5x).
	if deltaV := want * fleet.DefaultFuelParams().DeltaVPerTon; math.Abs(got-deltaV) <= 1e-9*math.Max(1, deltaV) &&
		math.Abs(deltaV-want) > 1e-9 {
		t.Errorf("%s = %v, which is the raw DELTA-V rate, not the tons-per-second rate (%v). The "+
			"conversion is rule-bearing and belongs on the server", rateKey, got, want)
	}
}

// mustLookup resolves a roster field in a decoded fleet-read body.
func mustLookup(t *testing.T, body map[string]interface{}, key string) interface{} {
	t.Helper()
	roster, _ := body["roster"].(map[string]interface{})
	if v, ok := roster[key]; ok {
		return v
	}
	t.Fatalf("roster field %q is not present in the response body %v", key, body)
	return nil
}

// Scenario: A holding fleet's read carries the rate it is paying
func TestUpkeepRate_Scenario_AHoldingFleetsReadCarriesTheRateItIsPaying(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Upkeep Rate Hold Corp")
	hostId := pickStationKeepHost(t, router, sp)
	arriveInOrbitAround(t, router, sp, hostId, reserveTons(t)+100_000)

	orbitKeys, orbitBody := rosterKeys(t, router, sp.token, sp.fleetId)

	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging a station-keeping hold: POST /hold returned %d (body: %s)", w.Code, w.Body.String())
	}
	if kind := storedParkKind(t, sp.fleetId); kind != space.ParkStationkeep {
		t.Fatalf("fixture invariant: stored park kind = %v after the hold, want ParkStationkeep", kind)
	}
	holdKeys, holdBody := rosterKeys(t, router, sp.token, sp.fleetId)

	if len(extraKeys(holdKeys, orbitKeys)) != 0 || len(extraKeys(orbitKeys, holdKeys)) != 0 {
		t.Fatalf("an `orbit` park's read and a `stationkeep` park's read carry different key sets "+
			"(%v vs %v). The rate is served for BOTH — \"what the rate would cost were the player to "+
			"hold\" and \"what the hold is costing now\" — under one field", orbitKeys, holdKeys)
	}

	want := expectedUpkeepTonsPerSecond(t, sp.homeId, hostId)
	// The rate field is whichever roster key holds that value; find it by
	// value, since both arrangements carry the same key set.
	orbitRate, orbitKey := findRate(t, orbitBody, want)
	holdRate, holdKey := findRate(t, holdBody, want)
	if orbitKey == "" || holdKey == "" {
		t.Fatalf("no roster field carries the host-body-derived upkeep rate %v tons/second.\n"+
			"  orbit roster: %v\n  hold roster:  %v", want, orbitBody["roster"], holdBody["roster"])
	}
	if orbitRate != holdRate {
		t.Errorf("the orbiting read reports %v tons/second and the holding read reports %v — a hold "+
			"reports \"the same host-body-derived rate\"", orbitRate, holdRate)
	}
}

// findRate locates a roster field whose value equals want.
func findRate(t *testing.T, body map[string]interface{}, want float64) (float64, string) {
	t.Helper()
	roster, _ := body["roster"].(map[string]interface{})
	for k, v := range roster {
		if f, ok := asFloat(v); ok && math.Abs(f-want) <= 1e-9*math.Max(1, math.Abs(want)) {
			return f, k
		}
	}
	return 0, ""
}

// Scenario: A fleet with no host body carries no rate
//
// All three host-less effective states, against ONE orbiting reference read so
// "no rate" is a real absence rather than an unnamed field nobody looked for.
func TestUpkeepRate_Scenario_AFleetWithNoHostBodyCarriesNoRate(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	// The reference: a genuinely orbiting fleet, whose read DOES carry the rate.
	ref := spawnFuelCorp(t, router, "SDET Upkeep Rate Absence Reference Corp")
	refHost := pickStationKeepHost(t, router, ref)
	arriveInOrbitAround(t, router, ref, refHost, 1_000_000)
	orbitKeys, _ := rosterKeys(t, router, ref.token, ref.fleetId)

	sp := spawnFuelCorp(t, router, "SDET Upkeep Rate Absence Corp")
	arrangeStationaryPoint(t, router, sp) // Explicit scenario premise; real spawn remains station-hosted.
	setFleetFuel(t, sp.fleetId, 1_000_000)

	// The explicitly arranged point park is hostless; the genuine fresh
	// spawn above remains a station-hosted orbit until this fixture changes it.
	pointKeys, _ := rosterKeys(t, router, sp.token, sp.fleetId)

	if _, _, code := postOrder(t, router, sp.token, sp.fleetId, pointOrder()); code != http.StatusOK {
		t.Fatalf("arranging a burn: POST /orders returned %d", code)
	}
	burnKeys, _ := rosterKeys(t, router, sp.token, sp.fleetId)

	if w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cut-drive", sp.token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("arranging a drift: POST /cut-drive returned %d (body: %s)", w.Code, w.Body.String())
	}
	if mode := storedStateMode(t, sp.fleetId); mode != "drift" {
		t.Fatalf("fixture invariant: stored mode = %q after cut-drive, want \"drift\"", mode)
	}
	driftKeys, _ := rosterKeys(t, router, sp.token, sp.fleetId)

	// Whatever key the orbiting reference carries and these do not IS the rate
	// field; that it is absent from all three is the scenario.
	for label, keys := range map[string]map[string]bool{
		"a point park": pointKeys, "a burn": burnKeys, "a drift": driftKeys,
	} {
		if extra := extraKeys(keys, orbitKeys); len(extra) == 0 {
			t.Errorf("%s's read carries EVERY key an orbiting fleet's read carries — so either the "+
				"upkeep rate is served for a fleet with no host body (it must be absent), or it is "+
				"served for neither and this suite's orbit scenario is the one that is red.\n"+
				"  orbiting: %v\n  %s: %v", label, orbitKeys, label, keys)
		} else if len(extra) > 1 {
			t.Errorf("%s's read differs from an orbiting read by %d keys (%v) — only the upkeep rate "+
				"should differ", label, len(extra), extra)
		}
	}
}

// Scenario: A foreign fleet's read carries no rate
func TestUpkeepRate_Scenario_AForeignFleetsReadCarriesNoRate(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	victim := spawnFuelCorp(t, router, "SDET Upkeep Rate Foreign Victim Corp")
	hostId := pickStationKeepHost(t, router, victim)
	arriveInOrbitAround(t, router, victim, hostId, 1_000_000)

	// Positive control: the OWNER's read carries a roster surface. Without it,
	// a build that serves no roster to anyone passes this scenario trivially.
	if _, _, code := fuelGetFleet(t, router, victim.token, victim.fleetId); code != http.StatusOK {
		t.Fatalf("the owner's own read of the orbiting fleet returned %d", code)
	}

	intruder := spawnFuelCorp(t, router, "SDET Upkeep Rate Foreign Intruder Corp")
	w := doJSON(t, router, http.MethodGet, "/v1/fleets/"+victim.fleetId, intruder.token, nil, nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("a foreign corporation's read of another corp's fleet returned %d, want 404 — a foreign "+
			"fleet \"carries no roster surface at all\" (body: %s)", w.Code, w.Body.String())
	}
	var body map[string]interface{}
	_ = jsonUnmarshalLenient(w.Body.Bytes(), &body)
	if _, ok := body["roster"]; ok {
		t.Errorf("the foreign read's body carries a `roster` object: %v", body)
	}

	// The system-scoped list read is the other door onto a foreign fleet.
	var list struct {
		Fleets []map[string]interface{} `json:"fleets"`
	}
	lw := doJSON(t, router, http.MethodGet, "/v1/fleets?systemId="+victim.homeId, intruder.token, nil, &list)
	if lw.Code != http.StatusOK {
		t.Fatalf("GET /v1/fleets?systemId=%s as a foreign corp: status = %d", victim.homeId, lw.Code)
	}
	for _, f := range list.Fleets {
		if id, _ := f["id"].(string); id == victim.fleetId {
			t.Errorf("the victim's fleet appears in a foreign corporation's list read carrying %v", f)
		}
	}
}

// Scenario: Reading the rate changes nothing
func TestUpkeepRate_Scenario_ReadingTheRateChangesNothing(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Upkeep Rate Read-Only Corp")
	hostId := pickStationKeepHost(t, router, sp)
	arriveInOrbitAround(t, router, sp, hostId, reserveTons(t)+100_000)
	if w := postHold(t, router, sp.token, sp.fleetId); w.Code != http.StatusOK {
		t.Fatalf("arranging a station-keeping hold: POST /hold returned %d (body: %s)", w.Code, w.Body.String())
	}

	want := expectedUpkeepTonsPerSecond(t, sp.homeId, hostId)
	fuelBefore := fleetCargoFuel(t, sp.fleetId)
	parkBefore := storedParkValue(t, sp.fleetId)

	_, first, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("first read: status = %d", code)
	}
	_, second, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("second read: status = %d", code)
	}

	r1, k1 := findRate(t, first, want)
	r2, k2 := findRate(t, second, want)
	if k1 == "" || k2 == "" {
		t.Fatalf("no roster field carries the host-body-derived rate %v tons/second on a station-keeping "+
			"fleet's read (first: %v, second: %v)", want, first["roster"], second["roster"])
	}
	if r1 != r2 {
		t.Errorf("two reads with no command in between report different rates: %v then %v", r1, r2)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != fuelBefore {
		t.Errorf("reading the rate debited fuel: %v -> %v. \"Serving this rate SHALL NOT alter, settle, "+
			"or debit anything: it is a derived read-side figure\"", fuelBefore, got)
	}
	if got := storedParkValue(t, sp.fleetId); !sameParkValue(parkBefore, got) {
		t.Errorf("reading the rate changed the stored park:\n  before: %v\n  after:  %v", parkBefore, got)
	}
}

func sameParkValue(a, b map[string]interface{}) bool {
	if len(a) != len(b) {
		return false
	}
	for k, va := range a {
		vb, ok := b[k]
		if !ok {
			return false
		}
		if fa, oka := asFloat(va); oka {
			fb, okb := asFloat(vb)
			if !okb || fa != fb {
				return false
			}
			continue
		}
		if storedMillisAny(va) != storedMillisAny(vb) && va != vb {
			return false
		}
	}
	return true
}
