package galaxy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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
	// Fog stub: every system discovered=true, and the skeleton is present.
	for _, s := range payload.Systems {
		if !s.Discovered {
			t.Fatalf("system %s not discovered=true (fog stub)", s.Id)
		}
		if s.Skeleton.StarClass == "" {
			t.Fatalf("system %s missing skeleton star class", s.Id)
		}
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
