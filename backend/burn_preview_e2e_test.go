package main

// RED-phase end-to-end tests for openspec change
// serve-orbital-elements-and-burn-preview, tasks.md 1.3-1.6 and 1.9 —
// fleet-movement's ADDED requirement "Burn Order Preview Solves Without
// Committing", plus the three preview scenarios its MODIFIED ownership
// requirement adds.
//
// EXPECTED TO BE RED TODAY: POST /v1/fleets/:fleetId/orders/preview is not
// registered at all (fleet/handler.go's RegisterRoutes). Every test in this
// file guards that with requireRouteImplemented, so none of them can pass
// vacuously against Gin's generic unmatched-route 404 — the exact vacuity
// link 7b's SDET found in a shipped ownership test.

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
)

// --- Scenario: A preview returns the same curve, ETA, and cost a commit
//               would produce -------------------------------------------

// The parity claim is asserted against the burn the COMMIT actually solved
// and stored — never against a second preview, which would only prove the
// preview agrees with itself.
//
// WHY THE TWO CALLS ARE COMPARABLE AT ALL, given a real clock advances
// between them: the fixture is a fresh spawn (a motionless `point` park —
// fleet.SeedFleet) ordered to a fixed POINT. space.BuildCurve depends on the
// world time only through the target's position, which for a point target is
// constant, so the curve, its length, the brachistochrone flight duration
// (space.QuantizeArrival adds ceil(flightSeconds*1000) to departMs, a
// difference independent of departMs), the delta-v and the fuel cost are all
// identical between the two calls by construction. Only the absolute
// departure instant differs, and that is asserted as "each departs at its own
// request's world time" rather than as equality — the honest form of the
// scenario's "the same world time" premise against a clock that will not hold
// still.
func TestPreview_Scenario_APreviewReturnsTheSameCurveEtaAndCostACommitWouldProduce(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Parity Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	beforePreview := worldNow()
	preview := previewOK(t, router, sp.token, sp.fleetId, pointOrder())
	afterPreview := worldNow()

	committed, _, code := postOrder(t, router, sp.token, sp.fleetId, pointOrder())
	if code != http.StatusOK || committed.State.Burn == nil {
		t.Fatalf("committing the identical order after the preview: status = %d, burn = %v — without a "+
			"committed solve there is nothing to compare the preview against", code, committed.State.Burn)
	}
	burn := *committed.State.Burn

	// Non-vacuity: a degenerate solve (zero-length curve, zero cost) would make
	// every membership assertion below trivially satisfiable by a response
	// full of zeroes.
	if !(burn.Length > 0) || !(burn.DeltaV() > 0) || burn.ArriveMs <= burn.DepartMs {
		t.Fatalf("fixture invariant: the committed burn is degenerate (length=%v deltaV=%v depart=%v "+
			"arrive=%v) — the parity assertions below would be satisfiable by zeroes",
			burn.Length, burn.DeltaV(), burn.DepartMs, burn.ArriveMs)
	}

	requireNumbers(t, preview, "the solved curve's six control points", curveCoords(burn.Curve))
	requireNumbers(t, preview, "the solved delta-v cost", []float64{burn.DeltaV()})
	requireNumbers(t, preview, "the solved fuel cost in tons",
		[]float64{burn.DeltaV() / deltaVPerTonPlaceholder})

	depart := oneNumberByKey(t, preview, "departMs")
	arrive := oneNumberByKey(t, preview, "arriveMs")
	wantDuration := float64(burn.ArriveMs - burn.DepartMs)
	if arrive-depart != wantDuration {
		t.Errorf("preview flight duration = %v ms, the committed order's = %v ms. The two must be the "+
			"identical solve: same curve, same brachistochrone flight time", arrive-depart, wantDuration)
	}
	if depart < float64(beforePreview) || depart > float64(afterPreview) {
		t.Errorf("preview departMs = %v, outside the world-time window the request itself spanned "+
			"[%v, %v] — a preview departs at the instant it is solved, exactly as a commit does",
			depart, beforePreview, afterPreview)
	}
}

// --- Scenario: A preview settles a due arrival first, then solves from the
//               settled state ------------------------------------------------

func TestPreview_Scenario_APreviewSettlesADueArrivalFirstThenSolvesFromTheSettledState(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Settle-First Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	if _, _, code := postOrder(t, router, sp.token, sp.fleetId, pointOrder()); code != http.StatusOK {
		t.Fatalf("arranging a running burn: POST /orders returned %d", code)
	}
	forceBurnArrivalPast(t, sp.fleetId)

	// THE ANTI-VACUITY GUARD. Nothing may read the fleet between the rewind
	// and the preview: fleet.Service.Get itself settles a due arrival
	// (service.go's own opportunistic resolve), so a single GET here would
	// pre-settle the fixture and make the assertions below pass against a
	// preview that settles nothing at all. The stored document is read
	// DIRECTLY, which performs no settlement.
	if mode := storedStateMode(t, sp.fleetId); mode != "burn" {
		t.Fatalf("fixture invariant: stored state mode = %q immediately after the rewind, want \"burn\" — "+
			"the arrival is already settled and this scenario has no subject", mode)
	}
	if storedActiveActionId(t, sp.fleetId) == "" {
		t.Fatal("fixture invariant: the fleet holds no movement-channel slot, so there is no due, " +
			"unsettled arrival for the preview to settle")
	}

	// A DIFFERENT target, per the scenario's "a preview is requested for a new
	// target".
	newTarget := map[string]any{"point": map[string]any{"x": -400_000.0, "y": 0.0, "z": 250_000.0}, "accel": previewAccel}
	body := previewOK(t, router, sp.token, sp.fleetId, newTarget)

	if mode := storedStateMode(t, sp.fleetId); mode == "burn" {
		t.Errorf("after the preview the fleet's STORED state is still a burn — the due arrival was not " +
			"settled through the shared fold-first seam. \"Like every other door onto a fleet, the preview " +
			"SHALL resolve a movement action whose ETA has already passed ... before solving\"")
	}
	if id := storedActiveActionId(t, sp.fleetId); id != "" {
		t.Errorf("after the preview the movement-channel slot is still claimed by %q — the due arrival's "+
			"resolution releases it, and a preview that skipped settlement leaves it held", id)
	}
	if n := runningActionCount(t, sp.fleetId); n != 0 {
		t.Errorf("after the preview %d action(s) are still `running` — the settled arrival's own action "+
			"must have been resolved", n)
	}
	// The preview is still a served solve, not a rejection, for the settled fleet.
	if _, ok := body["departMs"]; !ok {
		if len(numbersByKey(body, "departMs")) == 0 {
			t.Errorf("the preview served no departMs after settling — it must go on to SOLVE from the " +
				"settled park, not merely settle")
		}
	}
}

// --- Scenario: Repeated previews of a fleet with nothing due write nothing --

func TestPreview_Scenario_RepeatedPreviewsOfAFleetWithNothingDueWriteNothing(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Idempotence Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	// The fixture MUST have nothing due: a fresh spawn is a motionless point
	// park with no action at all. Asserted, not assumed — a fleet with a due
	// arrival would let a settling write pass as "the preview wrote nothing"
	// only by accident of ordering.
	requireNoActiveMovementAction(t, sp.fleetId)

	before := storedFleetJSON(t, sp.fleetId)
	fuelBefore := fleetCargoFuel(t, sp.fleetId)

	for i := 0; i < 3; i++ {
		previewOK(t, router, sp.token, sp.fleetId, pointOrder()) // each must be a served solve, not a rejection
	}

	if after := storedFleetJSON(t, sp.fleetId); after != before {
		t.Errorf("three previews of a fleet with nothing due CHANGED its stored record:\n  before: %s\n"+
			"  after:  %s\nBeyond the settlement of an already-due arrival (there is none here), an "+
			"arbitrary number of previews SHALL leave the stored state byte-identical", before, after)
	}
	if n := runningActionCount(t, sp.fleetId); n != 0 {
		t.Errorf("the previews created %d running action(s) — a preview creates no action-dispatch action", n)
	}
	if id := storedActiveActionId(t, sp.fleetId); id != "" {
		t.Errorf("the previews claimed the movement-channel slot (%q) — a preview claims no channel slot", id)
	}
	if got := fleetCargoFuel(t, sp.fleetId); got != fuelBefore {
		t.Errorf("the previews debited fuel: %v -> %v. A preview debits no fuel", fuelBefore, got)
	}
}

// --- Scenario: A preview against the star is rejected by the curve's
//               clearance guard, not by a destination check -----------------

func TestPreview_Scenario_AgainstTheStarIsRejectedByTheClearanceGuardNotADestinationCheck(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Star Target Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)
	starId := starFeatureId(t, router, sp.token, sp.homeId)

	starOrder := map[string]any{"bodyId": starId, "accel": previewAccel}
	previewStar := postPreview(t, router, sp.token, sp.fleetId, starOrder)
	commitStar := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, starOrder, nil)

	// Half one: the preview's rejection is OBSERVABLY the commit's. The
	// commit's own rejection is already pinned to space.ErrEndpointInsideClearance
	// by fleet/star_destination_test.go, so matching it is what makes the
	// preview's reason that error and not some new one.
	sameRejection(t, "preview vs commit, target = the system's own star", previewStar, commitStar)

	// Half two, and the part an identity check cannot survive: a target that
	// is NOT the star but lies inside the star's clearance radius is rejected
	// IDENTICALLY. design.md Decision 3: "the clearance guard also rejects
	// targets that are not the star but sit inside its clearance radius — a
	// case an identity check misses entirely". A preview that short-circuited
	// on `bodyId == starId` serves this one, or rejects it differently.
	insideClearance := map[string]any{
		"point": map[string]any{"x": 1.0, "y": 0.0, "z": 0.0}, "accel": previewAccel,
	}
	previewInside := postPreview(t, router, sp.token, sp.fleetId, insideClearance)
	if previewInside.Code == http.StatusOK {
		t.Fatalf("a preview to an explicit POINT one unit from the star (well inside its clearance radius) "+
			"was SERVED (200). It must be rejected by space.BuildCurve's endpoint-clearance guard, exactly "+
			"as the star's own body id is — a destination-identity check would miss this case entirely "+
			"(design.md Decision 3). Body: %s", previewInside.Body.String())
	}
	if previewInside.Code != previewStar.Code || previewInside.Body.String() != previewStar.Body.String() {
		t.Errorf("the star-by-body-id preview and a non-star point inside the same clearance radius are "+
			"rejected DIFFERENTLY:\n  star:            %d %s\n  point-in-clearance: %d %s\n"+
			"Both are the SAME geometric rejection. A difference between them is the signature of a "+
			"destination-identity comparison taking part, which this requirement forbids outright",
			previewStar.Code, previewStar.Body.String(), previewInside.Code, previewInside.Body.String())
	}
}

// --- Scenario: A burning fleet can preview a re-target ---------------------

// shiftBurnWindowTo repositions a running burn's stored window so that `now`
// sits at `fracElapsed` of its flight, preserving the window's own LENGTH (and
// therefore the burn's own physics) exactly as forceBurnArrivalPast preserves
// nothing and setBurnArriveMsNearNow preserves the refund fraction. Setup-only
// time travel; the fold that runs afterwards is the production one.
func shiftBurnWindowTo(t *testing.T, fleetId string, fracElapsed float64) {
	t.Helper()
	_, client := firestoreClient(t)
	doc := storedFleetDoc(t, fleetId)
	state, _ := doc["state"].(map[string]interface{})
	value, _ := state["value"].(map[string]interface{})
	if value == nil {
		t.Fatalf("fleet %s carries no stored burn window to shift", fleetId)
	}
	depart := storedMillisAny(value["departMs"])
	arrive := storedMillisAny(value["arriveMs"])
	duration := arrive - depart
	if duration <= 0 {
		t.Fatalf("fleet %s's stored burn window is degenerate (depart=%d arrive=%d)", fleetId, depart, arrive)
	}
	newDepart := worldNow() - int64(float64(duration)*fracElapsed)
	newArrive := newDepart + duration

	ref := client.Collection("fleets").Doc(fleetId)
	if _, err := ref.Update(context.Background(), []firestore.Update{
		{Path: "state.value.departMs", Value: newDepart},
		{Path: "state.value.arriveMs", Value: newArrive},
	}); err != nil {
		t.Fatalf("shifting fleet %s's burn window: %v", fleetId, err)
	}
	// The action's frozen ETA must move with it, or the burn reads as due and
	// the very next door onto the fleet settles it out from under this test.
	iter := client.Collection("actions").
		Where("actor", "==", fleetId).Where("status", "==", "running").Documents(context.Background())
	defer iter.Stop()
	d, err := iter.Next()
	if err != nil {
		t.Fatalf("finding fleet %s's running action to move its eta: %v", fleetId, err)
	}
	if _, err := d.Ref.Update(context.Background(), []firestore.Update{{Path: "eta", Value: newArrive}}); err != nil {
		t.Fatalf("moving action %s's eta: %v", d.Ref.ID, err)
	}
}

func TestPreview_Scenario_ABurningFleetCanPreviewARetarget(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Burning Retarget Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	committed, _, code := postOrder(t, router, sp.token, sp.fleetId, pointOrder())
	if code != http.StatusOK || committed.State.Burn == nil {
		t.Fatalf("arranging a running burn: status = %d, burn = %v", code, committed.State.Burn)
	}

	retarget := map[string]any{"point": map[string]any{"x": -600_000.0, "y": 100_000.0, "z": 0.0}, "accel": previewAccel}

	// Probe A: one fifth of the way along the burn.
	shiftBurnWindowTo(t, sp.fleetId, 0.2)
	if mode := storedStateMode(t, sp.fleetId); mode != "burn" {
		t.Fatalf("fixture invariant: the fleet is not stored mid-burn (mode = %q)", mode)
	}
	before := storedFleetJSON(t, sp.fleetId)
	a := previewOK(t, router, sp.token, sp.fleetId, retarget)

	if after := storedFleetJSON(t, sp.fleetId); after != before {
		t.Errorf("previewing a re-target CHANGED the running burn's stored record:\n  before: %s\n"+
			"  after:  %s\nThe scenario's THEN: \"the running burn is unchanged\"", before, after)
	}

	// Probe B: four fifths of the way along the SAME burn. The fleet has moved
	// a long way down its curve, so a solve taken from its LIVE position must
	// produce a different flight duration to the new target. An implementation
	// that solved from the burn's stored ORIGIN — or from any fixed point —
	// returns the identical duration both times.
	shiftBurnWindowTo(t, sp.fleetId, 0.8)
	b := previewOK(t, router, sp.token, sp.fleetId, retarget)

	durA := oneNumberByKey(t, a, "arriveMs") - oneNumberByKey(t, a, "departMs")
	durB := oneNumberByKey(t, b, "arriveMs") - oneNumberByKey(t, b, "departMs")
	if durA == durB {
		t.Errorf("two previews of the SAME re-target, taken with the fleet one fifth and four fifths of "+
			"the way along its running burn, solve the identical flight duration (%v ms). The preview must "+
			"be \"solved from the fleet's live position and tangent at the request's world time\" — a "+
			"solve from a fixed stored origin is exactly what produces two identical answers here", durA)
	}
}

// --- Scenario: A preview is refused wherever the commit would be refused ---

func TestPreview_Scenario_RefusedWhereverTheCommitWouldBeRefused(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Shared Rejections Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	cases := []struct {
		name string
		body map[string]any
	}{
		{"an ambiguous target (both a bodyId and a point)", map[string]any{
			"bodyId": sp.stationId, "point": farPoint, "accel": previewAccel}},
		{"an empty target (neither a bodyId nor a point)", map[string]any{"accel": previewAccel}},
		{"a commanded acceleration below the disclosure floor", map[string]any{
			"point": farPoint, "accel": 0.000001}},
		{"a commanded acceleration above the roster-derived ceiling", map[string]any{
			"point": farPoint, "accel": 1.0e9}},
		{"a body id absent from this system's body table", map[string]any{
			"bodyId": "feat-sdet-not-a-body-" + uuid.NewString(), "accel": previewAccel}},
	}

	for _, tc := range cases {
		t.Run("Scenario: A preview is refused wherever the commit would be refused ("+tc.name+")", func(t *testing.T) {
			before := storedFleetJSON(t, sp.fleetId)
			preview := postPreview(t, router, sp.token, sp.fleetId, tc.body)
			commit := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, tc.body, nil)
			sameRejection(t, "preview vs commit, "+tc.name, preview, commit)
			if after := storedFleetJSON(t, sp.fleetId); after != before {
				t.Errorf("a refused preview/commit pair (%s) changed the fleet's stored record:\n  before: %s\n  after:  %s",
					tc.name, before, after)
			}
		})
	}
}

// The lane-transit sub-case gets its own fixture: putting the fleet into
// transit is terminal for every other arrangement in one test's lifetime.
func TestPreview_Scenario_RefusedForAFleetInLaneTransit(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Lane Transit Corp")
	gateBodyId, laneId := gateBodyIdFor(t, sp)
	arriveInOrbitAround(t, router, sp, gateBodyId, 1_000_000)

	if w := postJump(t, router, sp.token, sp.fleetId, laneId); w.Code != http.StatusOK {
		t.Fatalf("arranging lane transit: POST /jump returned %d (body: %s) — without a real transit "+
			"this scenario has no subject", w.Code, w.Body.String())
	}
	if doc := storedFleetDoc(t, sp.fleetId); doc["jump"] == nil {
		t.Fatal("fixture invariant: the fleet is not stored in lane transit after a successful jump commit")
	}

	before := storedFleetJSON(t, sp.fleetId)
	preview := postPreview(t, router, sp.token, sp.fleetId, pointOrder())
	commit := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, pointOrder(), nil)
	sameRejection(t, "preview vs commit, a fleet in lane transit", preview, commit)
	if after := storedFleetJSON(t, sp.fleetId); after != before {
		t.Errorf("the refused preview/commit pair changed a lane-transiting fleet's stored record:\n"+
			"  before: %s\n  after:  %s", before, after)
	}
}

// The running-mine sub-case, with its own fixture: the fleet must be docked to
// a real lode with a real run on the movement channel, and cannot also carry
// the million tons of fuel the other fixtures use (a seed hull's hold is 200
// tons, and `mine` clamps its run to FREE HOLD).
//
// PARTIAL COVERAGE, DECLARED. The scenario's THEN has two halves: "the request
// is rejected" and "with the same named reason the commit path uses for that
// case". Only the first is automated here. The second is NOT, because the
// premise it rests on was MEASURED FALSE on this tree: with an order the fleet
// can afford, a burn commit against a fleet whose movement channel is held by a
// running mine is ACCEPTED (200) — fleet.Service.OrderTo's re-task branch
// cancels the active action, whatever its type, and commits the burn; the mine
// run is destroyed. So the commit path has no "named reason ... for that case"
// for a preview to share, and a preview cannot behave like the commit here
// anyway (it writes nothing, so it cannot cancel the run). That is a spec
// question, not an implementation one, and it is reported to the orchestrator
// rather than resolved by inventing a reading. See the SDET handoff report.
func TestPreview_Scenario_RefusedWhenTheMovementChannelIsHeldByARunningMine(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Mine-Held Channel Corp")
	featureId, kind := pickMineableFeature(t, router, sp)
	// 120 tons, not a million: `mine` clamps its run to FREE HOLD, and a fleet
	// carrying more fuel than its 200-ton hold capacity has none, so the
	// arrangement itself would be rejected ("mine: requested tons exceeds free
	// hold") and this scenario would never reach its subject. 120 also
	// comfortably affords the ~36-ton nearby burn ordered below.
	arriveInOrbitAround(t, router, sp, featureId, 120)

	if w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/mine", sp.token,
		map[string]any{"featureId": featureId, "kind": kind, "tons": 20.0}, nil); w.Code != http.StatusOK {
		t.Fatalf("arranging a running mine on the movement channel: status = %d, body = %s", w.Code, w.Body.String())
	}
	mineActionId := storedActiveActionId(t, sp.fleetId)
	if mineActionId == "" {
		t.Fatal("fixture invariant: the mine run claimed no movement-channel slot, so the channel is not held")
	}

	// The order must be one the fleet could otherwise AFFORD, or the preview is
	// rejected (or served) on fuel grounds and this test says nothing about the
	// held channel. Measured: the first draft of this fixture used the suite's
	// ordinary far-point order, which costs ~744 tons against a 200-ton hold,
	// and was rejected with ErrInsufficientFuel throughout.
	order := affordableNearbyOrder(t, router, sp.token, sp.fleetId, 2_000)

	before := storedFleetJSON(t, sp.fleetId)
	preview := postPreview(t, router, sp.token, sp.fleetId, order)

	if got := storedActiveActionId(t, sp.fleetId); got != mineActionId {
		t.Errorf("the preview released the movement-channel slot the running mine held (%q -> %q). A "+
			"preview claims no channel slot and — being a preview — cancels nothing", mineActionId, got)
	}
	if n := runningActionCount(t, sp.fleetId); n != 1 {
		t.Errorf("after the preview the fleet has %d running action(s), want the one mine run it started "+
			"with — a preview creates and cancels nothing", n)
	}
	if after := storedFleetJSON(t, sp.fleetId); after != before {
		t.Errorf("the preview changed the stored record of a fleet whose movement channel is held by a "+
			"running mine:\n  before: %s\n  after:  %s", before, after)
	}
	if preview.Code == http.StatusOK {
		t.Errorf("the preview was SERVED (200) for a fleet whose movement channel is already claimed by a "+
			"running mine. fleet-movement \"Burn Order Preview Solves Without Committing\" lists exactly "+
			"this among the conditions on which a preview \"SHALL be rejected ... where the commit path "+
			"rejects\": \"a movement channel already claimed by a non-burn verb (a running mine)\". "+
			"Body: %s", preview.Body.String())
	}
	if msg := errorMessage(preview); preview.Code != http.StatusOK && msg == "fleet: fuel cost exceeds available fuel" {
		t.Errorf("the preview was rejected for INSUFFICIENT FUEL. That is the ONE condition on which a " +
			"preview deliberately does not reject at all — it is served in full with its affordability " +
			"indication reading false — so this is both the wrong rejection for this arrangement and a " +
			"violation of the requirement's stated exception")
	}
}

// --- Scenario: A preview reports an unaffordable target as such ------------

func TestPreview_Scenario_ReportsAnUnaffordableTargetAsSuch(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Unaffordable Corp")

	// Affordable arrangement first — the reference the unaffordable one is
	// diffed against. The fleet does not move between the two calls (a preview
	// writes nothing, which is the sibling scenario), and the target is a fixed
	// point, so the two solves are the identical solve and the ONLY thing that
	// differs is affordability.
	setFleetFuel(t, sp.fleetId, 1_000_000)
	rich := previewOK(t, router, sp.token, sp.fleetId, pointOrder())

	setFleetFuel(t, sp.fleetId, 0.0001)
	poor := previewOK(t, router, sp.token, sp.fleetId, pointOrder())

	// "the request is served rather than rejected" — previewOK already
	// asserted 200. "carrying the solved control points, arrival time,
	// delta-v, and fuel cost for display regardless":
	richLeaves := numericLeaves(rich)
	poorLeaves := numericLeaves(poor)
	if len(richLeaves) == 0 {
		t.Fatal("fixture invariant: the affordable preview carries no numbers at all")
	}
	missing := 0
	for _, v := range richLeaves {
		if !containsNumber(poorLeaves, v, 0) {
			missing++
		}
	}
	if missing > 2 { // departMs/arriveMs legitimately differ between the two calls
		t.Errorf("the unaffordable preview drops %d of the %d solved figures the affordable one carries. "+
			"An unaffordable preview is SERVED IN FULL — \"a rejection would leave that player with no "+
			"arrival time, no delta-v, and no fuel figure to plan a refuel or a nearer target against\".\n"+
			"  affordable: %v\n  unaffordable: %v", missing, len(richLeaves), richLeaves, poorLeaves)
	}

	// The affordability indication itself, discovered differentially so no key
	// name is presumed: a boolean that is TRUE with a full tank and FALSE (or
	// omitted) with an empty one.
	flipped := flippedBool(rich, poor)
	if len(flipped) == 0 {
		rb, _ := json.Marshal(rich)
		pb, _ := json.Marshal(poor)
		t.Errorf("no boolean field distinguishes the affordable preview from the unaffordable one — the "+
			"response carries no affordability indication at all.\n  with 1,000,000 tons: %s\n"+
			"  with 0.0001 tons:    %s", rb, pb)
	}

	// "AND a commit of that same order, submitted from the same state, is
	// rejected with the insufficient-fuel reason — the one condition on which
	// the preview and the commit deliberately diverge."
	commit := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, pointOrder(), nil)
	if commit.Code == http.StatusOK {
		t.Fatalf("the commit of the same unaffordable order SUCCEEDED — the divergence this scenario is " +
			"about does not exist, so the served preview proves nothing")
	}
	if msg := errorMessage(commit); msg == "" {
		t.Errorf("the unaffordable commit was rejected with no named reason (status %d, body %q); the "+
			"preview/commit divergence is defined against the insufficient-fuel REASON", commit.Code, commit.Body.String())
	}
}

// --- Scenario: A preview reports the stranding warning when it would apply --

func TestPreview_Scenario_ReportsTheStrandingWarningWhenItWouldApply(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview Stranding Corp")

	// Baseline: ample fuel remaining after the burn, so the fleet can still
	// reach a station or gate at the acceleration floor — no warning.
	setFleetFuel(t, sp.fleetId, 1_000_000)
	safe := previewOK(t, router, sp.token, sp.fleetId, pointOrder())

	// Price this exact order from this exact origin, then fund the fleet with
	// EXACTLY that — leaving ~0 tons after the burn, far from anything. The
	// price comes from the preview itself, which is legitimate here: the
	// preview writes nothing, so the fleet has not moved and the two solves are
	// the identical solve. (The quoted-cap suite deliberately prices through a
	// commit instead, so that suite never depends on this endpoint.)
	depart := oneNumberByKey(t, safe, "departMs")
	arrive := oneNumberByKey(t, safe, "arriveMs")
	if !(arrive > depart) {
		t.Fatalf("fixture invariant: the baseline preview solved a non-positive flight duration (%v -> %v)", depart, arrive)
	}
	cost := previewAccel * (arrive - depart) / 1000 / deltaVPerTonPlaceholder // deltaV = accel * flightSeconds; hull count 1
	if !(cost > 0) {
		t.Fatalf("fixture invariant: derived a non-positive fuel cost (%v)", cost)
	}
	funded := cost
	for i := 0; funded < cost; i++ {
		if i > 8 {
			t.Fatalf("fixture invariant: could not represent a funding equal to the burn's own price %v", cost)
		}
		funded = math.Nextafter(funded, math.Inf(1))
	}
	setFleetFuel(t, sp.fleetId, funded)
	stranding := previewOK(t, router, sp.token, sp.fleetId, pointOrder())

	flipped := flippedBool(stranding, safe)
	if len(flipped) == 0 {
		sb, _ := json.Marshal(safe)
		tb, _ := json.Marshal(stranding)
		t.Errorf("no boolean field distinguishes a preview whose resulting park would strand the fleet "+
			"(funded with exactly the burn's own price, %v tons, leaving ~0 to reach anything at the "+
			"acceleration floor) from an identical preview with 1,000,000 tons. The response carries no "+
			"stranding indication at all.\n  ample fuel:  %s\n  exact price: %s", funded, sb, tb)
	}

	// The commit of the same order from the same state carries the warning too
	// — which is what makes "the same distinguishable stranding indication a
	// commit's response would carry" a claim about ONE evaluation rather than
	// two.
	_, commitBody, code := postOrder(t, router, sp.token, sp.fleetId, pointOrder())
	if code != http.StatusOK {
		t.Fatalf("the exactly-affordable commit was rejected (status %d) — the stranding warning never "+
			"blocks a commit fuel affordability alone would accept, so this fixture is broken", code)
	}
	if len(flippedBool(commitBody, safe)) == 0 {
		t.Errorf("the COMMIT of the same stranding order carries no distinguishing boolean either — the " +
			"fixture is not producing a stranding condition at all, so the preview assertion above cannot " +
			"be trusted in either direction")
	}
}

// --- Scenario: A preview rejects a lane id ---------------------------------

func TestPreview_Scenario_RejectsALaneId(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Preview LaneId Rejection Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)
	_, laneId := gateBodyIdFor(t, sp)

	before := storedFleetJSON(t, sp.fleetId)
	w := postPreview(t, router, sp.token, sp.fleetId, map[string]any{"laneId": laneId})
	if w.Code == http.StatusOK {
		t.Fatalf("a preview naming a laneId was SERVED (200): %s. A jump has no variable curve or delta-v "+
			"to preview", w.Body.String())
	}
	laneMsg := errorMessage(w)
	if laneMsg == "" {
		t.Errorf("the laneId preview was rejected with no named reason (status %d, body %q) — the scenario "+
			"requires \"its own named reason\"", w.Code, w.Body.String())
	}

	// "its OWN named reason": distinct from the empty-target reason a request
	// naming neither a bodyId nor a point produces. Without this, a handler
	// that simply ignores laneId and falls through to ErrEmptyOrder satisfies
	// the scenario vacuously — which is exactly what fleet.OrderTo does with a
	// laneId-only OrderRequest today.
	empty := postPreview(t, router, sp.token, sp.fleetId, map[string]any{})
	if emptyMsg := errorMessage(empty); emptyMsg != "" && emptyMsg == laneMsg {
		t.Errorf("a laneId preview and an EMPTY-target preview are rejected with the identical reason "+
			"(%q). The laneId rejection is \"its own named reason\" — an implementation that merely "+
			"ignores laneId and falls through to the empty-order rejection does not satisfy this "+
			"scenario", laneMsg)
	}
	if after := storedFleetJSON(t, sp.fleetId); after != before {
		t.Errorf("the rejected laneId preview changed the fleet's stored record — \"no solve is attempted\":"+
			"\n  before: %s\n  after:  %s", before, after)
	}
}

// --- Ownership: the three preview scenarios --------------------------------

// Scenario: A foreign corp cannot preview another corp's fleet's burn
// Scenario: A corpless requester is rejected the same way
func TestPreview_Scenario_ForeignAndCorplessRequestersAreRejected(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	victim := spawnFuelCorp(t, router, "SDET Preview Ownership Victim Corp")
	setFleetFuel(t, victim.fleetId, 1_000_000)
	intruder := spawnFuelCorp(t, router, "SDET Preview Ownership Intruder Corp")

	corplessToken := mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", corplessToken, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts for the corpless requester: status = %d", w.Code)
	}

	// The owner's own preview is the positive control: without it, a handler
	// that 404s every preview satisfies both scenarios below.
	if w := postPreview(t, router, victim.token, victim.fleetId, pointOrder()); w.Code != http.StatusOK {
		t.Fatalf("the OWNER's own preview returned %d (body: %s). The ownership check must reject foreign "+
			"requesters without closing the endpoint to its owner", w.Code, w.Body.String())
	}

	ghostFleetId := "fleet_" + uuid.NewString() // never written to Firestore

	for _, tc := range []struct {
		name  string
		token string
	}{
		{"a foreign corporation", intruder.token},
		{"an authenticated but corpless account", corplessToken},
	} {
		t.Run("Scenario: "+tc.name+" cannot preview another corp's fleet's burn", func(t *testing.T) {
			before := storedFleetJSON(t, victim.fleetId)
			w := postPreview(t, router, tc.token, victim.fleetId, pointOrder())

			if w.Code == http.StatusForbidden {
				t.Fatalf("POST %s from %s: status = 403, want 404 — \"a 403 would itself confirm the id "+
					"exists\"", previewPath(victim.fleetId), tc.name)
			}
			if w.Code != http.StatusNotFound {
				t.Errorf("POST %s from %s: status = %d, want 404 (body: %s)",
					previewPath(victim.fleetId), tc.name, w.Code, w.Body.String())
			}
			assertNoFleetDisclosure(t, w.Body.String(), previewPath(victim.fleetId), victim.fleetId, victim.corpId)
			assertNoSolvedFigures(t, w)

			// Indistinguishable from a fleet id that has never existed.
			ghost := postPreview(t, router, tc.token, ghostFleetId, pointOrder())
			if ghost.Code != w.Code || ghost.Body.String() != w.Body.String() {
				t.Errorf("a foreign fleet's preview rejection (%d %q) differs from a nonexistent fleet's "+
					"(%d %q) — the difference alone tells an attacker which fleet ids are real",
					w.Code, w.Body.String(), ghost.Code, ghost.Body.String())
			}
			if after := storedFleetJSON(t, victim.fleetId); after != before {
				t.Errorf("the rejected preview from %s changed the victim's stored record:\n  before: %s\n"+
					"  after:  %s", tc.name, before, after)
			}
		})
	}
}

// assertNoSolvedFigures pins the scenario's second clause: "no field of F's
// position, velocity, roster, or fuel appears in the response body". The
// preview's whole output is derived from all four, so a rejection carrying any
// numeric payload at all is a disclosure.
func assertNoSolvedFigures(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	var body map[string]any
	if err := jsonUnmarshalLenient(w.Body.Bytes(), &body); err != nil || body == nil {
		return // empty or non-JSON body: nothing disclosed
	}
	for _, k := range []string{"position", "velocity", "state", "roster", "cargo", "fuel", "curve",
		"departMs", "arriveMs", "accel"} {
		if len(numbersByKey(body, k)) > 0 {
			raw, _ := json.Marshal(body)
			t.Errorf("the 404 rejection body carries a `%s` value: %s. The preview's response is solved "+
				"from the fleet's live position, velocity, roster-derived acceleration and held fuel — "+
				"none of which this capability discloses to a foreign requester by any other path", k, raw)
		}
		if _, present := body[k]; present {
			raw, _ := json.Marshal(body)
			t.Errorf("the 404 rejection body carries a top-level `%s` key: %s", k, raw)
		}
	}
	if len(numericLeaves(body)) > 0 {
		raw, _ := json.Marshal(body)
		t.Errorf("the 404 rejection body carries numeric values: %s — a rejected preview returns no "+
			"solved figures at all", raw)
	}
}

// Scenario: A foreign preview is refused before anything is settled
func TestPreview_Scenario_AForeignPreviewIsRefusedBeforeAnythingIsSettled(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	intruder := spawnFuelCorp(t, router, "SDET Preview Settle-Ordering Intruder Corp")
	corplessToken := mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", corplessToken, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts for the corpless requester: status = %d", w.Code)
	}

	// A FRESH VICTIM PER SUBTEST. Each subtest leaves its victim settled at
	// the far point, from which the identical order solves an arc below
	// space.MinArcLength — so a shared victim's second arrangement fails for a
	// reason that has nothing to do with this scenario.
	for _, tc := range []struct {
		name  string
		token string
	}{
		{"a foreign corporation", intruder.token},
		{"a corpless requester", corplessToken},
	} {
		t.Run("Scenario: A foreign preview is refused before anything is settled ("+tc.name+")", func(t *testing.T) {
			victim := spawnFuelCorp(t, router, "SDET Preview Settle-Ordering Victim "+tc.name)
			setFleetFuel(t, victim.fleetId, 1_000_000)

			// Arrange a genuinely due, genuinely unsettled arrival, and read
			// NOTHING through the HTTP surface afterwards — fleet.Service.Get
			// settles a due arrival itself, so a single fleet read here would
			// pre-settle the fixture and make the assertion below pass against
			// an implementation that settles for everyone.
			if _, _, code := postOrder(t, router, victim.token, victim.fleetId, pointOrder()); code != http.StatusOK {
				t.Fatalf("arranging a running burn on the victim's fleet: status = %d", code)
			}
			forceBurnArrivalPast(t, victim.fleetId)
			if mode := storedStateMode(t, victim.fleetId); mode != "burn" {
				t.Fatalf("fixture invariant: stored mode = %q, want \"burn\" — there is no unsettled "+
					"arrival for the ordering assertion to be about", mode)
			}

			before := storedFleetJSON(t, victim.fleetId)
			w := postPreview(t, router, tc.token, victim.fleetId, pointOrder())
			if w.Code != http.StatusNotFound {
				t.Errorf("POST %s from %s: status = %d, want 404", previewPath(victim.fleetId), tc.name, w.Code)
			}
			after := storedFleetJSON(t, victim.fleetId)
			if after != before {
				t.Errorf("an unauthorized preview from %s TRIGGERED A WRITE on the victim's fleet:\n"+
					"  before: %s\n  after:  %s\nThe ownership check SHALL run BEFORE the settlement "+
					"seam and SHALL be the first thing the handler does after resolving the fleet — "+
					"otherwise the 404 is observably slower when an arrival is due than when it is not, "+
					"which is a timing side channel disclosing the victim's kinematic state",
					tc.name, before, after)
			}

			// POSITIVE CONTROL, on the same fixture: the OWNER's own preview
			// DOES settle it. Without this, an implementation with no
			// settlement anywhere passes the assertion above trivially.
			ow := postPreview(t, router, victim.token, victim.fleetId, map[string]any{
				"point": map[string]any{"x": -300_000.0, "y": 120_000.0, "z": 40_000.0}, "accel": previewAccel,
			})
			if ow.Code != http.StatusOK {
				t.Fatalf("the owner's own preview of the same fleet returned %d (body: %s)", ow.Code, ow.Body.String())
			}
			if mode := storedStateMode(t, victim.fleetId); mode == "burn" {
				t.Errorf("the OWNER's preview did not settle the due arrival either (stored mode still " +
					"\"burn\") — so the \"nothing was settled\" assertion above proves nothing about " +
					"ORDERING, only that this build settles nowhere")
			}
		})
	}
}
