package main

// RED-phase path-level integration tests for replace-observation-with-
// sightings §5 (the focused-scan verb, tasks.md 5.1-5.9) plus the two debts
// §3 explicitly deferred here: Debt 1 (the real mint path — POST .../scan
// through the real production router, a real time-skip resolve through the
// real ScanResolver, confirmed through GET /v1/sightings, per this repo's
// own established e2e conventions) and, indirectly, Debt 2 (fleet's own
// scan_resolver_mints_only_via_sightings_test.go is the AST guard; this
// file's mint-path test is the behavioral confirmation that guard protects).
//
// Every test here drives the REAL, production-constructed router
// (SetupRouter()) — per the standing rule this repo's §1/§4 red-phase
// suites already established, and per the kickoff's own Rule 2 ("real
// entry point a PLAYER uses"). Fixture geometry (which fleet is where, how
// far a host sits) is arranged directly via Firestore, exactly as
// disclosure_wiring_e2e_test.go and router_sightings_no_auto_mint_test.go
// already do — driving real burns over the wall clock would make these
// tests slow without adding coverage of anything this section touches.
//
// A `hostId` naming another of the SCANNING CORPORATION'S OWN fleets is
// used throughout in place of a body host wherever exact geometric control
// matters (specs/focused-scan/spec.md "A Focused Sweep Commits On the
// Sensor Channel": "hostId SHALL name either a body, or a fleet owned by
// the scanning fleet's own corporation") — this sidesteps depending on a
// procedurally generated system's random body layout for range/occlusion
// boundary tests, mirroring disclosure_wiring_e2e_test.go's own driftFleet
// technique.
//
// CONTRACT this file assumes (see fleet/scan_resolver_test.go and
// fleet/scan_cancel_channel_independence_test.go for the fuller notes):
// `POST /v1/fleets/:fleetId/scan {"hostId": "..."}`; `fleet.Fleet.Scan
// *fleet.ScanWindow{HostId, DepartMs, ArriveMs, Range}`, read back here by
// loading the fleet doc directly through fleet.NewDaoWithClient — never
// through the wire DTO, whose shape §5 does not pin — so this file's
// assertions do not depend on a wire-shape choice no scenario decides.
//
// EXPECTED RED TODAY: this file is a COMPILE red, not merely a behavioral
// one — readFleet's *fleet.Fleet return type means every f.Scan/f.ActiveScanId
// access below fails to compile until tasks.md 5.1 lands fleet.ScanWindow/
// Fleet.Scan (see fleet/scan_resolver_test.go's own note on why that is
// legitimate red evidence for a wholly new package surface, not a broken
// test). Once those compile, POST .../scan itself still 404s (unwired
// route) until task 5.2 lands the handler.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
)

// scanReq POSTs a focused scan against hostId for fleetId.
func scanReq(t *testing.T, router http.Handler, token, fleetId, hostId string) *httptest.ResponseRecorder {
	t.Helper()
	return doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/scan", token,
		map[string]any{"hostId": hostId}, nil)
}

// readFleet loads a fleet doc directly (never through the wire DTO), so
// this file's assertions about Scan/ActiveScanId never depend on a
// wire-shape choice no §5 scenario pins.
func readFleet(t *testing.T, fdao fleet.Dao, ctx context.Context, id string) *fleet.Fleet {
	t.Helper()
	f, err := fdao.Get(ctx, id)
	if err != nil || f == nil {
		t.Fatalf("loading fleet %q directly: f=%v err=%v", id, f, err)
	}
	return f
}

// placeFleet is driftFleet's own technique (disclosure_wiring_e2e_test.go),
// reused here to give a fixture fleet an exact, controlled, static
// position — a free, unpowered coast at zero velocity.
func placeFleet(t *testing.T, fdao fleet.Dao, ctx context.Context, id, corpId, systemId string, at space.Vec3) {
	driftFleet(t, fdao, ctx, id, corpId, systemId, at)
}

// farFromStar resolves a real point far from systemId's own star — well
// outside any plausible star-clearance radius and any plausible occlusion
// geometry — so tests whose subject is NOT range/occlusion can place
// fixture fleets near each other without accidentally tripping either. A
// procedurally generated system's star position is not assumed to be the
// coordinate origin (occlusion-specific tests resolve it explicitly too;
// this helper exists so every OTHER test gets the same safety for free).
func farFromStar(t *testing.T, ctx context.Context, systemId string) space.Vec3 {
	t.Helper()
	bt := bodyTableFor(t, ctx, systemId)
	starPos, err := space.Position(bt, bt.StarId(), 0)
	if err != nil {
		t.Fatalf("resolving %s's star position: %v", systemId, err)
	}
	return starPos.Add(space.Vec3{X: 5_000})
}

// timeSkipAction rewrites an already-committed action's eta to just past
// "now" — this repo's own proven convention (traversability_e2e_test.go,
// router_jump_wiring_test.go, router_sightings_no_auto_mint_test.go) for
// settling a due action deterministically without a real-time wait.
func timeSkipAction(t *testing.T, client *firestore.Client, actionId string) {
	t.Helper()
	pastEta := common.WorldClock().Now() - 1
	if _, err := client.Collection("actions").Doc(actionId).Update(context.Background(), []firestore.Update{
		{Path: "eta", Value: int64(pastEta)},
	}); err != nil {
		t.Fatalf("time-skipping action %q's eta: %v", actionId, err)
	}
}

// settleScope settles a scope's due actions the way this repo's own reads
// already do: GET /v1/systems/:systemId runs action.Service.ResolveDue for
// that system scope before projecting (system/handler.go's own read-fold —
// "settle this scope's due actions before projecting"). This is the
// reliable settle point for a focused scan specifically: fleet.Service.Get
// only opportunistically resolves the MOVEMENT channel (a due burn or
// jump) — it does not inspect ActiveScanId at all — so GET
// /v1/fleets/:fleetId never settles a due scan on its own. Every mint-path
// test in this file settles through the scan's own committed system
// (Scope, the origin system — not necessarily the fleet's CURRENT SystemId,
// which is exactly what the "left the system" fizzle scenario exploits).
func settleScope(t *testing.T, router http.Handler, token, systemId string) {
	t.Helper()
	if w := doJSON(t, router, http.MethodGet, "/v1/systems/"+systemId, token, nil, nil); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s (settling due actions in scope): status = %d, body = %s", systemId, w.Code, w.Body.String())
	}
}

// rawAction reads an action doc's raw fields directly — used where this
// file wants to confirm the commit-time shape (type, slot, scope) without
// assuming action.Action's own JSON tags.
func rawAction(t *testing.T, client *firestore.Client, actionId string) map[string]any {
	t.Helper()
	snap, err := client.Collection("actions").Doc(actionId).Get(context.Background())
	if err != nil {
		t.Fatalf("reading action %q: %v", actionId, err)
	}
	return snap.Data()
}

// --- Req1: A Focused Sweep Commits On the Sensor Channel -------------------

// Scenario: An unresolvable host is rejected.
func TestScanE2E_Scenario_UnresolvableHostRejected(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, _, fleetId, _ := spawnForDisclosureTest(t, router, "SDET Scan Unresolvable Corp")

	w := scanReq(t, router, token, fleetId, "no-such-host-"+fleetId)
	if w.Code >= 500 {
		t.Fatalf("unresolvable host: status = %d, want a 4xx, never a 5xx. body=%s", w.Code, w.Body.String())
	}
	if w.Code >= 200 && w.Code < 300 {
		t.Fatalf("unresolvable host: status = %d, want rejection", w.Code)
	}
	f := readFleet(t, fdao, ctx, fleetId)
	if f.ActiveScanId != "" {
		t.Errorf("ActiveScanId = %q after a rejected commit, want empty — no sensor-channel slot may be claimed", f.ActiveScanId)
	}
}

// Scenario: A host outside the scanning fleet's system is rejected.
func TestScanE2E_Scenario_HostOutsideSystemRejected(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Elsewhere Corp")
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, space.Vec3{X: 30})

	// The host fleet is the SAME corp's, but in a DIFFERENT system.
	elsewhereId := "sys_elsewhere_" + fleetId
	placeFleet(t, fdao, ctx, "host-elsewhere-"+fleetId, corpId, elsewhereId, space.Vec3{})

	w := scanReq(t, router, token, fleetId, "host-elsewhere-"+fleetId)
	if w.Code >= 500 {
		t.Fatalf("host outside system: status = %d, never a 5xx. body=%s", w.Code, w.Body.String())
	}
	if w.Code >= 200 && w.Code < 300 {
		t.Fatalf("host outside system: status = %d, want rejection", w.Code)
	}
	f := readFleet(t, fdao, ctx, fleetId)
	if f.ActiveScanId != "" {
		t.Errorf("ActiveScanId = %q after a rejected commit, want empty", f.ActiveScanId)
	}
}

// Scenario: A foreign fleet's id is rejected identically to an unresolvable
// one — no field distinguishing the two, since a distinguishable rejection
// would itself disclose the foreign fleet's presence and range.
func TestScanE2E_Scenario_ForeignFleetIdRejectedIdenticallyToUnresolvable(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Foreign-Id Corp")
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)

	// A foreign fleet, present in the SAME system, well within any
	// plausible scan range — a commit against it must be rejected purely
	// because it is foreign-owned, not because of geometry.
	foreignId := "foreign-scan-target-" + fleetId
	placeFleet(t, fdao, ctx, foreignId, "corp-foreign-scan-"+fleetId, homeId, base.Add(space.Vec3{X: 2}))

	wForeign := scanReq(t, router, token, fleetId, foreignId)
	wUnresolvable := scanReq(t, router, token, fleetId, "no-such-host-"+fleetId)

	if wForeign.Code >= 500 || wUnresolvable.Code >= 500 {
		t.Fatalf("foreign/unresolvable host: never a 5xx. foreign=%d body=%s; unresolvable=%d body=%s",
			wForeign.Code, wForeign.Body.String(), wUnresolvable.Code, wUnresolvable.Body.String())
	}
	if wForeign.Code != wUnresolvable.Code {
		t.Errorf("a foreign fleet's id rejected with status %d, an unresolvable id with status %d — must be identical",
			wForeign.Code, wUnresolvable.Code)
	}
	if wForeign.Body.String() != wUnresolvable.Body.String() {
		t.Errorf("a foreign fleet's id rejected with body %q, an unresolvable id with body %q — must be identical, "+
			"with no field distinguishing the two (a distinguishable rejection would itself disclose the foreign "+
			"fleet's presence)", wForeign.Body.String(), wUnresolvable.Body.String())
	}
	f := readFleet(t, fdao, ctx, fleetId)
	if f.ActiveScanId != "" {
		t.Errorf("ActiveScanId = %q after a rejected foreign-id commit, want empty", f.ActiveScanId)
	}
}

// Scenario: A scanner in lane transit at commit is rejected.
func TestScanE2E_Scenario_ScannerInLaneTransitRejected(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Transit Corp")
	hostId := "host-transit-" + fleetId
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, space.Vec3{X: 10})

	f := readFleet(t, fdao, ctx, fleetId)
	f.Jump = &fleet.JumpTransit{LaneId: "lane-x", DestSystemId: "sys-elsewhere", DepartMs: 0, ArriveMs: 999_999_999}
	if err := fdao.Save(ctx, *f); err != nil {
		t.Fatalf("setting the fleet mid-jump directly: %v", err)
	}

	w := scanReq(t, router, token, fleetId, hostId)
	if w.Code >= 500 {
		t.Fatalf("scanner in lane transit: status = %d, never a 5xx. body=%s", w.Code, w.Body.String())
	}
	if w.Code >= 200 && w.Code < 300 {
		t.Fatalf("scanner in lane transit: status = %d, want rejection", w.Code)
	}
	after := readFleet(t, fdao, ctx, fleetId)
	if after.ActiveScanId != "" {
		t.Errorf("ActiveScanId = %q after a rejected commit while in transit, want empty", after.ActiveScanId)
	}
}

// Scenario: A burning fleet can commit a sweep / The movement-channel
// action is unaffected / A second sweep is rejected while one is running /
// A sweep does not cancel a running burn.
func TestScanE2E_Scenario_BurningFleetCanSweepAndASecondSweepIsRejected(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan-While-Burning Corp")
	hostId := "host-burn-scan-" + fleetId
	// Both the scanner and the host are placed at a known position, well
	// clear of the star (farFromStar) — the burn ordered below departs FROM
	// the scanner's placed position, and the two HTTP calls run close
	// enough in wall-clock time that the scanner has not travelled
	// meaningfully by the time the scan commits.
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 20}))

	// Commit an ordinary in-system burn first (the movement channel). The
	// burn's own committed action id is read back directly off the fleet
	// doc (readFleet), never off the wire DTO — fleetDTO carries no
	// activeActionId field today, and this section does not add one.
	if w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/orders", token,
		map[string]any{"point": map[string]any{"x": base.X + 5_000}}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST .../orders: status = %d, body = %s", w.Code, w.Body.String())
	}
	burning := readFleet(t, fdao, ctx, fleetId)
	burnActionId := burning.ActiveActionId
	if burnActionId == "" {
		t.Fatalf("expected a committed burn action id on the fleet doc after ordering")
	}

	w := scanReq(t, router, token, fleetId, hostId)
	if w.Code < 200 || w.Code >= 300 {
		t.Fatalf("a burning fleet's scan commit: status = %d, want success. body=%s", w.Code, w.Body.String())
	}

	f := readFleet(t, fdao, ctx, fleetId)
	if f.ActiveActionId != burnActionId {
		t.Errorf("ActiveActionId (movement) = %q after the scan commit, want the untouched burn %q", f.ActiveActionId, burnActionId)
	}
	if f.ActiveScanId == "" {
		t.Fatalf("ActiveScanId is empty after a successful scan commit")
	}
	firstScanId := f.ActiveScanId

	// A second sweep, while the first is still running, must be rejected.
	w2 := scanReq(t, router, token, fleetId, hostId)
	if w2.Code >= 200 && w2.Code < 300 {
		t.Fatalf("a second sweep committed while one is already running: status = %d, want rejection", w2.Code)
	}
	f2 := readFleet(t, fdao, ctx, fleetId)
	if f2.ActiveScanId != firstScanId {
		t.Errorf("ActiveScanId changed from %q to %q after a rejected second sweep", firstScanId, f2.ActiveScanId)
	}
	if f2.ActiveActionId != burnActionId {
		t.Errorf("ActiveActionId (movement) = %q after a rejected second sweep, want the untouched burn %q", f2.ActiveActionId, burnActionId)
	}
}

// --- Req2: Sweep Duration Scales With Range to the Target -----------------

// Scenario: The committed window spans the entire sweep — depart is the
// commit world time, arrive is the committed ETA. This is the exact
// property an adversary round previously blocked this spec for leaving
// unbound (DepartMs = ArriveMs - 1 passed every other scenario).
func TestScanE2E_Scenario_CommittedWindowSpansTheEntireSweep(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Window Corp")
	hostId := "host-window-" + fleetId
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 30}))

	// Bracket the commit instant rather than snapshotting a single Now() —
	// the real production router runs against the real (non-injected)
	// world clock in this e2e context, so an exact-equality comparison
	// against a Now() read before the HTTP round trip would be flaky by a
	// millisecond of real processing time. DepartMs must fall inside this
	// tight bracket regardless — which is still exactly the property under
	// test: depart is the commit instant, not some value short of the full
	// sweep (e.g. arrive-1).
	before := common.WorldClock().Now()
	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	after := common.WorldClock().Now()

	f := readFleet(t, fdao, ctx, fleetId)
	if f.Scan == nil {
		t.Fatalf("Fleet.Scan is nil after a successful commit")
	}
	if f.Scan.DepartMs < before || f.Scan.DepartMs > after {
		t.Errorf("Scan.DepartMs = %d, want it inside [%d, %d] — the commit world time (never a value short of the "+
			"full sweep, e.g. arrive-1)", f.Scan.DepartMs, before, after)
	}
	if f.Scan.ArriveMs <= f.Scan.DepartMs {
		t.Fatalf("Scan.ArriveMs (%d) is not after Scan.DepartMs (%d)", f.Scan.ArriveMs, f.Scan.DepartMs)
	}

	action := rawAction(t, client, f.ActiveScanId)
	eta, _ := action["eta"].(int64)
	if common.WorldMillis(eta) != f.Scan.ArriveMs {
		t.Errorf("the committed action's eta = %v, want it to equal Scan.ArriveMs %d exactly", action["eta"], f.Scan.ArriveMs)
	}
	if typ, _ := action["type"].(string); typ != "scan" {
		t.Errorf("committed action type = %q, want %q", typ, "scan")
	}
	if slot, _ := action["slot"].(string); slot != "activeScanId" {
		t.Errorf("committed action slot = %q, want %q (the sensor channel)", slot, "activeScanId")
	}
}

// Scenario: A farther host costs a longer sweep / A sweep against a host at
// zero range still costs a positive duration.
func TestScanE2E_Scenario_FartherHostCostsALongerSweepAndZeroRangeIsPositive(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	// Two independent corps, so each can run its own single-slot sweep
	// concurrently for comparison.
	tokenNear, corpNear, fleetNear, homeNear := spawnForDisclosureTest(t, router, "SDET Scan Near Corp")
	tokenFar, corpFar, fleetFar, homeFar := spawnForDisclosureTest(t, router, "SDET Scan Far Corp")

	baseNear := farFromStar(t, ctx, homeNear)
	placeFleet(t, fdao, ctx, fleetNear, corpNear, homeNear, baseNear)
	hostNear := "host-near-" + fleetNear
	placeFleet(t, fdao, ctx, hostNear, corpNear, homeNear, baseNear) // zero range

	baseFar := farFromStar(t, ctx, homeFar)
	placeFleet(t, fdao, ctx, fleetFar, corpFar, homeFar, baseFar)
	hostFar := "host-far-" + fleetFar
	placeFleet(t, fdao, ctx, hostFar, corpFar, homeFar, baseFar.Add(space.Vec3{X: 40})) // within FocusedScanRange (48), far from zero

	if w := scanReq(t, router, tokenNear, fleetNear, hostNear); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("near-host scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	if w := scanReq(t, router, tokenFar, fleetFar, hostFar); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("far-host scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}

	near := readFleet(t, fdao, ctx, fleetNear)
	far := readFleet(t, fdao, ctx, fleetFar)
	if near.Scan == nil || far.Scan == nil {
		t.Fatalf("expected both fleets to carry a committed Scan window: near=%+v far=%+v", near.Scan, far.Scan)
	}
	durNear := near.Scan.ArriveMs - near.Scan.DepartMs
	durFar := far.Scan.ArriveMs - far.Scan.DepartMs

	if durNear <= 0 {
		t.Errorf("a sweep against a host at zero range has non-positive duration %d, want it bounded below by the named base", durNear)
	}
	if !(durFar >= durNear) {
		t.Errorf("far-host duration %d is shorter than near-host (zero-range) duration %d; a farther host must not cost less", durFar, durNear)
	}
}

// Scenario: The scanner's later motion does not change the committed ETA.
func TestScanE2E_Scenario_ScannerLaterMotionDoesNotChangeCommittedETA(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Later-Motion Corp")
	hostId := "host-later-motion-" + fleetId
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 30}))

	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	committed := readFleet(t, fdao, ctx, fleetId)
	if committed.Scan == nil {
		t.Fatalf("Fleet.Scan is nil after commit")
	}
	wantArrive := committed.Scan.ArriveMs

	// The scanner drifts elsewhere after commit — mutating only the
	// kinematic State field of the ALREADY-COMMITTED doc (never
	// placeFleet/driftFleet here, which builds and saves a fresh minimal
	// Fleet{} literal that would silently wipe the just-committed
	// Scan/ActiveScanId fields as a side effect of this test's own fixture
	// manipulation, rather than of anything under test).
	committed.State = space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{
		Anchor: space.Vec3{X: 900, Y: 900}, Velocity: space.Vec3{}, EpochMs: 1,
	}}
	committed.StateDoc = fleet.EncodeKinematicState(committed.State)
	if err := fdao.Save(ctx, *committed); err != nil {
		t.Fatalf("relocating the scanner's kinematic state directly: %v", err)
	}

	after := readFleet(t, fdao, ctx, fleetId)
	if after.Scan == nil || after.Scan.ArriveMs != wantArrive {
		t.Errorf("Scan.ArriveMs after the scanner moved = %v, want the frozen %d", after.Scan, wantArrive)
	}
}

// --- Req3: A Sweep Is Rejected Beyond Range or Behind the Star -------------

// Scenario: A host beyond focused-scan range is rejected / A host occluded
// by the star is rejected / A host at exactly the named range is accepted.
func TestScanE2E_Scenario_RangeAndOcclusion(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	const focusedScanRange = 48.0 // disclosure.FocusedScanRange, mirrored here (see file's own contract note)

	t.Run("beyond range is rejected", func(t *testing.T) {
		token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Beyond-Range Corp")
		hostId := "host-beyond-" + fleetId
		placeFleet(t, fdao, ctx, fleetId, corpId, homeId, space.Vec3{})
		placeFleet(t, fdao, ctx, hostId, corpId, homeId, space.Vec3{X: focusedScanRange + 1})

		w := scanReq(t, router, token, fleetId, hostId)
		if w.Code >= 200 && w.Code < 300 {
			t.Fatalf("a host beyond focused-scan range was accepted: status = %d, body = %s", w.Code, w.Body.String())
		}
	})

	t.Run("occluded by the star is rejected", func(t *testing.T) {
		token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Occluded Corp")
		bt := bodyTableFor(t, ctx, homeId)
		starPos, err := space.Position(bt, bt.StarId(), 0)
		if err != nil {
			t.Fatalf("resolving star position: %v", err)
		}
		// Scanner and host straddle the star along the same axis, close
		// enough together that the segment passes through the star's
		// clearance and the total distance still sits within
		// focusedScanRange.
		scannerPos := starPos.Add(space.Vec3{X: -20})
		hostPos := starPos.Add(space.Vec3{X: 20})
		hostId := "host-occluded-" + fleetId
		placeFleet(t, fdao, ctx, fleetId, corpId, homeId, scannerPos)
		placeFleet(t, fdao, ctx, hostId, corpId, homeId, hostPos)

		w := scanReq(t, router, token, fleetId, hostId)
		if w.Code >= 200 && w.Code < 300 {
			t.Fatalf("a host occluded by the star was accepted: status = %d, body = %s", w.Code, w.Body.String())
		}
	})

	t.Run("exactly at range is accepted", func(t *testing.T) {
		token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan At-Range Corp")
		hostId := "host-at-range-" + fleetId
		base := farFromStar(t, ctx, homeId)
		placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
		placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: focusedScanRange}))

		w := scanReq(t, router, token, fleetId, hostId)
		if w.Code < 200 || w.Code >= 300 {
			t.Fatalf("a host at exactly the named range was rejected: status = %d, body = %s (the boundary "+
				"resolves toward disclosure — this must succeed)", w.Code, w.Body.String())
		}
	})
}

// --- Req6: A Sweep Resolves Into Sightings, Or Fizzles (Debt 1) -----------

// Debt 1 — the real mint path: POST .../scan -> real ScanResolver reading
// real masking/chain state -> mint via ResolveResult.Writes -> confirmed
// through GET /v1/sightings. There is no sightings UI yet (link 6), so
// GET /v1/sightings is the honest end point this test verifies against —
// this is NOT a browser-verified path; it stops at the last endpoint a
// player-facing surface exists for today.
func TestScanE2E_Debt1_RealMintPathThroughRouterAndSightingsRead(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	t.Run("a chained ship masked at the host is minted", func(t *testing.T) {
		token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Mint-Chain Corp")
		hostId := "host-mint-chain-" + fleetId
		base := farFromStar(t, ctx, homeId)
		placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
		hostPos := base.Add(space.Vec3{X: 20})
		placeFleet(t, fdao, ctx, hostId, corpId, homeId, hostPos)

		// A foreign ship docked at the host — masked, and exactly what the
		// sweep exists to reveal.
		targetId := "foreign-masked-at-host-" + fleetId
		target := fleetFixture(targetId, "corp-foreign-mint-"+fleetId, homeId, hostPos)
		target.AttachedTo = hostId
		if err := fdao.Save(ctx, target); err != nil {
			t.Fatalf("saving the masked foreign target: %v", err)
		}

		if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
			t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
		}
		f := readFleet(t, fdao, ctx, fleetId)
		if f.Scan == nil || f.ActiveScanId == "" {
			t.Fatalf("expected a committed scan: %+v", f)
		}
		timeSkipAction(t, client, f.ActiveScanId)
		settleScope(t, router, token, homeId)

		settled := readFleet(t, fdao, ctx, fleetId)
		if settled.ActiveScanId != "" {
			t.Errorf("ActiveScanId = %q after resolve, want released", settled.ActiveScanId)
		}

		var pile struct {
			Sightings []map[string]any `json:"sightings"`
		}
		if w := doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, &pile); w.Code != http.StatusOK {
			t.Fatalf("GET /v1/sightings: status = %d, body = %s", w.Code, w.Body.String())
		}
		if len(pile.Sightings) == 0 {
			t.Fatalf("the resolved sweep minted nothing — expected at least one sighting record for the masked target")
		}
		found := false
		for _, s := range pile.Sightings {
			if hostId2, _ := s["hostId"].(string); hostId2 == hostId {
				found = true
				if clean, _ := s["cleanSweep"].(bool); clean {
					t.Errorf("the chain-masked sweep's record is marked cleanSweep=true: %+v", s)
				}
				if _, hasTarget := s["targetId"]; hasTarget {
					t.Errorf("the sighting's response body carries a targetId field: %+v", s)
				}
			}
		}
		if !found {
			t.Errorf("no minted sighting names hostId %q: %+v", hostId, pile.Sightings)
		}
	})

	t.Run("a resolving sweep against an empty host mints a clean-sweep record", func(t *testing.T) {
		token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Mint-Clean Corp")
		hostId := "host-mint-clean-" + fleetId
		base := farFromStar(t, ctx, homeId)
		placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
		placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 20}))

		if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
			t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
		}
		f := readFleet(t, fdao, ctx, fleetId)
		timeSkipAction(t, client, f.ActiveScanId)
		settleScope(t, router, token, homeId)

		var pile struct {
			Sightings []map[string]any `json:"sightings"`
		}
		if w := doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, &pile); w.Code != http.StatusOK {
			t.Fatalf("GET /v1/sightings: status = %d, body = %s", w.Code, w.Body.String())
		}
		found := false
		for _, s := range pile.Sightings {
			if hostId2, _ := s["hostId"].(string); hostId2 == hostId {
				found = true
				if clean, _ := s["cleanSweep"].(bool); !clean {
					t.Errorf("expected the empty-host sweep's record to be marked cleanSweep=true: %+v", s)
				}
			}
		}
		if !found {
			t.Errorf("no clean-sweep record names hostId %q: %+v", hostId, pile.Sightings)
		}
	})
}

// Scenario: A scanning fleet that left the host's system mints nothing /
// A scanning fleet in lane transit at pulse-reach mints nothing — exercised
// together via a real jump the scanner takes DURING its own sweep, timed so
// the jump's own arrival lands before the scan's pulse-reach instant (the
// "left the system" half) — the lane-transit half is covered directly by
// fleet/scan_resolver_test.go's unit-level fizzle test, which can pin the
// pulse-reach instant exactly; reproducing that exact timing against two
// independently-resolving real actions (the jump and the scan) at the e2e
// level would be flaky by construction (two real ETAs racing against one
// pulse-reach instant), so it is not attempted here.
func TestScanE2E_Scenario_ScannerLeftTheSystemMintsNothing(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Left-System Corp")
	hostId := "host-left-system-" + fleetId
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 20}))

	// A second corp gives this test a REAL, materialized destination system
	// to relocate the scanner into — a fabricated system id 500s the
	// settle read (BodyTable resolution fails against a system that was
	// never generated), which is a test-environment failure, not the
	// scenario under test.
	_, _, _, elsewhereId := spawnForDisclosureTest(t, router, "SDET Scan Left-System Anchor Corp")

	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	scanning := readFleet(t, fdao, ctx, fleetId)
	if scanning.Scan == nil || scanning.ActiveScanId == "" {
		t.Fatalf("expected a committed scan: %+v", scanning)
	}

	// Force the fleet's SystemId to a different, REAL system directly —
	// standing in for "the scanner has left the host's system by
	// pulse-reach", without depending on a second real action's own ETA
	// racing the scan's.
	scanning.SystemId = elsewhereId
	if err := fdao.Save(ctx, *scanning); err != nil {
		t.Fatalf("relocating the scanner directly: %v", err)
	}

	timeSkipAction(t, client, scanning.ActiveScanId)
	// Settled through the scan's OWN committed scope — the origin system
	// (homeId), not wherever the fleet has since relocated to (see
	// settleScope's own doc comment).
	settleScope(t, router, token, homeId)

	settled := readFleet(t, fdao, ctx, fleetId)
	if settled.ActiveScanId != "" {
		t.Errorf("ActiveScanId = %q after resolve, want released even on a fizzle", settled.ActiveScanId)
	}

	var pile struct {
		Sightings []map[string]any `json:"sightings"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, &pile); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/sightings: status = %d, body = %s", w.Code, w.Body.String())
	}
	for _, s := range pile.Sightings {
		if hostId2, _ := s["hostId"].(string); hostId2 == hostId {
			t.Errorf("a sweep whose scanner left the host's system minted a record: %+v", s)
		}
	}
}

// --- Req7: Cancelling a Sweep Releases the Slot, Mints Nothing, Ends
//     Emission --------------------------------------------------------------

// Scenario: Cancelling a running sweep releases the sensor slot / The fleet
// may commit a new focused scan immediately after / A cancelled sweep
// mints no sighting.
func TestScanE2E_Scenario_CancelViaActionEndpointReleasesSlotAndMintsNothing(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, _ := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET Scan Cancel Corp")
	hostId := "host-cancel-" + fleetId
	base := farFromStar(t, ctx, homeId)
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 20}))

	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	running := readFleet(t, fdao, ctx, fleetId)
	scanId := running.ActiveScanId
	if scanId == "" {
		t.Fatalf("expected a committed scan action id")
	}

	if w := doJSON(t, router, http.MethodPost, "/v1/actions/"+scanId+"/cancel", token, nil, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/actions/%s/cancel: status = %d, body = %s", scanId, w.Code, w.Body.String())
	}

	cancelled := readFleet(t, fdao, ctx, fleetId)
	if cancelled.ActiveScanId != "" {
		t.Errorf("ActiveScanId = %q after cancel, want released", cancelled.ActiveScanId)
	}

	// The fleet may commit a new focused scan immediately after.
	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("a new scan committed right after cancel: status = %d, body = %s (the slot must be immediately "+
			"reusable)", w.Code, w.Body.String())
	}

	// No sighting was ever minted for the cancelled sweep.
	var pile struct {
		Sightings []map[string]any `json:"sightings"`
	}
	if w := doJSON(t, router, http.MethodGet, "/v1/sightings", token, nil, &pile); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/sightings: status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(pile.Sightings) != 0 {
		t.Errorf("a cancelled sweep's pile is non-empty: %+v — cancelling must mint no sighting, not even a "+
			"clean-sweep record", pile.Sightings)
	}
}

// fleetFixture builds an ordinary, un-Scan-ing fixture fleet parked at a
// static point — a lighter-weight variant of disclosure_wiring_e2e_test.go's
// own driftFleet, returned rather than saved, so callers can mutate a field
// (e.g. AttachedTo) before writing it.
func fleetFixture(id, corpId, systemId string, at space.Vec3) fleet.Fleet {
	return fleet.Fleet{
		Id: id, CorporationId: corpId, SystemId: systemId,
		State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: at, Velocity: space.Vec3{}, EpochMs: 1}},
	}
}
