package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 5.6 — "Movement Command Endpoints Enforce No Fleet Ownership"
// restated over the new endpoint set: common.ActorCorp(c) is NEVER consulted
// by /orders, /cancel, /cut-drive, /stop, or /jump. This PINS the CURRENT,
// OBSERVABLE, UNFIXED behavior — design.md Decision 21 is explicit that this
// is "specced here as the current, observable behavior, not an endorsement,
// and not fixed by this change". A FAILURE here does not mean "the bug was
// found and needs fixing" — it means a handler grew an ownership check this
// recorded defect says it must not have, and that is an orchestrator
// adjudication (spec-vs-test dispute), never a silent "fix the test" or a
// silent "fix the code".
//
// EXPECTED TO PASS ON FIRST RUN for orders/cancel/cut-drive/stop: all four
// handlers (handler.go) already call straight through to the service with
// no corp check today (Get/List are the only two that check, since they
// were retrofit in section 3 — see handler.go's own Get/List doc comments).
// Only the jump sub-case is genuinely RED right now, and only because
// POST /jump 404s (the route doesn't exist yet — tasks.md 5.5): it should
// read exactly like the other four once wired, with no ownership check
// added along the way.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// foreignRequesterRouter mirrors newFleetRouter (handler_test.go) but
// resolves a DIFFERENT requester corp than the fleet under test belongs to —
// every fixture fleet here is CorporationId "corp-owner"; the request comes
// from "corp-mine".
func foreignRequesterRouter(svc ServiceInterface) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user2")
		c.Set(common.CorpIdKey, "corp-mine")
	})
	NewHandlerWith(svc, &fakeClock{}).RegisterRoutes(r.Group("/"))
	return r
}

// Scenario: A foreign corp can order another corp's fleet.
func TestHandler_Scenario_ForeignCorpCanOrderAnotherCorpsFleet(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-owner", SystemId: "s1"}}
	r := foreignRequesterRouter(svc)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/fleets/f1/orders", strings.NewReader(`{"point":{"x":10}}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("a foreign corp's order got status %d, want 200 — no ownership check is performed "+
			"(design.md Decision 21, restated as current, unfixed behavior); if this now 403s/404s, an "+
			"ownership check was added and this is a spec/test dispute for the orchestrator, not a silent fix", w.Code)
	}
}

// Scenario: A foreign corp can cancel another corp's fleet.
func TestHandler_Scenario_ForeignCorpCanCancelAnotherCorpsFleet(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-owner", SystemId: "s1"}}
	r := foreignRequesterRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/fleets/f1/cancel", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("a foreign corp's cancel got status %d, want 200 — no ownership check is performed", w.Code)
	}
}

// Scenario: A foreign corp can cut another corp's fleet's drive.
func TestHandler_Scenario_ForeignCorpCanCutDriveAnotherCorpsFleet(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-owner", SystemId: "s1"}}
	r := foreignRequesterRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/fleets/f1/cut-drive", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("a foreign corp's cut-drive got status %d, want 200 — no ownership check is performed", w.Code)
	}
}

// Scenario: A foreign corp can order another corp's fleet to stop in place.
func TestHandler_Scenario_ForeignCorpCanStopAnotherCorpsFleet(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-owner", SystemId: "s1"}}
	r := foreignRequesterRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/fleets/f1/stop", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("a foreign corp's stop got status %d, want 200 — no ownership check is performed", w.Code)
	}
}

// Scenario: A foreign corp can order another corp's fleet to jump.
func TestHandler_Scenario_ForeignCorpCanJumpAnotherCorpsFleet(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-owner", SystemId: "s1"}}
	r := foreignRequesterRouter(svc)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/fleets/f1/jump", strings.NewReader(`{"laneId":"lane-1"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("a foreign corp's jump got status %d, want 200 — no ownership check is performed (currently "+
			"404 since /jump is not wired yet, tasks.md 5.5 — once wired this must read 200, not a 403/404 "+
			"ownership rejection)", w.Code)
	}
}
