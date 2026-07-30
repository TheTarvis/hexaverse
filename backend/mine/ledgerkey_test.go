package mine

import (
	"context"
	"strings"
	"testing"

	"hexaverse/system"
)

// mine-extraction spec: "Ledger Key Is System-And-Kind-Qualified, Channel
// Scope Is Per-System" (design.md Decisions #12/#14). Pure unit tests on
// mine.LedgerKey plus one service-level test that Scope and LedgerKey are
// committed as distinct values. All red now: LedgerKey is a stub (returns
// "").

// Scenario: (format) the ledger key is the `::`-joined systemId/featureId/kind.
func TestLedgerKey_Scenario_FormatIsColonColonJoined(t *testing.T) {
	got := LedgerKey("sys-042", "feat-belt-0", system.ResourceMetals)
	want := "sys-042::feat-belt-0::metals"
	if got != want {
		t.Fatalf("LedgerKey(...) = %q, want %q", got, want)
	}
}

// Scenario: A ledger key never contains a path separator.
func TestLedgerKey_Scenario_NeverContainsPathSeparator(t *testing.T) {
	got := LedgerKey("sys-042", "feat-belt-0", system.ResourceMetals)
	if strings.Contains(got, "/") {
		t.Fatalf("LedgerKey(...) = %q, contains '/' — not a valid Firestore document id", got)
	}
}

// Scenario: Two features in one system keep separate ledgers.
func TestLedgerKey_Scenario_TwoFeaturesOneSystemKeepSeparateLedgers(t *testing.T) {
	k1 := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	k2 := LedgerKey("sys-1", "feat-belt-1", system.ResourceMetals)
	if k1 == k2 {
		t.Fatalf("LedgerKey for feat-belt-0 and feat-belt-1 in the same system collided: both %q", k1)
	}
	if k1 == "" || k2 == "" {
		t.Fatalf("LedgerKey must not be empty: k1=%q k2=%q", k1, k2)
	}
}

// Scenario: Two kinds on one feature deplete independently (the key half —
// resolver_test.go / integration_test.go cover the fold-independence half).
func TestLedgerKey_Scenario_TwoKindsOneFeatureDifferentKeys(t *testing.T) {
	k1 := LedgerKey("sys-1", "feat-belt-0", system.ResourceMetals)
	k2 := LedgerKey("sys-1", "feat-belt-0", system.ResourceVolatiles)
	if k1 == k2 {
		t.Fatalf("LedgerKey for metals and volatiles on the same feature collided: both %q", k1)
	}
}

// Scenario: A completed mine resolves and pushes on the system scope — the
// action's committed Scope stays the containing systemId (never the ledger
// key), so read-resolution (ResolveDue(systemId)) and SSE completion align
// with the board, while the ledger key stays the finer per-feature/kind
// granularity (design.md Decision #12).
func TestCommit_Scenario_ScopeStaysSystemIdLedgerKeyDiffers(t *testing.T) {
	fa := &fakeMineActions{}
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
	if _, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest()); err != nil {
		t.Fatalf("commit: %v", err)
	}
	if fa.committed == nil {
		t.Fatalf("expected a committed spec, got nil")
	}
	if fa.committed.Scope != testSystemID {
		t.Errorf("committed Scope = %q, want the containing systemId %q (never the ledger key)", fa.committed.Scope, testSystemID)
	}
	wantLedgerKey := LedgerKey(testSystemID, testFeatureID, system.ResourceMetals)
	if fa.committed.LedgerKey != wantLedgerKey {
		t.Errorf("committed LedgerKey = %q, want %q", fa.committed.LedgerKey, wantLedgerKey)
	}
	if fa.committed.LedgerKey == fa.committed.Scope {
		t.Errorf("LedgerKey must be distinct from Scope (system-and-kind-qualified, not system-only)")
	}
}
