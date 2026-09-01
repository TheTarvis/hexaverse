package main

// RED-phase end-to-end tests for openspec change
// replace-observation-with-sightings, tasks.md 6.5 — action-dispatch's ADDED
// requirement "Action Endpoints Are Restricted to the Owning Corporation".
//
// NO FAKE ANYWHERE, INCLUDING NO FAKE ActorOwner. Every request below goes
// through the REAL production router (SetupRouter()) with REAL Firebase Auth
// emulator tokens, the REAL middleware chain (middlewares.ResolveCorporation
// included) and REAL Firestore actions committed by the REAL burn verb. The
// ActorOwner seam tasks.md 6.5 introduces is an implementation detail of HOW
// the handler answers these requests; these tests assert only the observable
// behaviour the six scenarios name, so an implementation that satisfies them
// is correct regardless of how the seam is shaped. The seam's SHAPE is
// pinned separately, structurally, by
// backend/action/actor_owner_seam_test.go.
//
// DELIBERATELY NOT PINNED (tasks.md 7.7 item 3): what the handler should do
// when the ownership lookup ERRORS, as opposed to resolving a definitive
// owner or finding none. No scenario decides fail-open vs fail-closed, so no
// test here creates that condition or asserts anything about it. Only the
// definitive-owner and no-corporation paths are covered.
//
// EXPECTED TO BE RED TODAY: action/handler.go's Inbox/Get/Acknowledge/Cancel
// never read common.ActorCorp(c) at all — action.Handler holds only a
// *Service and a clock — so any authenticated caller can list, read,
// acknowledge, and cancel any other corporation's actions by id.

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/fleet"
)

// victimActionFixture is one corporation, its fleet, and a freshly committed,
// still-running action on that fleet — the "actor F" and "action A" the six
// scenarios name.
type victimActionFixture struct {
	token    string
	corpId   string
	fleetId  string
	systemId string
	actionId string
}

// commitRunningBurn orders a burn toward a very distant point so the
// committed ETA is far in the future and the action is still `running` for
// the whole test, then reads the claimed movement-slot id straight off the
// fleet document (never through the action endpoints, which are the subject
// under test).
func commitRunningBurn(t *testing.T, router http.Handler, fdao fleet.Dao, adao action.Dao, ctx context.Context, token, fleetId string) string {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+fleetId+"/orders", token,
		map[string]any{"point": map[string]any{"x": 1.0e7, "y": 0.0, "z": 0.0}}, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("fixture setup: POST /v1/fleets/%s/orders: status = %d, body = %s", fleetId, w.Code, w.Body.String())
	}
	f, err := fdao.Get(ctx, fleetId)
	if err != nil || f == nil {
		t.Fatalf("fixture setup: reading fleet %q after ordering: %v", fleetId, err)
	}
	if f.ActiveActionId == "" {
		t.Fatalf("fixture setup: fleet %q claimed no movement slot after a burn order — there is no action for "+
			"these scenarios to be about", fleetId)
	}
	a, err := adao.Get(ctx, f.ActiveActionId)
	if err != nil || a == nil {
		t.Fatalf("fixture setup: reading action %q: %v", f.ActiveActionId, err)
	}
	if a.Status != action.StatusRunning {
		t.Fatalf("fixture setup: action %q is %q, not running — the burn resolved before the test could use it; "+
			"the fixture, not the behaviour under test, is broken", a.Id, a.Status)
	}
	return a.Id
}

func newVictimActionFixture(t *testing.T, router http.Handler, fdao fleet.Dao, adao action.Dao, ctx context.Context, name string) victimActionFixture {
	t.Helper()
	token, corpId, fleetId, systemId := spawnForDisclosureTest(t, router, name)
	return victimActionFixture{
		token: token, corpId: corpId, fleetId: fleetId, systemId: systemId,
		actionId: commitRunningBurn(t, router, fdao, adao, ctx, token, fleetId),
	}
}

// actionEndpoint is one of the four endpoints the requirement names, in the
// form a foreign or corpless requester would call it against victim v.
type actionEndpoint struct {
	scenario string // the spec scenario title, verbatim
	short    string // a short, filename-safe tag for subtest and fixture names
	method   string
	path     func(v victimActionFixture) string
	body     map[string]any
}

func actionEndpoints() []actionEndpoint {
	return []actionEndpoint{
		{"A foreign corp cannot list another actor's inbox", "inbox", http.MethodGet,
			func(v victimActionFixture) string { return "/v1/actions?actor=" + v.fleetId }, nil},
		{"A foreign corp cannot fetch a single action by id", "get-by-id", http.MethodGet,
			func(v victimActionFixture) string { return "/v1/actions/" + v.actionId }, nil},
		{"A foreign corp cannot acknowledge another actor's action", "acknowledge", http.MethodPost,
			func(v victimActionFixture) string { return "/v1/actions/" + v.actionId + "/acknowledge" }, map[string]any{}},
		{"A foreign corp cannot cancel another actor's action", "cancel", http.MethodPost,
			func(v victimActionFixture) string { return "/v1/actions/" + v.actionId + "/cancel" }, map[string]any{}},
	}
}

// actionFingerprint captures the fields the scenarios' THEN clauses protect:
// "action A's acknowledgment state is unchanged" and "action A continues
// running, unaffected".
func actionFingerprint(t *testing.T, adao action.Dao, ctx context.Context, id string) string {
	t.Helper()
	a, err := adao.Get(ctx, id)
	if err != nil {
		t.Fatalf("reading action %q to fingerprint it: %v", id, err)
	}
	if a == nil {
		t.Fatalf("action %q does not exist; the fixture is broken, not the behaviour under test", id)
	}
	return string(a.Status) +
		"/ack=" + strconv.FormatInt(int64(a.AcknowledgedAt), 10) +
		"/resolved=" + strconv.FormatInt(int64(a.ResolvedAt), 10)
}

// Scenario: A foreign corp cannot list another actor's inbox
// Scenario: A foreign corp cannot fetch a single action by id
// Scenario: A foreign corp cannot acknowledge another actor's action
// Scenario: A foreign corp cannot cancel another actor's action
func TestRouter_Scenario_ForeignCorporationCannotReachAnotherActorsActions(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	fs, _ := firestoreClient(t)
	ctx := context.Background()
	fdao := fleet.NewDaoWithClient(fs)
	adao := action.NewDaoWith(fs, common.WorldClock())

	intruderToken, _, _, _ := spawnForDisclosureTest(t, router, "SDET Action-Ownership Intruder Corp")

	for _, ep := range actionEndpoints() {
		t.Run("Scenario: "+ep.scenario, func(t *testing.T) {
			// A fresh victim per subtest: cancel and acknowledge are mutating,
			// and a shared fixture would make each subtest's result depend on
			// the order the previous ones ran in.
			v := newVictimActionFixture(t, router, fdao, adao, ctx, "SDET Action-Ownership Victim "+ep.short)
			before := actionFingerprint(t, adao, ctx, v.actionId)

			path := ep.path(v)
			w := doJSON(t, router, ep.method, path, intruderToken, ep.body, nil)

			if w.Code == http.StatusForbidden {
				t.Fatalf("%s %s from a foreign corporation: status = 403, want 404. action-dispatch \"Action "+
					"Endpoints Are Restricted to the Owning Corporation\" requires 404 \"— not 403 —\" because "+
					"\"a 403 would itself confirm the actor exists\" (design.md Decision 21)", ep.method, path)
			}
			if w.Code != http.StatusNotFound {
				t.Errorf("%s %s from a foreign corporation: status = %d, want 404 (body: %s)",
					ep.method, path, w.Code, w.Body.String())
			}

			// "no action belonging to F is returned" — the inbox must not leak
			// the victim's actions in a 200 body either.
			if strings.Contains(w.Body.String(), v.actionId) || strings.Contains(w.Body.String(), v.fleetId) {
				t.Errorf("%s %s: the response body names the victim's action or actor:\n%s\n"+
					"A foreign actor must be indistinguishable from a nonexistent one",
					ep.method, path, w.Body.String())
			}

			if after := actionFingerprint(t, adao, ctx, v.actionId); after != before {
				t.Errorf("%s %s from a foreign corporation CHANGED action %s:\n  before: %s\n  after:  %s\n"+
					"The scenarios require the acknowledgment state be unchanged and the action continue running, "+
					"unaffected.", ep.method, path, v.actionId, before, after)
			}
		})
	}
}

// Scenario: A corpless requester is rejected the same way
//
// "an authenticated but corpless account calls any of these four endpoints
// against an existing actor or action — THEN the response is 404 Not Found."
func TestRouter_Scenario_CorplessRequesterIsRejectedFromEveryActionEndpoint(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	fs, _ := firestoreClient(t)
	ctx := context.Background()
	fdao := fleet.NewDaoWithClient(fs)
	adao := action.NewDaoWith(fs, common.WorldClock())

	corplessToken := mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", corplessToken, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts for the corpless requester: status = %d, body = %s", w.Code, w.Body.String())
	}
	// Deliberately NOT spawning a corporation for this token.

	for _, ep := range actionEndpoints() {
		t.Run("Scenario: A corpless requester is rejected the same way ("+ep.short+")", func(t *testing.T) {
			v := newVictimActionFixture(t, router, fdao, adao, ctx, "SDET Corpless-Action Victim "+ep.short)
			before := actionFingerprint(t, adao, ctx, v.actionId)

			path := ep.path(v)
			w := doJSON(t, router, ep.method, path, corplessToken, ep.body, nil)

			if w.Code != http.StatusNotFound {
				t.Errorf("%s %s from an authenticated but CORPLESS account: status = %d, want 404 (body: %s)",
					ep.method, path, w.Code, w.Body.String())
			}
			if strings.Contains(w.Body.String(), v.actionId) || strings.Contains(w.Body.String(), v.fleetId) {
				t.Errorf("%s %s: the corpless rejection body names the victim's action or actor:\n%s",
					ep.method, path, w.Body.String())
			}
			if after := actionFingerprint(t, adao, ctx, v.actionId); after != before {
				t.Errorf("%s %s from a corpless account CHANGED action %s:\n  before: %s\n  after:  %s",
					ep.method, path, v.actionId, before, after)
			}
		})
	}
}

// Scenario: The owning corporation's own requests still succeed
//
// "an authenticated account whose corporation owns actor F calls GET
// /v1/actions?actor=F, or owns action A's underlying actor and calls GET
// /v1/actions/A, POST /v1/actions/A/acknowledge, or POST /v1/actions/A/cancel
// — THEN each call succeeds exactly as it did before this ownership check was
// added."
//
// The positive control: without it, a handler that 404s unconditionally
// satisfies every rejection scenario above. The four endpoints are exercised
// in an order that keeps each one's precondition true (list → fetch →
// acknowledge → cancel), each against a freshly committed running action
// where the previous call would otherwise have consumed it.
func TestRouter_Scenario_OwningCorporationsOwnActionRequestsStillSucceed(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	fs, _ := firestoreClient(t)
	ctx := context.Background()
	fdao := fleet.NewDaoWithClient(fs)
	adao := action.NewDaoWith(fs, common.WorldClock())

	v := newVictimActionFixture(t, router, fdao, adao, ctx, "SDET Action-Owner Corp")

	t.Run("Scenario: The owning corporation's own requests still succeed (inbox)", func(t *testing.T) {
		w := doJSON(t, router, http.MethodGet, "/v1/actions?actor="+v.fleetId, v.token, nil, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("GET /v1/actions?actor=<own fleet> from its owning corporation: status = %d, want 200 "+
				"(body: %s)", w.Code, w.Body.String())
		}
		var out struct {
			Actions []struct {
				Id string `json:"id"`
			} `json:"actions"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("decoding own inbox: %v (body: %s)", err, w.Body.String())
		}
		found := false
		for _, a := range out.Actions {
			if a.Id == v.actionId {
				found = true
			}
		}
		if !found {
			t.Errorf("the owning corporation's own inbox does not contain its own running action %q — a 200 that "+
				"returns nothing satisfies the status assertion vacuously (body: %s)", v.actionId, w.Body.String())
		}
	})

	t.Run("Scenario: The owning corporation's own requests still succeed (get by id)", func(t *testing.T) {
		w := doJSON(t, router, http.MethodGet, "/v1/actions/"+v.actionId, v.token, nil, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("GET /v1/actions/<own action> from its owning corporation: status = %d, want 200 (body: %s)",
				w.Code, w.Body.String())
		}
	})

	t.Run("Scenario: The owning corporation's own requests still succeed (acknowledge)", func(t *testing.T) {
		w := doJSON(t, router, http.MethodPost, "/v1/actions/"+v.actionId+"/acknowledge", v.token, map[string]any{}, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("POST /v1/actions/<own action>/acknowledge from its owning corporation: status = %d, want "+
				"200 (body: %s)", w.Code, w.Body.String())
		}
	})

	t.Run("Scenario: The owning corporation's own requests still succeed (cancel)", func(t *testing.T) {
		fresh := commitRunningBurn(t, router, fdao, adao, ctx, v.token, v.fleetId)
		w := doJSON(t, router, http.MethodPost, "/v1/actions/"+fresh+"/cancel", v.token, map[string]any{}, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("POST /v1/actions/<own action>/cancel from its owning corporation: status = %d, want 200 "+
				"(body: %s)", w.Code, w.Body.String())
		}
		a, err := adao.Get(ctx, fresh)
		if err != nil || a == nil {
			t.Fatalf("re-reading the cancelled action: %v", err)
		}
		if a.Status != action.StatusCancelled {
			t.Errorf("the owner's own cancel left action %q in status %q, want %q — a 200 that cancels nothing "+
				"satisfies the status assertion vacuously", fresh, a.Status, action.StatusCancelled)
		}
	})
}
