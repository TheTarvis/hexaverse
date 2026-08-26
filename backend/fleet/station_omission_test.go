package fleet

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/board"
	"hexaverse/system"

	"github.com/gin-gonic/gin"
)

// trading-station, ADDED requirement "A Station Orbit Outside the Live Board
// Radius Is Omitted, Never Panicked" — scenario "A stored station orbit
// outside the live board radius is omitted, not panicked", the FLEET-facing
// half corrected 2026-08-26 (adversarial pass on this change): "a fleet
// docked to the omitted station reports the same missing-feature outcome any
// omitted feature produces — never a position at the core, and never a
// panic". The interior-splice half (the station omitted from the read
// itself, recorded with system id + ring) is pinned in
// backend/system/... and backend/stations/... — this file covers only the
// fleet-read consequence of an already-omitted station.
//
// noStationSystem simulates the state AFTER the interior-splice guard has
// already omitted the out-of-range station: GetOrCreateInterior succeeds and
// returns an interior with NO feat-station entry at all — exactly what a
// caller sees once the omission has happened upstream.
type noStationSystem struct{}

func (f *noStationSystem) GetOrCreateInterior(context.Context, string) (*system.GeneratedInterior, error) {
	return &system.GeneratedInterior{
		Interior: system.SystemInterior{SystemId: "sys-0", Radius: 16},
		Features: []system.Feature{
			{Id: "feat-star", Type: system.FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
			// Deliberately NO feat-station — the omission already happened.
		},
	}, nil
}

func (f *noStationSystem) LaneGates(context.Context, string, int) ([]system.LaneGate, error) {
	return nil, nil
}

func dockedToStation() *Fleet {
	return &Fleet{
		Id: "fleet_1", CorporationId: "corp-1", SystemId: "sys-0",
		State: board.MovementState{
			Mode:   board.ModeDocked,
			Docked: &board.Docked{ParentId: "feat-station"},
		},
	}
}

// Scenario (fleet half): Position resolving a fleet docked to an omitted
// station reports the ORDINARY missing-feature outcome (ErrFeatureAbsent) —
// the same one ANY docked-to-an-absent-feature fleet already produces — never
// a silently "successful" zero-value cell (the core), and never a panic.
func TestPosition_Scenario_DockedToOmittedStationReportsMissingFeatureNotTheCore(t *testing.T) {
	svc := NewServiceWith(nil, &noStationSystem{}, nil, &fakeClock{now: 0})

	var pos board.Cell
	var err error
	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("Position panicked resolving a fleet docked to an omitted station: %v", r)
			}
		}()
		pos, err = svc.Position(context.Background(), dockedToStation())
	}()

	if err == nil {
		t.Fatalf("Position returned no error for a fleet docked to an omitted feature — want ErrFeatureAbsent, got a silent success with position %+v", pos)
	}
	if !errors.Is(err, ErrFeatureAbsent) {
		t.Errorf("Position err = %v, want ErrFeatureAbsent (the ordinary missing-feature outcome)", err)
	}
	// A zero-value Cell paired with a non-nil error is the normal Go idiom —
	// what matters is that the CALLER cannot mistake it for a real position at
	// the core without also seeing the error.
	if pos == (board.Cell{Ring: 0, Slot: 0}) && err == nil {
		t.Fatalf("Position reported the core with no error — exactly the bug class this requirement forbids")
	}
}

// Scenario (fleet half, HTTP surface): the fleet read endpoint must not turn
// Position's error into a silent 200 carrying position {ring:0, slot:0} — a
// docked fleet whose parent feature is absent (e.g. an omitted station) must
// not read to a client as "docked at the star". Today's handler logs the
// error and serves the zero-value position anyway (fleet/handler.go's
// Get/List/toDTO all discard Position's error) — this is the caller-side half
// of the same defect the corrected scenario targets, and this test is red
// against that current behavior until it fails closed instead.
func TestGetFleet_Scenario_OmittedStationParentNeverServesPositionAtTheCoreAs200(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	svc := NewServiceWith(nil, &noStationSystem{}, nil, &fakeClock{now: 0})
	handler := NewHandlerWith(&omittedParentSvc{fleet: dockedToStation(), inner: svc}, &fakeClock{now: 0})
	handler.RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/fleet_1", nil))

	if w.Code == http.StatusOK && strings.Contains(w.Body.String(), `"ring":0`) && strings.Contains(w.Body.String(), `"slot":0`) {
		t.Fatalf("GET /fleets/:id served position {ring:0,slot:0} with status 200 for a fleet docked to an omitted feature — "+
			"want a non-200 (or otherwise explicit) outcome, never a silent core position. Body: %s", w.Body.String())
	}
}

// omittedParentSvc wraps a real *Service so Get returns the docked fleet
// while Position genuinely runs the real resolveFeature path (against
// noStationSystem, which omits feat-station) — proving the assertion against
// the actual Position code path, not a stubbed error.
type omittedParentSvc struct {
	fleet *Fleet
	inner *Service
}

func (s *omittedParentSvc) Get(context.Context, string) (*Fleet, error) { return s.fleet, nil }
func (s *omittedParentSvc) ListInSystem(context.Context, string) ([]Fleet, error) {
	return []Fleet{*s.fleet}, nil
}
func (s *omittedParentSvc) ListForCorp(context.Context, string) ([]Fleet, error) {
	return []Fleet{*s.fleet}, nil
}
func (s *omittedParentSvc) OrderTo(context.Context, string, OrderRequest) (*Fleet, error) {
	return s.fleet, nil
}
func (s *omittedParentSvc) PreviewRoute(context.Context, string, string) (*RoutePreview, error) {
	return nil, nil
}
func (s *omittedParentSvc) Cancel(context.Context, string) (*Fleet, error) { return s.fleet, nil }
func (s *omittedParentSvc) Scan(context.Context, string) (*Fleet, error)   { return s.fleet, nil }
func (s *omittedParentSvc) SeedFleet(context.Context, string, string, board.Cell) (*Fleet, error) {
	return s.fleet, nil
}
func (s *omittedParentSvc) Position(ctx context.Context, f *Fleet) (board.Cell, error) {
	return s.inner.Position(ctx, f)
}
