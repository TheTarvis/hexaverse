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

// Slot names the actor-doc field an action claims — its channel (#0006
// Decision #19). Movement (burn, lane travel) and sensor (scan) are separate
// single-slot channels on the same actor: a burning fleet can scan, but never
// run two actions on one channel. The zero value means SlotMovement, so every
// pre-channel action doc keeps resolving unchanged.
const (
	SlotMovement = "activeActionId"
	SlotSensor   = "activeScanId"
)

// SettledPageMax is the named ceiling on a single `status=done` inbox read
// (action-dispatch "Inbox by Actor Query Param" — "A settled-status read is
// bounded, and its bound keeps the newest"; link8b-impl-contract.md §1.4).
// An actor's settled actions accumulate for the life of the game and are
// never deleted, so this bound composes with `OrderBy("resolvedAt", Desc)`
// — never applied alone, since a bound over an unordered query returns an
// arbitrary subset rather than the newest one. 50 matches sightings.PageMax,
// this repo's only other named page ceiling.
const SettledPageMax = 50

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
	// verbs, a systemId for mutating verbs too (#0010 Decision #12 — Scope stays
	// the coarser, board/channel-aligned granularity; a verb that needs finer
	// per-target bookkeeping names a distinct LedgerKey instead of overloading
	// Scope onto it). Scope also doubles as the ledger key's default (see
	// LedgerKey below), and as such must never contain "/" — Firestore
	// document ids cannot hold it.
	Scope string `json:"scope" firestore:"scope"`
	// LedgerKey is the ledger a resolve folds and appends its Delta to,
	// decoupled from Scope (#0010 Decision #12/#13 — action-dispatch's "Ledger
	// Key Decoupled From Channel Scope"). Empty means "use Scope" (every verb
	// before mine; #0005's original scope-as-ledger behavior, unchanged). A
	// composite ledger key (e.g. mine's `systemId::featureId::kind`) must NEVER
	// contain "/" — Firestore document ids cannot hold it, and the ledger key
	// doubles as the delta collection's parent document id
	// (deltas/{ledgerKey}/entries/{actionId}).
	LedgerKey string                 `json:"ledgerKey,omitempty" firestore:"ledgerKey,omitempty"`
	Params    map[string]interface{} `json:"params" firestore:"params"`

	// Slot is the actor-doc field this action claimed at commit — its channel.
	// Empty means the movement slot (pre-channel docs keep resolving unchanged).
	Slot string `json:"slot,omitempty" firestore:"slot,omitempty"`

	CommittedAt common.WorldMillis `json:"committedAt" firestore:"committedAt"`
	// Eta is the world time the effect applies, frozen at commit. Resolution
	// compares against THIS stored value — never a recomputation from live tuning
	// params (#0005: freeze-at-commit).
	Eta    common.WorldMillis `json:"eta" firestore:"eta"`
	Status Status             `json:"status" firestore:"status"`

	// Outcome is what actually happened, recorded at resolve ("mined 40; belt ran
	// dry"). Empty until resolved.
	Outcome string `json:"outcome,omitempty" firestore:"outcome,omitempty"`
	// ReasonCode is an optional structured classifier a mutating resolver may set
	// alongside Outcome (e.g. mine's clean|lodeDry|holdFull — #0010 Decisions
	// #15/#19), so a caller can group/count resolutions by reason without parsing
	// Outcome prose. Empty for verbs that don't use it (kinematic resolves).
	//
	// SDET-INVENTED SURFACE (not in tasks.md's group-0 list): mine's spec
	// ("Resolve Clamps Yield to Reality") requires a structured reason code
	// distinct from Outcome's prose, and no existing action-dispatch field
	// carries it. Pinned here as the minimal compile-contract addition; flagged
	// upstream as a design.md gap (see the SDET handoff report).
	ReasonCode string             `json:"reasonCode,omitempty" firestore:"reasonCode,omitempty"`
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
	// LedgerKey names a ledger distinct from Scope for this commit's mutating
	// effect (#0010 Decisions #12/#13/#14). Empty defaults to Scope — every
	// existing verb (burn, lane travel) is unaffected.
	LedgerKey string
	Params    map[string]interface{}
	Eta       common.WorldMillis
	// Slot picks the actor channel to claim (SlotMovement | SlotSensor); empty
	// defaults to the movement slot.
	Slot string
	// ActorState is merged onto the actor doc in the same transaction that claims
	// the slot — so the fleet flips to burn and reserves its slot atomically.
	ActorState map[string]interface{}
	// ActorStateFunc, when non-nil, is invoked INSIDE Commit's own transaction,
	// after the actor document has already been read for the slot check, with
	// that same transactional read's field map (add-fuel-as-cargo, RULING 1;
	// design.md's "transaction-scoped ActorState producer" — "A transaction-
	// scoped ActorState producer computes its merge from the transactional
	// read, not a stale snapshot"). It returns the fields to merge onto the
	// actor doc, or a named error that aborts the commit ENTIRELY: no action
	// created, no slot claimed, no actor-state mutation persisted ("A
	// transaction-scoped producer's error aborts the commit entirely"). When
	// supplied, it is used IN PLACE OF the static ActorState map above.
	ActorStateFunc ActorStateFunc
}

// ActorStateFunc computes an actor-doc merge from that actor's own live,
// transactional field data — CommitSpec.ActorStateFunc's shape, and (since
// add-fuel-as-cargo) also the per-type producer a verb registers via
// RegisterCancelProducer for the generic action-cancel route
// (POST /v1/actions/:actionId/cancel) — the one discard path with no
// verb-package call site to compute its own effect from data already held
// in memory. Both directions share the same contract: the producer receives
// the actor's TRANSACTIONAL field data (never a value captured before the
// transaction opened) and can veto the whole operation by returning an
// error.
type ActorStateFunc func(actorData map[string]interface{}) (map[string]interface{}, error)

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
	// ReasonCode is the structured classifier mirrored onto Action.ReasonCode at
	// the same status flip (see Action.ReasonCode's doc comment — SDET-invented
	// surface for mine's clean|lodeDry|holdFull requirement).
	ReasonCode string
	// Delta, if non-nil, is appended to the ledger at
	// deltas/{ledgerKey}/entries/{actionId} — exactly-once by doc id (mutating
	// verbs whose effect is an additive number, e.g. mine tonnage). ledgerKey is
	// the action's LedgerKey, defaulting to Scope when unset (#0010 Decision
	// #12).
	Delta *Delta
	// ActorState, if non-nil, is merged onto the actor doc (the kinematic
	// transition, e.g. a fleet's settled coast/dock state).
	ActorState map[string]interface{}
	// Writes are arbitrary structured documents a resolver mints as its effect,
	// applied (MergeAll) in the same transaction as the status flip. This is the
	// path for verbs whose effect is state, not an additive number — scan minting
	// observations (#0006), later intel writes. action stays verb-agnostic: it
	// merges the maps at the given paths without knowing what they mean. Safe to
	// re-run only if the writes are idempotent (observations are: monotonic /
	// last-write-wins); additive effects must use Delta instead.
	Writes []DocWrite
}

// DocWrite is one structured document a resolver mints. Path is alternating
// collection/doc segments (even length ≥ 2, e.g.
// ["corporations", cid, "observations", sid]); Data is merged with MergeAll.
type DocWrite struct {
	Path []string
	Data map[string]interface{}
}

// ResolveFunc is a verb's per-type effect. It is registered by Type and invoked
// inside the resolve transaction. Pure w.r.t. Firestore writes: it reads via the
// Resolution surface and returns the effect to apply.
type ResolveFunc func(ctx context.Context, r Resolution) (ResolveResult, error)
