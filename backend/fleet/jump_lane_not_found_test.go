package fleet

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 10.16 (task 10.15's own HTTP-surface half): "commit a jump naming
// a laneId not incident to the fleet's current system and assert the
// response is 404 Not Found carrying a reason body distinguishable from
// every other mapped rejection reason — never the bodyless 500 this path
// returns today — and that no action was created and the fleet remains
// attached to its originating gate."
// (board-view "Jump Commit" / galaxy-view "Jump Commit": "A failed jump
// commit toasts the reason.")
//
// THE DEFECT: fleet/handler.go's respond has no `case` for
// galaxy.ErrLaneNotFound (backend/galaxy/lane_source.go:13, reason text
// "galaxy: lane not found for this system"). It therefore falls to the
// terminal `case err != nil:` -> c.AbortWithStatus(http.StatusInternalServerError),
// which is BODYLESS. A client-supplied laneId that is not incident to the
// fleet's current system — a pure client error — today returns a bodyless
// 500 the client cannot distinguish or map to copy.
//
// LEVEL: unit-level, handler-only (fakeFleetSvc scripts fleet.Jump's error
// return), mirroring this package's own established sibling
// (jump_fail_closed_lane_horizon_test.go's
// TestHandler_Scenario_DestinationNotReadyMapsTo503) — the handler's status
// mapping is a pure function of the returned error, so no emulator is
// needed to pin this HTTP-surface behavior. galaxy.ErrLaneNotFound's own
// production behavior (that fleet.Jump actually returns it for a
// non-incident laneId) is fleet-package/service-level territory the
// package's existing jump-rejection tests already own; this file's job is
// solely the handler's status/body mapping named by task 10.15/10.16.
//
// This test is written against the CONTRACT (task 10.15's own text: "404
// with a reason body") — never against today's implementation. It is
// expected to FAIL RED until task 10.15 adds the missing case; that is a
// developer's job, not this file's.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/galaxy"
)

// Scenario: A failed jump commit toasts the reason (board-view / galaxy-view
// "Jump Commit") — specialized here to the "lane not incident to the
// fleet's current system" rejection task 10.15 names.
func TestHandler_Scenario_LaneNotIncidentToCurrentSystemIs404WithReasonBody(t *testing.T) {
	own := &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1"}
	r := newFleetRouter(&fakeFleetSvc{fleet: own, jumpErr: galaxy.ErrLaneNotFound})
	w := httptest.NewRecorder()
	body := strings.NewReader(`{"laneId":"lane-not-incident-to-s1"}`)
	req := httptest.NewRequest(http.MethodPost, "/fleets/f1/jump", body)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	// --- Status: 404, never the bodyless 500 this path returns today ------
	if w.Code == http.StatusInternalServerError {
		t.Fatalf("board-view/galaxy-view \"Jump Commit\": \"A failed jump commit toasts the reason\" — a laneId not "+
			"incident to the fleet's current system (galaxy.ErrLaneNotFound) fell through to the bodyless "+
			"catch-all 500 (fleet/handler.go's respond has no case for galaxy.ErrLaneNotFound) — got status %d, "+
			"body %q", w.Code, w.Body.String())
	}
	if w.Code != http.StatusNotFound {
		t.Fatalf("board-view/galaxy-view \"Jump Commit\": expected 404 Not Found for a laneId not incident to the "+
			"fleet's current system — got status %d, body %q", w.Code, w.Body.String())
	}

	// --- Body: non-empty AND machine-distinguishable, never bodyless -------
	// task 10.15's text is explicit that this must carry "a reason body";
	// a 404 with an empty body (e.g. c.AbortWithStatus(404) with no JSON)
	// would pass a status-only check but leave frontend/lib/jump-copy.ts
	// unable to map it, which is exactly the defect this test guards
	// against, not just the wrong status code.
	if w.Body.Len() == 0 {
		t.Fatalf("board-view/galaxy-view \"Jump Commit\": the 404 for a lane not incident to the fleet's current " +
			"system must carry a reason body (task 10.15) — got an EMPTY body")
	}
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("expected the 404 body to be JSON carrying a reason field — got unparseable body %q: %v",
			w.Body.String(), err)
	}
	if strings.TrimSpace(payload.Error) == "" {
		t.Fatalf("expected the 404 body's \"error\" field to be non-empty — got body %q", w.Body.String())
	}

	// --- Distinguishable from every OTHER mapped rejection reason ----------
	// The reason text itself must differ from this package's other named
	// jump-rejection reasons, so a client (frontend/lib/jump-copy.ts) can
	// map this rejection to its own copy rather than conflating it with
	// "not attached", "already in transit", or "destination not ready".
	otherReasons := map[string]string{
		"ErrJumpNotAttached":     ErrJumpNotAttached.Error(),
		"ErrFleetInTransit":      ErrFleetInTransit.Error(),
		"ErrDestinationNotReady": ErrDestinationNotReady.Error(),
		"ErrScanHostUnresolved":  ErrScanHostUnresolved.Error(),
	}
	for name, reason := range otherReasons {
		if payload.Error == reason {
			t.Errorf("the lane-not-incident 404's reason body must be distinguishable from %s's own reason text — "+
				"both were %q", name, reason)
		}
	}
	// ErrNotFound's own 404 (a foreign/nonexistent fleet, and this
	// package's OTHER 404) is deliberately bodyless (design.md Decision
	// 21) — so a non-empty body alone already distinguishes this
	// rejection from that one; asserted explicitly for the record.
	if payload.Error == "" {
		t.Errorf("a lane-not-incident-to-current-system rejection must not be indistinguishable from " +
			"ErrNotFound's bodyless 404")
	}
}
