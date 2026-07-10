# Action / Timer System — the async spine

> **Living doc, high-level only.** Scratchpad for **how real-time actions are
> committed, resolved, and made to complete while you're offline** — the async
> spine that *every* verb (scan, mine, board-burn, lane-travel, research, build)
> rides on. Nothing here is committed design. `?` = open question;
> **DECIDED** = locked; **INHERITED** = already fixed by an upstream spec, not
> re-litigated here. **Graduated 2026-07-09 → `../specs/0005-action-timer.md`
> (accepted)** — the spec is the buildable contract; this doc stays as rationale.
> Created 2026-07-09; **revised 2026-07-09 after a design-review pass** — the
> revision flipped the spine from "Cloud Tasks timer + lazy reconcile" to
> **pure lazy**: no timers at all, mutating state as an **event-sourced
> ledger**, and resolution as a **deterministic fold any read can run**.
> **Second revision, same day:** the ~15-min Scheduler sweep moved from
> post-slice into **the slice** — still just a reader (correctness never
> depends on it), but anything outstanding now resolves on a heartbeat and
> notifications ship with the slice.
>
> **Why this doc exists.** It's the one slice-critical foundation with no plan and
> no spec, yet #0004 (accepted) and both movement docs were written *on top of*
> it — they assume "a committed move with a deterministic ETA that resolves while
> offline." This doc makes that assumption real *before* the verb specs that lean
> on it (`scan-and-fog`, `movement-galaxy`, the hex-board renderer, mine) calcify
> around a guess.
>
> Context: `../vision.md` (§Core loop step 4 — "actions take real minutes–hours and
> complete while you're away"), `../specs/0004-movement-board.md` (§Time model —
> the async-action promise), `movement-galaxy.md` + `movement-board.md` (the two
> movers that ride this), `hex-board.md` (§Orbital motion — positions computed from
> `(elements, worldTime)`), `fog-of-war.md` (scan mints an observation on
> completion), `market.md` (freshness/decay consume the timestamps this stamps),
> `../../CLAUDE.md` (§Architecture — Pub/Sub envelopes, SSE channels; the Volt
> primitives this is built from).

---

## Boundary — what this doc owns (read first)

This owns the **generic machinery of a timed action**: its lifecycle, how its ETA
is computed and stored, what makes it complete, how completion is made to happen
even with nobody watching, and how completion is fanned out. It does **not** own
what any specific verb *does* — the burn math lives in #0004, the reveal in
`scan-and-fog`, the depletion curve in `market.md`. Think of it as the **ledger and
the clock**; the verbs are the **entries**.

| Owns | Defers to |
|---|---|
| the `action` entity + its lifecycle/state machine | what each action *type* means (verb specs) |
| ETA computation contract (deterministic-at-commit) | the *formula* per verb (lane cost #0001/movement-galaxy; intercept #0004) |
| the offline-completion guarantee (resolution is a fold any read can run) | the effect a completion applies (deplete lode, mint intel, gen board) |
| worldTime authority + exactly-once resolution | how a snapshot *ages* after it's minted (`market.md`) |
| Pub/Sub → SSE fan-out of completion events | the SSE channel taxonomy (Volt baseline) |

---

## Inherited from upstream — don't re-litigate

The verb docs already fixed the shape of this system by assuming it. Recorded here
so the spec holds the line:

- **INHERITED (#0004, movement docs): ETA is deterministic and computed at
  *commit*.** "At commit time the game computes the intercept + exact ETA" — the
  world tells you "arrives in 42 min," it's truth not estimate. This is what makes
  the whole thing *not* a tick simulation.
- **INHERITED (movement-board.md): "arrival computed, not scheduled."** State is a
  function of time, not the output of a job that ran. This is the single most
  load-bearing inherited call — see *The organizing principle* below, which
  generalizes it to the whole system.
- **INHERITED (hex-board.md): positions = `f(orbitalElements, worldTime)`.** There
  is a canonical world clock everything deterministic reads from.
- **INHERITED (vision.md): actions resolve while offline.** "Check in → collect
  finished actions → queue the next → leave." The world must advance without the
  owner present.
- **INHERITED (CLAUDE.md): realtime is Volt's SSE + Pub/Sub, server-authoritative,
  Cloud Run + Firestore.** No always-on game loop — Cloud Run scales to zero.

---

## The organizing principle — the server never keeps up with state; it answers questions

**DECIDED (2026-07-09).** The whole system reduces to three materials:

1. **Kinematic state is a pure function of `worldTime`** (inherited). Nothing to
   advance.
2. **Mutating state is an append-only ledger.** A lode doesn't store `remaining`;
   it stores **deltas** (`effectAt`, amount). `remaining(T)` = initial − fold of
   deltas with `effectAt ≤ T`. Also nothing to advance — computed at read, exactly
   like positions.
3. **Resolution is a deterministic fold, runnable at any time, by anyone.**
   "Resolve this scope's due actions, in ETA order" produces the same result
   whether it runs at 3:01 or five days later, triggered by the owner, a rival's
   read, or the 15-min sweep. Event-sourcing is what makes *late* resolution safe;
   ETA-ordering is what makes *outcomes* fair.

The consequence that kills the "always-on vs. lazy" dilemma: **unobserved state
doesn't need to be materialized.** If nobody reads it, it doesn't matter that no
job ran; the next read — from *anyone* — resolves it correctly. An empty galaxy
costs nothing and is wrong about nothing.

Exactly **two things pure-lazy cannot do**:

- **Offline notifications** ("your mine finished" push/email) — nothing reads, so
  nothing fires.
- **Non-read-triggered cascades** — bots reacting to events, market prices that
  must move for actors who never read.

That's why the slice pairs the lazy core with the **~15-min Scheduler sweep**
(§Platform primitives): a **messenger and liveness floor, not a resolver of
record** — just one more *reader* that happens to run on a clock, resolving
whatever is due exactly as any read would, then notifying. **Correctness never
depends on it** — down for a week, nothing is wrong, only late-notified. (AI
bots, when they land, are also readers — a populated world advances itself
organically.)

---

## The reframe — "action" is two beasts wearing one coat

The tempting model is "a scheduler fires at ETA and writes the new state." That is
**the trap**, and the inherited decisions already dodged it. The verbs split not by
UI but by **consistency requirement**:

| | **Kinematic** (move, coast, lane-travel, intercept) | **Mutating** (mine, build, first-arrival board-gen) |
|---|---|---|
| State is | a **pure function** of `(action, worldTime)` | a **fold over an append-only ledger** of deltas |
| Stored? | nothing beyond the committed action | the deltas (one per resolved effect); `remaining(T)` is computed |
| Writers | one (only you command your fleet) | many (any miner on the same belt) — but appends, not read-modify-write |
| On completion | **nothing runs** — `now ≥ eta` *is* the arrival | a delta **must be appended** (idempotent, create-once) |
| Client can predict it | **yes** — same function, same clock → animates locally, zero server chatter | no — must fetch the resolved result |
| Cost model | zero write-amplification, resolve is a no-op | one small append per completion; fold cost at read (compact later) |

**Scan is the in-between case, and the ledger tames it:** its *write* is private
and uncontended (mints intel into your own inventory) but its *payload* is a
**snapshot of shared world state at ETA**. With mutating state event-sourced,
"state at ETA" is computable at *any* later time — fold deltas `≤ eta`, evaluate
kinematic functions at `eta` — so a scan resolved hours late still mints a
**correct** `asOf: eta` snapshot. (Under the old materialized-value model this was
quietly broken: a late-resolving scan read post-depletion state and stamped it
with an earlier time.)

> **Why the trap is a trap:** build one scheduler that "fires at ETA and writes the
> new position" for *everything*, and you've dragged kinematics down to mining's
> cost — thrown away determinism, created per-tick writes, and made the client
> unable to animate. **Mining's need for persistence must not contaminate movement.**

**DECIDED: one `action` entity, two resolution strategies.** The lifecycle, ETA,
and cancel are *shared* (one `/new-domain action` package — this is literally "the
spine"). The **completion handler dispatches by type**: kinematic → **materialize
what reads already treat as true**; mutating → **append the delta**. Same API,
same collection, different resolve.

---

## The lifecycle — commit / between / at-eta / on-read

```
COMMIT      client POSTs an action → server validates, computes eta
            (deterministic: sum of lane costs / intercept math / scan duration),
            stores {type, actor, scope, params, committedAt, eta, status:running}
            in ONE transaction that also claims the actor's single active slot
            (fleet.activeActionId). Returns the action.
            Nothing is scheduled — there is nothing to schedule.

BETWEEN     nothing runs server-side. The owner's client animates from (action,
            worldTime) and SELF-SCHEDULES a refetch at eta (it knows the exact
            time). An observer's read gets a fog-filtered, server-computed
            position snapshot — never the raw action (see §Observers).

AT eta      nothing fires. `now ≥ eta` IS the completion, by definition.
            Everything readable from the action + the ledgers is already correct.

ON READ     any read that touches a scope resolves that scope's due actions
            inline, IN ETA ORDER:
              kinematic → materialize the transition reads already treat as
                          true (fleet burn→coast per #0004; status → done)
              mutating  → append the delta (doc id = actionId, create-once)
                          + status → done — deterministic no matter when it runs
            → publish Pub/Sub completion envelope → SSE → watchers refetch.
```

**The load-bearing invariant: resolution is deterministic-whenever-it-runs.** Any
reader can trigger it, duplicates can't double-apply (create-once deltas), and the
result doesn't depend on wall-clock timing. That's the entire offline-completion
guarantee — no belt, no suspenders, no scheduler.

**ETA-ordered scope resolution.** When a lazy resolve finds *several* due actions
on one scope (my scan at 3:00, your mine at 4:00, both resolving at 5:00), it
processes them in **ETA order**, so outcomes ("did the belt run dry before my
mine?") come out as if each had resolved on time. This is a cheap sorted query
now that due actions carry a `scope` — and it's what makes "first-writer-wins"
mean *first by ETA*, not *first by whoever's read happened to land first*.

A lovely consequence: **the server only ever speaks when spoken to.** Continuous
motion is rendered client-side from the deterministic function; completions are
resolved by reads; even the Pub/Sub → SSE push is just cache invalidation for
whoever's currently listening. Massively less realtime load than an RTS that
streams positions.

---

## Platform primitives — one dumb sweep, no per-action timers (the 2026-07-09 flips)

The first draft leaned on **Cloud Tasks** (per-action scheduled delivery) as "the
externalized game loop," with a Cloud Scheduler reaper as backstop. **DECIDED
(2026-07-09): cut both.** The lazy fold is the resolution mechanism; the one
clock that remains is the **~15-min sweep below — a reader, not a scheduler**.
Why per-action timers stayed dead:

- **The timer had no correctness job left.** "Your depletion is visible to the next
  player even if you never come back" is satisfied by lazy resolution — *their*
  read resolves *your* action. With the ledger + ETA-ordering, late resolution is
  exactly as correct as prompt resolution. The timer's only honest jobs are
  notifications and liveness — exactly what the in-slice sweep does, as an
  ordinary reader (§Organizing principle).
- **Cloud Tasks doesn't exist in this stack.** Zero references in `infra/` or
  `backend/`; adopting it means API enablement, a Terraform queue + SA + OIDC
  wiring, a new Go dependency — and **there is no official emulator**, so the local
  dev loop and the isolated e2e stack could never exercise it. The component whose
  job is "the world advances with nobody watching" would be untestable locally.
- **Scale-to-zero stays *nearly* pure.** No per-action machinery, no 1-minute
  reaper; the ~15-min sweep is the one standing tick — a single cheap
  due-actions query that no-ops on an idle world (few $/mo, Flywheel precedent).
  A deliberate, bounded trade against "the watcher pays": Travis wants
  outstanding work resolved on a heartbeat, not only when someone happens to
  read.

What remains platform-side:

| Need | Primitive | Why |
|---|---|---|
| **Fan out** a completion to watching clients | **Pub/Sub → SSE** (`sse/`) | the notify layer — invalidation only, never truth (§SSE's role) |
| **Resolve anything outstanding on a heartbeat + deliver notifications** *(in the slice)* | **Cloud Scheduler sweep, ~15 min** (pattern already in `infra/terraform/scheduler.tf`) | a **reader on a clock, not a resolver of record**: it resolves due actions with the same ETA-ordered fold any read runs, then notifies done-but-unnotified and marks `notifiedAt`. Correctness never depends on it |

**DECIDED (2026-07-09, revised later the same day): the ~15-min Cloud Scheduler
sweep ships *in the slice*.** The first pass deferred it ("flip it on when the
forgot-to-come-back pain shows up"); pulled forward because the sweep's job is
bigger than email — **anything outstanding resolves within ~15 min** (due
actions, unsent notifications) even with zero readers, and it doubles as an ops
sanity check (log stuck/overdue actions). The Flywheel precedent (its 15-min
pipeline check costs a few $/month) says the price is noise, and at minutes–hours
action durations, 15-min granularity is invisible. The line that must hold: **the
sweep stays an ordinary reader** — same ETA-ordered fold as any read, so tests
and the local stack never need it and correctness never waits on it. Per-action
Cloud Tasks stays rejected (infra lift, no emulator, precision nobody needs).
Channel: **email first** (no permission friction, fits the cadence, digest-
able), web-push later.

---

## worldTime & determinism — the contract

Everything kinematic rests on all nodes agreeing on time. **DECIDED (2026-07-09),
extending the original wall-clock lean into a full contract:**

- **One function, one module.** `worldTime() = worldEpoch + (wallNow − worldEpoch)
  × scale`. Every service reads time through this (injectable — a `common` clock
  interface, never bare `time.Now()` in domain code). Cloud Run instances are
  NTP-synced to ~ms; actions run minutes–hours; no logical clocks needed.
- **`scale` is a per-environment constant.** Prod = 1. Dev/test can run fast
  (e.g. 60×) so "does a 42-minute burn feel right?" is a 42-second playtest, and
  emulator/e2e tests can assert on completions. **Never change `scale` while a
  world holds data** — every stored stamp assumes it; dev worlds are disposable
  instead. (This resolves the old "can't fast-forward" worry: everything is
  `f(worldTime)`, so scaling time scales the whole world coherently.)
- **All stored timestamps are worldTime units** — `eta`, `committedAt`,
  `effectAt` on deltas, `asOf` on observations. No raw wall-clock scattered
  through the schema.
- **Clients take worldTime from the server.** Every read already returns
  `worldTime` (#0004); the frontend computes a server-time offset and animates
  from that — **never raw `Date.now()`** (consumer clocks are routinely minutes
  off; skew would desync every ETA countdown and arrival animation).
- **Stamp `eta` at commit and resolve against the *stored* eta**, never a
  recomputed one — "did this complete" is stable even as `now()` drifts.
- **Freeze-at-commit, generalized:** an action's kinematic function may read only
  **stored action fields + worldTime** — never live tuning params. (#0004 already
  freezes `path` + times; this is the general rule.) Otherwise a `burnSpeed`
  tuning change mid-flight teleports every in-flight ship. Corollary: tuning
  changes affect only *newly committed* actions — which is also the deploy/
  migration answer.
- **The world never pauses** (prod). `now()` keeps ticking through a deploy —
  orbits don't stop for maintenance. Fine: nothing *runs* between events, so
  there's nothing to pause. Dev fast-forwards via `scale`; tests inject the clock.

---

## Exactly-once & the idempotency boundary

Pub/Sub is **at-least-once**, lazy resolution can race concurrent readers, and
the 15-min sweep will re-see actions — resolves *will* be attempted more
than once. The ledger makes idempotency structural rather than careful:

- **The delta's document ID *is* the actionId** — `create`-once, in the same
  transaction as the `running → done` flip. A duplicate resolve fails the create
  (or reads `status: done`) and no-ops. There is no "effect applied but status
  still running" partial state to worry about, because the effect *is* one
  document creation.
- **Concurrent lazy resolvers** (two players read the same due scope
  simultaneously) race the same transaction; one wins, the rest no-op. Firestore
  retries handle it.
- **First-arrival board-gen (#0003's race guard)** is the same shape: two fleets
  arrive "together" → create-if-absent in a transaction, first writes canon, both
  then fog it per-player. This system owns the *trigger* (the arrival resolution —
  in practice the arriving player's first board read); #0003 owns the *content*.
- Kinematic resolve materializes a transition reads already compute
  (`burn && now ≥ arriveTime` ⇒ coast), so a duplicate is trivially harmless.

---

## Mutation consistency — the ledger (DECIDED 2026-07-09)

The moment two miners (or one miner + depletion) touch the same belt, the question
is: **when does the effect claim the resource — at commit or at ETA?** The
original optimistic-vs-pessimistic analysis stands as rationale:

| | **Optimistic** (resolve at ETA, first-by-ETA-wins) | **Pessimistic** (reserve at commit) |
|---|---|---|
| At commit | belt still reads full to everyone | belt depletes/escrows immediately |
| At ETA | effects apply in ETA order; loser reads `remaining: 0` → "you arrived to a picked-clean belt" | ETA is a guaranteed promise |
| Locks | none | held across *hours* of real time |
| World honesty | belt reads true until worked | belt "reads empty" while a fleet is hours away |
| Cancel | trivial (nothing reserved) | must un-reserve |
| Feel | the frontier promises you nothing | no disappointment |

**DECIDED: optimistic, implemented as an event-sourced ledger.** No reservations,
no long-held locks, "someone beat you to it" is on-theme for a dangerous chill
game (`vision.md` — safety comes from strength, not guarantees). Concretely:

```
features/{featureId}/deltas/{actionId}     # the ledger — one doc per resolved effect
  effectAt : worldTime the effect applies (= the action's eta)
  amount   : what it took / did
  window?  : { from, to, rate }            # window-capable shape — see point-vs-flow
  actorId  : who
```

- `remaining(T)` = initial − fold of deltas with `effectAt ≤ T`. **State-at-any-T
  is a query**, which is exactly what scan snapshots (`asOf` correctness) and the
  market ("how far has it drawn down since your snapshot?") both need — the
  freshness engine gets its history for free.
- Deltas are subcollection docs, not an array (Firestore 1 MB doc limit).
- `?` **Compaction** — a long-worked belt accumulates deltas; the first read after
  months pays the whole fold. Standard fix (periodic checkpoint doc + deltas
  since) when it ever matters. Not slice.

**DECIDED (2026-07-09): the slice mines point-at-ETA.** The haul posts at
completion, cancel is all-or-nothing, one delta per mine. Solo, uninterrupted,
uncancelled — i.e. the entire slice — point and flow are indistinguishable to the
player, and point keeps **inventory a plain number** (continuous flow would make
cargo itself a fold of time, which ripples into everything the market later reads).

**Leaning destination (post-slice, when concurrent mining exists): quantized flow
— mining in *cycles*.** A long mine resolves as a chain of small point-deltas
(one per cycle), so cancel keeps completed cycles, mid-action check-ins show the
pile growing in steps, concurrent miners interleave at cycle granularity, and
scans mid-window read partial depletion — ~90% of continuous flow's fairness and
feel while every delta stays a discrete point and inventory stays boring. This is
"**quantize the sim, interpolate the picture**" (`hex-board.md`) applied to the
economy. Continuous flow is the rejected-leaning corner. **The hedge is already in
the schema:** the delta shape is window-capable, so point → cycles is additive,
no migration. `?` cycle length as a tuning param — the granularity of fairness
*and* feel; wants to be well under typical check-in gaps. Decide at tuning time.

---

## The `action` entity — data model sketch

One Firestore collection, server-authoritative (per `backend/CLAUDE.md` layering).
The spine is *generic*; `params` and the resolve strategy are per-type.

```
actions/{actionId}
  type          : 'burn' | 'lane-travel' | 'scan' | 'mine' | ...  # dispatch key
  actor         : fleetId (the mover/doer; movement docs — the fleet is the actor)
  scope         : what it touches (systemId / featureId) — the resolve-ordering
                  and due-query key
  params        : { ...type-specific: destination hex, target body, lane path... }
  committedAt   : worldTime at commit
  eta           : worldTime the effect applies (frozen at commit)
  status        : 'running' | 'done' | 'cancelled'
  outcome?      : what actually happened, set at resolve ("mined 40; belt ran
                  dry") — needed the moment optimistic effects can partially fail
  acknowledgedAt? : the check-in inbox — "collect finished actions" (vision step
                  4) = query done-but-unacknowledged; needs no timer at all
  notifiedAt?   : stamped by the sweep once the completion notification is
                  sent — the sweep's done-but-unnotified query key

fleets/{fleetId}
  activeActionId : the single-slot guard — claimed transactionally at COMMIT,
                   released at resolve/cancel (else a double-POST creates twins)

features/{featureId}/deltas/{actionId}     # the mutating ledger (§above)
```

Needs a composite index on `(scope, status, eta)` for the due-actions query
(`infra/terraform/firestore-indexes.tf`).

- **DECIDED (2026-07-09): `kind` (kinematic|mutating) lives in code**, a static
  property of `type` — a type is inherently one or the other; don't let data
  drift. (Some verbs are kinematic with a mutating *epilogue* — lane-travel whose
  arrival is a first-visit board-gen — the dispatch handles that per-type.)
- **DECIDED (2026-07-09): the fleet owns its movement state; the action
  *references* the fleet.** This resolves the collision with #0004 (accepted),
  which puts the `coast | burn | docked` state machine **on the fleet document**.
  The burn action is a *thin lifecycle wrapper* (ETA, status, inbox) around the
  order recorded in `fleet.state` — not a second copy of it. Position reads never
  query the actions collection; "kinematic resolve" = materialize the
  `burn → coast` flip on the fleet that reads already treat as true. *(Record a
  one-line cross-ref in #0004 when this graduates, so the two can't drift.)*
- Done actions are history/inbox, not motion state. `?` TTL/archival of old done
  actions — a later housekeeping policy (Firestore TTL), not slice.

---

## Observers — the projection boundary (plugs an intel leak)

The first draft said an observer "computes your fleet position live from your
committed action." **As written, that leaks** — a committed action contains your
**destination, path, and arrival time**, and #0004 (Decisions #6/#19) deliberately
sends burning fleets as *snapshots* precisely so a burn is volatile to observers.

**DECIDED (2026-07-09): the raw action never leaves the server except to its
owner.** Per-audience projection:

- **Owner** → the full action (params, ETA, path) — it's their order; their client
  animates it and self-schedules the arrival refetch.
- **Observer** → a **server-computed, fog-filtered position snapshot** (quantized
  hex, heading at most). The server evaluates the kinematic function on demand;
  what ships is a position, not a plan.

And the follow-on ("who produces periodic snapshots for a watcher?") has a
no-timer answer: **the watcher polls.** A client with a board open re-reads the
fog-filtered projection at a gentle cadence (~30–60s); cost is proportional to
attention and drops to zero with the last closed tab. The server still never
volunteers state — it answers questions. (Slice: single player, moot; but the
spec language should be right from day one.)

---

## Queueing, chaining & cancellation

- **Queue depth.** `movement-galaxy.md` already says "one fleet at a time for the
  slice." **Leaning: one active action per actor for the slice** — enforced by the
  transactional `activeActionId` claim at commit — with the *field* shaped to
  allow a queue later (arrive → then mine). `?` Do we ship single-slot and add
  chaining post-slice, or build the queue now? Leaning single-slot now.
- **Chaining** (multi-leg board path, arrive-then-act) — a queue of actions where
  each `committedAt` = prior's `eta`. Deferred, but the data model shouldn't
  preclude it.
- **Cancellation / re-tasking mid-action** — both movement docs flag this `?`;
  this system owns it. Cancel = flip `status: cancelled` + release
  `activeActionId` (nothing external to delete — there is no task). For a
  **kinematic** action, re-task is just committing a new burn from the *current
  computed position* (the plans already say "on release you resume coasting from
  wherever you are"). For a **mutating** action under the optimistic ledger,
  cancel is clean because nothing was reserved — a cancelled slice mine yields
  nothing (point-at-ETA, decided above); cycles later pro-rate by completed
  cycles. `?` Refund curve (all-or-nothing first; moot while burns are free).

---

## SSE's role — invalidation, not truth (and why that's load-bearing)

SSE is **not** the source of truth; it's a **cache-invalidation / refetch
trigger**. The revision found this isn't just taste — it's forced by the platform:

- The Pub/Sub push subscription delivers each event to **one** Cloud Run instance,
  while SSE clients may be connected to *another* (max 10 instances) — events can
  silently miss a listener whenever more than one instance is up.
- The backend's **900s request timeout** hard-drops every SSE stream at 15 min;
  `EventSource` reconnects, but events in the gap are lost (no replay in the
  manager).

So the client-side rules that make missed events *self-healing* are part of the
design, not optional polish:

1. **Refetch on every SSE (re)connect** — a reconnect is a "you may have missed
   things" signal.
2. **Self-schedule a refetch at each of your own actions' ETAs** — the client
   knows every ETA deterministically; for your *own* actions SSE is nearly
   redundant.
3. **Poll gently while watching** shared space (§Observers) — for *other*
   players' effects on things you're looking at.

On a **mutating** completion, the resolve publishes a Pub/Sub envelope → affected
SSE channels → clients refetch the changed projection. On a **kinematic** action
there's often *nothing to push mid-flight* — the client animates the coast itself;
the server pushes only **discrete** events (arrival, completion, a contact).

**Read-time projection is where the cost lands, by design.** Because positions are
computed and depletion is folded, there's no write-amplification; you pay at read
(compute my fleets, my fog union, others' fleets filtered by my coverage, fold the
ledgers). Fine for a low-read, low-write chill game; the read-amplification-at-
scale concern is flagged in `fog-of-war.md` and is a *later* problem (compaction
+ checkpoints are the known fix).

Side note: an open SSE stream is a live request, so an instance stays up while
anyone has the game open — "scale to zero" means *zero when nobody's playing*,
which is exactly the promise that matters.

---

## Slice MVP vs. deferred

Slice = `vision.md` step 6, "see it persist." The simplest thing that proves the
spine:

**In the slice:**
- The generic `action` entity + lifecycle (`running → done`), ETA computed at
  commit, single active action per actor (transactional slot claim).
- **Pure lazy resolution** — any read resolves a scope's due actions, in ETA
  order. This alone makes "come back and it's done" true — and "the world moved
  even if you didn't" true the moment anyone else reads.
- **The ledger** for the one mutating verb: mine appends a (window-capable,
  point-behaving) delta; `remaining(T)` is a fold.
- Kinematic resolve (burn/lane-travel arrival, materializing the #0004 fleet
  transition) + one mutating resolve (mine) + scan minting an `asOf: eta`
  snapshot — one of each strategy, to prove the dispatch.
- **worldTime module** (scaled, injectable) + server-time offset on the client.
- Pub/Sub → SSE on completion, with the three client refetch rules.
- The check-in inbox: done-but-unacknowledged query (no timer needed).
- **The ~15-min Cloud Scheduler sweep** (`scheduler.tf` pattern): resolve every
  due action as an ordinary reader, email done-but-unnotified completions, stamp
  `notifiedAt`, log anything stuck/overdue.

**Deferred:**
- **Per-action timers** (Cloud Tasks) — stays rejected; the sweep is the only
  clock. Web-push as a second notification channel (email ships first).
- Action **queue / chaining** (multi-leg, arrive-then-act).
- **Cycle-quantized mining** (the leaning destination; schema hedge in place —
  the slice is point-at-ETA), reservation models (revisit only if a belt hotspot
  ever needs them).
- Mid-action **re-task** refund curves (cancel is all-or-nothing first).
- **Ledger compaction / checkpoints**; TTL/archival of done actions.
- Maintenance-window/pause semantics (moot — nothing runs between events).

> Slice rule: **commit an action, log off, come back, it's done — and the world
> moved even if you didn't** (resolved by whoever read first, or by the sweep
> within ~15 min).

---

## Open questions (rolled up)

**Resolved 2026-07-09 (design-review pass):**
- ~~Resolution model~~ — **pure lazy**: computed core + event-sourced ledger +
  ETA-ordered fold-on-read. No scheduled job queue, no Cloud Tasks, no reaper.
- ~~Mutation consistency~~ — **optimistic via the ledger**; state-at-T is a fold;
  ordering fairness via ETA-ordered scope resolution.
- ~~Cloud Tasks per-action vs. bucketed; 30-day horizon; reaper-as-primary~~ —
  moot: no timer in the slice; a lazy fold has no horizon at all.
- ~~worldTime~~ — the contract above (one scaled function, per-env constant
  `scale`, worldTime-unit stamps, server-supplied offset, injectable clock).
- ~~`kind` in data vs. code; where done kinematic actions live~~ — code; fleet
  owns motion state (#0004), actions are lifecycle/inbox history.
- ~~Observer projection~~ — raw action is owner-only; observers get computed
  snapshots; watchers poll.
- ~~Mining point-vs-flow~~ — **slice mines point-at-ETA**; leaning destination is
  **cycle-quantized flow** (window-capable delta schema is the no-migration hedge);
  continuous flow rejected-leaning (inventory would become a fold).
- ~~Notifications mechanism & timing~~ — **~15-min Cloud Scheduler sweep, in the
  slice** (Flywheel precedent, few $/mo): resolves anything outstanding as an
  ordinary reader + emails completions; per-action Cloud Tasks rejected.

**Still open (small riders only):**
- **Cycle length** for quantized mining — tuning-time, with the mine verb.
- **Queue depth** — single-slot now + queue later, or build the queue up front?
  (Leaning single-slot now.)
- **Cancellation refund curve** per strategy (moot while burns are free).
- **Contact events** — is "a fleet entered my sensor range" a *resolved action
  event* or a *read-time computation*? (Ties to `fog-of-war.md`'s live union.)
- **Compaction threshold** for long ledgers (later; fix known).

## Next step

Core is **locked** (2026-07-09: lazy fold as the correctness mechanism,
event-sourced ledger, ETA-ordered scope resolution, fleet-owns-state, worldTime
contract, point-at-ETA slice mining, in-slice ~15-min scheduler sweep for
liveness + notifications). What's left are non-blocking tuning
riders. **Graduate to `/spec action-timer` — before**
`scan-and-fog` / `movement-galaxy` / the hex-board renderer, since all three assume
this spine. Likely the *first* new spec after #0004. When it graduates: flip the
BACKLOG row (`../specs/BACKLOG.md`: *Action / timer system*) to ✅, update #0004's
"rides the action/timer system" reference from an assumption to a spec link, **and
add the one-line fleet-owns-state / action-references-fleet cross-ref to #0004**
so the two specs can't drift.
