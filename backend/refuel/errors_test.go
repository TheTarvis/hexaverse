package refuel

import (
	"errors"
	"fmt"
	"testing"

	"hexaverse/corporations"
)

// allRefuelSentinels is every sentinel this package defines
// (fuel-purchase "Rejections Report a Distinguishable Reason") — the whole
// point of errors.go is that each of these renders a distinguishable
// reason, so a pairwise-distinctness table over exactly this list is the
// right-shaped test for this file.
var allRefuelSentinels = []error{
	ErrHidden,
	ErrUnauthenticated,
	ErrNotDockedAtStation,
	ErrInvalidTonnage,
	ErrExceedsFreeHold,
	ErrMisconfiguredPrice,
	ErrCostOverflow,
	ErrZeroCost,
}

// TestSentinels_AreAllPairwiseDistinct: fuel-purchase "Two different
// rejections carry different reasons" is only true if the sentinels
// backing them never collide on message text.
func TestSentinels_AreAllPairwiseDistinct(t *testing.T) {
	seen := map[string]string{}
	for _, err := range allRefuelSentinels {
		msg := err.Error()
		if owner, dup := seen[msg]; dup {
			t.Errorf("sentinel message %q is shared by two distinct sentinels (already seen for %q)", msg, owner)
		}
		seen[msg] = msg
	}
	if len(seen) != len(allRefuelSentinels) {
		t.Errorf("%d distinct messages across %d declared sentinels", len(seen), len(allRefuelSentinels))
	}
}

// TestSentinels_AreAllNonNil guards against a future edit accidentally
// declaring a sentinel as a nil error, which errors.Is would never match.
func TestSentinels_AreAllNonNil(t *testing.T) {
	for i, err := range allRefuelSentinels {
		if err == nil {
			t.Errorf("allRefuelSentinels[%d] is nil", i)
		}
	}
}

// TestErrHidden_CarriesNoDistinguishingDetail: the ONE deliberate exception
// to distinguishability — errors.go's own doc comment says the unknown-
// fleet and foreign-fleet cases must collapse to one byte-identical
// reason, so ErrHidden's text must never leak which of the two occurred.
func TestErrHidden_CarriesNoDistinguishingDetail(t *testing.T) {
	msg := ErrHidden.Error()
	for _, leak := range []string{"fleet", "corp", "owner", "exist"} {
		if containsFold(msg, leak) {
			t.Errorf("ErrHidden's message %q mentions %q, which would narrow which case occurred", msg, leak)
		}
	}
}

// TestSentinels_SurviveWrapping: the service always wraps a sentinel with
// %w (backend/CLAUDE.md's "Errors" convention), and the handler's
// errors.Is-based switch depends on that wrapping being transparent — a
// sentinel that stopped surviving fmt.Errorf("...: %w", err) would silently
// fall through the handler's switch to the generic 500 branch.
func TestSentinels_SurviveWrapping(t *testing.T) {
	for _, err := range allRefuelSentinels {
		wrapped := fmt.Errorf("refuel: doing something: %w", err)
		if !errors.Is(wrapped, err) {
			t.Errorf("wrapped %v does not satisfy errors.Is against its own sentinel", err)
		}
	}
}

// TestSentinels_DoNotCollideWithCorporationsSentinels: the handler's
// switch also matches corporations package sentinels (operation-key
// format/reserved, conflict, insufficient credits, reconciliation
// divergence, chain broken) in the SAME statement as refuel's own — a
// message collision across the two packages would make one status branch
// silently swallow another package's distinct rejection.
func TestSentinels_DoNotCollideWithCorporationsSentinels(t *testing.T) {
	corpSentinels := []error{
		corporations.ErrOperationKeyFormat,
		corporations.ErrOperationKeyReserved,
		corporations.ErrOperationConflict,
		corporations.ErrReconciliationDivergence,
		corporations.ErrChainBroken,
		corporations.ErrInsufficientCredits,
	}
	for _, refuelErr := range allRefuelSentinels {
		for _, corpErr := range corpSentinels {
			if refuelErr.Error() == corpErr.Error() {
				t.Errorf("refuel sentinel %q collides with corporations sentinel message", refuelErr.Error())
			}
		}
	}
}

// containsFold is a tiny ASCII case-insensitive substring check — no new
// dependency for one test file.
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
