package system

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 7.9 (specs/system-interior/spec.md ADDED requirement "Interior
// Read Endpoint Serves Unfogged Features"): the base `GET
// /v1/systems/:systemId` endpoint contract, RESTATED not changed by this
// migration — served fields, and the two 404 causes — alongside 7.7's
// unfogged interim body.
//
// SDET NOTE ON RED DISCIPLINE: this file is the one place in section 7
// where a legitimate FIRST-RUN PASS is expected and correct. 7.9 is
// explicit that this contract is "restated (not changed)" by the migration
// — the 404 branches (ErrNotFound / galaxy.ErrSystemNotFound /
// galaxy.ErrNoLiveGalaxy → 404) and the served-fields set already exist in
// handler.go untouched by 7.1-7.8's work. These tests exist to PIN the
// contract against regression while 7.7's rewrite is in flight — a
// developer replacing fog.go/fog_source.go/handler.go could accidentally
// drop a field or a 404 branch along the way, and nothing else in the red
// suite would catch it (7.7's own tests only assert what the response body
// contains for a 200, never the 404 causes or the non-Features fields).
// Reuses fakeSysSvc/sysTestClock from handler_test.go.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"

	"github.com/gin-gonic/gin"
)

// Scenario: Unknown or ungenerated system
func TestGetInterior_Scenario_UnknownOrUngeneratedSystem404s(t *testing.T) {
	cases := map[string]error{
		"system.ErrNotFound":       ErrNotFound,
		"galaxy.ErrSystemNotFound": galaxy.ErrSystemNotFound,
	}
	for label, svcErr := range cases {
		t.Run(label, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			r := gin.New()
			NewHandlerWith(&fakeSysSvc{err: svcErr}, sysTestClock{}).RegisterRoutes(r.Group("/"))

			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/sys-unknown", nil))
			if w.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404 for %s", w.Code, label)
			}
		})
	}
}

// Scenario: No live galaxy
func TestGetInterior_Scenario_NoLiveGalaxy404s(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewHandlerWith(&fakeSysSvc{err: galaxy.ErrNoLiveGalaxy}, sysTestClock{}).RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/sys-1", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 when no galaxy has been generated", w.Code)
	}
}

// The base contract restated: extent, character, star class, features,
// charted lane gates, and current world time all ship on a successful read.
func TestGetInterior_Scenario_ServesTheBaseFieldSet(t *testing.T) {
	gen := &GeneratedInterior{
		Interior: SystemInterior{SystemId: "s1", Character: "star-rich", StarClass: "G"},
		Features: []Feature{
			{Id: "feat-star", Type: FeatureStar},
		},
	}
	gates := []LaneGate{{DestSystemId: "sys-neighbor", LaneId: "lane_s1_sys-neighbor"}}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(common.AccountIdKey, "user1") }) // corpless: no gate/tier filter engaged
	NewHandlerWith(&fakeSysSvc{gen: gen, gates: gates}, sysTestClock{}).RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body struct {
		SystemId  string             `json:"systemId"`
		Extent    float64            `json:"extent"`
		Character string             `json:"character"`
		StarClass string             `json:"starClass"`
		Features  []json.RawMessage  `json:"features"`
		LaneGates []json.RawMessage  `json:"laneGates"`
		WorldTime common.WorldMillis `json:"worldTime"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.SystemId != "s1" {
		t.Errorf("systemId = %q, want s1", body.SystemId)
	}
	// The lattice ring count is gone from the wire (openspec
	// build-production-space-view, tasks.md 9.1); the continuous `extent` is
	// its successor and is asserted by
	// interior_wire_lattice_removal_test.go's own key-set pins.
	if body.Character != "star-rich" {
		t.Errorf("character = %q, want star-rich", body.Character)
	}
	if body.StarClass != "G" {
		t.Errorf("starClass = %q, want G", body.StarClass)
	}
	if len(body.Features) != 1 {
		t.Errorf("features count = %d, want 1", len(body.Features))
	}
	if len(body.LaneGates) != 1 {
		t.Errorf("laneGates count = %d, want 1", len(body.LaneGates))
	}
	// sysTestClock always reports world time 0 — pinning the field is present,
	// not a specific non-zero value.
	if body.WorldTime != 0 {
		t.Errorf("worldTime = %d, want 0 (sysTestClock's fixed instant)", body.WorldTime)
	}
}
