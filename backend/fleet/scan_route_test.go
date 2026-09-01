package fleet

// RED-phase test for openspec change replace-observation-with-sightings §5,
// task 5.2 (specs/focused-scan/spec.md "A Focused Sweep Commits On the
// Sensor Channel"). Mirrors jump_route_test.go's own established pattern
// exactly: Handler.RegisterRoutes (handler.go) wires no /scan route today,
// so this 404s genuinely against shipped code, with no dependency on
// ServiceInterface growing a Scan method (this test never calls
// fakeFleetSvc.Scan) — it therefore compiles today and stays compiling once
// the route (and the ServiceInterface method a real handler needs) exist.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandler_Scenario_ScanRouteIsWired(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1"}}
	r := newFleetRouter(svc)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/fleets/f1/scan", strings.NewReader(`{"hostId":"host-1"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Fatalf("POST /fleets/:fleetId/scan is not wired (404) — RegisterRoutes must add it "+
			"(focused-scan \"A Focused Sweep Commits On the Sensor Channel\"); got body %s", w.Body.String())
	}
}
