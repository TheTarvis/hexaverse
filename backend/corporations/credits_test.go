package corporations

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
)

// creditFixture is one corporation with a live CreditStore pointed at the
// emulator. Every test gets its own corp id so parallel runs never collide.
type creditFixture struct {
	store  *CreditStore
	client *firestore.Client
	corpID string
	ctx    context.Context
}

func newCreditFixture(t *testing.T, startingBalance int64) (*creditFixture, func()) {
	t.Helper()
	db, client := common.SetupFirestoreTestDAO(t)
	corpID := "corp_" + t.Name()
	ctx := context.Background()

	corp := Corporation{
		Id: corpID, AccountId: "acct-" + t.Name(), Name: t.Name(),
		CreatedAt: 1000, Credits: startingBalance,
	}
	if _, err := client.Collection(corporationsCollection).Doc(corpID).Set(ctx, corp); err != nil {
		t.Fatalf("seeding corporation: %v", err)
	}

	f := &creditFixture{store: NewCreditStoreWith(db), client: client, corpID: corpID, ctx: ctx}
	return f, func() {
		// Per-test literal collection paths — there is no central registry, and a
		// parent-doc delete does NOT remove Firestore subcollections.
		common.CleanupFirestoreTestData(t, client,
			fmt.Sprintf("%s/%s/%s", corporationsCollection, corpID, ledgerSubcollection),
			fmt.Sprintf("%s/%s/%s", corporationsCollection, corpID, reconciliationSubcollection),
			corporationsCollection,
		)
	}
}

func (f *creditFixture) balance(t *testing.T) int64 {
	t.Helper()
	snap, err := f.client.Collection(corporationsCollection).Doc(f.corpID).Get(f.ctx)
	if err != nil {
		t.Fatalf("reading balance: %v", err)
	}
	var c Corporation
	if err := snap.DataTo(&c); err != nil {
		t.Fatalf("decoding corporation: %v", err)
	}
	return c.Credits
}

func (f *creditFixture) entryCount(t *testing.T) int {
	t.Helper()
	docs, err := f.client.Collection(corporationsCollection).Doc(f.corpID).
		Collection(ledgerSubcollection).Documents(f.ctx).GetAll()
	if err != nil {
		t.Fatalf("counting ledger: %v", err)
	}
	return len(docs)
}

func saleEntry(amount int64, tons float64) LedgerEntry {
	return LedgerEntry{
		AccountId: "acct-1", FleetId: "fleet-1", Kind: EntrySaleProceeds,
		Counterparty: "sys-1", Item: "metals", Quantity: tons,
		UnitPrice: 10, Amount: amount,
	}
}

func TestApplyCredit_OverdrawRejectedInFull(t *testing.T) {
	f, cleanup := newCreditFixture(t, 100)
	defer cleanup()

	// A debit past zero is refused ENTIRELY — never clamped to a partial amount
	// that drains the balance to zero.
	_, err := f.store.ApplyCredit(f.ctx, f.corpID, "overdraw-key-0123456789", LedgerEntry{
		AccountId: "acct-1", Kind: EntryAdjustment, Amount: -500,
	}, 2000)
	if !errors.Is(err, ErrInsufficientCredits) {
		t.Fatalf("ApplyCredit = %v, want ErrInsufficientCredits", err)
	}
	if got := f.balance(t); got != 100 {
		t.Errorf("balance = %d, want 100 (unchanged)", got)
	}
	if got := f.entryCount(t); got != 0 {
		t.Errorf("ledger has %d entries, want 0 — a rejected mutation writes nothing", got)
	}
}

func TestApplyCredit_BalanceAndLedgerLandTogether(t *testing.T) {
	f, cleanup := newCreditFixture(t, 100)
	defer cleanup()

	entry, err := f.store.ApplyCredit(f.ctx, f.corpID, "settle-key-0123456789", saleEntry(250, 25), 2000)
	if err != nil {
		t.Fatalf("ApplyCredit: %v", err)
	}
	if got := f.balance(t); got != 350 {
		t.Errorf("balance = %d, want 350", got)
	}
	if got := f.entryCount(t); got != 1 {
		t.Fatalf("ledger has %d entries, want 1", got)
	}
	// The entry records the resulting balance, which is what the next mutation's
	// O(1) chained check validates against.
	if entry.ResultingBalance != 350 {
		t.Errorf("entry.ResultingBalance = %d, want 350", entry.ResultingBalance)
	}
	if entry.AccountId != "acct-1" {
		t.Errorf("entry.AccountId = %q, want the triggering account", entry.AccountId)
	}
}

func TestApplyCredit_RetriedKeyIsANoOp(t *testing.T) {
	f, cleanup := newCreditFixture(t, 100)
	defer cleanup()

	const key = "retry-key-0123456789ab"
	first, err := f.store.ApplyCredit(f.ctx, f.corpID, key, saleEntry(250, 25), 2000)
	if err != nil {
		t.Fatalf("first ApplyCredit: %v", err)
	}
	// The client's ordinary retry-after-a-lost-response. A sale claims no action
	// slot, so it inherits none of the spine's retry safety — this key is the
	// entire guard against a double sale.
	second, err := f.store.ApplyCredit(f.ctx, f.corpID, key, saleEntry(250, 25), 3000)
	if err != nil {
		t.Fatalf("retried ApplyCredit: %v", err)
	}
	if got := f.balance(t); got != 350 {
		t.Errorf("balance = %d, want 350 — the retry must not apply a second time", got)
	}
	if got := f.entryCount(t); got != 1 {
		t.Errorf("ledger has %d entries, want 1", got)
	}
	if second.ResultingBalance != first.ResultingBalance {
		t.Errorf("replay returned %d, want the original %d", second.ResultingBalance, first.ResultingBalance)
	}
}

func TestApplyCredit_ReusedKeyWithDifferentParametersIsAConflict(t *testing.T) {
	f, cleanup := newCreditFixture(t, 100)
	defer cleanup()

	const key = "conflict-key-0123456789"
	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, key, saleEntry(250, 25), 2000); err != nil {
		t.Fatalf("first ApplyCredit: %v", err)
	}
	// Same key, different tonnage: this is NOT the same request, so answering it
	// from the recorded entry would report an outcome the caller never asked for.
	_, err := f.store.ApplyCredit(f.ctx, f.corpID, key, saleEntry(250, 99), 3000)
	if !errors.Is(err, ErrOperationConflict) {
		t.Fatalf("mismatched replay = %v, want ErrOperationConflict", err)
	}
	if got := f.balance(t); got != 350 {
		t.Errorf("balance = %d, want 350 (unchanged by the conflict)", got)
	}
}

func TestApplyCredit_SameKeyAcrossCorporationsIsIndependent(t *testing.T) {
	a, cleanupA := newCreditFixture(t, 100)
	defer cleanupA()

	// A second corporation, sharing the emulator but not the keyspace.
	bID := a.corpID + "-B"
	if _, err := a.client.Collection(corporationsCollection).Doc(bID).Set(a.ctx, Corporation{
		Id: bID, AccountId: "acct-2", Name: "B", CreatedAt: 1000, Credits: 500,
	}); err != nil {
		t.Fatalf("seeding corp B: %v", err)
	}
	defer common.CleanupFirestoreTestData(t, a.client,
		fmt.Sprintf("%s/%s/%s", corporationsCollection, bID, ledgerSubcollection))

	const shared = "shared-key-0123456789ab"
	if _, err := a.store.ApplyCredit(a.ctx, a.corpID, shared, saleEntry(250, 25), 2000); err != nil {
		t.Fatalf("corp A ApplyCredit: %v", err)
	}
	// B's mutation under the SAME key must apply in full: the dedup anchor is
	// per-corporation, so A's key has no reach into B's ledger (and vice versa —
	// this is what stops a squatted key from suppressing a victim's mutation or
	// disclosing the squatter's resultingBalance).
	bEntry, err := a.store.ApplyCredit(a.ctx, bID, shared, saleEntry(70, 7), 2500)
	if err != nil {
		t.Fatalf("corp B ApplyCredit: %v", err)
	}
	if bEntry.ResultingBalance != 570 {
		t.Errorf("B's resulting balance = %d, want 570 — B must see only its own result", bEntry.ResultingBalance)
	}
	if bEntry.Amount != 70 {
		t.Errorf("B's amount = %d, want 70 (never A's 250)", bEntry.Amount)
	}
	if got := a.balance(t); got != 350 {
		t.Errorf("corp A's balance = %d, want 350 — B's mutation must not touch it", got)
	}
}

func TestApplyCredit_ConcurrentDistinctKeysNeverOverdraw(t *testing.T) {
	f, cleanup := newCreditFixture(t, 0)
	defer cleanup()

	// Anchor the ledger the way a real corporation's is — with its opening grant.
	// An adjustment re-anchors to the ledger head, so a corp whose ledger is empty
	// folds to 0 and could not be debited at all.
	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, "seed-grant-0123456789ab", LedgerEntry{
		AccountId: "acct-1", Kind: EntryStartingGrant, Amount: 100,
	}, 1500); err != nil {
		t.Fatalf("seeding grant: %v", err)
	}

	// Two debits of 80 against a balance of 100, with DIFFERENT keys, so the
	// idempotency anchor deliberately does not fire. Exactly one may settle: the
	// transactional re-read is what stops both passing a stale pre-check.
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = f.store.ApplyCredit(f.ctx, f.corpID,
				fmt.Sprintf("concurrent-key-%d-0123456789", i),
				LedgerEntry{AccountId: "acct-1", Kind: EntryAdjustment, Amount: -80},
				common.WorldMillis(2000+i))
		}(i)
	}
	wg.Wait()

	settled := 0
	for _, err := range errs {
		if err == nil {
			settled++
		} else if !errors.Is(err, ErrInsufficientCredits) {
			t.Fatalf("unexpected rejection: %v", err)
		}
	}
	if settled != 1 {
		t.Fatalf("%d of 2 concurrent debits settled, want exactly 1 (errors: %v, %v)", settled, errs[0], errs[1])
	}
	if got := f.balance(t); got != 20 {
		t.Errorf("balance = %d, want 20 — the loser must be rejected in full, never reduced", got)
	}
}

func TestApplyCredit_WriteTimeChainCatchesDivergenceBeforeThePeriodicFold(t *testing.T) {
	f, cleanup := newCreditFixture(t, 0)
	defer cleanup()

	if _, err := f.store.ApplyCredit(f.ctx, f.corpID, "chain-key-0123456789ab", saleEntry(100, 10), 2000); err != nil {
		t.Fatalf("seed entry: %v", err)
	}
	if _, err := f.client.Collection(corporationsCollection).Doc(f.corpID).
		Update(f.ctx, []firestore.Update{{Path: "credits", Value: int64(777)}}); err != nil {
		t.Fatalf("fixturing divergence: %v", err)
	}

	// No reconciliation cycle has run. The O(1) chained check inside the mutation
	// transaction must catch it anyway, at the moment it would compound.
	_, err := f.store.ApplyCredit(f.ctx, f.corpID, "chain-key-2-0123456789", saleEntry(50, 5), 3000)
	if !errors.Is(err, ErrChainBroken) {
		t.Fatalf("mutation over a broken chain = %v, want ErrChainBroken", err)
	}
	if got := f.balance(t); got != 777 {
		t.Errorf("balance = %d, want 777 — the refused mutation must change nothing", got)
	}
}

func TestListLedger_PaginatesWithACursor(t *testing.T) {
	f, cleanup := newCreditFixture(t, 0)
	defer cleanup()

	const total = 5
	for i := 0; i < total; i++ {
		if _, err := f.store.ApplyCredit(f.ctx, f.corpID,
			fmt.Sprintf("page-key-%d-0123456789a", i), saleEntry(10, 1),
			common.WorldMillis(2000+i)); err != nil {
			t.Fatalf("entry %d: %v", i, err)
		}
	}

	first, err := f.store.ListLedger(f.ctx, f.corpID, "", 2)
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	if len(first.Entries) != 2 {
		t.Fatalf("first page held %d entries, want 2", len(first.Entries))
	}
	if first.NextCursor == "" {
		t.Fatal("first page carried no cursor despite more entries existing")
	}

	seen := map[string]bool{}
	for _, e := range first.Entries {
		seen[e.Id] = true
	}
	cursor := first.NextCursor
	for cursor != "" {
		page, err := f.store.ListLedger(f.ctx, f.corpID, cursor, 2)
		if err != nil {
			t.Fatalf("page after %q: %v", cursor, err)
		}
		for _, e := range page.Entries {
			if seen[e.Id] {
				t.Fatalf("entry %s returned on more than one page", e.Id)
			}
			seen[e.Id] = true
		}
		cursor = page.NextCursor
	}
	if len(seen) != total {
		t.Errorf("paged through %d entries, want %d", len(seen), total)
	}
}
