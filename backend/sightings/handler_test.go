package sightings

// Unit tests for Handler.List's systemId query-param threading
// (add-scan-and-sightings-surface, tasks.md 2.8 — now implemented; added at
// check.py's request for a colocated package test of the handler's own new
// behavior, not red-phase evidence). Mirrors fleet/handler_test.go's own
// established pattern: a real Handler over a mocked Dao, driven through a
// real gin router with a stub auth/corp-resolver middleware.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"go.uber.org/mock/gomock"
)

func newSightingsRouter(svc *Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		c.Set(common.CorpIdKey, "corp-user1")
	})
	NewHandler(svc).RegisterRoutes(r.Group("/"))
	return r
}

// Scenario: A filtered read returns only the named system's records — the
// HANDLER half: the served `systemId` query param reaches Service.List (and
// therefore Dao.List) verbatim, for the resolved requester's own corp id.
func TestHandler_Scenario_SystemIdQueryParamThreadedToService(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	dao.EXPECT().
		List(gomock.Any(), "corp-user1", gomock.Any(), gomock.Any(), "sys-7").
		Return([]Sighting{{SystemId: "sys-7", HostId: "feat-x"}}, "", nil)

	r := newSightingsRouter(NewServiceWith(dao))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/sightings?systemId=sys-7", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("GET /sightings?systemId=sys-7: status = %d, body = %s", w.Code, w.Body.String())
	}
}

// Scenario: An unfiltered read is unchanged — a request naming no system
// still reaches Dao.List with an EMPTY systemId argument (never a distinct
// "no argument at all" call shape the service would have to special-case),
// and the response carries the served records unchanged.
func TestHandler_Scenario_NoSystemIdParamIsUnchanged(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	dao.EXPECT().
		List(gomock.Any(), "corp-user1", gomock.Any(), gomock.Any(), "").
		Return([]Sighting{{SystemId: "sys-1", HostId: "feat-a"}, {SystemId: "sys-2", HostId: "feat-b"}}, "next-cursor", nil)

	r := newSightingsRouter(NewServiceWith(dao))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/sightings", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("GET /sightings: status = %d, body = %s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, "sys-1") || !strings.Contains(body, "sys-2") {
		t.Errorf("unfiltered read body missing one of the two systems' records: %s", body)
	}
	if !strings.Contains(body, "next-cursor") {
		t.Errorf("unfiltered read body missing the served cursor: %s", body)
	}
}
