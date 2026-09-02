package fleet

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// fleet-movement, "A fleet attached to a body the table no longer resolves
// degrades, never panics" (re-express-economy-positions tasks.md 3.9 — the
// production fix itself is task 3.8, NOT this SDET pass).
//
// Two levels:
//
//  1. SERVICE level (below): proves the underlying signal really is
//     space.ErrUnknownBody for BOTH derived-id cases the spec names — a
//     belt member index the live AsteroidsPerBelt no longer derives, and a
//     lane gate a degraded (no-neighbour) gate read omits — against a REAL
//     *system.BodyTable, not a hand-rolled stand-in. EXPECTED GREEN TODAY:
//     this is just space/system's existing, already-correct error
//     surface, exercised through fleet.Service.PositionOf.
//
//  2. HANDLER level (TestGet_Scenario_StaleAttachmentDegradesInsteadOf500):
//     proves the READ ITSELF degrades (200, unchanged AttachedTo, no
//     position, no panic) instead of 500ing. EXPECTED RED TODAY:
//     fleet/handler.go's toDTO returns every non-ErrFleetInTransit
//     PositionOf error verbatim, and Handler.respond's default case 500s
//     it — task 3.8 (golang-dev, NOT this SDET pass) must treat
//     space.ErrUnknownBody the way ErrFleetInTransit already is.
func TestPositionOf_Scenario_StaleBeltMemberIndexIsUnknownBody(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	belt := system.Feature{
		Id: "feat-belt-0", Type: system.FeatureBelt, Size: 1.0, Width: 8.0,
		SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "feat-star", Radius: 40, PeriodMs: 600_000}),
	}
	bodies := testBodyTable(t, "sys-0", 6.0, belt)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})

	// AsteroidsPerBelt is 8 today (system.AsteroidsPerBelt) — index 99 is
	// beyond it regardless of whether that constant is ever retuned, so
	// this fixture reproduces "a belt member index beyond a retuned
	// AsteroidsPerBelt" with no literal retune needed.
	if _, ok := bodies.Body("feat-belt-0#99"); ok {
		t.Fatal("fixture broken: feat-belt-0#99 unexpectedly resolved — AsteroidsPerBelt must have grown past 99")
	}

	stale := freshParkedFleet()
	stale.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: "feat-belt-0#99"}}
	stale.AttachedTo = "feat-belt-0#99"
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(stale, nil)

	f, err := svc.Get(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if _, posErr := svc.PositionOf(context.Background(), f); !errors.Is(posErr, space.ErrUnknownBody) {
		t.Fatalf("PositionOf for a fleet attached to a beyond-range belt member = %v, want space.ErrUnknownBody", posErr)
	}
}

func TestPositionOf_Scenario_DegradedGateReadOmissionIsUnknownBody(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// newSvc's default table wires stubGalaxyNoGates (no neighbours), so NO
	// gate body is ever added to it — any "gate-*" id is, by construction,
	// exactly the degraded-gate-read-omission case the spec names.
	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})
	if _, ok := bodies.Body("gate-sys-far"); ok {
		t.Fatal("fixture broken: gate-sys-far unexpectedly resolved")
	}

	stale := freshParkedFleet()
	stale.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: "gate-sys-far"}}
	stale.AttachedTo = "gate-sys-far"
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(stale, nil)

	f, err := svc.Get(context.Background(), "fleet_1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if _, posErr := svc.PositionOf(context.Background(), f); !errors.Is(posErr, space.ErrUnknownBody) {
		t.Fatalf("PositionOf for a fleet attached to an omitted gate = %v, want space.ErrUnknownBody", posErr)
	}
}

func TestGet_Scenario_StaleAttachmentDegradesInsteadOf500(t *testing.T) {
	stale := &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1", AttachedTo: "feat-belt-0#99"}
	r := newFleetRouter(&fakeFleetSvc{fleet: stale, posErr: space.ErrUnknownBody})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("reading a fleet whose AttachedTo no longer resolves: status = %d, want 200 (degrade, not a bodiless 500) — body: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"attachedTo":"feat-belt-0#99"`) {
		t.Errorf("degraded read body = %s, want AttachedTo unchanged and present", w.Body.String())
	}
}
