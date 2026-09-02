## Why

`decisions.md` (2026-08-29) records a station-keeping force-demotion
guardrail ("upkeep SHALL NOT drain a fleet to zero; it force-demotes to
`orbit`") that, before this change, governs a park **no player can reach**:
`space.StationKeepRate`, `space.StationKeepUpkeep`, and
`space.ReleaseStationkeep` have zero production callers, there is no
`POST /v1/fleets/:id/hold` route, and `space.StateAt` never settles a burn
or a fleet's idle state into `ParkStationkeep`. Link 7 (`add-fuel-as-cargo`)
originally planned to ship the `hold`/`release` verbs alongside fuel's
introduction, on the standing principle "ship the verb with the currency,
or ship neither" — otherwise this would be the fifth instance in this
chain of a derivation built, unit-tested, and never wired to a caller
(after `fleet.GraphSource`, `galaxy.EnsureLaneHorizon`,
`system.StationContinuousOrbit`, and the focused scan's client half).

Link 7's own panel review found a reason to delay by exactly one link
rather than land the verb inline: pricing station-keeping upkeep in fuel
the naive way — folding `cargo["fuel"]` continuously against elapsed hold
time — makes `fleet.FreeHold` (`backend/fleet/roster.go:157`) time-
dependent. `FreeHold` takes no time argument and has **five** production
call sites: `mine/service.go:350` (a commit-time precondition),
`mine/resolver.go:76` (`freeHoldAtResolve`, the resolve-time clamp on how
much a running mine action can credit), `fleet/handler.go:391` (a plain
read), `refuel/service.go:94` (`fuel-purchase`'s pre-transaction free-hold
precondition), and `fleet/cargo_tx.go:186` (the transaction-scoped
free-hold figure that same refuel re-evaluates inside its settlement, read
at `refuel/service.go:121`). An earlier draft of this proposal counted four
and cited two of them at line numbers that were comments rather than calls.
Landing an untested new fold underneath all five of those, in the very
change that also redefines cargo's other primary input (fuel-as-a-
purchasable-and-burnable resource), was judged a worse risk than delaying
the verb by one link — shipping the currency on a fold that destabilizes
`mine`'s resolve clamp would be worse than shipping both together, one link
later.

**This change is that one link.** It carries BOTH the `hold`/`release`
verbs AND their fuel-denominated upkeep (with force-demotion) — landing
together exactly as the original principle intended, just sequenced
immediately after `add-fuel-as-cargo` instead of inside it, once fuel
itself is a stable, already-shipped cargo kind this change can build on
without also having to get fuel's own introduction right in the same
breath.

The correct design, worked out during this carve-out's own review: compute
the station-keeping hold's **dry instant** — the world time at which
continued upkeep would draw the fuel held at hold-start down to a
configured, strictly positive **station-keeping reserve** — exactly once,
at the moment `hold` is committed, and store it on the resulting
`space.Park` alongside the hold's start time. `space.StateAt` then folds a
`stationkeep` park observed at or after its stored dry instant into its
released orbit, exactly mirroring the existing, already-shipped rule "a
burn past its arrival IS its settled park." Reads stay pure and closed-
form; `cargo.fuel`'s **stored** value is never itself a function of
elapsed time — it changes only at discrete settlement events (`hold`
commit computes and stores the dry instant but debits nothing yet;
`release`, called strictly before the dry instant, settles the accrued
upkeep in one closed-form debit; **any other verb's mid-hold `fuel`
mutation that leaves the hold open** — e.g. a refuel while docked beside
the held body — settles that same accrual, then restamps the hold and
recomputes the dry instant against the post-mutation fuel level, since the
obvious "dock, hold, refuel" sequence is reachable and an earlier draft of
this change wrongly asserted it was not; **any verb that ends or abandons
an open hold** — a burn commit, a stop-in-place, a jump — settles that same
accrual but, unlike a mid-hold mutation, never restamps, because the hold
no longer exists once that verb's own effects are stored; the automatic
fold past the dry instant settles the remainder down to exactly the
reserve). Every fuel-reading decision (the burn-commit affordability check,
`FreeHold`'s five call sites, the estimated-maximum-range read, and the
persistent stranded indication) settles a past-dry-instant hold before
evaluating against the result — durably, in a write that precedes the
decision rather than an in-memory fold, and itself conditional on a
transactional re-read so it can never overwrite a refuel that landed
first — so none of them ever decides against the stale, over-reported
figure a passed-but-unobserved dry instant would otherwise still show. This
is what keeps `FreeHold` and its consumers reading a pure,
time-independent value with no world-time parameter threaded through any of
their signatures.

The **reserve** is the correction that makes this change faithful to its
own governing decision rather than inverting it. `decisions.md:430` and
`chain.md:615` both record that station-keeping upkeep SHALL NOT drain a
fleet to zero, because station-keeping is the one path on which a fleet
strands *passively, while doing nothing* — and `decisions.md`'s own
2026-09-02 correction records that stranding is **permanent**, no
cargo-transfer verb existing anywhere in the tree. An earlier draft of this
change settled the exhausted hold to exactly zero, delivering precisely the
outcome the guardrail forbids. `chain.md:615`'s "no blanket reserve —
'enough to get home' has no local computable definition" is not in tension
with this: that clause governs reserving fuel against **burns**, where
stranding is a decision the player made. A station-keeping-specific reserve
claims nothing about getting home; it is simply non-zero, so the fleet
retains agency after a drain it never chose.

## What Changes

- New instant, ownership-gated fleet verbs: `POST /v1/fleets/:fleetId/hold`
  (`orbit` → `stationkeep` at the fleet's current offset) and `POST
  /v1/fleets/:fleetId/release` (`stationkeep` → `orbit`, re-circularized).
  Neither creates an `action-dispatch` action, claims a channel slot, or
  computes an ETA — both are instant, like `cut-drive`. Both are rejected
  while the fleet is in lane transit, before any evaluation of its stored
  kinematic state, and both resolve a past-ETA movement-channel action
  before evaluating their own preconditions — an unresolved body-targeted
  arrival folds to an `orbit` park, so `hold` would otherwise be accepted
  over it and the arrival's exactly-once effects (`attachedTo`, gate-lane
  charting) would be silently dropped.
- A new named tuning constant, `FuelParams.StationKeepReserveTons` — the
  tonnage station-keeping upkeep may never spend. The dry instant is
  computed against `fuelAtHoldStart − StationKeepReserveTons`, and the
  automatic force-demotion leaves the fleet holding exactly the reserve,
  never zero. **Its value is an open question for Travis** (recorded in
  design.md); it ships as a placeholder, and this change deliberately does
  not invent a justified number for it. The reserve constrains upkeep alone
  — a burn may still spend it to zero, exactly as `add-fuel-as-cargo`
  already allows.
- `space.Park` gains two persisted fields for a `stationkeep` park: the
  hold's start world time, and the dry instant computed at `hold` commit and
  rewritten thereafter only when a mid-hold `fuel` mutation restamps the
  hold (both fields move together, never independently, and never with the
  mere passage of time). `EncodePark`/`DecodePark` widen by these two keys,
  and the decode guard rejects **both** an absent or non-positive hold-start
  time and an absent or non-strictly-later dry instant — guarding the dry
  instant alone would let an absent hold-start decode to zero and compute
  every accrual from world-epoch zero. **This is a `space-kinematics`
  delta** — the one piece of this whole feature (fuel as cargo,
  station-keeping) that touches the kinematics package's own persisted
  shape, deliberately isolated to this change so `add-fuel-as-cargo` itself
  never had to take one.
- A new `space-kinematics` fold, mirroring "A Burn Past Its Arrival Is Its
  Settled Park, With No Extra Persisted State": a `stationkeep` park
  observed at or after its stored dry instant IS its released orbit,
  computed deterministically from the stored park alone, with no new
  persisted state beyond the two fields above.
- Accrual arithmetic **delegates** to `space.StationKeepUpkeep(rate, fromMs,
  toMs)`, which already performs the milliseconds-to-seconds conversion
  internally; this change's own requirements forbid restating that
  arithmetic inline or dividing by `1000` a second time, and state the dry
  instant as that same function's ceiling-quantized inverse rather than
  re-deriving a `1000 ×` factor `space-kinematics` reserves to its own
  authoritative implementation. Only the Δv-to-tons conversion
  (`FuelParams.DeltaVPerTon`, division on the accrual side, multiplication
  on the budget side) is stated here.
- `cargo.fuel`'s **stored** value is never decremented merely by elapsed
  hold time. It changes only at discrete settlement events: `hold` commit
  (computes and stores the dry instant, debits nothing; rejected by name
  whenever the fleet's currently held `fuel` is at or below the reserve,
  since the resulting dry instant would equal the hold's start time — a
  value `space-kinematics`'s own decode requirement rejects, bricking the
  fleet), `release` strictly before the dry instant (debits exactly the
  accrued upkeep, with **no clamp**: a release before the dry instant is
  provably strictly less than the spendable budget, so no clamp could ever
  fire, and a `release` at or after the dry instant is rejected outright
  because the fold has already released the hold), any other verb's mid-hold
  `fuel` mutation that leaves the hold open (settles-restamps- recomputes),
  **any verb that ends or abandons an open hold** (settles, never restamps —
  stated as one universal rule rather than a per-verb enumeration, because
  the per-verb form is exactly what left `stop` and `jump` forgiving the
  accrual in an earlier draft: a fleet camping a lane gate could hold, then
  stop or jump, and pay nothing), and the automatic past-dry-instant fold
  (settles the remainder down to exactly the reserve, never below, persisted
  on the write that first observes it) — this is what keeps `fleet.FreeHold`
  and its five consumers pure, **provided every one of them settles a
  past-dry-instant hold before reading, which this change requires
  explicitly** rather than leaving as an assumption. No hull-count
  multiplier applies to upkeep (station-keeping is a per-fleet positional
  hold, not a burn — `decisions.md`'s hull-count ruling was scoped
  specifically to burns, and this change does not extend it).
- **`hold` and `release` settle in one transaction against a transactional
  re-read.** Neither claims a channel slot, so nothing else serializes them
  against any other `cargo.fuel` mutator; without the re-read a `release`
  and a concurrent refuel resolve last-write-wins and the purchased fuel,
  with the credits spent on it, vanishes — the same class of defect as the
  refuel double-submit that proved real in production.
- **A station-keeping fleet's attachment survives every transition this
  change defines**: `hold`, `release`, and the automatic force-demotion each
  leave the fleet's `attachedTo` and docked/undocked status exactly as they
  were before the transition — only the park's kind (and, for
  `release`/force-demotion, its orbit parameters) change.
- `fleet-movement`'s ownership-check requirement widens to cover `hold` and
  `release`: an unchecked `hold` would let a foreign corporation park
  another corporation's fleet into a continuous fuel drain it never chose,
  and an unchecked `release` would let a foreign corporation force another
  corporation's fleet off a deliberately held position.
- `fleet-movement`'s cargo-pool requirement widens to name station-keeping
  settlement as one of the enumerated ways a fleet's `fuel` entry changes
  (alongside the burn debit/refund, the refuel credit, and the spawn grant
  `add-fuel-as-cargo` already established).
- `fleet-movement`'s burn-commit rejection requirement ("A Burn Commit Is
  Rejected When Its Fuel Cost Exceeds Available Fuel, Debited At Commit
  Never At Resolve") narrows its no-side-effects guarantee to the rejected
  commit's **own** effects. As written today it forbids the fleet's `fuel`
  cargo from differing at all across a rejected commit, which this change's
  "Every Decision Reading Fuel Settles a Past-Dry-Instant Hold First" would
  otherwise contradict: settling an already-elapsed hold before evaluating
  affordability durably persists a debit `space.StateAt` had already folded,
  so a rejection can legitimately leave a different stored `fuel` value. The
  narrowed text scopes the guarantee to the commit's own side-effects — the
  discard refund and the prior action's cancellation, which is the entirety
  of the guarantee's own stated rationale — and explicitly excludes a
  settlement written by a preceding, independent transaction that changes no
  *effective* state. The scenario "An unaffordable burn is rejected and
  nothing is stored or debited" carries the same carve-out in its `THEN`, so
  it is not literally false for a fleet also carrying a past-dry-instant
  hold; its title is unchanged.
- `fuel-purchase`'s "One Atomic Transaction" widens to name the two further
  effects a refuel into an open hold must carry in that same transaction
  (the accrued-upkeep debit before the credit; the restamp and dry-instant
  recomputation after it), and to pin that a replayed refuel performs
  neither a second time.
- **Three pre-existing sentinels are wired**, as declared tasks with no spec
  delta (their requirements are already live and already correct):
  `fleet.ErrNotBurning`, `ErrAccelBelowFloor`, and `ErrAccelAboveCeiling`
  today fall through to a bodyless `500`, violating three live
  `fleet-movement` scenarios. This change already rewrites that exact
  `respond` switch. See
  `docs/plans/continous_space/handoffs/drift-fleet-wrong-state-500.md`.

## Impact

- Affected specs: `fleet-movement` (the `hold`/`release` verbs, the
  station-keeping reserve, their upkeep settlement, the one-transaction
  re-read rule, the ownership-check and cargo-pool widenings),
  `space-kinematics` (the new persisted park fields and their decode guard,
  the past-dry-instant fold), `request-authorization` (the
  mutating-endpoint ownership-seam enumeration widened to
  `hold`/`release`), `fuel-purchase` (the two further effects a mid-hold
  refuel carries in its one transaction, and their replay behavior),
  `mine-extraction` (retiring the `freeHoldAtResolve == freeHoldAtCommit`
  equality claim in "Resolve Clamps Yield to Reality", pre-registered as
  reachable once a future verb could mutate cargo while a fleet is docked
  to a mined feature — this change is that verb; the `holdFull` branch
  stays structurally unreachable and this change says so explicitly rather
  than shipping a scenario that would need an out-of-band cargo write to
  induce).
- Affected code (once implemented): `backend/space/` (`Park`'s two new
  fields, `EncodePark`/`DecodePark` and their widened decode guard, the new
  fold in `StateAt`), `backend/fleet/` (the `hold`/`release` handlers,
  `FuelParams.StationKeepReserveTons`, upkeep settlement, force-demotion,
  the hold-ending settlement on the burn-commit, stop-in-place and jump
  paths, and `handler.go`'s `respond` switch — which also gains the three
  drift sentinels above), `backend/mine/` (no behavioral change required,
  but its resolve clamp now runs against a `freeHoldAtResolve` that a
  station-keeping settlement landing mid-run can widen relative to
  `freeHoldAtCommit`), `backend/refuel/` (the settle-restamp-recompute step
  a refuel landing mid-hold must perform inside its own settlement
  transaction), `backend/middlewares/` or router wiring (ownership checks
  on the two new routes), and a widened `fixtures/space/` case family for
  the two new `Park` fields' codec round-trip.
- No migrations, no backwards compatibility (solo toy) — lands outright.
- **This change MUST archive after `add-fuel-as-cargo` (chain link 7) has
  already archived.** Both changes MODIFY `fleet-movement`'s "Fleet Cargo
  Pool" requirement, and this change's MODIFIED delta is authored against
  what `add-fuel-as-cargo` leaves in `openspec/specs/fleet-movement/
  spec.md` after it archives — `fuel` as a cargo kind, `FuelParams.
  DeltaVPerTon`, the fuel-cost conversion this change reuses (without the
  hull-count multiplier), and the exact wording of "Fleet Cargo Pool"'s
  burn-debit/refund/refuel-credit/spawn-grant enumeration (including its
  in-capability cross-references to "A Burn Commit Is Rejected..." and
  "Discarding a Running Burn Refunds...") are all that change's own
  additions. Archiving this change first would apply its delta against
  pre-fuel text and silently drop `add-fuel-as-cargo`'s own scenarios;
  `openspec validate --strict` catches neither ordering.
