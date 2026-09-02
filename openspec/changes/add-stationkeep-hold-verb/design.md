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
  fully exhaust the fuel held at hold-start, computed once as
  `holdStart + (fuelAtHoldStart / DeltaVPerTon) / upkeepRate` (in whatever
  consistent units the existing `StationKeepRate`/`StationKeepUpkeep`
  functions already use) at the instant `hold` is committed.

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
  release instant (`rate × elapsed`, closed-form, from the two stored
  times alone), then converts the park to orbit via
  `space.ReleaseStationkeep`. This settles the security panel's B2 finding
  directly: leaving a hold always settles its accrual — a released hold
  never quietly forgives the upkeep it drew.
- **the automatic past-dry-instant fold**: settles `cargo.fuel` to exactly
  zero (never negative) on the write that first observes the park past its
  dry instant, converting it to the released orbit in the same write.
- Every other event that already mutates `fuel` per `add-fuel-as-cargo`
  (burn debit/refund, refuel credit, the spawn grant) is unaffected by an
  active hold and unaffected by this decision.

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

### Decision: `release` and force-demotion each settle inside one transaction, re-reading the fleet's stored state
Following `goods-sale`'s "One Atomic Transaction" and `fuel-purchase`'s own
identical pattern: `release`'s debit and park-kind change happen inside one
transaction that re-reads the fleet's current `fuel` and park state before
computing the settlement, never trusting a pre-transaction read. This is
the same discipline that closes the class of race `add-fuel-as-cargo`'s
own panel found in `action.Commit`'s `ActorState` (a *different* mechanism
— `action.Commit`'s slot claim, which `hold`/`release` do not use, since
neither creates an action) — named here so a future reviewer does not
mistake "hold/release don't go through `action.Commit`" for "hold/release
are exempt from transactional re-reads."

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
- **The dry instant is fixed at hold-commit and does not react to a
  mid-hold fuel credit or debit from another verb.** If a fleet somehow
  gained or lost `fuel` while holding (this change defines no such path,
  but a future change might), the stored dry instant would silently
  disagree with the fleet's actual fuel level until the next hold/release
  cycle recomputes it. Not a live concern today (no verb this change or
  `add-fuel-as-cargo` defines mutates `fuel` on a fleet that is
  simultaneously station-keeping), but worth a regression test pinning
  that invariant should a future change add one.

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
