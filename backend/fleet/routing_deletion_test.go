package fleet

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 5.4/5.5 — "Delete fleet/routing.go wholesale: Service.PreviewRoute,
// planRoute, reconstruct, buildTrip, legMs, laneLength, ErrNoRoute,
// ErrSameSystem, RoutePreview; narrow TierSource to its ChartedLanes use
// only" and "Delete GET /v1/fleets/:fleetId/route and POST
// /v1/fleets/:fleetId/scan; ... delete WithFog/AudienceFog from
// fleet/handler.go" (design.md Decision 21A).
//
// EXPECTED TO PASS ON FIRST RUN, entirely: section 3 (commit 290ff03, "fly
// curves instead of hopping cells") already deleted routing.go wholesale and
// its two routes, and WithFog/AudienceFog, ahead of this section's own
// checklist catching up to it — handler.go's RegisterRoutes doc comment
// already lists only the surviving endpoint set, and a source grep finds
// none of these symbols. This mirrors lattice_symbols_absent_test.go's own
// documented pattern exactly (same commit, same reason): pinning an absence
// that already holds, against a future regression that would otherwise
// compile clean and go unnoticed (e.g. porting board-derived route helpers
// back in while wiring the jump verb this section adds).

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var deletedRoutingSymbols = []string{
	"PreviewRoute", "planRoute", "reconstruct", "buildTrip", "legMs", "laneLength",
	"ErrNoRoute", "ErrSameSystem", "RoutePreview", "WithFog", "AudienceFog",
}

func TestPackage_Scenario_RoutingEraSymbolsAreAbsent(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read backend/fleet: %v", err)
	}
	var violations []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue // scoped to this package's own PRODUCTION source, never its test files
		}
		raw, err := os.ReadFile(filepath.Join(".", name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		src := string(raw)
		for _, sym := range deletedRoutingSymbols {
			if strings.Contains(src, sym) {
				violations = append(violations, name+": "+sym)
			}
		}
	}
	if len(violations) > 0 {
		t.Errorf("found %d routing-era symbol reference(s) design.md Decision 21A names for deletion, want 0 "+
			"(migrate-fleet-to-continuous-burns tasks.md 5.4/5.5):\n  %s", len(violations), strings.Join(violations, "\n  "))
	}
}

func TestHandler_Scenario_RouteEndpointIsGone(t *testing.T) {
	svc := &fakeFleetSvc{fleet: &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1"}}
	r := newFleetRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1/route", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("GET /fleets/:fleetId/route status = %d, want 404 (deleted, design.md Decision 21A)", w.Code)
	}
}

// TestHandler_Scenario_ScanEndpointIsGone (DELETED —
// replace-observation-with-sightings tasks.md 5.2) used to prove
// POST /v1/fleets/:fleetId/scan stayed 404 forever, per design.md Decision
// 21A's lattice-era deletion. That absence is REMOVED by
// replace-observation-with-sightings' own focused-scan verb: chain link 5
// deliberately resurrects POST /v1/fleets/:fleetId/scan under new,
// unrelated semantics (specs/focused-scan/spec.md "A Focused Sweep Commits
// On the Sensor Channel") — the sensor channel (ActiveScanId) this test's
// own sibling suite already left "declared and unwritten" specifically so
// this link could claim it. Deleted rather than inverted, per the same
// test-immutability protocol TestJump_Scenario_RejectedUnchartedLane
// (jump_verb_test.go) and TestGetInterior_LaneGatesFogFilterToCharted
// document: an authorized change, where a LATER capability's own spec
// legitimately supersedes an EARLIER capability's regression guard.
