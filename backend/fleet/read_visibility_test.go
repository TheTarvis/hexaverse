package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 5.7 — "Fleet Read Endpoints Serve Own Fleets Only": the two
// scenarios NOT already covered by the pre-existing (migrated-in-section-3)
// corpus. handler_test.go already pins the list-omission and
// direct-fetch-404 halves (TestList_Scenario_ForeignFleetOmittedEntirely,
// TestGet_Scenario_ForeignFleetDirectFetch404s,
// TestGet_Scenario_OwnFleetDirectFetchReturns200) — verified, not
// re-implemented here. This file adds the two it does not:
//
//   - "mine=true with no corp returns an empty list"
//   - "Own fleets are always returned in full" (own: true + full kinematic
//     state) — no existing test asserts the `own` field's value at all.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"
	"hexaverse/space"

	"github.com/gin-gonic/gin"
)

// corplessRouter mirrors newFleetRouter but resolves NO corp for the
// requester (an authenticated account with no spawned corporation) — the
// corpless "mine=true" scenario's own precondition.
func corplessRouter(svc ServiceInterface) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user-corpless")
		// deliberately no CorpIdKey set
	})
	NewHandlerWith(svc, &fakeClock{}).RegisterRoutes(r.Group("/"))
	return r
}

// Scenario: mine=true with no corp returns an empty list.
//
// EXPECTED TO PASS ON FIRST RUN: List's existing `requesterCid == ""` branch
// (handler.go) already answers `{"fleets": []}` rather than an error or a
// crash — pinned against regression, not a live bug.
func TestList_Scenario_MineTrueWithNoCorpReturnsEmptyList(t *testing.T) {
	svc := &fakeFleetSvc{list: []Fleet{{Id: "someone-elses", CorporationId: "corp-other", SystemId: "s1"}}}
	r := corplessRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets?mine=true", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("mine=true with no corp: status = %d, want 200", w.Code)
	}
	var body struct {
		Fleets []fleetDTO `json:"fleets"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Fleets) != 0 {
		t.Fatalf("mine=true with no corp returned %d fleets, want 0 (empty list, not an error)", len(body.Fleets))
	}
}

// Scenario: Own fleets are always returned in full.
//
// WHEN a requester fetches or lists their own fleets THEN every one is
// returned with own: true and its full kinematic state, regardless of any
// other corporation's presence or activity. Decoded directly into the
// production fleetDTO/space.ShipState shapes (both in-package, so directly
// referenceable) rather than a raw map, so this test does not have to take a
// position on JSON key casing the requirement itself never specifies.
func TestGet_Scenario_OwnFleetReturnsOwnTrueAndFullKinematicState(t *testing.T) {
	burn := space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
		Origin: space.Vec3{}, Target: space.Target{Point: &space.Vec3{X: 50}}, Intercept: space.Vec3{X: 50},
		Accel: 8, DepartMs: 0, ArriveMs: 100_000,
	}}
	own := &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1", State: burn}

	r := newFleetRouter(&fakeFleetSvc{fleet: own})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var dto fleetDTO
	if err := json.Unmarshal(w.Body.Bytes(), &dto); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !dto.Own {
		t.Errorf("own = %v, want true for the requester's own fleet", dto.Own)
	}
	if dto.State.Mode != space.ModeBurn || dto.State.Burn == nil {
		t.Fatalf("state = %+v, want the fleet's FULL kinematic state (a burn), not a summary", dto.State)
	}
	if dto.State.Burn.ArriveMs != 100_000 {
		t.Errorf("state.burn.arriveMs = %d, want the fleet's real stored arrival 100000 — a truncated/summarized "+
			"state would drop this", dto.State.Burn.ArriveMs)
	}
}

// Companion: the same own:true claim, exercised through the system-list
// endpoint rather than the direct fetch.
func TestList_Scenario_OwnFleetInListCarriesOwnTrue(t *testing.T) {
	svc := &fakeFleetSvc{list: []Fleet{
		{Id: "mine", CorporationId: "corp-user1", SystemId: "s1"},
	}}
	r := newFleetRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets?systemId=s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body struct {
		Fleets []fleetDTO `json:"fleets"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Fleets) != 1 {
		t.Fatalf("expected exactly one (own) fleet in the list, got %v", body.Fleets)
	}
	if !body.Fleets[0].Own {
		t.Errorf("fleets[0].own = %v, want true", body.Fleets[0].Own)
	}
}
