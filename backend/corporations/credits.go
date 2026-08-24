package corporations

import (
	"context"
	"errors"
	"fmt"
	"math"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	// ledgerSubcollection is the append-only trade ledger under a corp doc. Doc id
	// = the operation key (#0011 Decision 7) — per-corporation, never global, so
	// one corp's key has no reach into another's.
	ledgerSubcollection = "ledger"
	// reconciliationSubcollection holds the single checkpoint/divergence doc.
	reconciliationSubcollection = "reconciliation"
	// reconciliationDocId is that subcollection's one doc — the interior/meta
	// singleton shape this codebase already uses.
	reconciliationDocId = "state"
)

// LedgerPageSize is the ledger read's page size. The ledger is unbounded over a
// corp's lifetime (#0011 Decision 8), so the read is never a single unbounded
// response.
const LedgerPageSize = 50

var (
	// ErrInsufficientCredits: the debit would take the balance below zero. The
	// whole debit is rejected — never a partial application.
	ErrInsufficientCredits = errors.New("corporations: insufficient credits")
	// ErrOperationConflict: the operation key was already recorded for this corp
	// but names DIFFERENT parameters — a conflict, not a replay. The recorded
	// entry's result is never returned as though it were this request's outcome.
	ErrOperationConflict = errors.New("corporations: operation key already used with different parameters")
	// ErrZeroAmount: a credit mutation of exactly zero. No ledger entry may record
	// a zero amount, so the mutation is refused rather than writing a no-op row.
	ErrZeroAmount = errors.New("corporations: credit mutation amount must be non-zero")
	// ErrReconciliationDivergence: this corp has a confirmed, unresolved
	// balance/ledger divergence. Further mutation is refused until an adjustment
	// entry resolves it — mutating a balance already known to be wrong only
	// compounds the error.
	ErrReconciliationDivergence = errors.New("corporations: corporation has an unresolved ledger divergence")
	// ErrBalanceOverflow: the computed balance would overflow int64.
	ErrBalanceOverflow = errors.New("corporations: credit amount would overflow the balance")
	// ErrChainBroken: the computed new balance disagrees with the previous entry's
	// recorded resulting balance — the O(1) write-time chained check (#0011
	// Decision 18) catching a divergence at the moment it would occur, rather than
	// waiting for the next periodic fold.
	ErrChainBroken = errors.New("corporations: computed balance disagrees with the previous ledger entry")
)

// CreditStore owns the transactional credit surface: the balance field, the
// ledger subcollection, and the reconciliation checkpoint. Deliberately NOT part
// of the mocked Dao interface — every operation here is transaction-scoped and
// needs real document refs, and its tests run against the emulator where a mock
// would prove nothing.
type CreditStore struct {
	db common.FirestoreService
}

func NewCreditStore() *CreditStore { return &CreditStore{db: common.NewFirestoreService()} }

func NewCreditStoreWith(db common.FirestoreService) *CreditStore { return &CreditStore{db: db} }

func (s *CreditStore) corpRef(corpID string) *firestore.DocumentRef {
	return s.db.Collection(corporationsCollection).Doc(corpID)
}

func (s *CreditStore) ledgerRef(corpID, key string) *firestore.DocumentRef {
	return s.corpRef(corpID).Collection(ledgerSubcollection).Doc(key)
}

func (s *CreditStore) ledgerCol(corpID string) *firestore.CollectionRef {
	return s.corpRef(corpID).Collection(ledgerSubcollection)
}

func (s *CreditStore) reconRef(corpID string) *firestore.DocumentRef {
	return s.corpRef(corpID).Collection(reconciliationSubcollection).Doc(reconciliationDocId)
}

// reconState is the checkpoint + divergence-halt doc. The cursor is COMPOUND —
// (worldTime, doc id) — because a ledger doc id is a caller-supplied operation
// key carrying no chronology (#0011 Decision 8), so "entries after this id"
// cannot mean "entries after this point in time", and two entries can
// legitimately share a world-time tick.
type reconState struct {
	CheckpointBalance   int64              `firestore:"checkpointBalance"`
	CursorWorldTime     common.WorldMillis `firestore:"cursorWorldTime"`
	CursorId            string             `firestore:"cursorId"`
	Divergent           bool               `firestore:"divergent"`
	DivergenceDetected  common.WorldMillis `firestore:"divergenceDetectedAt,omitempty"`
	LastCheckedWorldTim common.WorldMillis `firestore:"lastCheckedAt,omitempty"`
}

// CreditPlan is a validated, staged credit mutation: everything the write phase
// needs, with every read already done.
//
// Two-phase by necessity, not taste (#0011 Decision 16, corrected at
// implementation): Firestore requires EVERY read before EVERY write in a
// transaction — action/dao.go's ResolveOne says so in a comment and is
// structured the same way — so a settlement composing three domains' primitives
// must run all three reads, then all three writes. A single read-then-write
// primitive cannot compose.
type CreditPlan struct {
	store  *CreditStore
	corpID string
	entry  LedgerEntry

	// Replay marks an already-recorded operation key whose parameters match. The
	// write phase stages nothing and the caller returns Recorded as the result.
	Replay bool
	// Recorded is the previously-recorded entry on a replay — always read from
	// THIS corporation's own ledger, never a key lookup that could reach another
	// corp's row.
	Recorded *LedgerEntry
	// NewBalance is the balance after this entry (== entry.ResultingBalance).
	NewBalance int64
}

// Entry returns the entry this plan will append (or, on a replay, the one
// already recorded).
func (p *CreditPlan) Entry() LedgerEntry {
	if p.Replay && p.Recorded != nil {
		return *p.Recorded
	}
	return p.entry
}

// PrepareCreditInTx is the READ half of the only path that changes Credits. It
// re-reads the balance, the operation-key doc, the divergence-halt state, and
// the previous entry's resulting balance inside the caller's transaction, and
// rejects an overdraw in full. Nothing is written — call CreditPlan.Apply for
// that, after every other domain's prepare has run.
//
// entry supplies the mutation's detail (kind, amount, attribution, trade
// fields); Id, CorpId, WorldTime, and ResultingBalance are filled here.
func (s *CreditStore) PrepareCreditInTx(
	ctx context.Context,
	tx *firestore.Transaction,
	corpID, operationKey string,
	entry LedgerEntry,
	now common.WorldMillis,
) (*CreditPlan, error) {
	if corpID == "" {
		return nil, ErrNotFound
	}
	if entry.Amount == 0 {
		return nil, ErrZeroAmount
	}

	// --- reads only, in order ---

	// 1. The already-recorded entry under this key, if any. Scoped to THIS corp's
	// ledger by construction: the ref is built from corpID, so a replay can never
	// resolve to another corporation's row.
	existingSnap, err := tx.Get(s.ledgerRef(corpID, operationKey))
	if err != nil && status.Code(err) != codes.NotFound {
		return nil, fmt.Errorf("reading ledger entry: %w", err)
	}
	if existingSnap != nil && existingSnap.Exists() {
		var recorded LedgerEntry
		if err := existingSnap.DataTo(&recorded); err != nil {
			return nil, fmt.Errorf("decoding recorded ledger entry: %w", err)
		}
		// A reused key naming DIFFERENT parameters is a conflict, not a replay —
		// answering it from the recorded entry would report someone else's (or an
		// earlier, different) outcome as this request's.
		if FingerprintOf(&recorded) != FingerprintOf(&entry) {
			return nil, ErrOperationConflict
		}
		return &CreditPlan{
			store: s, corpID: corpID, Replay: true,
			Recorded: &recorded, NewBalance: recorded.ResultingBalance,
		}, nil
	}

	// 2. The divergence halt. A corp whose balance is already known to be wrong
	// takes no further mutation — except an adjustment, which is how it is fixed.
	recSnap, err := tx.Get(s.reconRef(corpID))
	if err != nil && status.Code(err) != codes.NotFound {
		return nil, fmt.Errorf("reading reconciliation state: %w", err)
	}
	var rec reconState
	if recSnap != nil && recSnap.Exists() {
		if err := recSnap.DataTo(&rec); err != nil {
			return nil, fmt.Errorf("decoding reconciliation state: %w", err)
		}
	}
	if rec.Divergent && entry.Kind != EntryAdjustment {
		return nil, ErrReconciliationDivergence
	}

	// 3. The current balance.
	corpSnap, err := tx.Get(s.corpRef(corpID))
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("reading corporation: %w", err)
	}
	var corp Corporation
	if err := corpSnap.DataTo(&corp); err != nil {
		return nil, fmt.Errorf("decoding corporation: %w", err)
	}

	// 4. The previous entry, for the O(1) write-time chained check. Ordered by the
	// same compound cursor the windowed fold uses.
	prev, err := s.latestEntryInTx(tx, corpID)
	if err != nil {
		return nil, err
	}

	// --- validation, no writes ---

	// An adjustment RE-ANCHORS the balance to the ledger's own head instead of
	// building on the stored balance, and is exempt from the chain check below.
	// It has to be: an adjustment exists precisely to resolve a divergence, so
	// subjecting it to the check that divergence trips would make the halt
	// permanent — nothing could ever clear it. Anchoring on the previous entry's
	// resulting balance leaves fold == balance true again by construction, and
	// stays O(1) (no unbounded fold inside the transaction).
	base := corp.Credits
	if entry.Kind == EntryAdjustment {
		base = 0
		if prev != nil {
			base = prev.ResultingBalance
		}
	} else if prev != nil && prev.ResultingBalance != corp.Credits {
		// The chain is already broken BEFORE this mutation: the stored balance
		// disagrees with the last entry's recorded result. Refuse rather than
		// stack another entry on a balance known to be wrong.
		log.Error().Ctx(ctx).
			Str("corpId", corpID).
			Int64("storedBalance", corp.Credits).
			Int64("lastEntryResultingBalance", prev.ResultingBalance).
			Str("signal", "credit_reconciliation_divergence").
			Msg("Ledger chain broken at write time")
		return nil, ErrChainBroken
	}

	newBalance, err := addCredits(base, entry.Amount)
	if err != nil {
		return nil, err
	}
	if newBalance < 0 {
		return nil, ErrInsufficientCredits
	}

	entry.Id = operationKey
	entry.CorpId = corpID
	entry.WorldTime = now
	entry.ResultingBalance = newBalance

	return &CreditPlan{store: s, corpID: corpID, entry: entry, NewBalance: newBalance}, nil
}

// Apply is the WRITE half: it stages the balance update and the ledger append
// into the same transaction. A replay stages nothing.
//
// The ledger write is a Create (not a Set): if a concurrent transaction already
// wrote this key, the create fails and the whole transaction aborts and retries
// — the exactly-once guard, exactly as action's delta append uses it.
func (p *CreditPlan) Apply(tx *firestore.Transaction) error {
	if p.Replay {
		return nil
	}
	if err := tx.Create(p.store.ledgerRef(p.corpID, p.entry.Id), p.entry); err != nil {
		return fmt.Errorf("appending ledger entry: %w", err)
	}
	if err := tx.Update(p.store.corpRef(p.corpID), []firestore.Update{
		{Path: "credits", Value: p.NewBalance},
	}); err != nil {
		return fmt.Errorf("updating balance: %w", err)
	}
	// An adjustment is what resolves a divergence halt (#0011 Decision 21) — the
	// only kind allowed through the halt, so landing one clears it.
	if p.entry.Kind == EntryAdjustment {
		if err := tx.Set(p.store.reconRef(p.corpID), map[string]any{
			"divergent": false,
		}, firestore.MergeAll); err != nil {
			return fmt.Errorf("clearing divergence halt: %w", err)
		}
	}
	return nil
}

// ApplyCredit is the thin single-mutation wrapper: it opens its own transaction
// and runs prepare-then-apply. Every NON-sale caller uses this (today: spawn's
// opening grant). The sale service runs the two phases itself, inside the one
// transaction it also composes fleet's and the station's phases into.
func (s *CreditStore) ApplyCredit(
	ctx context.Context,
	corpID, operationKey string,
	entry LedgerEntry,
	now common.WorldMillis,
) (*LedgerEntry, error) {
	var out LedgerEntry
	err := s.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		plan, err := s.PrepareCreditInTx(ctx, tx, corpID, operationKey, entry, now)
		if err != nil {
			return err
		}
		if err := plan.Apply(tx); err != nil {
			return err
		}
		out = plan.Entry()
		return nil
	})
	if err != nil {
		AuditCreditAttempt(ctx, entry.AccountId, corpID, operationKey, err)
		return nil, err
	}
	AuditCreditAttempt(ctx, entry.AccountId, corpID, operationKey, nil)
	ObserveMinted(ctx, corpID, out.Amount, out.WorldTime)
	return &out, nil
}

// latestEntryInTx reads the single most recent entry under the compound
// (worldTime, doc id) ordering. Firestore appends __name__ as the implicit final
// tiebreaker on any ordered query, so this needs no composite index beyond the
// automatic single-field one on worldTime.
func (s *CreditStore) latestEntryInTx(tx *firestore.Transaction, corpID string) (*LedgerEntry, error) {
	q := s.ledgerCol(corpID).
		OrderBy("worldTime", firestore.Desc).
		OrderBy(firestore.DocumentID, firestore.Desc).
		Limit(1)
	iter := tx.Documents(q)
	defer iter.Stop()
	doc, err := iter.Next()
	if errors.Is(err, iterator.Done) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading latest ledger entry: %w", err)
	}
	var e LedgerEntry
	if err := doc.DataTo(&e); err != nil {
		return nil, fmt.Errorf("decoding latest ledger entry: %w", err)
	}
	return &e, nil
}

// addCredits adds with an explicit overflow guard — a balance that would exceed
// int64 is rejected, never silently wrapped into a negative fortune.
func addCredits(balance, amount int64) (int64, error) {
	if amount > 0 && balance > math.MaxInt64-amount {
		return 0, ErrBalanceOverflow
	}
	if amount < 0 && balance < math.MinInt64-amount {
		return 0, ErrBalanceOverflow
	}
	return balance + amount, nil
}

// --- Ledger read (paginated) ------------------------------------------------

// LedgerPage is one bounded page of a corporation's ledger plus the cursor that
// continues it. NextCursor empty ⇒ the last page.
type LedgerPage struct {
	Entries    []LedgerEntry `json:"entries"`
	NextCursor string        `json:"nextCursor,omitempty"`
}

// ListLedger reads one page, newest first, under the same compound ordering the
// reconciliation cursor uses. cursor is an opaque "worldTime|docId" pair from a
// previous page.
func (s *CreditStore) ListLedger(ctx context.Context, corpID, cursor string, pageSize int) (*LedgerPage, error) {
	if pageSize <= 0 || pageSize > LedgerPageSize {
		pageSize = LedgerPageSize
	}
	q := s.ledgerCol(corpID).
		OrderBy("worldTime", firestore.Desc).
		OrderBy(firestore.DocumentID, firestore.Desc)
	if cursor != "" {
		wt, id, err := decodeCursor(cursor)
		if err != nil {
			return nil, err
		}
		q = q.StartAfter(int64(wt), id)
	}
	// One extra row tells us whether a further page exists without a second query.
	iter := q.Limit(pageSize + 1).Documents(ctx)
	defer iter.Stop()

	page := &LedgerPage{Entries: []LedgerEntry{}}
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("reading ledger page: %w", err)
		}
		var e LedgerEntry
		if err := doc.DataTo(&e); err != nil {
			return nil, fmt.Errorf("decoding ledger entry: %w", err)
		}
		page.Entries = append(page.Entries, e)
	}
	if len(page.Entries) > pageSize {
		page.Entries = page.Entries[:pageSize]
		last := page.Entries[pageSize-1]
		page.NextCursor = encodeCursor(last.WorldTime, last.Id)
	}
	return page, nil
}

func encodeCursor(wt common.WorldMillis, id string) string {
	return fmt.Sprintf("%d|%s", int64(wt), id)
}

func decodeCursor(c string) (common.WorldMillis, string, error) {
	var wt int64
	var id string
	// The id may itself contain no '|' (the operation-key charset forbids it), so
	// a single split is unambiguous.
	if _, err := fmt.Sscanf(c, "%d|", &wt); err != nil {
		return 0, "", fmt.Errorf("malformed ledger cursor: %w", err)
	}
	for i := 0; i < len(c); i++ {
		if c[i] == '|' {
			id = c[i+1:]
			break
		}
	}
	if id == "" {
		return 0, "", errors.New("malformed ledger cursor")
	}
	return common.WorldMillis(wt), id, nil
}
