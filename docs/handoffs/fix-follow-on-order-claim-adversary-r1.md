# Adversary — `fix-follow-on-order-claim`, round 1

**Verdict: BLOCKED.** Two blockers, three majors, three minors.

The change specifies a real, confirmable architectural gap. It does **not**
specify a fix for the defect that was filed, and its `Why` and `Impact` assert
a causal link to that defect that the code contradicts. Shipped as written, the
team would close `defect-post-sale-departure-burn-409s.md` on a fix whose new
code the reported request path never executes.

---

## BLOCKER 1 — The reported repro would still 409. The fleet order path releases the slot twice before it ever reaches `commitTx`.

**Location:** `proposal.md` Why — "a legitimate follow-on order can be refused
by a claim nothing has yet had occasion to release"; and Impact — "exercised
(not changed in behavior) by `backend/fleet/`'s order-commit endpoints, **which
are how the defect was reproduced**".

**The trace.** Every one of the five logged requests in the defect doc is
`POST /v1/fleets/:id/orders` → `fleet.Service.OrderTo`. That function releases
the movement slot **twice** before `action.Commit` is called:

1. `backend/fleet/service.go:653-657` (inside `solveOrder`) —
   `settleIfDue(ctx, f, bt)`: "An active movement action that already completed
   is a fact, not a re-taskable order: resolve it first (settle + effects),
   then order from the settled doc." `resolveDue` → `actions.ResolveActive(f.Id)`
   → resolves **every** due running action of that actor and releases its slot.
2. `backend/fleet/service.go:821-828` — the re-task branch, unconditional on
   `f.ActiveActionId != ""`: `s.actions.Cancel(...)`, tolerating `ErrNotRunning`.

Only then does `OrderTo` call `Commit` → `commitTx` → the slot read at
`backend/action/dao.go:211`. `OrderTo` reads and `commitTx` checks the **same
document field**. For `ErrActiveActionExists` to fire here, the field must be
empty at `solveOrder`'s `load` and non-empty at commit — i.e. claimed by a
*concurrently committed* action, whose ETA has **not** passed, which this
change explicitly leaves rejecting.

**Three independent facts falsify the stale-claim hypothesis for this repro:**

- The sale at `1:16:21` settled, which (per the writer's own trace, and
  `fleet/service.go:325-327` in `Get`) required `resolveDue` to have already
  run and cleared the slot. The slot was empty 19 seconds before the first 409.
- **Both** attempts 409'd, one second apart. A genuinely stale claim would have
  been consumed by the *first* attempt's own re-task `Cancel` (step 2 above) —
  the second attempt could not have seen it. Two identical rejections are the
  signature of a deterministic precondition (`ErrInsufficientFuel`,
  `QuotedCapExceededError`, `ErrHoldWithoutFuel`, `ErrFleetInTransit` — all
  409 in `fleet/handler.go:480-562`), not a race.
- The defect doc's one "suggestive detail" — the inbox poll
  `GET /v1/actions?actor=…&status=running` having stopped at `1:15:41` — is
  causally inert: `action/handler.go:139` → `Service.InboxByType` →
  `dao.List` (`action/service.go:124-126`). **The inbox resolves nothing.** Its
  absence cannot have left any claim stale.

Also note the evidence is now unrecoverable: `frontend/playwright/.auth/backend.log`
has been overwritten by a later run (07:11–07:39 today) and contains no
`fleet_dab3894e…` and no `/orders` 409.

**Exploit:** the change lands, the tier-2 tests go green at the `action` layer,
the journey records the defect as fixed, and the next slice run 409s in exactly
the same place — with the defect doc closed and the real 409 arm still
unidentified.

**Smallest fix (spec-side only):**
- Rewrite `Why` to lead with the confirmed gap ("`commitTx` is the one read in
  the system that never resolves a due holder, contradicting the sweep-is-a-
  liveness-floor invariant"), and state plainly that the reported 409's branch
  remains **unidentified** and this change does not claim to fix it.
- Delete the Impact clause "which is how the defect was reproduced"; the
  reproduced path pre-releases the slot.
- Add the diagnostic the defect doc itself asked for as a task ("Capturing the
  response body, or adding a distinguishable reason code to that arm, is the
  cheapest next step"): the `/orders` 409 arms are already reason-bearing JSON —
  the task is to capture the body in the Playwright/journey harness so the next
  repro names its arm. Keep `defect-post-sale-departure-burn-409s.md` **open**.

---

## BLOCKER 2 — Task 1.1 mandates a nested Firestore transaction, which the client refuses.

**Location:** `tasks.md` 1.1 — "In the commit transaction's slot-claim check
(`backend/action/dao.go`'s `commitTx`), before rejecting on a non-empty slot
field, resolve any holder … **reusing the existing exactly-once resolve path
(`action-dispatch`'s "Exactly-Once Resolution"), never a parallel one**".

The existing exactly-once resolve path is `DaoImpl.ResolveOne`
(`action/dao.go:316`), whose body **is** `dao.db.RunTransaction(...)`. Calling
it from inside `commitTx`'s transaction returns
`errNestedTransaction = errors.New("firestore: nested transaction")`
(`cloud.google.com/go/firestore@v1.x/transaction.go`). The instruction is
literally unsatisfiable: an implementer must either (a) re-implement the
resolve as a tx-scoped helper — the "parallel path" the task forbids — or
(b) resolve **before** opening the commit transaction, which the task's own
wording ("inside the commit transaction's slot-claim check") forbids.

Two further mechanical facts the tasks do not acknowledge:

- `commitTx` lives in the **DAO**; the `ResolveFunc` registry lives in
  `Service` (`action/service.go:44`, `resolvers map[string]registered`). The
  DAO has no way to obtain the holder's resolver. Whatever shape is chosen,
  this is a layering change the tasks do not name.
- Firestore's read-before-write rule: a tx-scoped resolve needs the action doc
  read **and** `foldDeltasTx` reads (`dao.go:460`) before *any* write. That is
  achievable in `commitTx`'s current shape only if every resolve read is
  hoisted above `tx.Create`/`tx.Set` — the same trap `market`'s two-phase
  prepare/apply exists for.

**Smallest fix:** the requirement's wording ("Before rejecting a commit … the
system SHALL resolve any action currently claiming that slot whose ETA has
already passed") is already implementation-neutral and does **not** require the
resolve to be inside the claim transaction. Rewrite task 1.1 to state the
observable outcome and leave the seam to design: *"Resolve a due holder of the
targeted slot before the claim is evaluated — either ahead of the commit
transaction or via a transaction-scoped variant of the exactly-once resolve;
`ResolveOne` cannot be called from inside `commitTx` (Firestore rejects nested
transactions). Whichever seam is chosen, the holder's effects SHALL land
exactly once, through the existing resolve contract."*

---

## MAJOR 3 — After an in-commit resolve, the transactional producer sees pre-resolve data — reintroducing the exact lost update the same requirement's first paragraph exists to forbid.

**Location:** the new second paragraph of the MODIFIED requirement, versus the
existing first paragraph: "a function invoked inside that same transaction,
**after the actor document has already been read for the slot check**, that
computes the fields to merge onto the actor document **from that transactional
read**".

Firestore transactions have no read-your-writes. If the due holder is resolved
inside the same transaction, its `ActorState` patch (a settled park, a mine's
cargo credit, a released slot) is a *write*; the producer's input remains
`actorSnap.Data()` — the **pre-resolve** snapshot. `fleet.OrderTo`'s producer
(`fleet/service.go:836-878`) computes `merge["cargo"] = {fuel: fuel - newCost}`
and evaluates `storedStationkeepPark(actorData)` from exactly that snapshot. A
resolver that touches the same leaf paths (any future refuel/scoop/upkeep
settle) is silently discarded by the later write — verbatim the failure mode
the paragraph above describes ("whichever transaction commits last silently
discards the other's effect"), now inside a single transaction.

The spec is also silent on **write ordering** between the resolve's actor patch
and the commit's own `mergeActorState`. Today the correct order is
resolve-then-claim (the burn's `state` must win over the settled park's
`state`); nothing in the requirement says so, so an implementer may apply them
in either order and still satisfy the text.

**Smallest fix:** append to the new paragraph — *"When a due holder is resolved
as part of servicing a commit, that resolution's actor-state patch and effects
SHALL be applied before the commit's own claim and actor-state merge, and any
transaction-scoped `ActorState` producer SHALL be evaluated against the actor
state **as of that resolution**, never against the pre-resolution read."* Add a
scenario: a due holder whose resolve credits an actor field, and a commit whose
producer debits the same field, leave the actor with both effects.

---

## MAJOR 4 — "regardless of which verb" is false: `mine` rejects a stale claim before `Commit` is ever called.

**Location:** `proposal.md` — "so a resolved action never blocks the actor's
next order on that slot, **regardless of which verb or read path** would
otherwise have resolved it first."

`mine/service.go:355-361` rejects at the *service* layer:

```go
if f.ActiveActionId != "" {
    occupying := ""
    if a, gerr := s.actions.Get(ctx, f.ActiveActionId); gerr == nil && a != nil { occupying = a.Type }
    return nil, fmt.Errorf("%s: %w", BusyReason(occupying), action.ErrActiveActionExists)
}
```

Its fleet comes from `fleet.Service.Get`, which resolves a due **burn** or
**jump** only (`fleet/service.go:325-340`) — never a due mine. So a
due-but-unresolved mine holding `activeActionId` still produces a 409 on the
next mine **after** this change lands, because the request never reaches
`commitTx`. The same is true of `fleet.Jump`'s and `CutDrive`'s own
`f.ActiveActionId != ""` guards.

Auditing the three slot-claiming call sites: `OrderTo` pre-releases (BLOCKER 1),
`mine.Commit` pre-rejects (here), and only **`fleet.Scan`** (`fleet/service.go:1588`,
`s.load` + commit on `SlotSensor` with no resolve and no cancel) actually
reaches `commitTx` with a genuinely stale claim. That is the one production
path this change fixes — a real one, but not the one the proposal advertises,
and not on the channel the defect names.

**Smallest fix:** scope the claim honestly — *"…never blocks a subsequent
commit **that reaches the commit transaction**; verb services that reject a
non-empty slot field before committing (`mine`) are unchanged by this change
and remain able to reject a due holder."* If the intent is to fix the mine
path too, that requires a `mine-extraction` delta and an Impact entry; today it
has neither.

---

## MAJOR 5 — Task 2.1 does not pin the layer, so it can be satisfied by a test that passes today.

**Location:** `tasks.md` 2.1 — "Emulator-level (tier 2) test reproducing the
race: commit a movement-channel action, advance the injected world clock past
its ETA … then commit a follow-on action on the same slot for the same actor
and assert it **succeeds**."

The task correctly forbids a pre-resolved fixture, but never says *through which
API*. Written through `fleet.OrderTo` (the natural reading of "movement-channel
action … follow-on order"), the test **passes against `main` unmodified** —
`settleIfDue` + the re-task `Cancel` clear the slot — and therefore proves
nothing about the change. Given BLOCKER 1, this is the most likely way this
change ships green and empty.

**Smallest fix:** *"…written against `action.Service.Commit` directly (never
through `fleet.OrderTo` or `mine.Commit`, both of which release or reject the
slot before `Commit` is reached). The test SHALL be demonstrated red against
the pre-change implementation before task 1.1 is written, and SHALL assert the
prior action's status is `done` and its exactly-once effect (delta / actor-state
patch) landed exactly once."* Add a sibling task exercising the one reachable
production path — a second `fleet.Scan` over a due-but-unresolved scan on the
sensor slot.

---

## MAJOR 6 — No scenario for the concurrent resolve, which the change turns into a hard commit failure.

`ResolveOne` mints the ledger delta with `tx.Create(dao.deltaRef(...))` —
"Create fails if the delta already exists — the exactly-once guard. A
concurrent resolver that already wrote it makes this txn fail and no-op"
(`dao.go:365-373`). Benign today: the loser is a standalone resolve. Folded
into a commit, an `ALREADY_EXISTS` from that `Create` aborts the **user's
order**, and `ALREADY_EXISTS` is not a Firestore-retried code. So a legitimate
follow-on order can now fail (5xx) precisely because another reader resolved
the holder concurrently — a *new* failure mode introduced by the fix for the
old one, with no requirement text and no scenario.

**Smallest fix:** add — *"IF the due holder is resolved concurrently by another
reader while this commit is in flight, THEN the commit SHALL still succeed once
the slot is observed free, and SHALL NOT fail on the holder's exactly-once
guard."* Plus the scenario: two concurrent readers, one committing, one
resolving; exactly one delta; the commit succeeds.

---

## MINOR 7 — "ETA has already passed" is undecidable at `eta == now`.

The new paragraph says "whose ETA has already passed" / "has not yet passed";
the sibling requirement "Read-Triggered Due-Action Resolution" says "ETA **at or
before** the current world time", and `DueIDs` uses `Where("eta", "<=", now)`.
An implementer using strict `>` satisfies the new text and diverges from every
other due-predicate in the capability. **Fix:** replace both phrasings with
"whose ETA is at or before the current world time" / "whose ETA is after the
current world time".

## MINOR 8 — Silent on a holder whose type has no registered resolver.

"Read-Triggered Due-Action Resolution" says an unregistered type is "skipped
(logged) and resolution continues". Under the new rule that skipped holder
keeps the slot, so the commit is rejected — arguably right, but unstated.
**Fix:** one sentence — *"IF the due holder's type has no registered resolver,
THEN it is skipped as elsewhere and its claim continues to reject the commit."*

## MINOR 9 — Second home for one rule, with no statement of precedence.

`fleet-movement` already carries "Ordering over a completed-but-unresolved order
settles it first" — and, crucially, requires the settle "**before the new order
is planned and committed**" (position and price are solved from the settled
doc). The new `action-dispatch` rule properly generalises it rather than
contradicting it, but says nothing about precedence; a later reader could take
commit-time resolution as licence to drop `settleIfDue` from `solveOrder`,
planning a burn from a pre-arrival position while the slot resolves at commit.
**Fix:** add — *"This commit-time resolution is a backstop; it does not relieve
a verb of settling a due order before planning one (see `fleet-movement`,
'Ordering over a completed-but-unresolved order settles it first')."*

---

## What holds up

- The 7 live scenarios are reproduced **verbatim** — diffed against
  `openspec/specs/action-dispatch/spec.md:13-97`, byte-identical, nothing
  dropped.
- The regression guard (scenario "A commit against a genuinely still-running
  slot holder is still rejected" + task 2.2) **is** adequate on its stated axis:
  a fix that weakens or deletes the single-slot guard, or that resolves the
  holder unconditionally regardless of ETA, makes the second commit succeed and
  the assertion fail. It should additionally assert the holder is still
  `running` and the slot still names its id, so an "early resolve then re-claim"
  cannot pass by accident.
- The underlying gap is genuine and confirmable: `commitTx`'s check at
  `action/dao.go:211` is the only slot read in the system that never resolves,
  and `fleet.Scan` reaches it with a stale sensor claim.

**Verdict: BLOCKED** — fix the proposal's causal claim (BLOCKER 1), the
unimplementable task (BLOCKER 2), then the three majors.
