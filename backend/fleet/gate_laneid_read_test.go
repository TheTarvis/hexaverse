package fleet

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 4.13 (backend half) / fleet-movement spec.md ADDED "Fleet Read
// Serves the Attached Gate's Lane Id":
//
//	GET /v1/fleets/:fleetId, GET /v1/fleets?systemId=, and
//	GET /v1/fleets?mine=true SHALL include a `laneId` field on an owned
//	fleet that is attached to a lane-gate body, naming that gate's lane id
//	(galaxy.LaneIdBetween of the fleet's current system and the gate's
//	destination system — the same id system-interior's "Lane-Gate Bodies
//	Carry Their Lane Id" serves on that gate body), from a source neither
//	filtered by nor derived from the corporation's charted-lane set. The
//	field SHALL be absent or empty when the fleet is not attached to a
//	lane-gate body.
//
// THE DEFECT: as shipped, `fleetDTO` (handler.go) carries no `laneId` field
// at all — `toDTO` never computes one. This is the backend half of the same
// wiring gap galaxy-view's own "Jump Commit" needs closed on the frontend
// side (GalaxyView.tsx's handleJump) — tasks.md 4.13 explicitly forbids
// resolving this id by matching `GET /v1/galaxy`'s links[] (charted-
// filtered, and therefore empty for exactly the fresh-attachment case this
// field exists to serve); the fix must derive it purely from
// galaxy.LaneIdBetween(fleet.SystemId, the gate's destination system),
// parsed off AttachedTo's "gate-"+destSystemId convention
// (system.gateId's own naming, mirrored by charts.GateAttachmentWrite's
// gateBodyPrefix and GalaxyView.tsx's own isGateBody today).
//
// All three read endpoints funnel through the SAME handler.toDTO — Get and
// List(systemId=) are exercised directly (real HTTP entry points a player's
// own client hits); the third (?mine=true) shares toDTO's exact code path
// through ListForCorp, exercised once more below for full traceability
// against the requirement's own three named endpoints.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/galaxy"
)

// Scenario: An attached fleet's read carries its gate's lane id — direct
// fetch (GET /v1/fleets/:fleetId).
func TestGet_Scenario_AttachedFleetReadCarriesGatesLaneId(t *testing.T) {
	f := &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "sys-0", AttachedTo: "gate-sys-1"}
	r := newFleetRouter(&fakeFleetSvc{fleet: f})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", w.Code, w.Body.String())
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	want := galaxy.LaneIdBetween("sys-0", "sys-1")
	got, _ := body["laneId"].(string)
	if got != want {
		t.Fatalf("laneId = %q, want %q (galaxy.LaneIdBetween(fleet.SystemId, the gate's destination system)) — "+
			"the fleet read must carry the attached gate's lane id, resolved with no dependency on the "+
			"corporation's charted-lane set. body = %s", got, want, w.Body.String())
	}
}

// Scenario: An unattached fleet's read carries no lane id.
//
// NOTE: this scenario is ALREADY GREEN against the shipped fleetDTO — a
// struct with no laneId field at all trivially serializes it absent for
// EVERY fleet, attached or not. It is not evidence 4.13 is done (the sibling
// "attached" test above is the genuine red); it is the regression guard for
// the negative half of the same requirement, which the fix above must not
// break by defaulting laneId to a non-empty value for an unattached fleet.
func TestGet_Scenario_UnattachedFleetReadCarriesNoLaneId(t *testing.T) {
	f := &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "sys-0"}
	r := newFleetRouter(&fakeFleetSvc{fleet: f})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if v, present := body["laneId"]; present && v != "" {
		t.Fatalf("laneId = %v, want absent or empty for an unattached fleet", v)
	}
}

// Scenario: An attached fleet's read carries its gate's lane id — the
// GET /v1/fleets?systemId= list read (the requirement's second named
// endpoint).
func TestList_Scenario_AttachedFleetReadCarriesGatesLaneId(t *testing.T) {
	f := Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "sys-0", AttachedTo: "gate-sys-1"}
	r := newFleetRouter(&fakeFleetSvc{list: []Fleet{f}})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets?systemId=sys-0", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", w.Code, w.Body.String())
	}

	var body struct {
		Fleets []map[string]interface{} `json:"fleets"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Fleets) != 1 {
		t.Fatalf("fleets = %v, want exactly one", body.Fleets)
	}
	want := galaxy.LaneIdBetween("sys-0", "sys-1")
	got, _ := body.Fleets[0]["laneId"].(string)
	if got != want {
		t.Fatalf("list read: laneId = %q, want %q", got, want)
	}
}

// Scenario: An attached fleet's read carries its gate's lane id — the
// GET /v1/fleets?mine=true list read (the requirement's third named
// endpoint). Shares handler.toDTO's exact code path with the two tests
// above; exercised once more here for direct traceability against the
// requirement's own enumerated three endpoints, not because a materially
// different code path is at risk.
func TestListMine_Scenario_AttachedFleetReadCarriesGatesLaneId(t *testing.T) {
	f := Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "sys-0", AttachedTo: "gate-sys-1"}
	r := newFleetRouter(&fakeFleetSvc{list: []Fleet{f}})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets?mine=true", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", w.Code, w.Body.String())
	}

	var body struct {
		Fleets []map[string]interface{} `json:"fleets"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Fleets) != 1 {
		t.Fatalf("fleets = %v, want exactly one", body.Fleets)
	}
	want := galaxy.LaneIdBetween("sys-0", "sys-1")
	got, _ := body.Fleets[0]["laneId"].(string)
	if got != want {
		t.Fatalf("mine=true list read: laneId = %q, want %q", got, want)
	}
}
