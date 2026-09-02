## Context

`build-production-space-view`'s panel review split it in two (H7). This is the
first half: the wire and solve surface the renderer half consumes. Everything
here already exists as computed, in-memory, or persisted state in `backend/`;
none of it reaches a client.

- `system.Feature.Space` is a `*space.Orbit` — decoded on read from the
  persisted `spaceOrbit` map, `firestore:"-"` on the DTO path, serialized
  nowhere. The interior read's `fogFeatureDTO` serves the body's *resolved*
  `Vec3` position (`json:"space"`) but not the elements that produced it, so a
  client can draw a body only where it was at the moment of the read.
- `system.gateOrbit(from, to, extent)` derives a lane gate's `space.Orbit` at
  body-table construction (`bodies.go:235`) and keeps it internal. `LaneGate`
  serves `space` and `size` but no elements.
- `space.StationKeepRate(bodies, bodyId)` has zero production callers today and
  appears on no DTO.
- `space.SolveBurn` is reachable only through `fleet.OrderTo`, which commits.

Two facts drove most of the decisions below. First, the interior DTO's `orbit`
key is **already taken** by `system.Orbit` — the lattice orbit
(`{ring, angle0, period, dir}`) — and its `space` key is already taken by the
resolved position. Second, `space-kinematics`'s sole-authority requirement
forbids a client from re-deriving a flight time, arrival, intercept, curve
length, delta-v price, settled park, or visibility answer; every gap this
change closes is a gap where the shortest client-side path is a violation.

## Goals / Non-Goals

- Goal: put every value `build-production-space-view` needs on the wire, so the
  renderer half contains no kinematics.
- Goal: stay **purely additive**, so the split creates no coexistence period,
  no feature flag, and no migration. Field removal belongs to the change that
  stops reading the fields.
- Goal: be verifiable before either half is implemented — an SDET writes the
  failing wire/preview contract suite against this document alone.
- Non-goal: any frontend code. Nothing calls any of this until
  `build-production-space-view`.
- Non-goal: any change to `backend/space`. It is read from, never edited.
- Non-goal: a TypeScript kinematics mirror. Rejected with its cost measured in
  `build-production-space-view`'s design.md; the preview endpoint exists
  precisely so that rejection stays affordable.

## Decisions

### Decision 1: The continuous element set ships under a new key, `orbitElements`

**Taken.** Every non-star body and every lane-gate body carries
`orbitElements: {parentId, radius, periodMs, phase, inclination, node}`. The
lattice `orbit` keeps its lattice meaning and its lattice shape.

**Alternatives considered.**

- *Serve the element set as `orbit`, retyping the existing key.* Rejected.
  JSON is untyped on the wire: a consumer, a recorded fixture, or a test
  written against the lattice `orbit` would read an object with none of the
  fields it expects and get `undefined` — not an error — for every one. The two
  objects share no field name, so nothing would ever throw; the failure mode is
  a silently wrong render or a silently passing assertion. A distinct key makes
  every stale reader fail at absence, loudly, at the first field access.
- *Drop the lattice `orbit`/`parentId`/`fixed` here and reuse `orbit`.*
  Rejected. That is a removal, not an addition, and it breaks the property that
  makes the split safe. It would also break the live lattice board — which is
  still the only playable view when this change lands — turning a two-change
  sequence into a migration with a coexistence window.
- *Nest the elements under the existing `space` key.* Rejected for the same
  reason as the first alternative: `space` already carries the resolved `Vec3`.
- *Rename `orbitElements` to `orbit` in the follow-up change, once the lattice
  key is gone.* Rejected as churn. It would make the key's meaning depend on
  which change had archived, for no gain; `orbitElements` is the clearer name
  regardless, since the response also carries a resolved position.

**Consequence for the follow-up:** `build-production-space-view` deletes the
lattice `orbit`, `parentId`, `fixed`, `footprint`, `band`, `live`, per-feature
`asOf`, and a lane gate's `cell`, and leaves `orbitElements` alone.

### Decision 2: The preview settles a due arrival first, and "no cumulative effect" is narrowed to say so

**Taken.** The preview runs the same fold-first settlement seam
(`fleet.settleIfDue`) every other door onto a fleet runs, then solves from the
settled state. The no-effect guarantee is stated as: no action, no channel
claim, no fuel debit, no stored burn, and — for a fleet with nothing due —
byte-identical stored state across an arbitrary number of previews.

**Why the original wording was wrong.** An earlier draft said a preview has "no
cumulative effect," full stop. `fleet.OrderTo` opens with `settleIfDue`, which
calls `resolveDue` and **writes**. So does the single-fleet `Get`. A preview
that claimed to write nothing would have to skip settlement.

**Alternatives considered.**

- *Skip settlement; solve from the stored state.* Rejected, and this is the
  case the parity guarantee exists for. A fleet whose burn arrived thirty
  seconds ago is stored mid-burn; unsettled, its departure position is the
  burn's intercept-at-`t` rather than its settled park, and the commit that
  follows the preview — which does settle — solves from a different departure
  state. The preview would be wrong precisely when the player is doing the most
  common thing in the game: arriving somewhere and immediately ordering the
  next leg.
- *Have the client send the settled state and keep the endpoint pure.*
  Rejected outright: computing the settled park is `space.StateAt`, explicitly
  on the sole-authority forbidden list.
- *Settle in a read-only fold without persisting, and let the next real command
  persist it.* Rejected. It duplicates the settlement predicate in a second
  shape — the exact "reimplemented is-it-due predicate" `ListForCorp`'s own
  comment records avoiding — and it means the preview and the commit run
  different code, which is what the parity scenario is asserting against.

### Decision 3: The star is rejected by the curve's clearance guard, never by a destination check

**Taken.** The preview attempts the solve and lets
`space.BuildCurve`'s endpoint-clearance guard reject a star target, with the
same observable reason a commit produces.

**Why.** `backend/fleet/star_destination_test.go` exists specifically to assert
that `fleet.ErrCoreDestination` and its destination-identity special case stay
deleted, and that the observable rejection traces to
`space.ErrEndpointInsideClearance`. An earlier draft specified rejection
"before any solve is attempted," which can only be implemented by reintroducing
the identity check that test forbids — a spec that ships red on an existing,
deliberate regression test.

**Alternative considered.** *Short-circuit for latency, since a star target is
cheap to detect.* Rejected: the solve that gets short-circuited is microseconds
of pure arithmetic, and the clearance guard also rejects targets that are not
the star but sit inside its clearance radius — a case an identity check misses
entirely, and the case in which a player most needs the rejection to be
consistent between preview and commit.

### Decision 4: The upkeep rate is served in fuel tons per second, owner-only

**Taken.** The fleet read's roster surface carries the station-keeping upkeep
rate already converted to tons per second, present for an `orbit` or
`stationkeep` park and absent otherwise.

**Why a wire field at all.** The hold/release control needs a live drain
readout. With no wire source, and with Decision 1 handing the client
`orbitElements.periodMs` and `orbitElements.radius`, the shortest path to that
readout is four lines of client-side `omega² × radius` — a mirror of
`space.StationKeepRate`, complete with its `StationKeepFloor` clamp and its
non-positive-period branch. The check that is supposed to catch that scans
`frontend/lib/space` only and compares names; a helper in
`frontend/components/space/` called `holdDrain` passes every gate.

**Alternatives considered.**

- *Serve the delta-v rate and let the client divide by `FuelParams.DeltaVPerTon`.*
  Rejected. `DeltaVPerTon` is not on the wire, so it would have to be
  duplicated as a client constant, and the conversion itself is rule-bearing —
  the same conversion `add-stationkeep-hold-verb` records being got backwards
  once already, at a 5× error.
- *Serve the stored dry instant instead of a rate.* Rejected as insufficient
  rather than wrong: a dry instant answers "when does this end," not "what is
  this costing," and the control's readout is the second question. It also
  exists only while a hold is open, so an orbiting fleet would have nothing to
  show for "what would holding cost?"
- *Serve both.* Deferred rather than rejected. The dry instant is the natural
  companion field, but `docked-fleet-actions` deliberately specifies no
  client-side prediction of force-demotion, so nothing consumes it yet, and
  this change does not ship an unread field.

### Decision 5: Which fleet read the space view drives off — `?mine=true`, not `?systemId=`

**Taken, and recorded here because it constrains this change's contract suite.**
The renderer half reads the requester's own fleets through
`GET /v1/fleets?mine=true` (`fleet.ListForCorp`) and filters to the open system
client-side.

**Why.** `ListInSystem` (`?systemId=`) is a bare
`dao.ListBySystem` — it does **not** settle a due arrival. `ListForCorp` does,
per-system, through the shared `settleIfDue` seam. A fleet that arrived a
moment ago would read as still-burning with an empty `attachedTo` on the canvas
while the roster — which already uses `?mine=true` — shows it docked: two
panels on one screen disagreeing about one fleet, with the docked-fleet
commands unreachable on the panel that matters.

**Alternatives considered.**

- *Make `?systemId=` settle too.* Rejected. That read serves foreign fleets as
  contacts; settling another corporation's fleets as a side effect of a
  stranger's read is write amplification with an ownership smell, and it would
  make an unauthenticated-adjacent read path perform writes.
- *Read both and merge.* Rejected: two sources of truth for the same fleet on
  one screen is the defect, not the fix.

### Decision 6: Take the `maxFuelTons` cap — the reject half of the quote-lock, declared

**Taken, overriding an earlier draft of `build-production-space-view`'s
design.md that took the display half of the binding quote-lock ruling and
silently dropped the reject half.** The commit accepts an optional
`maxFuelTons`; a solved cost strictly above it is rejected with its own named
reason, carrying the true cost.

**The dropped draft's rationale was wrong and does not survive.** It argued that
"a burn commit always succeeds against the best available solve — there is no
'wrong' price to reject the way a concurrently-moved demand entry is." Both
halves fail:

- **Fuel is finite.** The player is spending a stored, mass-carrying commodity
  that must also get them home. A quote of 4 tons that settles at 11 is
  materially wrong even though both are payable.
- **The target moves.** Between the preview and the commit, the target body
  advances along its orbit and the fleet advances along its own state. The
  solved cost at commit is a different number from the quoted one by
  construction — this is a moving-quote problem of exactly the shape
  `goods-sale`'s *Sell Commit* already solved with `expectedUnitPrice`.
- **`ErrInsufficientFuel` does not cover it.** It fires only on can't-pay, never
  on paid-more-than-agreed. A fleet with a full tank has no protection at all
  without this cap.

**Alternatives considered.**

- *Display-only drift notice, no reject (the dropped draft's position).*
  Rejected on the above. Retained as the **companion** behaviour, not the
  substitute: `build-production-space-view` still surfaces both figures when
  they differ, for the uncapped and the failed-preview paths.
- *Make the cap mandatory.* Rejected. It would break every existing caller and
  every existing test, and it would make the commit unreachable whenever a
  preview failed — turning a transient network error into an inability to fly.
- *Server-side quote token with a TTL.* Rejected as a larger mechanism for the
  same guarantee: it needs a store, an expiry policy, and a replay rule, and it
  buys nothing over a caller-supplied ceiling in a game where the caller already
  knows the number it agreed to.
- *A relative tolerance (`maxFuelOveragePercent`).* Rejected: a percentage is a
  second rounding rule to pin cross-stack for no expressive gain — a client that
  wants 10% slack sends `quoted × 1.1` as an absolute cap.

**Rejection on strictly-greater, not on greater-or-equal**, so a client that
sends back exactly the previewed cost as its cap is not rejected by its own
quote.

### Decision 7: The world-time scale rides the wire with the world time

**Taken.** The interior read and the fleet read serve the simulation clock's
**scale** (world-milliseconds advanced per wall-millisecond) alongside the
`worldTime` they already serve.

**Why it needed deciding, and why here.** `build-production-space-view`'s whole
animation model — bodies, gates, parks, drifts, and a burning fleet's Bézier
parameter `u = (t − departMs)/(arriveMs − departMs)` — is a function of *live
world time*, extrapolated on the client between polls. The client's existing
clock (`frontend/hooks/use-world-time.ts`) anchors a server reading to the wall
clock and projects forward at a `scale` option that **defaults to 1**, with a
comment reading "a future time-warped world would ship its scale in the read
and pass it here." That world is not hypothetical: `config.ServiceConfig.
WorldTimeScale` is a real server flag (`-WORLD_TIME_SCALE`), documented as the
knob that makes dev and test worlds run fast, and `common.WorldTime` already
exposes `Scale()`. It happens to be 1 everywhere today only because nothing
sets it.

Under the lattice this was nearly harmless: positions quantized to a cell, so a
mis-scaled clock produced a body that stepped late. In continuous space a
mis-scaled clock makes every orbit and every burn mark visibly wrong, drifting
further from truth the longer between polls — and the burn mark's `u` would
reach 1 at the wrong wall instant, so a ship would appear to arrive early or
never. It is a one-float addition on a read that already carries `worldTime`,
and this is the additive change; discovering it in the renderer half means
either a wire change in a change that promised none, or a hardcoded `1` nobody
revisits.

**Alternatives considered.**

- *Leave it at a hardcoded client `1` and record the invariant.* Rejected as
  the cheaper-looking option that costs more later: it makes `WORLD_TIME_SCALE`
  a flag that silently corrupts the only playable view, with no failing test
  anywhere, which is this chain's catalogued failure shape.
- *Derive the scale client-side from two successive readings.* Rejected: it is
  a rule-bearing value inferred from noisy samples, and it is wrong for exactly
  as long as it takes to collect the second sample — the first frames after
  every navigation.
- *Serve it on a separate `GET /v1/world-clock`.* Rejected: a third read on a
  view that already fans in two, for one number that every existing read
  already has in hand at serialization time.

### Decision 8: Do not add the non-regression scenarios the successor must delete

**Taken, and it constrains this change's `system-interior` delta text.** The
lattice non-regression assertions this change wants — that `orbit` still means
the lattice orbit, that `footprint`/`band`/`live`/`cell` are untouched — belong
in this change's **contract suite** (tasks 1.2, 2.4), not as new `#### Scenario:`
blocks on *Interior Read Endpoint*.

**Why, measured rather than argued — and the measurement corrected.** An
earlier draft of this decision claimed `openspec validate --strict` rejects a
MODIFIED block that omits a scenario the current spec carries. **That is
false**, and it was verified false: with this change archived, `openspec
validate build-production-space-view --strict` reports `Change
'build-production-space-view' is valid` and exits 0. The gate is the
**archiver**, not the validator. Rehearsed on a scratch copy — archive
`add-stationkeep-hold-verb`, then this change, then archive
`build-production-space-view` — the archive aborts with

    system-interior MODIFIED failed for header "### Requirement: Interior Read
    Endpoint" - current spec contains scenario(s) not present in the modified
    block: "Pre-existing wire fields are unchanged", "The lattice orbit key
    keeps its lattice meaning". Refresh the change spec before archiving to
    avoid dropping scenarios.
    Aborted. No files were changed.

The conclusion is unchanged and the direction of the error is the safe one —
it fails loudly and writes nothing, rather than dropping the scenarios
silently. But it fails **at archive time**, after review and after
implementation, which is the expensive moment to discover it. So every
non-regression scenario this change adds becomes a scenario the very next
change is **forbidden** to drop by a MODIFIED delta. One of those two
(*Pre-existing wire fields are unchanged*) is already live and cannot be
avoided; the other (*The lattice orbit key keeps its lattice meaning*) is one
this change would create purely to have the successor destroy it, one change
later, at the cost of forcing a heavier retirement mechanic.

**Alternatives considered.**

- *Keep both scenarios and let the successor retire the requirement.* This is
  what the successor now does regardless (its design.md Decision 10 — a
  REMOVED + re-ADDED pair, not a rename), because the pre-existing scenario
  forces it. Dropping this change's own added scenario does not remove that
  need — it only stops making it worse, and keeps this change's delta honest
  about what is a durable behavioural rule (the element set is served; the star
  carries none) versus what is a one-change transition guard.

**Applied.** The scenario *The lattice orbit key keeps its lattice meaning* is
**not** in this change's `system-interior` delta. Its assertion is carried by
`tasks.md` 1.2 as a contract test and by the requirement prose that names the
key collision, which is the durable half.
- *Assert the non-regression in the requirement prose without a scenario.*
  Taken for the prose that names the key collision, which is a durable rule
  about what `orbit` and `orbitElements` mean. The *scenario* is the part that
  becomes a liability.

## Risks / Trade-offs

- **This change is dead code on arrival.** Nothing calls the preview endpoint,
  reads `orbitElements`, or renders the upkeep rate until
  `build-production-space-view` lands. The chain's catalogued signature failure
  is exactly this — built, unit-tested, never called, eight times over. The
  mitigation is that the two changes are one review's output with a named
  successor, and that `build-production-space-view`'s tasks call each of these
  three surfaces explicitly; the risk is real and is accepted for the SDET
  ordering benefit the split buys.
- **The preview endpoint is not the cheap pure computation it looks like.**
  One preview costs: a fleet read, a `settleIfDue` pass (a write when an
  arrival is due), a **body-table read** to resolve the target and the
  departure state, one `space.SolveBurn`, and then the stranding evaluation —
  which `decisions.md`'s 2026-09-02 correction records as an **N-solve scan**,
  one `SolveBurn` per candidate station and lane-gate body in the destination
  system, N bounded by that system's body count. `build-production-space-view`
  requests a preview on every selection change *and* refreshes it on a timer
  while a selection is held, per acting fleet, per player. The cost model is
  recorded here so the refresh interval that change leaves open is chosen
  against a real number rather than an assumed one, and so a future
  optimization (memoize the stranding scan across refreshes of an unchanged
  selection; recompute it only when the fleet's fuel or system changes) is a
  known lever rather than a rediscovery.
- **Response size grows.** Six extra numbers per body, for a system with roughly
  five to seven planets, their moons, belts, a station, and a gate per lane. On
  the order of a kilobyte; measured against saving a read per rendered frame,
  which is the alternative.
- **`orbitElements` and the lattice `orbit` coexist for one change.** Deliberate
  and bounded: exactly one change, with the removal already specified in the
  successor. A reader of the DTO in that window sees two positional systems, and
  the comment on the DTO says which is dying.
- **A quoted cap can reject a commit the player wanted.** Mitigated by making it
  opt-in, by rejecting only on strictly-greater, and by returning the true cost
  so the client can re-quote in flow rather than bouncing the player out.

- **The world-clock scale is served before anything varies it.** `scale` is 1
  on every world today, so the field ships correct-and-inert. That is the
  point: the alternative is a client that hardcodes 1, and a
  `WORLD_TIME_SCALE` flag that then silently corrupts the only playable view
  with no failing test anywhere (Decision 7).

## Migration Plan

None. Nothing is removed, nothing is renamed, no stored data changes shape, and
no existing caller sends a field it did not send before. Every addition is a new
key or a new route.

Sequencing is the only ordering constraint: archive after `add-fuel-as-cargo`
and `add-stationkeep-hold-verb` (this change's `fleet-movement` MODIFIED body is
authored against their post-archive text, and cites requirements both of them
introduce), and before `build-production-space-view`.

## Open Questions

- **The preview's refresh cadence** is the client's to choose and is specified
  qualitatively in `build-production-space-view`, not here. What is unresolved
  is whether a busy system's preview traffic warrants a server-side rate limit
  on `/orders/preview`. Note that an earlier draft of this line called it "a
  pure-computation endpoint with no write in the common path"; per the cost
  model in Risks above, it is neither — it reads the body table, may write a
  settlement, and runs an N-solve stranding scan. Nothing in *this* change
  depends on the answer, but the sibling change's refresh cadence does.
- **Whether the dry instant joins the upkeep rate on the wire** (Decision 4's
  deferred half), which depends on whether a "dry in 4:12" readout is wanted
  once the hold control is in a player's hands.
