package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// quotaRouter mounts the quota behind a stand-in for ResolveCorporation, so the
// tests exercise the same seam production does: a SERVER-resolved corp id.
func quotaRouter(q *CorpWriteQuota, corpID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(common.CorpIdKey, corpID) })
	r.POST("/sell", q.Middleware(), func(c *gin.Context) { c.Status(http.StatusOK) })
	return r
}

func post(r *gin.Engine, forwardedFor string) int {
	req := httptest.NewRequest(http.MethodPost, "/sell", nil)
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func TestCorpWriteQuota_AllowsUpToTheLimitThen429s(t *testing.T) {
	q := NewCorpWriteQuota(3, time.Minute)
	r := quotaRouter(q, "corp-1")

	for i := 1; i <= 3; i++ {
		if code := post(r, ""); code != http.StatusOK {
			t.Fatalf("request %d = %d, want 200 (within the limit)", i, code)
		}
	}
	if code := post(r, ""); code != http.StatusTooManyRequests {
		t.Errorf("the 4th request = %d, want 429", code)
	}
}

func TestCorpWriteQuota_IsNotEvadableByIPSpoofing(t *testing.T) {
	// This is the whole reason the quota exists beside the per-IP tiers: the IP
	// limiter's own spec documents that a spoofed X-Forwarded-For obtains a fresh
	// bucket per request. A corporation-keyed quota must be untouched by that.
	q := NewCorpWriteQuota(2, time.Minute)
	r := quotaRouter(q, "corp-1")

	_ = post(r, "10.0.0.1")
	_ = post(r, "10.0.0.2")
	if code := post(r, "10.0.0.3"); code != http.StatusTooManyRequests {
		t.Errorf("a third request from a third spoofed IP = %d, want 429 — the quota keys on the corp, not the IP", code)
	}
}

func TestCorpWriteQuota_IsPerCorporation(t *testing.T) {
	q := NewCorpWriteQuota(2, time.Minute)
	a := quotaRouter(q, "corp-a")
	b := quotaRouter(q, "corp-b")

	_ = post(a, "")
	_ = post(a, "")
	if code := post(a, ""); code != http.StatusTooManyRequests {
		t.Fatalf("corp-a's third request = %d, want 429", code)
	}
	// One corporation exhausting its quota must not spend another's.
	if code := post(b, ""); code != http.StatusOK {
		t.Errorf("corp-b's first request = %d, want 200 — quotas are per corporation", code)
	}
}

func TestCorpWriteQuota_CorplessRequesterPassesThroughToTheRouteAuthCheck(t *testing.T) {
	// A corpless caller is not rejected here: the route's own auth check owns that
	// rejection and reports the right reason. Bucketing every corpless request
	// under one shared key would also be wrong.
	q := NewCorpWriteQuota(1, time.Minute)
	r := quotaRouter(q, "")

	for i := 0; i < 5; i++ {
		if code := post(r, ""); code != http.StatusOK {
			t.Fatalf("corpless request %d = %d, want the quota to defer to the route", i, code)
		}
	}
}

func TestCorpWriteQuota_WindowResets(t *testing.T) {
	q := NewCorpWriteQuota(1, 40*time.Millisecond)
	r := quotaRouter(q, "corp-1")

	if code := post(r, ""); code != http.StatusOK {
		t.Fatalf("first request = %d, want 200", code)
	}
	if code := post(r, ""); code != http.StatusTooManyRequests {
		t.Fatalf("second request = %d, want 429", code)
	}
	time.Sleep(60 * time.Millisecond)
	if code := post(r, ""); code != http.StatusOK {
		t.Errorf("after the window elapsed = %d, want 200", code)
	}
}

func TestCorpWriteQuota_SendsRetryAfter(t *testing.T) {
	q := NewCorpWriteQuota(1, time.Minute)
	r := quotaRouter(q, "corp-1")
	_ = post(r, "")

	req := httptest.NewRequest(http.MethodPost, "/sell", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("code = %d, want 429", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Error("a 429 carried no Retry-After header")
	}
}
