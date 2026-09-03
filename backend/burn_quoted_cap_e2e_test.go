package main

// RED-phase end-to-end tests for openspec change
// serve-orbital-elements-and-burn-preview, tasks.md 1.7 — fleet-movement's
// ADDED requirement "A Burn Commit Is Rejected When Its Solved Fuel Cost
// Exceeds the Requester's Quoted Cap" (all seven of its scenarios).
//
// DELIBERATELY INDEPENDENT OF THE PREVIEW ENDPOINT. Every price this suite
// needs is learned by COMMITTING the order once with ample fuel and reading
// the price off the burn the commit itself solved
// (solvedFuelCostOfCommit, burn_preview_helpers_test.go), then cancelling and
// rewinding the fleet to its pristine motion state. A cap suite that priced
// through /orders/preview would go red whenever the preview did, and the two
// halves of this change would stop being separately diagnosable.
//
// EXPECTED TO BE RED TODAY: fleet.OrderRequest carries no maxFuelTons field at
// all (fleet/model.go), so every capped commit below is accepted uncapped —
// which is precisely the failure the requirement's "Absence SHALL be
// distinguished from zero" paragraph describes reaching "by the exact value a
// defensive caller is most likely to send".

import (
	"encoding/json"
	"math"
	"net/http"
	"testing"
)

// capOrder is the point order every scenario here commits, optionally capped.
func capOrder(cap any) map[string]any {
	o := pointOrder()
	if cap != nil {
		o["maxFuelTons"] = cap
	}
	return o
}

// assertNothingCommitted pins the three "and nothing happened" clauses the cap
// scenarios share — asserted against the RE-READ STORED DOCUMENT, never the
// response body.
func assertNothingCommitted(t *testing.T, fleetId, before string, fuelBefore float64, label string) {
	t.Helper()
	if after := storedFleetJSON(t, fleetId); after != before {
		t.Errorf("%s: the rejected commit changed the fleet's stored record — no burn SHALL be stored:\n"+
			"  before: %s\n  after:  %s", label, before, after)
	}
	if id := storedActiveActionId(t, fleetId); id != "" {
		t.Errorf("%s: the rejected commit claimed the movement-channel slot (%q) — the rejection happens "+
			"BEFORE claiming the channel", label, id)
	}
	if n := runningActionCount(t, fleetId); n != 0 {
		t.Errorf("%s: the rejected commit left %d running action(s)", label, n)
	}
	if got := fleetCargoFuel(t, fleetId); got != fuelBefore {
		t.Errorf("%s: the rejected commit debited fuel (%v -> %v) — no fuel SHALL be debited",
			label, fuelBefore, got)
	}
}

// Scenario: A commit whose solved cost exceeds the quoted cap is rejected
// Scenario: The quoted-cap rejection carries the true solved cost
// Scenario: The quoted-cap rejection is distinguishable from the
//
//	insufficient-fuel rejection
func TestQuotedCap_Scenario_ACommitAboveTheCapIsRejectedAndCarriesTheTrueCost(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Quoted Cap Over-Cap Corp")
	cost := solvedFuelCostOfCommit(t, router, sp, pointOrder())

	// "GIVEN a fleet with more than enough fuel for the order" — so the
	// rejection cannot be the insufficient-fuel one wearing a different name.
	setFleetFuel(t, sp.fleetId, cost*1000)
	before := storedFleetJSON(t, sp.fleetId)
	fuelBefore := fleetCargoFuel(t, sp.fleetId)

	capped := cost / 2
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, capOrder(capped), nil)
	if w.Code == http.StatusOK {
		t.Fatalf("a burn committed with maxFuelTons = %v was ACCEPTED even though its solved fuel cost is "+
			"%v. A solved cost strictly greater than the cap SHALL be rejected", capped, cost)
	}
	assertNothingCommitted(t, sp.fleetId, before, fuelBefore, "over-cap commit")

	capMsg := errorMessage(w)
	if capMsg == "" {
		t.Errorf("the over-cap rejection carries no named reason (status %d, body %q) — the requirement "+
			"is \"its own named rejection reason\"", w.Code, w.Body.String())
	}

	// Scenario: The quoted-cap rejection carries the true solved cost.
	// Name-agnostic: the spec names no key for it, so the assertion is that
	// the number itself is present somewhere in the rejection body.
	var body map[string]any
	_ = jsonUnmarshalLenient(w.Body.Bytes(), &body)
	if !containsNumber(numericLeaves(body), cost, 1e-9) {
		raw, _ := json.Marshal(body)
		t.Errorf("the quoted-cap rejection does not carry the order's solved fuel cost (%v tons) anywhere "+
			"in its body: %s. \"The rejection response SHALL carry the solved fuel cost, so the requester "+
			"can re-quote against the true figure without a second round trip\"", cost, raw)
	}

	// Scenario: The quoted-cap rejection is distinguishable from the
	// insufficient-fuel rejection. Same fleet, same order, same origin — only
	// the cause differs.
	setFleetFuel(t, sp.fleetId, cost/1000)
	poor := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, pointOrder(), nil)
	if poor.Code == http.StatusOK {
		t.Fatalf("the uncapped commit with %v tons against a %v-ton order SUCCEEDED — there is no "+
			"insufficient-fuel rejection to distinguish the cap's from", cost/1000, cost)
	}
	poorMsg := errorMessage(poor)
	if capMsg != "" && capMsg == poorMsg {
		t.Errorf("the quoted-cap rejection and the insufficient-fuel rejection carry the IDENTICAL reason "+
			"(%q). One answers \"this fleet cannot pay\" and the other \"this cost is higher than the one "+
			"the requester agreed to\"; a fleet with ample fuel can hit the first and a fleet with a "+
			"generous cap the second, so a caller must be able to tell them apart", capMsg)
	}
}

// Scenario: A commit exactly at the quoted cap succeeds
func TestQuotedCap_Scenario_ACommitExactlyAtTheCapSucceeds(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Quoted Cap Exactly-At Corp")
	cost := solvedFuelCostOfCommit(t, router, sp, pointOrder())
	setFleetFuel(t, sp.fleetId, cost*1000)

	resp, _, code := postOrder(t, router, sp.token, sp.fleetId, capOrder(cost))
	if code != http.StatusOK {
		w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, capOrder(cost), nil)
		t.Fatalf("a burn committed with maxFuelTons EXACTLY equal to its own solved cost (%v) was rejected "+
			"(status %d, body %s). \"The rejection is on strictly-greater, not on equal\" — a client that "+
			"sends back exactly the previewed cost as its cap must not be rejected by its own quote",
			cost, code, w.Body.String())
	}
	if resp.State.Burn == nil {
		t.Fatal("the exactly-at-cap commit returned no burn")
	}
	// The premise, verified: the burn actually solved is the one that was
	// priced. If the second solve drifted, "exactly at the cap" was never
	// tested.
	if got := resp.State.Burn.DeltaV() / deltaVPerTonPlaceholder; math.Abs(got-cost) > 1e-9*math.Abs(cost) {
		t.Fatalf("fixture invariant: the capped commit priced %v tons but the probe priced %v — the two "+
			"commits did not solve the identical burn", got, cost)
	}
	if id := storedActiveActionId(t, sp.fleetId); id == "" {
		t.Errorf("the exactly-at-cap commit reported success but claimed no movement-channel slot — the " +
			"burn was not actually committed")
	}
}

// Scenario: An absent cap applies no cap
func TestQuotedCap_Scenario_AnAbsentCapAppliesNoCap(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Quoted Cap Absent Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	order := pointOrder()
	if _, present := order["maxFuelTons"]; present {
		t.Fatal("fixture invariant: the order body must OMIT maxFuelTons entirely")
	}
	resp, _, code := postOrder(t, router, sp.token, sp.fleetId, order)
	if code != http.StatusOK || resp.State.Burn == nil {
		t.Fatalf("a burn committed with no maxFuelTons field was rejected (status %d) — \"when maxFuelTons "+
			"is absent, no cap SHALL be applied and the commit SHALL behave exactly as it did before this "+
			"change\"", code)
	}
	if id := storedActiveActionId(t, sp.fleetId); id == "" {
		t.Error("the uncapped commit reported success but claimed no movement-channel slot")
	}
	if fleetCargoFuel(t, sp.fleetId) >= 1_000_000 {
		t.Error("the uncapped commit debited no fuel — the pre-change commit path must be byte-for-byte " +
			"unchanged, which includes its debit")
	}
}

// Scenario: A cap of exactly zero is a present cap, not an absent one
func TestQuotedCap_Scenario_ACapOfExactlyZeroIsAPresentCap(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Quoted Cap Zero Corp")
	cost := solvedFuelCostOfCommit(t, router, sp, pointOrder())
	if !(cost > 0) {
		t.Fatalf("fixture invariant: the order's solved fuel cost is %v, want strictly positive — a zero "+
			"cap over a zero-cost order proves nothing", cost)
	}
	setFleetFuel(t, sp.fleetId, cost*1000)
	before := storedFleetJSON(t, sp.fleetId)
	fuelBefore := fleetCargoFuel(t, sp.fleetId)

	// json.Marshal of the untyped 0 emits `{"maxFuelTons":0}` — the literal
	// body the requirement says a plain Go float64 field cannot distinguish
	// from an omitted key.
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, capOrder(0), nil)
	if w.Code == http.StatusOK {
		t.Fatalf("a burn committed with maxFuelTons = 0 against an order costing %v tons was ACCEPTED. A "+
			"cap of exactly 0 is a PRESENT cap — the caller asserting the order must cost nothing — and "+
			"SHALL reject any order whose solved fuel cost is strictly positive. A plain Go float64 field "+
			"makes {\"maxFuelTons\":0} indistinguishable from an omitted key, which turns a caller's "+
			"strictest possible cap into no cap at all", cost)
	}
	assertNothingCommitted(t, sp.fleetId, before, fuelBefore, "zero-cap commit")

	// It must be the SAME reason an ordinary over-cap rejection carries, not a
	// separate malformed-request rejection: zero is a valid, honoured cap.
	zeroMsg := errorMessage(w)
	over := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, capOrder(cost/2), nil)
	if overMsg := errorMessage(over); overMsg != "" && zeroMsg != overMsg {
		t.Errorf("a cap of exactly 0 is rejected with reason %q while an ordinary over-cap rejection "+
			"carries %q. Zero is \"honoured as a cap rather than read as an omitted field\", so it takes "+
			"the quoted-cap rejection, not some other one", zeroMsg, overMsg)
	}
	if over.Code != w.Code {
		t.Errorf("a cap of exactly 0 answers %d while an ordinary over-cap rejection answers %d",
			w.Code, over.Code)
	}
}

// Scenario: A malformed cap is an invalid request, not an absent cap
func TestQuotedCap_Scenario_AMalformedCapIsAnInvalidRequest(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Quoted Cap Malformed Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	cases := map[string]any{
		"a negative cap":                 -1.0,
		"a non-finite cap (JSON 1e400)":  json.RawMessage("1e400"),
		"a non-finite cap (JSON -1e400)": json.RawMessage("-1e400"),
	}
	for name, v := range cases {
		t.Run("Scenario: A malformed cap is an invalid request, not an absent cap ("+name+")", func(t *testing.T) {
			before := storedFleetJSON(t, sp.fleetId)
			fuelBefore := fleetCargoFuel(t, sp.fleetId)

			w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/orders", sp.token, capOrder(v), nil)
			if w.Code == http.StatusOK {
				t.Fatalf("a burn committed with maxFuelTons = %v was ACCEPTED. A negative or non-finite cap "+
					"SHALL be rejected as an INVALID REQUEST rather than treated as absent — treating it "+
					"as absent commits the order uncapped, which is the outcome the cap exists to "+
					"prevent", v)
			}
			if w.Code != http.StatusBadRequest {
				t.Errorf("maxFuelTons = %v was rejected with status %d, want 400 — it is a malformed "+
					"request, not a state conflict or a quoted-cap rejection (body: %s)",
					v, w.Code, w.Body.String())
			}
			assertNothingCommitted(t, sp.fleetId, before, fuelBefore, "malformed-cap commit ("+name+")")
		})
	}
}
