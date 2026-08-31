package fleet

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/space"

	"github.com/gin-gonic/gin"
)

// fakeFleetSvc is a hand fake of ServiceInterface for handler tests.
type fakeFleetSvc struct {
	fleet  *Fleet
	list   []Fleet
	getErr error
	// pos/posErr let a test script Position's return independently of fleet —
	// used for the trading-station "omitted station" scenario family.
	pos    space.Vec3
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
func (f *fakeFleetSvc) CutDrive(context.Context, string) (*Fleet, error) { return f.fleet, nil }
func (f *fakeFleetSvc) Stop(context.Context, string) (*Fleet, error)     { return f.fleet, nil }
func (f *fakeFleetSvc) Cancel(context.Context, string) (*Fleet, error)   { return f.fleet, nil }
func (f *fakeFleetSvc) SeedFleet(context.Context, string, string, space.Vec3, float64) (*Fleet, error) {
	return f.fleet, nil
}
func (f *fakeFleetSvc) Position(context.Context, *Fleet, space.Bodies) (space.Vec3, error) {
	return f.pos, f.posErr
}
func (f *fakeFleetSvc) PositionOf(context.Context, *Fleet) (space.Vec3, error) {
	return f.pos, f.posErr
}
func (f *fakeFleetSvc) HomeGeometry(context.Context, string) (float64, float64, error) {
	return 0, 0, nil
}

// newFleetRouter wires a handler against svc — the AudienceFog seam this used
// to also take is DELETED (design.md Decision 11: `fleet.AudienceFog`/
// `Handler.WithFog` have no successor; a foreign fleet is now omitted
// entirely rather than redacted through a fog filter).
func newFleetRouter(svc ServiceInterface) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Stand in for the auth + corp-resolver middleware so ActorCorp resolves a
	// requester. Since #0009, ActorCorp reads the resolved corp id (CorpIdKey), not
	// a derivation of the account — so the stub sets the corp directly.
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		c.Set(common.CorpIdKey, "corp-user1")
	})
	NewHandlerWith(svc, &fakeClock{}).RegisterRoutes(r.Group("/"))
	return r
}

// TestList_RequiresSystemId 400s a bare list (no whole-galaxy fleet dump).
func TestList_RequiresSystemId(t *testing.T) {
	r := newFleetRouter(&fakeFleetSvc{})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("list without systemId: status = %d, want 400", w.Code)
	}
}

// TestList_Scenario_ForeignFleetOmittedEntirely is the migrated successor of
// the pre-migration TestList_AudienceFogsForeigns: fleet-movement's ADDED
// "Fleet Read Endpoints Serve Own Fleets Only" replaces per-fleet audience
// fog with unconditional omission (design.md Decision 11) — a foreign fleet
// is dropped because it belongs to another corporation, full stop, with no
// sensor/coverage check involved at all.
func TestList_Scenario_ForeignFleetOmittedEntirely(t *testing.T) {
	svc := &fakeFleetSvc{list: []Fleet{
		{Id: "mine", CorporationId: "corp-user1", SystemId: "s1"},
		{Id: "theirs", CorporationId: "corp-other", SystemId: "s1"},
	}}
	// The auth stub sets account "user1", so ActorCorp = "corp-user1" — "mine" is
	// an own unit; "theirs" belongs to another corporation and is omitted
	// unconditionally. So the response keeps "mine" and drops "theirs".
	r := newFleetRouter(svc)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets?systemId=s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("list: status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "mine") || strings.Contains(w.Body.String(), "theirs") {
		t.Fatalf("a foreign fleet leaked or an own fleet was dropped: body = %s", w.Body.String())
	}
}

// TestGet_Scenario_ForeignFleetDirectFetch404s is the migrated successor of
// the pre-migration TestGet_ForeignFleetFoggedTo404: fleet-movement ADDED
// "Fleet Read Endpoints Serve Own Fleets Only" — "A fleet belonging to
// another corporation SHALL ... 404 on a direct fetch" (spec.md scenario "A
// foreign fleet 404s on a direct fetch"). There is no audience/coverage
// check left to script (design.md Decision 11 deletes AudienceFog); a
// foreign fleet 404s purely because it belongs to another corporation.
func TestGet_Scenario_ForeignFleetDirectFetch404s(t *testing.T) {
	foreign := &Fleet{Id: "f1", CorporationId: "corp-other", SystemId: "s1"}

	r := newFleetRouter(&fakeFleetSvc{fleet: foreign})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("direct fetch of a foreign fleet: status = %d, want 404", w.Code)
	}
}

// TestGet_Scenario_OwnFleetDirectFetchReturns200 is the always-full-visibility
// half of the same requirement, isolated from the roster/cargo assertions
// roster_handler_test.go's own "own fleet" scenario covers.
func TestGet_Scenario_OwnFleetDirectFetchReturns200(t *testing.T) {
	own := &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "s1"}

	r := newFleetRouter(&fakeFleetSvc{fleet: own})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fleets/f1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("direct fetch of an own fleet: status = %d, want 200", w.Code)
	}
}
