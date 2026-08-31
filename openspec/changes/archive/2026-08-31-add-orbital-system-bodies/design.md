## Context

`docs/plans/continous_space/chain.md` is link 3 of the nine-link chain that
carries the game off the polar lattice into continuous R³. Links 1 and 2
landed (`backend/space` at `a05dddf`, `backend/disclosure` at `fca73ef`),
both deliberately with **zero consumers**: `space` mints no body, and
`disclosure` reads the world through `space.Bodies`, an interface no type in
the repository implements.

This change is where that stops being theoretical. Its job is exactly two
things:

1. **Interiors emit real orbits.** Every generated feature acquires a
   continuous orbital element set — radius, period, phase, inclination,
   node, parent — and a size, alongside the lattice ring/slot it already
   carries.
2. **The `space.Bodies` seam gets its first implementation**, so that
   `space.Position`, `space.SolveBurn`, and every `disclosure` predicate
   have something to resolve against.

Lane gates join the body table as ordinary entries (`decisions.md`,
2026-08-27), which is what keeps the galaxy graph a gameplay object rather
than decoration.

**Smaller than link 1, and harder in exactly one place.** The math is
already shipped and fixture-pinned; `system.Feature` already carries an
`Orbit`, a `ParentId`, and a `Fixed` flag, and the generator already thinks
in parent chains. What is genuinely new is that **`backend/system` becomes a
float-persisting, rule-bearing package** for the first time. It is already
inside `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES` and already
inside `check-fma-contraction.sh`'s whole-module build, so it is *governed*
today — it simply has had nothing rule-bearing to govern. That changes here,
and the parent design's stop rule comes with it.

### The orchestrator's Option A ruling, recorded

**Link 3 ADDS continuous orbital elements alongside the existing lattice
ones and DELETES NOTHING.** Every lattice field, requirement, and consumer
keeps running the game.

This is recorded rather than re-derived because the literal rip-and-replace
reading of chain.md:49-56 (`Footprint []board.Cell` → *deleted*) is not
implementable inside link 3. The consumer inventory is why:

| Consumer | What it reads | Dies at |
|---|---|---|
| `fleet/service.go:708` `resolveFeature` → `board.OrbState`/`ShipPos` | `Feature.Orbit{Ring,Angle0,Period,Dir}` | link 4 |
| `fleet/travel.go` `orderTravel`/`buildTrip` → `board.LaneTransit` | lane gate cells, lattice routing | link 4 |
| `system/fog.go`, `system/fog_source.go` → `observation.FeatureGeom` | `Footprint`, `board.Orbit`, occlusion radii | link 5 |
| `mine/service.go` `findFeature`/`findResource` | `Feature.Id`, `Resources`, `FeatureType` | link 6 (re-anchored, not deleted) |
| `stations/placement.go` `DeriveOrbit`, `stations/service.go` `FeatureOf` | `system.Orbit`, `system.PeriodFor` | link 6 |
| `system/dao.go:90`, `system/service.go:197` `featureRingOK` | `Orbit.Ring`, `Footprint` ring guard | link 9 |
| `frontend/lib/types/system-board.ts`, `lib/board/orbit.ts`, `components/board/*` | the wire shape's `footprint` / `angle0` | link 8 |
| `backend/board`, `backend/polar`, `frontend/lib/board`, `frontend/lib/polar`, `fixtures/board`, `fixtures/polar` | everything above | link 9 |

Deleting `Footprint` in link 3 drags links 4, 5, and 8 into it and cannot
leave `/check` green in between. The chain exists precisely so each of those
is its own reviewable change.

**This is not a backwards-compatibility shim.** No dual-write choreography,
no expand-migrate-contract, no feature flag, no adapter layer, and no code
whose purpose is to let the two representations agree. They coexist the way
`board` and `polar` coexisted through the polar migration, and the way
`space` coexists with `board` today: two independent expressions of the same
generated dice, both derived from the same seed, neither consulted by the
other. The repo's ground rule ("no migrations, no compat, deletion
preferred" — `README.md`, `MEMORY.md`) binds every later link unchanged, and
the deletion schedule above is the commitment.

## Goals / Non-Goals

**Goals**

- Give every generated interior feature a continuous orbital element set
  expressible as a `space.Orbit`, plus a physical size, persisted and
  deterministic from the per-system seed.
- Land the first implementation of `space.Bodies` — a materialized,
  immutable, per-request snapshot that answers `Body(id) (Body, bool)`
  synchronously, and that also supplies `disclosure.World`'s `StarId` and
  `StarSize`.
- Make lane gates ordinary bodies: derived from the galaxy layout, motionless,
  outside the planetary disk, and reachable.
- Re-express the trading station's placement in continuous terms without
  reading the materialized interior, preserving the `DeriveOrbit` purity
  precedent.
- Keep the lattice generator's output **bit-identical for every seed** — the
  new draws must not perturb the old stream.
- Land with **zero new deviation-register entries and zero new defect
  documents**, on the same terms link 1 set: a greenfield rule-bearing
  surface whose determinism was designed in, not bridged.

**Non-Goals**

- **No consumer moves.** `fleet` still flies the lattice, `observation` still
  serves fog, `mine`/`market`/`stations` still resolve positions through
  `board`. `system.BodyTable` has zero consumers when this lands, exactly as
  `space` and `disclosure` did.
- **No jump verb, no dwell, no cancel semantics, no free drift.** Those are
  link 4.
- **No disclosure wiring, no sighting store, no deletion of
  `observation`.** Link 5.
- **No re-anchoring of mine/sell/dock.** Link 6. A belt's continuous members
  are minted here; what `mine` targets is link 6's question.
- **No fuel, no Δv pricing, no burn-commit validation.** Link 7.
- **No renderer — and no continuous field reaches any HTTP response.** An
  earlier draft of this design claimed the continuous elements "ride out on
  the existing interior read as additive fields the current client ignores."
  **That claim is withdrawn: it is false, and the correction is
  load-bearing.** `system.Feature`'s json tags do not reach the wire. The
  interior read serializes `fogFeatureDTO` (`backend/system/fog.go:16-34`) —
  an explicit allowlist, populated field-by-field at `fog.go:59-62` and
  `fog.go:107-111` under the #0006 three-band rule. Adding `Space` and `Size`
  to `Feature` therefore ships **nothing**; "riding out on the existing read"
  would require an implementer to edit `fogFeatureDTO`, in the one struct
  whose entire purpose is deciding what each visibility band may carry — and
  this change's deltas give them no band rule to decide it with.
  **Ruling: link 3 does not touch `fogFeatureDTO`.** `Space`, `Size`, and
  `Extent` are persisted and readable in-process through `BodyTable`; they
  cross no response boundary. This change has **no wire-shape change at all**,
  which is what makes `BodyTable`'s zero-consumer posture literal rather than
  approximate. Extending the DTO is **link 5's** business, when disclosure is
  actually wired and a band rule exists to govern which band earns a body's
  continuous position and size. *Implementer warning: do not "helpfully" add
  `space`/`size` to `fogFeatureDTO` because the fields look additive and
  harmless. Under three-band fog, shipping a body's live continuous position
  to a band that has not earned it is an information leak, and no requirement
  in this change says which band earns it. Those fields appearing in the DTO
  is out of scope and should be reverted on review.*
- **No TypeScript mirror of anything here.** `space-kinematics` ›
  *Every Rule-Bearing Value of This Capability Is Computed Only in the
  Authoritative Implementation* binds; the generator is Go-only for the same
  reason the kinematics are.
- **No migration and no backfill.** See Migration Plan.

## Decisions

### Decision 1: Retrograde is inclination past a quarter turn, never a period sign — chain.md's mapping table is wrong

**The finding.** chain.md:53 maps `Dir int` → "sign folded into `PeriodMs`".
That is not implementable against the shipped code, and it collides with a
shipped requirement:

```go
// space/orbit.go:44
func (o Orbit) PhaseAt(t common.WorldMillis) SubTurns {
    if o.PeriodMs <= 0 {
        return o.Phase          // MOTIONLESS
    }
```

`space-kinematics` › *The Time Domain Is Explicit and Degenerate Orbital
Elements Are Defined* pins this as a requirement: "An orbital period at or
below zero SHALL hold the body or park motionless at its stored phase for
every world time, never divide by it," with its own scenario. Folding
direction into the period's sign would **freeze every retrograde body**, and
it would collide head-on with Decision 7 below, which uses a non-positive
period deliberately to hold a lane gate still.

**The call.** Retrograde is expressed as **inclination**, following the real
astronomical convention: an orbit is retrograde when its inclination exceeds
a quarter turn. Prograde bodies draw an inclination near zero; retrograde
bodies draw one near `SubTurn/2`, with the same small tilt jitter applied on
the other side.

**Verified against the shipped rotation, not assumed.**
`space/orbit.go:66` `rotateInclinationNode` maps a planar `(x, 0, z)` offset
through `y = -z·sinI`, `z' = z·cosI`, then a node rotation about Y. At
`I = SubTurn/2` the pinned table gives `cos = -1` exactly, so with node `N`:

```
xFinal = x·cosN + z·sinN
zFinal = x·sinN − z·cosN
```

whose determinant is `−(cos²N + sin²N) = −1`. It is a **reflection**, not a
rotation — orientation-reversing, which is exactly what retrograde means.
The phase index still advances positively (integer, wrap-safe, exact
periodicity preserved), and `LocalVelocity` stays analytically correct
because it runs through the same rotation: the derivative of the reflected
position is the reflection of the derivative. Nothing in `space` needs to
change.

**One quantified wart, recorded so no scenario asserts the wrong thing.**
The pinned table's `coarse[512]` is `{cos: -1, sin: 1.2246467991473515e-16}`
— `sin(π)` as `math.Sin` computes it, not exact zero. A body at exactly
`I = SubTurn/2` therefore carries an out-of-plane component of
`|z|·1.22e-16` — about `8e-14` units at radius 659, against body radii of
0.3–4.2. Physically nil, bit-reproducible, and harmless. But **no spec
scenario may assert `Y == 0` exactly for a retrograde body**; the honest
assertion is that its sweep direction is reversed relative to a prograde
body at the same node, which is a sign test on the cross product and is
exact. Flagged to the spec writer.

**Alternatives considered.**

- *Period sign* — chain.md's own proposal. Falsified above: it freezes the
  body and contradicts a shipped requirement and Decision 7.
- *A `Dir` field on `space.Orbit`* — would change a shipped, fixture-pinned
  type with an existing fixture family, forcing a re-record of
  `fixtures/space/` for a property the existing element set already
  expresses. Rejected: the point of link 1 was to fix this shape before it
  had consumers.
- *Negating `Node`* — a rotation about Y has determinant `+1` at every
  angle; it cannot reverse handedness. It relabels where the body starts,
  not which way it goes. Rejected on arithmetic.

**What it forecloses.** Inclination stops being a free 3D-texture dial and
becomes semantically loaded: `[0, SubTurn/4)` is prograde, `(SubTurn/4,
SubTurn/2]` is retrograde. A future design wanting inclination near a
quarter turn (a polar orbit) has no direction — which is astronomically
correct and worth accepting.

### Decision 2 (REVISED — the earlier text was wrong and is corrected here): The continuous radius is a geometric law over a per-family **orbital index**, and the index is NEVER the clamped lattice ring

**The finding that forced the revision.** The original text said the index
"is the ring the lattice generator already clamped and placed on
(`clampRing(b.Ring, params.Radius)`)." That is falsified by arithmetic.
`galaxy/skeleton.go:43-50` draws **distinct** rings from `[0, MaxRings=12)`
— including ring 0. `system/generator.go:267` maps ring 0 → ring 1. So a
skeleton containing both ring 0 and ring 1 yields two skeleton bodies with
the **identical clamped ring**, hence the identical continuous radius and
period. With `count = 1 + rand(7)` bodies drawn from 12 rings the collision
probability is `count(count−1)/132`; over the uniform count distribution
that is `E[c(c−1)]/132 = 16/132 =` **12.1% of all systems**, rising to
**31.8%** at 7 bodies. Under the original text the strict-ascent
requirement would have failed on one system in eight, and a 10,000-seed
sweep would have contained roughly 1,200 of them. Verified against the code,
not inferred.

**The call.** The law is `ContinuousRadius(idx) = BaseOrbitRadius ×
RadiusGrowth^idx`, evaluated as `idx` explicit `float64(...)`-guarded
multiplies (a fixed trip count bounded by `params.Radius`, so the parent
design's no-data-dependent-trip-counts rule holds). Its input is an
**orbital index**, and there are exactly three sources of one — this is the
complete enumeration, and no feature falls outside it:

| Family | Orbital index | Domain |
|---|---|---|
| Skeleton major (`feat-body-i`) | `skeleton.Bodies[i].Ring`, **raw and un-clamped** | `[0, MaxRings)` = `[0, 11]`, distinct within a system by `distinctRings`'s construction |
| Every other star-parented generated feature — extra body, belt, anomaly, ruin, hazard | the lattice ring that feature's own generator line already drew (`generator.go:61, 74, 89, 202`) | `[1, params.Radius]` = `[1, 16]` |
| Body-parented feature — moon, station | **none.** These have no orbital index and never touch this law; their local radius comes from Decision 16 (moons) and Decision 6 (station) | — |

So the law's total input domain is the integer interval
`[0, params.Radius]` — 17 values at the shipped radius. That matters twice:
it is what makes `Extent = ContinuousRadius(params.Radius)` a genuine upper
bound over *every* family rather than only the skeleton one, and it is what
makes this function exhaustively sweepable (Decision 13).

**Why the raw skeleton ring, not the clamped one.** It is distinct per
system by construction, so strict ascent holds with no collision case to
handle; it is a pure ordinal (ring 0 means "innermost", which is exactly
what the ordering law wants); and it costs zero draws, preserving the
Decision 11 property that motivated the original text.

**Ordering coherence survives, in the weaker and correct form.** The
original rationale — a reviewer comparing a lattice board to a continuous
one is comparing the same system — is preserved as a *refinement*, not an
identity: `clampRing` is monotone non-decreasing, so `ring_i < ring_j`
implies `clamp(ring_i) ≤ clamp(ring_j)`, while the continuous radius is
strictly increasing in the raw ring. **The continuous ordering therefore
never contradicts the lattice ordering; it only breaks its ties.** For
non-skeleton features the two derive from the identical drawn ring and agree
exactly. That is the honest claim, and it is the one the writer should
encode.

**Scoping of the ascent and separation laws — stated so no scenario asserts
something false.** Strict ascent and the minimum-spacing multiple bind
**skeleton majors only**, in ordinal order. Detail features draw their rings
independently and may land on an index a skeleton major already occupies, or
outside the skeleton's whole span. Two bodies sharing a continuous radius at
different phases is a co-orbital pair, not a defect, and **no separation
between families is claimed or required**. The minimum spacing multiple is
not a free knob: adjacent skeleton ordinals differ by at least 1, so
`MinOrbitSpacing = RadiusGrowth` exactly, and asserting anything larger
asserts a falsehood.

**Recalculated constants.** `BaseOrbitRadius = 24.0`, `RadiusGrowth = 1.23`.
Both are placeholder feel dials in the sense every constant in this change
is; both are *constrained* rather than merely chosen:

| Quantity | Value | Constraint it satisfies |
|---|---|---|
| `ContinuousRadius(0)` — the smallest radius any body can receive | **24.0** | `> disclosure.PassiveRange (12)` ✓ 2.0×; `> disclosure.PlumeFloor (20)` ✓ 1.2× |
| `ContinuousRadius(9)` — the typical outermost skeleton ring (`E[max] = 11c/(c+1)`) | **154.7** | inside the PoC band `disclosure/params.go` calibrates against ("outer orbits around 150-250") ✓ |
| `ContinuousRadius(11)` — the largest skeleton ring possible | **234.0** | still inside that band ✓ |
| `ContinuousRadius(16)` = `Extent` | **658.7** | the by-construction ceiling; `≪ space` coordinate extent `1e12` ✓ |
| gate radius = `Extent × 1.1` (Decision 7) | **724.6** | strictly outside every generated body ✓ |
| effective growth per *body* at the mean skeleton gap `11/(c+1) ≈ 2.23` | **×1.59** | inside the PoC's measured `×1.38–1.60` ✓ (at the top; noted, not hidden) |

**The `PlumeFloor` clearance is the tight one, and it is why `Base` moved
from 20 to 24.** `MinBodies = 1`, and `distinctRings` can return `{0}`, so a
one-body system's *outermost skeleton radius* equals its innermost equals
`ContinuousRadius(0)`. At the old `Base = 20.0` that is exactly `20.0`,
which does **not** strictly exceed `disclosure.PlumeFloor = 20` — the
degenerate case would have failed the requirement outright. At 24.0 it
clears by 20%. This case is not hypothetical; it is one seventh of the count
distribution crossed with a `1/12` ring draw.

**A third clearance nobody had checked, now enforced.**
`space.StarClearanceRadius = 2.5 × starSize` is the shell a burn's curve must
stay outside of. With the Decision 4 star-size table topping out at 7.6 that
shell is at most 19.0, against a smallest possible orbit of 24.0 — so **no
generated body ever sits inside its own star's clearance radius.** The
enforceable form of that invariant is
`space.StarClearanceRadius(max(StarSize)) < BaseOrbitRadius`, and it belongs
in the same test Decision 14 asks for. Note the exported *function*, not the
factor: `starClearanceFactor` is unexported, so `system` cannot read it and
an implementer reaching for it would be forced to copy the literal — exactly
the hazard this change forbids everywhere else.

**The interior gains a continuous extent.** `SystemInterior.Extent float64`
= `ContinuousRadius(params.Radius)` at generation time, persisted. Every
generated body's radius is `≤ Extent` by construction — every family's index
is `≤ params.Radius`, belt members are bounded by Decision 5's width
invariant, and body-parented children are bounded by Decision 16's band
ceiling. `Extent` is what Decision 7 anchors gates on and what a renderer
frames a system with, and it is the field that **survives link 9**, when
`SystemInterior.Radius` (a lattice concept) is deleted.

**Alternatives considered.**

- *The clamped lattice ring* — the original text. Falsified above on
  arithmetic, and separately false on wording: the clamped ring **is** the
  lattice ring, which the `galaxy-generation` delta's own text forbids as
  the derivation input.
- *Draw a continuous radius directly, PoC-style
  (`radius *= 1.38 + rand()*0.22`).* Rejected: it draws from the RNG, it
  decouples the two representations' ordering, and it makes the interior's
  extent a random variable rather than a stored fact, which Decision 7 needs.
- *Use the skeleton ordinal `i` (the index into `skeleton.Bodies`) rather
  than the ring value.* Distinct and ascending too, and it caps the skeleton
  at index 6 — but it collapses the ring gaps that supply this law's
  jitter, so every 4-body system would have identical radii, and it leaves
  non-skeleton features with no index at all. Rejected.

### Decision 3: Two orbital-period laws — Kepler for star-parented bodies, the shipped insertion law for children — and `math.Pow` never appears

**The call.**

- **Star-parented:** `keplerSeconds(r) = KeplerBaseSeconds × (r/KeplerBaseRadius) × sqrt(r/KeplerBaseRadius)`,
  then `PeriodMs = common.WorldMillis(math.Ceil(keplerSeconds × 1000))`,
  clamped to a minimum of 1 ms so the period is strictly positive (a
  non-positive period means *motionless*, per Decision 1's requirement, and
  a planet must never accidentally acquire it).
- **Body-parented** (moons, the station, anything riding a planet): the
  already-shipped `space.InsertionPeriod(localRadius)` — `5 + 0.9r` seconds,
  already fixture-covered, already integer-quantized.

**`math.Pow` is not needed and never enters.** The PoC's
`keplerPeriod(r) = 40·(r/40)^1.5` is algebraically `40·(r/40)·sqrt(r/40)`.
`math.Pow` is one of the four functions the parent design's finding D-1
measured diverging across build targets; the identity removes it outright
rather than pragma-ing it. What remains is one `math.Sqrt`, which IEEE-754
requires to be correctly rounded and which is therefore identical across Go
build targets. It carries `// determinism:allow(pinned)` at the call site
and a Go-side fixture family (`keplerPeriodMs`) recorded on both legs —
exactly the branch `cross-stack-determinism` › *Square Roots In Rules Are
Pinned, Not Assumed* provides for a Go-only package, and exactly the pattern
`space/park.go:177` already carries.

**Rounding is stated, not implied.** `math.Ceil`, not `math.Round`.
`math.Round` is in the transcendental lint's forbidden set for a reason
(Go rounds half away from zero, JS half toward `+Inf`), and `Ceil` is
already in this capability's exact set and already the quantizer
`space-kinematics` › *Burn Timing Quantizes to Integer World-Milliseconds by
Ceiling* uses. Using the same one everywhere is worth more than the
half-millisecond it costs.

**Why one law is not enough.** A moon at a local radius in Decision 16's
band under the Kepler law would take a couple of seconds per revolution — a
blur. The PoC rolled moon periods separately (`7 + rand×12` s) for this
reason. `space.InsertionPeriod` over Decision 16's band `[15.0, 21.0]` gives
`18.5–23.9` s, the same order as the PoC's band, without a new law, a
new constant, or a new fixture family — and it gives the property
`system.PeriodFor`'s own doc comment already brags about: *a moon and a
parked ship at the same local radius share a period, because they share the
physics.*

**Alternatives considered.**

- *(b) Period linear in the skeleton ordinal.* No transcendental, no fixture
  obligation — and no Kepler pacing. The inner-system-whips / outer-system-
  crawls contrast is a large part of why the PoC "feels so much better," and
  it is what makes the time-scale control worth having. Rejected: it saves a
  pragma the codebase already has a blessed form for, and pays in feel.
- *(c) A pinned table of periods per ordinal.* Radii are continuous
  (Decision 2 spreads them geometrically across 16 rings), so a per-ordinal
  table would give two bodies at very different radii the same period —
  visibly wrong. It also buys nothing over `sqrt`, which is already exact.
  Rejected.

**What it forecloses.** Elliptical orbits. `space.Orbit` is a circle
(`{ParentId, Radius, PeriodMs, Phase, Inclination, Node}` — no eccentricity,
no argument of periapsis), which `decisions.md` already recorded when it
rejected putting a cancelled ship on a solar orbit. Kepler's third law
against a circular radius is therefore the most physics this representation
can carry, and that is the ceiling being accepted.

### Decision 4: Every feature carries a size, and the star's size comes from its class

`space.Body` has a `Size`, and three shipped consumers need it:
`space.InsertionStandoff` (a larger body gets a larger standoff),
`space.StarClearanceRadius` (`2.5 × starSize`), and
`disclosure.World.StarSize` (the capability's only occluder). Nothing in
`system` produces one today.

`Feature.Size float64` is added, persisted, drawn from the second RNG stream
per feature type over named ranges. **The bands are keyed on `FeatureType`,
not on one global planet band** — this is a revision of the original text
("planets 1.6–4.2"), forced by Decision 6: the station's local radius must
clear its parent without knowing the parent's drawn size, which is only
possible if a type has a *ceiling* that is itself derivable from galaxy-tier
data. It is also better on its own terms: a gas giant should not be able to
roll smaller than a rocky world. The overall span stays the PoC's 1.6–4.2.

| `FeatureType` | Size band | Ceiling (`MaxFeatureSize`) |
|---|---|---|
| `FeatureGasGiant` | 3.4 – 4.2 | 4.2 |
| `FeatureIce` | 1.9 – 2.7 | 2.7 |
| `FeatureRocky` | 1.6 – 2.4 | 2.4 |
| `FeatureMoon` | 0.5 – 1.0 | 1.0 |
| `FeatureAnomaly`, `FeatureRuin` | 0.8 – 1.6 | 1.6 |
| hazards (`FeatureGravityWell`, `FeatureRadiation`, `FeatureNebula`, `FeatureDebris`) | 1.0 – 3.0 | 3.0 |
| `FeatureBelt` (the belt feature itself, not its members) | `BeltFeatureSize = 0.9`, not drawn | 0.9 |
| station | `StationSize = 0.9`, not drawn (the PoC's own value) | 0.9 |
| `FeatureStar` | not drawn — the class table below | 7.6 |

`MaxFeatureSize(ft)` is exported, because Decision 6 consumes it and
`featureTypeForBody(galaxy.BodyType) FeatureType` is already a pure
galaxy-tier function — so a caller holding only a skeleton body can reach a
size ceiling with no interior read.

**Two derived families that the original text left with no size at all, and
which therefore would have landed in the table at `Size = 0`.**
`space.InsertionStandoff(body)` reads `body.Size` as its **only** per-body
input (`space/park.go:123`: `base + perSize×Size`), so a zero size collapses
`space-kinematics`'s "a larger body gets a proportionally larger standoff"
to a constant — for exactly the two families links 4 and 6 target most
(mining a belt member, docking at a gate). Both get named, strictly positive
sizes:

- **Belt member:** drawn — not constant — from the same splitmix64
  finalizer over `(featureId, k)` that Decision 5 already uses for radius
  and phase, over `BeltMemberSizeMin = 0.3` … `BeltMemberSizeMax = 0.9` (the
  PoC's asteroid band). Zero extra draws, zero extra persistence, and eight
  members of one belt read as eight different rocks.
- **Lane gate:** `GateSize = 1.2`, a named constant. A gate is manufactured,
  identical everywhere, and its size exists to give docking a standoff
  (`InsertionStandoff(1.2) = 4.3`), not to describe an object.

**No body in the table may carry a non-positive size.** That is the
invariant behind the `BodyTable` fail-closed rule the writer already
recorded for the star; it generalizes, and a `Size = 0` body anywhere is a
generation bug, not a degraded read.

**The star's size is not drawn.** `StarSize(class string)` is a pinned table
over the seven classes `galaxy.rollStarClass` produces
(`StarClassWeights: O B A F G K M`), defaulting to the PoC's 6. Deriving it
from class rather than rolling it means a K-class dwarf reads as one, and it
costs no draw. Started **narrow**, per the Open Question — widening is a
constant edit:

| Class | O | B | A | F | G | K | M | default |
|---|---|---|---|---|---|---|---|---|
| Size | 7.6 | 7.0 | 6.6 | 6.2 | 6.0 | 5.6 | 5.2 | 6.0 |

The ceiling is load-bearing, not decorative: `space.StarClearanceRadius =
2.5 × starSize` must stay below `BaseOrbitRadius`, so **every entry in this
table must satisfy `size < 9.6`** (Decision 2). At 7.6 the widest star's
clearance shell is 19.0 against a smallest orbit of 24.0. Widening the
spread past 9.6 without moving `BaseOrbitRadius` puts a planet inside its own
star's burn-clearance shell.

### Decision 5: A belt is one persisted feature with N derived member bodies; the annulus is decorative

**The call.** The belt stays exactly one `system.Feature` with exactly one
continuous element set (its base radius, its shared period, its plane) plus
a stored `Width`. The body table synthesizes **`AsteroidsPerBelt = 8`
members** from it, with ids `<featureId>#<k>` for `k` in `[0, 8)`. Each
member's radius, phase, inclination jitter, and size (Decision 4) are
**derived** from `(featureId, k)` by the splitmix64 finalizer — never
rolled, never persisted. Every member shares the belt's period, so the belt
rotates rigidly and stays a belt.

**`Width` has a law, a range, and a stated meaning — the original text named
the field and defined none of the three.**

- **Meaning: `Width` is the FULL radial thickness of the annulus, not a
  half-width.** Stated because the two readings differ by a factor of two
  and both are idiomatic. A member's radius is
  `baseRadius + (u − 0.5) × Width` with `u ∈ [0,1)` derived from
  `(featureId, k)`, so members span `baseRadius ± Width/2`.
- **Law:** `Width = BeltWidthFraction × baseRadius`, with
  `BeltWidthFraction = 0.06` — proportional, not absolute, so a belt at
  radius 500 is visibly thicker than one at 40 rather than a hairline. A
  belt's members therefore span `base × [0.97, 1.03)`.
- **Persisted, not re-derived.** Same reasoning as Decision 12's period:
  re-deriving `Width` from a live constant would let a feel-tuning edit
  retroactively move every already-materialized belt's members, which is the
  exact hazard already flagged forward for `AsteroidsPerBelt`. It is a
  persisted `Feature.Width float64` (`firestore:"width,omitempty"`),
  strictly positive on belts and absent on every other feature type. *This
  field is missing from the implementation task list; flagged.*
- **The bound that keeps Decision 2's by-construction ceiling true.** A belt
  draws its ring from `[2, params.Radius−1]` (`generator.go:74`), so its
  outermost member is at most `ContinuousRadius(15) × 1.03 = 551.6`, well
  inside `Extent = 658.7`. The general invariant, which is what a test should
  assert rather than the arithmetic: **`1 + BeltWidthFraction/2 <
  RadiusGrowth`** (`1.03 < 1.23`). While that holds, no belt member can
  reach the next index's radius, and no belt member can exceed `Extent`.

**Why members are bodies at all.** `decisions.md` (2026-08-27, *Places are
bodies*) settles that vacuum has no affordances, and `mine-extraction`
targets belts by feature id today. Option (c) — a non-body annulus — deletes
belt mining, which the whole M10/M11 economy loop stands on. Option (b) — a
single point body with a decorative annulus — makes the largest visible
feature in the system a place you can only be at one spot in, which reads as
a lie the first time a player flies to it.

**Why derived members rather than N persisted features.** Emitting 8 belt
*features* would work and would give `mine` eight lodes for free, but it
changes the **lattice** interior too: eight footprints where there was one
arc, against a shipped `system-interior` requirement about belts as ring
arcs, and eight documents per belt in a subcollection whose representation
dies at link 9. Derivation keeps link 3 additive in the strict sense — the
persisted lattice interior for a given seed is byte-identical to what it was
— and gives link 6 a clean target: the `#` separator makes "which feature
owns this body" a pure string split with no lookup.

**Why 8.** Small enough that a system's knowable-place count stays in the
range `decisions.md` calls for ("five to seven planets, some moons, a
station, a gate per lane"); large enough to read as a cluster rather than a
handful. Bodies per system go from ~10–17 to ~18–41 with 1–2 belts.

**On the cost claim, corrected.** The brief states "every `disclosure`
predicate is O(bodies)". That is not what shipped.
`disclosure/occlusion.go` occludes with the **star only** (`decisions.md`,
2026-08-27, *Occlusion is star-only*), so the occlusion predicate is O(1) in
body count; live contact predicates iterate over *ships*, not bodies. The
real body-count costs are (a) the focused scan's sweep (`FocusedScanRange`
exists precisely so "sweeping every body in a system is not free"), (b) the
wire payload, and (c) the renderer. Those are the reasons 8 is small, not a
predicate blowup that does not exist. Flagged so the number is defended on
its actual grounds.

**Renderer note (permitted, and worth stating).** A client MAY draw a
decorative annulus band from the belt's stored radius and width. That is
projection-exempt geometry under `cross-stack-determinism`, derives no
rule-bearing value, and gives option (b)'s visual with option (a)'s
mechanics.

### Decision 6: The station orbits a generated major body, chosen purely from galaxy-tier inputs

**The call.** A station's continuous orbit parents to one of its system's
skeleton major bodies — `feat-body-k` with
`k = mix64(mix64(systemSeed)) mod len(skeleton.Bodies)` — with the period
from `space.InsertionPeriod` (Decision 3) and the system's dominant orbital
direction expressed as Decision 1's inclination. If the skeleton is empty
(degenerate, `MinBodies = 1` makes it unreachable today), it falls back to a
star-parented orbit at a named radius.

**The local radius: a type-keyed ceiling, NOT the parent's drawn size — the
original text was unimplementable and would have fail-opened at zero.** The
original said `parentSize + StationStandoff`. A skeleton body's *size is not
a galaxy-tier value*: `galaxy.Body` (`galaxy/model.go:46`) carries only
`Type`, `Ring`, `Mineable`, and per Decision 4 size is a per-feature draw
from the continuous stream **in draw order**, so reproducing it requires
replaying the whole interior generation — precisely the purity boundary this
decision draws. An implementer working only from the stated inputs has
exactly one resolution available: `parentSize = 0`, which places the station
*inside its own parent* for any body larger than the standoff. Third
zero-default fail-open in this change; closed here.

**The call:**

```
stationLocalRadius(parentType) =
      MaxFeatureSize(featureTypeForBody(parentType))
    + space.InsertionStandoff(space.Body{Size: that same ceiling})
    + StationStandoff                                  // = 1.5
```

Every term is galaxy-tier: `parentType` is `galaxy.Body.Type`,
`featureTypeForBody` is a pure mapping already in `system`, and
`MaxFeatureSize` is Decision 4's pinned ceiling table. No draw, no interior
read, no replay. Because the ceiling is an upper bound on the parent's
actual drawn size, the station is **guaranteed** to clear its parent's body
and its parent's insertion shell whatever that draw came out as — the
requirement's intent ("parent's size plus a standoff") preserved
conservatively rather than approximated.

| Parent | Ceiling | `InsertionStandoff` | Station local radius |
|---|---|---|---|
| gas giant | 4.2 | 8.8 | **14.5** |
| ice | 2.7 | 6.55 | **10.75** |
| rocky (incl. molten / oceanic / barren, which `featureTypeForBody` collapses) | 2.4 | 6.1 | **10.0** |

**And it lands, by construction, strictly between the two things it must
avoid.** At a gas giant — the only parent type that also carries moons —
the station sits at 14.5, above the parent's own insertion shell (13.0) so a
ship parked at the planet and a ship docked at the station are never in the
same place, and below Decision 16's moon-band floor (15.0) so the station is
inside every one of its parent's moons. Both inequalities are arithmetic
consequences of named constants, not bounds to check at runtime.

**Rejected: making `Feature.Size` a pure function of `(systemSeed,
featureId)` instead of a stream draw.** It would let the station read the
parent's exact size and is defensible in isolation — but it forces a change
to Decision 4, replaces a draw that costs nothing with a hash that must then
be fixture-pinned as its own family, and buys precision the station does not
need. A conservative ceiling is the *right* answer here regardless of what
is reachable: the station wants clearance, not accuracy.

**Purity is preserved, and the boundary is named precisely.** The derivation
reads `(systemId, galaxySeed, skeletonBodyCount, skeletonBodies[k].Type)` —
the last of which is a widening of the originally stated input set, and is
what makes the local radius derivable at all. The skeleton lives on the
**galaxy system node** — a galaxy-tier read `system.Generate` already makes
before an interior exists — not on the materialized interior. So the
`stations/placement.go:32` precedent holds verbatim: a healed re-provisioning
lands on the same orbit, and a fleet docked to a station resolves its
position by recomputing in-process rather than re-reading the station store.
`DeriveOrbit`'s signature gains the skeleton; it gains no store read.

**The law lives in `system`, and `stations` delegates.** `system` exports
`StationContinuousOrbit(galaxySeed, systemId string, skeleton
galaxy.Skeleton) space.Orbit`; `stations.DeriveContinuousOrbit` is a
one-line call to it. This is a governance decision, not a taste one: the law
consumes `MaxFeatureSize`, `featureTypeForBody`, and the inclination
convention, all of which are `system`'s; and putting a new rule-bearing
float law in `stations` would drag `stations` into
`check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES` (it is not there
today — the list is `board polar space disclosure fleet mine galaxy system
corporations market`) and into CI's hand-enumerated cross-target matrix as a
*third* package. Keeping every new rule-bearing float in `system` holds
Decision 13's CI edit to one package. `stations` importing `system` is the
existing direction of that dependency (`stations/placement.go` already
imports it), so no cycle.

**Chain depth.** station → planet → star is three levels.
`space.maxBodyDepth` is 4 and `resolvePosition` fails at `depth >= 4`, so
this resolves with room to spare — verified by tracing `body.go:47`, not
assumed.

**The defect this closes — half of it.**
`docs/defects/2026-08-26-station-on-gate-ring.md` records that
`DeriveOrbit`'s span is `[1, boardRadius-1]`, which includes the real gate
ring 13 under a radius-16 board. In the **continuous** representation the
defect cannot occur: a station parented to a skeleton major sits at that
major's radius (index ≤ 11 → ≤ 234.0) plus at most 14.5 units, while
Decision 7 puts gates at `Extent × 1.1 = 724.6`. Non-core and
off-gate-radius hold **by construction**, with no bound to check.

**But the defect does not close.** The lattice `DeriveOrbit` still returns a
lattice ring and can still return 13. Link 3 adds the continuous expression;
it does not touch the lattice one, and the lattice one is what the game runs
on until link 6 re-anchors docking. The defect document stays open and
should gain a note pointing at this design rather than being closed. **The
brief's "closes it for free" is optimistic by one link.** Flagged.

**Alternative considered.** *Keep the station star-parented at a derived
radius.* Simpler, no skeleton input, no chain depth — but it reintroduces
the collision-avoidance bookkeeping the defect is about (a star-parented
station must be checked against every planet's radius and against the gate
radius), and it loses the thing that makes a station read as infrastructure:
it orbits *somewhere*, and that somewhere is a place. Rejected.

### Decision 7: A lane gate is a motionless, star-parented body at `Extent × GateRadiusFactor`, on the ecliptic

**Radius.** `gateRadius = SystemInterior.Extent × GateRadiusFactor`, with
`GateRadiusFactor = 1.1` as a named placeholder — **724.6** under Decision
2's recalculated constants. Because every generated body's radius is
`≤ Extent` by Decision 2's construction (every family's orbital index is
`≤ params.Radius`; belt members are bounded by Decision 5's width invariant;
body-parented children by Decision 16's band ceiling), **every gate is
strictly outside the whole planetary disk**, with no maximum-scan and no
per-system variance. This is the "characteristic radius along that bearing"
that `decisions.md` left unvalued.

**A gate carries `GateSize = 1.2`** (Decision 4), not the zero the original
text left it at — `space.InsertionStandoff` reads size as its only per-body
input, and a zero-sized dock host is what link 4's dock verb would inherit.

*Alternative considered:* a fixed named constant. Rejected because it does
not scale with a system: the same absolute radius is outside a small
system's disk and inside a large one's, so gates would sometimes sit among
the planets. *Alternative considered:* a multiple of the outermost
**generated** body's radius. Rejected because detail features (extra bodies,
hazards) draw rings up to `params.Radius = 16` while skeleton majors stop at
11, so the "outermost body" is a high-variance random variable and gate
distance would swing 130→725 units on a hazard roll.

**Bearing.** The gate's phase index is `space.PhaseIndexOf` applied to the
horizontal projection of the vector from this system's `galaxy.Coords` to
the neighbour's — the discretized-choice primitive with the documented
tie-break (`crossAtOrBefore`'s `>= 0`: an offset lying exactly on a table
entry's direction resolves to that entry's own index).

**Inclination: the gate sits on the ecliptic. Elevation is dropped.**
Galaxy coordinates are genuinely 3D (`galaxy.Coords{X,Y,Z}`,
`HalfHeightZ = 80` against `MaxLaneLength = 180`), so this is a real choice
and not a rounding-away of a negligible term — a neighbour can sit at a
steep angle. It is dropped anyway:

- The Z coordinate's gameplay meaning is *which slab of the disk a system
  occupies*, a placement device for the Poisson field. It is not a direction
  anyone flies: lane transit is a hand-waved wormhole costing time only
  (`decisions.md`), so the geometry between systems is never traversed.
- Elevation would tax lanes at random. The only fuel a lane trip costs is
  the intra-system haul to the gate; a steeply-inclined gate makes that haul
  arbitrarily more expensive than a coplanar one, for a reason no player can
  see or act on.
- It keeps the derivation to **one** discretized value with an existing
  tie-break, instead of three (phase, inclination, node) plus an elevation
  angle needing its own `sqrt` and its own fixture family.

**Adding elevation later is purely additive, and the closed form is recorded
here so nobody re-derives it.** To place a motionless body at azimuth `A`
and elevation `E`: `Phase = SubTurn/4`, `Inclination = wrap(−E)`,
`Node = wrap(A − SubTurn/4)`. (At `Phase = 0` the offset lies on the line of
nodes, where inclination has no effect — which is the trap.)

**Motionless.** `PeriodMs = 0`, which `space/orbit.go:45` and
`space-kinematics` › *The Time Domain…* both define as held-at-stored-phase
with no division. This is the deliberate use of the non-positive period that
Decision 1 refuses to spend on direction. `LocalVelocity` returns the zero
vector, so a burn's arrival tangent against a gate is well-defined.

**A near-tie moves a gate by microns, not by a cell.**
`docs/defects/2026-08-25-lanegate-near-tie-divergence.md` exists because two
lattice gate candidates are a whole cell apart, so a knife-edge bearing
picks visibly different tiles. Under `PhaseIndexOf` the adjacent candidates
are `2^-20` turn apart — about `4e-3` units at the gate radius of 725. The
continuous representation dissolves that defect class rather than inheriting
it. The lattice defect stays open until link 9 deletes `board`.

### Decision 8: Gate synthesis reads the neighbourhood, never the whole galaxy

`system/gates.go:32` calls `s.galaxySvc.GetLive(ctx)` and scans every system
and every lane to find the ones incident to one system. Under the endless
galaxy (`4382779`) the materialized set grows without bound, and link 3 makes
this a **per-body-table-build** cost rather than a per-board-render one.

Gate synthesis moves to `galaxy.NeighborsOf(ctx, systemID)` +
`galaxy.GetLiveSystems(ctx, append(neighbourIds, systemID))` — the bounded,
point-read path `corporations`' spawn walk already uses. Ordering stays
deterministic (sorted by destination system id), which is what keeps the
body table's iteration order stable.

This is inside link 3's scope because link 3 is what makes the cost matter.
It changes no observable behaviour: the same gates, in the same order.

### Decision 9: `backend/system` owns the `space.Bodies` implementation

`space.Bodies` is `Body(id string) (Body, bool)` — synchronous, no
`context.Context`, no error. That signature is not negotiable (it is
shipped and fixture-pinned), and it is only satisfiable by a **materialized,
immutable in-memory snapshot** built once per request and then queried
purely.

**`system/bodies.go`**, holding an unexported `map[string]space.Body` and
exposing:

```go
type BodyTable struct{ /* unexported: bodies map, starId, starSize, extent */ }

func (t *BodyTable) Body(id string) (space.Body, bool)  // implements space.Bodies
func (t *BodyTable) StarId() string
func (t *BodyTable) StarSize() float64
func (t *BodyTable) Extent() float64
func (t *BodyTable) Ids() []string                       // stable order

func (s *Service) BodyTable(ctx context.Context, systemID string) (*BodyTable, error)
```

`BodyTable` composes, in one pass: the persisted interior's features
(including the spliced station, via the existing `StationSource` seam), the
derived belt members (Decision 5), and the derived lane gates (Decisions 7,
8). It is immutable after construction, holds no package-level state, and is
safe to share across goroutines. `Ids()` returns a deterministically ordered
slice so that any sweep over bodies (link 5's focused scan) produces stable
output — the same reason `disclosure.Attachments` requires a stable order.

**Why `system` and not a new package.** `system` already owns the interior,
already owns gate derivation, and already owns the station splice through an
interface (`StationSource`) built precisely so that `system` never imports
`stations`. Every input to the table is already in the package.
`system → space` introduces no cycle (`space` imports only
`hexaverse/common`). And critically, the table's construction shares the
`GetOrCreateInterior` path, so there is exactly one answer to "what is in
this system" rather than two that can drift.

**Alternative considered.** *A new `backend/bodies` package importing
`system` + `galaxy` + `stations`.* Cycle-free, but it duplicates the splice
seam that already exists, gives `fleet` and `disclosure` two places to ask
the same question, and contains nothing but a construction loop. It would be
right if the table needed inputs `system` cannot see; it does not. Rejected.

**Cost, stated.** One `BodyTable` build per request that needs positions:
one interior read (already made), one bounded neighbour read (Decision 8),
one station point-read (already made), and O(bodies) map inserts with no
position evaluation — positions are lazy, resolved per query through
`space.Position`. This is the same order of work the current fog projection
already does.

### Decision 10 (GATING): A lane gate imposes NO dwell time before jumping, and the question belongs to link 4

**The ruling: no dwell.** A fleet that has reached a gate may jump without
waiting.

**Why it does not gate link 3, contrary to chain.md:66 and
`decisions.md:190`.** The jump verb is `fleet-movement` › *Graph-Tier Travel
Order*, implemented at `backend/fleet/travel.go` (`orderTravel`,
`buildTrip`, `board.LaneTransit`), and it is still entirely on the lattice.
It moves at link 4. Link 3 adds no verb, no action type, and no fleet state
— so a dwell requirement written now would have **no implementable
scenario**: nothing in this change could satisfy it, and nothing could test
it. Writing it here would produce exactly the failure mode the chain's own
*Removed* section records (a delta that validates structurally against a
capability it cannot touch).

**Why "no dwell" is the answer that survives being wrong.** Adding a dwell
later is additive — a new pre-jump interval on the movement channel, one
requirement, one scenario. Removing one is a regression players feel
immediately ("why am I sitting here?"). Asymmetric costs, so pick the
loosening.

**Why it buys nothing today even on its own merits.** The argument for a
dwell is that it makes gate camping viable. But `proximity-disclosure` › *A
Docked Ship Is Masked and Registers Only As Its Host* already makes a
docked camper **invisible**, and `decisions.md` already establishes that an
arriving fleet parks *near* the gate unmasked while the camper sees it and
it does not see the camper. The camper's advantage is total and instant. A
dwell would add exposure time to an interaction that has no resolution
mechanic attached to it: there is no combat (deferred, `decisions.md`), and
focused-scan-at-gates is not specified. It would be a delay with no verb
pointed at it — the definition of friction without gameplay.

**Reassign, don't defer.** The question moves from "gates link 3" to
"decided within link 4, alongside the jump verb, cut drive, and stop in
place" — which is where a dwell would actually be expressible, and where its
real counterpart (whether a fleet can be attacked while docked at a gate
awaiting a jump) is already parked pending combat.

**Veto surface, stated plainly for Travis.** If you want gate camping to be
a real chokepoint game, the dwell is the wrong lever anyway — masking
already gives the camper everything, and what is missing is a way to *act*
on the arrival. The lever is combat or a gate-focused scan, both deferred.
If you disagree and want the dwell now, it costs one requirement in link 4
and no rework in link 3; nothing in this change forecloses it.

### Decision 11: The continuous draws run on a second, independently seeded RNG stream

**The hazard, already documented in this very file.**
`backend/system/generator.go:145-155` records it in `DominantOrbitDirection`'s
own comment: sharing the generator's `rand` stream couples a derived value to
generation **draw order**, so inserting one roll anywhere earlier silently
changes everything after it. Under Option A the generator produces both
representations, so drawing continuous elements from the same `*rand.Rand`
would make **every lattice placement a function of continuous-draw order** —
which means link 3 would silently re-roll every not-yet-materialized
system's lattice board, for no reason.

**The call.** A second stream, seeded by a splitmix64 finalizer over the
per-system seed with its own distinct constant:

```go
const continuousStreamSalt uint64 = 0x5CE1_A57E_0F17_C0DE // distinct from
                                    // DominantOrbitDirection's and stations'

func continuousSeed(systemSeed int64) int64 {
    x := uint64(systemSeed) ^ continuousStreamSalt
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
    x = (x ^ (x >> 27)) * 0x94D049BB133111EB
    return int64(x ^ (x >> 31))
}
```

`Generate` runs two `*rand.Rand`s side by side. The lattice stream's draw
sequence is untouched: every existing draw happens in the same order with
the same values.

**This is an acceptance gate, not a hope.** A golden test asserts that
`Generate(seed, region, skeleton, params)`'s **lattice** output — ring,
angle0, dir, footprint, resources, effects, ids, order — is identical before
and after this change, across a swept seed set. If it is not, the streams
have crossed and the change is wrong. This is cheap to write and is the
single highest-value test in the change.

**A note for the implementer.** Three splitmix64 finalizers now live in this
codebase (`system.DominantOrbitDirection`, `stations.mix64`, and this one)
with three different entry constants. Consolidating them behind one exported
helper with an explicit salt parameter is a reasonable tidy — but each
existing one's exact constant is load-bearing for already-generated data, so
the consolidation must preserve them exactly, and it is not required by this
change.

### Decision 12: Orbital elements cross the persistence boundary through `space.EncodeOrbit` / `space.DecodeOrbit`

`space.Orbit` carries no Firestore tags, deliberately. And
`space-kinematics` › *Coordinates Cross the Persistence Boundary Through a
Named Codec* already binds this case explicitly — "every position, control
point, **and orbital element set**" — so this is **discharge of an existing
requirement, not a new delta**.

**Added to `backend/space/params.go`:**

- `EncodeOrbit(o Orbit) map[string]any` → storage-native primitives only:
  `{"parentId": string, "radius": float64, "periodMs": int64,
  "phase": int64, "inclination": int64, "node": int64}`. Every value is in
  `action.Commit`'s existing `ErrNonPrimitiveParam` allowlist, so the action
  spine needs no change — the same property `EncodeVec` was built to have.
- `DecodeOrbit(v any) (Orbit, error)` — the exact inverse, routing `radius`
  through the existing `checkedCoordinate` (named, countable
  `ErrNonFiniteCoordinate` / `ErrCoordinateOutOfExtent`) and every angle
  through the existing `DecodeSubTurns`, and failing by name on a missing or
  mistyped key. It accepts the numeric shapes an in-memory literal, a
  Firestore round trip, and a JSON body decode disagree on, for the same
  reason `DecodeVec` and `board.decodeInt` do.

**The `system`-owned document shape.** `Feature` gains two fields, following
the `Orbit.Period firestore:"-"` + DAO-fills discipline the package already
runs:

```go
Space    *space.Orbit   `json:"space,omitempty"    firestore:"-"`
SpaceDoc map[string]any `json:"-" firestore:"spaceOrbit,omitempty"`
Size     float64        `json:"size,omitempty"     firestore:"size,omitempty"`
```

The DAO calls `space.EncodeOrbit` on write and `space.DecodeOrbit` on read;
nothing else in the codebase constructs or reads `SpaceDoc`. A feature whose
`SpaceDoc` fails to decode is **omitted and logged with its id**, exactly as
`readInterior`'s existing `featureRingOK` guard does — one bad feature never
stops the loop. `SystemInterior` gains `Extent float64` (a plain persisted
scalar, not an element set, so no codec).

**Omission MUST cascade through the parent chain — otherwise omitting one
feature poisons the table permanently.** The lattice's `featureRingOK` guard
could omit a feature in isolation because lattice features are independent.
Continuous features are not: they form a parent tree. Omit a gas giant and
its moons survive in the table naming an absent parent, so
`space.resolvePosition` returns `ErrUnknownBody` for each of them at **every**
world time, forever — a permanent, silent, per-corporation read defect, and
a body that link 4 could commit a burn against and never resolve. The
station is the sharpest case: its parent is `feat-body-k`, a feature it does
not own and cannot repair.

The rule: after decoding, the reader iterates to a fixpoint, dropping any
non-star body whose orbit's parent id is not present among the surviving
bodies. Belt members and gates are derived after the fixpoint, so a belt
whose feature was dropped mints no members. Every cascaded drop is recorded
with its own id **and** the id of the ancestor that caused it, distinguishably
from a direct decode failure — a cascade of eleven from one corrupt document
must not read as eleven corrupt documents. The termination argument is the
chain-depth bound (`space.maxBodyDepth = 4`), so the fixpoint converges in at
most three passes and needs no cycle guard of its own.

The resulting invariant is the one the table's consumers actually depend on:
**every body in a built table resolves through `space.Position` with no
error.** That is worth asserting directly, once, over a swept seed set.

`Feature.ParentId` (the existing lattice field, set only for moons) is left
alone and dies at link 9. The continuous parent lives inside `space.Orbit`
where `space.Position` looks for it.

**The period is persisted — which is the opposite of what the lattice does,
deliberately, and the tension is named here so nobody rediscovers it
mid-playtest.**

`system-interior` › *Orbital Period Read from Live Tuning* is shipped, and it
binds the lattice representation to the other call: it SHALL NOT persist a
feature's orbital period, filling it instead from the live tuning function
`PeriodFor(ring)` at read time, "so retuning orbit pacing changes the pace of
every already-materialized system on its next read." Decision 12 persists
`periodMs` inside the encoded `space.Orbit`. This is the one place where the
two coexisting representations make genuinely opposite persistence decisions
about the same physical quantity.

**The consequence, stated plainly, because it is otherwise invisible:
retuning `KeplerBaseSeconds`, `KeplerBaseRadius`, or `space.InsertionPeriod`'s
constants will NOT re-pace any already-materialized system.** The lattice's
`PeriodFor` *will* keep re-pacing them, so a mid-playtest pacing tweak can
produce a board that visibly changes pace and a continuous body table that
does not budge — with nothing broken and nothing logged. Decision 15's
wipe-and-reseed is the mechanism that applies a continuous pacing change.
There is no other one, and none should be added (a lazy re-derive on read is
explicitly rejected there).

**The orchestrator adjudicated this and upheld persisting the period.** Three
supporting arguments, recorded so the call is auditable rather than
re-litigated:

1. **One body's physics must be internally consistent at one instant.** Every
   other continuous quantity in this change — Decision 2's radius law,
   Decision 4's size bands, Decision 1's inclination convention,
   `SystemInterior.Extent` — is fixed at generation and applies through
   wipe-and-reseed rather than live re-derivation. Live-deriving the period
   *alone* would let a body carry a radius reflecting one era's law and a
   period reflecting another's. Kepler's third law relates exactly those two
   quantities, so that pair is not merely stale, it is internally
   inconsistent physics for the same body at the same instant. Persisting the
   whole element set keeps a stored orbit self-consistent by construction.
2. **The codec must stay a dumb symmetric round-trip.** `space.Orbit` is a
   single opaque value type, shared with parks (`space/park.go`) and with
   link 4's future dwell/stop states. A generic `EncodeOrbit`/`DecodeOrbit`
   cannot special-case "recompute `PeriodMs` from `Radius` via whichever law
   applies to this parent" without smuggling generation-time domain knowledge
   into the persistence boundary — which law, star-parented Kepler or the
   body-parented insertion law, and does a *park* obey either? The lattice can
   afford a read-time fill precisely because `PeriodFor` is one law over one
   integer; the continuous side has two laws over a parent chain and a value
   type that is not exclusively a generated body.
3. **The lattice requirement is scoped, not cross-cutting.** Its own text is
   about `PeriodFor` remaining linear in ring index and about slot-count
   non-uniformity across ring bands — all discrete-lattice concepts. It is
   correctly read as governing the ring-indexed law it names, not as a
   general principle about orbital periods that link 3 inherits.

### Decision 13: `fixtures/system/` is byte-for-byte on both Go legs, and the parent design's stop rule applies unchanged

`backend/system` is already governed by both determinism checks — a useful
correction to the assumption that widening is needed:

- `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES` **already contains
  `system`** (line 81), and the `pinned` pragma is **already in its accepted
  vocabulary** (added by `add-space-kinematics`). No script edit is required
  for Decision 3's `math.Sqrt`.
- `check-fma-contraction.sh` builds the **whole backend module**
  (`go build -gcflags=-S ./...`) on both targets, so `system` is covered on
  day one and **any** new arm64 FMA site fails the gate immediately,
  unregistered.

**What the change must therefore do:**

1. **Guard every product.** Every multiply-add in the new generation math —
   the geometric radius loop, the Kepler expression, the size and jitter
   scalings, the belt-member derivation — wraps its products in an explicit
   `float64(...)` conversion. Assigning to a local does **not** inhibit
   fusion (parent design, Decision 5). Acceptance: zero new arm64
   `FMADDD`/`FMSUBD` sites in `backend/system`.
2. **Record `fixtures/system/cases.json`.** Families, one per function per
   the existing rule: `continuousRadius`, `keplerPeriodMs`,
   `starSizeForClass`, `beltMemberOrbit`, `gateOrbit`, `stationOrbit`, and
   `interiorContinuousElements` (the whole generated element set for a seed,
   in generation order). Canonical serialization is
   `strconv.FormatFloat(v, 'b', -1, 64)` — mantissa-exponent, no decimal
   rounding — with an integer-valued output (a `WorldMillis` period, a
   `SubTurns` angle) serialized as its exact decimal `int64`, a
   multi-component output joined by `,` on that input's line, and an error
   outcome as a fixed sentinel token. Asserted **byte-for-byte** on both
   `GOARCH` legs.
3. **Every family carries a sweep, and the sweep type is named per family.**
   The original text pinned a sweep for exactly one of the seven. That is
   not compliant: shipped `cross-stack-determinism` › *Shared Board Math Is
   Pinned By a Cross-Language Golden Fixture* is explicit that "hand-selected
   cases document intent; the exhaustive or randomized sweep is what makes
   the family a contract," and it prescribes **exhaustive** for any
   rule-bearing function whose domain is enumerable within 10⁶ inputs and a
   **pinned randomized** sweep otherwise. Three of these seven are
   enumerable, which is a gift and should be taken:

   | Family | Sweep | Domain / draw |
   |---|---|---|
   | `continuousRadius` | **exhaustive** | integer orbital index `[0, 64]` — a recorded maximum generously above any plausible `params.Radius`, so the sweep does not silently narrow when the board radius is tuned. 65 inputs. |
   | `starSizeForClass` | **exhaustive** | the seven classes in `StarClassWeights` (`O B A F G K M`) plus one unrecognized-class input pinning the default. 8 inputs, enumerated in the recorded order. |
   | `beltMemberOrbit` | **exhaustive** | the realizable id space: `feat-belt-0` … `feat-belt-7` × `k ∈ [0, AsteroidsPerBelt)`. 64 inputs, enumerated by belt index then `k`, ascending. Both output components (radius, phase, inclination, size) on one line. |
   | `keplerPeriodMs` | **pinned randomized** | continuous R¹. splitmix64 on a pinned `int64` seed, box `[1.0, 2000.0]` (comfortably spanning `[BaseOrbitRadius, Extent × 3]`), 100,000 cases, draw mapping `lo + float64(f*(hi-lo))` with `f = float64(u >> 11) * 0x1p-53`, one generator word per case. Cheap per case; no reason to under-sample. |
   | `gateOrbit` | **pinned randomized** | continuous R³ × R¹: the two endpoint `galaxy.Coords` and the system extent. Box `[-200, 200]³` for each endpoint (spanning the field's own coordinate scale) and `[24, 1000]` for extent; 100,000 cases; coordinate-word consumption order recorded as `fromX, fromY, fromZ, toX, toY, toZ, extent`. |
   | `stationOrbit` | **pinned randomized** | mixed integer/string domain, not enumerable. Draw an `int64` galaxy seed from one generator word, a system id from the pinned corpus form `sys-%08d` over a recorded index box, a skeleton body count from `[1, MaxBodies]`, and a parent `galaxy.BodyType` from the recorded six-element ordered table; 50,000 cases; word-consumption order recorded. |
   | `interiorContinuousElements` | **pinned randomized** | splitmix64-seeded seed sweep, 10,000 seeds — the parent design's 100,000 is the wrong order of magnitude here because one case is a whole interior generation, not one function call. Digest over the newline-joined canonical serialization of every feature's element set **in generation order**. |

   Every randomized record pins, without exception: the PRNG and its integer
   seed, the input box, the case count, the integer→coordinate draw mapping
   with its explicit `float64(...)` product guard, the word-consumption
   order, the output serialization, and the SHA-256 digest over the
   newline-joined canonical serialization in draw order. A record missing any
   one of those is not a sweep; it is a hand-selected case with a large
   number attached.
4. **Record the no-JS leg explicitly.** `_meta.generatedOn.jsRuntime`
   carries a stated "no JS leg by design" sentence, matching
   `space/table.go`'s `noJSLegStatement`. An absent field reads as an
   oversight; a stated one reads as a decision.
5. **Widen CI's cross-target matrix. This is the change's one real
   determinism gap, and it is OPEN — not a formality.** Two corrections to
   the obvious reading, in opposite directions:
   - The **path filter needs no edit**. `.gitlab-ci.yml:74-76` is
     `fixtures/**/*` and its comment says it is family-agnostic by design, so
     `fixtures/system/**` already triggers `test-backend` and `test-frontend`
     (and the `git diff --exit-code -- fixtures/` no-drift assertion) on day
     one.
   - The gap is one level down. `test-backend`'s cross-target matrix
     **enumerates packages by hand**: `GOAMD64=v1 go test ./board/` and
     `./space/` (`.gitlab-ci.yml:342-352`), and the arm64 leg compiles
     exactly `./board/` and `./space/` under qemu-user (`:358-367`).
     `./system/` is in neither list. Until it is added, `fixtures/system/`'s
     byte-for-byte assertion runs on **one architecture** in CI and the STOP
     rule below is enforced only by the local `/check` gate. Required edits:
     add `GOAMD64=v1 go test ./system/ -short -count=1` to the amd64 leg, and
     a `system-arm64.test` build-and-run to the qemu block alongside the
     existing two.

   **And a second, pre-existing hole this change inherits rather than
   creates:** the arm64 leg is wrapped in `if [ -n "$QEMU" ]` and, when
   `TEST_RUNNER_IMAGE` lacks qemu-user, **prints a skip line and passes
   green**. That is a stated downgrade carried over from
   `add-space-kinematics`. So even after adding `./system/` to both legs, CI's
   arm64 assertion is green-by-absence until the runner image is rebuilt
   (`infra/docker/build-test-runner.sh`). Both facts are Risks, below — they
   must not be recorded as done work.

   *The other two governance claims in this decision are verified as already
   true, not aspirational:* `system` is present in
   `check-transcendental.sh`'s `RULE_BEARING_GO_PACKAGES`, the `pinned`
   pragma is already in that script's accepted vocabulary, and
   `check-fma-contraction.sh` builds the whole backend module on both targets
   (`go build -gcflags=-S ./...`), so a new arm64 FMA site in `system` fails
   the gate today with no script edit.

**The hard rule, inherited verbatim from the parent design: if the fixture
matrix does not go green byte-for-byte on both legs, STOP.** Do not
proceed to link 4. That rule has already caught this pivot's central false
premise once (`add-space-kinematics`, Context), and it caught a second one
inside link 1 (Decision 11's quintic).

**Register posture: a note, not an entry — and the brief's framing needs
correcting.** The brief describes "the open galaxy-coordinate ULP divergence
(which propagates into gate bearings at ~one sub-turn)".
`docs/defects/2026-08-25-galaxy-generation-arch-divergence.md`'s 2026-08-27
narrowing supersedes that: both original mechanisms are **gone from our
code** (every `backend/galaxy` FMA site is now `float64(...)`-guarded, the
trigonometric disc placement was deleted with rejection sampling, and Z is
discretized to an integer step count). Coordinates are contraction-free.
What remains is **third-party**: `opensimplex-go` emits 273 arm64 FMA sites,
and its output is compared against region thresholds that decide **which
systems survive**. That is not a sub-turn nudge to a bearing; it is a
different neighbour set, which would change a gate's *existence*, not its
angle.

So: **no new register entry.** Link 3 introduces no new deviation site and
bridges no violation. The residual is already filed, already open, and
already owned by `galaxy-generation`. The design records two facts instead:
(a) gate bearings inherit that residual through `galaxy.Coords`, and (b)
because `PhaseIndexOf` is a discretized choice with a documented tie-break at
`2^-20`-turn granularity, a coordinate perturbation moves a gate by at most
one sub-turn index — `~4e-3` units at the gate radius of 725 — with no whole-cell jump
available. Add a cross-reference note to the defect doc; do not close it.

### Decision 14: The generator is now the load-bearing side of the scale contract with `disclosure`

`backend/disclosure/params.go:24-58` calibrates its entire knob set against
**the PoC's** generated scale, and says so in its own comment: star size 6,
planets 1.6–4.2, innermost orbit 20–26, growth ×1.38–1.60, outer orbit
150–250. `PassiveRange = 12` is justified as "below the innermost orbit
(20)"; `PlumePerDriveOutput = 8.0` is justified as "class 2 at accel 8 → 128,
against outer orbits around 150-250."

**Those sentences were true of a TypeScript spike. After this change they
are true, or false, of `backend/system`.** The direction of the contract
inverts: `disclosure`'s constants stop being calibrated against a reference
and start being calibrated against production output.

Decision 2's **recalculated** constants are chosen to keep them true, and
the recalculation was forced by this contract as much as by B1: the smallest
radius any body can receive is now `ContinuousRadius(0) = 24.0` (> 12 ✓, and
> `PlumeFloor` 20 ✓ — which the previous `Base = 20.0` did *not* satisfy in
the one-body-at-index-0 case), the skeleton's outermost is typically 154.7
and at most 234.0, both inside the `150–250` band `disclosure/params.go`
cites, so a class-2 plume at 128 is loud across a good fraction of a system
without spanning it ✓.

The obligation is permanent and must be written down: **changing
`BaseOrbitRadius`, `RadiusGrowth`, `GenerationParams.Radius`, or the
`StarSize` table invalidates `disclosure`'s calibration**, and the two
constant files must cite each other. `disclosure/params_test.go` already
asserts the `PlumeFloor > PassiveRange` relationship rather than trusting a
comment; the analogous assertions here are tests this change should add, in
`system`, so the coupling is enforced rather than commented. There are
**five**, not one, and each reads the other capability's live constant
rather than a copied literal:

1. `ContinuousRadius(0) > disclosure.PassiveRange`
2. `ContinuousRadius(0) > disclosure.PlumeFloor` — the degenerate
   single-body-at-index-0 system is the binding case, and it is reachable
   (`MinBodies = 1`, and `distinctRings` can return `{0}`), so asserting
   this on the *typical* outermost skeleton radius would assert the wrong
   thing
3. `space.StarClearanceRadius(max(StarSize)) < BaseOrbitRadius` — no body
   inside its own star's burn-clearance shell. Through the exported
   function, since `starClearanceFactor` (`backend/space/params_const.go`)
   is unexported and unreadable from `system`
4. `1 + BeltWidthFraction/2 < RadiusGrowth` — Decision 5's member bound, the
   thing that keeps `Extent` a by-construction ceiling rather than a
   checked one
5. `galaxy.DefaultParams().MaxRings - 1 ≤ GenerationParams.Radius` — a
   skeleton major's raw ring can never exceed the orbital index `Extent` is
   computed at, which is what keeps `Extent` a genuine upper bound over
   *every* star-parented radius rather than only over the ones this
   generator places. It reads both live values —
   `galaxy.DefaultParams().MaxRings` (`galaxy/params.go`) and
   `GenerationParams.Radius`, itself `common.Tuning().BoardRadius`
   (`system/params.go`) — never a copied literal

### Decision 15: Regeneration is a wipe, not a backfill

Two facts:

1. Decision 11's second stream keeps the **lattice** output identical for
   every seed, so nothing already persisted becomes wrong.
2. But every **already-persisted interior has no continuous elements at
   all** — its documents predate the fields, and `GetOrCreateInterior`'s
   fast path returns the stored copy without regenerating.

There is exactly one answer under this repo's ground rules
(`README.md`: "No migration plans. No backwards compatibility. No data
preservation"; `MEMORY.md`: "solo toy, no backcompat"): **wipe the dev and
emulator galaxy and re-seed.** `make seed` / `cmd/seed` regenerates from the
same seed; `cmd/seed start-area` re-emits
`frontend/public/galaxy/start-area.json`. Prod exists and is unused.

**Explicitly rejected, so nobody proposes it:** a lazy backfill on read
("if `SpaceDoc` is nil, generate and write it"), a version-stamped
regeneration path, a migration script, or a dual-read that falls back to
deriving continuous elements from the lattice ones. Each is a compat shim
for zero users, each adds a code path that must then be deleted at link 9,
and each creates a second place where continuous elements can come from.

### Decision 16 (NEW): A body-parented child's local radius comes from a named band anchored on its parent's insertion clearance

**The hole.** Nothing in the original design or in any delta said what a
**moon's local radius** is. Decision 3 used "a moon at local radius 5" only
as an illustration; Decision 4 gave moon *sizes*, not orbits;
`generator.go:79-85` shows moons carry no lattice orbit at all, so unlike
every other family there is no ring to fall back on. Three conforming
implementations all ship today: local radius `0` (moon coincident with its
planet, `InsertionPeriod(0) = 5 s`, degenerate docking and a zero standoff),
`ContinuousRadius(parentIndex)` (moons at solar scale), or a large literal
that then violates *A Gate Sits Outside Every Generated Orbit*. This is the
same zero-default fail-open class as B2, and it is closed the same way.

**The call.** A body-parented child's local radius is

```
localRadius = parentSize
            + space.InsertionStandoff(parent)      // 2.5 + 1.5 × parentSize
            + MoonOrbitMin
            + u × (MoonOrbitMax − MoonOrbitMin)     // u ∈ [0,1), continuous stream
```

with `MoonOrbitMin = 4.0` and `MoonOrbitMax = 8.0`. The first two terms are
the *clearance* — the child is unconditionally outside its parent's body
**and** outside the shell a ship would park at the parent in, so a moon and
a parked hull are never in the same place. The band is drawn on the
continuous stream (one draw, Decision 11), which is what gives a gas giant's
several moons distinct orbits.

**Both ends of the band are load-bearing, and both are enforceable as
inequalities over named constants rather than as runtime checks.** Moons ride
gas giants only (`generator.go:79` iterates `giantIDs`), and Decision 4 puts
a gas giant's size in `[3.4, 4.2]`, so:

- **Floor = 15.0** (at the smallest gas giant: `3.4 + 7.6 + 4.0`). Strictly
  above the station's 14.5 at the same parent type (Decision 6), so a
  station is inside every moon of its host — deliberate, and stated so the
  two bands are never tuned into each other by accident.
- **Ceiling = 21.0** (at the largest: `4.2 + 8.8 + 8.0`). Strictly below
  `BaseOrbitRadius = 24.0`, which is the smallest star-parented radius in
  the system. **A moon therefore can never reach an adjacent star-parented
  orbit, and its distance from the star is always inside `Extent`** — the
  bound Decision 2 needs. The enforceable form is
  `maxGiantSize + space.InsertionStandoff(maxGiantSize) + MoonOrbitMax <
  BaseOrbitRadius`, asserted once; the stronger-looking statement about
  inter-ring gaps happens to hold too (gas giants only appear at index ≥ 7,
  where the gap to the next index is ≥ 23.5) but depends on
  `rollBodyType`'s banding and is too fragile to assert.

**Period** is `space.InsertionPeriod` over that band → `18.5–23.9` s, the
same order as the PoC's separately-rolled `7 + rand×12` s, with no new law.

**Applies to any body-parented child, not only moons.** The name keeps the
`Moon*` prefix because moons are the only family that uses it today; the
station uses Decision 6's fixed type-keyed radius instead, deliberately, so
that its placement stays derivable with no interior read. If link 4 or 6
mints another body-parented object, this is the law it inherits.

### Decision 17 (NEW): The continuous inclination's SIDE is read from the feature's already-drawn lattice direction, never re-rolled

**The drift.** Decision 1 makes retrograde an inclination past a quarter
turn, and Decision 11 puts continuous draws on an independent stream. Taken
together they re-roll the capture-plausible retrograde coin
(`diskOrCaptured`, `RetrogradeChance = 0.1`) for the continuous elements —
so an extra body, anomaly, or ruin can be **prograde on the lattice board and
retrograde in the body table**, for roughly 10% of the ≤5 such features per
system. Decision 2 mitigates *ordering* drift between the two
representations by reusing the ring; nothing was doing the same for
direction, and this is a place where the two expressions of the same dice
would genuinely contradict each other rather than merely differ in
resolution.

**The call, and it costs zero draws.** The continuous inclination's side is
`sign(f.Orbit.Dir)` — the direction the lattice generator already drew for
that same feature (the `dir` argument `orbitFeature`/`beltFeature`/
`hazardFeature` already receive and persist). `Dir > 0` → prograde, draw an
inclination near 0; `Dir < 0` → retrograde, draw near `SubTurn/2`. Only the
**tilt jitter magnitude** comes from the continuous stream.

**This does not cross the streams.** Decision 11's invariant is that no
continuous draw may perturb the *lattice* draw sequence. Reading a lattice
draw's already-computed **output** is one-directional and cannot: the lattice
stream advances identically whether or not anything reads `Dir` afterward.
The golden lattice-identity test in step 2 of the sequencing is unaffected
and remains the acceptance gate.

**Moons and the station have no lattice `Dir`** (moons carry no lattice
`Orbit` at all). Both take `DominantOrbitDirection(seed)` directly — which is
exactly what `stations.DeriveOrbit` already does, and what "disk-born" means.

**What it forecloses.** A future design wanting a body's continuous
inclination to be independent of its lattice direction — for a captured
object whose 3D tilt is the point — has to wait for link 9, when the lattice
direction is deleted and the constraint evaporates on its own. Cheap.

## Risks / Trade-offs

- **Two representations of the same dice, for six links.** The accepted
  Option A cost. The mitigation is that they are *independent* — derived
  from one seed on two streams, with neither consulted by the other — so
  they cannot silently disagree in the way a dual-write can. What they *can*
  do is drift in ordering and in direction, which Decisions 2 and 17 address
  by deriving both from draws the lattice placement already made.
- **`BodyTable` has zero consumers when this lands.** Same risk `space` and
  `disclosure` carried (a capability with no consumer can drift from what
  the consumer will need). Same mitigation: the fixture family, not the
  code, is the contract — and unlike links 1 and 2, this one has a real
  downstream shape to hit (`disclosure.World` needs exactly `Bodies`,
  `StarId`, `StarSize`, which is why `BodyTable` exposes exactly those).
- **A hazard or extra body can outrank a skeleton major in radius, and can
  tie one.** Detail features draw rings up to `params.Radius = 16` while
  skeleton majors stop at `MaxRings-1 = 11`, so a nebula can sit at 658.7
  with the outermost planet at 234.0. That is astronomically fine (Oort-ish
  outer junk) and Decision 7's `Extent` anchor makes it harmless for gates,
  but it means "the outermost body" is not "the outermost planet" and no
  rule should be written as if it were. Separately, a detail feature can
  draw the same orbital index a skeleton major holds and land on the
  identical radius at a different phase: that is a co-orbital pair, it is
  legal, and Decision 2 scopes the strict-ascent and minimum-spacing laws to
  skeleton majors precisely so no scenario asserts otherwise.
- **Belt members are derived, so their count is a code constant, not
  data.** Changing `AsteroidsPerBelt` changes every belt in every system
  retroactively, including ids. That is desirable now (a feel dial with one
  edit site) and becomes a hazard the moment link 6 lets `mine` accumulate a
  delta ledger keyed by a member id. **Flagged forward to link 6:** either
  freeze the constant at that point or persist it on the belt feature.
- **`system` is now a package where a careless multiply fails CI.** Every
  future edit to generation math inherits the `float64(...)` guard
  discipline and the fixture re-record obligation. That is a real ongoing
  tax on a package that used to be free to edit. It is also the price of the
  values being persisted and rule-bearing, and the alternative (register
  entries) is the requirement switched off with extra steps.
- **The byte-for-byte STOP rule is, until CI is widened, a LOCAL rule.**
  Decision 13's stop rule is the highest-authority gate in this change, and
  CI does not currently run it for `fixtures/system/`: the cross-target
  matrix enumerates `./board/` and `./space/` only, and its arm64 leg passes
  green when the runner image lacks qemu-user. Two of the three governing
  scripts genuinely cover `system` already, which makes it easy to read the
  whole determinism story as done — it is not. Mitigation: the CI edits are
  step 7 of the sequencing and are acceptance criteria, not cleanup; until
  they land, a divergence between legs is caught only by whoever runs
  `/check` on their own machine, on one architecture at a time.
- **A continuous pacing retune silently does nothing to existing systems.**
  Decision 12 persists `periodMs` while the lattice's shipped requirement
  live-fills its period from `PeriodFor`. The call is upheld and argued
  there, but the failure mode is a person, not a system: someone tunes Kepler
  mid-playtest, sees the lattice board re-pace and the continuous elements
  not, and concludes something is broken. Mitigation is documentation only —
  Decision 12 names it, and the answer is always wipe-and-reseed. The
  exposure ends at link 9, when the lattice period law is deleted and only
  one persistence rule remains.
- **The `disclosure` calibration coupling is now bidirectional and easy to
  break silently.** Decision 14's test is the guard; without it, a
  feel-tuning pass on orbit scale would quietly change what fleets can see,
  in a different package, with no failing test.
- **Four constants are now coupled by inequalities, not just calibrated.**
  `BaseOrbitRadius`, `RadiusGrowth`, `BeltWidthFraction`, `MoonOrbitMax`, and
  the `StarSize` table's ceiling participate in the by-construction bounds
  Decisions 2, 5, 7, and 16 lean on — the ones that make "a gate is outside
  every body" and "every radius is inside `Extent`" provable rather than
  checkable. A feel-tuning pass that moves one of them in isolation can turn
  a proof into a falsehood with no failing test. Decision 14's four
  assertions are the mitigation, and they are acceptance criteria, not
  cleanup.
- **The system got roughly four times bigger.** `Extent` moves from the
  original draft's 162.8 to 658.7 and the gate radius from ~179 to 724.6,
  because the recalculation had to clear `PlumeFloor` in the degenerate
  one-body case *and* land the typical outermost skeleton orbit in the band
  `disclosure` calibrates against. The visible consequence is haul time to a
  lane gate: ~19 world-seconds at the nominal acceleration of 8, against ~9
  under the old numbers. That is a feel judgement made on arithmetic with no
  play behind it, and it is the single most likely number in this change to
  move at link 8.
- **Nothing here is validated by play.** Every number in Decisions 2, 3, 4,
  5, 7, and 16 is a placeholder constant chosen to reproduce the PoC's
  *ratios*.
  The PoC's verdict ("movement feels so much better") was earned at the
  PoC's scale in sim-seconds; this lands at that scale in world-milliseconds
  under a world clock with its own time scale. The first honest feel test is
  link 8.

## Migration Plan

**There is no migration.** This change adds fields and a derived table. It
deletes nothing, deprecates nothing, moves no consumer, adds no endpoint,
and — per the Non-Goals ruling on `fogFeatureDTO` — neither changes nor adds
any response field. The one operational action is
Decision 15's wipe-and-reseed of the dev/emulator galaxy, which is a
development convenience, not a migration: there is no data worth preserving
and no user to preserve it for.

**The deletion schedule** (the commitment that makes Option A additive
rather than compat work):

| Link | Deletes |
|---|---|
| 4 | `fleet`'s lattice movement state and its lane-transit routing |
| 5 | `system/fog.go`, `system/fog_source.go`, `backend/observation` and its spec |
| 6 | lattice position/dockability in `mine`, `market`, `stations` (incl. `stations.DeriveOrbit`'s lattice form and its open defect) |
| 8 | the lattice wire shape (`footprint`, `angle0`, `ring`, `dir`) and `board-view` |
| 9 | `Feature.Orbit`, `Feature.Footprint`, `Feature.ParentId`, `Feature.Fixed`, `SystemInterior.Radius`, `system.PeriodFor`, `backend/board`, `backend/polar`, `frontend/lib/board`, `frontend/lib/polar`, `fixtures/board`, `fixtures/polar`, `board-tactical-math` |

**Sequencing within this change** (the order that keeps `/check` green at
every step):

1. `space.EncodeOrbit` / `space.DecodeOrbit` + their fixture cases — the
   codec first, because everything else persists through it.
2. The second RNG stream (Decision 11) **and its lattice-identity golden
   test**, before any continuous draw exists. If the lattice output moves,
   stop here.
3. The pure element laws: `ContinuousRadius` over the per-family orbital
   index (Decision 2), `keplerPeriodMs`, `StarSize`, `MaxFeatureSize` and
   the type-keyed size bands (Decision 4), the child local-radius band
   (Decision 16), the belt width law (Decision 5), and the inclination
   convention with its side read from `Dir` (Decisions 1, 17). Table-driven
   tests + `fixtures/system/` families, each with the sweep type Decision 13
   names.
4. Generator emission: every feature gains `Space` and `Size`, belts also
   gain `Width`; `SystemInterior` gains `Extent`. DAO write/read through the
   codec, with the omit-and-log guard **and its parent-chain cascade**
   (Decision 12).
5. Derived bodies: belt members (radius, phase, inclination, size),
   `system.StationContinuousOrbit` with `stations.DeriveContinuousOrbit`
   delegating to it (Decision 6), lane gates with `GateSize` + Decision
   8's bounded neighbourhood read.
6. `system/bodies.go` — `BodyTable`, `StarId`, `StarSize`, `Extent`, `Ids`.
   Assert it satisfies `space.Bodies` and can construct a
   `disclosure.World` at compile time.
7. Determinism gates: FMA audit on both legs, the fixture matrix on both
   legs, `./system/` added to `test-backend`'s amd64 *and* qemu-arm64
   cross-target enumerations (Decision 13, item 5 — the path filter already
   covers the family), and the **four** Decision 14 calibration assertions.
   `./stations/` needs no such edit, because Decision 6 puts the station's
   continuous law in `system` and leaves `stations` a delegate.
   **Byte-for-byte on both legs or stop.**

## Open Questions

### Genuinely open, and not blocking

- **What a belt member's identity means to the economy.** Link 6's call.
  Eight `#k` bodies where there was one lode: does each carry a share of the
  belt's tonnage, or does the belt keep one pooled lode that any member can
  be mined from? The second is closer to how `mine` works today (per-lode
  remaining is a fold keyed by feature id) and would make the `#` split
  load-bearing. Recorded, not decided — deciding it here would presume link
  6's re-anchoring shape.
- **Whether `Extent` should also bound where a ship may park.** Decision 7
  puts gates outside it; `decisions.md` says drift "needs no terminal
  condition" and the bound on sailing into the void is economic. So `Extent`
  is a framing and placement device today with no gameplay meaning. If it
  ever acquires one (a system boundary, a region of no-return), that is a
  new decision, not an extension of this one.
- **Star classes and star size.** Decision 4 now pins the actual table
  (`O 7.6` … `M 5.2`, default 6.0) over the classes `galaxy.rollStarClass`
  produces. The *spread* is still unmeasured — a large star occludes more
  (`disclosure`) and demands more clearance (`space.StarClearanceRadius`),
  so a wide spread is a real gameplay difference between systems and a
  narrow one is flavour. Started narrow; widening is a constant edit, but
  **bounded**: Decision 2's star-clearance invariant caps any entry at
  `BaseOrbitRadius / 2.5 = 9.6`, and widening past that requires moving
  `BaseOrbitRadius` with it.

### Carried forward, unanswered by design

- **Focused-scan pricing** — gates link 5, unchanged by this design.
- **Whether a fleet can strand** — gates link 7, unchanged.
- **What "holding" a body means; the mine entity's shape** — combat,
  deferred off-chain. Note that Decision 5 makes a belt eight holdable
  places rather than one, which is input to that question whenever it is
  taken up.
- **Whether a fleet can be attacked while docked at a gate awaiting a
  jump** — the other half of `decisions.md:190-192`. Answered by combat, not
  by this change; Decision 10 disposes of the dwell half only.

### Reversal cost of Decision 10, stated for the veto

Adding a gate dwell later costs one requirement and one scenario in
`fleet-movement` (a pre-jump interval on the movement channel, committed
through the existing action spine, resolving through the existing fold). It
requires no change to anything in this design: the gate is already a body,
already dockable, already motionless. The cost is bounded and stays bounded
— which is the whole reason it is safe to rule "no" now rather than block
link 3 on it.
