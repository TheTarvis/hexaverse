## Context

`chain.md`'s link 7 (this change). `decisions.md`'s 2026-08-27 "Fuel is a
cargo commodity" decision and its 2026-08-29 "A fleet can strand, and
stranding is a setback rather than a death" ruling are both binding inputs;
the rescue-pillar half of the second was corrected on 2026-09-02 by this
change's own analysis (see proposal.md's Why) — the correction is
authoritative over the original entry, which `decisions.md` itself now
records.

This change is authored against `re-express-economy-positions` (link 6)'s
**post-archive** text — link 6 is spec-complete and this change is written
against its ADDED `fleet-movement` requirement *Every Body In the System's
Body Table Is a Valid Attachment Host*, the precondition the refuel verb's
docked-state check is written against, with no new co-location predicate
invented here. This is a **semantic** dependency on link 6's content, not
a mechanical archive conflict: the two changes' requirement headers do not
overlap at all (link 6 touches *Mine Offer*, *Sell Offer*, and one ADDED
`fleet-movement` requirement; link 7 touches a disjoint set — see
proposal.md's Why for the full list). An earlier draft of this change's
supporting rulings document mischaracterized this as "seven overlapping
requirement headers"; that characterization was checked against the
actual diff and found to describe zero overlap. Corrected here so no
future reviewer plans around a merge hazard that does not exist.

Four structural findings from this change's own panel review, all
reflected in this change's shape:

1. **Delta-v rises with commanded acceleration, not falls.**
   `space.Burn.DeltaV()` is `commandedAcceleration × flightSeconds`, and
   `FlightSeconds(L, a) = 2·√(L/a)`, so `Δv = 2·√(a·L)` — strictly
   *increasing* in `a`. A fleet's maximum affordable range is therefore
   achieved at its *minimum* commanded acceleration
   (`disclosure.MinCommandedAccel = 1.0`), not its ceiling. An earlier
   draft of this change priced both the estimated-range read and the
   stranding warning at the acceleration ceiling — exactly backwards,
   yielding the fleet's *shortest* reach where "maximum" was claimed, and
   false-alarming the warning against fleets that could reach a station by
   crawling. Corrected throughout this change's spec deltas; see Decisions
   below.
2. **The rescue pillar `decisions.md` rested on does not exist** — no
   cargo-transfer verb exists anywhere in the tree. Stranding is therefore
   permanent, not "pending rescue," except that a jump costs no delta-v,
   so a fleet stranded while attached to a lane gate can still cross the
   galaxy (never manoeuvre in-system). Softened, but not closed, by
   finding 1 above: a fleet with any fuel at all can always crawl at the
   floor. Not fixed here; recorded as the `add-cargo-transfer` follow-up.
3. **A fresh corporation deadlocks without starting fuel** — spawn seeds an
   unattached `point` park; sale and refuel require attachment; attachment
   requires a burn; a burn requires fuel. Starting fuel is therefore
   forced, granted as a configured constant (never a spawn-time solve) and
   guarded by a generated-sample reachability test, atomically anchored so
   concurrent spawn-healing calls cannot double-grant it.
4. **`fleet.FreeHold` cannot become time-dependent, and the station-keeping
   half of this change's original draft would have made it so.** This is
   why the station-keeping `hold`/`release` verbs and their upkeep
   currency are carved out to `add-stationkeep-hold-verb` (sequenced
   immediately after this change) rather than shipped here — see
   proposal.md's Why for the full reasoning, and that change's own
   design.md for the corrected fold.

## Goals / Non-Goals

- Goal: give delta-v a currency with a real, raidable supply line (fuel
  occupies cargo mass, is bought with credits, and burns down).
- Goal: never let a burn strand mid-flight — the affordability check and
  the commit-time fuel debit are the mechanism, not a promise.
- Goal: make stranding *visible*, both at the moment it becomes possible
  (the non-blocking commit warning) and persistently thereafter (the
  roster-row indicator), even though this change does not make stranding
  *reversible*.
- Goal: price every reachability judgment (the range estimate, the
  stranding warning, the persistent indicator) at the acceleration floor,
  since that is where a fleet's true maximum reach lives — never at the
  ceiling.
- Non-goal: the station-keeping `hold`/`release` verbs and their upkeep
  currency. Carved out to `add-stationkeep-hold-verb`, sequenced
  immediately after this change.
- Non-goal: a cargo-transfer verb (rescue). Recorded as a follow-up change.
- Non-goal: per-region or per-station fuel pricing, or quantity-limited
  station fuel. Both recorded as open questions for a later exchange
  change, per `decisions.md`'s OQ-1 ruling.
- Non-goal: fixing `Stop`'s pre-existing `defaultAccel`-vs-
  `DerivedAccelCeiling` inconsistency. Recorded, not fixed.
- Non-goal: any UI beyond the minimal fuel/range readout, persistent
  stranded indicator, stranding warning, and refuel control this change
  specifies. Full refuel UX polish may defer to link 8.

## Decisions

### Decision: Fuel is a reserved cargo kind, not a separate tank field
Fuel lives in the existing `cargo: {kind: tons, ...}` map under the key
`fuel`, mined by no verb and sold by none. This is the literal reading of
`decisions.md`'s "occupies cargo mass the way ore does" and needs no new
storage shape, no new capacity computation, and no new free-hold formula —
`fleet-movement`'s existing "Fleet Cargo Pool" requirement already defines
free hold as capacity minus the sum of all kinds held; fuel simply
participates in that sum.
- Alternative considered: an abstract per-fleet number with no mass and no
  location. Rejected by `decisions.md` itself as "bookkeeping without
  gameplay" — it cannot be raided and constrains nothing.

### Decision: Every reachability judgment prices at the acceleration floor, never the ceiling
`space.Burn.DeltaV() = commandedAcceleration × FlightSeconds(L,
commandedAcceleration)`, and `FlightSeconds(L, a) = 2·√(L/a)`, so
`Δv = 2·√(a·L)` — monotonically increasing in `a`. Solving for the
maximum curve length a fixed delta-v budget affords, `L = Δv²/(4a)`, which
is maximised at the *minimum* legal `a`: `disclosure.MinCommandedAccel =
1.0`. Every requirement in this change that asks "how far can this fleet
possibly go" or "can this fleet reach anything at all" — the estimated
maximum range, the stranding warning, and the persistent stranded
indicator — SHALL therefore solve its candidate burn(s) at
`MinCommandedAccel`, never at the fleet's `DerivedAccelCeiling`. An
earlier draft of this change had this backwards in two places: the range
estimate solved at the ceiling (yielding the fleet's *shortest* possible
reach, mislabeled "maximum"), and the stranding warning priced its
candidate burns at the ceiling (firing against fleets that could in fact
reach a station easily by crawling — a false alarm on the one requirement
whose entire value is credibility). Both are corrected in this change's
spec deltas.
- Consequence, stated as a Risk below rather than smoothed over: fuel
  bounds a fleet's *speed*, not its ultimate *reachability*, all the way
  down to the acceleration floor. A nearly-dry fleet can (almost) always
  crawl somewhere. This materially weakens the supply-line pressure this
  change exists to create relative to a ceiling-priced accounting, and is
  the honest counterweight to "stranding is permanent."
- This also softens (does not close) the dry-drifting-fleet-cannot-stop
  conflict recorded in proposal.md's "Also recorded, not fixed here": a
  fleet with any fuel at all can burn at the floor and shed velocity far
  more cheaply than a ceiling-priced stop implies, so the genuinely-dead
  population is smaller than an earlier draft of this change assumed —
  see Risks.
- **The one deliberate carve-out from this rule:** `corporation-spawn`'s
  "Starting Fuel Is a Configured Constant, Guarded By a Reachability
  Sample" prices its spawn-to-home-station reachability guarantee at the
  fleet's `DerivedAccelCeiling`, not the floor. This is not an
  inconsistency — a burn order that omits an explicit commanded
  acceleration defaults to the ceiling ("An omitted commanded acceleration
  defaults to the fleet's ceiling"), so the ceiling is what a fresh
  corporation's actual, unmodified first order costs. A floor-priced guard
  would certify a starting-fuel constant under which that real default
  order is unaffordable, reopening the exact spawn-time deadlock §0.3
  exists to prevent — at `DerivedAccelCeiling = 8` vs `MinCommandedAccel =
  1.0`, a floor-priced guard would understate the default order's true
  cost by `√8 ≈ 2.83×`.

### Decision: Fuel price scales with roster hull count, never with loaded mass
See proposal.md's guardrail paragraph for the full argument. The
distinction that must survive review: hull count is read once, at commit,
from the roster as it stands at that instant, and is constant for the
duration of that one burn — unlike loaded mass, which changes continuously
as fuel itself burns. Coupling to the latter is the rocket equation and is
explicitly forbidden by a SHALL NOT in the spec so it cannot be quietly
reintroduced by a future change that conflates "scales with something
about the fleet" with "scales with mass."
- Alternative considered: no hull-count scaling (price purely from
  `space`'s delta-v output). Rejected — cargo capacity already scales with
  the roster (as the sum of per-class hold capacities — see the next
  point), so an unscaled price would let a bigger fleet buy proportionally
  more range for the identical delta-v bill, inverting the supply-line
  pressure this change exists to create.
- **Correction to an earlier draft's stated rationale:** `fleet-movement`'s
  "Derived Cargo Capacity and Mining Rate" defines capacity as the *sum of
  the roster's per-class hold capacities* — not a function of hull count
  alone. With exactly one hull class in play today, the sum is
  proportional to hull count, so scaling fuel price by hull count and
  capacity by class move together and "maximum affordable range is
  roster-independent" holds. It is **not** guaranteed once a second hull
  class with a different per-class hold capacity exists: ten small hulls
  would pay ten times the fuel price while carrying less total fuel
  capacity than one freighter paying once, inverting the intended
  neutrality. Recorded as an Open Question against the introduction of a
  second hull class, not silently assumed away.
- Consequence, stated as a feature (correctly scoped to today's one-class
  roster): maximum affordable range becomes roster-independent, since
  both capacity and price scale by the identical hull-count factor while
  every hull is the same class.

### Decision: Fuel debits at commit, never at resolve, against a transactional re-read
This is what makes "a burn never strands mid-flight" a mechanical
guarantee. The affordability check and the debit happen in the same
transaction that stores the burn; nothing at resolve re-checks or
re-charges fuel. The alternative — debiting at resolve — was never
seriously considered: it would mean a burn could be *committed* while
unaffordable and only fail visibly at arrival, which is strictly worse
than a commit-time rejection and defeats the entire "warn, don't strand
mid-burn" architecture `decisions.md` specifies.
- **Correction, from this change's own panel review (not merely a
  restatement of the design):** debiting "in the same transaction" is not
  by itself airtight. `action.Commit`'s transaction
  (`backend/action/dao.go:163`) reads the actor doc only to check the
  channel-slot field; `CommitSpec.ActorState` — the map merged onto the
  actor doc in that same transaction — is a **static value computed
  before the transaction opens**. Burn-vs-burn commits are serialized by
  the slot claim (only one burn can be active at a time), but
  burn-vs-refuel is **not**: refuel is instant and claims no slot, so a
  burn's fuel debit and a concurrent refuel's fuel credit can each compute
  an absolute post-mutation `cargo.fuel` value from a stale
  pre-transaction read, and whichever commits last silently overwrites the
  other's effect — a lost update, and specifically a lost update on the
  resource this whole change exists to make scarce. This is why
  `action-dispatch` takes a delta in this change: `CommitSpec` gains a
  transaction-scoped `ActorState` producer, so the fuel debit is computed
  from the same transactional read that already checks the slot, not from
  an earlier snapshot. Accepting this race to avoid an `action-dispatch`
  delta was considered and rejected — a lost update on fuel is silent
  economic corruption, and that is the wrong trade even for a solo toy.

### Decision: Commit-time affordability rejection; a non-blocking, floor-priced stranding warning; a persistent, floor-priced stranded indicator
Three separate signals, deliberately different in strength and lifetime:
- **Affordability** (can this specific burn be paid for) is a hard
  rejection. Cheap to evaluate (one already-computed price against one
  stored cargo value) and this is the mechanism that keeps "never strands
  mid-burn" true.
- **Reachability from the resulting position** (can *some* future burn,
  priced at the acceleration floor, get this fleet to a station or gate)
  is a one-shot, non-blocking warning at the instant a commit creates the
  condition. `decisions.md` is explicit that the complaint about stranding
  is that it happens invisibly, not that it happens — a blocking check
  here would be a disguised "enough fuel to get home" reserve, which
  `decisions.md` separately rejects as uncomputable (no local definition
  of "home").
- **A persistent indication**, computed fresh on every read of the fleet
  (also priced at the floor), exists because a one-shot toast is easy to
  miss — a player who missed it, or who opens the roster later, would
  otherwise be able to learn a fleet is stranded only by attempting burns
  and watching them fail, which is discoverability by inference for what
  `decisions.md` now records as the harshest irreversible state in the
  game. This costs no new math: the same floor-priced reachability
  evaluation the commit-time warning already computes is simply re-run
  (or its result re-surfaced) on read, rather than thrown away after the
  commit response is sent.
- **Correction to `decisions.md`'s cost claim:** the reachability check is
  described there as "a single closed-form body-target solve." It is not.
  `space.SolveBurn` is per-target, so checking every candidate station and
  lane-gate body in the destination system costs one solve per candidate,
  and each solve itself runs `space.SolveRounds`'s fixed round count
  internally — an N × `SolveRounds` scan, N bounded by that system's
  station/gate count (not its full body count — the candidate set is
  explicitly bounded to stations and lane gates only). `tasks.md` sizes
  this work against the honest cost.
- **Correction, caught by this change's own adversary review: a
  `space.SolveBurn` failure was left unhandled, and it fires on the most
  routine configuration in the game.** `space.BuildCurve` rejects a curve
  shorter than `space.MinArcLength` with `space.ErrArcTooShort` — exactly
  what happens when the fleet's resulting park already sits at (or arrives
  at) the very candidate being evaluated, i.e. a fleet parked at, or
  burning to, its own home station. Left unhandled, this reads as "cannot
  solve a burn to this candidate" and the candidate is dropped from the
  affordable set — so the stranding warning fires against a fleet burning
  *to* its own refuelling point, and the persistent stranded indicator
  reads a docked, full-tank fleet as permanently stranded. Both
  requirements now state the rule explicitly: an `ErrArcTooShort` failure
  counts as reachable at zero cost (the fleet is already there); any other
  named `space` error counts as unreachable. Getting this backwards is the
  single easiest way to make this change's flagship credibility
  requirement cry wolf at the one place it must never fire.
- **Rejection copy distinguishes two different player questions.** A
  commit rejected because *this specific burn's* fuel cost exceeds
  available fuel ("A Burn Commit Is Rejected When Its Fuel Cost Exceeds
  Available Fuel...") is not the same situation as a fleet that cannot
  afford *any* burn, even at the floor, to *anything* reachable — the
  first is "try a cheaper burn or a closer target," the second is
  effectively "this fleet cannot move under its own power to any known
  destination." The rejection reason for the first case names only that
  this specific commit is unaffordable; the persistent stranded indicator
  is the surface for the second.

### Decision: Discarding a running burn refunds its unspent fuel, closed-form, from a stored debited-cost field
`decisions.md`'s OQ-4 ruling: the delta-v spent by the discard instant τ is
`commandedAcceleration × τ`, so the *unspent fraction* of the burn is
`(flightDuration − τ) / flightDuration`. Applying that fraction to the
**fuel cost in tons that was actually debited and stored on the burn
record at its own original commit** gives the refund with no
re-conversion and no roster re-read at discard time.
- **Correction to an earlier draft's claim:** that draft asserted this
  "requires no new persisted state," reasoning that hull count and
  acceleration were already stored on the burn and the cost could be
  re-derived from them at discard. That is false as stated: `space.Burn`
  (`{Origin, Target, Intercept, Curve, Length, DepartMs, ArriveMs, Accel,
  InsertionPhase}`) carries no hull count field, and the requirement's own
  scenario forbids re-reading the roster at discard (the refund must use
  the hull count *at original commit*, not the roster as it stands at
  discard — a fleet's roster can change between the two). The fix: **store
  the originally-debited cost, in tons, directly on the burn record** —
  the same information a hull-count field would provide, as one already-
  converted number, and it makes the refund a pure ratio with no
  re-conversion step. This is new persisted state, one field, on the burn;
  the false "no new persisted state" claim is removed from the
  requirement text and from proposal.md.
- Feel risk, flagged rather than resolved: refunding based on elapsed time
  rather than elapsed *distance* means a player who re-targets during the
  accelerating half of a burn (before the flip) gets back less than they
  might intuitively expect relative to how far they've actually
  travelled, since `coveredLength(tau)` is quadratic in τ during the
  accelerating half while the refund fraction is linear in
  `(flightDuration − τ)`. This is architecturally the cheapest and only
  closed-form-consistent answer available, but it is an open feel
  question — see Open Questions below.

### Decision: Refuel cost arithmetic rounds up, against the buyer; is rejected outright at zero; is overflow-safe
`goods-sale` pins purchase-adjacent arithmetic with three requirements
(rounding rule, reject-if-rounds-to-zero, overflow-safety), all in the
*seller's* favor (proceeds floor down). `fuel-purchase` inherited
`goods-sale`'s ownership, station-resolution, and idempotency doctrine at
authoring but not its arithmetic — an omission this change's own panel
review caught: a 0.05-ton refuel at 10 credits/ton costs 0.5 credits;
floored (mirroring `goods-sale`), that is 0 credits debited and 0.05 tons
credited, and `corporation-credits` forbids a zero-amount ledger entry —
so an implementer either appends a forbidden row or silently skips the
ledger, i.e. an unaudited free grant of fuel. The fix: refuel's cost
rounds **up** to the nearest whole credit — the buyer-adverse direction,
the mirror image of `goods-sale`'s seller-adverse floor, since here the
buyer (not a venue with limited supply) is the one who could otherwise
extract value from the rounding.
- **Correction to an earlier draft, caught by this change's own adversary
  review:** rounding UP a positive tonnage's cost against a strictly
  positive price can **never** itself produce zero whole credits
  (`ceil(tons × price) ≥ 1` for any `tons > 0`, `price > 0`) — this is the
  opposite situation from `goods-sale`'s floor-rounded proceeds, where a
  genuine dust sale really can round to zero. An earlier draft stated the
  reject-if-zero and overflow guards as if they were live gameplay paths a
  dust-sized request could trigger; they cannot be, once tonnage is
  already validated as positive and bounded by the fleet's free hold
  *before* cost is computed. Both guards are **misconfiguration guards**:
  the reject-if-zero guard fires only if `FuelParams.PricePerTon` is
  itself configured at or below zero, and the overflow guard fires only if
  that same constant is configured large enough that even a
  free-hold-bounded tonnage overflows the balance's integer type. Framing
  them as reachable gameplay paths invites an implementer who cannot
  produce a failing test to "fix" the rounding back to floor, silently
  reopening the free-fuel hole this Decision exists to close — stating
  them honestly as misconfiguration guards removes that incentive.
- Alternative considered: floor, like `goods-sale`. Rejected for the
  reason above — flooring is seller-adverse, which is correct when the
  *venue* sets a price against a *seller's* tonnage, but refuel has no
  venue-side quantity at risk; rounding must instead protect against the
  buyer minting value from the rounding direction.

### Decision: The fuel price constant is served to clients, never duplicated as a client-side constant
`FuelParams.PricePerTon` is served on the fleet's own existing read
endpoints (alongside its cargo, roster, and estimated-range fields),
mirroring how `fleet-movement` already serves an attached lane gate's
`laneId` on the same endpoints for a conceptually similar reason: one
value, read from the server, backs both the refuel offer's preview and the
settlement's charged cost, so the two can never diverge. An earlier draft
of this change's `board-view` delta required a client-side preview
"computed at the single global fuel price" without specifying where the
client obtains that value — leaving room for an implementer to hardcode a
duplicate constant in the frontend, which would silently drift from the
server's configured value the moment either side's constant changed. This
is now stated explicitly as a served field, not left implicit.

### Decision: Starting fuel is a configured constant, guarded by a sample test, granted via spawn healing with an atomic marker
Per `decisions.md`'s §0.3 finding: amount is not solved at spawn time
(that would couple the grant to `space`'s implementation and make it
non-deterministic across a tuning change). The guard is a generated-sample
invariant test in the spirit of `system-interior`'s size/tonnage guards —
if the constant fails the sample, the constant moves; that is a tuning
fix, not a spec change. The grant rides `corporation-spawn`'s existing
idempotent asset-healing pass, alongside the opening credit grant.
- **Corroborated by this change's own panel review (DBA):** neither the
  starting-fuel grant marker's atomicity, nor its exact anchor, was named
  precisely enough in an earlier draft — this is why an implementer would
  otherwise reach for `Fleet.UpdatedAt` (re-stamped by unrelated writes) as
  a proxy, a silent-corruption bug no formula-level test would catch. The
  anchor is explicitly **not** "current fuel equals zero" (which would
  re-grant forever to a hull that legitimately burned its tank dry —
  mirroring the existing credit-balance anti-pattern `corporation-spawn`
  already guards against) but a **named, create-if-absent document at
  `corporations/{corpId}/fuelGrants/{fleetId}`**, written in the same
  transaction that credits the fuel; its existence alone is the "already
  granted" signal, and that check-and-set is atomic by construction —
  mirroring the opening credit grant's own `"spawn:" + corpId`
  ledger-document id, a create-if-absent anchor, since
  `/v1/corporations/me` is explicitly exempt from the per-corporation write
  quota and concurrent healing calls are therefore cheap to trigger.
  `corporation-spawn`'s existing *Concurrent bootstrap reads for one
  account heal exactly once* scenario — which already enumerates the
  station, the ledger entry, and the balance as the three assets a
  concurrent double-healing must not duplicate — widens to name the
  starting-fuel grant as a fourth.

### Decision: `fuel-purchase` is a new capability, modelled on `goods-sale`
Ownership-404-first, station-resolved-from-own-system, and
idempotent-by-operation-key transfer directly from `goods-sale`. Deliberate
departures:
- **One global price constant**, not a per-region floor table or a
  venue-folded demand-entry list (`decisions.md`'s OQ-1 ruling — fuel is
  this economy's first sink; making it geography immediately couples it
  to region data for no gameplay reachable yet), served to clients per the
  Decision above rather than duplicated.
- **Unlimited station supply**, no station-side write (`decisions.md`'s
  OQ-5 ruling — a station that could run dry needs restock rules that
  belong with the siege gameplay deferred alongside combat).
- **Rounding against the buyer, never the seller's floor** — see the
  Decision above; the easiest place to get this backwards is a naive
  `goods-sale`-pattern reuse.
- **All-or-nothing fill**, never `goods-sale`'s partial fill. This is
  flagged explicitly because it is the easiest thing to get backwards: a
  naive reuse of `goods-sale`'s fold machinery would silently make a
  refuel partially fill, which is wrong for a purchase (the buyer, not a
  venue's limited supply, is the constraint).
- Fuel is not sellable back: `npc-market-demand`'s "Tradable Goods Are
  Exactly the Mine Resource Kinds" already excludes it (fuel is not a
  `system.ResourceKind`), closing the sell-the-fuel-you're-burning hole
  with no new rule. Confirmed at authoring rather than assumed.
- Ownership is enforced by `fuel-purchase`'s own "Refuel Requires Fleet
  Ownership, 404 Before Any Other Precondition" requirement, the same
  pattern `goods-sale` uses rather than widening `request-authorization`'s
  seam-consumption enumeration for a route this capability already guards
  itself.

## Risks / Trade-offs

- **Fuel bounds speed, not ultimate reachability, down to the
  acceleration floor.** A nearly-dry fleet can (almost) always crawl. This
  materially weakens the supply-line pressure this change exists to
  create relative to a naive, ceiling-priced accounting, and is the honest
  counterweight to "stranding is permanent." Stated here rather than
  smoothed over — see the acceleration-floor Decision above.
- **Stranding is permanent, not "pending rescue," and `decisions.md`'s
  framing said otherwise.** Mitigated only by the no-delta-v jump (a
  fleet dry at a gate can still travel) and, more than an earlier draft of
  this change accounted for, by the floor-crawling mitigation above — a
  fleet dry at a planet cannot reach a gate, but a fleet with even a
  little fuel left is rarely *actually* dry in the sense that matters.
  Accepted as a known gap; `add-cargo-transfer` is the fix, deliberately
  not built here.
- **A dry fleet drifting above the stop-in-place speed floor, with
  exactly zero fuel, can never stop — flagged for Travis by name, not
  smoothed over.** `decisions.md` frames stranding as "a setback rather
  than a death," but a fleet that cuts drive into a fast drift and then
  reaches exactly zero fuel before ever coasting below the speed floor
  cannot burn to null its velocity and never qualifies for the existing
  free below-floor conversion. In practice this fleet is unreachable and
  uncommandable — effectively dead, not merely stranded. The
  acceleration-floor correction above shrinks this population (a fleet
  with *any* fuel left can decelerate cheaply well before this applies)
  but does not eliminate it: exactly-zero-fuel-while-above-the-floor is
  still possible. The alternatives considered (free deceleration below
  some threshold; a floor-rate assist funded from nowhere) each invent
  exactly the soft wall `decisions.md` explicitly forecloses for the
  "enough fuel to get home" reserve question. This change accepts the
  current behaviour rather than quietly picking a side — see Open
  Questions.
- **`FuelParams.DeltaVPerTon = 5.0` is an unvalidated placeholder.** At
  2.5, a full 200-ton hold buys exactly the PoC's 500 Δv tank — maximum
  range means carrying zero ore, killing the range-vs-payload trade this
  change exists to create. At 5.0, half a hold buys the PoC tank and
  leaves half for cargo, which is the intended feel, but it is untested in
  play.
- **`Stop`'s pre-existing `defaultAccel`-vs-`DerivedAccelCeiling`
  inconsistency now has a price attached to it.** A stop burn's fuel cost
  does not vary with roster composition the way an ordinary burn's does.
  Flagged, not fixed, per the ruling.
- **The reachability warning's and the persistent indicator's N-solves
  cost** scales with a system's body count. Bounded (a system has a
  handful of stations/gates, never unbounded), but it is real added
  commit-time and read-time work, honestly sized in `tasks.md` rather than
  assumed free. The persistent indicator in particular is now evaluated
  on every read of an owning fleet, not only at commit — costed
  accordingly.
- **The hull-count-scaled-price-equals-roster-independent-range claim
  holds only for one hull class today.** A second hull class with a
  different per-class hold capacity would break the neutrality this
  change's guardrail argument depends on. See Open Questions.

## Migration Plan

None. Per the project's ground rules (solo toy, no live users, no
migration plans), the burn-commit affordability check and the new `fuel`
cargo field land outright with no dual-write, no feature flag, and no
backfill: a corporation without stored fuel simply reads as holding zero
until spawn healing (or a later session bootstrap) grants its starting
amount.

## Open Questions

- **`FuelParams.DeltaVPerTon = 5.0` is a placeholder** pending validation
  in play — the range-vs-payload trade it's meant to create needs to be
  felt, not just computed.
- **The cut-drive/re-target refund's feel** — the closed-form ratio
  applied to the stored debited cost is decided as the correct answer, but
  whether refunding linearly in elapsed time (rather than elapsed
  distance, which is quadratic in τ during the accelerating half) feels
  fair to a player who re-targets mid-burn is unvalidated.
- **A dry fleet drifting above the stop-in-place speed floor, at exactly
  zero fuel, can never stop — flagged explicitly for Travis.** This
  directly contradicts `decisions.md`'s framing of stranding as "a setback
  rather than a death." Softened but not closed by the acceleration-floor
  correction (see Risks). No side is picked here; it is recorded as a
  genuine, unresolved conflict between two decisions.
- **Fuel price scaling by hull count assumes one hull class.** A second
  hull class with a per-class hold capacity not proportional to hull count
  would break "maximum affordable range is roster-independent." Not a
  problem today; recorded against the day a second hull class is
  introduced.
- **Per-station or per-region fuel pricing** — deferred; this change ships
  a single global constant.
- **Quantity-limited station fuel** — deferred alongside the siege/combat
  gameplay that would give a restock rule meaning; this change ships
  unlimited station supply.
- **The missing cargo-transfer verb.** Stranding is permanent until
  `add-cargo-transfer` (or an equivalent) lands. `decisions.md` now states
  this plainly rather than resting on the "already exists as a verb" claim
  this change found to be false.
- **A live, advisory "fuel remaining under an active station-keeping
  hold" read** is out of scope here entirely — see
  `add-stationkeep-hold-verb`'s own design.md, since that whole surface is
  carved out of this change.
- **`ceil(tons × price) ≥ 1` holds for reals, but not for IEEE-754.** A
  hand-crafted, denormal `tons` value (e.g. `5e-324`) against a
  misconfigured sub-unit `FuelParams.PricePerTon` can underflow the
  `tons × price` product to `0.0` before the ceiling ever runs, and "Cost
  Arithmetic Rounds Against the Buyer, Is Overflow-Safe, and Is Never
  Zero" rejects only on `price ≤ 0`, not on a computed-zero cost. Not a
  live gameplay path — it requires both a hand-crafted denormal tonnage
  and a misconfigured price — and the failure mode is a forbidden
  zero-amount ledger entry (caught by `corporation-credits`'s existing
  reject-zero-entry rule), never free fuel at any reachable scale.
  Recorded rather than fixed here.
