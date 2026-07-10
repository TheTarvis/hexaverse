---
number: 0005
title: Action & Timer System
status: accepted   # draft | accepted | implemented | superseded
created: 2026-07-09
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0005 — Action & Timer System

> The **async spine every verb rides**: one generic `action` entity with a
> deterministic commit-time ETA, resolved **lazily by any read** (kinematic
> state computed from `worldTime`; mutating state folded from an event-sourced
> ledger), plus a **~15-min Cloud Scheduler sweep** — an ordinary reader on a
> clock — so anything outstanding resolves even with nobody watching.
> Real-time actions that complete while you're offline, at zero per-action
> standing cost.

## Problem / motivation

`../vision.md`'s core loop step 4 is the game's cadence promise: actions take
real minutes–hours and **complete while you're away** — check in, collect
finished actions, queue the next, leave. Every verb rides this: the burn
(#0004), lane travel, scan, mine, research, build. Yet the machinery that makes
"arrives in 42 minutes" *true* — with no player online and no server process
running — has no spec. #0004 was **accepted on top of the assumption** ("a
committed move with a deterministic ETA that resolves while offline"), and the
fog/movement plan docs lean on it the same way. Building any verb before fixing
this spine risks each verb inventing its own resolution semantics.

The tempting implementation is the trap: a scheduler that "fires at ETA and
writes the new state." That drags deterministic movement down to mining's cost
(per-tick writes, no client-side animation), and the natural GCP primitive
(Cloud Tasks) doesn't exist in this stack — no Terraform, no Go dependency, and
**no official emulator**, so the one component whose job is "the world advances
with nobody watching" would be untestable locally.

The design is worked out and locked in `../plans/action-timer.md` (2026-07-09);
this spec is its buildable distillation.

## Goals

- **One generic `action` entity** — lifecycle (`running → done | cancelled`),
  commit-time ETA, cancel, and inbox shared by every verb; per-type behavior
  confined to `params` and a resolve dispatch.
- **ETA is deterministic and computed at commit** (inherited from #0004): the
  server stores `{eta, params}` in one transaction and the answer never changes.
- **State is computed, never advanced.** Kinematic state is a pure function of
  `(action, worldTime)`; mutating state is a **fold over an append-only ledger**
  of deltas. Nothing ticks; an unobserved galaxy costs nothing and is wrong
  about nothing.
- **Resolution is a deterministic fold any read can run** — same result at 3:01
  or five days later, triggered by the owner, a rival, or the sweep. Duplicates
  cannot double-apply (create-once deltas).
- **ETA-ordered fairness**: when several due actions share a scope, they resolve
  in ETA order — "first-writer-wins" means first *by ETA*, not by whichever read
  landed first.
- **A ~15-min Scheduler sweep as liveness floor**: anything outstanding (due
  actions) resolves within ~15 min even with zero readers. The sweep is an
  **ordinary reader** — correctness never depends on it.
- **One `worldTime`**: a single scaled, injectable clock every service reads;
  all stored timestamps in worldTime units; clients animate from a
  server-supplied offset, never raw `Date.now()`.
- **Single active action per actor** (slice), claimed transactionally at commit.
- **Completion fan-out is invalidation, not truth**: Pub/Sub envelope → SSE →
  watchers refetch; missed events self-heal via the client refetch rules.

## Non-goals

- **What any verb *does*** — burn math (#0004), reveal semantics
  (`scan-and-fog`), depletion curves and freshness (`../plans/market.md`). This
  spec is the ledger and the clock; verbs are the entries.
- **Per-action timers (Cloud Tasks)** — rejected: infra lift, no emulator,
  precision nobody needs at minutes–hours durations.
- **Action queues / chaining** (multi-leg, arrive-then-act) — deferred; the
  single-slot field is shaped to allow it later.
- **Cycle-quantized (flow) mining** — the slice mines point-at-ETA; the
  window-capable delta schema is the no-migration hedge. Continuous flow is
  rejected-leaning (inventory would become a fold).
- **Ledger compaction / checkpoints, TTL of done actions** — later housekeeping;
  the fix (periodic checkpoint doc) is known.
- **Completion notifications (email, push)** — cut from the slice entirely
  (2026-07-09): the inbox + refetch rules cover the check-in loop without any
  outbound channel. When notifications land post-slice, **email via Resend
  ships first** (account/keys already provisioned) and rides the sweep's
  done-but-unnotified query; push is a later channel.
- **Cancellation refund curves** — cancel is all-or-nothing while burns are free.
- **Bots / non-read-triggered cascades** — future readers; the sweep pattern
  generalizes when they land.

## Proposed approach

**The organizing principle: the server never keeps up with state; it answers
questions.** Three materials:

1. **Kinematic state** (move, coast, lane-travel) is a pure function of
   `worldTime` — nothing to advance; `now ≥ eta` *is* the arrival.
2. **Mutating state** (mine, build, first-arrival board-gen) is an append-only
   ledger: a lode stores **deltas** (`effectAt`, amount), and `remaining(T)` =
   initial − fold of deltas with `effectAt ≤ T`. State-at-any-T is a query —
   which is exactly what a late-resolving scan needs to mint a *correct*
   `asOf: eta` snapshot.
3. **Resolution** is "resolve this scope's due actions, in ETA order" — a
   deterministic fold runnable at any time, by anyone.

The lifecycle: **COMMIT** (server validates, computes ETA, stores the action +
claims the actor's single active slot in one transaction — nothing is
scheduled); **BETWEEN** (nothing runs server-side; the owner's client animates
from `(action, worldTime)` and self-schedules a refetch at ETA); **AT eta**
(nothing fires — completion is a fact, not an event); **ON READ** (any read
touching a scope resolves its due actions inline: kinematic → materialize the
transition reads already treat as true, e.g. the #0004 `burn → coast` flip on
the fleet; mutating → append the delta, create-once → publish completion
envelope → SSE → watchers refetch).

**Two things pure-lazy cannot do** — offline notifications and
non-read-triggered cascades — are why the design pairs the lazy core with a
**~15-min Cloud Scheduler sweep**: one more reader that happens to run on a
clock. It resolves whatever is due exactly as any read would and logs
stuck/overdue actions. (Notification delivery — the sweep's second job — is
deferred with the notification channel; the `notifiedAt` hook stays reserved.)
If the sweep is down for a week nothing is wrong, only late-resolved — tests
and the local stack never need it.

**Consistency for contested resources is optimistic** — no reservations, no
locks held across hours; effects apply in ETA order at resolve, and "you
arrived to a picked-clean belt" is on-theme for a dangerous frontier
(`../vision.md`: safety comes from strength, not guarantees).

## Design details

- **Where it lands:** a top-level **`backend/action/` domain**
  (handler→service→DAO per `backend/CLAUDE.md`; `/new-domain action` as the
  starting shape). Verb services (fleet, scan, mine) **commit actions through
  the action service** — the generic lifecycle lives in one place; the verbs
  supply `type`, `params`, and the ETA formula. The resolve dispatch calls back
  into the owning verb service per `type` (cross-domain via services, never
  DAOs).
- **Data model (Firestore):**

  ```
  actions/{actionId}
    type          : 'burn' | 'lane-travel' | 'scan' | 'mine' | ...  # dispatch key
    actor         : fleetId — the doer (#0004: the fleet is the actor)
    scope         : systemId / featureId — the resolve-ordering + due-query key
    params        : { ...type-specific, frozen at commit }
    committedAt   : worldTime at commit
    eta           : worldTime the effect applies (frozen at commit)
    status        : 'running' | 'done' | 'cancelled'
    outcome?      : what actually happened ("mined 40; belt ran dry")
    acknowledgedAt? : the check-in inbox — done-but-unacknowledged query
    notifiedAt?   : reserved — done-but-unnotified query key for the
                    deferred notification channel

  fleets/{fleetId}
    activeActionId : single-slot guard — claimed transactionally at COMMIT,
                     released at resolve/cancel

  features/{featureId}/deltas/{actionId}   # the mutating ledger
    effectAt : worldTime the effect applies (= the action's eta)
    amount   : what it took / did
    window?  : { from, to, rate }   # window-capable hedge for cycle mining
    actorId  : who
  ```

  Composite index on `(scope, status, eta)` for the due-actions query
  (`infra/terraform/firestore-indexes.tf`). Deltas are subcollection docs, not
  an array (1 MB doc limit).
- **`kind` (kinematic | mutating) lives in code**, a static property of `type`
  — a type is inherently one or the other; don't let data drift. Kinematic
  verbs with a mutating *epilogue* (lane-travel whose arrival triggers #0003
  first-visit board-gen) are handled by the per-type dispatch.
- **Fleet owns motion state; the action references the fleet** (#0004's
  `coast | burn | docked` machine stays on the fleet document). The burn action
  is a thin lifecycle wrapper (ETA, status, inbox) around the order in
  `fleet.state` — never a second copy. Position reads never query the actions
  collection.
- **Exactly-once:** the mutating delta's **document ID is the actionId** —
  created in the **same transaction** as the `running → done` flip. A duplicate
  resolve fails the create (or reads `done`) and no-ops. Concurrent lazy
  resolvers race the transaction; one wins, the rest no-op; Firestore retries
  handle it. First-arrival board-gen (#0003's race guard) is the same
  create-if-absent shape — this spec owns the *trigger*, #0003 the *content*.
- **worldTime module** (`backend/common`, injectable clock interface — never
  bare `time.Now()` in domain code): `worldTime() = worldEpoch +
  (wallNow − worldEpoch) × scale`. `scale` is a per-environment constant
  (prod = 1; dev/test fast, e.g. 60×). **Never change `scale` while a world
  holds data** — dev worlds are disposable instead. All stored stamps are
  worldTime units. An action's kinematic function may read only **stored action
  fields + worldTime** — never live tuning params (freeze-at-commit; tuning
  changes affect only newly committed actions, which is also the deploy story).
- **API (sketch):**
  - Verb endpoints commit (e.g. #0004's `POST /v1/fleets/{id}/orders` calls
    `action.Commit` in its transaction). A generic
    `GET /v1/actions?actor=…&status=…` serves the inbox;
    `POST /v1/actions/{id}/acknowledge` collects it;
    `POST /v1/actions/{id}/cancel` flips status + releases the slot (nothing
    external to delete — there is no task).
  - **Every read returns `worldTime`**; the frontend computes a server-time
    offset (`frontend` service layer) and animates from it.
  - **The raw action never leaves the server except to its owner.** Observers
    get a server-computed, fog-filtered position snapshot (quantized hex,
    heading at most) — a committed action contains destination, path, and
    arrival time, which #0004 deliberately hides for burning fleets. Watchers
    poll gently (~30–60 s) while a board is open.
- **Resolve-on-read:** reads that touch a scope call
  `action.ResolveDue(scope)` — a sorted `(scope, status:running, eta ≤ now)`
  query processed in ETA order. Publishes a completion envelope per resolved
  action (constants in `backend/common/pubsub.go`, e.g. `ActionCompleted`) →
  push subscription → SSE channels (`backend/sse/`).
- **The sweep:** Cloud Scheduler (~15 min; pattern in
  `infra/terraform/scheduler.tf`, Flywheel precedent) hits an OIDC-verified
  endpoint (`/v1/push/action-sweep` shape) that (1) resolves **all** due
  actions as an ordinary reader, (2) logs stuck/overdue actions as an ops
  sanity check. When the notification channel lands (post-slice, Resend), the
  sweep gains its messenger job: deliver done-but-unnotified completions,
  stamp `notifiedAt`.
- **Client refetch rules** (part of the design, not polish — Pub/Sub push
  delivers to one Cloud Run instance while SSE clients may hang off another,
  and the 900 s request timeout drops every stream at 15 min):
  1. refetch on every SSE (re)connect;
  2. self-schedule a refetch at each of your own actions' ETAs;
  3. poll gently while watching shared space.

## Acceptance criteria

- [ ] Committing an action stores `{type, actor, scope, params, committedAt,
      eta, status}` and claims `fleet.activeActionId` in **one transaction**; a
      second commit while one is running is rejected; cancel releases the slot.
- [ ] ETA is computed at commit and resolution compares against the **stored**
      eta — never recomputed from live tuning params.
- [ ] Any read touching a scope resolves that scope's due actions **in ETA
      order**: two actions due on one feature apply oldest-ETA-first regardless
      of which reader triggers resolution (emulator test: scan at T1 + mine at
      T2 resolved together at T3 yield the same ledger as if resolved on time).
- [ ] **Duplicate resolution no-ops**: the delta's doc ID is the actionId,
      created in the same transaction as the status flip; concurrent resolvers
      (emulator test) produce exactly one delta.
- [ ] **Kinematic resolve** materializes the #0004 fleet transition
      (`burn → coast`) that reads already compute; **mutating resolve** appends
      the delta; a **scan resolved hours late** still mints a correct
      `asOf: eta` snapshot (fold deltas ≤ eta, evaluate kinematics at eta).
- [ ] `remaining(T)` is a fold over deltas with `effectAt ≤ T`; no materialized
      `remaining` field exists.
- [ ] **worldTime**: one scaled, injectable clock in `backend/common`; no bare
      `time.Now()` in domain code; all stored stamps in worldTime units; every
      read returns `worldTime`; the client animates from the server offset.
      Tests inject the clock; e2e runs on a fast `scale`.
- [ ] **The sweep**: a Scheduler-triggered, OIDC-verified endpoint resolves all
      due actions and logs stuck/overdue actions. **All other acceptance
      criteria pass with the sweep disabled** — it is a liveness floor, never
      the correctness mechanism.
- [ ] Completion publishes a Pub/Sub envelope (constant in
      `backend/common/pubsub.go`) fanned out via SSE; the frontend implements
      the three refetch rules (reconnect, own-ETA self-schedule, gentle poll).
- [ ] The **inbox**: done-but-unacknowledged actions are queryable and
      acknowledgeable — "check in → collect finished actions" needs no timer.
- [ ] **Slice bar:** commit an action, log off, come back — it's done; and the
      world moved even if you didn't (resolved by whoever read first, or by the
      sweep within ~15 min).

## Decisions (imported from `../plans/action-timer.md`, 2026-07-09)

1. **Pure-lazy resolution core** — computed kinematics + event-sourced ledger +
   ETA-ordered fold-on-read. No Cloud Tasks, no per-action timers, no reaper.
2. **One `action` entity, two resolution strategies** — shared lifecycle/ETA/
   cancel; completion dispatch by type (kinematic materializes, mutating
   appends).
3. **Optimistic mutation consistency via the ledger** — no reservations; ETA
   order arbitrates; cancel is trivially clean.
4. **Slice mines point-at-ETA**; leaning destination is cycle-quantized flow —
   the window-capable delta shape is the no-migration hedge.
5. **`kind` lives in code**, not data.
6. **Fleet owns motion state** (#0004); actions are lifecycle/inbox history —
   position reads never touch the actions collection.
7. **worldTime contract** — one scaled function, per-env constant `scale`,
   worldTime-unit stamps, server-supplied offset, injectable clock,
   freeze-at-commit.
8. **Observer projection** — raw actions are owner-only; observers get computed
   fog-filtered snapshots; watchers poll.
9. **The ~15-min Scheduler sweep ships in the slice** (revised 2026-07-09 from
   post-slice): resolves anything outstanding as an ordinary reader.
   Correctness never depends on it; scale-to-zero becomes *nearly* pure (one
   cheap query per 15 min) — a deliberate, bounded trade. (Its messenger job
   moved out of the slice with notifications — see #11.)
10. **SSE is invalidation, not truth** — forced by the platform (single-instance
    push delivery, 900 s stream drops); the three client refetch rules make
    missed events self-healing.

Resolved at acceptance (2026-07-09):

11. **Notifications are out of the slice** — no outbound channel ships; the
    inbox + the three refetch rules carry the check-in loop. When the channel
    lands post-slice, it's **email via Resend** (account/keys already
    provisioned) riding the sweep's done-but-unnotified query; `notifiedAt`
    stays reserved in the schema.
12. **Single-slot confirmed; the queue is deferred, not rejected** — chaining
    (arrive-then-act, multi-leg) is definitely coming but not in this slice;
    `activeActionId` is the shape that admits a queue later without migration.

## Open questions

- **Contact events** — is "a fleet entered my sensor range" a resolved action
  event or a read-time computation? Ties to `../plans/fog-of-war.md`'s live
  union; owned by the `scan-and-fog` spec.
- **Cycle length** for quantized mining — tuning-time, with the mine verb
  (explicitly deferred).
- **Compaction threshold** for long ledgers — deferred; fix known (checkpoint
  doc + deltas since).

## References

- `../plans/action-timer.md` — the full design rationale (organizing principle,
  the kinematic/mutating table, platform-primitive analysis, worldTime
  contract).
- Related specs: **#0004** (accepted assuming this spine; fleet-owns-state is
  the shared invariant), **#0003** (first-arrival board-gen rides the same
  create-once trigger), **#0001/#0002** (graph tier).
- `../plans/fog-of-war.md` (scan mints an observation at eta),
  `../plans/movement-galaxy.md` + `../plans/movement-board.md` (the two movers),
  `../plans/hex-board.md` (positions = `f(elements, worldTime)`),
  `../plans/market.md` (freshness consumes these timestamps).
- `../vision.md` — core loop step 4; slice step 6 ("see it persist").
- `../../CLAUDE.md` §Architecture — Pub/Sub envelopes, SSE channels, OIDC push.
- `infra/terraform/scheduler.tf` — the Scheduler pattern the sweep reuses.
