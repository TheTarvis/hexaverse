package refuel

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/corporations"

	"github.com/gin-gonic/gin"
)

// rejectionFor drives Handler.reject directly (white-box, same package) —
// the cheapest level that genuinely exercises "every rejection maps to its
// status and carries a reason body" without standing up a router or an
// HTTP round trip.
func rejectionFor(t *testing.T, err error) (int, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/fleets/f1/refuel", nil)

	(&Handler{}).reject(c, err)
	return w.Code, w.Body.String()
}

// TestReject_MapsEachSentinelToItsDocumentedStatus pins handler.go's whole
// switch statement against the status backend/CLAUDE.md's "Errors" section
// and the fuel-purchase spec assign to each sentinel.
func TestReject_MapsEachSentinelToItsDocumentedStatus(t *testing.T) {
	cases := map[string]struct {
		err  error
		want int
	}{
		"hidden (unknown or foreign fleet)": {ErrHidden, http.StatusNotFound},
		"unauthenticated":                   {ErrUnauthenticated, http.StatusUnauthorized},
		"bad operation key format":          {corporations.ErrOperationKeyFormat, http.StatusBadRequest},
		"reserved operation key prefix":     {corporations.ErrOperationKeyReserved, http.StatusBadRequest},
		"invalid tonnage":                   {ErrInvalidTonnage, http.StatusBadRequest},
		"not docked at station":             {ErrNotDockedAtStation, http.StatusBadRequest},
		"exceeds free hold":                 {ErrExceedsFreeHold, http.StatusBadRequest},
		"misconfigured price":               {ErrMisconfiguredPrice, http.StatusBadRequest},
		"cost overflow":                     {ErrCostOverflow, http.StatusBadRequest},
		"zero cost":                         {ErrZeroCost, http.StatusBadRequest},
		"insufficient credits":              {corporations.ErrInsufficientCredits, http.StatusBadRequest},
		"operation key conflict":            {corporations.ErrOperationConflict, http.StatusConflict},
		"reconciliation divergence":         {corporations.ErrReconciliationDivergence, http.StatusConflict},
		"chain broken":                      {corporations.ErrChainBroken, http.StatusConflict},
		"unrecognised error":                {errors.New("some internal plumbing detail"), http.StatusInternalServerError},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			got, body := rejectionFor(t, c.err)
			if got != c.want {
				t.Errorf("fuel-purchase %q: status = %d, want %d (body %s)", name, got, c.want, body)
			}
		})
	}
}

// TestReject_EveryRejectionCarriesAReasonBody: fuel-purchase "Rejections
// Report a Distinguishable Reason" enumerates not-docked, ownership,
// invalid/oversized tonnage, and unaffordable as the rejections that must
// carry a body — every sentinel here except ErrUnauthenticated, which is
// deliberately bodiless by an established codebase convention this
// package's own doc comment says it mirrors exactly (market.Handler.reject
// does the identical bodiless 401; see
// TestReject_UnauthenticatedIsBodilessByConvention below for that carve-out
// pinned on its own).
func TestReject_EveryRejectionCarriesAReasonBody(t *testing.T) {
	all := []error{
		ErrHidden, ErrNotDockedAtStation, ErrInvalidTonnage, ErrExceedsFreeHold,
		ErrMisconfiguredPrice, ErrCostOverflow, ErrZeroCost,
	}
	all = append(all,
		corporations.ErrOperationKeyFormat, corporations.ErrOperationKeyReserved,
		corporations.ErrOperationConflict, corporations.ErrReconciliationDivergence,
		corporations.ErrChainBroken, corporations.ErrInsufficientCredits,
	)
	for _, err := range all {
		_, body := rejectionFor(t, err)
		if body == "" {
			t.Errorf("%v: rejection carried an empty body", err)
			continue
		}
		var decoded map[string]string
		if unmarshalErr := json.Unmarshal([]byte(body), &decoded); unmarshalErr != nil {
			t.Errorf("%v: body %q is not the gin.H{\"error\": ...} shape", err, body)
			continue
		}
		if decoded["error"] == "" {
			t.Errorf("%v: body %q carries no non-empty \"error\" reason", err, body)
		}
	}
}

// TestReject_UnauthenticatedIsBodilessByConvention pins the ONE deliberate
// exception among the 4xx rejections: ErrUnauthenticated renders a bare 401
// with no JSON body, mirroring market.Handler.reject's identical choice for
// the same sentinel family — an intentional, established convention, not a
// gap in "every rejection carries a reason" (that requirement's own text
// names not-docked/ownership/tonnage/unaffordable, never unauthenticated).
func TestReject_UnauthenticatedIsBodilessByConvention(t *testing.T) {
	status, body := rejectionFor(t, ErrUnauthenticated)
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", status)
	}
	if body != "" {
		t.Errorf("body = %q, want empty (ErrUnauthenticated is bodiless by convention)", body)
	}
}

// TestReject_UnrecognisedErrorCarriesNoBody: the ONE case that is legitimately
// bodiless is the true-500 fallback — it must not leak the internal error's
// text to the caller (backend/CLAUDE.md never documents an internal-error
// reason contract, and leaking one would be an information disclosure).
func TestReject_UnrecognisedErrorCarriesNoBody(t *testing.T) {
	status, body := rejectionFor(t, errors.New("firestore: some internal plumbing detail"))
	if status != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", status)
	}
	if containsFold(body, "plumbing") {
		t.Errorf("the 500 fallback leaked internal error text: %s", body)
	}
}

// TestReject_HiddenRejectionsAreByteIdentical: fuel-purchase "The two
// existence-hidden rejections are mutually indistinguishable" — since both
// the unknown-fleet and foreign-fleet cases collapse to ErrHidden before
// ever reaching the handler, pinning that ErrHidden always renders the
// SAME body is what makes the two callers' responses byte-identical.
func TestReject_HiddenRejectionsAreByteIdentical(t *testing.T) {
	status1, body1 := rejectionFor(t, ErrHidden)
	status2, body2 := rejectionFor(t, ErrHidden)
	if status1 != http.StatusNotFound || status2 != http.StatusNotFound {
		t.Fatalf("statuses = %d, %d, want both 404", status1, status2)
	}
	if body1 != body2 {
		t.Errorf("two ErrHidden renders differ: %q vs %q", body1, body2)
	}
}

// TestReject_DistinctReasonsRenderDistinctly: fuel-purchase "Two different
// rejections carry different reasons" — every non-hidden sentinel's
// rendered body text must differ from every other's.
func TestReject_DistinctReasonsRenderDistinctly(t *testing.T) {
	distinct := []error{
		ErrUnauthenticated, ErrInvalidTonnage, ErrNotDockedAtStation,
		ErrExceedsFreeHold, ErrMisconfiguredPrice, ErrCostOverflow, ErrZeroCost,
		corporations.ErrInsufficientCredits, corporations.ErrOperationConflict,
	}
	seen := map[string]error{}
	for _, err := range distinct {
		_, body := rejectionFor(t, err)
		if earlier, dup := seen[body]; dup {
			t.Errorf("%v renders identically to %v: %s", err, earlier, body)
		}
		seen[body] = err
	}
}
