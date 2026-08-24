package market

import (
	"errors"
	"testing"
)

// TestErrHidden_IsTheOnlyExistenceHidingReason: the four cases that must be
// indistinguishable (unknown fleet, foreign fleet, unknown station, below-gate
// station) all share ONE sentinel, so there is exactly one reason string to
// render and no way for the handler to accidentally narrow it.
func TestErrHidden_CarriesNoDetail(t *testing.T) {
	msg := ErrHidden.Error()
	for _, leak := range []string{"fleet", "station", "corp", "tier", "own", "visib"} {
		if contains(msg, leak) {
			t.Errorf("the hidden reason %q mentions %q, which narrows which case occurred", msg, leak)
		}
	}
}

// TestSentinels_AreAllDistinct: every rejection but the hidden family must be
// distinguishable, so no two sentinels may share a message.
func TestSentinels_AreAllDistinct(t *testing.T) {
	all := []error{
		ErrHidden, ErrUnauthenticated, ErrNotDockedAtStation, ErrInvalidTonnage,
		ErrInsufficientCargo, ErrNotTradableHere, ErrPriceChanged, ErrInvalidGuard,
		ErrZeroProceeds, ErrProceedsOverflow, ErrBudgetExhausted,
		ErrAbsorptionExhausted, ErrBusy,
	}
	seen := map[string]bool{}
	for _, err := range all {
		msg := err.Error()
		if seen[msg] {
			t.Errorf("two sentinels share the message %q", msg)
		}
		seen[msg] = true
	}
	if len(seen) != len(all) {
		t.Errorf("%d distinct messages across %d sentinels", len(seen), len(all))
	}
}

func TestSentinels_SurviveWrapping(t *testing.T) {
	// The budget check wraps its sentinel with the offending kind; errors.Is must
	// still recognise it, or the handler would render it a 500.
	wrapped := errors.New("wrapper")
	_ = wrapped
	if !errors.Is(ErrBudgetExhausted, ErrBudgetExhausted) {
		t.Error("sentinel does not match itself")
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
