package fleet

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// add-mine-extraction, fleet-movement spec delta (ADDED): "Fleet Read
// Surfaces Roster, Cargo, and Derived Capacity" (tasks 1.9/1.10/1.10a).

// Scenario: The fleet read response includes roster, cargo, and derived
// capacity.
func TestGet_Scenario_OwnFleetReadIncludesRosterCargoAndCapacity(t *testing.T) {
	own := &Fleet{
		Id: "f1", CorporationId: "corp-user1", SystemId: "s1",
		Ships: []ShipEntry{{Class: ClassSeed}},
	}

	r := newFleetRouter(&fakeFleetSvc{fleet: own}, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	roster, ok := body["roster"].(map[string]interface{})
	if !ok {
		t.Fatalf("response has no `roster` object for the owning corporation's own fleet: %s", w.Body.String())
	}
	for _, field := range []string{"ships", "cargo", "cargoCapacity", "freeHold", "miningRate"} {
		if _, present := roster[field]; !present {
			t.Errorf("roster.%s missing from own-fleet response: %v", field, roster)
		}
	}
	// add-mine-ui, fleet-movement delta (MODIFIED): the served rate is the
	// roster's summed extraction rate — the mine UI's ETA-preview divisor.
	want := DerivedMiningRate(*own, DefaultClassStats())
	if got, _ := roster["miningRate"].(float64); got != want {
		t.Errorf("roster.miningRate = %v, want the roster's summed rate %v", got, want)
	}
}

// Scenario: A foreign fleet's cargo and roster are not disclosed (GET
// /v1/fleets/:fleetId).
func TestGet_Scenario_ForeignFleetOmitsRosterAndCargo(t *testing.T) {
	foreign := &Fleet{
		Id: "f1", CorporationId: "corp-other", SystemId: "s1",
		Ships: []ShipEntry{{Class: ClassSeed}, {Class: ClassSeed}},
	}
	r := newFleetRouter(&fakeFleetSvc{fleet: foreign}, fakeAudience{visible: true})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (fleet is inside coverage)", w.Code)
	}
	if strings.Contains(w.Body.String(), `"roster"`) {
		t.Fatalf("foreign fleet response must omit `roster` entirely, got: %s", w.Body.String())
	}
}

// TestList_Scenario_ForeignFleetOmitsRosterAndCargo is the same redaction rule
// exercised through the system-list endpoint (the other surface the
// requirement names).
func TestList_Scenario_ForeignFleetOmitsRosterAndCargo(t *testing.T) {
	svc := &fakeFleetSvc{list: []Fleet{
		{Id: "mine", CorporationId: "corp-user1", SystemId: "s1", Ships: []ShipEntry{{Class: ClassSeed}}},
		{Id: "theirs", CorporationId: "corp-other", SystemId: "s1", Ships: []ShipEntry{{Class: ClassSeed}}},
	}}
	r := newFleetRouter(svc, fakeAudience{visible: true})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets?systemId=s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body struct {
		Fleets []map[string]interface{} `json:"fleets"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	var mine, theirs map[string]interface{}
	for _, f := range body.Fleets {
		if f["id"] == "mine" {
			mine = f
		}
		if f["id"] == "theirs" {
			theirs = f
		}
	}
	if _, present := mine["roster"]; !present {
		t.Errorf("own fleet in the list response must carry `roster`, got %v", mine)
	}
	if _, present := theirs["roster"]; present {
		t.Errorf("foreign fleet in the list response must omit `roster` entirely, got %v", theirs)
	}
}
