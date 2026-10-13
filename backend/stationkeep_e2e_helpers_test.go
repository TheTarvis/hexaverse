package main

// Shared test-only infrastructure for the add-stationkeep-hold-verb RED-PHASE
// e2e suite (backend/stationkeep_*_e2e_test.go).
//
// WHY THIS SUITE EXISTS AT ALL, given backend/fleet already carries an
// emulator-backed suite for the same verbs: this change's entire reason for
// being is that `space.StationKeepRate`, `space.StationKeepUpkeep` and
// `space.ReleaseStationkeep` were built, unit-tested, and reached by NOTHING
// (docs/plans/continous_space/decisions.md, "Correction 2026-09-02: this
// guardrail currently governs a park no player can reach"). That is the
// eighth instance of the same defect in this chain, and the handoff notes are
// explicit about why a green unit suite never caught any of them: "a green
// suite proves the unit correct while nothing in production reaches it.
// `openspec validate --strict` does not catch it, and neither does an
// end-to-end test that constructs its own request."
//
// So every scenario here drives the REAL, production-composed SetupRouter()
// with a REAL Firebase Auth emulator token, against REAL Firestore. A hold
// that is only reachable from a service method this router never calls fails
// here, by construction.
//
// TIME TRAVEL, NOT SLEEPING. Several scenarios need a hold's stored dry
// instant to be in the PAST. This suite reaches that state by rewinding the
// stored hold window (`state.value.holdStartMs` / `state.value.dryInstantMs`)
// by an equal amount — which preserves the window's own length, and therefore
// the upkeep rate the pair implies — exactly as the pre-existing
// `forceBurnArrivalPast` rewinds a burn's stored arrival. It is setup-only
// time travel, never a substitute for the settlement logic itself: the fold
// that runs afterwards is the production one, unmodified. No test in this
// suite sleeps to synchronize.
//
// The two new stored keys ("holdStartMs" / "dryInstantMs") are the SDET-pinned
// contract; see backend/space/stationkeep_dry_instant_fold_test.go for the
// reasoning and the matching Go field names.
//
// THE RESERVE IS NEVER A LITERAL HERE. `FuelParams.StationKeepReserveTons` is
// a documented placeholder whose value is an open question for Travis
// (design.md Open Questions, task 2.1). Every assertion in this suite reads it
// through reserveTons() below, so a retune changes no test.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
)

const (
	holdStartKey  = "holdStartMs"
	dryInstantKey = "dryInstantMs"
)

// postHold / postRelease drive the two new endpoints. requireRouteImplemented
// is NOT optional here: an unregistered Gin route answers 404 for every
// request, which would make every "this call must be rejected" scenario in
// this suite pass VACUOUSLY against a verb that does not exist.
func postHold(t *testing.T, router http.Handler, token, fleetId string) *httptest.ResponseRecorder {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/hold", token, map[string]any{}, nil)
	requireRouteImplemented(t, w)
	return w
}

func postRelease(t *testing.T, router http.Handler, token, fleetId string) *httptest.ResponseRecorder {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/release", token, map[string]any{}, nil)
	requireRouteImplemented(t, w)
	return w
}

// storedParkValue returns the raw stored `state.value` map for a fleet whose
// stored `state.mode` is "park" (fleet/kinematic_decode.go's discriminated
// union). Fails the test when the stored state is not a park at all, naming
// what it found instead.
func storedParkValue(t *testing.T, fleetId string) map[string]interface{} {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("fleets").Doc(fleetId).Get(context.Background())
	if err != nil {
		t.Fatalf("reading fleet %s: %v", fleetId, err)
	}
	state, _ := snap.Data()["state"].(map[string]interface{})
	mode, _ := state["mode"].(string)
	if mode != "park" {
		t.Fatalf("fleet %s's stored kinematic state is mode=%q, want \"park\" (state = %v)", fleetId, mode, state)
	}
	value, _ := state["value"].(map[string]interface{})
	if value == nil {
		t.Fatalf("fleet %s's stored park carries no value map (state = %v)", fleetId, state)
	}
	return value
}

// storedParkMode reports the fleet's stored kinematic mode ("park", "burn",
// "drift", or "" when absent) without failing — for assertions whose whole
// point is that the mode CHANGED.
func storedParkMode(t *testing.T, fleetId string) string {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("fleets").Doc(fleetId).Get(context.Background())
	if err != nil {
		t.Fatalf("reading fleet %s: %v", fleetId, err)
	}
	state, _ := snap.Data()["state"].(map[string]interface{})
	mode, _ := state["mode"].(string)
	return mode
}

// storedParkKind returns the stored park's ParkKind.
func storedParkKind(t *testing.T, fleetId string) space.ParkKind {
	t.Helper()
	v := storedParkValue(t, fleetId)
	n, ok := v["kind"].(int64)
	if !ok {
		f, isFloat := v["kind"].(float64)
		if !isFloat {
			t.Fatalf("fleet %s's stored park has a non-numeric kind %v (%T)", fleetId, v["kind"], v["kind"])
		}
		n = int64(f)
	}
	return space.ParkKind(n)
}

// holdWindow reads the stored hold-start / dry-instant pair off a
// station-keeping park. A missing key is a FAILURE, not a zero: this change's
// whole persisted-state delta is these two fields, and silently reading zeros
// would let every downstream arithmetic assertion pass vacuously.
func holdWindow(t *testing.T, fleetId string) (holdStart, dryInstant int64) {
	t.Helper()
	v := storedParkValue(t, fleetId)
	holdStart = requireStoredMillis(t, fleetId, v, holdStartKey)
	dryInstant = requireStoredMillis(t, fleetId, v, dryInstantKey)
	if !(dryInstant > holdStart) {
		t.Fatalf("fleet %s's stored hold window is holdStart=%d dryInstant=%d — space-kinematics requires the "+
			"dry instant STRICTLY after the hold start (\"A station-keep park with a missing or invalid dry "+
			"instant fails to decode\"); this park is undecodable and would brick the fleet",
			fleetId, holdStart, dryInstant)
	}
	return holdStart, dryInstant
}

func requireStoredMillis(t *testing.T, fleetId string, v map[string]interface{}, key string) int64 {
	t.Helper()
	raw, present := v[key]
	if !present || raw == nil {
		t.Fatalf("fleet %s's stored station-keeping park carries no %q. space-kinematics: \"A `stationkeep` "+
			"park SHALL additionally store the world time its hold began and a dry instant\" — without both, "+
			"nothing downstream can settle the hold. Stored park: %v", fleetId, key, v)
	}
	switch n := raw.(type) {
	case int64:
		return n
	case float64:
		return int64(n)
	default:
		t.Fatalf("fleet %s's stored %q is %v (%T), want an integer world-millisecond value", fleetId, key, raw, raw)
		return 0
	}
}

// rewindHoldWindow moves BOTH stored hold-window stamps back by deltaMs,
// leaving the window's length — and therefore the upkeep rate the pair
// implies — exactly unchanged. See the file header for why this is legitimate
// setup rather than a weakening.
func rewindHoldWindow(t *testing.T, fleetId string, deltaMs int64) {
	t.Helper()
	holdStart, dryInstant := holdWindow(t, fleetId)
	_, client := firestoreClient(t)
	if _, err := client.Collection("fleets").Doc(fleetId).Update(context.Background(), []firestore.Update{
		{Path: "state.value." + holdStartKey, Value: holdStart - deltaMs},
		{Path: "state.value." + dryInstantKey, Value: dryInstant - deltaMs},
	}); err != nil {
		t.Fatalf("rewinding fleet %s's hold window by %d ms: %v", fleetId, deltaMs, err)
	}
}

// rewindHoldWindowPastDryInstant rewinds a fleet's stored hold so that its dry
// instant sits `marginMs` in the PAST relative to the instant of the call.
func rewindHoldWindowPastDryInstant(t *testing.T, fleetId string, marginMs int64) {
	t.Helper()
	_, dryInstant := holdWindow(t, fleetId)
	rewindHoldWindow(t, fleetId, (dryInstant-worldNow())+marginMs)
}

// arriveInOrbitAround flies the fleet to a real body and time-travels the
// arrival into the past, so the production BurnResolver genuinely settles it
// into a `ParkOrbit` attached to that body — the exact effective state `hold`
// requires. Restores `fuelTons` afterwards, since the burn's own commit
// debited some.
func arriveInOrbitAround(t *testing.T, router http.Handler, sp fuelSpawn, bodyId string, fuelTons float64) {
	t.Helper()
	// Reuse an already-established matching free orbit. This setup helper promises
	// an orbit, not an unnecessary burn back to the station spawn already occupies.
	current, _, status := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if status != http.StatusOK {
		t.Fatalf("orbit fixture initial read: %d", status)
	}
	if current.AttachedTo == bodyId && current.State.Mode == space.ModeParked && current.State.Park != nil && current.State.Park.Kind == space.ParkOrbit && current.State.Park.BodyId == bodyId {
		requireNoActiveMovementAction(t, sp.fleetId)
		setFleetFuel(t, sp.fleetId, fuelTons)
		return
	}

	setFleetFuel(t, sp.fleetId, 5_000_000)
	orderResp, _, code := postOrder(t, router, sp.token, sp.fleetId, map[string]any{"bodyId": bodyId})
	if code != http.StatusOK || orderResp.State.Burn == nil {
		// DIAGNOSIS CORRECTED by openspec change fix-burn-order-geometry-refusals
		// (task 4.2). The original note here (2026-09-02) blamed only the
		// DESTINATION and claimed "SeedFleet already refuses to place a fleet
		// inside the clearance, so the ORIGIN endpoint is never the guilty one".
		// Both halves were wrong:
		//
		//   - Either endpoint can be the guilty one. space.ErrEndpointInsideClearance
		//     is raised when the burn's ORIGIN or its solved intercept (for a body
		//     target, the insertion-standoff point) is at or inside 2.5 x starSize.
		//     A fleet parked in orbit around a station is inside the clearance at
		//     some orbital phases whenever the station's shell (its parent's orbit
		//     radius less the station's orbit radius less the insertion standoff)
		//     reaches the clearance — and SeedFleet's placement guard says nothing
		//     about where the fleet stands after it has since moved and parked.
		//   - The cause is the HOME SITE, not intermittence: a home whose station
		//     shell reaches the clearance (a ring-0 parent, or a tight ring-1/2
		//     parent under a large star) is refused at some phases and not others.
		//     Home-site criterion (d) now keeps such systems from being chosen.
		//
		// What the refusal looks like: before this change a bodyless 500 (the
		// sentinel escaped OrderTo into respond's default arm); now a 409 whose
		// `error` names the origin or the destination ("burn origin is at or
		// inside the star-clearance radius" / "burn destination is at or inside
		// ..."), or a 404 for an absent body id. A geometry refusal at a home that
		// qualified under criterion (d) means criterion (d) is the suspect.
		t.Fatalf("arranging an orbit park: POST /orders {bodyId:%q} returned %d (burn=%v). If this is a 500, "+
			"see the comment above: a 409 naming the origin or the destination is a star-clearance "+
			"refusal at this home (suspect: home-site criterion (d)); a bodyless 5xx is a different fault. "+
			"Not this fixture", bodyId, code, orderResp.State.Burn)
	}
	forceBurnArrivalPast(t, sp.fleetId)
	typed, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK {
		t.Fatalf("reading the fleet after its forced arrival: status = %d", code)
	}
	if typed.State.Park == nil || typed.State.Park.Kind != space.ParkOrbit {
		t.Fatalf("the forced arrival did not settle into an orbit park (state = %+v) — the fixture is broken, "+
			"not the behaviour under test", typed.State)
	}
	if typed.AttachedTo != bodyId {
		t.Fatalf("the forced arrival left attachedTo = %q, want %q", typed.AttachedTo, bodyId)
	}
	setFleetFuel(t, sp.fleetId, fuelTons)
}

// pickOrbitingNonStationBody names a real, orbiting, non-star body in the
// system that is NOT the home station — needed by every scenario whose
// assertion turns on the fleet being somewhere a zero-fuel burn cannot reach
// (a fleet parked AT its own station always reads as reachable, via
// space.ErrArcTooShort).
func pickOrbitingNonStationBody(t *testing.T, router http.Handler, sp fuelSpawn) string {
	t.Helper()
	var interior struct {
		Features []struct {
			Id        string `json:"id"`
			Type      string `json:"type"`
			Resources []struct {
				Kind string `json:"kind"`
			} `json:"resources"`
		} `json:"features"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+sp.homeId, sp.token, nil, &interior)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", sp.homeId, w.Code, w.Body.String())
	}
	for _, f := range interior.Features {
		if f.Type == "star" || f.Id == sp.stationId {
			continue
		}
		return f.Id
	}
	t.Skipf("home system %s generated no non-star, non-station body to hold beside", sp.homeId)
	return ""
}

// pickMineableFeature names a real feature in the system carrying at least one
// resource kind, returning the feature id and that kind.
func pickMineableFeature(t *testing.T, router http.Handler, sp fuelSpawn) (featureId, kind string) {
	t.Helper()
	var interior struct {
		Features []struct {
			Id        string `json:"id"`
			Type      string `json:"type"`
			Resources []struct {
				Kind string `json:"kind"`
			} `json:"resources"`
		} `json:"features"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+sp.homeId, sp.token, nil, &interior)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", sp.homeId, w.Code, w.Body.String())
	}
	for _, f := range interior.Features {
		if f.Id == sp.stationId || len(f.Resources) == 0 {
			continue
		}
		return f.Id, f.Resources[0].Kind
	}
	t.Skipf("home system %s generated no mineable feature", sp.homeId)
	return "", ""
}

// worldNow reads the SAME process-wide world clock SetupRouter()'s services
// use, so a test-computed instant and a production-stamped one are on one
// timeline.
func worldNow() int64 {
	return int64(common.WorldClock().Now())
}

// forceActionEtaPast rewinds a fleet's single running action's frozen ETA into
// the past, so the next resolve pass (GET /v1/systems/:id runs ResolveDue for
// the whole system — system/handler.go) settles it immediately, instead of
// this suite waiting out a real ETA. The resolver that then runs is the
// production one, unmodified.
func forceActionEtaPast(t *testing.T, fleetId string) {
	t.Helper()
	_, client := firestoreClient(t)
	iter := client.Collection("actions").
		Where("actor", "==", fleetId).Where("status", "==", "running").Documents(context.Background())
	defer iter.Stop()
	doc, err := iter.Next()
	if err != nil {
		t.Fatalf("finding fleet %s's running action to rewind its eta: %v", fleetId, err)
	}
	if _, err := doc.Ref.Update(context.Background(), []firestore.Update{{Path: "eta", Value: int64(2)}}); err != nil {
		t.Fatalf("rewinding action %s eta into the past: %v", doc.Ref.ID, err)
	}
}

// resolveDueActionsInSystem drives the production resolve trigger every read
// already runs — GET /v1/systems/:id calls action.ResolveDue(systemId) — so a
// due mine run settles through its real resolver.
func resolveDueActionsInSystem(t *testing.T, router http.Handler, sp fuelSpawn) {
	t.Helper()
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+sp.homeId, sp.token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s (the production resolve trigger): status = %d", sp.homeId, w.Code)
	}
}

// readAction fetches one action through the real inbox endpoint.
func readAction(t *testing.T, router http.Handler, token, actionId string) map[string]interface{} {
	t.Helper()
	w := doJSON(t, router, http.MethodGet, "/v1/actions/"+actionId, token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/actions/%s: status = %d, body = %s", actionId, w.Code, w.Body.String())
	}
	var out map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decoding action %s: %v", actionId, err)
	}
	return out
}

// fleetCargoKind reads one cargo kind's stored tonnage.
func fleetCargoKind(t *testing.T, fleetId, kind string) float64 {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("fleets").Doc(fleetId).Get(context.Background())
	if err != nil {
		t.Fatalf("reading fleet %s: %v", fleetId, err)
	}
	cargo, _ := snap.Data()["cargo"].(map[string]interface{})
	v, _ := cargo[kind].(float64)
	return v
}

// reserveTons is the configured station-keeping reserve, read from the same
// tuning source production reads — never a literal at a call site.
// fleet-movement "Station-Keeping Upkeep Never Drains a Fleet Below Its
// Reserve": "a named tuning constant, not a literal at any call site".
func reserveTons(t *testing.T) float64 {
	t.Helper()
	r := fleet.DefaultFuelParams().StationKeepReserveTons
	if !(r > 0) {
		t.Fatalf("fleet.DefaultFuelParams().StationKeepReserveTons = %v, want a \"configured, STRICTLY "+
			"POSITIVE station-keeping reserve\" — a zero reserve settles an exhausted hold to zero, the "+
			"passive stranding decisions.md (2026-08-29) forbids", r)
	}
	return r
}

// postStop / postJump drive the two hold-ending verbs whose settlement this
// change adds. requireRouteImplemented guards the same vacuity as postHold's.
func postStop(t *testing.T, router http.Handler, token, fleetId string) *httptest.ResponseRecorder {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/stop", token, map[string]any{}, nil)
	requireRouteImplemented(t, w)
	return w
}

func postJump(t *testing.T, router http.Handler, token, fleetId, laneId string) *httptest.ResponseRecorder {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/jump", token,
		map[string]any{"laneId": laneId}, nil)
	requireRouteImplemented(t, w)
	return w
}

// storedFleetDoc returns a fleet's raw stored document — the ONLY surface
// several scenarios in this suite may assert against, because the defects
// they exist to catch (task 4.5's stop branch, the in-memory-only settlement)
// are invisible in the handler's response body.
func storedFleetDoc(t *testing.T, fleetId string) map[string]interface{} {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("fleets").Doc(fleetId).Get(context.Background())
	if err != nil {
		t.Fatalf("reading fleet %s: %v", fleetId, err)
	}
	return snap.Data()
}

// storedMillisAny coerces a Firestore numeric to int64. asFloat alone is not
// enough: Firestore returns integers as int64, so a float64-only coercion
// reads every stored world-millisecond stamp as ZERO — which would make
// several "did this change?" assertions in this suite compare 0 against 0 and
// report a failure (or a pass) that has nothing to do with the behaviour
// under test.
func storedMillisAny(v interface{}) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	default:
		return 0
	}
}

// storedUpdatedAt reads a fleet's persisted updatedAt stamp.
func storedUpdatedAt(t *testing.T, fleetId string) int64 {
	t.Helper()
	return storedMillisAny(storedFleetDoc(t, fleetId)["updatedAt"])
}

// storedAttachedToDoc reads a fleet's persisted attachedTo straight from
// Firestore (never from the handler's response).
func storedAttachedToDoc(t *testing.T, fleetId string) string {
	t.Helper()
	v, _ := storedFleetDoc(t, fleetId)["attachedTo"].(string)
	return v
}

// runningActionCount counts a fleet's running actions straight from
// Firestore — used by the fixtures whose whole point is that the fleet has
// NO active movement action (task 7.16).
func runningActionCount(t *testing.T, fleetId string) int {
	t.Helper()
	_, client := firestoreClient(t)
	iter := client.Collection("actions").
		Where("actor", "==", fleetId).Where("status", "==", "running").Documents(context.Background())
	defer iter.Stop()
	n := 0
	for {
		if _, err := iter.Next(); err != nil {
			return n
		}
		n++
	}
}

// requireNoActiveMovementAction is the anti-vacuity guard tasks 4.5 and 7.16
// spell out: "The stop fixture MUST use a fleet with no active movement
// action ... A fixture with an active action — e.g. a mining fleet — passes
// against an implementation that carries the settlement on actions.Cancel's
// cancelState and writes nothing at all for the gate camper, which is the
// exact defect."
func requireNoActiveMovementAction(t *testing.T, fleetId string) {
	t.Helper()
	doc := storedFleetDoc(t, fleetId)
	if id, _ := doc["activeActionId"].(string); id != "" {
		t.Fatalf("fixture invariant violated: fleet %s carries an active movement action (%q). This fixture "+
			"MUST have none — an active action restores stop's `actions.Cancel(...)` write and makes the "+
			"assertions below pass against exactly the unfixed code they exist to catch (task 7.16).",
			fleetId, id)
	}
	if n := runningActionCount(t, fleetId); n != 0 {
		t.Fatalf("fixture invariant violated: fleet %s has %d running action(s); this fixture must have none",
			fleetId, n)
	}
}

// gateBodyIdFor names a real lane-gate body in the spawn's home system, and
// the lane it serves. Read through galaxy.Service.LanesOf — the UNFOGGED
// source router_fleet_ownership_e2e_test.go already uses for the same
// arrangement — because a fresh spawn charts no lanes at all
// (corporation-spawn's RevealArrival writes home `explored` only), so the
// fog-filtered /v1/galaxy read would serve none.
//
// Gates are motionless (system.gateOrbit gives every gate PeriodMs = 0),
// which is what makes a station-keeping fleet beside one take stop's free,
// below-the-speed-floor branch — "a fleet holding at a lane gate ALWAYS takes
// it: a stationkeep park's velocity is its host body's, and system.gateOrbit
// gives every gate PeriodMs = 0, so that velocity is exactly zero" (task 4.5).
func gateBodyIdFor(t *testing.T, sp fuelSpawn) (gateBodyId, laneId string) {
	t.Helper()
	fs, _ := firestoreClient(t)
	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), common.WorldClock())
	lanes, err := gsvc.LanesOf(context.Background(), sp.homeId)
	if err != nil {
		t.Fatalf("galaxy.LanesOf(%s): %v", sp.homeId, err)
	}
	if len(lanes) == 0 {
		t.Skipf("test-environment issue, not the behaviour under test: home system %s has no incident lanes, "+
			"so there is no motionless gate to camp", sp.homeId)
	}
	return "gate-" + lanes[0].OtherSystemId, lanes[0].LaneId
}

// holdWindowIfAny reads the stored hold-window pair WITHOUT failing when the
// park carries none — for assertions whose whole point is that a released
// orbit park carries no hold-start time and no dry instant.
func holdWindowIfAny(t *testing.T, fleetId string) (holdStart, dryInstant int64) {
	t.Helper()
	state, _ := storedFleetDoc(t, fleetId)["state"].(map[string]interface{})
	value, _ := state["value"].(map[string]interface{})
	if value == nil {
		return 0, 0
	}
	return storedMillisAny(value[holdStartKey]), storedMillisAny(value[dryInstantKey])
}

// --- goroutine-safe request helpers ----------------------------------------
//
// t.Fatalf from a non-test goroutine is illegal (it calls runtime.Goexit on
// the wrong goroutine), so the concurrency scenarios must NOT use postHold /
// postRelease / fuelGetFleet, all of which can Fatalf. These raw variants
// only ever call doJSON with a nil `out`, which cannot fail, and return the
// recorder for the main goroutine to assert on — the same discipline
// fuel_action_dispatch_race_e2e_test.go already follows.
func rawPost(t *testing.T, router http.Handler, token, path string, body map[string]any) *httptest.ResponseRecorder {
	return doJSON(t, router, http.MethodPost, path, token, body, nil)
}

func rawGet(t *testing.T, router http.Handler, token, path string) *httptest.ResponseRecorder {
	return doJSON(t, router, http.MethodGet, path, token, nil, nil)
}
