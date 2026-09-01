package action

// Handler-level tests for action/handler.go — the four authenticated endpoints
// (Inbox, Get, Acknowledge, Cancel), the DTO that stamps worldTime on every
// read, and the sentinel→status→body mapping in respond().
//
// SCOPE, AND WHAT IS DELIBERATELY *NOT* HERE. Two other suites already own
// parts of this file's surface, and duplicating them would mean two places to
// update for one behaviour change:
//
//   - backend/router_action_ownership_e2e_test.go owns the AUTHORIZATION
//     behaviour of all four endpoints end-to-end through the real router
//     (foreign corp → 404, corpless → 404, owner → 200, victim's action
//     unchanged). Nothing here re-asserts those four status codes as its
//     subject. Where a test below needs a rejection as a precondition, it
//     guards on "not a success" and says so, leaving the exact code to the
//     e2e.
//   - backend/action/actor_owner_test.go owns the ActorOwner seam's STRUCTURAL
//     shape (the interface exists, has exactly OwnerOf with that signature, is
//     a Handler field, and has a wiring point).
//
// What is left, and what this file covers, is everything between those two:
// the request-parsing contract (missing `actor` is a 400, not a 404), the
// query-filter pass-through, worldTime stamping, the not-running/not-found/
// unexpected-error mapping, and the two failure modes of the ownership seam
// itself that the e2e cannot construct through the real router — an UNWIRED
// seam and a seam whose lookup ERRORS.
//
// These tests assert observable HTTP behaviour only — status codes, response
// bodies, and the effect of a filter on the returned set. They name no
// internal constant, helper, or field of the handler, so a refactor of HOW
// Inbox reads its query parameters leaves them green iff the behaviour is
// genuinely unchanged.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// --- rig ---------------------------------------------------------------------

const (
	// handlerTestCorp is the requesting corporation; handlerTestOtherCorp owns
	// nothing in these fixtures.
	handlerTestCorp      = "corp-requester"
	handlerTestOtherCorp = "corp-someone-else"

	handlerTestActor      = "fleet-1"
	handlerTestOtherActor = "fleet-2"

	// handlerTestNow is a distinctive world time so a stamped worldTime can
	// never be confused with a zero value or a wall-clock millis.
	handlerTestNow = common.WorldMillis(1_234_567)
)

// stubActionDao is a hand-written Dao that behaves like the real one for the
// three methods the handler's call path reaches (Get, List, Acknowledge,
// Cancel) and records what it was asked. List really does filter by actor and
// status, so "the handler forwarded the filter" is visible in the RESPONSE
// BODY rather than in a recorded call argument.
type stubActionDao struct {
	stored []Action

	getErr error

	listCalls int
	listErr   error

	ackCalls int
	ackId    string
	ackAt    common.WorldMillis
	ackErr   error

	cancelCalls      int
	cancelId         string
	cancelActorState map[string]interface{}
	cancelErr        error
}

func (d *stubActionDao) find(id string) (Action, bool) {
	for _, a := range d.stored {
		if a.Id == id {
			return a, true
		}
	}
	return Action{}, false
}

func (d *stubActionDao) Get(_ context.Context, id string) (*Action, error) {
	if d.getErr != nil {
		return nil, d.getErr
	}
	a, ok := d.find(id)
	if !ok {
		return nil, nil // absent: the real DAO returns nil,nil and Service maps it
	}
	return &a, nil
}

func (d *stubActionDao) List(_ context.Context, actor string, statuses ...Status) ([]Action, error) {
	d.listCalls++
	if d.listErr != nil {
		return nil, d.listErr
	}
	out := []Action{}
	for _, a := range d.stored {
		if a.Actor != actor {
			continue
		}
		if len(statuses) > 0 && !containsHandlerTestStatus(statuses, a.Status) {
			continue
		}
		out = append(out, a)
	}
	return out, nil
}

func (d *stubActionDao) Acknowledge(_ context.Context, id string, at common.WorldMillis) (*Action, error) {
	d.ackCalls++
	d.ackId = id
	d.ackAt = at
	if d.ackErr != nil {
		return nil, d.ackErr
	}
	a, ok := d.find(id)
	if !ok {
		return nil, ErrNotFound
	}
	a.AcknowledgedAt = at
	return &a, nil
}

func (d *stubActionDao) Cancel(_ context.Context, id string, actorState map[string]interface{}) (*Action, error) {
	d.cancelCalls++
	d.cancelId = id
	d.cancelActorState = actorState
	if d.cancelErr != nil {
		return nil, d.cancelErr
	}
	a, ok := d.find(id)
	if !ok {
		return nil, ErrNotFound
	}
	a.Status = StatusCancelled
	return &a, nil
}

// The remaining Dao methods are unreachable from the HTTP handler. They panic
// rather than returning a zero value so that a future handler change which
// starts calling one of them fails loudly instead of silently testing nothing
// (gin.New() installs no Recovery middleware here, so the panic surfaces).
func (d *stubActionDao) Commit(context.Context, Action, map[string]interface{}) error {
	panic("stubActionDao.Commit: no action endpoint commits; the handler's call path changed")
}

func (d *stubActionDao) ResolveOne(context.Context, string, ResolveFunc) (*Action, error) {
	panic("stubActionDao.ResolveOne: no action endpoint resolves; the handler's call path changed")
}

func (d *stubActionDao) DueIDs(context.Context, string, string, common.WorldMillis) ([]string, error) {
	panic("stubActionDao.DueIDs: no action endpoint sweeps; the handler's call path changed")
}

func (d *stubActionDao) FoldDeltas(context.Context, string, common.WorldMillis) (float64, error) {
	panic("stubActionDao.FoldDeltas: no action endpoint folds a ledger; the handler's call path changed")
}

func containsHandlerTestStatus(in []Status, want Status) bool {
	for _, s := range in {
		if s == want {
			return true
		}
	}
	return false
}

// stubActorOwner answers the ownership seam. owner is the corporation it
// resolves every actor to; err makes the lookup itself fail.
type stubActorOwner struct {
	owner string
	err   error
	calls int
}

func (o *stubActorOwner) OwnerOf(_ context.Context, _, _ string) (string, error) {
	o.calls++
	return o.owner, o.err
}

// handlerTestActions is the fixture set: one action per status on the
// requester's actor, plus one on a DIFFERENT actor. The foreign-actor entry is
// what makes "the handler forwarded the actor" a real assertion — a handler
// that queried the wrong actor would surface action_other in the body.
func handlerTestActions() []Action {
	return []Action{
		{Id: "action_running", Type: "burn", Kind: KindKinematic, Actor: handlerTestActor,
			ActorCollection: "fleets", Scope: "sys-1", Status: StatusRunning, Eta: 9_000},
		{Id: "action_done", Type: "mine", Kind: KindMutating, Actor: handlerTestActor,
			ActorCollection: "fleets", Scope: "sys-1", Status: StatusDone, Eta: 1_000},
		{Id: "action_cancelled", Type: "burn", Kind: KindKinematic, Actor: handlerTestActor,
			ActorCollection: "fleets", Scope: "sys-1", Status: StatusCancelled, Eta: 2_000},
		{Id: "action_other", Type: "burn", Kind: KindKinematic, Actor: handlerTestOtherActor,
			ActorCollection: "fleets", Scope: "sys-2", Status: StatusRunning, Eta: 9_000},
	}
}

// newHandlerRig builds the four routes over a fixed world clock. Pass a nil
// owner to model a composition root that never wired the seam.
func newHandlerRig(t *testing.T, dao *stubActionDao, owner ActorOwner, requesterCorp string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	clk := &fakeClock{}
	clk.set(handlerTestNow)

	h := NewHandlerWith(NewServiceWith(dao, clk, nil), clk)
	if owner != nil {
		h = h.WithActorOwner(owner)
	}

	r := gin.New()
	r.Use(func(c *gin.Context) {
		if requesterCorp != "" {
			c.Set(common.CorpIdKey, requesterCorp)
		}
	})
	h.RegisterRoutes(r.Group("/v1"))
	return r
}

// newOwnedRig is the common case: the requester's corporation owns the actor,
// so every request gets past the ownership seam and exercises the handler
// behaviour under test.
func newOwnedRig(t *testing.T, dao *stubActionDao) *gin.Engine {
	t.Helper()
	return newHandlerRig(t, dao, &stubActorOwner{owner: handlerTestCorp}, handlerTestCorp)
}

func doRequest(r *gin.Engine, method, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, path, nil))
	return w
}

func decodeBody(t *testing.T, w *httptest.ResponseRecorder) map[string]json.RawMessage {
	t.Helper()
	out := map[string]json.RawMessage{}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decoding response body as a JSON object: %v (status %d, body %q)", err, w.Code, w.Body.String())
	}
	return out
}

// inboxIds is the ordered list of action ids the inbox returned.
func inboxIds(t *testing.T, w *httptest.ResponseRecorder) []string {
	t.Helper()
	var body struct {
		Actions []struct {
			Id string `json:"id"`
		} `json:"actions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding the inbox body: %v (body %q)", err, w.Body.String())
	}
	ids := make([]string, 0, len(body.Actions))
	for _, a := range body.Actions {
		ids = append(ids, a.Id)
	}
	return ids
}

func equalIds(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// --- Inbox: the request contract --------------------------------------------

// GET /v1/actions has no actor in its path — the actor is a required query
// parameter, and its absence is a MALFORMED REQUEST (400 with an error body),
// not an authorization failure (404 with none). Keeping those two apart is the
// point: an operator debugging a client must be able to tell "you forgot the
// parameter" from "that actor isn't yours".
//
// The empty-string case is an SDET-added boundary probe: `?actor=` is present
// on the wire but names nobody, and must be treated exactly like absence
// rather than falling through to an ownership lookup for the empty actor id.
func TestHandlerInbox_MissingActorIsA400WithAnErrorBody(t *testing.T) {
	cases := []struct {
		name string
		path string
	}{
		{"actor absent entirely", "/v1/actions"},
		{"actor present but empty (SDET-added boundary probe)", "/v1/actions?actor="},
		{"actor absent, another filter present", "/v1/actions?status=done"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dao := &stubActionDao{stored: handlerTestActions()}
			owner := &stubActorOwner{owner: handlerTestCorp}
			r := newHandlerRig(t, dao, owner, handlerTestCorp)

			w := doRequest(r, http.MethodGet, tc.path)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("GET %s: status = %d, want 400. A request that never names an actor is malformed; "+
					"answering 404 would confuse it with the ownership rejection (body %q)",
					tc.path, w.Code, w.Body.String())
			}
			if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
				t.Errorf("GET %s: Content-Type = %q, want JSON — the 400 carries a diagnostic body", tc.path, ct)
			}
			body := decodeBody(t, w)
			raw, ok := body["error"]
			if !ok {
				t.Fatalf("GET %s: the 400 body has no \"error\" field: %s", tc.path, w.Body.String())
			}
			var msg string
			if err := json.Unmarshal(raw, &msg); err != nil || msg == "" {
				t.Fatalf("GET %s: the 400 body's \"error\" is not a non-empty string: %s", tc.path, w.Body.String())
			}
			if !strings.Contains(strings.ToLower(msg), "actor") {
				t.Errorf("GET %s: the 400 says %q, which never names the missing parameter — a client cannot act "+
					"on it", tc.path, msg)
			}
			if dao.listCalls != 0 {
				t.Errorf("GET %s: the inbox query ran %d time(s) despite the request naming no actor", tc.path, dao.listCalls)
			}
		})
	}
}

// The inbox returns the named actor's actions, narrowed by `status` when the
// caller sends one. The stub DAO applies the filter for real, so what is
// asserted here is the RESPONSE SET, not a recorded call argument: a handler
// that dropped the filter, or queried the wrong actor, returns a visibly
// different body.
//
// The `status=` (present but empty) row is an SDET-added boundary probe:
// empty means "no filter", not "match the empty status", which would return
// nothing at all.
func TestHandlerInbox_StatusFilterNarrowsTheReturnedSet(t *testing.T) {
	all := []string{"action_running", "action_done", "action_cancelled"}

	cases := []struct {
		name    string
		path    string
		wantIds []string
	}{
		{"no status filter returns every status", "/v1/actions?actor=" + handlerTestActor, all},
		{"status=running returns only the running action",
			"/v1/actions?actor=" + handlerTestActor + "&status=running", []string{"action_running"}},
		{"status=done returns only the done action",
			"/v1/actions?actor=" + handlerTestActor + "&status=done", []string{"action_done"}},
		{"status=cancelled returns only the cancelled action",
			"/v1/actions?actor=" + handlerTestActor + "&status=cancelled", []string{"action_cancelled"}},
		{"status= (empty) filters nothing (SDET-added boundary probe)",
			"/v1/actions?actor=" + handlerTestActor + "&status=", all},
		{"an unknown status matches nothing rather than everything",
			"/v1/actions?actor=" + handlerTestActor + "&status=nonesuch", []string{}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dao := &stubActionDao{stored: handlerTestActions()}
			r := newOwnedRig(t, dao)

			w := doRequest(r, http.MethodGet, tc.path)
			if w.Code != http.StatusOK {
				t.Fatalf("GET %s: status = %d, want 200 (body %q)", tc.path, w.Code, w.Body.String())
			}
			got := inboxIds(t, w)
			if !equalIds(got, tc.wantIds) {
				t.Errorf("GET %s returned %v, want %v", tc.path, got, tc.wantIds)
			}
			for _, id := range got {
				if id == "action_other" {
					t.Errorf("GET %s returned %q, an action belonging to a DIFFERENT actor — the actor named on "+
						"the wire did not reach the query", tc.path, id)
				}
			}
		})
	}
}

// Every read carries worldTime so the client can compute a server-time offset
// and animate from it: once on the inbox envelope and once on each action. A
// zero here would silently put every client's clock at the world epoch.
func TestHandlerInbox_StampsWorldTimeOnTheEnvelopeAndOnEveryAction(t *testing.T) {
	dao := &stubActionDao{stored: handlerTestActions()}
	r := newOwnedRig(t, dao)

	w := doRequest(r, http.MethodGet, "/v1/actions?actor="+handlerTestActor)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", w.Code, w.Body.String())
	}

	var body struct {
		WorldTime common.WorldMillis `json:"worldTime"`
		Actions   []struct {
			Id        string             `json:"id"`
			WorldTime common.WorldMillis `json:"worldTime"`
		} `json:"actions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding the inbox body: %v (body %q)", err, w.Body.String())
	}

	if body.WorldTime != handlerTestNow {
		t.Errorf("envelope worldTime = %d, want %d (the injected world clock's Now)", body.WorldTime, handlerTestNow)
	}
	if len(body.Actions) == 0 {
		t.Fatalf("the inbox returned no actions, so the per-action worldTime assertion below would be vacuous")
	}
	for _, a := range body.Actions {
		if a.WorldTime != handlerTestNow {
			t.Errorf("action %s carries worldTime %d, want %d — every read stamps the world clock",
				a.Id, a.WorldTime, handlerTestNow)
		}
	}
}

// SDET-added empty-collection probe. An owned actor with nothing in flight is
// an ordinary 200 whose `actions` is an empty ARRAY — not 404, and not JSON
// null, which would make a client's `actions.map(...)` throw. Go's zero-value
// slice marshals to null, so this is a real trap and not a hypothetical one.
func TestHandlerInbox_OwnedActorWithNoActionsGetsAnEmptyArray(t *testing.T) {
	dao := &stubActionDao{stored: handlerTestActions()}
	r := newOwnedRig(t, dao)

	w := doRequest(r, http.MethodGet, "/v1/actions?actor=fleet-with-nothing")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — an owned actor with no actions has an empty inbox, not a missing one "+
			"(body %q)", w.Code, w.Body.String())
	}
	body := decodeBody(t, w)
	raw, ok := body["actions"]
	if !ok {
		t.Fatalf("the 200 body has no \"actions\" field: %s", w.Body.String())
	}
	if got := strings.TrimSpace(string(raw)); got != "[]" {
		t.Errorf("actions = %s, want []. A null here breaks every client that maps over the list", got)
	}
}

// "The check runs before the query, so a foreign actor's actions are never
// read, let alone served." The e2e owns the status code of that rejection;
// what only this level can see is that the DATABASE WAS NEVER TOUCHED — a
// handler that queried first and filtered afterwards would satisfy the e2e
// while still reading another corporation's rows.
func TestHandlerInbox_ForeignActorIsRejectedBeforeTheQueryRuns(t *testing.T) {
	dao := &stubActionDao{stored: handlerTestActions()}
	owner := &stubActorOwner{owner: handlerTestOtherCorp} // the actor belongs to someone else
	r := newHandlerRig(t, dao, owner, handlerTestCorp)

	w := doRequest(r, http.MethodGet, "/v1/actions?actor="+handlerTestActor)

	// Precondition only — the exact rejection code is asserted by
	// backend/router_action_ownership_e2e_test.go, not re-asserted here.
	if w.Code >= 200 && w.Code < 300 {
		t.Fatalf("a foreign actor's inbox succeeded with status %d (body %q)", w.Code, w.Body.String())
	}
	if owner.calls == 0 {
		t.Errorf("the ownership seam was never consulted, so this request was rejected for some other reason and " +
			"the assertion below proves nothing")
	}
	if dao.listCalls != 0 {
		t.Errorf("the inbox query ran %d time(s) for an actor the requester does not own — a foreign actor's "+
			"actions must never be read, let alone served", dao.listCalls)
	}
}

// An inbox query that fails is a server fault (500), and the fault's text —
// which can name collections, indexes, and ids — must not reach the client.
func TestHandlerInbox_QueryFailureIs500AndLeaksNothing(t *testing.T) {
	const secret = "firestore: missing composite index on actions(actor,status,eta)"
	dao := &stubActionDao{stored: handlerTestActions(), listErr: errors.New(secret)}
	r := newOwnedRig(t, dao)

	w := doRequest(r, http.MethodGet, "/v1/actions?actor="+handlerTestActor)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 when the inbox query fails (body %q)", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "firestore") || strings.Contains(w.Body.String(), "index") {
		t.Errorf("the 500 body repeats the internal failure: %q", w.Body.String())
	}
}

// --- the ownership seam's own failure modes ----------------------------------

// handlerEndpoints is the four routes as a foreign/unauthorized caller would
// reach them, used by the two seam-failure tests below.
func handlerEndpoints() []struct {
	name    string
	method  string
	path    string
	mutates bool
} {
	return []struct {
		name    string
		method  string
		path    string
		mutates bool
	}{
		{"inbox", http.MethodGet, "/v1/actions?actor=" + handlerTestActor, false},
		{"get by id", http.MethodGet, "/v1/actions/action_running", false},
		{"acknowledge", http.MethodPost, "/v1/actions/action_running/acknowledge", true},
		{"cancel", http.MethodPost, "/v1/actions/action_running/cancel", true},
	}
}

// A composition root that forgets to wire the ActorOwner leaves the handler
// unable to authorize anything. The safe reading is to refuse — and to refuse
// the way every other rejection on these endpoints refuses, so a wiring defect
// is not itself a signal. This is a state the e2e cannot construct: the real
// router always wires the seam.
//
// SDET-ADDED (not a spec scenario): the requirement decides the status for a
// mismatched or absent corporation; this test applies the same "indistinguish-
// able from absence" rule to a seam that cannot answer at all.
func TestHandlerEndpoints_UnwiredOwnershipSeamRefusesEveryEndpoint(t *testing.T) {
	for _, ep := range handlerEndpoints() {
		t.Run(ep.name, func(t *testing.T) {
			dao := &stubActionDao{stored: handlerTestActions()}
			r := newHandlerRig(t, dao, nil /* seam never wired */, handlerTestCorp)

			w := doRequest(r, ep.method, ep.path)

			if w.Code != http.StatusNotFound {
				t.Errorf("%s %s with no ActorOwner wired: status = %d, want 404. An unwired seam cannot authorize "+
					"anything, and its refusal must look like every other refusal on these endpoints",
					ep.method, ep.path, w.Code)
			}
			if w.Body.Len() != 0 {
				t.Errorf("%s %s: the refusal carries a body %q; a wiring defect must not be distinguishable from "+
					"absence", ep.method, ep.path, w.Body.String())
			}
			if dao.listCalls != 0 || dao.ackCalls != 0 || dao.cancelCalls != 0 {
				t.Errorf("%s %s reached the store anyway (list=%d ack=%d cancel=%d)",
					ep.method, ep.path, dao.listCalls, dao.ackCalls, dao.cancelCalls)
			}
		})
	}
}

// When the ownership lookup itself FAILS — as opposed to resolving a definite
// owner or finding none — the one thing that must never happen is the request
// being served as if ownership had been confirmed.
//
// DELIBERATELY NOT PINNING THE STATUS CODE. handler.go's own comment records
// that no scenario in this change decides fail-open vs fail-closed for a
// lookup error ("IMPLEMENTATION CHOICE, NOT A SPEC REQUIREMENT"), and
// actor_owner_test.go and the e2e both stay silent on it for the same reason.
// So this test asserts only what the security requirement implies regardless
// of that choice: not a success, no action data in the body, and no mutation.
// If the spec later decides the code, tighten this test then — not before.
func TestHandlerEndpoints_OwnershipLookupFailureIsNeverServedAsSuccess(t *testing.T) {
	for _, ep := range handlerEndpoints() {
		t.Run(ep.name, func(t *testing.T) {
			dao := &stubActionDao{stored: handlerTestActions()}
			owner := &stubActorOwner{err: errors.New("owner lookup unavailable")}
			r := newHandlerRig(t, dao, owner, handlerTestCorp)

			w := doRequest(r, ep.method, ep.path)

			if owner.calls == 0 {
				t.Fatalf("%s %s never consulted the ownership seam, so the failing lookup this test is about never "+
					"happened", ep.method, ep.path)
			}
			if w.Code >= 200 && w.Code < 300 {
				t.Errorf("%s %s: status = %d — an ownership lookup that FAILED was answered as though ownership "+
					"had been confirmed", ep.method, ep.path, w.Code)
			}
			if strings.Contains(w.Body.String(), "action_running") {
				t.Errorf("%s %s: the response names the action despite an unresolved ownership lookup: %q",
					ep.method, ep.path, w.Body.String())
			}
			if ep.mutates && (dao.ackCalls != 0 || dao.cancelCalls != 0) {
				t.Errorf("%s %s mutated the action (ack=%d cancel=%d) despite an unresolved ownership lookup",
					ep.method, ep.path, dao.ackCalls, dao.cancelCalls)
			}
		})
	}
}

// --- respond(): sentinel → status → body -------------------------------------

// The three mutating/reading endpoints share one error mapping. ErrNotFound is
// bare absence (404, empty body — nothing to say about a thing that is not
// there); ErrNotRunning is a state conflict the client CAN act on, so it is a
// 409 that says why; anything else is an opaque 500 that leaks no internals.
func TestHandlerRespond_MapsServiceSentinelsToStatusAndBody(t *testing.T) {
	const internal = "firestore: transaction aborted on actions/action_running"

	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantBody   bool // true: a JSON error field; false: an empty body
	}{
		{"gone between the read and the write is 404 with no body", ErrNotFound, http.StatusNotFound, false},
		{"an already-resolved action is a 409 that says so", ErrNotRunning, http.StatusConflict, true},
		{"an unexpected failure is an opaque 500", errors.New(internal), http.StatusInternalServerError, false},
	}

	endpoints := []struct {
		name string
		path string
		set  func(d *stubActionDao, err error)
	}{
		{"acknowledge", "/v1/actions/action_running/acknowledge",
			func(d *stubActionDao, err error) { d.ackErr = err }},
		{"cancel", "/v1/actions/action_running/cancel",
			func(d *stubActionDao, err error) { d.cancelErr = err }},
	}

	for _, ep := range endpoints {
		for _, tc := range cases {
			t.Run(ep.name+": "+tc.name, func(t *testing.T) {
				dao := &stubActionDao{stored: handlerTestActions()}
				ep.set(dao, tc.err)
				r := newOwnedRig(t, dao)

				w := doRequest(r, http.MethodPost, ep.path)

				if w.Code != tc.wantStatus {
					t.Fatalf("POST %s with %v: status = %d, want %d (body %q)",
						ep.path, tc.err, w.Code, tc.wantStatus, w.Body.String())
				}
				if tc.wantBody {
					body := decodeBody(t, w)
					raw, ok := body["error"]
					if !ok {
						t.Fatalf("POST %s: the %d body has no \"error\" field: %s", ep.path, w.Code, w.Body.String())
					}
					var msg string
					if err := json.Unmarshal(raw, &msg); err != nil || msg == "" {
						t.Fatalf("POST %s: \"error\" is not a non-empty string: %s", ep.path, w.Body.String())
					}
				} else if w.Body.Len() != 0 {
					t.Errorf("POST %s: expected an empty body for status %d, got %q", ep.path, w.Code, w.Body.String())
				}
				if strings.Contains(w.Body.String(), "firestore") || strings.Contains(w.Body.String(), "transaction") {
					t.Errorf("POST %s: the response repeats the internal failure: %q", ep.path, w.Body.String())
				}
			})
		}
	}
}

// An action id that names nothing is absence, answered before any ownership
// question can be asked about it: 404 with an empty body. This is a different
// code path from the foreign-corp 404 the e2e covers (respond(), not the
// ownership check), and it must be indistinguishable from it on the wire.
func TestHandlerGet_UnknownActionIdIs404WithAnEmptyBody(t *testing.T) {
	dao := &stubActionDao{stored: handlerTestActions()}
	r := newOwnedRig(t, dao)

	w := doRequest(r, http.MethodGet, "/v1/actions/action_that_never_existed")

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for an action id that names nothing (body %q)", w.Code, w.Body.String())
	}
	if w.Body.Len() != 0 {
		t.Errorf("body = %q, want empty — absence says nothing about itself", w.Body.String())
	}
}

// A read of a single action returns the action's own fields at the top level
// (the DTO embeds Action rather than nesting it) plus the worldTime stamp
// beside them. Clients read `id`/`status` and `worldTime` from one object; a
// change to that shape breaks them silently.
func TestHandlerGet_ReturnsTheActionFlattenedWithAWorldTimeStamp(t *testing.T) {
	dao := &stubActionDao{stored: handlerTestActions()}
	r := newOwnedRig(t, dao)

	w := doRequest(r, http.MethodGet, "/v1/actions/action_running")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", w.Code, w.Body.String())
	}

	var got struct {
		Id        string             `json:"id"`
		Type      string             `json:"type"`
		Status    Status             `json:"status"`
		Eta       common.WorldMillis `json:"eta"`
		WorldTime common.WorldMillis `json:"worldTime"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding the action body: %v (body %q)", err, w.Body.String())
	}
	if got.Id != "action_running" {
		t.Errorf("id = %q, want %q — the action's own fields must sit at the top level", got.Id, "action_running")
	}
	if got.Type != "burn" || got.Status != StatusRunning || got.Eta != 9_000 {
		t.Errorf("the read did not carry the stored action through: type=%q status=%q eta=%d",
			got.Type, got.Status, got.Eta)
	}
	if got.WorldTime != handlerTestNow {
		t.Errorf("worldTime = %d, want %d — every read stamps the world clock beside the action",
			got.WorldTime, handlerTestNow)
	}
}

// Acknowledging stamps the WORLD clock, not the wall clock: the persisted
// acknowledgedAt is in the same units as every other stored stamp, and it
// comes back on the response.
func TestHandlerAcknowledge_StampsTheWorldClockOnTheStoredAction(t *testing.T) {
	dao := &stubActionDao{stored: handlerTestActions()}
	r := newOwnedRig(t, dao)

	w := doRequest(r, http.MethodPost, "/v1/actions/action_done/acknowledge")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", w.Code, w.Body.String())
	}
	if dao.ackCalls != 1 {
		t.Fatalf("the store was asked to acknowledge %d time(s), want exactly 1", dao.ackCalls)
	}
	if dao.ackId != "action_done" {
		t.Errorf("acknowledged %q, want %q — the id on the wire must be the id written", dao.ackId, "action_done")
	}
	if dao.ackAt != handlerTestNow {
		t.Errorf("acknowledgedAt written as %d, want %d (the injected world clock) — a wall-clock millis here "+
			"would be unreadable against every other stored stamp", dao.ackAt, handlerTestNow)
	}

	var got struct {
		AcknowledgedAt common.WorldMillis `json:"acknowledgedAt"`
		WorldTime      common.WorldMillis `json:"worldTime"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding the acknowledge body: %v (body %q)", err, w.Body.String())
	}
	if got.AcknowledgedAt != handlerTestNow || got.WorldTime != handlerTestNow {
		t.Errorf("response acknowledgedAt=%d worldTime=%d, want both %d",
			got.AcknowledgedAt, got.WorldTime, handlerTestNow)
	}
}

// The GENERIC cancel flips status and releases the slot and nothing else — it
// passes no actor state. Verbs with motion state (a burning fleet that must
// settle a coast from where it is now) cancel through their own endpoint,
// which is the only reason that endpoint exists; if the generic route started
// merging actor state, a fleet cancelled here would be silently mis-settled.
func TestHandlerCancel_SettlesNoActorState(t *testing.T) {
	dao := &stubActionDao{stored: handlerTestActions()}
	r := newOwnedRig(t, dao)

	w := doRequest(r, http.MethodPost, "/v1/actions/action_running/cancel")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", w.Code, w.Body.String())
	}
	if dao.cancelCalls != 1 {
		t.Fatalf("the store was asked to cancel %d time(s), want exactly 1", dao.cancelCalls)
	}
	if dao.cancelId != "action_running" {
		t.Errorf("cancelled %q, want %q", dao.cancelId, "action_running")
	}
	if dao.cancelActorState != nil {
		t.Errorf("the generic cancel passed actor state %v; settling motion state is the verb's own cancel "+
			"endpoint's job, not this one's", dao.cancelActorState)
	}

	var got struct {
		Status    Status             `json:"status"`
		WorldTime common.WorldMillis `json:"worldTime"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding the cancel body: %v (body %q)", err, w.Body.String())
	}
	if got.Status != StatusCancelled {
		t.Errorf("response status field = %q, want %q — a 200 that returns the still-running action would let a "+
			"client believe the cancel did not take", got.Status, StatusCancelled)
	}
	if got.WorldTime != handlerTestNow {
		t.Errorf("worldTime = %d, want %d", got.WorldTime, handlerTestNow)
	}
}
