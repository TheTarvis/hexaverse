package stations

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// fakeStationSvc drives the handler's status mapping without a Firestore stack.
type fakeStationSvc struct {
	station *Station
	err     error
	// gotCorp records what the handler resolved as the requester's corporation,
	// proving it comes from the server-resolved actor and not from the request.
	gotCorp string
}

func (f *fakeStationSvc) EnsureStation(context.Context, string) error { return nil }
func (f *fakeStationSvc) Get(context.Context, string) (*Station, error) {
	return f.station, f.err
}
func (f *fakeStationSvc) GetVisible(_ context.Context, corpID, _ string) (*Station, error) {
	f.gotCorp = corpID
	return f.station, f.err
}

func stationRouter(svc ServiceInterface, corpID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(common.CorpIdKey, corpID) })
	NewHandler(svc).RegisterRoutes(r.Group("/"))
	return r
}

func get(r *gin.Engine, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func TestGetStation_ReturnsAVisibleStation(t *testing.T) {
	svc := &fakeStationSvc{station: &Station{SystemId: "sys-1", FeatureId: StationFeatureId}}
	w := get(stationRouter(svc, "corp-1"), "/systems/sys-1/station")

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if svc.gotCorp != "corp-1" {
		t.Errorf("handler gated on corp %q, want the server-resolved actor corp", svc.gotCorp)
	}
}

// TestGetStation_BelowGateAndUnknownAreIdentical is the anti-probing assertion:
// the endpoint must not let a caller sweep system ids to discover which ones
// carry stations — which, since this version places stations only at spawn
// homes, would map where corporations woke up.
func TestGetStation_BelowGateAndUnknownAreIdentical(t *testing.T) {
	belowGate := get(stationRouter(&fakeStationSvc{err: ErrNotFound}, "corp-1"), "/systems/sys-hidden/station")
	unknown := get(stationRouter(&fakeStationSvc{err: ErrNotFound}, "corp-1"), "/systems/sys-nonexistent/station")

	if belowGate.Code != http.StatusNotFound || unknown.Code != http.StatusNotFound {
		t.Fatalf("statuses = %d and %d, want both 404", belowGate.Code, unknown.Code)
	}
	if belowGate.Body.String() != unknown.Body.String() {
		t.Errorf("below-gate body %q differs from unknown-system body %q",
			belowGate.Body.String(), unknown.Body.String())
	}
}

func TestGetStation_StoreFailureIs500NotAFalseNotFound(t *testing.T) {
	// A store outage must not read as "no station here" — that would silently
	// hide a station the requester is entitled to see.
	w := get(stationRouter(&fakeStationSvc{err: errors.New("firestore unavailable")}, "corp-1"),
		"/systems/sys-1/station")
	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", w.Code)
	}
}
