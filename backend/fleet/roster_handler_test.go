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
//
// migrate-fleet-to-continuous-burns, design.md Decision 2 (MODIFIED): the
// second scenario's body changed from "a foreign fleet is redacted [to a
// snapshot without roster]" to "a foreign fleet is not returned [at all]" —
// see handler_test.go's TestGet_Scenario_ForeignFleetDirectFetch404s /
// TestList_Scenario_ForeignFleetOmittedEntirely for the omission half; the
// two tests below are migrated to assert that, not a roster-redacted 200.

// Scenario: The fleet read response includes roster, cargo, and derived
// capacity.
func TestGet_Scenario_OwnFleetReadIncludesRosterCargoAndCapacity(t *testing.T) {
	own := &Fleet{
		Id: "f1", CorporationId: "corp-user1", SystemId: "s1",
		Ships: []ShipEntry{{Class: ClassSeed}},
	}

	r := newFleetRouter(&fakeFleetSvc{fleet: own})
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

// Scenario: A foreign fleet's cargo and roster are not disclosed — migrated
// to the post-Decision-11 shape: the foreign fleet is not returned at all
// (404), so there is no partial response for roster/cargo to be absent from.
func TestGet_Scenario_ForeignFleetOmitsRosterAndCargo(t *testing.T) {
	foreign := &Fleet{
		Id: "f1", CorporationId: "corp-other", SystemId: "s1",
		Ships: []ShipEntry{{Class: ClassSeed}, {Class: ClassSeed}},
	}
	r := newFleetRouter(&fakeFleetSvc{fleet: foreign})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (a foreign fleet is not returned at all — design.md Decision 11)", w.Code)
	}
	if strings.Contains(w.Body.String(), `"roster"`) {
		t.Fatalf("a 404 response must carry no fleet data at all, got: %s", w.Body.String())
	}
}

// TestList_Scenario_ForeignFleetOmitsRosterAndCargo is the same
// non-disclosure exercised through the system-list endpoint — migrated to
// assert the foreign fleet is absent from the list entirely (design.md
// Decision 11), not merely stripped of its roster field.
func TestList_Scenario_ForeignFleetOmitsRosterAndCargo(t *testing.T) {
	svc := &fakeFleetSvc{list: []Fleet{
		{Id: "mine", CorporationId: "corp-user1", SystemId: "s1", Ships: []ShipEntry{{Class: ClassSeed}}},
		{Id: "theirs", CorporationId: "corp-other", SystemId: "s1", Ships: []ShipEntry{{Class: ClassSeed}}},
	}}
	r := newFleetRouter(svc)
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
	var mine map[string]interface{}
	foreignPresent := false
	for _, f := range body.Fleets {
		if f["id"] == "mine" {
			mine = f
		}
		if f["id"] == "theirs" {
			foreignPresent = true
		}
	}
	if mine == nil {
		t.Fatalf("own fleet missing from the list response: %v", body.Fleets)
	}
	if _, present := mine["roster"]; !present {
		t.Errorf("own fleet in the list response must carry `roster`, got %v", mine)
	}
	if foreignPresent {
		t.Errorf("foreign fleet must be omitted from the list response entirely, got %v", body.Fleets)
	}
}
