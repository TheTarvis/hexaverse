package action

import (
	"context"

	"hexaverse/common"
)

// Status is an action's lifecycle position. An action is born running, then
// resolves exactly once to done (its effect applied) or cancelled (slot released
// with no effect). There is no "pending"/"scheduled" — nothing is ever queued to
// fire; the effect is a fact computed from worldTime, not an event (#0005).
type Status string

const (
	StatusRunning   Status = "running"
	StatusDone      Status = "done"
	StatusCancelled Status = "cancelled"
)

// Kind is a static property of an action's type (it lives in code, never data —
// #0005 Decision #5). Kinematic actions (burn, lane-travel) settle a computed
// state on their actor; mutating actions (mine, scan) append a ledger delta.
type Kind string

const (
	// KindKinematic settles a computed state transition on the actor doc at
	// resolve (e.g. a fleet's burn → coast/dock). Idempotent; no ledger entry.
	KindKinematic Kind = "kinematic"
	// KindMutating appends an exactly-once delta to the scope's ledger at resolve
	// (e.g. mine tonnage). The delta's doc id is the actionId.
	KindMutating Kind = "mutating"
)

// Action is the generic async entity every verb rides (#0005). The lifecycle,
// commit-time ETA, cancel, and inbox are shared here; per-type behaviour is
// confined to Params (frozen at commit) and the resolver registered for Type.
//
// The raw action is owner-only — observers get a computed, fog-filtered snapshot
// (#0005 Decision #8), enforced by callers at M6. Position reads never touch this
// collection; the fleet owns motion state (Decision #6).
type Action struct {
	Id   string `json:"id" firestore:"id"`
	Type string `json:"type" firestore:"type"` // dispatch key: "burn" | "mine" | ...
	Kind Kind   `json:"kind" firestore:"kind"` // derived from Type at commit, stored for reads
	// Actor is the doer (a fleetId in the slice). ActorCollection is where its
	// doc lives, so resolve/cancel can claim & release the single-action slot
	// generically without importing the verb's package.
	Actor           string `json:"actor" firestore:"actor"`
	ActorCollection string `json:"actorCollection" firestore:"actorCollection"`
	// Scope is the resolve-ordering + due-query key: a systemId for kinematic
	// verbs, a featureId (the lode) for mutating verbs.
	Scope  string                 `json:"scope" firestore:"scope"`
	Params map[string]interface{} `json:"params" firestore:"params"`

	CommittedAt common.WorldMillis `json:"committedAt" firestore:"committedAt"`
	// Eta is the world time the effect applies, frozen at commit. Resolution
	// compares against THIS stored value — never a recomputation from live tuning
	// params (#0005: freeze-at-commit).
	Eta    common.WorldMillis `json:"eta" firestore:"eta"`
	Status Status             `json:"status" firestore:"status"`

	// Outcome is what actually happened, recorded at resolve ("mined 40; belt ran
	// dry"). Empty until resolved.
	Outcome    string             `json:"outcome,omitempty" firestore:"outcome,omitempty"`
	ResolvedAt common.WorldMillis `json:"resolvedAt,omitempty" firestore:"resolvedAt,omitempty"`

	// AcknowledgedAt powers the check-in inbox (done-but-unacknowledged query).
	AcknowledgedAt common.WorldMillis `json:"acknowledgedAt,omitempty" firestore:"acknowledgedAt,omitempty"`
	// NotifiedAt is reserved for the deferred notification channel (Resend email,
	// post-slice). It stays in the schema so the sweep's messenger job needs no
	// migration (#0005 Decision #11).
	NotifiedAt common.WorldMillis `json:"notifiedAt,omitempty" firestore:"notifiedAt,omitempty"`
}

// Delta is one entry in a scope's append-only mutating ledger, stored at
// deltas/{scope}/entries/{actionId}. remaining(T) = initial − fold of deltas
// with effectAt ≤ T; there is no materialized remaining field (#0005). The doc
// id is the actionId, so a duplicate resolve fails the create and no-ops.
type Delta struct {
	ActorId  string             `json:"actorId" firestore:"actorId"`
	EffectAt common.WorldMillis `json:"effectAt" firestore:"effectAt"` // = the action's eta
	Amount   float64            `json:"amount" firestore:"amount"`
	// Window is the window-capable hedge for cycle-quantized (flow) mining — a
	// no-migration path if point-at-ETA mining ever becomes continuous (#0005
	// Non-goals). Nil for the point-at-ETA slice.
	Window *Window `json:"window,omitempty" firestore:"window,omitempty"`
}

// Window describes a rate applied over an interval (deferred flow mining).
type Window struct {
	From common.WorldMillis `json:"from" firestore:"from"`
	To   common.WorldMillis `json:"to" firestore:"to"`
	Rate float64            `json:"rate" firestore:"rate"`
}

// CommitSpec is what a verb service hands action.Commit. The verb supplies the
// type, scope, ETA formula result, frozen params, and any actor-doc fields to
// write atomically with the single-action-slot claim (e.g. a fleet's burn state).
type CommitSpec struct {
	Type            string
	Actor           string
	ActorCollection string
	Scope           string
	Params          map[string]interface{}
	Eta             common.WorldMillis
	// ActorState is merged onto the actor doc in the same transaction that claims
	// the slot — so the fleet flips to burn and reserves its slot atomically.
	ActorState map[string]interface{}
}

// Resolution is the transactional surface a resolver receives. Reads are issued
// inside the resolve transaction; the resolver must not perform its own writes —
// it returns a ResolveResult that action applies atomically with the status flip.
type Resolution struct {
	Action Action
	// At is the effect time — the action's frozen Eta. Kinematics evaluate here;
	// deltas fold ≤ here. A scan resolved hours late still mints an asOf:eta
	// snapshot (#0005 acceptance).
	At common.WorldMillis
	// DecodeActor unmarshals the actor doc (already read in the txn) into a
	// verb-owned struct, so a kinematic resolver settles motion state without a
	// second read and without action importing the verb's types.
	DecodeActor func(target interface{}) error
	// Remaining folds this scope's ledger at time t (initial is the caller's to
	// subtract). Mine clamps against it; kinematic verbs ignore it.
	Remaining func(t common.WorldMillis) (float64, error)
}

// ResolveResult is what a resolver produces. action applies all of it in one
// transaction with the running→done flip and the slot release.
type ResolveResult struct {
	Outcome string
	// Delta, if non-nil, is appended to the ledger at deltas/{scope}/entries/
	// {actionId} — exactly-once by doc id (mutating verbs).
	Delta *Delta
	// ActorState, if non-nil, is merged onto the actor doc (the kinematic
	// transition, e.g. a fleet's settled coast/dock state).
	ActorState map[string]interface{}
}

// ResolveFunc is a verb's per-type effect. It is registered by Type and invoked
// inside the resolve transaction. Pure w.r.t. Firestore writes: it reads via the
// Resolution surface and returns the effect to apply.
type ResolveFunc func(ctx context.Context, r Resolution) (ResolveResult, error)
