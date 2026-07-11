package middlewares

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// runResolve drives ResolveCorporation with a stubbed account already in context
// (as the auth middleware would set it) and the given resolver, returning the
// corp id ActorCorp sees downstream.
func runResolve(t *testing.T, accountId string, resolve func(*gin.Context, string) (string, error)) (string, int) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if accountId != "" {
		r.Use(func(c *gin.Context) { c.Set(common.AccountIdKey, accountId) })
	}
	r.Use(ResolveCorporation(resolve))
	var seen string
	r.GET("/x", func(c *gin.Context) {
		seen = common.ActorCorp(c)
		c.Status(http.StatusOK)
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))
	return seen, w.Code
}

func TestResolveCorporation_SetsCorp(t *testing.T) {
	seen, code := runResolve(t, "acct-1", func(_ *gin.Context, acct string) (string, error) {
		if acct != "acct-1" {
			t.Fatalf("resolver got account %q", acct)
		}
		return "corp_1", nil
	})
	if code != http.StatusOK || seen != "corp_1" {
		t.Fatalf("code=%d corp=%q, want 200 / corp_1", code, seen)
	}
}

func TestResolveCorporation_CorplessContinues(t *testing.T) {
	// The account has no corp yet (the wake-up flow's own state) — the request must
	// proceed with an empty corp, never be rejected.
	called := false
	seen, code := runResolve(t, "acct-1", func(*gin.Context, string) (string, error) {
		called = true
		return "", nil
	})
	if !called {
		t.Fatal("resolver should be called for a signed-in account")
	}
	if code != http.StatusOK || seen != "" {
		t.Fatalf("code=%d corp=%q, want 200 / empty", code, seen)
	}
}

func TestResolveCorporation_NoAccountSkips(t *testing.T) {
	// No authenticated account (public-ish path) — resolver never runs, corp empty.
	called := false
	seen, code := runResolve(t, "", func(*gin.Context, string) (string, error) {
		called = true
		return "corp_x", nil
	})
	if called {
		t.Fatal("resolver should be skipped when there is no account")
	}
	if code != http.StatusOK || seen != "" {
		t.Fatalf("code=%d corp=%q, want 200 / empty", code, seen)
	}
}

func TestResolveCorporation_ErrorFailsOpen(t *testing.T) {
	// A resolution error must not fail the request — it continues corpless (baseline
	// fog), never leaking another corp's view.
	seen, code := runResolve(t, "acct-1", func(*gin.Context, string) (string, error) {
		return "", errors.New("firestore down")
	})
	if code != http.StatusOK || seen != "" {
		t.Fatalf("code=%d corp=%q, want 200 / empty (fail-open)", code, seen)
	}
}
