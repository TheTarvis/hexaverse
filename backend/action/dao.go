package action

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	actionsCollection = "actions"
	deltasCollection  = "deltas" // deltas/{scope}/entries/{actionId}
	deltaEntries      = "entries"
	// activeActionField is the single-action-slot guard on an actor doc, claimed
	// at commit and released at resolve/cancel.
	activeActionField = "activeActionId"
)

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

func (dao *DaoImpl) deltaRef(scope, actionID string) *firestore.DocumentRef {
	return dao.db.Collection(deltasCollection).Doc(scope).Collection(deltaEntries).Doc(actionID)
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

func (dao *DaoImpl) Commit(ctx context.Context, a Action, actorState map[string]interface{}) error {
	return dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		actorRef := dao.db.Collection(a.ActorCollection).Doc(a.Actor)
		actorSnap, err := tx.Get(actorRef)
		if err != nil {
			return fmt.Errorf("reading actor %s/%s: %w", a.ActorCollection, a.Actor, err)
		}
		if active, _ := actorSnap.Data()[activeActionField].(string); active != "" {
			return ErrActiveActionExists
		}
		if err := tx.Create(dao.actionRef(a.Id), a); err != nil {
			return fmt.Errorf("creating action: %w", err)
		}
		return tx.Set(actorRef, mergeActorState(a.Id, actorState), firestore.MergeAll)
	})
}

func (dao *DaoImpl) Cancel(ctx context.Context, id string, actorState map[string]interface{}) (*Action, error) {
	var out *Action
	err := dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
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
		if _, err := tx.Get(actorRef); err != nil { // read-before-write
			return err
		}
		a.Status = StatusCancelled
		if err := tx.Update(ref, []firestore.Update{{Path: "status", Value: string(StatusCancelled)}}); err != nil {
			return err
		}
		if err := tx.Set(actorRef, mergeActorState("", actorState), firestore.MergeAll); err != nil {
			return err
		}
		out = &a
		return nil
	})
	return out, err
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
		res, err := resolve(ctx, Resolution{
			Action:      a,
			At:          a.Eta,
			DecodeActor: actorSnap.DataTo,
			Remaining:   func(t common.WorldMillis) (float64, error) { return dao.foldDeltasTx(tx, a.Scope, t) },
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
		if err := tx.Set(actorRef, mergeActorState("", res.ActorState), firestore.MergeAll); err != nil {
			return err
		}
		if res.Delta != nil {
			d := *res.Delta
			d.ActorId = a.Actor
			d.EffectAt = a.Eta
			// Create fails if the delta already exists — the exactly-once guard. A
			// concurrent resolver that already wrote it makes this txn fail and no-op.
			if err := tx.Create(dao.deltaRef(a.Scope, a.Id), d); err != nil {
				return fmt.Errorf("appending delta: %w", err)
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

func (dao *DaoImpl) FoldDeltas(ctx context.Context, scope string, upTo common.WorldMillis) (float64, error) {
	iter := dao.db.Collection(deltasCollection).Doc(scope).Collection(deltaEntries).
		Where("effectAt", "<=", int64(upTo)).Documents(ctx)
	defer iter.Stop()
	var sum float64
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
	}
	return sum, nil
}

// foldDeltasTx is the transaction-consistent fold used by a resolver's Remaining.
func (dao *DaoImpl) foldDeltasTx(tx *firestore.Transaction, scope string, upTo common.WorldMillis) (float64, error) {
	iter := tx.Documents(dao.db.Collection(deltasCollection).Doc(scope).Collection(deltaEntries).
		Where("effectAt", "<=", int64(upTo)))
	defer iter.Stop()
	var sum float64
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
	}
	return sum, nil
}

// mergeActorState builds the actor-doc patch for a slot claim (actionID != "")
// or release (actionID == ""), merged with any verb-supplied fields.
func mergeActorState(actionID string, actorState map[string]interface{}) map[string]interface{} {
	m := map[string]interface{}{activeActionField: actionID}
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
