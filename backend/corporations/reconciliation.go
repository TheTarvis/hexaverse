package corporations

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ReconResult is one reconciliation verdict for one corporation.
type ReconResult struct {
	CorpId string `json:"corpId"`
	// Expected is the folded value: for a windowed check, checkpointBalance +
	// fold(entries newer than the cursor); for a full check, the fold of the
	// entire ledger from genesis.
	Expected int64 `json:"expected"`
	// Stored is the materialized balance on the corp doc.
	Stored int64 `json:"stored"`
	// Divergent is Expected != Stored.
	Divergent bool `json:"divergent"`
	// Windowed distinguishes the routine check from a full-history audit.
	Windowed bool `json:"windowed"`
	// EntriesFolded is how many entries this run actually read — the number that
	// makes "never re-pays the full history" observable.
	EntriesFolded int `json:"entriesFolded"`
}

// Reconcile runs the routine check for one corporation: a CHECKPOINTED, WINDOWED
// fold (#0011 Decision 8), never a from-genesis fold of an unbounded ledger. It
// folds only entries after the stored cursor and compares
// checkpointBalance + fold(newer) against the stored balance, advancing the
// checkpoint on a clean match and raising the divergence halt on a mismatch.
//
// The cursor is compound — (worldTime, doc id) — so two entries sharing a
// world-time tick that straddle a checkpoint boundary are each counted exactly
// once: StartAfter(worldTime, id) resumes strictly after a specific entry, not
// after a whole tick.
func (s *CreditStore) Reconcile(ctx context.Context, corpID string) (*ReconResult, error) {
	rec, err := s.readReconState(ctx, corpID)
	if err != nil {
		return nil, err
	}

	sum, count, lastWT, lastId, err := s.foldFrom(ctx, corpID, rec.CursorWorldTime, rec.CursorId)
	if err != nil {
		return nil, err
	}

	corp, err := s.readCorp(ctx, corpID)
	if err != nil {
		return nil, err
	}

	res := &ReconResult{
		CorpId:        corpID,
		Expected:      rec.CheckpointBalance + sum,
		Stored:        corp.Credits,
		Windowed:      true,
		EntriesFolded: count,
	}
	res.Divergent = res.Expected != res.Stored

	now := common.WorldClock().Now()
	if res.Divergent {
		// Attributable signal — names the corporation, distinguishable from a clean
		// result, and countable as a log-based metric.
		log.Error().Ctx(ctx).
			Str("corpId", corpID).
			Int64("expected", res.Expected).
			Int64("stored", res.Stored).
			Int("entriesFolded", count).
			Str("signal", "credit_reconciliation_divergence").
			Msg("Ledger fold disagrees with stored balance")
		if err := s.markDivergent(ctx, corpID, now); err != nil {
			return nil, err
		}
		return res, nil
	}

	log.Debug().Ctx(ctx).
		Str("corpId", corpID).
		Int("entriesFolded", count).
		Str("signal", "credit_reconciliation_clean").
		Msg("Ledger reconciled")

	// Advance the checkpoint ONLY on a clean match, and only if this run actually
	// folded something — an empty window leaves the cursor where it was.
	if count > 0 {
		if err := s.advanceCheckpoint(ctx, corpID, res.Stored, lastWT, lastId, now); err != nil {
			return nil, err
		}
	} else if err := s.stampChecked(ctx, corpID, now); err != nil {
		return nil, err
	}
	return res, nil
}

// ReconcileFull is the on-demand, genesis-to-now audit — the escape hatch for
// when a windowed check is itself suspected unsound (e.g. a checkpoint was
// advanced past an undetected divergence). It reads the whole ledger by
// construction and never advances the checkpoint.
func (s *CreditStore) ReconcileFull(ctx context.Context, corpID string) (*ReconResult, error) {
	sum, count, _, _, err := s.foldFrom(ctx, corpID, 0, "")
	if err != nil {
		return nil, err
	}
	corp, err := s.readCorp(ctx, corpID)
	if err != nil {
		return nil, err
	}
	res := &ReconResult{
		CorpId: corpID, Expected: sum, Stored: corp.Credits,
		Windowed: false, EntriesFolded: count,
	}
	res.Divergent = res.Expected != res.Stored
	if res.Divergent {
		log.Error().Ctx(ctx).
			Str("corpId", corpID).
			Int64("expected", res.Expected).
			Int64("stored", res.Stored).
			Str("signal", "credit_reconciliation_divergence").
			Msg("Full-history ledger fold disagrees with stored balance")
	}
	return res, nil
}

// ReconcileAll is the periodic cadence's body: it evaluates EVERY living
// corporation's reconciliation state, independently of whether any mutation
// happened. Returns the divergent results; a clean corp contributes nothing.
func (s *CreditStore) ReconcileAll(ctx context.Context, corpIDs []string) ([]ReconResult, error) {
	var divergent []ReconResult
	for _, id := range corpIDs {
		res, err := s.Reconcile(ctx, id)
		if err != nil {
			// One corp's failure must not abort the whole cycle.
			log.Error().Ctx(ctx).Err(err).Str("corpId", id).Msg("Reconciliation cycle failed for corporation")
			continue
		}
		if res.Divergent {
			divergent = append(divergent, *res)
		}
	}
	return divergent, nil
}

// foldFrom sums signed amounts strictly after the (worldTime, id) cursor, in
// ascending compound order, and reports the last entry it saw so a clean run can
// advance the checkpoint to exactly there.
func (s *CreditStore) foldFrom(
	ctx context.Context, corpID string, afterWT common.WorldMillis, afterId string,
) (sum int64, count int, lastWT common.WorldMillis, lastId string, err error) {
	q := s.ledgerCol(corpID).
		OrderBy("worldTime", firestore.Asc).
		OrderBy(firestore.DocumentID, firestore.Asc)
	if afterId != "" {
		q = q.StartAfter(int64(afterWT), afterId)
	}
	iter := q.Documents(ctx)
	defer iter.Stop()
	for {
		doc, e := iter.Next()
		if errors.Is(e, iterator.Done) {
			break
		}
		if e != nil {
			return 0, 0, 0, "", fmt.Errorf("folding ledger: %w", e)
		}
		var entry LedgerEntry
		if e := doc.DataTo(&entry); e != nil {
			return 0, 0, 0, "", fmt.Errorf("decoding ledger entry: %w", e)
		}
		sum += entry.Amount
		count++
		lastWT, lastId = entry.WorldTime, entry.Id
	}
	return sum, count, lastWT, lastId, nil
}

func (s *CreditStore) readReconState(ctx context.Context, corpID string) (reconState, error) {
	var rec reconState
	snap, err := s.reconRef(corpID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return rec, nil
		}
		return rec, fmt.Errorf("reading reconciliation state: %w", err)
	}
	if err := snap.DataTo(&rec); err != nil {
		return rec, fmt.Errorf("decoding reconciliation state: %w", err)
	}
	return rec, nil
}

func (s *CreditStore) readCorp(ctx context.Context, corpID string) (*Corporation, error) {
	snap, err := s.corpRef(corpID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("reading corporation: %w", err)
	}
	var corp Corporation
	if err := snap.DataTo(&corp); err != nil {
		return nil, fmt.Errorf("decoding corporation: %w", err)
	}
	return &corp, nil
}

func (s *CreditStore) advanceCheckpoint(
	ctx context.Context, corpID string, balance int64, wt common.WorldMillis, id string, now common.WorldMillis,
) error {
	_, err := s.reconRef(corpID).Set(ctx, map[string]any{
		"checkpointBalance": balance,
		"cursorWorldTime":   int64(wt),
		"cursorId":          id,
		"divergent":         false,
		"lastCheckedAt":     int64(now),
	}, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("advancing reconciliation checkpoint: %w", err)
	}
	return nil
}

func (s *CreditStore) stampChecked(ctx context.Context, corpID string, now common.WorldMillis) error {
	_, err := s.reconRef(corpID).Set(ctx, map[string]any{
		"lastCheckedAt": int64(now),
	}, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("stamping reconciliation check: %w", err)
	}
	return nil
}

func (s *CreditStore) markDivergent(ctx context.Context, corpID string, now common.WorldMillis) error {
	_, err := s.reconRef(corpID).Set(ctx, map[string]any{
		"divergent":            true,
		"divergenceDetectedAt": int64(now),
		"lastCheckedAt":        int64(now),
	}, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("raising divergence halt: %w", err)
	}
	return nil
}

// --- Observability (#0011 Decisions 18/20) ----------------------------------

// AuditCreditAttempt emits the structured audit record every credit-mutating
// attempt owes, settled OR rejected. Distinct from request-authorization's
// general HTTP audit middleware, which classifies only a 403 or a strict-tier
// 429 and would leave a sale's 400/404/409 rejections with no queryable trace.
//
// Each rejection carries its own reason string, so attempts stay individually
// countable by reason rather than collapsing into one unclassified line.
func AuditCreditAttempt(ctx context.Context, accountID, corpID, operationKey string, rejection error) {
	e := log.Info().Ctx(ctx).
		Str("accountId", accountID).
		Str("corpId", corpID).
		Str("operationKey", operationKey).
		Str("signal", "credit_mutation_attempt")
	if rejection != nil {
		e.Str("outcome", "rejected").Str("reason", rejection.Error()).Msg("Credit mutation rejected")
		return
	}
	e.Str("outcome", "settled").Msg("Credit mutation settled")
}

// ObserveMinted emits the credit-minting-rate signal: the sum of POSITIVE ledger
// amounts over time. With no credit sink this milestone (a pure faucet), this is
// the only inflation visibility that exists — and it is a log-based counter
// precisely so an operator can total it over a window without scanning every
// corporation's ledger.
func ObserveMinted(ctx context.Context, corpID string, amount int64, at common.WorldMillis) {
	if amount <= 0 {
		return
	}
	log.Info().Ctx(ctx).
		Str("corpId", corpID).
		Int64("amount", amount).
		Int64("worldTime", int64(at)).
		Str("signal", "credit_minted").
		Msg("Credits minted")
}
