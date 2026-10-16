package corporations

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
	"go.uber.org/mock/gomock"
)

// fakeCorpSvc is a hand-rolled ServiceInterface stand-in: each method returns the
// canned value/error the test sets, so the handler's status mapping is exercised
// without a Firestore stack.
type fakeCorpSvc struct {
	spawnRes  *SpawnResult
	spawnErr  error
	meCorp    *Corporation
	meErr     error
	balance   int64
	ledger    *LedgerPage
	creditErr error
}

func (f *fakeCorpSvc) Spawn(context.Context, string, string) (*SpawnResult, error) {
	return f.spawnRes, f.spawnErr
}
func (f *fakeCorpSvc) GetForAccount(context.Context, string) (*Corporation, error) {
	return f.meCorp, f.meErr
}
func (f *fakeCorpSvc) CorpForAccount(context.Context, string) (string, error) { return "", nil }
func (f *fakeCorpSvc) MarkDead(context.Context, string) error                 { return nil }
func (f *fakeCorpSvc) Balance(context.Context, string) (int64, error) {
	return f.balance, f.creditErr
}
func (f *fakeCorpSvc) Ledger(context.Context, string, string, int) (*LedgerPage, error) {
	return f.ledger, f.creditErr
}

func newCorpRouter(svc ServiceInterface) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Stand in for the auth middleware so common.Actor resolves a requester.
	r.Use(func(c *gin.Context) { c.Set(common.AccountIdKey, "acct-1") })
	noop := func(c *gin.Context) { c.Next() }
	NewHandler(svc).RegisterRoutes(r.Group("/"), noop)
	return r
}

func TestSpawn_RejectsEmptyName(t *testing.T) {
	r := newCorpRouter(&fakeCorpSvc{spawnErr: ErrNameRequired})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/corporations", strings.NewReader(`{"name":""}`)))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("empty name: status = %d, want 400", w.Code)
	}
}

func TestSpawn_RejectsOverlongDirectAPIName(t *testing.T) {
	dao := NewMockDao(gomock.NewController(t))
	dao.EXPECT().CorpIdForAccount(gomock.Any(), "acct-1").Return("", nil)
	r := newCorpRouter(NewServiceWith(dao, nil, nil, nil, nil))
	w := httptest.NewRecorder()
	body, err := json.Marshal(SpawnRequest{Name: strings.Repeat("É", 41)})
	if err != nil {
		t.Fatal(err)
	}
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/corporations", strings.NewReader(string(body))))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "at most 40 characters") {
		t.Fatalf("overlong name: status=%d body=%s, want 400 and actionable limit", w.Code, w.Body.String())
	}
}

func TestSpawn_NoSiteMapsTo503(t *testing.T) {
	r := newCorpRouter(&fakeCorpSvc{spawnErr: ErrNoSpawnSite})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/corporations", strings.NewReader(`{"name":"Bob"}`)))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("no site: status = %d, want 503", w.Code)
	}
}

func TestSpawn_OK(t *testing.T) {
	res := &SpawnResult{Corporation: Corporation{Id: "corp_1", AccountId: "acct-1", Name: "Bob"}}
	r := newCorpRouter(&fakeCorpSvc{spawnRes: res})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/corporations", strings.NewReader(`{"name":"Bob"}`)))
	if w.Code != http.StatusOK {
		t.Fatalf("spawn: status = %d, want 200", w.Code)
	}
}

func TestGetMine_404WhenCorpless(t *testing.T) {
	r := newCorpRouter(&fakeCorpSvc{meErr: ErrNotFound})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/corporations/me", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("corpless /me: status = %d, want 404", w.Code)
	}
}

func TestGetMine_OK(t *testing.T) {
	r := newCorpRouter(&fakeCorpSvc{meCorp: &Corporation{Id: "corp_1", AccountId: "acct-1", Name: "Bob"}})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/corporations/me", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("/me: status = %d, want 200", w.Code)
	}
}
