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
- Goal: keep `fleet.FreeHold` and its four consumers (`mine`'s commit
  check, `mine`'s resolve clamp, the fleet handler read, `fuel-purchase`'s
  free-hold precondition) reading a pure, time-independent value — no
  world-time parameter added to any of their signatures.
- Goal: settle a station-keeping hold's true accrued cost whenever it ends
  (voluntarily via `release`, or automatically via exhaustion), never
  leaving an unsettled draw unaccounted for and never over- or
  under-charging relative to elapsed hold time.
- Non-goal: any change to `space.StationKeepRate`'s upkeep-rate formula or
  `space.ReleaseStationkeep`'s re-circularization formula. Both are
  consumed as-is; this change spends their outputs in fuel and persists
  the two new fields the fold needs.
- Non-goal: extending the hull-count fuel-price multiplier to upkeep.
  `decisions.md`'s hull-count ruling was scoped to burns; station-keeping
  is a per-fleet positional hold, not a burn, and extending the ruling
  beyond its stated scope was considered and rejected as unstated
  invention.

## Decisions

### Decision: The dry instant is computed once at `hold` commit and stored on the Park
`space.Park` (for `Kind: ParkStationkeep`) gains two persisted fields:
- **the hold's start world time** (the instant `hold` was committed), and
- **the dry instant** — the world time at which continued upkeep would
  fully exhaust the fuel held at hold-start, computed once, at the instant
  `hold` is committed, as:

  ```
  dryInstant = holdStart + ceil_to_integer_ms(
      1000 × (fuelAtHoldStart × FuelParams.DeltaVPerTon) / upkeepRate
  )
  ```

  **Unit chain, stated explicitly so it cannot be gotten backwards again:**
  `fuelAtHoldStart` is tons; `FuelParams.DeltaVPerTon` is Δv per ton, so
  `fuelAtHoldStart × FuelParams.DeltaVPerTon` is the Δv budget the held
  fuel affords; `upkeepRate` (`space.StationKeepRate`) is Δv per second, so
  dividing by it yields seconds; multiplying by `1000` converts to
  milliseconds; and the result is quantized **up** to an integer
  millisecond count, mirroring `space-kinematics`'s existing "Burn Timing
  Quantizes to Integer World-Milliseconds by Ceiling," so a hold is never
  folded dry one millisecond early. There is no parenthetical escape
  hatch here for "whatever consistent units the existing functions already
  use" — an earlier draft of this formula divided by `DeltaVPerTon` instead
  of multiplying by it, understating a hold's true endurance by
  `DeltaVPerTon²` (25× at today's placeholder value of 5.0); that
  parenthetical is exactly what let the error through undetected, so it is
  deleted rather than restated.

`space.StateAt` folds a `stationkeep` park observed at or after its stored
dry instant into the orbit `space.ReleaseStationkeep` would produce as of
that dry instant — exactly mirroring the existing, already-shipped rule "a
burn past its arrival IS its settled park, with no extra persisted state."
Both fields are named explicitly here (per the DBA's corroborating finding
on link 7's original draft: neither field was named as persisted state
anywhere, which is how an implementer ends up reaching for `Fleet.UpdatedAt`
— re-stamped by unrelated writes — as a hold-start proxy, a silent-
corruption bug no formula-level test would catch).
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
because upkeep is a continuous draw, not a one-time price. Settlement
happens only at:
- **`release`, called before the dry instant**: debits `cargo.fuel` by
  exactly the upkeep accrued between the hold's stored start time and the
  release instant, **converted from `WorldMillis` to seconds by dividing
  by `1000`, then from Δv to tons by dividing by `FuelParams.DeltaVPerTon`**
  — `(rate × (elapsedMs / 1000)) / DeltaVPerTon`, closed-form, from the
  two stored times alone. Two conversions have each been missing from a
  separate earlier draft of this Decision: one omitted the Δv-to-tons
  division and debited the raw `rate × elapsed` Δv figure directly against
  the tons-denominated `cargo.fuel` field (a 5× overcharge at today's
  placeholder `DeltaVPerTon = 5.0`); a later draft, having fixed that,
  still multiplied the per-second rate directly by the raw millisecond
  difference between two `WorldMillis` stamps (a further 1000× overcharge
  on top of that, since `space.StationKeepRate` is a Δv-**per-second**
  rate and stamps are `WorldMillis` project-wide) — both corrected here.
  This then converts the park to orbit via `space.ReleaseStationkeep`. This
  settles the earlier security panel's finding directly: leaving a hold
  always settles its accrual — a released hold never quietly forgives the
  upkeep it drew.
- **the automatic past-dry-instant fold**: settles `cargo.fuel` to exactly
  zero (never negative) on the write that first observes the park past its
  dry instant, converting it to the released orbit in the same write.
- **any other event that mutates `fuel` per `add-fuel-as-cargo` (burn
  debit/refund, refuel credit, the spawn grant) while a hold is open and
  before its dry instant, and that leaves the hold open afterward**:
  settles the accrued upkeep first (as `release` would, minus the
  park-kind change), applies its own delta, then restamps the hold's
  stored start time and recomputes the dry instant from the post-mutation
  fuel level. **Correction to an earlier draft, caught by this change's
  own adversary review:** an earlier draft asserted "this change defines
  no such path" for a mid-hold fuel mutation — false as stated. A
  body-targeted burn settles to an `orbit` park with `attachedTo` set;
  `hold` is accepted on an `orbit` park and, per "Attachment survives
  hold, release, and force-demotion" below, never alters `attachedTo`;
  `fuel-purchase` requires only "docked to a station," independent of park
  mode. Dock at a station, hold, refuel — the obvious use of the verb — is
  reachable, and absent this settlement step the dry instant stays fixed
  against the pre-refuel fuel baseline: a player who holds with 1 t, buys
  200 t, and drifts past the stale instant would lose all 200 t and the
  credits spent on them to the automatic fold. This is why the settlement
  step above is universal — keyed to "any mutation of `fuel` that leaves
  the hold open," not enumerated per verb — so a future fuel-mutating verb
  inherits it automatically rather than reopening this same bug.
- **a burn committed against a fleet whose park is `stationkeep`, open and
  before its dry instant**: settles the accrued upkeep exactly as the
  bullet above would, then evaluates and debits the burn's own fuel cost
  against the resulting balance, then stores the committed burn in place
  of the `stationkeep` park — **and never restamps or recomputes a dry
  instant**, since a burn replaces the park entirely rather than leaving a
  hold open. **A second correction to an earlier draft, caught by this
  change's own adversary review, one layer past the correction above:**
  an earlier draft's settle-restamp-recompute step was worded as covering
  "any mutation of `fuel`" with no carve-out, which would have applied it
  to a burn commit too — restamping a park the burn's own commit was about
  to overwrite anyway, computing a fresh dry instant against a hold that
  no longer exists. Worse, because a burn can be committed for exactly the
  fleet's available fuel, that restamp could itself compute a `dryInstant`
  equal to the restamped `holdStart` — the exact undecodable park the
  zero-fuel `hold` precondition exists to prevent, reached by a path that
  precondition does not guard, since it only gates `hold`'s own commit,
  never a burn's. Left settled with no drop-and-replace distinction at
  all, the alternative failure is silent: the hold's accrual is simply
  forgiven, and the upkeep economy becomes optional (hold, burn away, pay
  nothing). Both failure modes are why this bullet is stated separately
  from, and takes priority over, the mid-hold-mutation bullet above: a
  burn commit settles the hold's accrual (so it is never forgiven) but
  explicitly never restamps (so it can never brick).

This is the mechanism, not merely an assertion, behind `FreeHold`'s
purity: because the stored scalar never moves except at these discrete,
already-transactional events, every one of `FreeHold`'s four callers keeps
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

### Decision: `release`, force-demotion, a burn from an open hold, and any mid-hold fuel mutation each settle inside one transaction, re-reading the fleet's stored state
Following `goods-sale`'s "One Atomic Transaction" and `fuel-purchase`'s own
identical pattern: `release`'s debit and park-kind change, the automatic
past-dry-instant fold, a burn commit's settle-and-drop of an open hold,
and (per the settle-restamp-recompute Decision above) any other verb's
mid-hold `fuel` mutation that leaves the hold open all happen inside one
transaction that re-reads the fleet's current `fuel` and park state before
computing the settlement, never trusting a pre-transaction read. This is
the same discipline that closes the class of race `add-fuel-as-cargo`'s
own panel found in `action.Commit`'s `ActorState` (a *different* mechanism
— `action.Commit`'s slot claim, which `hold`/`release` do not use, since
neither creates an action) — named here so a future reviewer does not
mistake "hold/release don't go through `action.Commit`" for "hold/release
are exempt from transactional re-reads." A burn commit *does* go through
`action.Commit`, so its settle-and-drop of an open hold rides that same
transaction, not a separate one.

### Decision: `hold` is rejected outright when it would store an undecodable dry instant
`hold` computes `dryInstant = holdStart + ceil_to_integer_ms(1000 ×
(fuelAtHoldStart × DeltaVPerTon) / upkeepRate)`. Given the ceiling, this
offset is zero milliseconds — and `dryInstant` therefore equals
`holdStart` — exactly when `fuelAtHoldStart` is zero (any strictly
positive fuel ceilings to an offset of at least one whole millisecond, so
the trigger is not "small fuel," specifically zero fuel). A `dryInstant`
equal to `holdStart` is a value `space-kinematics`'s own decode
requirement ("A station-keep park with a missing or invalid dry instant
fails to decode") rejects outright, since it requires the dry instant
strictly after the hold-start time. Persisting such a park would brick the
fleet: every subsequent read or command against it fails to decode. `hold`
therefore validates this precondition **before** persisting anything,
rejecting with its own named reason rather than writing a park its own
codec cannot read back. This is exactly the population link 7 made
discoverable (a stranded, near-zero-fuel fleet) one `hold` call away from
unreadable, so the guard is not a theoretical edge case. **This guard
covers only `hold`'s own commit.** A burn committed against an
already-open hold reaches the same undecodable state by a different path
— a restamp computing `dryInstant == holdStart` against the burn's
post-debit fuel — if it were treated as an ordinary mid-hold mutation and
restamped; the fix is not a second precondition on the burn path but the
settle-and-drop rule above, which removes the hold (and therefore the
`stationkeep` park) entirely rather than restamping it, so there is never
a park left for this decode guard to reject.

### Decision: Every decision that reads `fuel` settles a past-dry-instant hold first
The dry instant passing does not, by itself, write anything — it is only
observed and settled the next time some read or write touches the park
(mirroring how a burn past its arrival is folded on next observation, not
on a timer). Between the dry instant passing and that next observation,
the stored `fuel` field over-reports what is actually available, and
every consumer that decides something from `fuel` inherits that window
unless it explicitly closes it: the burn-commit affordability gate
(defeating `add-fuel-as-cargo`'s own "a committed burn can never later
fail to resolve for lack of fuel"), `FreeHold` (`mine`'s commit-time
precondition and its resolve-time clamp `freeHoldAtResolve`, and
`fuel-purchase`'s own free-hold precondition), and — an omission an
earlier draft of this change and its own task list made, since fixed —
the two player-visible fleet-read fields `add-fuel-as-cargo` adds:
estimated maximum range and the persistent stranded indication. Dropping
those two is its own cry-wolf failure in reverse: a stale, pre-fold `fuel`
value reads as a *healthy* range and a *not-stranded* fleet for one that
in fact holds zero fuel, silently undermining the very indicator
`add-fuel-as-cargo` built to make stranding discoverable. Rather than
audit each call site for a bespoke settle-check (and inevitably miss one,
as happened here), this change states the settle-before-read rule once,
as its own requirement, and requires every fuel-reading decision path —
named exhaustively above, not left to "any other computation" alone to
carry the two reads that were actually missed — to fold a past-dry-instant
hold in the same transaction or read before evaluating against the
result. A test that merely asserts `FreeHold` returns a *stable* value
across a time advance would pass even if that stable value is the stale,
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
  settlement events**, by design (see the second Decision above). A player
  reading a station-keeping fleet's cargo mid-hold sees the pre-hold value,
  not a live-decreasing one, until `release` or exhaustion settles it. This
  is a UX gap this change accepts rather than re-introduces the coupling
  it exists to avoid; see Open Questions for a possible advisory-only
  follow-up.
- **A mid-hold fuel mutation is a reachable path, not a hypothetical one —
  corrected from an earlier draft that denied it.** Docking at a station
  while simultaneously holding beside it is ordinary play (see the Decision
  above), so `fuel-purchase`'s refuel is a live mid-hold mutation this
  change must, and does, settle-restamp-recompute against. The added
  complexity (every fuel-mutating verb must now settle an open hold before
  applying its own delta, not just `release` and the automatic fold) is
  the accepted cost of closing this hole; a regression test pinning the
  refuel-during-a-hold scenario specifically (not merely "FreeHold is
  stable") is required, per the Decision above.
- **Extending upkeep with a hull-count multiplier was considered and
  explicitly declined (see Non-Goals), and that omission has a real
  consequence worth recording rather than presenting as neutral.**
  `space.StationKeepRate` is derived from the held body, not the fleet's
  roster, so a ten-hull fleet pays the identical upkeep a one-hull fleet
  does while carrying up to ten times the fuel (`fleet-movement`'s "Derived
  Cargo Capacity and Mining Rate") — station-keeping endurance scales
  linearly with roster size, for free. This is the same roster-inversion
  shape `add-fuel-as-cargo`'s burn-pricing hull-count multiplier exists to
  prevent for burns, left open here because `decisions.md`'s hull-count
  ruling was scoped to burns specifically and extending it to upkeep is a
  design call this change declines to make unilaterally. Recorded here so
  the gap is visible, not silently absorbed as an implementation detail.

## Migration Plan

None. Solo toy, no live users. `space.Park`'s two new fields default to
their zero values for every pre-existing stored park (all of which are
`orbit` or `point`, since `stationkeep` has never been reachable) and are
populated only by this change's own `hold` handler going forward.

## Open Questions

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
  landing while a hold is open must, per "Station-Keeping Upkeep Is
  Settled at Discrete Events...", settle the accrued upkeep before
  applying the refuel's own credit — but whether `fuel-purchase`'s own
  free-hold precondition is evaluated before or after that settlement is
  not specified by either capability. Checking free hold before
  settlement can only under-report the free hold the refuel will actually
  land against (the settlement can only free up room, never consume it),
  so an implementation choosing that order can, at worst, conservatively
  reject an otherwise-affordable refuel — never admit an oversized one.
  Recorded rather than resolved, since neither order can overfill a
  fleet's hold.
