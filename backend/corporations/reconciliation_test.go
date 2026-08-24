package corporations

// Reconciliation is the check that makes the materialized-balance deviation from
// the fold-of-deltas house pattern SAFE rather than merely convenient: the
// deviation holds exactly as long as the fold and the stored balance provably
// agree, so these tests are the thing standing behind "the ledger is the record;
// the balance is the truth."

import (
	"errors"
	"fmt"
	"testing"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
)

func TestReconcile_CleanCorporationMatches(t *testing.T) {
	f, cleanup := newCreditFixture(t, 0)
	defer cleanup()

	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, "grant-key-0123456789ab", LedgerEntry{
		AccountId: "acct-1", Kind: EntryStartingGrant, Amount: 1000,
	}, 2000); err != nil {
		t.Fatalf("grant: %v", err)
	}

	res, err := f.store.Reconcile(f.ctx, f.corpID)
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if res.Divergent {
		t.Errorf("clean corp reported divergent: expected=%d stored=%d", res.Expected, res.Stored)
	}
	if res.Expected != 1000 || res.Stored != 1000 {
		t.Errorf("fold=%d stored=%d, want both 1000", res.Expected, res.Stored)
	}
}

func TestReconcile_WindowedFoldSkipsCheckpointedEntries(t *testing.T) {
	f, cleanup := newCreditFixture(t, 0)
	defer cleanup()

	for i := 0; i < 3; i++ {
		if _, err := f.store.ApplyCredit(f.ctx, f.corpID,
			fmt.Sprintf("win-key-%d-0123456789ab", i), saleEntry(100, 10),
			common.WorldMillis(2000+i)); err != nil {
			t.Fatalf("entry %d: %v", i, err)
		}
	}
	first, err := f.store.Reconcile(f.ctx, f.corpID)
	if err != nil {
		t.Fatalf("first Reconcile: %v", err)
	}
	if first.EntriesFolded != 3 {
		t.Fatalf("first fold read %d entries, want 3", first.EntriesFolded)
	}

	// One more entry, then re-check: the windowed fold must read ONLY the new one.
	// This is the whole point of the checkpoint — an unbounded ledger is never
	// re-folded from genesis on the routine path.
	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, "win-key-3-0123456789ab", saleEntry(100, 10), 2100); err != nil {
		t.Fatalf("fourth entry: %v", err)
	}
	second, err := f.store.Reconcile(f.ctx, f.corpID)
	if err != nil {
		t.Fatalf("second Reconcile: %v", err)
	}
	if second.EntriesFolded != 1 {
		t.Errorf("second fold read %d entries, want 1 (checkpoint not honoured)", second.EntriesFolded)
	}
	if second.Divergent || second.Expected != 400 {
		t.Errorf("second fold = %d (divergent=%v), want 400 clean", second.Expected, second.Divergent)
	}
}

func TestReconcile_SameWorldTimeEntriesStraddlingCheckpointCountedOnce(t *testing.T) {
	f, cleanup := newCreditFixture(t, 0)
	defer cleanup()

	// Two entries sharing ONE world-time tick. A cursor of world time alone would
	// either skip the second or re-count the first; the compound (worldTime, id)
	// cursor resumes strictly after a specific entry.
	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, "tick-key-a-0123456789", saleEntry(100, 10), 5000); err != nil {
		t.Fatalf("entry a: %v", err)
	}
	if _, err := f.store.Reconcile(f.ctx, f.corpID); err != nil {
		t.Fatalf("checkpointing Reconcile: %v", err)
	}
	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, "tick-key-b-0123456789", saleEntry(100, 10), 5000); err != nil {
		t.Fatalf("entry b: %v", err)
	}

	res, err := f.store.Reconcile(f.ctx, f.corpID)
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if res.Divergent {
		t.Fatalf("same-tick straddle reported divergent: expected=%d stored=%d", res.Expected, res.Stored)
	}
	if res.EntriesFolded != 1 {
		t.Errorf("folded %d entries, want exactly 1 — the same-tick entry was skipped or double-counted", res.EntriesFolded)
	}
}

func TestReconcile_FixturedDivergenceIsFlaggedAndHaltsMutation(t *testing.T) {
	f, cleanup := newCreditFixture(t, 0)
	defer cleanup()

	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, "div-key-0123456789ab", saleEntry(100, 10), 2000); err != nil {
		t.Fatalf("seed entry: %v", err)
	}
	// Corrupt the materialized balance behind the ledger's back — the exact
	// drift the deviation from the fold-of-deltas pattern risks, and the reason
	// this invariant exists at all.
	if _, err := f.client.Collection(corporationsCollection).Doc(f.corpID).
		Update(f.ctx, []firestore.Update{{Path: "credits", Value: int64(999)}}); err != nil {
		t.Fatalf("fixturing divergence: %v", err)
	}

	res, err := f.store.Reconcile(f.ctx, f.corpID)
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if !res.Divergent {
		t.Fatal("fixtured divergence not detected")
	}
	if res.Expected != 100 || res.Stored != 999 {
		t.Errorf("expected=%d stored=%d, want 100 and 999", res.Expected, res.Stored)
	}

	// A confirmed divergence halts further mutation — continuing to mutate a
	// balance already known to be wrong only compounds the error.
	_, err = f.store.ApplyCredit(f.ctx, f.corpID, "post-div-key-0123456789", saleEntry(50, 5), 3000)
	if !errors.Is(err, ErrReconciliationDivergence) && !errors.Is(err, ErrChainBroken) {
		t.Fatalf("post-divergence mutation = %v, want a divergence rejection", err)
	}

	// An adjustment is the one kind that passes the halt, and landing it clears.
	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, "adjust-key-0123456789ab", LedgerEntry{
		AccountId: "operator", Kind: EntryAdjustment, Amount: 899,
	}, 4000); err != nil {
		t.Fatalf("adjustment: %v", err)
	}
	after, err := f.store.Reconcile(f.ctx, f.corpID)
	if err != nil {
		t.Fatalf("post-adjustment Reconcile: %v", err)
	}
	if after.Divergent {
		t.Errorf("still divergent after the adjustment: expected=%d stored=%d", after.Expected, after.Stored)
	}
}

func TestReconcileFull_AuditsFromGenesisIgnoringTheCheckpoint(t *testing.T) {
	f, cleanup := newCreditFixture(t, 0)
	defer cleanup()

	for i := 0; i < 3; i++ {
		if _, err := f.store.ApplyCredit(f.ctx, f.corpID,
			fmt.Sprintf("full-key-%d-0123456789a", i), saleEntry(100, 10),
			common.WorldMillis(2000+i)); err != nil {
			t.Fatalf("entry %d: %v", i, err)
		}
	}
	if _, err := f.store.Reconcile(f.ctx, f.corpID); err != nil {
		t.Fatalf("checkpointing Reconcile: %v", err)
	}

	// The windowed check would now read nothing. The full audit exists precisely
	// for when the checkpoint itself is suspected of having been advanced past an
	// undetected divergence, so it must re-read everything.
	res, err := f.store.ReconcileFull(f.ctx, f.corpID)
	if err != nil {
		t.Fatalf("ReconcileFull: %v", err)
	}
	if res.EntriesFolded != 3 {
		t.Errorf("full audit folded %d entries, want all 3", res.EntriesFolded)
	}
	if res.Windowed {
		t.Error("full audit reported itself windowed")
	}
	if res.Divergent || res.Expected != 300 {
		t.Errorf("full fold = %d (divergent=%v), want 300 clean", res.Expected, res.Divergent)
	}
}
