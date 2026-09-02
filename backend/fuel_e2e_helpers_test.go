package main

// Shared test-only infrastructure for the add-fuel-as-cargo red-phase e2e
// suite (backend/fuel_*_e2e_test.go). Mirrors e2e_testsupport_test.go's own
// pattern: drive the REAL, production-composed SetupRouter() against the
// real Firebase Auth + Firestore emulators, and use a DIRECT Firestore write
// only for test SETUP (seeding a fleet's starting fuel/roster before this
// change's own verbs exist to grant them) — never to fake the behavior under
// test itself.
//
// WHY DIRECT FIRESTORE WRITES FOR SETUP ARE LEGITIMATE HERE, NOT A TEST
// WEAKENING: almost every scenario in this suite needs a fleet holding some
// specific `fuel` tonnage or roster shape BEFORE the verb under test runs.
// Spawn's own starting-fuel grant (corporation-spawn task 5) is ITSELF one
// of the behaviors this suite is red against — using it to arrange fixtures
// for every other test would make most of this suite's setup depend on
// unimplemented behavior transitively, so nothing else could be exercised
// until spawn healing landed first. Seeding cargo.fuel/ships directly via
// the same Firestore project SetupRouter() reads/writes (firestoreClient(t),
// exactly as e2e_testsupport_test.go's own helpers use) decouples each
// scenario's arrangement from every other capability's implementation
// status — the ACT and ASSERT steps still exercise the real HTTP surface and
// the real transaction machinery end to end.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"
	"hexaverse/corporations"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
)

// fuelFleetDTO decodes the STABLE part of a fleet read response — the part
// this change's own contract does not touch (fleet/handler.go's fleetDTO).
// space.ShipState/space.Burn carry no json tags anywhere (fleet-movement's
// "purity" discipline), so decoding into the REAL space types, exactly as
// fleet/handler.go itself embeds them, is what makes State.Burn.Accel/
// DepartMs/ArriveMs/Length decode correctly with no hand-rolled mirror
// struct to drift out of sync.
type fuelFleetDTO struct {
	Id         string          `json:"id"`
	SystemId   string          `json:"systemId"`
	State      space.ShipState `json:"state"`
	AttachedTo string          `json:"attachedTo,omitempty"`
}

// fuelGetFleet issues one GET /v1/fleets/:id and decodes the SAME response
// body two ways: the stable typed shape above, and a generic map for probing
// this change's own NEW fields (fieldAnywhere) without presupposing their
// exact placement in the DTO.
func fuelGetFleet(t *testing.T, router http.Handler, token, fleetId string) (fuelFleetDTO, map[string]interface{}, int) {
	t.Helper()
	w := doJSON(t, router, http.MethodGet, "/v1/fleets/"+fleetId, token, nil, nil)
	var typed fuelFleetDTO
	var raw map[string]interface{}
	if w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &typed); err != nil {
			t.Fatalf("decoding fleet %s as fuelFleetDTO: %v\nbody: %s", fleetId, err, w.Body.String())
		}
		if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
			t.Fatalf("decoding fleet %s as a generic map: %v\nbody: %s", fleetId, err, w.Body.String())
		}
	}
	return typed, raw, w.Code
}

// postOrder issues POST /v1/fleets/:fleetId/orders and decodes the response
// the same two ways fuelGetFleet does (the order response is a bare
// fleetDTO — see fleet/handler.go's Order/respond — so its shape and
// decoding needs are identical to a fleet read's).
func postOrder(t *testing.T, router http.Handler, token, fleetId string, orderBody map[string]any) (fuelFleetDTO, map[string]interface{}, int) {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/orders", token, orderBody, nil)
	var typed fuelFleetDTO
	var raw map[string]interface{}
	if w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &typed); err != nil {
			t.Fatalf("decoding order response for fleet %s as fuelFleetDTO: %v\nbody: %s", fleetId, err, w.Body.String())
		}
		if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
			t.Fatalf("decoding order response for fleet %s as a generic map: %v\nbody: %s", fleetId, err, w.Body.String())
		}
	}
	return typed, raw, w.Code
}

// fuelSpawn is a freshly spawned corporation plus its one seeded hull.
type fuelSpawn struct {
	token     string
	corpId    string
	homeId    string
	fleetId   string
	stationId string
}

// spawnFuelCorp provisions a fresh account+corporation through the real HTTP
// surface and returns its token, corp id, home system id, and seeded hull's
// fleet id — everything every scenario below builds on.
func spawnFuelCorp(t *testing.T, router http.Handler, name string) fuelSpawn {
	t.Helper()
	token := mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts for %s: status = %d, body = %s", name, w.Code, w.Body.String())
	}
	var spawn struct {
		Corporation struct{ Id string } `json:"corporation"`
		Fleet       struct{ Id string } `json:"fleet"`
		HomeSystem  struct{ Id string } `json:"homeSystem"`
	}
	if w := doJSON(t, router, http.MethodPost, "/v1/corporations", token,
		map[string]any{"name": name}, &spawn); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/corporations for %s: status = %d, body = %s", name, w.Code, w.Body.String())
	}
	if spawn.HomeSystem.Id == "" || spawn.Fleet.Id == "" {
		t.Fatalf("spawn response for %s carried no home system id or fleet id: %+v", name, spawn)
	}

	fs := fuelStationFeatureId(t, router, token, spawn.HomeSystem.Id)

	return fuelSpawn{
		token: token, corpId: spawn.Corporation.Id, homeId: spawn.HomeSystem.Id,
		fleetId: spawn.Fleet.Id, stationId: fs,
	}
}

// fuelStationFeatureId reads the direct station endpoint for a freshly
// spawned corporation's own home system (always visible: spawn sets home to
// at least `explored`, clearing MinVisibilityTier — station_read_tier_scope_
// e2e_test.go pins the same read).
func fuelStationFeatureId(t *testing.T, router http.Handler, token, systemId string) string {
	t.Helper()
	var st struct {
		FeatureId string `json:"featureId"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+systemId+"/station", token, nil, &st)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s/station: status = %d, body = %s", systemId, w.Code, w.Body.String())
	}
	if st.FeatureId == "" {
		t.Fatalf("GET /v1/systems/%s/station served no featureId", systemId)
	}
	return st.FeatureId
}

// setFleetCargoFor overwrites a fleet's entire cargo map via a DIRECT
// Firestore write — test setup only (see file doc comment). Passing nil
// clears cargo to empty (mirrors fleet.CargoDebitPlan.Apply's own
// Update-not-merge discipline: a fleet with no stored Cargo reads as
// holding nothing).
func setFleetCargoFor(t *testing.T, fleetId string, cargo map[string]float64) {
	t.Helper()
	_, client := firestoreClient(t)
	if cargo == nil {
		cargo = map[string]float64{}
	}
	ref := client.Collection("fleets").Doc(fleetId)
	if _, err := ref.Update(context.Background(), []firestore.Update{
		{Path: "cargo", Value: cargo},
	}); err != nil {
		t.Fatalf("seeding fleet %s cargo = %v: %v", fleetId, cargo, err)
	}
}

// dockFleetAtStation sets a fleet's stored `attachedTo` to its home
// system's own station feature id via a DIRECT Firestore write —
// "docked" (fleet.Fleet.DockedTo, market/service.go's own dockedTo helper)
// is purely `attachedTo == featureId`, independent of the underlying
// ShipState mode, so this is a faithful, minimal fixture for "the fleet is
// docked to the selling station" that does not require first flying an
// actual burn to the station and waiting for real-world arrival.
func dockFleetAtStation(t *testing.T, sp fuelSpawn) {
	t.Helper()
	_, client := firestoreClient(t)
	ref := client.Collection("fleets").Doc(sp.fleetId)
	if _, err := ref.Update(context.Background(), []firestore.Update{
		{Path: "attachedTo", Value: sp.stationId},
	}); err != nil {
		t.Fatalf("docking fleet %s at station %s: %v", sp.fleetId, sp.stationId, err)
	}
}

// setCorpCredits overwrites a corporation's materialized credit balance via
// a DIRECT Firestore write — test setup only, sidestepping the need to know
// FuelParams.PricePerTon's configured value to arrange "definitely
// affordable" or "definitely unaffordable" fixtures.
// setCorpCredits moves a corporation's balance to EXACTLY target credits via
// a legitimate `adjustment` ledger entry (corporations.EntryAdjustment),
// never a raw Firestore overwrite of the materialized `credits` field.
//
// REVISION (SDET, cause: developer-reported defect, confirmed against the
// tree): a raw overwrite desynchronizes the materialized balance from the
// ledger's own head — every fresh corp already carries a "spawn:"-keyed
// opening-grant entry with resultingBalance=1000 (corporations/service.go's
// own spawn healing), and corporations.CreditStore.PrepareCreditInTx's O(1)
// write-time chain check (credits.go) compares the NEXT mutation's base
// balance against that entry's recorded resultingBalance — a value this
// helper's old raw write never touched. The very next credit mutation
// (a refuel) then legitimately trips ErrChainBroken, which is correct
// production behavior, not a bug: the reconciliation invariant is exactly
// what it is supposed to catch. An `adjustment` entry re-anchors on the
// ledger's own last entry rather than the stored field (credits.go's own
// "An adjustment RE-ANCHORS the balance to the ledger's own head" comment),
// so it is the one path that can legitimately move the balance without
// breaking that invariant — the same mechanism an operator would use in
// production.
func setCorpCredits(t *testing.T, corpId string, target int64) {
	t.Helper()
	current := corpCredits(t, corpId)
	delta := target - current
	if delta == 0 {
		return // a zero-amount ledger entry is itself forbidden; nothing to do
	}
	fs, _ := firestoreClient(t)
	store := corporations.NewCreditStoreWith(fs)
	opKey := "sdet-credit-adjust-" + uuid.NewString() // fresh key every call; never reused
	if _, err := store.ApplyCredit(context.Background(), corpId, opKey, corporations.LedgerEntry{
		AccountId: "sdet-fixture-adjustment",
		Kind:      corporations.EntryAdjustment,
		Amount:    delta,
	}, common.WorldClock().Now()); err != nil {
		t.Fatalf("setCorpCredits(%s, target=%d) via adjustment entry (delta=%d from current=%d): %v",
			corpId, target, delta, current, err)
	}
}

// corpCredits reads a corporation's current materialized credit balance via
// a direct Firestore read.
func corpCredits(t *testing.T, corpId string) int64 {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("corporations").Doc(corpId).Get(context.Background())
	if err != nil {
		t.Fatalf("reading corp %s: %v", corpId, err)
	}
	v, _ := snap.Data()["credits"].(int64)
	return v
}

// fleetMotionSnapshot captures a fleet's raw `state`/`attachedTo` Firestore
// fields so a test can commit a burn from a fleet's pristine position, then
// rewind it back to that exact position and try again — the only way to
// hold "starting position/velocity" constant across two commits without
// depending on two SEPARATE corporations sharing one spawn origin (they do
// not: site selection places each corp's park independently).
type fleetMotionSnapshot struct {
	state      interface{}
	attachedTo interface{}
}

// forceBurnArrivalPast rewrites a mid-burn fleet's stored arrival window
// (state.value.departMs/arriveMs — space.EncodeBurn's own field names) to a
// tiny, long-past instant via a DIRECT Firestore write, so the very next
// fleet read's opportunistic resolve (fleet.Service's settleIfDue, run by
// every GET) settles the arrival immediately — a genuine settle through the
// REAL resolver, just triggered without actually waiting out the burn's
// real, wall-clock flight duration (this suite runs WORLD_TIME_SCALE=1, so
// a station-distance burn takes real tens of seconds otherwise). This is
// setup-only time travel, not a substitute for the resolver itself: the
// resolve that runs afterward is the production BurnResolver, unmodified.
func forceBurnArrivalPast(t *testing.T, fleetId string) {
	t.Helper()
	_, client := firestoreClient(t)
	ref := client.Collection("fleets").Doc(fleetId)
	if _, err := ref.Update(context.Background(), []firestore.Update{
		{Path: "state.value.departMs", Value: int64(1)},
		{Path: "state.value.arriveMs", Value: int64(2)},
	}); err != nil {
		t.Fatalf("forcing fleet %s burn arrival into the past: %v", fleetId, err)
	}
	// The fleet's own stored burn window is only half of it: due-resolution
	// (action.Service.ResolveActive, which fleet.Service.Get calls
	// opportunistically) queries the ACTION document's own frozen `eta`
	// field (action-dispatch "commit-time ETA"), not the actor doc — so the
	// running action backing this burn must be rewound too, or the fleet
	// read above would see an "arrived" burn that ResolveActive still
	// considers not-yet-due and never actually settles.
	iter := client.Collection("actions").
		Where("actor", "==", fleetId).Where("status", "==", "running").Documents(context.Background())
	defer iter.Stop()
	doc, err := iter.Next()
	if err != nil {
		t.Fatalf("finding fleet %s's running action to rewind its eta: %v", fleetId, err)
	}
	if _, err := doc.Ref.Update(context.Background(), []firestore.Update{
		{Path: "eta", Value: int64(2)},
	}); err != nil {
		t.Fatalf("rewinding action %s eta into the past: %v", doc.Ref.ID, err)
	}
}

// setBurnArriveMsNearNow rewrites a mid-burn fleet's stored window so the
// CURRENT instant sits almost at its stored arrival — "cutting just before
// arrival" — without waiting out the real flight duration. Unlike
// forceBurnArrivalPast, arriveMs stays STRICTLY in the future (a small
// buffer past `now`, absorbing this process's own request latency) so a
// cut-drive issued immediately after still finds a live, not-yet-arrived
// burn to convert; departMs is pushed correspondingly far into the past so
// the closed-form refund fraction — (flightDuration−τ)/flightDuration,
// computed from these same stored fields — comes out correctly small
// regardless of the ORIGINAL commit's real distance/duration.
func setBurnArriveMsNearNow(t *testing.T, fleetId string) {
	t.Helper()
	_, client := firestoreClient(t)
	now := int64(common.WorldClock().Now())
	ref := client.Collection("fleets").Doc(fleetId)
	if _, err := ref.Update(context.Background(), []firestore.Update{
		{Path: "state.value.departMs", Value: now - 20_000},
		{Path: "state.value.arriveMs", Value: now + 500},
	}); err != nil {
		t.Fatalf("setting fleet %s burn arrival near now: %v", fleetId, err)
	}
}

// fuelRunningActionId reads the fleet's own single running action id via
// the real action inbox endpoint (GET /v1/actions?actor=&status=running) —
// used to exercise POST /v1/actions/:actionId/cancel, since no fleet read
// response exposes activeActionId directly (fleet/handler.go's fleetDTO
// deliberately omits it).
func fuelRunningActionId(t *testing.T, router http.Handler, sp fuelSpawn) string {
	t.Helper()
	var inbox struct {
		Actions []struct {
			Id string `json:"id"`
		} `json:"actions"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/actions?actor="+sp.fleetId+"&status=running", sp.token, nil, &inbox)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/actions?actor=%s&status=running: status = %d, body = %s", sp.fleetId, w.Code, w.Body.String())
	}
	if len(inbox.Actions) != 1 {
		t.Fatalf("expected exactly one running action for fleet %s, got %d: %+v", sp.fleetId, len(inbox.Actions), inbox.Actions)
	}
	return inbox.Actions[0].Id
}

func snapshotFleetMotion(t *testing.T, fleetId string) fleetMotionSnapshot {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("fleets").Doc(fleetId).Get(context.Background())
	if err != nil {
		t.Fatalf("snapshotting fleet %s motion: %v", fleetId, err)
	}
	data := snap.Data()
	return fleetMotionSnapshot{state: data["state"], attachedTo: data["attachedTo"]}
}

func restoreFleetMotion(t *testing.T, fleetId string, snap fleetMotionSnapshot) {
	t.Helper()
	_, client := firestoreClient(t)
	ref := client.Collection("fleets").Doc(fleetId)
	attachedTo := snap.attachedTo
	if attachedTo == nil {
		attachedTo = ""
	}
	if _, err := ref.Update(context.Background(), []firestore.Update{
		{Path: "state", Value: snap.state},
		{Path: "attachedTo", Value: attachedTo},
		{Path: "activeActionId", Value: ""},
	}); err != nil {
		t.Fatalf("restoring fleet %s motion: %v", fleetId, err)
	}
}

// setFleetFuel is the common one-kind case: cargo := {"fuel": tons}, wiping
// any other held kind (no test in this suite needs a mixed hold set up this
// way; scenarios that do build their own map via setFleetCargoFor).
func setFleetFuel(t *testing.T, fleetId string, tons float64) {
	t.Helper()
	setFleetCargoFor(t, fleetId, map[string]float64{"fuel": tons})
}

// setFleetShips overwrites a fleet's roster to n identical ClassSeed hulls —
// a direct Firestore write standing in for a roster-composition verb this
// slice does not ship (M9's SeedFleet always seeds exactly one hull, and no
// endpoint anywhere adds a second). "seed" is fleet.ClassSeed's own stored
// value (fleet/model.go); mirrored here as a literal because backend/fleet
// (a domain package) must never be imported by backend/main's own e2e suite
// package to avoid a compile-cycle-adjacent tangle — every OTHER e2e file in
// this package already imports leaf packages like hexaverse/space, never
// hexaverse/fleet itself, for the same layering reason.
func setFleetShips(t *testing.T, fleetId string, n int) {
	t.Helper()
	_, client := firestoreClient(t)
	ships := make([]map[string]any, n)
	for i := range ships {
		ships[i] = map[string]any{"class": "seed"}
	}
	ref := client.Collection("fleets").Doc(fleetId)
	if _, err := ref.Update(context.Background(), []firestore.Update{
		{Path: "ships", Value: ships},
	}); err != nil {
		t.Fatalf("seeding fleet %s ships = %d hulls: %v", fleetId, n, err)
	}
}

// fleetCargoFuel reads a fleet's CURRENT cargo.fuel tonnage via a direct
// Firestore read — used to assert a debit/credit/refund landed, independent
// of whatever shape the HTTP read response happens to carry it in.
func fleetCargoFuel(t *testing.T, fleetId string) float64 {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("fleets").Doc(fleetId).Get(context.Background())
	if err != nil {
		t.Fatalf("reading fleet %s: %v", fleetId, err)
	}
	cargo, _ := snap.Data()["cargo"].(map[string]interface{})
	v, _ := cargo["fuel"].(float64)
	return v
}

// fieldAnywhere looks for key first at the top level of body, then (if
// present and itself an object) inside body["roster"] — the owner-only
// sub-object every existing roster/cargo/derived-capacity field already
// lives under (fleet/handler.go's rosterDTO). This change's design.md does
// not pin whether estimatedRange/stranded/fuelPricePerTon nest under roster
// or sit top-level, so assertions built on this helper accept either
// placement rather than encoding an SDET guess about internal DTO shape
// that isn't actually part of the spec's contract.
func fieldAnywhere(body map[string]interface{}, key string) (interface{}, bool) {
	if v, ok := body[key]; ok {
		return v, true
	}
	if roster, ok := body["roster"].(map[string]interface{}); ok {
		if v, ok := roster[key]; ok {
			return v, true
		}
	}
	return nil, false
}

// asFloat coerces a decoded-JSON numeric value (always float64 via
// encoding/json's default map decode) to float64, for callers that already
// know fieldAnywhere found something numeric.
func asFloat(v interface{}) (float64, bool) {
	f, ok := v.(float64)
	return f, ok
}

// keySet flattens a decoded JSON body's key set — top-level keys, plus
// "roster.<key>" for anything nested one level under "roster" — used to
// diff two commit responses for an EXTRA key appearing in one but not the
// other (this change's stranding warning) without presupposing that key's
// exact name, which design.md does not pin.
func keySet(body map[string]interface{}) map[string]bool {
	out := map[string]bool{}
	for k := range body {
		out[k] = true
	}
	if roster, ok := body["roster"].(map[string]interface{}); ok {
		for k := range roster {
			out["roster."+k] = true
		}
	}
	return out
}

// extraKeys returns keys present in b but not in a.
func extraKeys(a, b map[string]bool) []string {
	var out []string
	for k := range b {
		if !a[k] {
			out = append(out, k)
		}
	}
	return out
}

// jsonUnmarshalLenient is a best-effort decode: an empty or non-JSON body
// (e.g. Gin's plain-text 404 for an unregistered route, "404 page not
// found") decodes to a zero-value out with no error, rather than failing
// the caller — this suite decodes response bodies opportunistically in
// several places where the interesting assertion is the status code, not
// the body shape, and the endpoint under test may not even exist yet.
func jsonUnmarshalLenient(data []byte, out interface{}) error {
	if len(data) == 0 {
		return nil
	}
	_ = json.Unmarshal(data, out) // errors ignored deliberately; see doc comment
	return nil
}

// ledgerEntry reads one ledger entry by operation key via a direct
// Firestore read (corporations/{corpId}/ledger/{opKey} —
// corporations/credits.go's own doc-id-is-the-operation-key scheme).
// Returns an empty map if the entry does not exist.
func ledgerEntry(t *testing.T, corpId, opKey string) map[string]interface{} {
	t.Helper()
	_, client := firestoreClient(t)
	snap, err := client.Collection("corporations").Doc(corpId).Collection("ledger").Doc(opKey).Get(context.Background())
	if err != nil {
		return map[string]interface{}{}
	}
	return snap.Data()
}

// requireRouteImplemented Fatals when a response is Gin's own generic
// unmatched-route body ("404 page not found") — the signal that an
// endpoint under test does not exist AT ALL yet, as distinct from a
// legitimate, JSON-bodied 404 rejection the route itself might return by
// design (fuel-purchase's own existence-hiding rejections are 404s with a
// real body). Without this guard, almost every "the request should be
// rejected" scenario against a not-yet-wired route would pass VACUOUSLY —
// a missing route 404s regardless of which precondition the scenario is
// actually about, so the assertion would never discriminate the real
// production behavior once the route exists.
func requireRouteImplemented(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Body.String() == "404 page not found" {
		t.Fatalf("the route is not wired at all yet (Gin's generic unmatched-route body) — this scenario " +
			"cannot be meaningfully red/green until the endpoint exists")
	}
}

// markCorpReconciliationDivergent writes a confirmed-divergence flag
// directly at corporations/{corpId}/reconciliation/state (corporations/
// credits.go's own reconState.Divergent field) — the halt every
// credit-mutating operation (a sale, and per this change's own delta, a
// refuel) must check before proceeding.
func markCorpReconciliationDivergent(t *testing.T, corpId string) {
	t.Helper()
	_, client := firestoreClient(t)
	ref := client.Collection("corporations").Doc(corpId).Collection("reconciliation").Doc("state")
	if _, err := ref.Set(context.Background(), map[string]interface{}{
		"divergent": true,
	}, firestore.MergeAll); err != nil {
		t.Fatalf("marking corp %s reconciliation divergent: %v", corpId, err)
	}
}

// deleteFuelGrantMarker removes the starting-fuel idempotency anchor at
// corporations/{corpId}/fuelGrants/{fleetId} (corporation-spawn's "Spawn
// Asset Healing") — used to simulate "a corp that predates this change's
// starting-fuel grant step" as a fixture: a REAL spawn (once implemented)
// creates this marker in the same transaction as the grant, so a corp that
// genuinely never received the grant also never has the marker. Simply
// zeroing fleetCargoFuel is NOT sufficient on its own (that is exactly the
// anti-faucet signal the marker exists to be checked INSTEAD of) — the
// marker's absence is the actual precondition this scenario needs.
func deleteFuelGrantMarker(t *testing.T, corpId, fleetId string) {
	t.Helper()
	_, client := firestoreClient(t)
	ref := client.Collection("corporations").Doc(corpId).Collection("fuelGrants").Doc(fleetId)
	if _, err := ref.Delete(context.Background()); err != nil {
		t.Fatalf("deleting fuel grant marker for corp %s fleet %s: %v", corpId, fleetId, err)
	}
}
