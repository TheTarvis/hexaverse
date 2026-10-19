> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Continuous-space pivot — decisions log

Running record of the open questions in `README.md` as they get settled, so
that the changes downstream of the pivot inherit answers rather than
rediscovering them. Each entry names the date, the decision, and what it
forecloses.

Decisions that bear on a capability already specced are also written into
that change; this file is the index and the home for the ones that have no
change yet.

---

## 2026-08-27 — Disclosure model

Settled in full and specced in `openspec/changes/add-proximity-disclosure/`.
Summarized here only so the list reads in one place.

- **No fog model.** Live visibility is passive proximity plus going loud on
  burn. No monotonic tier ladder, no per-feature memory, nothing carried
  forward on the live path.
- **Live disclosure persists nothing; the sighting pile is the deliberate
  exception.** The narrow rule is *no stored record may be consulted to
  decide live disclosure* — the pile is readable, sellable, and inert.
- **Don't round to fix float predicates.** The shipped `backend/space` is
  bit-reproducible across build targets; rounding a result would relocate
  the knife edge onto the rounding boundary rather than remove it.
  Comparisons are squared and inclusive; the real hazard is path dependence,
  answered by reading every position through the canonical entry point.
- **Plume scaling keeps commanded acceleration** (`k × aggregate drive
  output × commanded accel`, floored), because dropping it in favour of
  engine class alone would delete silent running for no determinism gain —
  commanded accel is already a stored field on the burn.
- **Identity gating starts anonymous.** Loosening is additive later;
  tightening is an audit of everything that could leak identity anyway.
- **Masking is in.** Docked ships register only as their host, chains
  resolve transitively to the outermost host, lighting a drive breaks
  masking, and the focused scan is the counter.

## 2026-08-27 — A fleet is one position; hulls are its composition

**Decision.** The fleet is the unit of position and motion — one position,
one velocity, one burn, one plume. Hulls are real objects inside it, the
unit of composition and accounting: cargo, combat strength, losses,
transfers between fleets. Docking attaches a *fleet* to a host, so "dock to
a carrier" and "dock to a body" are the same operation, and a carrier is
just a fleet whose hulls are carrier-class.

**Why.** Full per-hull positioning costs N× the position evaluations,
disclosure predicates, and stored state, and makes commanding a large force
miserable. Fleet-as-atom with no hulls underneath is cheaper still but makes
carriers incoherent and leaves mixed-hull signature undefined — both things
the README wants. This is the middle that keeps masking chains working and
gives plume a well-defined input.

**Forecloses.** A single ship peeling off unnoticed; you split the fleet
first, and splitting is a verb worth having regardless. Mixed fleets move at
their weakest engine.

**Consequences already specced.** Plume radius derives from *aggregate*
drive output across hulls, so a larger fleet is louder burning identically —
an emergent size signal, not a disclosed field, and the reason silent
running is worth paying flight time for.

### The information ladder

1. **Live contact** (passive or plume) — position, velocity, whether it is
   emitting. Nothing else: no hull count, no hull types, no owner.
2. **Scan sighting** — adds hull count and the hull types present, stamped
   `asOf` and frozen at mint.
3. **Owner identity** — on neither rung. Attribution is inferential: you
   learn five hulls of a class are parked at VI, and who flies that is a
   read you make or buy.

## 2026-08-27 — Places are bodies; combat deferred with its shape recorded

**Decision.** The replacement for the hex tile's "contested place" is the
**body**. Bodies are places; vacuum is transit. Nothing new is invented for
this — it is a recognition that every mechanic already landed treats the
body as the atom of place: you dock at bodies, mine at bodies, stations and
gates *are* bodies, masking happens at a host, and the focused scan targets
one. Vacuum has no affordances.

This keeps the count of things-that-matter per system small and knowable —
five to seven planets, some moons, a station, a gate per lane — which is
what the hex grid was providing and what undifferentiated vacuum would lose.
The README's own half-answer composes on top rather than competing: a parked
army creates a temporary place by handing someone a coordinate, and under
this rule it is parked *at a body*.

Rejected: station slots or orbital zones as a separate spatial primitive —
a second place-system running alongside bodies, with its own holding rules,
buying nothing the body does not already give.

**Objects may still sit in vacuum.** Bodies-as-places constrains
*affordances*, not positions. A mine at an arbitrary coordinate is legal: it
is an object with a position and a trigger radius, not a place.

### Mines, and why the trade runs backwards

A vacuum mine has no host, so it cannot be masked — only quiet. It never
burns, so passive proximity is the sole way it is ever found, and the whole
matchup reduces to trigger radius versus `PassiveRange`, with no counterplay
either way.

A mine attached to a body **is masked** — invisible rather than merely
quiet — and the counter already exists: the focused scan becomes
**minesweeping for free**, one counter-verb serving two threats. Body mines
are therefore the strong-but-counterable option and vacuum mines the
weak-but-uncounterable one. That pair is healthier than either alone, and
no trade-off has to be accepted to get it.

*Spec note:* the masking requirement currently says "a **ship** docked or
attached to a host." Covering mines means widening it to attached objects
generally — a deliberate edit.

### Combat: deferred, shape recorded

**Deferred.** Contested bodies, empty space as transit, no combat resolution
in the first playable. The economy loop — mine, haul, sell, scout, hide,
sell intel, watch a gate — stands on its own without it.

**The shape to build when it is built**, so the eventual model fits rather
than being rediscovered:

- **The player commits an approach; the engagement resolves.** The Expanse's
  realism survives async play because its crews do not pilot the exchange
  either — they set up geometry and the guns execute faster than reaction.
  The meaningful decisions are all pre-engagement: coast in quiet, burn to
  match orbits, or camp masked. This is the same commit-and-resolve shape
  every other verb already has.
- **Relative velocity is the damage model.** Engagement duration is a
  function of relative velocity and closest approach, both closed-form from
  two committed trajectories. A coasting raid passes at enormous relative
  velocity — brief exchange, scratch damage, you got through but took
  nothing. Matched orbits mean zero relative velocity — sustained exchange,
  someone dies.
- **Raids cannot hold ground and sieges are decisive**, with no rule saying
  so; it falls out of the kinematics.
- **Closed-form is mandatory, not merely preferred.** `space` already
  requires that no value derive from accumulated per-tick state, so a
  damage-per-tick loop is architecturally excluded. Time-in-range as an
  interval computed from two trajectories complies.

**Still open.** What "holding" a body means mechanically — blockade, denial
of docking, or shooting are three different games, and the choice decides
whether mines are niche or the backbone of area denial. Also whether a mine
is a fleet-like entity with an owner and hull, or a lightweight object type
with its own disclosure rules.

## 2026-08-27 — Lane gates are bodies; lane travel costs time only

**Decision.** A lane gate is an ordinary entry in the same `Bodies` table as
planets and stations, with the same rails. You fly to it and dock at it like
anything else. Traversing a lane costs **time only** — no fuel, the crossing
being a hand-waved wormhole rather than a burn.

**Placement is derived, never rolled**, following the precedent
`stations` set: the galaxy layout gives a bearing from this system to the
lane's far endpoint, and the gate sits at a characteristic radius along that
bearing. Gates therefore point the right way and a system's layout says
something true about its neighbourhood. A gate is motionless rather than
orbiting, so the bearing stays honest — `Orbit` already supports this, since
a non-positive period holds a body fixed at its stored phase.

**Why a body rather than a jump-from-anywhere radius.** If a lane can be
entered from anywhere far enough out, the galaxy graph stops constraining
movement and its topology becomes decorative — no chokepoints, and charted
lanes stop meaning anything. Making the gate a place you must reach is what
keeps the graph a gameplay object. It also costs nothing to build: position,
docking, disclosure, occlusion, and masking all apply with no new rules.

**Consequences.**

- **A gate can be camped invisibly.** A fleet docked at a gate is masked, so
  every jump into a system is a gamble on whether the gate is watched, and
  the camper cannot simply be scouted away.
- **The lane is safe; the gate is where you are vulnerable.** A fleet in
  transit is disclosed to nobody — absent from both endpoint systems and
  unmintable by any scan. Interception happens at gates or not at all.
- **Arrival is quiet but exposed.** A fleet arrives *parked near* the gate,
  not docked to it, so it is not masked: anything in passive range of the
  gate sees it, while the wider system does not. To go anywhere it must
  burn, which is loud. The camper sees the arrival; the arrival does not see
  the camper.
- **Interstellar travel is cheaper in fuel than crossing a system.** The
  fuel cost of a lane trip is getting to the gate plus leaving the far one;
  the jump itself is free. This is accepted.

**Partly settled 2026-08-29.** Whether a gate imposes a dwell time before
jumping is decided — it does not; see *A lane gate imposes no dwell before
jumping* below. Whether a fleet can be attacked while docked at a gate
awaiting a jump remains open, and stays deferred with combat.

## 2026-08-27 — Occlusion is star-only, and blocks everything

**Decision.** The system's star, and only the star, occludes. It blocks the
passive channel, the plume channel however loud, and focused-scan targeting
alike. Planets, moons, stations, and ships do not occlude.

**Why star-only.** The star is large (size 6 against planets at 1.6–4.2),
always present, and effectively fixed relative to the system, so its shadow
is a **stable, learnable** feature — a place you can plan to hide, which is
what makes occlusion terrain rather than sensor flakiness. Planet shadows
sweep past in seconds; the blind window would be brief, arbitrary, and
impossible to exploit deliberately, while multiplying the predicate cost by
the body count.

**Why it still earns its keep** now that masking is the hiding economy: it
is the only way to move *loudly* without the whole system knowing, which
pairs with cut-drive as the second way to manage a signature.

**The inverted tie rule.** This capability resolves every exact boundary
toward disclosure. Range tests are inclusive (`<=`); the occlusion test must
therefore be **strict** (`<`), so a sightline exactly tangent to the star is
clear. Writing `<=` for both would silently invert the convention on the
occlusion path.

## 2026-08-27 — Cancel is two verbs, and drift is a straight line

**Decision.** There is no "cancel" that undoes a burn. There are two verbs:

- **Cut drive** — free, instant, no delta-v. The fleet keeps its current
  velocity and drifts in a straight line at constant speed until commanded
  again, and because emission ends with the burn, it **goes dark the same
  instant**.

  *Wording corrected 2026-08-29 (link 4 analysis).* This originally read "the
  burn's interval is truncated at that world time," which is not implementable
  against the shipped code: `space.Burn.Position(t)` returns the burn's
  **intercept** for any `t >= ArriveMs`, so shortening `ArriveMs` would
  teleport the fleet to its original destination, and `StateAt` would then
  settle it into the target's insertion park — arriving for free. The
  implementable form is that cut drive **replaces** the stored burn with a
  free-drift state anchored at the burn's position at the cut time, carrying
  the burn's tangent scaled by its speed at that time. Same intent; the
  original phrasing described an edit that cannot be made.
- **Stop in place** — commit a new burn that nulls velocity and parks at the
  current position. Costs delta-v and fuel, and is itself loud.

Re-targeting mid-flight is not a special case of either: it is just
committing a new burn, which `space` already supports through *Departure Is
Tangent to the Ship's Actual Motion at Commit*. The movement channel is
single-slot, so a new commit moves the old action to `cancelled`.

**Why drift is a straight line.** Ships feel no gravity in this model —
bodies move on rails, ships fly committed curves — so constant velocity is
the correct continuation, and it is closed-form (`anchor + v·t`) with no new
math.

**Why not put a cancelled ship on a solar orbit.** Investigated and
rejected on representation, not on determinism:

- Determinism would have been *fine*. `sqrt` is correctly-rounded and
  identical across Go build targets, cross products are already guarded, and
  `PhaseIndexOf` is the pinned-table replacement for the `atan2` a
  state-vector→elements conversion needs. A one-shot mint at cancel time
  would have stayed inside the existing architecture.
- `Orbit` is `{ParentId, Radius, PeriodMs, Phase, Inclination, Node}` — a
  **circle**. There is no eccentricity and no argument of periapsis, so a
  general conic cannot be stored.
- A ship cancelling mid-flip-and-burn is moving far faster than orbital
  velocity at its radius, so its conic is almost always **hyperbolic** —
  an escape trajectory that renders as very nearly a straight line. Adding
  eccentricity, a fixed-round Kepler solve (Decision 7 bans data-dependent
  trip counts), and a hyperbolic branch would buy a straight line in most
  real cancels.

**Consequences.**

- **Cut-drive is the stealth verb.** Going quiet and coming to rest are
  opposites: you cannot do both. Vanishing costs you commitment to whatever
  vector you were pointed along.
- **Cancelling early is worse than cancelling late**, with no rule needed —
  before the flip you are still accelerating, so you drift off fast and
  overshoot; after it you are already shedding speed.
- **Drift needs no terminal condition.** A drifting fleet is always
  commandable, so the bound on sailing into the void is the fuel to come
  back — economic, not geometric. No soft walls, no lost-in-space rule.
- A free-drift state (anchor, velocity, start time) is a new stored shape
  alongside the park modes, and is closed-form.

**Deferred.** Capture-if-slow — below some fraction of circular velocity,
snap to a circular orbit at the current radius. Representable today (radius
from `|r|`, angles via `PhaseIndexOf`, period from the generator's own
`keplerPeriod`) and permitted as a discrete threshold. Held off because
*stop in place* already is the verb for ending up parked.

## 2026-08-27 — Fuel is a cargo commodity

**Decision.** Fuel occupies cargo mass the way ore does, is bought at
stations with credits, and burns down as delta-v is spent.

**Why.** It gives the game a supply line worth raiding, a reason stations
matter beyond selling ore, and a real limit on how far a fleet operates from
home. The alternative considered and rejected was an abstract per-fleet
number with no mass and no location — bookkeeping without gameplay, since it
cannot be raided and constrains nothing. If fuel were going to be that, the
better choice was not to model it at all.

**Consequences.**

- **The economy gets its first real credit sink.** M11 is noted in
  `CLAUDE.md` as a pure faucet; fuel purchase is a recurring drain
  proportional to how much you move.
- **Carrying fuel costs cargo capacity**, so range and payload trade against
  each other on every hull.
- **Burn commit gains a validation**: a burn whose delta-v price exceeds
  available fuel is rejected at commit, not discovered in flight.
- **Station-keeping upkeep is denominated in fuel.** `space` already draws a
  positive body-derived upkeep for `stationkeep`; this gives it a currency,
  and makes `orbit` the free park and `stationkeep` the paid one.
- **Silent running is cheap in fuel and expensive in time**, and that is
  allowed to stand. A gentle burn over the same path spends less delta-v
  total. Time is the real cost in a game where sightings expire and other
  players are moving — consistent with the README's "hiding economics shift
  from fuel-priced to risk-priced."

**Guardrail — acceleration does not depend on mass.** Fuel has cargo mass
for capacity purposes only. Commanded acceleration stays independent of how
loaded a fleet is. Coupling them yields the rocket equation, which turns
flight time into a differential equation and destroys the closed-form
kinematics that `add-space-kinematics` is built on — its flight time is the
brachistochrone of a *fixed* arc length at a *fixed* acceleration, evaluated
in a fixed number of rounds. This is a realism knob that must stay off.

**Settled 2026-08-29** — see *A fleet can strand, and stranding is a setback
rather than a death* below.

## 2026-08-29 — Focused-scan pricing is sensor-channel time, and the scan emits

**Decision.** A focused scan is priced in **time on the `action` sensor
channel, scaling with range to the target**, and the scanning fleet is
**detectable for the duration of the sweep**. Fuel is explicitly not the
currency.

Range gating is not part of this decision because it was never actually open:
`disclosure.FocusedScanRange` and `proximity-disclosure`'s existing rejection
requirement already shipped. That is the floor the pricing sits on, not a
choice being made now.

**Why time on the sensor channel.** The channel is single-slot, so occupying
it with a long sweep is the whole cost: clearing a system means committing
your sensor channel for a long time while other players move. It needs no new
resource and no new machinery — the radial scan already frames its ETA as a
round trip, and this is the same framing aimed at one body. Scaling with
range means sweeping a distant body costs more than sweeping the one you are
parked at, so proximity buys tempo.

**Why the scan emits.** An active sensor emits. Without this, the counter-verb
has no counter: a scanner could sit dark and interrogate every body in reach
at no risk, and masking would reduce to a resource check. Making the sweep
visible turns hunting into a mind-game — looking for hidden ships tells the
hidden ships where you are, and a masked fleet that sees itself being swept
learns something too. The disclosure model already prices emission through
plume, so this is an existing mechanism aimed at a new verb rather than a new
one. Whether the emission reuses the plume channel or gets its own radius is
a spec question; that it emits is not.

**Why not fuel.** Ordering. Fuel does not exist until link 7 and the scan
needs its price at link 5. A placeholder priced in a resource that does not
yet exist would be a forward dependency across two links, and the sensor
channel is a better answer regardless — the scarce thing a scout has is
attention, not propellant.

**Consequences.**

- **Sweeping every body is self-defeating**, not merely expensive: it is slow
  *and* loud, so a thorough search is the most detectable thing a fleet can do
  short of burning.
- **Masking stays strong but beatable.** The counter exists, costs tempo, and
  announces itself.
- **A camped gate can be checked**, but checking it is an event the camper
  sees — which is the same asymmetry the arrival/camper matchup already has.

## 2026-08-29 — A fleet can strand, and stranding is a setback rather than a death

**Decision.** Yes, a fleet can run dry far from any station. No blanket
reserve is retained. The rules already landed make this a setback rather than
a loss, and that is the intended shape.

**Why it is survivable without a special rule.** Three landed decisions
compose:

- **Commit-time delta-v validation** means a burn whose price exceeds
  available fuel is rejected at commit, so a fleet never strands *mid-burn* —
  it strands parked, at a place it chose.
- **`orbit` is the free park**, so a dry fleet sits indefinitely at zero cost.
  It is immobile, not dying.
- **Fuel is cargo**, so another fleet can rescue it with a transfer that
  already exists as a verb.

Stranding is therefore immobility pending rescue — a supply-line drama, which
is precisely what pricing delta-v in cargo mass exists to create.

**Correction 2026-09-02 (link 7 analysis): the third pillar does not exist, and
stranding is therefore PERMANENT.** There is no cargo-transfer verb anywhere in
the tree — no endpoint, no service method, no requirement in any capability.
Cargo moves in exactly two ways: credited by `mine`'s resolver and debited by
`goods-sale`'s settlement. So "immobility pending rescue" is not what the rules
compose to; "immobility" is. This ruling was recorded as settled while resting on
a premise that was never true.

Two things soften it, neither of which closes it:

- **A jump costs no delta-v** (`fleet-movement`: *Jump costs no delta-v*), so a
  dry fleet that happens to be attached to a lane gate can still cross the galaxy
  indefinitely. It simply cannot manoeuvre inside any system. A fleet dry at a
  planet cannot reach a gate, so this rescues only the fleets that stranded in the
  one lucky place.
- The commit-time affordability check still means a fleet never strands
  *mid-burn*.

**Deliberately not fixed in link 7.** A transfer verb is a real design surface
(partial transfers, proximity versus attachment, ownership on both sides, hold
capacity on both sides) and bolting it on unreviewed is how link 5's blockers
happened. Recorded as a follow-up change, `add-cargo-transfer`. Until it lands,
the honest statement of this ruling is: **a fleet can strand, and stranding is
permanent unless it stranded attached to a gate.**

**Why the blanket reserve is rejected — on definition, not taste.** "Retain
enough to get home" requires solving a return path, and that path changes
every time the fleet moves and may cross several lanes. There is no local
quantity that guarantees it. Any reserve that *is* computable is therefore
arbitrary, and an arbitrary reserve removes the teeth from the supply line
while still failing to deliver the guarantee its name promises.

**Two guardrails that are part of this decision, not optional polish.**

- **Station-keeping upkeep SHALL NOT drain a fleet to zero.** This is the one
  path where a fleet strands *passively, while doing nothing* — frustration
  with no decision attached to it. When upkeep cannot be paid, the park
  force-demotes to `orbit`, the free mode. This reuses the states that already
  exist; no new state is invented for it, and it matches the tank-dry
  auto-drop the PoC already demonstrated.

  **Correction 2026-09-02 (link 7 analysis): this guardrail currently governs a
  park no player can reach.** `space.StationKeepRate`, `space.StationKeepUpkeep`
  and `space.ReleaseStationkeep` have **zero production callers**. There is no
  hold verb — the registered fleet verbs are `orders`, `cut-drive`, `stop`,
  `jump`, `scan` — and `space.StateAt` settles a body-targeted burn into
  `ParkOrbit` and a point-targeted one into `ParkPoint`, never
  `ParkStationkeep`. `SeedFleet` places a `point` park, and `fleet-movement`
  explicitly forbids seeding a station-keeping one. The PoC has a
  `Hold here` / `Resume orbit` toggle; the backend does not.

  So the force-demotion rule is real and correct, and it protects nothing until
  the verb exists. This is the fifth instance in this chain of a derivation
  built, unit-tested against its own determinism, and never called — the others
  being `fleet.GraphSource`, `galaxy.EnsureLaneHorizon`,
  `system.StationContinuousOrbit`, and the focused scan's client half.
  **Ruling: link 7 ships the hold/release verbs alongside the fuel currency**,
  rather than specifying upkeep for an unreachable state and making it the
  sixth.

  **Correction 2026-09-02 (link 7's own panel review): the verb and currency
  ship together one link later, not inside link 7 itself.** Pricing this
  upkeep in fuel the straightforward way — folding `cargo["fuel"]`
  continuously against elapsed hold time — makes `fleet.FreeHold` (read by
  four call sites, including `mine`'s resolve clamp) time-dependent. The
  correct fix stores a precomputed dry instant on `space.Park` at `hold`
  commit and folds a station-keep park past it into its released orbit,
  mirroring "a burn past its arrival IS its settled park" — but that is a
  `space.Park` schema change link 7's own introduction of fuel should not
  also have to get right in the same breath. Carved out to
  `add-stationkeep-hold-verb`, sequenced immediately after link 7. The
  standing principle ("ship the verb with the currency, or ship neither")
  still holds exactly; only the timing moved.
- **Warn at commit; do not block.** "This burn leaves you unable to reach
  anything" is surfaced at commit time. It stays a warning and the commit is
  still permitted. The complaint about stranding is that it happens
  *invisibly*, not that it happens.

  **Correction 2026-09-02 (link 7's own panel review), two parts:**
  1. **Not a single closed-form solve.** `space.SolveBurn` is per-target, so
     checking every candidate station and lane-gate body in the destination
     system costs one solve per candidate plus the body-table read — an
     N-solves scan, N bounded by that system's body count.
  2. **Priced at the acceleration floor, not the ceiling.**
     `Δv = commandedAcceleration × flightSeconds`, and
     `flightSeconds = 2·√(curveLength / commandedAcceleration)`, so
     `Δv = 2·√(commandedAcceleration × curveLength)` — strictly *increasing*
     in commanded acceleration. A fleet's maximum affordable reach is
     therefore at its *minimum* legal acceleration
     (`disclosure.MinCommandedAccel`), not its ceiling. An earlier draft of
     link 7 priced this warning (and the read-side range estimate) at the
     ceiling — exactly backwards, false-alarming against fleets that could
     still reach a station or gate by crawling. Corrected in link 7's own
     spec deltas; this also softens (without closing) link 7's flagged
     conflict over a dry fleet drifting above the stop-in-place speed floor
     — a fleet with any fuel at all can crawl-decelerate cheaply — see
     link 7's `design.md` Risks section for the full accounting.

**Forecloses.** A lost-in-space rule, a fuel-death state, and any soft wall
that pushes a fleet back toward supply. The bound on sailing into the void
stays economic — the fuel to come back — exactly as *Cancel is two verbs*
already recorded for drift.

## 2026-08-29 — A lane gate imposes no dwell before jumping

**Decision.** Docking at a gate makes a fleet immediately jump-eligible. No
dwell timer.

Ruled by the spec team under delegated authority while sequencing link 3
(`add-orbital-system-bodies`), and accepted for link 4, where the jump verb
actually lives. Recorded here because `decisions.md` is the index.

**Why.** Link 3 delivered placement and carried no verb, so a dwell
requirement written there would have had no implementable scenario. More
substantively, a dwell buys nothing against the rules already landed: a docked
camper is **masked**, and an arrival parks near the gate **unmasked**, so the
camper's informational advantage is already total. What is missing is a way to
*act* on it — combat, or a gate-focused scan — and both are deferred. A dwell
would add waiting without adding a decision.

**Forecloses nothing.** Adding a dwell later is an additive commit-time rule;
removing one is a regression players feel. This is the answer that survives
being wrong.

**Still open.** Whether a fleet can be attacked while docked at a gate — the
other half of the 2026-08-27 lane-gate entry's open question. That is a combat
question and stays deferred with combat.

## 2026-09-03 — A belt member is dockable and mineable, but never a scan host

**Decision.** Derived belt members (`{beltId}#{k}`, synthesized into the body
table and never persisted) stay valid attachment hosts and valid mine targets —
`mine-extraction` resolves a member to its parent belt's single lode, and a
fleet docked at one echoes the member id back in its own `attachedTo` — but a
member is **never** served in a fleet's scan-target list and a scan commit
naming one is rejected identically to an unresolvable host. The belt feature
itself is the scan host. Ruled in link 8b (`add-scan-and-sightings-surface`,
design.md Decision 17), recorded here because no requirement states the
asymmetry as intended and link 8b's architect flagged that a reader will find
it and assume a bug.

**Why.** The scan-target read is the first wire surface that would *enumerate*
bodies to pick from. Serving eight members per belt there would make one belt
appear as nine entries the client has no name, mark, or facts surface for — and
would reopen per-member lodes and the wire-size question link 6 and link 8's
OQ-4 closed ("one body, members decorative and unpickable"). Attachment and
mining address a host the fleet already occupies; a target list is a catalogue.
The asymmetry is between echoing an id and offering one.

**Forecloses.** Nothing permanent: if a later change makes members pickable in
the space view, the scan list follows it, and link 6's deferred per-member
lodes come back with it — the two must move together.
