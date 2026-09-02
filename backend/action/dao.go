package action

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

const (
	actionsCollection = "actions"
	deltasCollection  = "deltas" // deltas/{scope}/entries/{actionId}
	deltaEntries      = "entries"
)

// slotField is the actor-doc field an action claims — its channel (#0006
// Decision #19). Empty (pre-channel action docs) means the movement slot.
func slotField(a Action) string {
	if a.Slot == "" {
		return SlotMovement
	}
	return a.Slot
}

// ledgerKeyOf is the ledger a resolve folds and appends its Delta to — the
// action's LedgerKey when named, defaulting to Scope otherwise (#0010
// Decision #12/#13 — "Ledger Key Decoupled From Channel Scope"). Every verb
// before mine never names a distinct LedgerKey, so this preserves prior
// scope-as-ledger behavior unchanged.
func ledgerKeyOf(a Action) string {
	if a.LedgerKey != "" {
		return a.LedgerKey
	}
	return a.Scope
}

//go:generate mockgen -destination=dao_mock.go -package=action -source=dao.go Dao

// Dao owns all Firestore I/O for actions, including the transactions that make
// commit and resolve exactly-once. Because a resolver's effect must land in the
// SAME transaction as the status flip (the exactly-once invariant), the resolve
// methods accept the verb's ResolveFunc and invoke it inside the transaction —
// the one place the layering bends, deliberately.
type Dao interface {
	Get(ctx context.Context, id string) (*Action, error)
	// List backs the inbox: actions for an actor, optionally filtered by status.
	List(ctx context.Context, actor string, statuses ...Status) ([]Action, error)

	// Commit stores the action and claims the actor's single slot in one
	// transaction, rejecting a second active action with ErrActiveActionExists.
	Commit(ctx context.Context, a Action, actorState map[string]interface{}) error
	// Cancel flips a running action to cancelled and releases the slot (merging
	// actorState, e.g. a coast-from-here fleet state) in one transaction.
	Cancel(ctx context.Context, id string, actorState map[string]interface{}) (*Action, error)
	Acknowledge(ctx context.Context, id string, at common.WorldMillis) (*Action, error)

	// ResolveOne resolves a single action: read → verify still running → run the
	// resolver → apply (status flip + slot release + delta/actor-state) atomically.
	// Returns nil,nil when the action was already resolved (a harmless no-op). The
	// delta's doc id is the actionId, so concurrent resolvers yield exactly one.
	ResolveOne(ctx context.Context, id string, resolve ResolveFunc) (*Action, error)

	// DueIDs returns running actions whose eta ≤ now, in ETA order, filtered by the
	// given field ("scope" or "actor") — or unfiltered (field == "") for the sweep.
	DueIDs(ctx context.Context, field, value string, now common.WorldMillis) ([]string, error)

	// FoldDeltas sums delta amounts for a scope with effectAt ≤ upTo — the read
	// half of remaining(T). No materialized field exists.
	FoldDeltas(ctx context.Context, scope string, upTo common.WorldMillis) (float64, error)
}

// transactionalCommitter is implemented by a Dao capable of invoking an
// ActorStateFunc producer inside its own commit transaction (add-fuel-as-
// cargo RULING 1). Deliberately NOT folded into the Dao interface: a
// hand-written test Dao implementing only the base Commit method must keep
// satisfying Dao unchanged. Service.Commit probes for this via a type
// assertion when CommitSpec.ActorStateFunc is supplied.
type transactionalCommitter interface {
	CommitWithProducer(ctx context.Context, a Action, producer ActorStateFunc) error
}

// transactionalCanceler is CancelWithProducer's own optional-capability
// interface, mirroring transactionalCommitter for the cancel path.
type transactionalCanceler interface {
	CancelWithProducer(ctx context.Context, id string, actorState map[string]interface{}, producerFor func(actionType string) (ActorStateFunc, bool)) (*Action, error)
}

type DaoImpl struct {
	db    common.FirestoreService
	clock common.WorldTime
}

func NewDao() Dao { return &DaoImpl{db: common.NewFirestoreService(), clock: common.WorldClock()} }

func NewDaoWith(db common.FirestoreService, clock common.WorldTime) Dao {
	return &DaoImpl{db: db, clock: clock}
}

func (dao *DaoImpl) actionRef(id string) *firestore.DocumentRef {
	return dao.db.Collection(actionsCollection).Doc(id)
}

func (dao *DaoImpl) deltaRef(ledgerKey, actionID string) *firestore.DocumentRef {
	return dao.db.Collection(deltasCollection).Doc(ledgerKey).Collection(deltaEntries).Doc(actionID)
}

// refFromPath resolves an alternating collection/doc path
// (["col", "doc", "col", "doc", ...], even length ≥ 2) to a document ref, so a
// resolver's structured Writes can target any collection without the action
// domain importing the verb's package.
func (dao *DaoImpl) refFromPath(path []string) (*firestore.DocumentRef, error) {
	if len(path) < 2 || len(path)%2 != 0 {
		return nil, fmt.Errorf("resolve write path must be alternating collection/doc (even length ≥ 2), got %v", path)
	}
	col := dao.db.Collection(path[0])
	doc := col.Doc(path[1])
	for i := 2; i < len(path); i += 2 {
		doc = doc.Collection(path[i]).Doc(path[i+1])
	}
	return doc, nil
}

func (dao *DaoImpl) Get(ctx context.Context, id string) (*Action, error) {
	doc, err := dao.db.Get(ctx, actionsCollection, id)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	if !doc.Exists() {
		return nil, nil
	}
	var a Action
	if err := doc.DataTo(&a); err != nil {
		return nil, err
	}
	return &a, nil
}

func (dao *DaoImpl) List(ctx context.Context, actor string, statuses ...Status) ([]Action, error) {
	q := dao.db.Collection(actionsCollection).Where("actor", "==", actor)
	if len(statuses) == 1 {
		q = q.Where("status", "==", string(statuses[0]))
	}
	iter := q.Documents(ctx)
	defer iter.Stop()

	var out []Action
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var a Action
		if err := doc.DataTo(&a); err != nil {
			return nil, err
		}
		// Multi-status filter in memory (Firestore "in" would need a composite index
		// and the inbox status set is tiny).
		if len(statuses) > 1 && !containsStatus(statuses, a.Status) {
			continue
		}
		out = append(out, a)
	}
	return out, nil
}

// commitTx is Commit/CommitWithProducer's shared shape: read the actor doc,
// check the slot, resolve the fields to merge (either the caller's static
// map, or — add-fuel-as-cargo RULING 1 — a transaction-scoped producer's own
// computation from that SAME read), then create the action and merge the
// actor doc. A resolve error (the producer's veto) aborts before either
// write, so an unaffordable commit persists nothing at all.
func (dao *DaoImpl) commitTx(ctx context.Context, a Action, resolve func(actorData map[string]interface{}) (map[string]interface{}, error)) error {
	return dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		actorRef := dao.db.Collection(a.ActorCollection).Doc(a.Actor)
		actorSnap, err := tx.Get(actorRef)
		if err != nil {
			return fmt.Errorf("reading actor %s/%s: %w", a.ActorCollection, a.Actor, err)
		}
		if active, _ := actorSnap.Data()[slotField(a)].(string); active != "" {
			return ErrActiveActionExists
		}
		merged, err := resolve(actorSnap.Data())
		if err != nil {
			return err
		}
		if err := tx.Create(dao.actionRef(a.Id), a); err != nil {
			return fmt.Errorf("creating action: %w", err)
		}
		return tx.Set(actorRef, mergeActorState(slotField(a), a.Id, merged), firestore.MergeAll)
	})
}

func (dao *DaoImpl) Commit(ctx context.Context, a Action, actorState map[string]interface{}) error {
	return dao.commitTx(ctx, a, func(map[string]interface{}) (map[string]interface{}, error) {
		return actorState, nil
	})
}

// CommitWithProducer is Commit's transaction-scoped-producer variant
// (add-fuel-as-cargo, RULING 1) — NOT part of the Dao interface (an optional
// capability a caller probes for via the transactionalCommitter interface),
// so a hand-written test Dao that only implements the base Commit method
// still satisfies Dao unchanged.
func (dao *DaoImpl) CommitWithProducer(ctx context.Context, a Action, producer ActorStateFunc) error {
	return dao.commitTx(ctx, a, producer)
}

// cancelTx is Cancel/CancelWithProducer's shared shape.
func (dao *DaoImpl) cancelTx(ctx context.Context, id string, resolve func(a Action, actorData map[string]interface{}) (map[string]interface{}, error)) (*Action, error) {
	var out *Action
	err := dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		out = nil // reset on retry
		ref := dao.actionRef(id)
		snap, err := tx.Get(ref)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrNotFound
			}
			return err
		}
		var a Action
		if err := snap.DataTo(&a); err != nil {
			return err
		}
		if a.Status != StatusRunning {
			return ErrNotRunning
		}
		actorRef := dao.db.Collection(a.ActorCollection).Doc(a.Actor)
		actorSnap, err := tx.Get(actorRef)
		if err != nil {
			return err
		}
		merged, err := resolve(a, actorSnap.Data())
		if err != nil {
			return err
		}
		a.Status = StatusCancelled
		if err := tx.Update(ref, []firestore.Update{{Path: "status", Value: string(StatusCancelled)}}); err != nil {
			return err
		}
		if err := tx.Set(actorRef, mergeActorState(slotField(a), "", merged), firestore.MergeAll); err != nil {
			return err
		}
		out = &a
		return nil
	})
	return out, err
}

func (dao *DaoImpl) Cancel(ctx context.Context, id string, actorState map[string]interface{}) (*Action, error) {
	return dao.cancelTx(ctx, id, func(Action, map[string]interface{}) (map[string]interface{}, error) {
		return actorState, nil
	})
}

// CancelWithProducer is Cancel's transaction-scoped-producer variant — the
// generic action-cancel route's (POST /v1/actions/:actionId/cancel) own
// mechanism for a per-type discard effect (add-fuel-as-cargo tasks.md 2.5:
// "the trigger is universal ... a future discard path inherits the refund
// automatically"). producerFor resolves the running action's OWN type to a
// registered producer; when none is registered, this behaves identically to
// Cancel(actorState). NOT part of the Dao interface — see CommitWithProducer.
func (dao *DaoImpl) CancelWithProducer(ctx context.Context, id string, actorState map[string]interface{}, producerFor func(actionType string) (ActorStateFunc, bool)) (*Action, error) {
	return dao.cancelTx(ctx, id, func(a Action, actorData map[string]interface{}) (map[string]interface{}, error) {
		if fn, ok := producerFor(a.Type); ok {
			return fn(actorData)
		}
		return actorState, nil
	})
}

func (dao *DaoImpl) Acknowledge(ctx context.Context, id string, at common.WorldMillis) (*Action, error) {
	if err := dao.db.Update(ctx, actionsCollection, id, []firestore.Update{
		{Path: "acknowledgedAt", Value: int64(at)},
	}); err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return dao.Get(ctx, id)
}

func (dao *DaoImpl) ResolveOne(ctx context.Context, id string, resolve ResolveFunc) (*Action, error) {
	var out *Action
	err := dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		out = nil // reset on retry
		ref := dao.actionRef(id)
		snap, err := tx.Get(ref)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return nil // vanished — nothing to do
			}
			return err
		}
		var a Action
		if err := snap.DataTo(&a); err != nil {
			return err
		}
		if a.Status != StatusRunning {
			return nil // already resolved by another reader — no-op
		}

		// --- reads first (Firestore transactions require reads before writes) ---
		actorRef := dao.db.Collection(a.ActorCollection).Doc(a.Actor)
		actorSnap, err := tx.Get(actorRef)
		if err != nil {
			return fmt.Errorf("reading actor for resolve: %w", err)
		}
		ledgerKey := ledgerKeyOf(a)
		res, err := resolve(ctx, Resolution{
			Action:      a,
			At:          a.Eta,
			DecodeActor: actorSnap.DataTo,
			Remaining:   func(t common.WorldMillis) (float64, error) { return dao.foldDeltasTx(ctx, tx, ledgerKey, t) },
		})
		if err != nil {
			return err
		}

		// --- writes ---
		if err := tx.Update(ref, []firestore.Update{
			{Path: "status", Value: string(StatusDone)},
			{Path: "outcome", Value: res.Outcome},
			{Path: "resolvedAt", Value: int64(dao.clock.Now())},
		}); err != nil {
			return err
		}
		if err := tx.Set(actorRef, mergeActorState(slotField(a), "", res.ActorState), firestore.MergeAll); err != nil {
			return err
		}
		if res.Delta != nil {
			d := *res.Delta
			d.ActorId = a.Actor
			d.EffectAt = a.Eta
			// Create fails if the delta already exists — the exactly-once guard. A
			// concurrent resolver that already wrote it makes this txn fail and no-op.
			if err := tx.Create(dao.deltaRef(ledgerKey, a.Id), d); err != nil {
				return fmt.Errorf("appending delta: %w", err)
			}
		}
		// Structured effect writes (e.g. scan minting observations). Merged, not
		// created — idempotent by contract, so a duplicate resolve overwrites with
		// the same state rather than failing (unlike the additive Delta).
		for _, w := range res.Writes {
			ref, err := dao.refFromPath(w.Path)
			if err != nil {
				return err
			}
			if err := tx.Set(ref, w.Data, firestore.MergeAll); err != nil {
				return fmt.Errorf("applying resolve write at %v: %w", w.Path, err)
			}
		}
		a.Status = StatusDone
		a.Outcome = res.Outcome
		a.ResolvedAt = dao.clock.Now()
		out = &a
		return nil
	})
	return out, err
}

func (dao *DaoImpl) DueIDs(ctx context.Context, field, value string, now common.WorldMillis) ([]string, error) {
	q := dao.db.Collection(actionsCollection).
		Where("status", "==", string(StatusRunning)).
		Where("eta", "<=", int64(now)).
		OrderBy("eta", firestore.Asc)
	if field != "" {
		q = q.Where(field, "==", value)
	}
	iter := q.Documents(ctx)
	defer iter.Stop()

	var ids []string
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		ids = append(ids, doc.Ref.ID)
	}
	return ids, nil
}

// FoldDeltas sums delta amounts for a ledger key with effectAt ≤ upTo — the
// read half of remaining(T), used by the public commit-time fold
// (Service.Remaining, e.g. mine's "Already-Depleted Lode Rejected At
// Commit"). Also logs the fold's delta-entry count against the ledger key
// (#0010 "Mine Ledger Depth Is Observable" / design.md Decision #17): the
// risk this guards is the O(entry-count) transactional fold cost, so the
// count — not the folded tonnage — is the signal that must be attributable
// to the ledger key, independent of whether the caller's own commit
// ultimately succeeds.
func (dao *DaoImpl) FoldDeltas(ctx context.Context, scope string, upTo common.WorldMillis) (float64, error) {
	iter := dao.db.Collection(deltasCollection).Doc(scope).Collection(deltaEntries).
		Where("effectAt", "<=", int64(upTo)).Documents(ctx)
	defer iter.Stop()
	var sum float64
	var n int
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return 0, err
		}
		var d Delta
		if err := doc.DataTo(&d); err != nil {
			return 0, err
		}
		sum += d.Amount
		n++
	}
	log.Info().Ctx(ctx).Str("ledgerKey", scope).Int("deltaCount", n).Msg("Ledger fold delta count")
	return sum, nil
}

// foldDeltasTx is the transaction-consistent fold used by a resolver's
// Remaining (e.g. mine's "Resolve Clamps Yield to Reality"). Logs the same
// ledger-key-attributed delta-entry count as FoldDeltas (#0010 Decision #17)
// — mine pays this transactional fold cost at resolve, not just at commit.
func (dao *DaoImpl) foldDeltasTx(ctx context.Context, tx *firestore.Transaction, scope string, upTo common.WorldMillis) (float64, error) {
	iter := tx.Documents(dao.db.Collection(deltasCollection).Doc(scope).Collection(deltaEntries).
		Where("effectAt", "<=", int64(upTo)))
	defer iter.Stop()
	var sum float64
	var n int
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return 0, err
		}
		var d Delta
		if err := doc.DataTo(&d); err != nil {
			return 0, err
		}
		sum += d.Amount
		n++
	}
	log.Info().Ctx(ctx).Str("ledgerKey", scope).Int("deltaCount", n).Msg("Ledger fold delta count")
	return sum, nil
}

// mergeActorState builds the actor-doc patch for a channel's slot claim
// (actionID != "") or release (actionID == ""), merged with any verb-supplied
// fields.
func mergeActorState(slot, actionID string, actorState map[string]interface{}) map[string]interface{} {
	m := map[string]interface{}{slot: actionID}
	for k, v := range actorState {
		m[k] = v
	}
	return m
}

func containsStatus(set []Status, s Status) bool {
	for _, x := range set {
		if x == s {
			return true
		}
	}
	return false
}
