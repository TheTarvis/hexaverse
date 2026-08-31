package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.3/4.5 — "Implement POST /v1/fleets/:fleetId/cut-drive" and
// "Implement POST /v1/fleets/:fleetId/stop". Handler.RegisterRoutes
// (handler.go) currently wires only GET "", GET "/:fleetId", POST
// "/:fleetId/orders", and POST "/:fleetId/cancel" — its own doc comment
// says as much ("/cut-drive, /stop, and /jump are section 4/5's verbs and
// are not wired by this section's own scope"). Both routes below 404 today,
// genuinely RED against shipped code, even though ServiceInterface already
// declares CutDrive/Stop and fakeFleetSvc (handler_test.go) already
// implements them — the verb exists at the service layer; the door to reach
// it over HTTP does not yet exist.

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandler_Scenario_CutDriveRouteIsWired(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1"}}
	r := newFleetRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/fleets/f1/cut-drive", nil))
	if w.Code == http.StatusNotFound {
		t.Fatalf("POST /fleets/:fleetId/cut-drive is not wired (404) — RegisterRoutes must add it "+
			"(fleet-movement \"Cut Drive Converts the Burn to a Drift and Goes Dark\"); got body %s", w.Body.String())
	}
}

func TestHandler_Scenario_StopRouteIsWired(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1"}}
	r := newFleetRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/fleets/f1/stop", nil))
	if w.Code == http.StatusNotFound {
		t.Fatalf("POST /fleets/:fleetId/stop is not wired (404) — RegisterRoutes must add it "+
			"(fleet-movement \"Stop In Place Commits a Velocity-Nulling Burn\"); got body %s", w.Body.String())
	}
}
