package galaxy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/observation"

	"github.com/gin-gonic/gin"
)

// fakeService lets the handler test drive responses without a DAO.
type fakeService struct {
	gen *GeneratedGalaxy
	err error
}

func (f *fakeService) Generate(context.Context, int64, GenerationParams) (*GeneratedGalaxy, error) {
	return f.gen, f.err
}
func (f *fakeService) GetLive(context.Context) (*GeneratedGalaxy, error) { return f.gen, f.err }
func (f *fakeService) GetLiveSystem(context.Context, string) (*System, error) {
	if f.err != nil {
		return nil, f.err
	}
	if f.gen == nil || len(f.gen.Systems) == 0 {
		return nil, ErrSystemNotFound
	}
	return &f.gen.Systems[0], nil
}
func (f *fakeService) LiveGalaxyMeta(context.Context) (*Galaxy, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &f.gen.Galaxy, nil
}

func newTestRouter(svc ServiceInterface) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewHandlerWith(svc, testClock()).RegisterRoutes(r.Group("/"))
	return r
}

func TestHandler_GetGalaxy_PinnedShape(t *testing.T) {
	gen := Generate(3, smallParams())
	gen.Galaxy.Id = "gal_h"
	r := newTestRouter(&fakeService{gen: &gen})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/galaxy", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	for _, key := range []string{"id", "seed", "bounds", "systems", "lanes", "worldTime"} {
		if _, ok := body[key]; !ok {
			t.Errorf("response missing pinned key %q", key)
		}
	}

	var payload galaxyDTO
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal to DTO: %v", err)
	}
	if payload.Id != "gal_h" || len(payload.Systems) == 0 || len(payload.Lanes) == 0 {
		t.Fatalf("unexpected payload: id=%s systems=%d lanes=%d", payload.Id, len(payload.Systems), len(payload.Lanes))
	}
	// Free star map: with no fog wired, every system reads starVisible and the
	// skeleton is present (#0006 replaced the discovered stub with a subspace tier).
	for _, s := range payload.Systems {
		if s.Tier != "starVisible" {
			t.Fatalf("system %s tier = %q, want starVisible (no fog wired)", s.Id, s.Tier)
		}
		if s.Skeleton.StarClass == "" {
			t.Fatalf("system %s missing skeleton star class", s.Id)
		}
	}
}

// TestToDTO_ChartedLaneFilter pins the #0006 fog rule for lanes: only lanes
// incident to an Explored system ship; a nil tiers map is the no-fog baseline
// (every lane). Home=sys-0 explored, sys-1 rumored, sys-2 star-visible.
func TestToDTO_ChartedLaneFilter(t *testing.T) {
	gen := &GeneratedGalaxy{
		Galaxy: Galaxy{Id: "gal_fog"},
		Systems: []System{
			{Id: "sys-0", Skeleton: Skeleton{StarClass: "G"}},
			{Id: "sys-1", Skeleton: Skeleton{StarClass: "M"}},
			{Id: "sys-2", Skeleton: Skeleton{StarClass: "K"}},
		},
		Lanes: []Lane{
			{Id: "l-home-nb", AId: "sys-0", BId: "sys-1"}, // incident to home → charted
			{Id: "l-nb-far", AId: "sys-1", BId: "sys-2"},  // between rumored/unseen → not
			{Id: "l-home-far", AId: "sys-2", BId: "sys-0"}, // incident to home → charted
		},
	}

	// No fog wired → every lane ships (unit-test / logged-out baseline).
	if got := ToDTO(gen, 0, nil); len(got.Lanes) != 3 {
		t.Fatalf("nil tiers: lanes = %d, want 3 (no filtering)", len(got.Lanes))
	}

	// Fogged: only the two lanes touching the Explored home survive.
	tiers := map[string]observation.Tier{
		"sys-0": observation.TierExplored,
		"sys-1": observation.TierRumored,
	}
	got := ToDTO(gen, 0, tiers)
	gotIDs := map[string]bool{}
	for _, l := range got.Lanes {
		gotIDs[l.Id] = true
	}
	if len(got.Lanes) != 2 || !gotIDs["l-home-nb"] || !gotIDs["l-home-far"] {
		t.Fatalf("fogged lanes = %v, want exactly {l-home-nb, l-home-far}", gotIDs)
	}
	// The lane between a rumored neighbour and an unseen system must NOT ship.
	if gotIDs["l-nb-far"] {
		t.Fatalf("uncharted lane l-nb-far leaked into the fogged read")
	}
}

func TestHandler_GetGalaxy_NotFoundWhenNoLive(t *testing.T) {
	r := newTestRouter(&fakeService{err: ErrNoLiveGalaxy})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/galaxy", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}
