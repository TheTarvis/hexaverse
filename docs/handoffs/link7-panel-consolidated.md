<!-- reduction-receipt: volt_reduction_v1
# Written by harness/check-quote-fidelity.py --write-header; do not hand-edit.
# Every source below is pinned by content hash. If one of them changes, this
# reduction is a claim about a file that has moved on: re-verify it with
# --verify-header and re-reduce before anything downstream trusts it.
source=docs/handoffs/link7-rulings.md sha256=8a5015511f0092eed03acffe1234b18275f6e8f71832c7dd801da49cc89d27ac bytes=10120 lines=160
authority=the orchestrator retains adjudication; this file is evidence, not a ruling
readback=sed -n '<start>,<end>p' <source> — each quote marker carries its line
-->
# Link 7 — consolidated panel findings + orchestrator rulings

Panel: architect (BLOCKED, 4 blockers + 5 high), security (BLOCKED, 1 blocker + 3 major
+ 4 minor), DBA, UX (BLOCKED). Reliability skipped — no new external dependencies.

**All findings ACCEPTED unless a ruling says otherwise.** Two rulings below reverse or
correct earlier orchestrator rulings; they are marked.

---

## R0 (BLOCKER, architect B1) — Δv RISES with commanded acceleration. Two requirements have the direction backwards.

From `backend/space/burn.go`: `FlightSeconds = 2·√(L/a)` and `DeltaV = a · flightSeconds`,
so **`Δv = 2·√(a·L)`** — monotonically *increasing* in commanded acceleration. Inverting,
`L = Δv²/(4a)`, maximised at **minimum** `a`.

This is exactly what `decisions.md` already says ("silent running is cheap in fuel and
expensive in time"), and the change gets it backwards twice:

- **`Fleet Read Reports an Estimated Maximum Range From Current Fuel`** computes range "at
  the fleet's acceleration ceiling" — which yields the fleet's **shortest** affordable
  reach and labels it the maximum. The correct denominator is
  `disclosure.MinCommandedAccel = 1.0` (`backend/disclosure/params.go:53`).
- **The stranding warning** never states what acceleration its candidate burns are priced
  at. Priced at the ceiling, it fires against fleets that could reach a station easily by
  crawling — a false alarm on the one requirement whose entire value is credibility.

Apply the architect's paste-ready replacements for both, including the new scenario
*Estimated range is computed at the silent-running floor, not the acceleration ceiling*.

**And state the consequence the change currently hides, in `## Risks / Trade-offs`:**
fuel bounds *speed*, not reachability, down to the acceleration floor. A nearly-dry fleet
can always crawl. That materially weakens the supply-line pressure this change exists to
create, and it is the honest counterweight to "stranding is permanent."

**This also softens OQ-8** (the dry drifting fleet that cannot stop): a fleet with any
fuel at all can burn at `MinCommandedAccel` and shed velocity far more cheaply than a
ceiling-priced stop implies. The conflict with `decisions.md`'s "setback, not death" is
real but the genuinely-dead population is much smaller than my ruling assumed. Say so in
the Risks entry — do not delete the flag.

## R1 (BLOCKER, architect B2 + DBA) — The upkeep requirement folds FUEL, making `Fleet.Cargo` time-dependent. Store the dry instant on the park instead.

`fleet.FreeHold` (`backend/fleet/roster.go:157`) takes no time argument and is consumed by
`mine/service.go:208` (commit check), **`mine/resolver.go:76` (`freeHoldAtResolve`, the
resolve clamp)**, `fleet/handler.go:335`, and `fuel-purchase`'s own free-hold precondition.
Time-dependent `cargo["fuel"]` makes all four read a stale value or forces a world time
through every call site and its callers.

It is not even well-defined as written: there is no stored hold-start time, and any other
write to `cargo.fuel` during a hold (a refuel at the body you are holding beside, a mine
credit) moves the baseline without moving the epoch, so the fleet retroactively un-drains.
That is accumulated-state dependence wearing a closed-form costume — the one thing
`space-kinematics` forbids outright.

**Correct design (take the architect's paste-ready Decision verbatim):** compute the dry
instant ONCE at `hold` and store it on the `space.Park`; `StateAt` folds a stationkeep park
past its dry instant into `ReleaseStationkeep`, exactly mirroring "a burn past its arrival
IS its settled park." Reads stay pure; `cargo.fuel` stays a stored scalar.

**Consequence the change denies and must state: `space-kinematics` TAKES A DELTA.**
`space.Park` gains a hold epoch and a dry instant; `EncodePark`/`DecodePark` widen by one
key. Both `proposal.md` and `design.md` currently claim `space-kinematics` is untouched.

**DBA's corroboration, which must be written down:** neither the hold-start time nor the
starting-fuel grant marker is named as persisted state anywhere. An implementer reaches for
`Fleet.UpdatedAt`, which unrelated writes re-stamp — silent economic corruption that no
task's test would catch, because the tests check the formula rather than the anchor's
stability. **Name both fields explicitly.**

## R2 (architect H2 + R1) — CARVE THE STATION-KEEP HALF OUT ENTIRELY, verb AND currency together

**This modifies my §0.1 ruling, and preserves its principle.** §0.1 said "ship the verb
with the currency, or ship neither," to avoid a sixth build-ahead-of-consumer. R1 shows the
station-keep half is the only part of this change needing a `space-kinematics` delta, a
codec widening, and a new fold, while everything else is coherent and deployable without it.

**Ruling: carve out `add-stationkeep-hold-verb`, sequenced immediately after link 7, taking
BOTH the `hold`/`release` verbs AND the fuel-denominated upkeep with force-demotion.** They
still ship together — just one link later. §0.1's principle is honoured exactly; only the
timing moves. Shipping the currency on a fold that destabilizes `mine`'s resolve clamp would
be worse than shipping both next.

Moves out of link 7: §3's tasks, the `hold`/`release` scenarios in *Fleet Command
Endpoints*, the `request-authorization` endpoint-list widening for those two verbs, task
9.5, the whole `space-kinematics` delta, architect H4 (attachment survives hold/release/
demotion), and security B2 (leaving a hold must settle its accrual). Add the new change to
chain.md's downstream list.

Link 7 keeps: fuel as cargo, burn pricing and the affordability gate, the refund, the
warning, `fuel-purchase`, spawn starting fuel, and the client surface.

## R3 (BLOCKER, architect B3 + security B6) — The refund's inputs are not stored; the "no new persisted state" claim is false

`space.Burn` is `{Origin, Target, Intercept, Curve, Length, DepartMs, ArriveMs, Accel,
InsertionPhase}`. Hull count is not on it, and the requirement's own scenario forbids
re-reading the roster at discard.

**Take the architect's fix: store the originally-debited cost in TONS on the burn record**
— same information as the hull count, one number, and it makes the refund a pure ratio
`(flightDuration − τ)/flightDuration` with no re-conversion. Delete the "requires no new
persisted state" sentence from the requirement body and from `proposal.md`.

## R4 (BLOCKER, architect B4) — Debit-at-commit is not airtight, and `action-dispatch` DOES take a delta

`action.Commit`'s transaction (`backend/action/dao.go:163`) reads the actor doc only to
check the channel slot; `CommitSpec.ActorState` is a **static map computed before the
transaction opened**. Burn-vs-burn is serialized by the slot claim, but **burn-vs-refuel is
not** — refuel is instant and claims no slot, so two mutations each write an absolute
post-mutation value and one update is lost. Same for burn-vs-mine-resolve.

**Ruling: take the `action-dispatch` delta** — extend `CommitSpec` with a transaction-scoped
`ActorState` producer so the affordability check and the debit both evaluate against a
transactional re-read. A lost update on fuel is silent economic corruption of the resource
this whole change exists to make scarce; accepting the race to avoid a delta is the wrong
trade even for a solo toy.

Apply the architect's paste-ready sentence to the affordability requirement. Note the irony
for the record: my rulings told the writer to record `action-dispatch`'s non-delta
explicitly because link 4 predicted one and was wrong. The writer verified the two things
link 4 got wrong (param shapes, channels) and missed the third.

## R5 (BLOCKER, security B1 + architect H5, merged) — Refuel cost arithmetic is unspecified: dust refuels mint free fuel

`goods-sale` pins purchase-adjacent arithmetic with three requirements (rounding rule,
reject-if-rounds-to-zero, overflow-safety). `fuel-purchase` inherited its ownership,
station-resolution and idempotency doctrine and **none** of its arithmetic. A 0.05 t buy at
10 credits/ton costs 0.5 credits; floored, that is 0 credits debited and 0.05 t credited —
and `corporation-credits` forbids a zero-amount ledger entry, so the implementer either
appends a forbidden row or silently skips the ledger, i.e. an unaudited free grant.

Take security's ADDED requirement *Cost Arithmetic Rounds Against the Buyer, Is
Overflow-Safe, and Is Never Zero* with all five scenarios, verbatim. Rounding is **up**
(the buyer-adverse direction, mirroring `goods-sale`'s seller-adverse floor).

Also take architect H5's second half: **the price constant is served to clients on an
existing read, never mirrored as a client-side constant**, so the preview and the charged
cost derive from one value. `board-view`'s *Refuel Offer* currently requires a client-side
preview computed from a duplicated constant.

## R6 (MAJOR, security B3 + DBA) — Concurrent healing double-grants the starting fuel

The anti-faucet anchor is correctly NOT `fuel == 0`, but the marker check is not specified
as atomic — unlike the opening credit grant, whose `"spawn:" + corpId` ledger document id
is a create-if-absent, atomic by construction. `/v1/corporations/me` is explicitly exempt
from the per-corporation write quota, so concurrency is cheap.

Take security's body sentence AND both scenarios, including the second delta widening
`corporation-spawn`'s existing *Concurrent bootstrap reads for one account heal exactly
once* — that scenario enumerates station, ledger entry and balance, and this change adds a
fourth healed asset without widening it.

## R7 (MAJOR, security B4) — `request-authorization`'s two sell-scoped requirements must name `refuel`

The per-corporation write quota names `POST /v1/fleets/:fleetId/sell` "and any future route
that appends a trade-ledger entry" — refuel qualifies under the general clause, but an
implementer wiring middleware follows the enumeration, and no task covers it. Left unwired,
refuel is bounded only by the per-IP tier whose own spec documents it as spoofable — the
amplifier that turns R5 from annoying into unbounded. Same for *The Sell Endpoint Ignores a
Client-Supplied Corporation Id*.

Take both MODIFIED requirements verbatim, plus the quota task and the deny-path test.

## R8 (BLOCKER, UX) — Stranding is discoverable ONLY at the instant it is created

The sole signal is a one-shot toast at commit. A player who misses it, or opens the roster
later, can learn the fleet is finished only by attempting burns and watching them fail.
Given `decisions.md` now records stranding as **permanent**, this is the harshest
irreversible state in the game, found by inference.

The fix costs no new math — the reachability verdict is already computed at commit and
thrown away. Take UX's requirement and scenarios: a persistent stranded indication on the
fleet's own read and its roster row, distinguishable from "idle", and rejection copy that
distinguishes "you cannot afford this burn" from "you can never afford any burn again."

**Note the interaction with R0:** because a fleet can always crawl at the acceleration
floor, genuine permanent stranding is rarer than assumed — so the indicator must be
computed at the floor too, or it will cry wolf.

## R9 (architect H3) — Hull-count scaling: the guardrail reasoning is right, the stated rationale is wrong

**This corrects my OQ-7 ruling's justification, not its conclusion.** Hull count is constant
across a burn, so the mass-independence guardrail genuinely is not violated — that stands.
But the goal I stated ("capacity and price scale by the identical factor, so range is
roster-independent") is false: `DerivedCapacity` is the **sum of per-class hold capacities**,
not hull count. With one hull class today they are proportional and the claim holds; with a
second class, ten small hulls pay 10× while carrying less fuel than one freighter paying 1×,
inverting the intended neutrality.

Take the architect's replacement clause, and record scaling by derived capacity rather than
hull count as an Open Question against the introduction of a second hull class.

## Accept as written, no elaboration needed
- **security B5** — add `refuel` to the seam's enumerated endpoint list, or cite
  `fuel-purchase`'s own ownership requirement as `goods-sale` is cited.
- **security B7** — one scenario pinning refuel behind the reconciliation divergence halt.
  It is the first debit; a sign error on a debit is a credit mint.
- **security B8 / architect M2** — bound the warning's candidate set to stations and lane
  gates explicitly, and size it honestly as N × `SolveRounds`, not N.
- **architect H1** — `design.md` must actually do its job: the two-phase composition for
  `fuel-purchase` (`PrepareCargoCreditInTx` is NEW — only a debit half exists at
  `cargo_tx.go:52`), the all-prepares-before-all-applies ordering, `Apply` write semantics
  (`tx.Update` on the whole cargo field vs `MergeAll`), the package name (`fuel-purchase`
  the capability vs `backend/refuel/` the package — pick one and say why), and the note
  that `PrepareCreditInTx` already rejects overdraw so *Refuel Is All-Or-Nothing* is
  mostly free rather than new machinery.
- **architect M3** — reserve `fuel` from the `system.ResourceKind` namespace; a resource
  kind of that name SHALL fail generation.
- **architect L1** — default the refuel tonnage to `min(freeHold, balance / price)` rather
  than full free hold, so the default action is not usually a rejection.

## Correction to my own rulings file (architect M1)
`link7-rulings.md` claims "seven requirement headers overlap" with link 6. The architect
diffed them: **zero overlap.** Link 6 touches *Mine Offer*, *Sell Offer*, and one ADDED
`fleet-movement` requirement; link 7 touches *Fleet Cargo Pool*, *Fleet Command Endpoints*,
*Spawn Asset Healing*, *Append-Only Trade Ledger*, *Corporation Resolution Seam*, *Credit
Balance Readout*. The sequencing conclusion still holds — link 7 is written against link 6's
ADDED attachment-host requirement and mirrors its post-archive `goods-sale` docked doctrine
— but it is a **semantic** dependency, not a mechanical archive conflict. Correct the
proposal so nobody plans around a merge hazard that does not exist.
