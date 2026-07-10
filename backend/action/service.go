package action

import (
	"context"
	"errors"

	"hexaverse/common"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

var (
	// ErrActiveActionExists is the single-slot guard: an actor may hold only one
	// running action at a time (#0005; the queue is deferred, not rejected).
	ErrActiveActionExists = errors.New("actor already has an active action")
	ErrNotFound           = errors.New("action not found")
	ErrNotRunning         = errors.New("action is not running")
	// ErrUnknownType means no resolver is registered for the committed type.
	ErrUnknownType = errors.New("unknown action type")
)

// CommitInterface is the narrow surface verb services depend on to ride the
// spine — kept small so fleet imports action, never the reverse (no import cycle).
type CommitInterface interface {
	Commit(ctx context.Context, spec CommitSpec) (*Action, error)
	Cancel(ctx context.Context, id string, actorState map[string]interface{}) (*Action, error)
	// ResolveActive resolves any of an actor's running actions whose eta has
	// passed — the read-time settle a fleet read triggers.
	ResolveActive(ctx context.Context, actor string) ([]Action, error)
}

type registered struct {
	kind Kind
	fn   ResolveFunc
}

type Service struct {
	dao       Dao
	clock     common.WorldTime
	publisher common.PubSubInterface // nil disables completion fan-out (tests)
	resolvers map[string]registered
}

func NewService() *Service {
	return &Service{
		dao:       NewDao(),
		clock:     common.WorldClock(),
		publisher: common.PubSub(),
		resolvers: map[string]registered{},
	}
}

// NewServiceWith injects deps for tests. Pass a nil publisher to skip completion
// fan-out.
func NewServiceWith(dao Dao, clock common.WorldTime, publisher common.PubSubInterface) *Service {
	return &Service{dao: dao, clock: clock, publisher: publisher, resolvers: map[string]registered{}}
}

// RegisterResolver wires a verb's per-type effect and its (static) kind. Called
// once at startup — fleet registers "burn", mine will register "mine", etc.
func (s *Service) RegisterResolver(actionType string, kind Kind, fn ResolveFunc) {
	s.resolvers[actionType] = registered{kind: kind, fn: fn}
}

func (s *Service) Get(ctx context.Context, id string) (*Action, error) {
	a, err := s.dao.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if a == nil {
		return nil, ErrNotFound
	}
	return a, nil
}

// Inbox lists an actor's actions, optionally filtered by status — the check-in
// surface (done-but-unacknowledged needs no timer).
func (s *Service) Inbox(ctx context.Context, actor string, statuses ...Status) ([]Action, error) {
	return s.dao.List(ctx, actor, statuses...)
}

// Commit validates the type, freezes the action, and claims the actor's single
// slot in one transaction (rejecting a second active action).
func (s *Service) Commit(ctx context.Context, spec CommitSpec) (*Action, error) {
	reg, ok := s.resolvers[spec.Type]
	if !ok {
		return nil, ErrUnknownType
	}
	now := s.clock.Now()
	a := Action{
		Id:              "action_" + uuid.NewString(),
		Type:            spec.Type,
		Kind:            reg.kind,
		Actor:           spec.Actor,
		ActorCollection: spec.ActorCollection,
		Scope:           spec.Scope,
		Params:          spec.Params,
		CommittedAt:     now,
		Eta:             spec.Eta,
		Status:          StatusRunning,
	}
	if err := s.dao.Commit(ctx, a, spec.ActorState); err != nil {
		return nil, err
	}
	log.Info().Ctx(ctx).Str("actionId", a.Id).Str("type", a.Type).Str("actor", a.Actor).
		Int64("eta", int64(a.Eta)).Msg("Action committed")
	return &a, nil
}

func (s *Service) Cancel(ctx context.Context, id string, actorState map[string]interface{}) (*Action, error) {
	return s.dao.Cancel(ctx, id, actorState)
}

func (s *Service) Acknowledge(ctx context.Context, id string) (*Action, error) {
	return s.dao.Acknowledge(ctx, id, s.clock.Now())
}

// ResolveDue resolves a scope's due actions in ETA order — the fold any read
// touching that scope runs (#0005). Idempotent; safe under concurrent callers.
func (s *Service) ResolveDue(ctx context.Context, scope string) ([]Action, error) {
	ids, err := s.dao.DueIDs(ctx, "scope", scope, s.clock.Now())
	if err != nil {
		return nil, err
	}
	return s.resolveIDs(ctx, ids)
}

// ResolveActive resolves an actor's due running actions (its burn arriving) —
// what a fleet read triggers to settle motion state and release the slot.
func (s *Service) ResolveActive(ctx context.Context, actor string) ([]Action, error) {
	ids, err := s.dao.DueIDs(ctx, "actor", actor, s.clock.Now())
	if err != nil {
		return nil, err
	}
	return s.resolveIDs(ctx, ids)
}

// ResolveAllDue resolves every due action in ETA order — the sweep's job as an
// ordinary reader. Correctness never depends on it (all else passes disabled);
// it is the liveness floor for a galaxy nobody is watching (#0005 Decision #9).
func (s *Service) ResolveAllDue(ctx context.Context) ([]Action, error) {
	ids, err := s.dao.DueIDs(ctx, "", "", s.clock.Now())
	if err != nil {
		return nil, err
	}
	return s.resolveIDs(ctx, ids)
}

// resolveIDs resolves the given actions in order, dispatching to each type's
// resolver. A missing resolver or an already-resolved action is logged and
// skipped, never fatal — the fold must make progress on everything it can.
func (s *Service) resolveIDs(ctx context.Context, ids []string) ([]Action, error) {
	var resolved []Action
	for _, id := range ids {
		a, err := s.dao.Get(ctx, id)
		if err != nil {
			return resolved, err
		}
		if a == nil || a.Status != StatusRunning {
			continue // vanished or already resolved
		}
		reg, ok := s.resolvers[a.Type]
		if !ok {
			log.Error().Ctx(ctx).Str("actionId", id).Str("type", a.Type).
				Msg("No resolver registered for action type; skipping")
			continue
		}
		done, err := s.dao.ResolveOne(ctx, id, reg.fn)
		if err != nil {
			// One action's failure must not abort the whole sweep/fold.
			log.Error().Ctx(ctx).Err(err).Str("actionId", id).Msg("Failed to resolve action")
			continue
		}
		if done == nil {
			continue // no-op (already resolved in a race)
		}
		s.publishCompleted(ctx, *done)
		resolved = append(resolved, *done)
	}
	return resolved, nil
}

func (s *Service) publishCompleted(ctx context.Context, a Action) {
	if s.publisher == nil {
		return
	}
	env := common.NewEvent(ctx, common.ActionCompleted).
		WithSource("action-service").
		WithAttribute("channelId", a.Scope).
		WithTypedPayload(map[string]interface{}{
			"actionId": a.Id,
			"type":     a.Type,
			"actor":    a.Actor,
			"scope":    a.Scope,
			"outcome":  a.Outcome,
			"eta":      int64(a.Eta),
		}).Build()
	if err := s.publisher.PublishWithContext(ctx, common.TopicActionEvents, env); err != nil {
		log.Warn().Ctx(ctx).Err(err).Str("actionId", a.Id).Msg("Failed to publish ActionCompleted")
	}
}
