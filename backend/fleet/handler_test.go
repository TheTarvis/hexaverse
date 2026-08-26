package fleet

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"

	"github.com/gin-gonic/gin"
)

// fakeFleetSvc is a hand fake of ServiceInterface for handler tests.
type fakeFleetSvc struct {
	fleet      *Fleet
	list       []Fleet
	preview    *RoutePreview
	scanErr    error
	getErr     error
	previewErr error
	// pos/posErr let a test script Position's return independently of fleet —
	// added for the trading-station "omitted station" scenario
	// (station_omission_test.go), where Position must be able to fail even
	// though Get succeeds.
	pos    board.Cell
	posErr error
}

func (f *fakeFleetSvc) Get(context.Context, string) (*Fleet, error) { return f.fleet, f.getErr }
func (f *fakeFleetSvc) ListInSystem(context.Context, string) ([]Fleet, error) {
	return f.list, nil
}
func (f *fakeFleetSvc) ListForCorp(context.Context, string) ([]Fleet, error) {
	return f.list, nil
}
func (f *fakeFleetSvc) OrderTo(context.Context, string, OrderRequest) (*Fleet, error) {
	return f.fleet, nil
}
func (f *fakeFleetSvc) PreviewRoute(context.Context, string, string) (*RoutePreview, error) {
	return f.preview, f.previewErr
}
func (f *fakeFleetSvc) Cancel(context.Context, string) (*Fleet, error) { return f.fleet, nil }
func (f *fakeFleetSvc) Scan(context.Context, string) (*Fleet, error)   { return f.fleet, f.scanErr }
func (f *fakeFleetSvc) SeedFleet(context.Context, string, string, board.Cell) (*Fleet, error) {
	return f.fleet, nil
}
func (f *fakeFleetSvc) Position(context.Context, *Fleet) (board.Cell, error) {
	return f.pos, f.posErr
}

type fakeAudience struct{ visible bool }

func (f fakeAudience) FleetVisibleTo(context.Context, string, observation.FleetPos, common.WorldMillis) (bool, error) {
	return f.visible, nil
}

func newFleetRouter(svc ServiceInterface, fog AudienceFog) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Stand in for the auth + corp-resolver middleware so ActorCorp resolves a
	// requester. Since #0009, ActorCorp reads the resolved corp id (CorpIdKey), not
	// a derivation of the account — so the stub sets the corp directly.
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		c.Set(common.CorpIdKey, "corp-user1")
	})
	NewHandlerWith(svc, &fakeClock{}).WithFog(fog).RegisterRoutes(r.Group("/"))
	return r
}

// TestScan_ConflictWhenBusy maps the sensor-slot rejection to 409: a fleet may
// burn and scan at once, but never run two scans (#0006 Decision #19). The
// sweep takes no body (#0006 Decision #21) — one manual trigger.
//
// Spec: 0006/S4
func TestScan_ConflictWhenBusy(t *testing.T) {
	r := newFleetRouter(&fakeFleetSvc{scanErr: action.ErrActiveActionExists}, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/fleets/f1/scan", nil))
	if w.Code != http.StatusConflict {
		t.Fatalf("second scan while one runs: status = %d, want 409", w.Code)
	}
}

// TestList_RequiresSystemId 400s a bare list (no whole-galaxy fleet dump).
func TestList_RequiresSystemId(t *testing.T) {
	r := newFleetRouter(&fakeFleetSvc{}, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("list without systemId: status = %d, want 400", w.Code)
	}
}

// TestList_AudienceFogsForeigns keeps the requester's own units and drops a
// foreign fleet the audience filter can't sense — the board's fleet layer never
// leaks an unsensed foreign.
func TestList_AudienceFogsForeigns(t *testing.T) {
	svc := &fakeFleetSvc{list: []Fleet{
		{Id: "mine", CorporationId: "corp-user1", SystemId: "s1"},
		{Id: "theirs", CorporationId: "corp-other", SystemId: "s1"},
	}}
	// The auth stub sets account "user1", so ActorCorp = "corp-user1" — "mine" is
	// an own unit (skips the audience check); "theirs" is foreign and the fog
	// rejects it. So the response keeps "mine" and drops "theirs".
	r := newFleetRouter(svc, fakeAudience{visible: false})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets?systemId=s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("list: status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "mine") || strings.Contains(w.Body.String(), "theirs") {
		t.Fatalf("audience fog leaked or dropped a fleet: body = %s", w.Body.String())
	}
}

// TestGet_ForeignFleetFoggedTo404 proves the audience filter hides a fleet the
// requester can't sense; and shows it when they can.
func TestGet_ForeignFleetFoggedTo404(t *testing.T) {
	foreign := &Fleet{Id: "f1", CorporationId: "corp-other", SystemId: "s1"}

	hidden := newFleetRouter(&fakeFleetSvc{fleet: foreign}, fakeAudience{visible: false})
	w := httptest.NewRecorder()
	hidden.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("uncovered foreign fleet: status = %d, want 404", w.Code)
	}

	shown := newFleetRouter(&fakeFleetSvc{fleet: foreign}, fakeAudience{visible: true})
	w = httptest.NewRecorder()
	shown.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("covered fleet: status = %d, want 200", w.Code)
	}
}
