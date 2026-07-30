package mine

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// mine-extraction spec: "Mine Command Endpoint", "Mine Commit Rejections
// Report a Distinguishable Reason" (tasks 2.4, 4.1, 4.5, 5.2, 5.3). HTTP
// status/body mapping tests against a fake ServiceInterface — no real
// preconditions exercised here (service_test.go owns those); this level
// proves handler.go's error→status→body mapping. All red now: handler.Commit
// is a stub (always 501) regardless of what the fake service returns.

type fakeMineSvc struct {
	action *action.Action
	err    error
}

func (f *fakeMineSvc) Commit(context.Context, string, string, MineRequest) (*action.Action, error) {
	return f.action, f.err
}

func newMineRouter(svc ServiceInterface, authenticated bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if authenticated {
			c.Set(common.AccountIdKey, "user1")
			c.Set(common.CorpIdKey, "corp-user1")
		}
	})
	NewHandlerWith(svc, testHandlerClock{}).RegisterRoutes(r.Group("/"))
	return r
}

type testHandlerClock struct{}

func (testHandlerClock) Now() common.WorldMillis               { return 1000 }
func (testHandlerClock) FromWall(time.Time) common.WorldMillis { return 1000 }
func (testHandlerClock) Scale() float64                        { return 1 }

func postMine(r *gin.Engine, body MineRequest) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/fleets/f1/mine", bytes.NewReader(b)))
	return w
}

func errorField(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		return ""
	}
	s, _ := body["error"].(string)
	return s
}

// Scenario: An unauthenticated mine request is rejected.
func TestHandlerCommit_Scenario_Unauthenticated(t *testing.T) {
	r := newMineRouter(&fakeMineSvc{err: ErrUnauthenticated}, false /* no account set */)
	w := postMine(r, validRequest())
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

// Scenario: A foreign corporation cannot mine with another corp's fleet.
func TestHandlerCommit_Scenario_ForeignCorpRejected(t *testing.T) {
	r := newMineRouter(&fakeMineSvc{err: ErrForeignFleet}, true)
	w := postMine(r, validRequest())
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (existence hidden, per design.md Decision #10)", w.Code)
	}
}

// Scenario: A committed mine run returns its action and ETA.
func TestHandlerCommit_Scenario_ReturnsActionIdAndEta(t *testing.T) {
	a := &action.Action{Id: "action_abc", Eta: 5000, Status: action.StatusRunning}
	r := newMineRouter(&fakeMineSvc{action: a}, true)
	w := postMine(r, validRequest())
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", w.Code, w.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["actionId"] != "action_abc" {
		t.Errorf("response actionId = %v, want action_abc: %v", body["actionId"], body)
	}
	if eta, ok := body["eta"].(float64); !ok || eta != 5000 {
		t.Errorf("response eta = %v, want 5000: %v", body["eta"], body)
	}
}

// Scenario: A retried commit after a lost response fails closed.
func TestHandlerCommit_Scenario_RetryAfterLostResponseFailsClosed(t *testing.T) {
	r := newMineRouter(&fakeMineSvc{err: action.ErrActiveActionExists}, true)
	w := postMine(r, validRequest())
	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (the original commit already claimed the slot)", w.Code)
	}
}

// preconditionCases enumerates every commit-time rejection this capability
// defines (design.md "Mine Commit Rejections Report a Distinguishable
// Reason"), each with its required HTTP status.
func preconditionCases() []struct {
	name   string
	err    error
	status int
} {
	return []struct {
		name   string
		err    error
		status int
	}{
		{"foreign fleet", ErrForeignFleet, http.StatusNotFound},
		{"invalid tonnage", ErrInvalidTonnage, http.StatusBadRequest},
		{"sub-minimum run", ErrSubMinimumRun, http.StatusBadRequest},
		{"not docked", ErrNotDocked, http.StatusBadRequest},
		{"unknown kind", ErrUnknownKind, http.StatusBadRequest},
		{"over free hold", ErrOverFreeHold, http.StatusBadRequest},
		{"no mining capability", ErrNoMiningCapability, http.StatusBadRequest},
		{"lode depleted", ErrLodeDepleted, http.StatusBadRequest},
		{"busy: burning", fmt.Errorf("%s: %w", BusyReason("burn"), action.ErrActiveActionExists), http.StatusConflict},
		{"busy: lane transit", fmt.Errorf("%s: %w", BusyReason("lane-travel"), action.ErrActiveActionExists), http.StatusConflict},
		{"busy: already mining", fmt.Errorf("%s: %w", BusyReason("mine"), action.ErrActiveActionExists), http.StatusConflict},
	}
}

// Scenario: Each commit rejection reason is distinguishable from the others.
func TestHandlerCommit_Scenario_EachRejectionReasonIsDistinguishable(t *testing.T) {
	seen := map[string]string{} // reason text -> first case name that produced it
	for _, tc := range preconditionCases() {
		r := newMineRouter(&fakeMineSvc{err: tc.err}, true)
		w := postMine(r, validRequest())
		if w.Code != tc.status {
			t.Errorf("%s: status = %d, want %d", tc.name, w.Code, tc.status)
			continue
		}
		reason := errorField(t, w)
		if reason == "" {
			t.Errorf("%s: response has no non-empty `error` reason (body: %s)", tc.name, w.Body.String())
			continue
		}
		if prior, dup := seen[reason]; dup {
			t.Errorf("%s and %s share the same reason text %q — every rejection must be distinguishable", tc.name, prior, reason)
			continue
		}
		seen[reason] = tc.name
	}
}

// Scenario: A busy-slot rejection names the occupying action kind.
func TestHandlerCommit_Scenario_BusySlotNamesOccupyingKind(t *testing.T) {
	cases := []struct {
		activeType string
		want       string
	}{
		{"burn", BusyReason("burn")},
		{"lane-travel", BusyReason("lane-travel")},
		{"mine", BusyReason("mine")},
	}
	reasons := map[string]bool{}
	for _, tc := range cases {
		wrapped := fmt.Errorf("%s: %w", tc.want, action.ErrActiveActionExists)
		r := newMineRouter(&fakeMineSvc{err: wrapped}, true)
		w := postMine(r, validRequest())
		if w.Code != http.StatusConflict {
			t.Errorf("activeType=%s: status = %d, want 409", tc.activeType, w.Code)
			continue
		}
		reason := errorField(t, w)
		if reason == "" || !errors.Is(wrapped, action.ErrActiveActionExists) {
			t.Errorf("activeType=%s: no distinguishing reason in response (body: %s)", tc.activeType, w.Body.String())
			continue
		}
		if reasons[reason] {
			t.Errorf("activeType=%s produced a reason (%q) already seen for another occupying kind — busy-slot reasons must distinguish burn/lane-transit/mine", tc.activeType, reason)
		}
		reasons[reason] = true
	}
}
