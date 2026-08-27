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

func (f *fakeService) Seed(context.Context, int64, GenerationParams) (*Galaxy, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &f.gen.Galaxy, nil
}
func (f *fakeService) GetLive(context.Context) (*GeneratedGalaxy, error) { return f.gen, f.err }
func (f *fakeService) EnsureLaneHorizon(context.Context, string) error   { return f.err }
func (f *fakeService) LaneHorizonBlocks(context.Context, []string) ([]Block, error) {
	return nil, f.err
}
func (f *fakeService) EnsureBlocks(context.Context, ...Block) error { return f.err }
func (f *fakeService) NeighborsOf(context.Context, string) ([]string, error) {
	return nil, f.err
}
func (f *fakeService) NeighborsOfMany(context.Context, []string) (map[string][]string, error) {
	return nil, f.err
}
func (f *fakeService) GetLiveSystems(context.Context, []string) ([]System, error) {
	return nil, f.err
}
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
	gen := GenerateStartArea(3, testParams())
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

// TestToDTO_ChartedLaneFilter pins the #0006 Decision #17 fog rule for lanes:
// only the requester's PER-LANE charted records ship — written by travel and
// scan, not derived from tiers — and a corp with an empty charted set sees no
// lanes at all (the fresh-spawn read: every node, zero roads). A nil set is
// the no-fog baseline (every lane).
//
// Spec: 0006/S6
func TestToDTO_ChartedLaneFilter(t *testing.T) {
	gen := &GeneratedGalaxy{
		Galaxy: Galaxy{Id: "gal_fog"},
		Systems: []System{
			{Id: "sys-0", Skeleton: Skeleton{StarClass: "G"}},
			{Id: "sys-1", Skeleton: Skeleton{StarClass: "M"}},
			{Id: "sys-2", Skeleton: Skeleton{StarClass: "K"}},
		},
		Lanes: []Lane{
			{Id: "l-home-nb", AId: "sys-0", BId: "sys-1"},
			{Id: "l-nb-far", AId: "sys-1", BId: "sys-2"},
			{Id: "l-home-far", AId: "sys-2", BId: "sys-0"},
		},
	}
	tiers := map[string]observation.Tier{"sys-0": observation.TierExplored}

	// No fog wired → every lane ships (unit-test / logged-out baseline).
	if got := ToDTO(gen, 0, nil, nil); len(got.Lanes) != 3 {
		t.Fatalf("nil charted set: lanes = %d, want 3 (no filtering)", len(got.Lanes))
	}

	// A fresh spawn: home explored, NOTHING charted — every node, zero lanes.
	fresh := ToDTO(gen, 0, tiers, map[string]bool{})
	if len(fresh.Systems) != 3 {
		t.Fatalf("fresh spawn systems = %d, want all 3 (nodes are the free star map)", len(fresh.Systems))
	}
	if len(fresh.Lanes) != 0 {
		t.Fatalf("fresh spawn lanes = %d, want 0 (no lanes until the first scan)", len(fresh.Lanes))
	}

	// After charting (scan/travel wrote per-lane docs): exactly those lanes ship
	// — tier-derived incidence no longer plays.
	got := ToDTO(gen, 0, tiers, map[string]bool{"l-home-nb": true})
	gotIDs := map[string]bool{}
	for _, l := range got.Lanes {
		gotIDs[l.Id] = true
	}
	if len(got.Lanes) != 1 || !gotIDs["l-home-nb"] {
		t.Fatalf("charted lanes = %v, want exactly {l-home-nb}", gotIDs)
	}
	if gotIDs["l-home-far"] {
		t.Fatalf("l-home-far leaked: Explored-incidence must not chart a lane (#0006 Decision #17)")
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
