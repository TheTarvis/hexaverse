## Context

`chain.md`, sequenced immediately after `add-fuel-as-cargo` (link 7).
Carved out of that change by its own panel review (R1/R2 in
`docs/plans/continous_space/handoffs/link7-panel-consolidated.md`) — see
proposal.md's Why for the full reasoning. This change is authored against
`add-fuel-as-cargo`'s **post-archive** text: `fuel` already exists as a
reserved cargo kind, `FuelParams.DeltaVPerTon` already exists as the
tons-per-delta-v conversion constant, and `fleet-movement`'s "Fleet Cargo
Pool" requirement already enumerates burn debit/refund, refuel credit, and
the spawn grant as fuel's mutating verbs — this change adds station-keeping
settlement as one more.

## Goals / Non-Goals

- Goal: let a player actually reach `stationkeep` — the state
  `decisions.md`'s force-demotion guardrail has governed, unreachable,
  since `add-space-kinematics`.
- Goal: honour that guardrail as written. Station-keeping upkeep must not
  drain a fleet to zero; the fleet retains a reserve.
- Goal: keep `fleet.FreeHold` and its five production consumers (`mine`'s
  commit check, `mine`'s resolve clamp, the fleet handler read,
  `fuel-purchase`'s pre-transaction free-hold precondition, and the
  transaction-scoped free-hold figure its settlement re-evaluates) reading
  a pure, time-independent value — no world-time parameter added to any of
  their signatures.
- Goal: settle a station-keeping hold's true accrued cost whenever it ends
  — voluntarily via `release`, automatically via exhaustion, or as a side
  effect of any verb that ends or abandons the park — never leaving an
  unsettled draw unaccounted for and never over- or under-charging
  relative to elapsed hold time.
- Non-goal: any change to `space.StationKeepRate`'s upkeep-rate formula,
  `space.StationKeepUpkeep`'s accrual arithmetic, or
  `space.ReleaseStationkeep`'s re-circularization formula. All three are
  consumed as-is; this change spends their outputs in fuel and persists the
  two new fields the fold needs.
- Non-goal: extending the hull-count fuel-price multiplier to upkeep.
  `decisions.md`'s hull-count ruling was scoped to burns; station-keeping
  is a per-fleet positional hold, not a burn, and extending the ruling
  beyond its stated scope was considered and rejected as unstated
  invention.
- Non-goal: any reserve on the **burn** path. `decisions.md` rejects that
  explicitly and this change does not reopen it.

## Decisions

### Decision: A station-keeping reserve, so upkeep never drains a fleet to zero
`FuelParams.StationKeepReserveTons` is a configured, strictly positive
tonnage that station-keeping upkeep may never spend. The dry instant is
computed against `fuelAtHoldStart − StationKeepReserveTons`; the automatic
force-demotion settles `cargo.fuel` to exactly that reserve.

**Why this is not optional polish.** `decisions.md:430` states the
guardrail directly: "Station-keeping upkeep SHALL NOT drain a fleet to
zero. This is the one path where a fleet strands *passively, while doing
nothing* — frustration with no decision attached to it." `chain.md:615`
records the same ruling. And `decisions.md`'s own 2026-09-02 correction
records that stranding is **permanent** — the rescue verb the original
"setback, not a death" framing rested on does not exist anywhere in the
tree. An earlier draft of this change settled the exhausted hold to exactly
zero, which given that correction delivers precisely the outcome the
guardrail forbids: a fleet that stranded permanently while its player did
nothing at all.

**Why this does not contradict "no blanket reserve."** `chain.md:615` also
records "No blanket reserve — 'enough to get home' has no local computable
definition," and `decisions.md` rejects a reserve *on definition, not
taste*. That clause governs reserving fuel against **burns**, where the
stranding is the consequence of a decision the player made and where the
reserve's promise ("enough to get home") is the part that cannot be
computed. This reserve makes no such promise. It is not "enough to get
home" and this change states so explicitly in the spec text, so no later
reader mistakes it for a solved return path. It is simply non-zero, so a
fleet retains *some* agency after a drain it never chose. The design's own
rationale is exactly that distinction between active and passive stranding.

- Alternative considered: settle to zero and rely on the force-demotion to
  `orbit` (the free park) as the whole guardrail. Rejected — that is the
  reading the earlier draft took, and it satisfies only half the rule: the
  fleet stops paying, but it is also permanently immobile, which is the
  frustration the guardrail names.
- Alternative considered: reject `hold` unless the fleet already holds
  enough fuel to reach some destination. Rejected as the uncomputable
  quantity `decisions.md` rules out, and it would gate the verb rather than
  bound its drain.
- **The reserve's numeric value is an open question** (see Open Questions).
  It ships as a placeholder. This change deliberately does not invent a
  justified number for it — the structural rule (non-zero, subtracted from
  the spendable budget, left behind by the fold) is what is specified here.

### Decision: The dry instant is computed once at `hold` commit and stored on the Park
`space.Park` (for `Kind: ParkStationkeep`) gains two persisted fields:
- **the hold's start world time** (the instant `hold` was committed), and
- **the dry instant** — the earliest world time at which continued upkeep
  would have drawn the fuel held at hold-start down to the reserve,
  computed once, at the instant `hold` is committed.

It is defined as the ceiling-quantized **inverse of
`space.StationKeepUpkeep`**: the earliest world time `T`, quantized up to
an integer millisecond, at which
`space.StationKeepUpkeep(rate, holdStart, T)` reaches or exceeds
`(fuelAtHoldStart − StationKeepReserveTons) × FuelParams.DeltaVPerTon`.
Quantizing **up** mirrors `space-kinematics`'s existing "Burn Timing
Quantizes to Integer World-Milliseconds by Ceiling," so a hold is never
folded dry one millisecond early.

**Stated as an inverse, deliberately, rather than as a closed-form
expression with a `1000 ×` factor in it.** `space.StationKeepUpkeep`
(`backend/space/park.go:164-167`) already performs the
milliseconds-to-seconds conversion internally — it takes two `WorldMillis`
stamps. Restating that conversion in this capability duplicates a value
`space-kinematics` reserves to its own authoritative implementation, and
two successive drafts of this change got exactly that restated arithmetic
wrong: one divided by `DeltaVPerTon` where the budget side multiplies
(understating endurance by `DeltaVPerTon²`, 25× at today's placeholder 5.0),
and one multiplied a per-second rate by a raw millisecond difference (a
further 1000× error). The only conversion this capability owns, and the
only one it states, is Δv↔tons: `FuelParams.DeltaVPerTon` is Δv **per ton**,
so the budget side multiplies and the accrual side divides. There is no
parenthetical escape hatch here for "whatever consistent units the existing
functions already use" — that parenthetical is what let the first error
through undetected, so it is deleted rather than restated.

`space.StateAt` folds a `stationkeep` park observed at or after its stored
dry instant into the orbit `space.ReleaseStationkeep` would produce as of
that dry instant — exactly mirroring the existing, already-shipped rule "a
burn past its arrival IS its settled park, with no extra persisted state."
Both fields are named explicitly here (per the DBA's corroborating finding
on link 7's original draft: neither field was named as persisted state
anywhere, which is how an implementer ends up reaching for `Fleet.UpdatedAt`
— re-stamped by unrelated writes — as a hold-start proxy, a silent-
corruption bug no formula-level test would catch). The codec's decode guard
covers **both** fields: an absent hold-start decodes to `0`, and every
accrual computed from it then runs from world-epoch zero — an enormous
debit, silently clamped, on a park that decoded without complaint. Guarding
the dry instant alone leaves that open.

- Alternative considered: recompute the dry instant on every read from the
  hold's start time and the current stored fuel level. Rejected — this is
  exactly link 7's original, incorrect design: it makes `cargo.fuel` a
  function of elapsed time, which breaks `FreeHold`'s purity, and it is not
  even well-defined without a stored epoch, since any other write to
  `cargo.fuel` during a hold (a refuel at the body being held beside) would
  retroactively move the baseline without moving the epoch.

### Decision: `cargo.fuel`'s stored value changes only at discrete settlement events
While a `stationkeep` park is active and before its dry instant, the
fleet's **stored** `fuel` cargo value is left untouched — `hold` commit
computes and stores the dry instant but debits nothing at that instant,
because upkeep is a continuous draw, not a one-time price. Every settlement
below debits `space.StationKeepUpkeep(rate, holdStart, eventTime) /
FuelParams.DeltaVPerTon` — the one accrual expression, delegated, never
restated. Settlement happens only at:

- **`release`, called strictly before the dry instant**: debits that
  accrual and converts the park to orbit via `space.ReleaseStationkeep`.
  **No clamp.** An earlier draft of this change carried a clamp here, added
  to repair a defect, and the clamp was itself unreachable: at exactly the
  dry instant the "at or after" fold means the effective park is already
  `orbit`, so `release` is *rejected* rather than clamped; and strictly
  before the dry instant the debit is provably strictly less than the
  spendable budget, so the clamp could never fire on any legal path. A rule
  with no caller is this chain's signature defect, and it does not get an
  exemption for appearing inside a repair.
- **the automatic past-dry-instant fold**: settles `cargo.fuel` to exactly
  `StationKeepReserveTons` (never below, never negative) on the write that
  first observes the park past its dry instant, converting it to the
  released orbit in the same write.
- **any other verb's `fuel` mutation that lands while a hold is open and
  leaves it open afterward**: settles the accrual first (as `release`
  would, minus the park-kind change), applies its own delta, then restamps
  the hold's stored start time and recomputes the dry instant from the
  post-mutation fuel level. **Correction to an earlier draft, caught by
  this change's own adversary review:** an earlier draft asserted "this
  change defines no such path" — false as stated. A body-targeted burn
  settles to an `orbit` park with `attachedTo` set; `hold` is accepted on
  an `orbit` park and never alters `attachedTo`; `fuel-purchase` requires
  only "docked to a station," independent of park mode. Dock at a station,
  hold, refuel — the obvious use of the verb — is reachable, and absent
  this step the dry instant stays fixed against the pre-refuel baseline: a
  player who holds with 1 t, buys 200 t, and drifts past the stale instant
  loses all 200 t and the credits spent on them. Keyed to "any mutation
  that leaves the hold open," not enumerated per verb, so a future
  fuel-mutating verb inherits it.
- **any verb that ends or abandons an open hold**: settles the accrual and
  **never restamps**, since no hold remains. See the next Decision.

This is the mechanism, not merely an assertion, behind `FreeHold`'s
purity: because the stored scalar never moves except at these discrete,
already-transactional events, every one of `FreeHold`'s five callers keeps
reading a value that needs no world-time input.
- Alternative considered: expose a single "current fuel" figure that live-
  folds accrual for every consumer, including `FreeHold`. Rejected —
  this is the coupling link 7's panel review flagged as the blocker; it
  would force a world time through `mine`'s resolve clamp and every other
  `FreeHold` call site, several of which (the resolve clamp especially) run
  inside a resolve transaction with its own effect-time semantics that a
  bolted-on "now" would conflict with.
- Consequence, stated plainly: a station-keeping fleet's **stored**
  `fuel` figure under-reports what has actually been drawn until the next
  settlement event. A live "fuel remaining under the current hold"
  estimate for player visibility, if ever added, is out of scope for this
  change and would need to be clearly advisory and non-authoritative — see
  Open Questions.

### Decision: One universal hold-ending settlement rule, not a per-verb enumeration
Every verb that ends or abandons an open `stationkeep` park settles the
accrued upkeep in the same transaction, before applying its own effects,
and never restamps. Stated once, universally. **This replaces a per-verb
enumeration that named only the burn commit, and the two verbs it missed
were the two that matter most:**

- **`stop`** (`backend/fleet/service.go:826-849`) takes a free,
  below-the-speed-floor branch that replaces the fleet's whole state with a
  `point` park and mutates `fuel` only by a prior burn's refund. A
  `stationkeep` park's velocity is exactly its host body's
  (`space.Park.Velocity`), and a lane gate is **motionless** by
  construction (`system.gateOrbit`: `PeriodMs = 0`), so a fleet holding at
  a gate has velocity exactly zero and `stop` *always* takes the free
  branch. Hold, stop, pay nothing.
- **`jump`** (`:938-1010`) leaves the kinematic state entirely untouched at
  commit, and `JumpResolver` then overwrites it with a fresh `orbit` park
  at the destination gate. Hold, jump, pay nothing.

Both leave a camped gate — the position this upkeep most exists to price —
free to hold indefinitely. Adding two more special cases would have closed
these two and left the next one open; the universal rule ("no path SHALL
end a hold without settling it") closes the class.

For a **burn commit** specifically, the burn's own fuel cost is evaluated
and debited against the balance remaining after the settlement, and the
committed burn is stored in place of the park. It explicitly does **not**
restamp: unlike a mid-hold mutation, a burn replaces the park entirely, so
there is no hold left to restamp — and because a burn can be committed for
exactly the fleet's available fuel, a restamp here could compute a
`dryInstant` equal to the restamped `holdStart`, the exact undecodable park
the `hold` precondition exists to prevent, reached by a path that
precondition does not guard.

The settlement debit is the *hold's* already-accrued upkeep, not a charge
for the ending verb, so it does not disturb "Jump costs no delta-v" or
stop-in-place's free below-the-floor branch — each of those constrains its
own verb's price; neither forgives a debt incurred before it was invoked.

### Decision: Every settlement runs in one transaction against a transactional re-read — including `hold` and `release` themselves
Following `goods-sale`'s "One Atomic Transaction" and `fuel-purchase`'s own
identical pattern: `hold`'s park conversion, `release`'s debit and
park-kind change, the automatic past-dry-instant fold, every hold-ending
verb's settle-and-drop, and any other verb's mid-hold `fuel` mutation all
happen inside one transaction that re-reads the fleet's current `fuel`,
park, and hold fields before computing the settlement, never trusting a
pre-transaction read.

**`hold` and `release` were the gap.** An earlier draft named the
transactional re-read only in this design document, and stated it for the
other paths; no requirement or scenario stated it for the two new verbs
themselves. Because neither creates an action, neither claims a channel
slot, so **nothing serializes them against any other `cargo.fuel`
mutator**. The concrete loss is a `release` and a refuel landing together:
last write wins on `cargo.fuel`, and the purchased fuel and the credits
spent on it both vanish. That is the same class of defect as link 7's A4,
which `handoffs/README.md` records as having turned out to be real in
production rather than only on paper. It is now a requirement with its own
scenarios, not a design note. This is a *different* mechanism from
`action.Commit`'s slot claim — named here so a future reviewer does not
mistake "hold/release don't go through `action.Commit`" for "hold/release
are exempt from transactional re-reads." A burn commit *does* go through
`action.Commit`, so its settle-and-drop of an open hold rides that
transaction.

### Decision: `hold` is rejected outright when it would store an undecodable dry instant
Given the ceiling, the dry instant's offset from `holdStart` is zero
milliseconds — and `dryInstant` therefore equals `holdStart` — exactly when
the spendable remainder `fuelAtHoldStart − StationKeepReserveTons` is zero
or below, i.e. when the fleet's held `fuel` is at or below the reserve (any
strictly positive spendable remainder ceilings to at least one whole
millisecond). A `dryInstant` equal to `holdStart` is a value
`space-kinematics`'s own decode requirement rejects, since it requires the
dry instant strictly after the hold-start time. Persisting such a park
would brick the fleet: every subsequent read or command against it fails to
decode. `hold` therefore validates this precondition **before** persisting
anything, rejecting with its own named reason rather than writing a park
its own codec cannot read back. This is exactly the population link 7 made
discoverable (a stranded, near-empty fleet) one `hold` call away from
unreadable, so the guard is not a theoretical edge case. **This guard
covers only `hold`'s own commit.** A verb ending an already-open hold
reaches the same undecodable state only if it restamps; the fix is not a
second precondition on those paths but the never-restamp rule above, which
removes the park entirely rather than restamping it.

### Decision: Every decision that reads `fuel` settles a past-dry-instant hold first, in a preceding, independent write
The dry instant passing does not, by itself, write anything — it is only
observed and settled the next time some read or write touches the park
(mirroring how a burn past its arrival is folded on next observation, not
on a timer). Between the dry instant passing and that next observation, the
stored `fuel` field over-reports what is actually available, and every
consumer that decides something from `fuel` inherits that window unless it
explicitly closes it: the burn-commit affordability gate, `FreeHold`'s five
call sites, and the two player-visible fleet-read fields
`add-fuel-as-cargo` adds (estimated maximum range, and the persistent
stranded indication). Dropping the last two — as an earlier draft did — is
its own cry-wolf failure in reverse: a stale, pre-fold `fuel` value reads
as a *healthy* range and a *not-stranded* fleet.

**Where that reading decision is itself a transaction that may abort, the
settlement is committed by a separate write that PRECEDES and is
INDEPENDENT of it.** An earlier ruling on this change said the settlement
persists "in the same write that first observes it, whether the commit is
accepted or rejected." That is not merely in tension with two live
requirements this change does not modify — it is undefined on the path the
live spec prescribes. `action-dispatch`'s "A transaction-scoped producer's
error aborts the commit entirely" guarantees that a rejecting producer
persists **no** actor-state mutation, so a settlement written inside a
rejecting commit is discarded by construction; there is no "persist this
one field anyway" available inside an aborted transaction. Settling first,
in its own committed write, satisfies both live requirements without a
delta to either:

- `action-dispatch` is untouched: the commit transaction still persists
  nothing when its producer errors.
- `add-fuel-as-cargo`'s "a rejected commit SHALL leave the fleet's prior
  movement state and `fuel` cargo exactly as they were" constrains **the
  commit's own effects**, and the commit has none on rejection. The
  settlement is not an effect of the order: it is the observation of a
  demotion that had already occurred at the dry instant. It also changes no
  *effective* movement state — `space.StateAt` folds that park to its
  released orbit whether or not the fold is persisted — so the "prior
  movement state" half is untouched in the only sense a reader can observe.

A test that merely asserts `FreeHold` returns a *stable* value across a
time advance would pass even if that stable value is the stale,
over-reported one — the regression guard must assert the settled,
*correct* value specifically.

### Decision: Attachment survives hold, release, and force-demotion
`hold`, `release`, and the automatic force-demotion each mutate only the
fleet's park (its kind, and for release/demotion, its orbit parameters)
and, at settlement, its `fuel` cargo — never its `attachedTo` field or its
docked/undocked status. A station-keeping fleet that was attached to a body
before `hold` remains attached to that same body throughout the hold, after
`release`, and after an automatic force-demotion. This was flagged
explicitly by the architect (H4) as a gap the original draft left
unstated; it is a deliberate, tested guarantee here, not an incidental
byproduct.

## Risks / Trade-offs

- **A stored `fuel` figure under-reports actual accrued draw between
  settlement events**, by design. A player reading a station-keeping
  fleet's cargo mid-hold sees the pre-hold value, not a live-decreasing
  one, until a settlement lands. This is a UX gap this change accepts
  rather than re-introduce the coupling it exists to avoid; see Open
  Questions.
- **A mid-hold fuel mutation is a reachable path, not a hypothetical one.**
  Docking at a station while simultaneously holding beside it is ordinary
  play, so `fuel-purchase`'s refuel is a live mid-hold mutation this change
  must, and does, settle-restamp-recompute against. A regression test
  pinning the refuel-during-a-hold scenario specifically (not merely
  "FreeHold is stable") is required.
- **A future `fuel`-debiting verb that leaves a hold open would need its
  own rule.** Every mutation reachable today that lands during an open hold
  and leaves it open is a *credit* (a refuel, a discarded burn's refund),
  so the restamped recomputation always yields a dry instant strictly after
  its hold-start. A future verb that debits `fuel` while leaving the hold
  open could drive the post-mutation balance to or below the reserve and
  would then have to state its own disposition (reject, or release the
  hold) rather than restamp an undecodable park. Recorded rather than
  pre-solved, since no such verb exists and inventing one's semantics here
  would be unstated design.
- **The three rejection statuses follow a convention, not a universal.** An
  earlier draft justified `409` by claiming this capability "already uses
  [it] for every state-precondition and resource-insufficiency rejection."
  That is false: `fleet.ErrNotBurning` — cut-drive's own
  wrong-effective-state rejection, the nearest structural sibling to
  `hold`'s not-orbiting rejection — is **unwired**, falling through to a
  bodyless `500`. Five such rejections are wired at `409` (lane transit,
  jump-without-attachment, a claimed action slot, an out-of-range or
  occluded sweep, an unaffordable burn) and that is the convention to
  follow; an implementer copying cut-drive's wiring would copy a defect.
  This change repairs that defect as a declared task (see
  `handoffs/drift-fleet-wrong-state-500.md`).
- **Upkeep carries no hull-count multiplier, and that has a consequence.**
  `space.StationKeepRate` is derived from the held body, not the fleet's
  roster, so a ten-hull fleet pays the identical upkeep a one-hull fleet
  does while carrying up to ten times the fuel — station-keeping endurance
  scales linearly with roster size, for free. This is the same
  roster-inversion shape `add-fuel-as-cargo`'s burn-pricing hull-count
  multiplier exists to prevent for burns, left open here because
  `decisions.md`'s hull-count ruling was scoped to burns specifically.
  Recorded so the gap is visible, not silently absorbed.
- **The reserve is a flat tonnage, not a scaled one.** Because it does not
  scale with roster size either, a large fleet's reserve is proportionally
  smaller relative to its capacity. This is accepted for now; the reserve's
  job is to be non-zero, not to be fair.

## Migration Plan

None. Solo toy, no live users. `space.Park`'s two new fields default to
their zero values for every pre-existing stored park (all of which are
`orbit` or `point`, since `stationkeep` has never been reachable) and are
populated only by this change's own `hold` handler going forward.

## Open Questions

- **The value of `FuelParams.StationKeepReserveTons` — for Travis.** This
  change specifies that the reserve exists, is strictly positive, is
  subtracted from the spendable budget, and is what the fold leaves behind.
  It deliberately does **not** invent a justified number. The reserve is
  explicitly not "enough to get home" (no such quantity is locally
  computable), so there is no derivation to appeal to; the value is a
  play-feel call about how much agency a passively-drained fleet should
  retain, and it interacts with `StartingFuelTons` (100.0),
  `DeltaVPerTon` (5.0), and the acceleration floor a stranded fleet would
  crawl at. It ships as a placeholder pending that ruling.
- **A live, advisory "fuel remaining under the current hold" read.** This
  change deliberately does not add one, to avoid coupling `FreeHold` to
  time. Whether a purely advisory, non-authoritative figure (mirroring
  `add-fuel-as-cargo`'s "Fleet Read Reports an Estimated Maximum Range")
  is worth adding for player visibility is left open.
- **Client surface for `hold`/`release`.** This change specifies the
  backend verbs and their ownership/settlement behavior only; a board or
  roster control to invoke them is not specified here and may land with
  `build-production-space-view` or a dedicated follow-up.
- **Ordering of `fuel-purchase`'s free-hold check against this change's
  mid-hold settlement is undefined, and is safe in both orders.** A refuel
  landing while a hold is open must settle the accrued upkeep before
  applying its own credit — but whether `fuel-purchase`'s own free-hold
  precondition is evaluated before or after that settlement is not
  specified by either capability. Checking free hold before settlement can
  only under-report the free hold the refuel will actually land against
  (the settlement can only free up room, never consume it), so an
  implementation choosing that order can, at worst, conservatively reject
  an otherwise-affordable refuel — never admit an oversized one. Recorded
  rather than resolved, since neither order can overfill a fleet's hold.
