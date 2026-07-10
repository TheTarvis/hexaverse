package fleet

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"

	"github.com/gin-gonic/gin"
)

// fakeFleetSvc is a hand fake of ServiceInterface for handler tests.
type fakeFleetSvc struct {
	fleet   *Fleet
	scanErr error
	getErr  error
}

func (f *fakeFleetSvc) Get(context.Context, string) (*Fleet, error) { return f.fleet, f.getErr }
func (f *fakeFleetSvc) OrderTo(context.Context, string, OrderRequest) (*Fleet, error) {
	return f.fleet, nil
}
func (f *fakeFleetSvc) Cancel(context.Context, string) (*Fleet, error) { return f.fleet, nil }
func (f *fakeFleetSvc) Scan(context.Context, string) (*Fleet, error)   { return f.fleet, f.scanErr }
func (f *fakeFleetSvc) SeedFleet(context.Context, string, string, board.Hex) (*Fleet, error) {
	return f.fleet, nil
}
func (f *fakeFleetSvc) Position(context.Context, *Fleet) (board.Hex, error) {
	return board.Hex{}, nil
}

type fakeAudience struct{ visible bool }

func (f fakeAudience) FleetVisibleTo(context.Context, string, observation.FleetPos, common.WorldMillis) (bool, error) {
	return f.visible, nil
}

func newFleetRouter(svc ServiceInterface, fog AudienceFog) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Stand in for the auth middleware so ActorCorp resolves a requester.
	r.Use(func(c *gin.Context) { c.Set(common.AccountIdKey, "user1") })
	NewHandlerWith(svc, &fakeClock{}).WithFog(fog).RegisterRoutes(r.Group("/"))
	return r
}

// TestScan_ConflictWhenBusy maps the single-slot rejection to 409.
func TestScan_ConflictWhenBusy(t *testing.T) {
	r := newFleetRouter(&fakeFleetSvc{scanErr: action.ErrActiveActionExists}, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/fleets/f1/scan", nil))
	if w.Code != http.StatusConflict {
		t.Fatalf("scan while busy: status = %d, want 409", w.Code)
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
