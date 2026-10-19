> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Propellant & Delta-V — Scoping

> **Status: scoping (2026-08-24).** Movement stops being free. Today a burn
> costs only *time* (`MsPerTile`, no consumable); this arc makes it cost a
> **resource you have to carry, buy, or mine**. `?` = open;
> **DECIDED** = locked by Travis; **RECOMMENDED** = proposed here, not yet
> ratified. Depends on the goods economy (`goods-market.md`) and is worth much
> less without the polar lattice (`docs/handoffs/2026-08-24-polar-lattice-migration.md`).

## The resolving principle — waiting is free, hurrying costs

**RECOMMENDED.** The single sentence the rest of this doc falls out of.

An object in a stable orbit stays there forever at no cost. Everything that
changes your orbit — going in, going out, arriving sooner than the orbit would
have brought you — costs propellant. So:

- **Coasting is free.** A fleet parked on a ring pays nothing, indefinitely.
- **Rendezvous is free if you're patient.** Two things on the same ring will
  eventually align. Paying propellant buys you *earliness*, not access.
- **Radial movement is the real expense.** The inner system is expensive to
  reach and expensive to leave.

This is what makes radial position *strategic* rather than merely a coordinate,
and it is the game style the hex board could not express — see "Why this wants
the polar lattice" below.

## What propellant is

**DECIDED (Travis, 2026-08-24):** delta-v and propellant are a resource.

**RECOMMENDED — propellant is `ResourceVolatiles`, not a new commodity.**
The taxonomy already has `metals / volatiles / water / organics / research /
exotic` (`backend/system/model.go:46`). Volatiles are already mineable, already
tradable, already stocked by NPC stations. Designating them as propellant gets
the entire loop — *mine ice → burn ice → sell the surplus* — with **no new
resource kind, no refining mechanic, and no market rework.**

Refining (volatiles → a refined propellant with better efficiency) is a good
*later* capability. It is not a launch requirement and should not gate this.

**RECOMMENDED — propellant lives in the cargo hold, not a separate tank.**
`fleet.Cargo map[string]float64` is already tons keyed by resource kind, and
capacity already derives from the roster (`DerivedCapacity`, 200t on
`ClassSeed`). Putting fuel in the hold means:

- **Mass is `dry + Σcargo` for free.** Hauling ore literally costs you
  delta-v. The central tradeoff *emerges* rather than being designed in.
- **Refuelling is already a market transaction** — stations already carry
  `Request{Kind, RemainingQuantity, UnitPrice}`.
- **A full ore hold means no room for fuel.** That is the interesting decision,
  not a bug.
- **Zero schema change.** No migration, no new persisted field.

The cost is that fuel and freight compete for the same tons. That is the point.

## The delta-v model

**RECOMMENDED.** Two separate quantities, deliberately not conflated:

| Quantity | Meaning | Where it lives |
|---|---|---|
| **Δv required** | What a manoeuvre costs, from geometry alone | Computed per order |
| **Δv available** | What the fleet can currently produce | Derived from mass + propellant |

### Δv required — Hohmann, and it is closed-form

A transfer between circular orbits at radii `r₁ → r₂`:

```
Δv₁ = √(μ/r₁) · ( √(2r₂/(r₁+r₂)) − 1 )
Δv₂ = √(μ/r₂) · ( 1 − √(2r₁/(r₁+r₂)) )
Δv  = |Δv₁| + |Δv₂|
```

**This uses only `sqrt`.** That matters enormously — see "The determinism
constraint" below. Real orbital mechanics turn out to be *safe* to put in the
rules in a way that the trigonometric parts of the lattice are not.

Same-ring phasing (arriving sooner than the orbit would deliver you) costs a
transfer out and back, scaling with how much wait you are buying off. **Zero
wait-reduction costs zero propellant** — which is the resolving principle,
falling straight out of the physics rather than being bolted on.

### Δv available — deliberately NOT the rocket equation

The honest form is `Δv = Isp·g₀·ln(m_wet/m_dry)`. **Do not ship this.** `ln`
and `exp` are transcendental and will not reproduce across Go and JS (see
below). Instead:

```
Δv_available = propellantTons × Efficiency / totalMass
fuelRequired = Δv_required × totalMass / Efficiency
```

Linear in mass and Δv. It is wrong physics — the rocket equation's curvature
only bites at high mass ratios, which gameplay loadouts will not reach — and it
keeps every fuel number exactly reproducible. It preserves the whole tradeoff:
a heavy ship costs more to move.

Ship the real rocket equation **only** if you accept making fuel
server-authoritative with the client showing an estimate. That is a real option;
it is just a different trade, and it should be chosen deliberately.

## Why this wants the polar lattice

On the hex board this mechanic is **pointless bookkeeping.** Distance is
uniform, so Δv ≈ tiles ≈ time: you would be adding a resource that tracks a
number the player already has.

On a polar lattice it becomes informative, because the two axes cost differently:

- **Tangential:** free to coast, priced only when you buy off waiting time.
- **Radial:** a genuine orbital-energy change, priced by Hohmann.

Radial position becomes a strategic asset, staying put has value, and the inner
system earns its danger. **Delta-v is worth substantially less without polar,
and polar is worth more with delta-v.** These two decisions should be made
together, not in sequence.

## The determinism constraint

`fixtures/board/cases.json` is the Go↔TS contract, and it holds because the math
is integer. Go and JS agree bit-exactly on `+ − × ÷`; they **do not** agree on
`sin`/`cos`/`atan2`/`ln`/`exp`. This is not theoretical — the polar spike threw
a React hydration mismatch because Node and Chrome disagreed in the last ULP of
`Math.cos`.

`sqrt` is the exception that makes this arc viable. IEEE-754 mandates a
correctly-rounded square root and both Go and V8 compile to the hardware
instruction, so it agrees in practice. **Caveat worth respecting:** ECMAScript's
spec language for `Math.sqrt` is looser than for the four basic operations
("implementation-approximated"), so this is *reliable in practice, not
guaranteed by spec*. Pin it with a fixture family before depending on it.

**Rule:** `sqrt` may appear in a Δv calculation. `ln`, `exp`, and the
trigonometric functions may not appear in any rule, stored value, or ETA.

Prefer integer units throughout (Δv in whole ring-units, propellant in whole
tons) so the seam stays trivially safe.

## Stranding — the open hazard

**?** Zero propellant on a ring means a fleet cannot move. Ever. The death
invariant only fires at zero fleets (`corporations`, `diedAt`), so a stranded
player holds a **live corp with no agency** — a genuine soft-lock, and it will
hit new players hardest, because exploring is precisely what burns fuel.

This needs a decision **before the mechanic ships**, not after. Candidates:

1. **Unspendable reserve.** A fraction of the tank cannot be committed, so a
   fleet can always limp somewhere. Simplest; slightly dishonest physics.
2. **Distress as a station service.** NPC stations dispatch a tug for credits
   or debt. Best flavour; most machinery.
3. **Passive ISRU regen.** A slow trickle of propellant while parked.
   Self-healing, no new UI, but it makes fuel pressure evaporate if tuned soft.
4. **Scuttle and respawn.** Brutal; interacts with the spawn/death invariant.

Leaning 1 + 2: a reserve prevents the common accident, distress covers the
determined idiot. But this is a design call, not a technical one.

## Commit and resolve

**RECOMMENDED.** Validate at commit, consume at resolve.

- **Commit** (`action.Commit`) refuses the order outright when
  `Δv_required > Δv_available`. A burn you cannot afford never becomes an
  action. This is a new failure mode on the order endpoint and needs a
  first-class error + UI state, not a 500.
- **Resolve** appends the propellant delta to the existing exactly-once ledger
  (`deltas/{scope}/entries/{actionId}`, doc id = actionId) with
  `effectAt = arriveTime`. No new persistence machinery — the action spine was
  built for exactly this and mine is already its first writer.

**The double-spend hole closes itself.** Between commit and resolve the
propellant still reads as present, but the single-slot movement guard
(`activeActionId`) already forbids a second concurrent burn. This holds **only
while scans stay free** — `activeScanId` is an independent channel, so a
propulsive scan would reopen the gap. Keeping scans non-propulsive is both
physically right and structurally convenient. Leave it that way.

## Economy integration

The pieces already exist; this mostly wires them.

- Propellant is a **priced good with universal demand** — every station sells
  it, which gives the market a natural price floor and a reason for traffic.
- **Distance becomes a cost curve**, so the arbitrage logic in
  `goods-market.md` ("hauling through a choke point *is* the trade") gets
  teeth: the haul now has a variable cost, not just a time cost.
- **Fuel/freight competition** means a hold's opportunity cost is real. Long
  hauls need more fuel and can carry less cargo — a self-limiting mechanic that
  keeps short-range trade viable.
- `market.TradableKinds` and `RequestKinds` already bound what is quotable;
  volatiles need only be confirmed present in both.

## Spawn

**?** `corporations.Spawn` seeds a hull via `fleet.SeedFleet` and must now also
seed an initial propellant load. Two consequences:

- The starting load has to make the taught first loop (scan home → mine → dock
  → sell) completable **without** a refuel, or the tutorial dead-ends.
- Site selection (`siteselection.go`) currently weighs mineable-skeleton ∧
  `minSpawnDistance` ∧ periphery. It should probably also weigh **radial
  reachability** — a home whose only lode sits ten rings inward is a bad spawn
  under this mechanic in a way it was not before.

## Starting numbers

**?** For calibration against what already exists:

| Existing | Value |
|---|---|
| `MsPerTile` | 2500 ms/hex |
| `defaultSeedHoldCapacity` | 200 tons |
| `defaultSeedMiningRate` | 0.001 t/world-ms (~1 t/world-second) |
| Time to fill a hold | ~200 world-seconds |
| Time to cross a radius-16 board | ~80 world-seconds |

The established pacing is **mining is the slow, strategic verb; movement is
quick.** Propellant must not invert that. A first cut worth arguing with: a
typical loadout carries ~40t fuel to ~160t freight, and a full board-radius
radial transfer costs well under half the tank — so fuel pressure is a planning
concern on long hauls, not a tax on every move.

`ClassStats` needs two new fields (`DryMass`, `Efficiency`) alongside
`MiningRate`/`HoldCapacity`/`BurnRate`/`LaneRate`. Note the existing convention:
capacity/rate sum across the roster, **speed takes the minimum**. Efficiency
should almost certainly be mass-weighted rather than either.

## What this does NOT do

Deliberately out of scope, to keep the arc landable:

- **No refining.** Volatiles burn as mined.
- **No engine classes or Isp variety.** One `Efficiency` per ship class.
- **No fuel for scans.** Sensors are not propulsive; this also protects the
  single-slot double-spend argument above.
- **No lane-tier fuel.** Graph-tier travel (#0008) keeps costing only time
  until board-tier delta-v has been played. Whether lanes should burn
  propellant is a real question, deferred.
- **No rocket equation.** See above; revisit only with the
  server-authoritative trade taken deliberately.

## Open questions

1. Stranding remedy (section above) — **blocks shipping**.
2. Does graph-tier lane travel consume propellant, or only board-tier burns?
3. Is `Efficiency` per ship class, per engine module, or global for now?
4. Does propellant have a **boil-off** rate while parked? (Adds pressure to
   loitering; also a soft counter to hoarding. Probably not for v1.)
5. Spawn load + reachability weighting (section above).
6. Do NPC stations have unlimited propellant, or is supply itself a market?

## Pointers

- Cargo pool, roster, derived capacity: `backend/fleet/model.go`, `roster.go`
- Resource taxonomy: `backend/system/model.go:42`
- Stations and requests: `backend/stations/model.go`
- Market bounds: `backend/market/params.go`
- Action spine + delta ledger: `backend/action/`
- Movement tuning: `backend/fleet/params.go`, `common.Tuning()`
- Lattice decision this couples to: `docs/handoffs/2026-08-24-polar-lattice-migration.md`
- Economy this rides on: `docs/plans/goods-market.md`
