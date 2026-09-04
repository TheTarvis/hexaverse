package system

// RED-phase wire-contract test for openspec change
// replace-observation-with-sightings, tasks.md 4.11 (specs/system-interior/
// spec.md ADDED requirement "Lane-Gate Bodies Carry Their Lane Id",
// Scenario: "A materialized system's read carries each lane-gate body's
// lane id"). Reuses handler_test.go's fakeSysSvc/sysTestClock — same
// pattern as interior_endpoint_contract_test.go's own base-field-set test —
// so this pins the JSON WIRE TAG itself (`"laneId"`), not merely the Go
// struct field gates_lane_id_test.go already checks: a LaneGate.LaneId
// field with the wrong json tag (or none) would pass that test and still
// ship a wire response with no laneId a real client could read.
//
// Genuinely RED today: LaneGate carries no LaneId field at all (gates.go),
// so this file fails to compile until 4.11 adds it — legitimate red
// evidence (compile error, not a broken harness).

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// Scenario: A materialized system's read carries each lane-gate body's lane
// id — asserted at the WIRE (JSON) level, through the real handler
// (NewHandlerWith + RegisterRoutes), not merely the Go struct.
func TestGetInterior_Scenario_LaneGateBodyCarriesNonEmptyLaneIdOnTheWire(t *testing.T) {
	gen := &GeneratedInterior{Interior: SystemInterior{SystemId: "s1"}}
	gates := []LaneGate{
		{DestSystemId: "sys-neighbor-a", LaneId: "lane_0_0_10_0"},
		{DestSystemId: "sys-neighbor-b", LaneId: "lane_0_0_0_10"},
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewHandlerWith(&fakeSysSvc{gen: gen, gates: gates}, sysTestClock{}).RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body = %s", w.Code, w.Body.String())
	}

	var body struct {
		LaneGates []struct {
			DestSystemId string `json:"destSystemId"`
			LaneId       string `json:"laneId"`
		} `json:"laneGates"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(body.LaneGates) != 2 {
		t.Fatalf("laneGates count = %d, want 2", len(body.LaneGates))
	}
	byDest := map[string]string{}
	for _, g := range body.LaneGates {
		byDest[g.DestSystemId] = g.LaneId
	}
	for _, dest := range []string{"sys-neighbor-a", "sys-neighbor-b"} {
		got, ok := byDest[dest]
		if !ok {
			t.Fatalf("no gate to %q in the response: %+v", dest, body.LaneGates)
		}
		if got == "" {
			t.Errorf("gate to %q served with an EMPTY \"laneId\" on the wire — the response's laneGates entries "+
				"must carry a non-empty laneId field alongside destSystemId/cell (system-interior \"Lane-Gate "+
				"Bodies Carry Their Lane Id\")", dest)
		}
	}
}
