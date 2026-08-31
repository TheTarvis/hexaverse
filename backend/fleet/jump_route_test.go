package fleet

// RED-phase test for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 5.5 — "add POST /v1/fleets/:fleetId/jump". Genuinely RED:
// Handler.RegisterRoutes (handler.go) wires only GET "", GET "/:fleetId",
// POST "/:fleetId/orders", "/cancel", "/cut-drive", "/stop" today — its own
// doc comment says as much ("/jump is chain link 4 section 5's own verb and
// is not wired by this section's own scope"). This mirrors
// cutdrive_stop_route_test.go's own established pattern exactly.
//
// Note for whoever implements this: once Handler.Jump exists and calls
// h.svc.Jump(...), ServiceInterface will need a Jump method, and
// handler_test.go's fakeFleetSvc will need a matching stub — the same
// mechanical step CutDrive/Stop already went through in section 4. This
// test does not itself require that (it never calls fakeFleetSvc.Jump), so
// it compiles and is genuinely red (404) against today's code regardless.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandler_Scenario_JumpRouteIsWired(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1"}}
	r := newFleetRouter(svc)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/fleets/f1/jump", strings.NewReader(`{"laneId":"lane-1"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Fatalf("POST /fleets/:fleetId/jump is not wired (404) — RegisterRoutes must add it "+
			"(fleet-movement \"Lane Jump From a Docked Gate\"); got body %s", w.Body.String())
	}
}
