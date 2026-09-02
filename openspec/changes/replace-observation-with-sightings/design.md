# design.md — replace-observation-with-sightings (chain link 5)

## Context

`backend/disclosure` shipped at link 2 with **zero consumers by design** — the
mechanism authored ahead of its model so the model would inherit its five
invariants (recompute, squared, inclusive, canonical path, no persist) rather
than rediscover them. Link 3 gave every body a continuous orbit and made lane
gates ordinary entries in the same `space.Bodies` table. Link 4 gave fleets
continuous kinematic state, added the jump verb, and **deleted `observation`'s
live half outright** — the ambient coverage, the echo disc, the scan verb, the
path-swept reveal, the three-band feature projection, the fleet audience fog.

What that leaves is a game that cannot be played:

- `backend/disclosure` decides everything and is called by nothing.
- `system`'s interior read is a stated, temporary, **fully-disclosed interim**
  (`system/fog.go:projectUnfogged`), with a code comment naming this change as
  its successor.
- `POST /v1/fleets/:id/jump` **returns 500 for every caller**: `router.go`
  never calls `WithGraph` or `WithTierSource`, so `Jump` fails its own
  `s.graph == nil` guard (`fleet/service.go:721`) before any game rule runs.
  CI does not see it — `jump_verb_test.go` injects a `fakeGraph`.
- Even with the router wired, nothing reaches a gate: `system/gates.go`'s
  `chartedGates` filters every gate away for a corporation with no charted
  lane, and a fresh corporation has none — spawn charts zero
  (`observation.RevealArrival` mints home `explored` only), the scan that used
  to chart is deleted, and arrival-charting requires a charted lane to jump on.
- `galaxy.EnsureLaneHorizon` — the seam that materializes a system's true lane
  set past the frontier — has **no production caller at all**. The endless
  galaxy silently stops growing.

So link 5's brief is not "wire the fog filter." It is: **make the galaxy
traversable again, and make what a player perceives come out of `disclosure`
instead of out of a deleted package.** Four blockers, two of them silent, all
close here.

The model is not the open question. `proximity-disclosure` already specifies
masking and its chains, the focused scan, plume, star occlusion, lane-transit
invisibility, and sightings as stamped historical claims. What is missing is
**storage, wiring, a verb to attach the scan to, and the removal of the last
lattice-era preconditions**.

## Goals / Non-Goals

**Goals.**

1. Restore traversability end to end: spawn → burn to a gate → dock → jump →
   arrive → the crossed lane appears on the galaxy map → the destination's full
   gate set is present.
2. Wire `disclosure` into the reads that decide what a corporation perceives,
   and retire the fully-disclosed interim with a principled rule rather than
   another interim.
3. Give the focused scan a verb, a price, and an emission, per
   `decisions.md` 2026-08-29.
4. Persist the sighting pile — readable, inert, sellable later — under the
   narrow rule that no stored record decides live disclosure.
5. Rehome what survives of `observation` and delete the rest, package, spec,
   and stored collections.
6. Close the two recorded authorization defects and the two silent wiring
   defects, with tests that fail if either regresses.

**Non-Goals.**

- The renderer. `space`/`size` reach the wire here; drawing them is link 8.
- Economy re-anchoring (link 6), fuel (link 7), lattice deletion (link 9).
- Combat, mines, intel *selling*. The pile is written and readable; a market
  for it is downstream of link 6's exchange re-proposal.
- Automatic sighting mints from passive contact (Decision 20).
- Any per-hull positioning, directional sensors, or per-class sensor ranges.

## Decisions

### Decision 1 — The graph-tier ladder is rehomed as `galaxy-knowledge`, not deleted

`decisions.md`'s "no monotonic tier ladder" is scoped, in its own words, to the
live path: *"nothing carried forward **on the live path**."* The ladder has
never been on the live path. It answers a different question — *what does this
corporation know about the galaxy **graph***: which stars it has visited, which
lanes it has charted, which systems its market board and station reads are
allowed to name.

Eleven production files consume `observation.Tier`: `router.go`,
`galaxy/handler.go`, `galaxy/lane_source.go`, `system/handler.go`,
`system/gates.go`, `stations/service.go`, `market/params.go`,
`market/service.go`, `corporations/service.go`, `fleet/resolver.go`,
`cmd/seed/main.go`. Deleting the ladder rips working, shipped behaviour out of
`trading-station`, `market-price-board`, `galaxy-generation`, and
`corporation-spawn` for no gameplay gain.

**Pre-empting the obvious objection: this is not a backwards-compatibility
shim, and Travis's "delete, never deprecate" rule does not argue against it.**
That rule forbids building migration paths and compatibility layers for a toy
with no users — carrying dead weight so old data or old callers keep working.
Nothing here is dead weight: these are four capabilities' current behaviour,
exercised by their current tests, consumed by their current handlers. Deleting
would be *deleting features*, not deleting deprecation. Rehoming is a rename.

**Ruling.** The four surviving requirements move to a new capability,
`galaxy-knowledge`, in Go package **`backend/charts`** — `charts.Tier`,
`charts.TierExplored`, `charts.ChartedLanes`, `charts.ArrivalWrites`. The
`observation-fog-and-scan` spec and the `backend/observation` package are
deleted. The stored collections rename with them
(`corporations/{cid}/observations/*` → `.../charts/*`,
`corporations/{cid}/lanes/*` → `.../chartedLanes/*`); dev data is disposable
and prod is unused, so this is a rename with no carry, not a migration. Both
new collection names must be added to `CleanupFirestoreTestData()` — itself
another hand-maintained list of the species catalogued in link 4's task 9.9.

*Alternatives.* (a) *Delete the ladder outright* — forecloses the market's
visibility gate, the station read's tier gate, and spawn's minimum-distance
rule, all of which would then need reinventing under other names in link 6.
(b) *Keep the package named `observation`* — cheapest, and rejected: the name
is the thing the pivot deleted, and leaving it standing invites the next
reader to assume fog still lives there. (c) *Package `galaxyknowledge`* —
matches the capability id exactly, rejected for call-site noise
(`galaxyknowledge.TierRumored` at eleven sites); `charts` reads naturally
against the domain's own vocabulary ("charted lanes").

`FeatureObservation` and its DAO paths go with the deletion: they are the
per-feature memory the three-band projection read, and Decision 4 gives them no
successor.

### Decision 2 — Jump drops the charted-lane precondition; gates are the constraint

`Jump` currently requires `charted[laneId]`. That is a lattice-era bookkeeping
gate, and it is the head of the circularity: you cannot chart without arriving,
and you cannot arrive without charting.

**Ruling.** The precondition is removed. Jump-eligibility is exactly what
`decisions.md` said it was on 2026-08-27: *docked to the lane's own gate body*,
no dwell. `fleet.TierSource` and `ErrLaneNotCharted` are deleted with it.
Charting demotes to what it always described — **map knowledge and a sellable
intel product**, not a permission.

**This vindicates the 2026-07-14 ruling (#0006 Decision #17) rather than
reversing it.** That decision's substance was: *spawn charts nothing, and
finding the roads is the first thing you go and do.* Both still hold, and hold
more literally than before. A gate sits at `Extent × GateRadiusFactor`
(1.1 × the system's extent, `system/params_continuous.go:138`) — far outside
the passive range of a spawn park, whose whole calibration is that
`PassiveRange` (12) sits *below* the innermost orbit. A fresh corporation still
has to fly out and look. What changes is the *kind* of problem finding a road
is: **spatial, not bookkeeping**. That is precisely what "places are bodies"
means, and it is the reason the lane gate was made a body in the first place —
"making the gate a place you must reach is what keeps the graph a gameplay
object."

It also composes with the sighting pile exactly as the intel economy wants:
someone who has flown the lanes holds charted-lane records and sightings that
someone who has not flown them cannot derive. Charting is now *worth* selling
precisely because it is no longer *required*.

*Alternative.* Keep the precondition and add a charting source (a "survey the
gate" verb, or spawn charting its home lanes). Rejected: both restore a
permission system on top of a physical one, and the second re-opens the
question #0006 Decision #17 closed.

### Decision 3 — Three charting writers, all cheap, none a verb

With the precondition gone, charting is free to be generous:

1. **Jump arrival** charts the lane crossed, `via: traveled` — unchanged,
   already in `ArrivalWrites`.
2. **Attaching to a gate body** charts that gate's lane, `via: gate`. The burn
   resolver already knows the instant `AttachedTo` becomes a body id; a gate id
   is `"gate-"+destSystemId` by `system.gateId`'s convention, so the lane id is
   derivable **purely** — no read — by exporting `galaxy.LaneIdBetween(aSysId,
   bSysId)` over the existing `laneIdFor`/`CellForSystemId` pair
   (`galaxy/field.go:40,47,75`). This is what lets a scout fill in a map by
   flying, and it means the galaxy view paints the lane *before* you commit to
   crossing it.
3. **Purchased intel** — no writer, schema room already present (`via`).

*Alternative.* Chart on arrival only. Rejected: the map would then lag the
player's actual knowledge by one jump, and a scout could not chart anything to
sell without crossing.

### Decision 4 — Bodies are public; disclosure gates ships. That is the interim's real successor

Link 4 left `system-interior` serving every feature in full to every
authenticated requester and called it "a deliberate interim" whose successor is
"a `disclosure`-projected read." Reading `proximity-disclosure` as shipped, the
successor is not a per-feature projection at all: **every requirement in that
capability is about ships.** Contacts, plumes, masking, chains, focused scans,
sightings, lane transit. Bodies appear only as occluders and as masking hosts —
and the masking requirement is explicit that *a host's disclosure is
field-for-field identical whether or not something is masked at it.*

**Ruling.** A system's bodies — position, size, orbit, type, resources,
effects, station, gates — ship in full to every authenticated requester. This
is not the interim continued; it is the permanent rule, and it follows from
`galaxy-generation`'s own existing stance that the star field is public
astronomy. The intel economy is about **ships**: the sighting atom is
`(subject, position, system, worldTime)`, and "I saw that fleet parked at
x,y,z" is the sentence the whole model exists to produce. Nobody sells you the
fact that the fourth planet has an iron lode.

`system-interior`'s *Interior Reads Are Fully Disclosed, A Deliberate Interim*
is therefore REMOVED and replaced by a requirement that says the same thing for
a stated reason instead of as a placeholder — the spec writer should name it
something like *Bodies Are Public; Ships Are Disclosed*.

*Alternatives.* (a) *Keep resource/effect detail scan-gated* — requires a
per-feature memory store, keyed per corporation, consulted on every read: that
is `observation`'s deleted machinery under a new name, and it needs a
"scan a body for composition" verb the focused scan explicitly is not (it
sweeps a host for *ships*). Forecloses nothing to leave out; adding it later is
additive. (b) *Gate bodies by proximity like ships* — makes a system's map
flicker as fleets move, destroys the "five to seven planets, knowable" property
`decisions.md` picked bodies-as-places to preserve, and would hide the very
gates Decision 2 just made the navigational primitive.

### Decision 5 — Gate bodies ship unfiltered; `chartedGates` is deleted (blocker 2)

Directly downstream of Decisions 2 and 4. `chartedGates`, `BoardFog`, and
`system/handler.go`'s tier lookup are deleted; `system-interior`'s *Charted
Lane Gate Filtering* requirement is REMOVED. A gate ships as a body in the
body list — id, position, size, and `destSystemId` — to any requester.

The information leak this filter existed to prevent (learning an uncharted
neighbour's existence) is not one under the shipped model: **every system's
star already ships to everyone** on the galaxy read, publicly and by design.
What was fog-gated was the *edge*, and it stays gated *on the galaxy map* — a
corporation still cannot route-plan across lanes it has never charted. What
changes is that standing next to a physical gate and reading the sign on it
tells you where the road goes. That is the intended shape of "finding the roads
is a spatial problem."

### Decision 6 — Foreign presence is a contact list on the interior read, union-deduped

`disclosure.Contact` deliberately carries **no id** — a stable per-read
identity is a tracking affordance the capability declines to grant. A contact
therefore cannot be an element of a fleet-shaped, id-keyed collection.

**Ruling.** The interior read (`GET /v1/systems/:systemId`) gains a top-level
`contacts` array alongside `features` and `laneGates`. It is the right home:
that endpoint is already per-requester, already resolves the `BodyTable` that
`disclosure.World` needs, and already runs the `action` read-fold that settles
a due burn before projecting. One body-table resolution, one disclosure
evaluation, one answer to "what does this corporation perceive in system S."

Observers are the requester's own fleets in that system (Decision 12). The
contact set is the **union across observers, deduped by internal target id
before projection**. Dedup is load-bearing, not tidiness: `Disclosure Is
Decided Server-Side and Undisclosed Entities Are Absent` forbids any aggregate
that varies with an undisclosed entity's state, and a duplicated contact would
leak how many of your own fleets can see it, which is a fact about your own
sensor geometry that the response has no business restating per observer.

*Alternatives.* (a) *Fold contacts into `GET /v1/fleets?systemId=`* — forces a
synthetic id onto an id-less struct, or a second array on a list endpoint whose
element type is a fleet. (b) *A new `GET /v1/systems/:id/contacts`* — a second
body-table build and a second read-fold per poll, for a payload that is always
wanted alongside the interior anyway.

### Decision 7 — Fleet read endpoints stay own-fleets-only, permanently

`fleet-movement`'s *Fleet Read Endpoints Serve Own Fleets Only* is currently
recorded as a temporary interim pending link 5. It becomes the permanent rule.
A foreign fleet has no addressable identity (Decision 6), so `GET
/v1/fleets/:id` on someone else's fleet 404s not as a redaction but because
there is no such handle — which is exactly the shipped scenario *A direct read
of an undisclosed entity is indistinguishable from absence*. Foreign presence
reaches a client through the contact projection and nowhere else.

### Decision 8 — The focused scan is a sensor-channel action whose ETA scales with range, and the range math lives outside `disclosure`

`POST /v1/fleets/:fleetId/scan {hostId}` commits an `action` of type `"scan"`
on **`action.SlotSensor`** (`activeScanId` — declared and unwritten by link 4
precisely for this), `action.KindMutating` (the `action.Kind` doc comment
already names scan as the mutating case), with
`eta = commitTime + roundTripMs(d)` where `d` is the distance from the scanning
fleet to the host at commit.

**`roundTripMs` does not live in `disclosure`.** A duration linear in `d`
requires a square root, and `disclosure/purity_test.go` fails the build on
`math.Sqrt` anywhere in that package. It lives in the scan verb's own service
and calls `space.Vec3.Length()` — the correctly-rounded, `determinism:allow`-
pragma'd call `fleet.Jump` already uses to price a lane crossing
(`fleet/service.go:752`), quantized by `space.QuantizeArrival` like every other
stored duration. Same precedent, same arithmetic, no new determinism surface.

*Alternative.* Price by squared distance to keep the computation inside
`disclosure`. Rejected: a duration quadratic in range makes the far end of
`FocusedScanRange` (48) sixteen times the cost of the near end, which is a
prohibition dressed as a price — and it would put a gameplay pricing function
inside a package whose whole contract is that it is a pure predicate library.

### Decision 9 — The sweep emits on its own channel, at a range-scaled floored radius

`decisions.md` settled *that* the scan emits and left *how* to the spec. Two
sub-rulings.

**Radius: `scanEmissionRadius(d) = max(ScanEmissionFloor, ScanEmissionPerRange
× d)`**, with `d` the commit-time range to the host, both constants named in
`disclosure/params.go`. Proposed values: floor 20 (equal to `PlumeFloor` — a
sweep is at least as loud as the quietest possible burn), `k = 2.0`, so
sweeping a body you are parked beside (d ≈ 12) reaches 24 while sweeping at
maximum range (48) reaches 96 — comparable to a nominal class-2 burn's 128, and
strictly below it. That delivers `decisions.md`'s own stated consequence —
*"a thorough search is the most detectable thing a fleet can do short of
burning"* — as an emergent property of one constant rather than as a rule, and
it gives proximity a second payoff beyond tempo: sweeping close is quiet,
sweeping far is loud. `params_test.go` pins both relations
(`ScanEmissionFloor > PassiveRange`; `k × FocusedScanRange` < a nominal burn
plume) the way it already pins `PlumeFloor > PassiveRange`.

*Alternatives.* (a) *Reuse `PlumeRadius`* — rejected outright: a parked sweeper
has no `commandedAccel`, and synthesizing one is a fiction that would then be
read back as a burn parameter. (b) *A flat constant* — cheapest, and it throws
away the only lever that makes "sweep the thing next to you" a different
decision from "sweep across the system"; range-scaling is structurally
identical to the plume channel, so it costs one function.

**Flag: a distinct `Contact.Scanning bool`, with its own radius**, not
`Contact.Emitting`. `Emitting` means *running its drive*, and `PlumeRadius`
takes `commandedAccel`; a zero-velocity emitter reported as `Emitting` is
incoherent and would corrupt the one signal the client uses to predict where
something is going. Reporting nothing at all defeats the ruling's own stated
payoff — *"a masked fleet that sees itself being swept learns something too."*

`detectionRadius` becomes `obs.PassiveRange + max(plume, scanEmission)`, with
each flag reported independently: a fleet burning *and* sweeping reports both.

**`disclosure/contact_test.go` asserts `Contact`'s field set by reflection**, so
adding `Scanning` is a deliberate, named test edit. The delta must say so; a
silent test edit here is indistinguishable from the leak the test exists to
catch.

### Decision 10 — Scanning breaks masking, exactly as lighting a drive does

A masked fleet that commits a sweep is unmasked for the sweep's interval.
Without this, the counter-verb has no counter: a fleet docked at a gate could
interrogate every body in reach from perfect safety, and `decisions.md`'s
*"looking for hidden ships tells the hidden ships where you are"* would be
false in the one situation it most matters — the camped gate. `Masked` gains
the same disjunct it already has for emission.

### Decision 11 — The sweep window is a stored field on the fleet doc

`fleet.Fleet` gains `Scan *ScanWindow {HostId, DepartMs, ArriveMs, Range}`,
mirroring `Jump *JumpTransit` field-for-field in shape and lifecycle
(non-nil only while running, cleared at resolve). `disclosure.Ship` gains a
matching `Scan` field, and `disclosure.Scanning(s, t)` is the same exact
integer interval test `Emitting` is — `DepartMs <= t < ArriveMs`, no float, no
boundary to flip, no build target to disagree.

Two properties this buys. First, `disclosure` reads the sweep the way it reads
`State.Burn`: as a **stored value read directly, never re-derived from motion**
— which is what `Plume Radius Derives From Drive Output` already demands of the
loud channel, and which keeps the emission radius from sliding around as the
scanner drifts. Second, it preserves the package's two-import purity
(`common`, `space`), asserted structurally by `disclosure/purity_test.go`.

*Alternative.* Store the window on the `action` document and have `disclosure`
read it there. Rejected: it makes `disclosure` depend on the dispatch spine, and
the actor doc is already where the single-slot claim writes.

### Decision 12 — Masked and docked fleets observe; only lane transit blinds

**A docked, masked fleet is a full observer.** Masking governs whether you are
*disclosed*, never whether you *perceive*. This is forced, not chosen:
`decisions.md`'s lane-gate entry records as a settled consequence that *"the
camper sees the arrival; the arrival does not see the camper"* — if masking
blinded the camper, the entire gate-camping matchup, and the reason a dwell
timer was rejected, would be false.

**The one exclusion is lane transit**, and it too is forced rather than chosen:
a transiting fleet has no position in either system, and
`space.StatePosition` cannot produce one for it (`fleet.ErrFleetInTransit`).
There is nothing to observe *from*.

Stations are not observers in this change — the NPC station has no corporation,
and giving a player-owned station a sensor bubble is link 6's question at the
earliest.

### Decision 13 — Sightings mint through `ResolveResult.Writes`, read inside the resolve transaction

The sweep must enumerate the chain masked at its host, which `action.Resolution`
cannot hand it — that surface exposes only `DecodeActor` and `Remaining`.

**Ruling.** `ScanResolver(ships ShipSource, bodies BodySource)` is a closure
that performs its reads **inside the resolve transaction callback** and returns
the minted records as `ResolveResult.Writes`, at deterministic document paths
(`corporations/{cid}/sightings/{actionId}_{targetId}`, and
`{actionId}_clean` for a clean sweep) so that `MergeAll` re-application is an
idempotent overwrite and re-resolution can never double-mint.

**This is the strongest existing precedent, not a new pattern.** `BurnResolver`
already takes an injected `BodySource` and calls `bodies.BodyTable(ctx, ...)`
from inside the resolve callback (`fleet/resolver.go:60`); `Resolution`'s own
contract forbids resolver *writes*, not resolver *reads*. On contention the
transaction re-runs and the reads re-run, which is correct: the records are
folded at a frozen world time (Decision 14), so a retry produces the same
answer.

**I am overruling the analyst's recommendation here, and the reason is
durability.** Resolving candidates at the service layer and writing sightings
*after* the resolve transaction — the shape `Service.Get` uses for jump's
post-resolve interior materialization — has a hole the jump case does not: a
crash between the status flip and the write loses the sightings **permanently**,
because the action is already `done` and nothing re-runs it. Interior
materialization is create-if-absent and self-heals on the next read of that
system; a sighting mint does not self-heal. Note that `JumpResolver` itself
supports this reading: its *effect* (the arrival charts) goes through `Writes`
inside the transaction, and only the self-healing side work is deferred.

*Alternative also rejected: freeze the candidate set into `Params` at commit.*
The sweep's ETA is a round trip that can be long; the chain beneath a host at
commit is not the chain at pulse-reach, so this would mint records of ships
that had already left — a correctness bug, not a performance trade.

### Decision 14 — `asOf` is pulse-reach, and the shipped contradiction is resolved here

`proximity-disclosure` shipped self-contradictory: *A Scan-Minted Sighting Is a
Stamped Historical Claim* says records are stamped `asOf` **the world time the
pulse reached each target**, while *A Focused Scan Reveals the Ships Masked At
Its Target*'s clean-sweep scenario says **the resolution time**. They differ by
half a round trip.

**Ruling: pulse-reach.** `asOf = DepartMs + (ArriveMs - DepartMs)/2` — integer
arithmetic on `WorldMillis`, truncating, exact, no float. Every kinematic field
on the record is folded at that instant, clean-sweep records included. The
clean-sweep scenario is corrected in this change's delta, and the design records
that it shipped contradictory rather than pretending one reading always held.

Pulse-reach is what makes a sighting a **historical claim** instead of a report:
the echo shows where things *were* when the pulse hit them, and the data arrives
stale by construction. That staleness is the entire intel economy — stamping the
record with the moment the player *learned* it, rather than the moment it was
*true*, would quietly delete the model's central property.

### Decision 15 — Geometry is checked twice, at commit and at pulse-reach, and a failed sweep mints nothing

`disclosure.FocusedScan` already evaluates range and occlusion at a single time
`t` and returns `ErrScanOutOfRange` / `ErrScanOccluded`. The verb uses it
unchanged, twice: at **commit**, against live positions, so an impossible order
fails fast (the shipped rejection requirement); and at **pulse-reach**, from the
scanner's folded position at that instant, so the sweep resolves with a distinct
`ReasonCode` (`outOfRange` / `occluded`) and mints nothing if the geometry was
not held.

This is zero new code and a real decision: you cannot sweep-and-run. The sensor
channel and the emission are spent either way, which is the cost of a sweep you
failed to maintain. **The return leg is not modelled** — one check, at
pulse-reach. Modelling the echo's return doubles the predicate count to decide
the same boolean and adds a failure the player cannot see coming.

### Decision 16 — `Sighting` gains `SystemId`; the wire carries no subject key

**`SystemId` is added to `disclosure.Sighting`** (S4). A bare `Vec3` is
meaningless without the system it is in — the README's own atom is
`(subject, position, system, worldTime)` — and link 5 is the first consumer, so
this is the cheapest it will ever be.

**`TargetId` stays on the stored record and is absent from the wire.** The
information ladder puts owner identity on neither rung and `Contact`
deliberately carries no id because *a stable identity is a tracking
affordance*. A raw fleet id on a sighting response is exactly that affordance,
and worse, a globally dereferenceable handle a foreign corporation could probe
against any future endpoint that takes a fleet id. The stored field survives
because the pile's eventual consumers (correlating a track, selling intel) need
a subject key and re-deriving one later would be a data migration.

The additive successor, when a consumer actually needs correlation: a
**per-corporation pseudonymous handle** — a stable digest of `(corpId,
targetId)` — so a corporation can tell its own two records apart without
holding a dereferenceable id, and two corporations' handles for the same fleet
do not match. Anonymous → identified stays the additive direction; that is why
it is not built here.

### Decision 17 — The sighting store is `backend/sightings`, and the narrow rule is a compile-time direction

The pile cannot live in `disclosure` — `purity_test.go` pins that package's
production import set to `errors`, `hexaverse/common`, `hexaverse/space`, so a
Firestore client there fails the build.

**Ruling.** `backend/sightings`, the standard six-file domain shape, storing at
`corporations/{cid}/sightings/{id}` and serving `GET /v1/sightings` for the
requester's own corporation only, newest first (single-field ordering — no
composite index, no `terraform apply`). It **may** import `disclosure`;
`disclosure` **may never** import it.

That direction needs no new enforcement machinery and no written promise: the
existing allow-list test already fails the build the instant `disclosure` grows
an import outside its three. The narrow rule from Decision 5 of the parent
design — *no stored record may be consulted to decide live disclosure* — is
therefore a **compile-time property of the dependency graph**, not a review
obligation. The spec writer should say so in the requirement, because the value
here is that the rule is unbreakable, not that it is stated.

### Decision 18 — `disclosure.ScanMints` stays orphaned, and that is recorded rather than fixed

`ScanMints` — the radial-echo mint predicate — has no consumer after this
change, exactly as `board.BeamCells` had none. **No radial scan verb is
invented to give it one.** Only the focused scan has settled pricing; passive
proximity plus plume are what *replaced* ambient scanning, and inventing a verb
to justify a predicate would be building gameplay backwards from a function
signature. Its doc comment gains a note naming it fixture-pinned and awaiting a
future radial or directional variant. An unconsumed predicate awaiting a verb is
honest; a verb invented to justify a predicate is not.

### Decision 19 — `common.Tuning().AmbientRadius` and `.ScanDuration` are deleted

Both are consumed only by `observation/params.go`, which dies with the package.

`AmbientRadius` is denominated in **lattice hops** — a unit that no longer
exists — and its continuous successor already shipped, calibrated, as
`disclosure.PassiveRange`. `ScanDuration` is a flat 15 s for a 360° sweep; the
settled price is range-scaled sensor-channel time, so it is not a repurposable
input, and its successor constants belong in `disclosure/params.go`, the file
whose stated job is exactly this. `common/tuning.go`'s own doc restricts it to
cross-domain primitives; relocating continuous-space feel knobs into it would
invert that. Delete both, and delete `observation/params.go` with the package.

### Decision 20 — Passive contact does not auto-mint sightings

The README's fog section (2026-08-26, written before the model was settled)
requires that *"anything transiting a bubble mints a sighting automatically"*
with continuous, never-sampled coverage. That is **not** built here, and the
reason is architectural rather than budgetary: **there is no tick.** Resolution
in this system is opportunistic — actions settle when someone reads, and the
Cloud Scheduler sweep is explicitly a liveness floor that correctness never
depends on. "Automatically, on transit" requires evaluating curve-vs-moving-
sphere intersections over the interval *between* reads for every pair of
(own fleet, foreign fleet) in every system, driven by a clock nothing else
depends on. It would be the first mechanism in the codebase whose correctness
requires the scheduler to run.

The later, narrower `decisions.md` entries supersede that paragraph: live
disclosure persists nothing, and the pile is minted by scans. Recorded here so
the omission is a ruling rather than a gap someone re-discovers in link 8.

### Decision 21 — Close the authorization defect on both sides, or not at all

`fleet-movement`'s *Movement Command Endpoints Enforce No Fleet Ownership*
(five endpoints) and `action-dispatch`'s *No Caller-Identity Binding on Action
Endpoints* (`/actions?actor=`, `/actions/:id`, `/acknowledge`, `/cancel`) are
the same hole reachable through two doors. **Closing fleet's five alone leaves
a bypass through the same single-slot channel — cancel someone's burn via the
action endpoint — and a half-closed authorization hole is worse than a
documented open one, because it reads as fixed.**

**Ruling.** Both close in this change.

- Fleet: every mutating handler compares `common.ActorCorp(c)` to the fleet's
  `CorporationId` and responds **404**, not 403 — matching the read rule and
  the shipped absence semantics (a foreign fleet is indistinguishable from a
  nonexistent one; a 403 confirms the id exists).
- Actions: `action.Handler` takes an injected
  `ActorOwner { OwnerOf(ctx, collection, actorId) (corpId string, err error) }`,
  wired in `router.go` from the fleet service (`fleets` is the only actor
  collection today). No import cycle — `action` stays verb-agnostic, and the
  wiring lives where every other cross-domain edge already lives.
- `fleet/ownership_defect_test.go` is deleted, not inverted: it exists to pin an
  unfixed defect, and the defect is fixed. Its scenarios become the positive
  ownership scenarios in the new requirement.

`action-dispatch` therefore takes a delta in link 5, which `chain.md` does not
predict. **`chain.md`'s link 5 "Touches" list must be corrected** to add
`action-dispatch` and `galaxy-generation` (Decision 3's exported lane-id
helper).

### Decision 22 — Make jump's wiring impossible to omit rather than testable (blocker 3)

`Jump` 500s in production because `WithGraph`/`WithTierSource` were never
called. A wiring test would catch a repeat; a constructor signature prevents
one.

**Ruling.** `fleet.NewServiceWith` takes the `GraphSource` as a required
positional parameter and `WithGraph` is deleted. `TierSource` and
`WithTierSource` are deleted outright (Decision 2). Forgetting the dependency
then fails to compile. The `graph == nil` guard and its sentinel disappear with
it — a programmer-error branch that can no longer be reached is dead code.

**`fleet/service.go:171`'s `NewService()` landmine is fixed in the same pass**
(explicitly authorized, and one line): it hand-copies `RegisterResolvers`'s
first line only, registering `burnType` and **missing `jumpType`** — byte for
byte the bug that stranded fleets invisibly until `3bcc726`, surviving one
constructor away. **Delete the registration from `NewService()` entirely**
rather than delegating to `RegisterResolvers`: a constructor that registers
resolvers as a side effect is what made two copies of the list possible in the
first place, and registration belongs at the composition root. Add a test
asserting `RegisterResolvers` is the package's sole `action.RegisterResolver`
call site — an AST scan in the same species as `purity_test.go`, cheap, and it
fails the moment a third copy appears.

### Decision 23 — Re-home `EnsureLaneHorizon` at jump arrival, before the destination's first body table (blocker 4)

**Superseded by Decision 28** — the arrival site is retained but is no
longer the primary trigger.

`galaxy.EnsureLaneHorizon` has no production caller, so the endless galaxy
stops growing at the materialized frontier. Jump arrival is the natural site —
it is the only remaining trigger that can look past the frontier now that scan
resolution is gone, and the spawn walk covers home through
`LaneHorizonBlocks`/`EnsureBlocks` already (`corporations/siteselection.go:212`).

**Ordering is load-bearing, not incidental.** `system.addGates` derives a
system's gate bodies from `galaxy.NeighborsOf`, which enumerates
**materialized** lanes. So the horizon call must run **before** the
destination's first `BodyTable` build in `fleet.Service.Get`'s post-jump-settle
step (`fleet/service.go`, the `s.bodiesFor(ctx, settled.SystemId)` line). Get it
backwards and a fleet arriving at a frontier system sees fewer gates than truly
exist — a silent dead end that reads as a correctly-generated cul-de-sac.

### Decision 24 — Both silent blockers get consequence tests, not wiring tests

Blockers 3 and 4 are invisible to CI because every unit test injects a fake for
the thing production forgot to wire. The lesson from link 4's registry survey is
that asserting on wiring is fragile; asserting on **consequence** is not.

**Ruling.** The acceptance vehicle for this change is an end-to-end
traversability slice, and it is a first-class deliverable rather than a
regression net: spawn → burn to a gate → dock → jump → arrive parked near the
destination gate, unmasked → the crossed lane appears on the galaxy map → the
destination's **full** gate set is present. That single path fails if the router
forgets `WithGraph` (blocker 3), if `chartedGates` survives (blocker 2), if
charting is still a precondition (blocker 1), or if the horizon call is missing
or mis-ordered (blocker 4). Backed by an emulator integration test for the
frontier-arrival gate-set property specifically, since that one is the easiest
to lose to a plausible refactor.

### Decision 25 — Enroll `disclosure` in `check.py`'s determinism list, and make the drift impossible

`check.py:223`'s `DETERMINISM_GO_PACKAGES` is out of sync with
`check-transcendental.sh:82`'s `RULE_BEARING_GO_PACKAGES` by exactly three
packages — `polar`, `space`, `disclosure` — despite `check.py`'s own comment
asserting *"Must match check-transcendental.sh's own gate."* This is the
**fifth** instance of the hand-maintained-list species catalogued in link 4's
task 9.9, and it must be added to that inventory.

**Ruling.** It closes in this change, not after. The moment link 5 wires
`disclosure` into every read, every predicate deciding what a player is allowed
to see would otherwise be unlinted for transcendental drift. Add all three (not
just `disclosure` — leaving a list two-thirds fixed is the same defect with a
smaller number), and add a check that **asserts the two lists are equal**,
failing with both contents printed. That converts a hand-maintained list into a
checked one, which is the actual fix for the class; deriving the list from a
single source is a bigger change and stays where link 4's orchestrator put it.

### Decision 26 — Additive on the wire; nothing the live board consumes is removed

The frontend still reads `features[].footprint`, `features[].band`,
`features[].live`, and `laneGates[].cell`. Link 5 ships `space` (continuous
position) and `size` on features, gate bodies, and the `contacts` array
**alongside** them; `band` stays the constant `"visible"` and `live` stays
`true`. Links 8 and 9 delete them, with the renderer.

This is the same additive-first discipline links 1–4 ran on, and it is why the
chain has stayed interruptible: at every commit the game still runs. It also
means `fogFeatureDTO`'s standing instruction — *"Do NOT 'helpfully' add
[Space/Size] here because they look additive and harmless"* — is discharged by
this change, which is the change it named.

### Decision 27 — `Get`'s fold retrofit is out of scope and carries to link 6

`fleet.Service.Get` settles a due burn or jump opportunistically but does not
fold every read through `space.StateAt`. **Verified not forced by this change:**
`disclosure` folds through `space.StateAt` internally on every position it takes
(`contact.go:76`, `contact.go:110`, `sighting.go:73`), so an unsettled-but-due
burn yields *the same* disclosure answer as a settled one. Staleness of the
stored doc is invisible to every predicate here.

Recorded rather than silently dropped, so it stays a live carried item: link 6
re-anchors mine/sell/dock to bodies, and those verbs read stored state directly
in ways disclosure does not, which is where the retrofit actually bites.

### Decision 28 — `EnsureLaneHorizon` moves out of `BodyTable` onto the jump path; a body-table build materializes nothing (blocker 4, corrected)

Decision 23 ruled the horizon call belongs in `fleet.Service.Get`'s
post-jump-settle step, before the destination's first `BodyTable` build. What
shipped is somewhere else: it is the first statement of `system.Service.addGates`
(`system/bodies.go:190`), which `BodyTable` calls at `bodies.go:147` — i.e.
**inside** every body-table build, just before `NeighborsOf` derives the gate
set. `backend/fleet` contains no `EnsureLaneHorizon` call at all. tasks.md 1.4
carries a "SEAM CORRECTION" annotation defending this as *"stronger than the one
specified: EVERY `BodyTable` build gets it."* That defence does not survive
three facts.

**Fact 1 — two of those builds are inside Firestore transactions, where the call
cannot work.** `BodyTable` is called from `ScanResolver` (`fleet/resolver.go:124`)
and `BurnResolver` (`fleet/resolver.go:214`), both of which `action`'s
`ResolveOne` invokes with the *transactional* context (`action/dao.go:229` —
`resolve(ctx, …)` inside `dao.db.RunTransaction`). `EnsureLaneHorizon` reaches
`galaxy` `MaterializeBlock`/`MergeExtent`, which open their own
`RunTransaction` (`galaxy/dao.go:180`, `:241`), and the Firestore Go client
refuses a nested transaction outright — `errNestedTransaction`, returned before
any RPC, on a context already stamped with `transactionInProgressKey`
(`firestore@v1.9.0/transaction.go:97-98`, stamped at `:132`). The call is not
merely unwired on those paths; it is *unwirable*.

**Fact 2 — it fires exactly when it would have done work, and is silent
otherwise.** `ensureBlocksIn` short-circuits: it reads `MaterializedBlocks`
first and `continue`s past every block already present, so when `created == 0`
it returns without ever opening a transaction (`galaxy/service.go:192-212`).
In steady state — a system whose horizon is already materialized — the call is a
pure read and returns `nil`. It only reaches `RunTransaction`, and therefore only
fails, when there is genuinely an unmaterialized block. That is precisely the
frontier case the requirement exists for. So this is not a per-resolve warning
flood (the orchestrator's read of it as "every burn and scan resolve" is the
volume, not the incidence); it is a seam that is dead on exactly the branch that
matters and quiet on the branch that doesn't — the worst possible shape for
something you hope CI will notice.

**Fact 3 — a body-table build is not a materialization trigger, and
`galaxy-generation` already says so.** That capability enumerates the triggers —
*"jump arrival at a system past the currently materialized frontier, the spawn
walk, or initial seeding"* — and then constrains the complement: *"Plain reads
(`GET /v1/galaxy`, `GetLiveSystem`) SHALL NOT themselves create system or lane
documents."* `BodyTable` is a read (`system-body-table`: *"Lane Gates Are Derived
Fresh At Every Build"* — derived **from the live lane set**, not by growing it).
Putting the horizon call inside `addGates` therefore did not strengthen the
specified seam; it added an unenumerated fourth trigger on the read path — the
`GET /v1/systems/:id` interior read now silently grows the galaxy. That is a
scope violation, not a bonus.

**The spec is the correct side of this drift.** Its placement — *"after the
resolve transaction completes and before the destination's first body-table
build for this arrival"* — is exactly the constraint that would have prevented a
permanently-dead call, and it is the constraint the shipped code violates.

**Ruling.** Hoist `EnsureLaneHorizon` out of `addGates`. It gets exactly two
call sites, both non-transactional, both on the jump path, neither on a read
path:

1. **Jump commit** — `fleet.Service.Jump`, once `LaneCrossing` has yielded
   `destId` and the order is about to be committed (`fleet/service.go:723-733`).
   This is the primary site, and — corrected 2026-09-01, see below — the only
   site whose failure has a consequence for the player. `EnsureLaneHorizon`
   runs before the action is committed; **IF it errors, `Jump` FAILS
   CLOSED**: it logs at Error with `systemId`/`fleetId`, commits no action,
   leaves the fleet attached to the gate, and returns a new sentinel
   (`fleet.ErrDestinationNotReady`, mapped by the handler to `503`) instead of
   the committed jump — a distinguishable, retryable refusal, not a silently
   swallowed background failure. Because materialization is monotonic and
   `LaneHorizon(systemID)` is a pure function of the id, a successful
   commit-time ensure is permanent: there is no unhealed state to worry about
   afterward, only a rejected order the player can resubmit.
2. **Jump arrival** — `fleet.Service.Get`, after `resolveDue` returns and before
   the `s.bodiesFor(ctx, settled.SystemId)` line (`fleet/service.go:230-235`).
   This is the site Decision 23 named and the one the requirement's ordering
   sentence describes. Because site 1's commit-time ensure is now the
   load-bearing one, this call is a **redundant idempotent confirmation** —
   it re-runs an already-satisfied point read, pins the requirement's literal
   ordering, and guards against a future commit path that forgets to call
   it — not coverage of a failure mode site 1 cannot reach.

Do not add it to the interior read path, and do not add it to any other
body-table caller. `system` loses its materializing dependency on `galaxy`
entirely; `addGates` goes back to a pure read of the live lane set, which is what
its own capability says it is.

**Why commit must fail closed rather than log-and-continue — the sweep gap.**
`Get`'s post-settle step is guarded on `f.Jump != nil` (`fleet/service.go:228`),
so it runs only when *that read* settles the arrival. The action sweep
(`POST /v1/push/action-sweep` → `ResolveAllDue`) can settle a due jump first, and
`jump` is a registered resolver, so it does. After a sweep-settled arrival the
fleet reads back with `Jump == nil` and the post-settle step never runs at all —
neither the horizon call nor, already today, the destination-interior
materialize. The interior heals anyway, because `GetOrCreateInterior` is
create-if-absent on any subsequent read; a horizon call that only ran at the
arrival site, and only logged on failure, would not — a fleet could be
permanently stranded short its true gate set, with no path back, exactly the
"silent dead end that reads as a correctly-generated cul-de-sac" this
capability exists to rule out. **Ensuring at commit, and rejecting the order
when it cannot be ensured, closes that hole at the root**: it happens before
the transit even starts, so there are exactly two outcomes — either the
destination's true horizon is materialized before any arrival (read-settled or
sweep-settled) can ever be reached, or the order never commits and there is no
fleet in transit and no state left to heal. There is no third, silently-broken
outcome for a sweep to inherit.

**An earlier draft of this decision called the two sites "belt-and-suspenders,
justified because the two sites cover disjoint failure modes rather than the
same one twice." That claim is false, and the 2026-09-01 review upheld the
finding.** Site 1's `EnsureLaneHorizon` and site 2's are the same idempotent,
pure-of-id call against the same destination system; a commit-time failure is
now rejected before transit begins, so there is no in-flight arrival left for
a redundant arrival-site call to "retry" or "heal" — there is no arrival at
all, because the jump never committed. Site 2 is retained as a redundant
confirmation and a guard against a future commit path that forgets to call it,
not because commit-time failure leaves anything behind for it to clean up. Its
failure logs at Error and does not fail the read, exactly as before. The spec
text below states the commit-time ensure and its fail-closed rejection
directly, replacing the earlier "after the resolve transaction completes,"
read-as-sole-permitted-moment framing entirely rather than merely widening it.

**Why the jump path alone is sufficient — the completeness argument.** The
only two ways a fleet comes to be in a system are spawn and jump arrival. Spawn
already ensures the horizon through `LaneHorizonBlocks`/`EnsureBlocks`
(`corporations/siteselection.go`); the jump is what this decision wires. So every
system a corporation is *in* has a complete gate set, and a jump can only be
issued from a gate the fleet is attached to in the system it occupies. A system
nobody has visited may still serve a gate set short of its true horizon on a
bare interior read — accepted deliberately: that is a display truncation of a
system you cannot yet act in, it heals the instant anyone arrives, and it never
manifests as a traversal dead end. The enumerated trigger set is complete; the
read path needs no trigger of its own.

**The resolvers do not need the call, and never did.** Traced: `BurnResolver`
uses its table for `DecodeKinematicState` + `space.StateAt`; `ScanResolver` uses
it for the scanner's and every co-resident ship's state, the star's occlusion
geometry, and `disclosure.FocusedScan`. Both can therefore be hurt by a missing
gate body — `fleet/kinematic_decode.go:121-126` and `:134-138` return
`CauseUnknownBody` for an unresolvable burn target or park host, which would fail
the resolve, roll back the transaction, and wedge the fleet on every subsequent
read. But a truncated table cannot arise there, because **every commit path
builds a non-transactional `BodyTable` for the same system first** —
`OrderTo` (`fleet/service.go:432`), `Jump` (`:712`), `Scan` (`:808`) — and
materialization is monotonic while `LaneHorizon(systemID)` is a pure function of
the id. Once a system's horizon is materialized it stays materialized, so the
resolve-time `NeighborsOf` sees the same complete set the commit-time build
ensured. Removing the call from `addGates` cannot truncate any resolver's gate
set. **Verdict: a dead call, not a live correctness bug** — but "dead and
harmless" rests on a non-local invariant, and the failure mode if that invariant
ever breaks is a wedged fleet, not a log line. Which is why the invariant gets
written down and tested rather than left to be re-derived.

**Alternatives rejected.**

*Split `BodyTable` into a horizon-ensuring variant and a plain one.* Rejected: it
keeps a materializing write inside the body-table seam (still violating
`galaxy-generation`'s read constraint on the interior read path), doubles the
surface, and makes correctness depend on every future caller picking the right
variant — the same hand-maintained-list species Decision 25 is closing in this
very change. One seam that materializes nothing is strictly cheaper to keep true.

*Leave the seam and narrow the spec to the observable invariant.* Rejected on two
counts. It would have to relax `galaxy-generation`'s "reads create no galaxy
documents" to bless the interior read as a trigger, which is a real behavioural
loosening smuggled in as a documentation fix. And it would bless a write issued
from inside a resolve transaction — the one thing `fleet/resolver.go:265` already
states as a rule (*"a resolver may perform no writes of its own"*) — leaving the
codebase with a rule and a live counterexample to it.

**On the silent degrade (part B).** `addGates`'s two remaining degradations
(`NeighborsOf` and `GetLiveSystems` read failures → omit gates, keep the table)
stay exactly as they are: they are spec'd behaviour
(`system-body-table`: *"The Table Degrades to Fewer Bodies Rather Than a Failed
Build"*). At the horizon call's new home, log-and-continue is also right — the
flip has already committed, so failing the read would strand a fleet that has
genuinely arrived — but it is logged at **Error**, not Warn: after the hoist,
this is the only place the galaxy can fail to grow, and it is not a degradation
the system is designed to tolerate indefinitely. It is safe to log-and-continue
here only because site 1 fails closed: nothing reached transit without a
materialized horizon, so this call has nothing to heal — it does not self-heal
a commit-time failure, and no such failure exists to heal.

We do **not** add a branch distinguishing a nested-transaction error from a
genuine materialization failure. `errNestedTransaction` is unexported in the
Firestore SDK; matching it means string-comparing a third-party error message,
which is a fragile coupling to buy a diagnostic. More to the point, after the
hoist a nested-transaction error against `galaxy` is unreachable by
construction on this path, so the branch would be dead code guarding a bug the
structure now prevents.

**Correction (2026-09-01 review, BLOCKER 2): that unreachability claim is
scoped to `galaxy` writes only, and an earlier draft of this decision stated
it without that scope.** `system.Service.BodyTable`'s own interior read runs
`GetOrCreateInterior`, whose create-if-absent path performs a real Firestore
write (`dao.CreateInterior`) the first time a resolve-time build touches a
system whose interior has never been materialized — including from inside an
`action` resolve transaction. That write predates this change: it is the same
seam `system-body-table`'s baseline *One Table Resolves Every Body In a
System, Absence Never An Error* already relies on, and this change's own
`fleet-movement` *First arrival materializes the destination's interior*
scenario depends on it. This decision does not alter that behaviour —
*A Body-Table Build Materializes Nothing*'s "no write of its own" is scoped to
**galaxy** documents for exactly this reason, not to every write a
resolve-time build can still trigger. It is recorded here as a named, accepted
residual risk rather than fixed: a resolve-time build for a never-before-read
system still performs a Firestore write nested inside `action`'s resolve
transaction, and this decision's structural guard (below) does not cover it,
because the interior create-if-absent path is out of this change's scope — it
predates it and no requirement here asks it to change.

The correct guard for the `galaxy` seam is structural and testable:
`system.Service.BodyTable` records in its own doc
comment that it is a **read-only, transaction-safe** seam called from inside
`action` resolve transactions, and no materializing call may be added to it or to
`addGates`; and a resolve-path test asserts zero `EnsureLaneHorizon` calls during
a burn resolve. That is the same species of guard as the rule in
`fleet/resolver.go:265` that would have caught this, promoted from a comment on
one function to an assertion in CI.

**tasks.md 1.4's "SEAM CORRECTION" annotation must not reach the archive as
written.** Its claim that the cited scenario is satisfied and the seam is
stronger than specified is false in both halves: the scenario's ordering
constraint is unmet on the transactional builds, and the seam is weaker
(unenumerated on the read path, inert on the frontier path) rather than stronger.
It is replaced by the tasks in §10.

### Decision 29 — The spliced station is completed at the splice seam, not stored and not decoded (blocker 5)

`system.StationContinuousOrbit` (`system/station_continuous.go:30`) and its
one-line delegate `stations.DeriveContinuousOrbit`
(`stations/continuous_orbit.go:22`) have **zero production callers** — grep
returns only their own definitions, their tests, and comments. Link 3
(`add-orbital-system-bodies`) listed `trading-station` in its Touches, shipped
the derivation, and never wired it. `stations.EnsureStation` still provisions
with the lattice derivation alone (`stations/service.go:114`), `Station` has no
field for a continuous orbit at all (`stations/model.go:35` types `Orbit` as
`system.Orbit` — Ring/Angle0/Dir/Period), and `stations.FeatureOf`
(`stations/service.go:224-239`) therefore returns a `system.Feature` carrying no
`Space` and no `SpaceDoc`. `system.Service.applyContinuousCascade`
(`system/service.go:254-270`) calls `space.DecodeOrbit(f.SpaceDoc)` on every
non-star feature, fails, logs *"Spliced feature's orbital element set failed to
decode; omitting from the interior read"*, and drops it.

**Consequence: the home trading station is absent from every
`GET /v1/systems/:systemId` response, for every requester including its owner.**
The board is the only playable view (Decision 26), so M11's dock-then-sell loop
is unreachable through the UI. Third instance of the species behind blockers 3
and 4, and the second one Decision 28 was written about: a derivation built,
unit-tested against its own determinism, and never called.

**This is fixed here, not deferred.** Three requirements this change is about to
archive are demonstrably violated by shipped code: `trading-station`'s ADDED
*"Home Station Visible On the Direct Station Read"* — scenario *The board read
serves the station regardless of tier*, which is the failing test;
`system-interior`'s ADDED *"Bodies Are Public; Ships Are Disclosed"* — "every
body ... in full to every authenticated requester"; and, per the second half
below, `system-body-table`'s *"A Table Contains No Body With a Non-Positive
Size"*. Archiving would ratify all three as satisfied.

**Second half of the defect, not in the original report: `Size` is missing too.**
`FeatureOf`'s struct literal sets `Id`, `Type`, `Name`, `Orbit`, `Footprint`,
`OwnerCorpId` — and no `Size`. `system.StationSize = 0.9` exists
(`system/params_continuous.go:117-119`) and `MaxFeatureSize(FeatureStation)`
already returns it (`system/continuous.go:178-179`); nothing sets it on the
feature. `system-body-table`'s non-positive-size requirement **names the station
explicitly** — "the station per its configured constant" — so repairing only
`Space` would move the station from "silently absent" to "present at size zero,"
which is worse: `space.InsertionStandoff` on a zero-size body yields a
degenerate standoff, so a fleet would dock *at the station's centre*. The two
fields are one fix and must land together.

**Ruling — derive at the splice seam; store nothing; change no schema.**
`system.Service.spliceStation` (`system/service.go:171-184`) sets both halves on
the feature it appends: `Space = StationContinuousOrbit(meta.Seed, systemID,
node.Skeleton)` and `Size = StationSize`. Nothing else moves.

Why this shape and not the alternatives:

*Replace `Station.Orbit`'s type with `space.Orbit` and delete `DeriveOrbit` /
`stations/placement.go` outright.* **Rejected — it would re-break the bug it
fixes.** The lattice `Orbit` is what `FeatureOf` derives `Footprint` from, and
`Footprint` is what the current renderer draws the station at. Decision 26 is
this change's standing rule — *"Additive on the wire; nothing the live board
consumes is removed"* — and the chain has an explicit deletion point for the
lattice at links 8-9, with `placement.go`'s own doc comment naming link 6 for the
docking half. Deleting it here jumps the chain's own sequencing and blanks the
station from the only playable view. The no-backcompat ground rule
(`docs/plans/continous_space/README.md`) governs **stored data and migrations** —
never plan a migration, regenerate instead — and it is not a licence to delete a
live subsystem three links ahead of its scheduled removal. Both readings of
"delete is preferred" are honoured by deleting the orphan delegate (below)
rather than the load-bearing lattice.

*Add a stored continuous orbit to the `Station` document.* Rejected on the
domain's own stated rule. The station orbit is **derived, never rolled** — a pure
function of (galaxy seed, system id, skeleton) — and `DeriveOrbit`'s doc comment
already leans on that: *"A fleet already docked to a station resolves its live
position by recomputing this in-process, never by re-reading the station
store."* Storing a second copy of a pure derivation invents a staleness class
that does not currently exist, and it forces every already-provisioned station in
the dev emulator through a re-seed to become visible again. Deriving costs a
`GetLiveSystem` point read on a path that already point-reads `LiveGalaxyMeta`,
and every existing station heals on the next read with zero data work.

*Populate `SpaceDoc` at read time and let the cascade decode it.* Rejected as the
wrong field. `SpaceDoc` is documented as the persistence-native form, constructed
only by `space.EncodeOrbit` and this package's DAO (`system/model.go:145-148`);
filling it in memory to have it immediately decoded is an encode/decode
round-trip for nothing, and it launders an in-process construction through a
storage-boundary guard. Setting `Space` directly is both cheaper and more
honest — and it needs **no cascade change at all**, because
`applyContinuousCascade`'s own loop already passes through any feature arriving
with `Space != nil` (`system/service.go:256-259`), exactly as its doc comment
anticipates ("decodes the spliced station's SpaceDoc *if it arrived undecoded*").

**Why `system.spliceStation` and not `stations.FeatureOf`.** `stations`'
`GraphSource` exposes only `LiveGalaxyMeta`, so wiring the derivation there means
widening that interface with `GetLiveSystem` and threading a skeleton through
`FeatureOf`'s signature. `system` already holds both dependencies, and
`StationContinuousOrbit` is *defined in `system`* — the derivation, the constant,
and the splice all live in one package. `stations` keeps what it actually owns:
identity, ownership, requests, the lattice placement `Footprint` still needs, and
the `ErrStationRingOutOfRange` guard, **all untouched**. That guard and its
backing requirement *"A Station Orbit Outside the Live Board Radius Is Omitted,
Never Panicked"* survive intact, so no spec removal is needed — a decisive
advantage over the type-replacement option, which would have orphaned a live
requirement.

**Delete the orphan delegate.** `stations/continuous_orbit.go` and
`stations/continuous_orbit_test.go` go, since `stations` is not the wiring site
and `system/station_continuous_test.go` already pins the real function's
determinism. Leaving a permanently-uncalled delegate in place after diagnosing
this species would be self-parody.

**Implementation hazard the implementer must confirm, not assume.**
`StationContinuousOrbit` parents the station to `feat-body-{k}` for `k` indexing
`skeleton.Bodies` (`station_continuous.go:43-49`); `generator.go:78` names major
bodies with the same `feat-body-%d` scheme over the same slice, so the ids line
up — but if that parent body was itself dropped by the ring guard or an earlier
cascade pass, the station cascades out with it. That is *correct* (its parent is
genuinely gone) and must not be special-cased; the acceptance test therefore
asserts the station **survives the cascade**, not merely that `Space` was set.

**On the silent omit (part B) — the degradation policy is right; the population
split is what was missing.** The station never crossed the persistence boundary
as a feature: `FeatureOf` builds it in memory. `readInterior`'s and
`applyContinuousCascade`'s decode guards are **storage-boundary** guards, whose
purpose is surviving corrupt or legacy stored documents without permanently
500-ing every corporation's read of a system. That policy is correct and stays.
Applying it to an in-process construction is a category error: it converts a
producer bug — a struct literal missing two fields — into a runtime omission
indistinguishable, in the log, from data rot. That is precisely the mechanism
that hid this for a whole link.

So: keep omit-never-fail for **stored** features; make a **spliced** body that
arrives without a `Space` or without a strictly positive `Size` loud, because
that can only ever be a programming error. Log it at Error naming the producing
source, and — more importantly, since a log nobody reads is what got us here —
pin it with a splice-completeness test that fails for *any* future spliced body
family, not just the station.

**Does omit-with-200 violate "An Interior Predating This Capability Fails Closed,
Never Silently"? Ruled: no, but the requirement is genuinely ambiguous and the
ambiguity is worth closing.** Its body says *"a read or table build that
encounters one SHALL fail by name rather than degrade"*, while its own scenario
*"A non-star feature with no orbital element set at all fails, never reads as
parentless"* says the feature is *"treated as a decode failure — omitted and
logged with its id"*. The reconciling reading — and the one the code implements —
is that "fail by name" attaches to the **extent** clause
(`ErrInteriorPredatesContinuum`, `system/bodies.go:113-115`), while "closed" for
the SpaceDoc clause means "never silently reinterpreted as a legitimate
parentless body," which omission does achieve. The sibling requirement settles
the intent: *"Interior Feature Decode Validates Its Orbital Element Set, Omitting
Rather Than Failing"* folds *"or a missing key"* into its own omit-not-fatal
scenario explicitly. So this is not a live spec violation — but a requirement
whose prose supports two opposite behaviours is exactly what let a reviewer wave
this through, and it is worth one clarifying MODIFIED block. Recorded as a
finding with paste-ready text; taking it is the orchestrator's call, and
deferring it to link 6 costs nothing but a re-litigation.

## Risks / Trade-offs

- **Decision 4 is the largest judgment call in this change.** Making body
  composition public is easy to reverse toward more secrecy (additive gate) and
  expensive to reverse toward less (deleting a memory store, again). It is
  chosen in the *permissive* direction, which is the opposite of the restrictive
  default Decision 6 of the parent design used for identity — deliberately,
  because the asymmetry runs the other way here: an over-secret map is
  unplayable in a way an over-open one is not.
- **A gate's id leaks its destination by construction.** `gateId` is
  `"gate-"+destSystemId`, so shipping gate bodies (Decision 5) publishes the
  local graph edge whether or not `destSystemId` is a field. Decision 5 accepts
  that on purpose, but the spec writer should not write a requirement implying
  the destination could be withheld while the id ships.
- **Decision 15 can eat a sensor channel for nothing.** A sweep whose target
  drifts behind the star mid-flight resolves with no records and no refund. It
  is the intended cost of a maintained geometry, but it is the most likely
  source of a "that felt unfair" report, and the cheapest knob if it is (drop
  the pulse-reach re-check to commit-time only — one scenario).
- **The scan-emission constants are unplayed guesses.** They are calibrated
  against the PoC's scale and against `PlumeFloor`, not against play. Both are
  named constants in one file for exactly this reason.
- **Deleting `observation` touches eleven production files across six
  domains.** The rename is mechanical, but `market`, `stations`, and
  `corporations` each have real behaviour riding `Tier`, and none of them are
  the subject of this change. A pure-rename commit, separate from the
  behavioural work, is the way to keep that reviewable.
- **Collection renames orphan dev data.** A corporation spawned before this
  change reads as having charted nothing and explored nothing. That is correct
  and intended (no migrations — re-spawn), but it will look like a bug in a
  local database once.
- **`chain.md` is now wrong about link 5's footprint** in two ways: it does not
  list `action-dispatch` or `galaxy-generation`, and it predicts link 5 removes
  `observation-fog-and-scan`'s four requirements when in fact they are *moved*.
  Both need correcting alongside this change.

## Migration Plan

**There is none, and that is a ruling rather than an omission.** Prod exists but
is unused; dev data is regenerated by `make seed` plus a re-spawn. So:

- The `observation` → `charts` collection rename carries **no data**. Nothing
  reads the old paths after this change and nothing copies from them.
- Deleted tuning knobs, deleted endpoints, deleted wire fields: none get a
  deprecation window, a dual-write, or a compatibility shim.
- The one thing that *is* sequenced — Decision 26's additive-on-the-wire rule —
  is not backwards compatibility. It is keeping the game runnable at every
  commit of a nine-link chain, which is a property of the chain, not a promise
  to a client.

The single ordering constraint inside the change: the `observation` → `charts`
rename should land as its own commit before the behavioural work, so a
mechanical rename across eleven files is never mixed with a decision.

## Open Questions

**1. Should a sighting expire, or is the pile unbounded?** Nothing deletes a
sighting today and `Sighting` carries no setter by design. A corporation that
sweeps daily accumulates records forever, and `GET /v1/sightings` eventually
pages through thousands of stale claims. The model's own answer is that
staleness is priced by the player, not by the system — which argues for never
expiring — but that leaves an unbounded subcollection with no retention story.
Deferred: it is a storage question with no gameplay content until the pile is
sellable (post-link-6).

**2. Is `PassiveRange` really uniform across every fleet forever?**
`disclosure.Observer` carries `PassiveRange` per observer, so per-hull or
per-class sensor ranges are already representable — nothing here forecloses
them. But the constant is shared, and the moment a "sensor hull" exists, the
question of whether scouting is a *build* choice or purely a *positioning*
choice opens. Not this change's to answer.

**3. Does the contact list need its own refetch cadence?** Contacts move
continuously and the interior read is polled at whatever rate the board uses.
Under-polling means a contact list that lags reality; over-polling means the
whole interior payload on a fast timer. Link 8 owns the answer, but if the
contacts array turns out to want a different cadence than the bodies, the
Decision 6 co-location is the thing that would have to be revisited.

**4. What does a station observe, once a player can own one?** Decision 12
excludes stations because the NPC station has no corporation. A player-owned
station with a passive bubble is a static, unmaskable sensor — which is either
the natural way to watch your own system or an anti-stealth wall, depending on
its radius. Link 6 at the earliest.
