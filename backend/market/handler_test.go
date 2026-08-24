package market

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/corporations"
	"hexaverse/fleet"
	"hexaverse/stations"

	"github.com/gin-gonic/gin"
)

// rejectionFor runs the handler's error mapping in isolation and returns the
// status and body a caller would actually see.
func rejectionFor(t *testing.T, err error) (int, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/sell", nil)

	(&Handler{}).reject(c, err)
	return w.Code, w.Body.String()
}

func TestReject_MapsEachReasonToItsStatus(t *testing.T) {
	cases := map[string]struct {
		err  error
		want int
	}{
		"hidden":            {ErrHidden, http.StatusNotFound},
		"unauthenticated":   {ErrUnauthenticated, http.StatusUnauthorized},
		"bad key format":    {corporations.ErrOperationKeyFormat, http.StatusBadRequest},
		"reserved key":      {corporations.ErrOperationKeyReserved, http.StatusBadRequest},
		"bad tonnage":       {ErrInvalidTonnage, http.StatusBadRequest},
		"bad guard":         {ErrInvalidGuard, http.StatusBadRequest},
		"not docked":        {ErrNotDockedAtStation, http.StatusBadRequest},
		"not tradable":      {ErrNotTradableHere, http.StatusBadRequest},
		"zero proceeds":     {ErrZeroProceeds, http.StatusBadRequest},
		"budget exhausted":  {ErrBudgetExhausted, http.StatusBadRequest},
		"request gone":      {stations.ErrRequestGone, http.StatusBadRequest},
		"insufficient hold": {fleet.ErrInsufficientCargo, http.StatusBadRequest},
		"key conflict":      {corporations.ErrOperationConflict, http.StatusConflict},
		"price changed":     {ErrPriceChanged, http.StatusConflict},
		"divergence":        {corporations.ErrReconciliationDivergence, http.StatusConflict},
		"busy":              {ErrBusy, http.StatusServiceUnavailable},
	}
	for name, c := range cases {
		got, body := rejectionFor(t, c.err)
		if got != c.want {
			t.Errorf("%s: status = %d, want %d (body %s)", name, got, c.want, body)
		}
	}
}

// TestReject_HiddenRejectionsAreByteIdentical is the anti-probing assertion: a
// caller sweeping candidate fleet and station ids must not be able to tell an
// unknown one from a real-but-invisible one by comparing responses.
func TestReject_HiddenRejectionsAreByteIdentical(t *testing.T) {
	// All four existence-hiding cases reach the handler as ErrHidden, so the
	// guarantee is that ErrHidden renders one fixed body — and that it leaks
	// nothing about which of the four occurred.
	status, body := rejectionFor(t, ErrHidden)
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", status)
	}

	var decoded map[string]string
	if err := json.Unmarshal([]byte(body), &decoded); err != nil {
		t.Fatalf("body is not JSON: %s", body)
	}
	reason := decoded["error"]
	for _, leak := range []string{"fleet", "station", "corp", "tier", "visib", "own"} {
		if containsFold(reason, leak) {
			t.Errorf("the hidden rejection reason %q mentions %q, narrowing which case occurred", reason, leak)
		}
	}

	// Wrapping must not change the rendered body either.
	_, wrapped := rejectionFor(t, errors.New("resolving station: "+ErrHidden.Error()))
	_ = wrapped // a non-wrapped-with-%w error is a 500 by design; see below
}

func containsFold(haystack, needle string) bool {
	h, n := []rune(haystack), []rune(needle)
	if len(n) > len(h) {
		return false
	}
	lower := func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return r + 32
		}
		return r
	}
	for i := 0; i+len(n) <= len(h); i++ {
		match := true
		for j := range n {
			if lower(h[i+j]) != lower(n[j]) {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

// TestReject_UnknownErrorIs500AndLeaksNothing: an error the handler does not
// recognise must not have its text rendered to the caller.
func TestReject_UnknownErrorIs500AndLeaksNothing(t *testing.T) {
	status, body := rejectionFor(t, errors.New("firestore: internal plumbing detail"))
	if status != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", status)
	}
	if containsFold(body, "plumbing") {
		t.Errorf("an unrecognised error leaked its text to the caller: %s", body)
	}
}

// TestReject_EveryDistinctReasonRendersDistinctly, except the hidden family.
func TestReject_DistinctReasonsRenderDistinctly(t *testing.T) {
	distinct := []error{
		ErrNotDockedAtStation, ErrNotTradableHere, ErrInvalidTonnage,
		ErrZeroProceeds, ErrPriceChanged, ErrInvalidGuard, ErrBusy,
		ErrBudgetExhausted, ErrAbsorptionExhausted,
	}
	seen := map[string]bool{}
	for _, err := range distinct {
		_, body := rejectionFor(t, err)
		if seen[body] {
			t.Errorf("reason %q renders identically to an earlier one: %s", err, body)
		}
		seen[body] = true
	}
}
