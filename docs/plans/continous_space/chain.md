# The change chain — lattice to continuous space

The ordered set of OpenSpec changes that carries the game from the polar
lattice to the continuous-space system map. `README.md` is the model,
`decisions.md` is the settled rulings; this is the sequencing.

**Status (2026-09-02):** links 1–6 landed, plus one unplanned insert. Links 5
and 6 are **done and archived** (90/90 and 33/33). Link 7 was split in two by its
own panel review — `add-fuel-as-cargo` (53 tasks) is **done and archived**
(`41e3c46`, 22/22 e2e, 1360/1360 unit), and `add-stationkeep-hold-verb` is
**spec-complete after four adversary rounds** with its red phase written; they
MUST archive in that order.

That change is worth a note. Its review loop ran one round past the nominal
cap of three, deliberately — every round's blockers were bred by the previous
round's repairs, and round 3 found that re-issuing `hold` after each dry
instant bought **indefinite free station-keeping**, the exact behaviour the
change exists to price. Round 4 then found the same exploit reachable through
a time-of-check/time-of-use window between the settle-first write and the
commit transaction. A cap exists to stop unbounded iteration, not to ship a
known exploit. It also grew from 26 tasks to 54 in the process, which is the
honest measure of how much the first draft had missed.

Link 8's 8a was split **again** by its panel — it was 131 tasks, not the 47 it
claimed — into `serve-orbital-elements-and-burn-preview` (37, purely additive,
so no coexistence period and no flag) then `build-production-space-view` (94).
Neither is a deferral: 8a-2 cannot render or price without 8a-1, and 8a-1 is
dead code until 8a-2 calls it. **Link 9 is blocked on 8b as well as 8a** —
`add-scan-and-sightings-surface` is still unauthored, and its two halves (the
scan command surface and the sightings display) must ship in the same change as
each other. Link 8's twelve open questions are ruled
(`handoffs/link8-rulings.md`). All three chain-gating
design decisions are settled — see *Open decisions gating the chain* below.

**The full archive order is** `add-fuel-as-cargo` →
`add-stationkeep-hold-verb` → `serve-orbital-elements-and-burn-preview` →
`build-production-space-view` → `add-scan-and-sightings-surface` →
`delete-the-lattice`.
Two lattice-era changes
(`add-station-exchange`, `revise-scan-instant-and-emission`) were removed from
`openspec/changes/` on 2026-08-27 to clear the board — see *Removed* at the
bottom.

**The insert:** `pin-system-generation-determinism` (`b64be39`) landed between
links 3 and 4. Link 3's work exposed that `backend/system` generation was
architecture-dependent — 13 of ~500 `Resource.Richness` values differed by one
ULP between arm64 and amd64 — from four pre-existing FMA-contraction sites, and
that the byte-for-byte cross-target rule was enforced in **zero** places
despite two reports claiming otherwise. It fixed the four sites, retired a
golden-master digest whose failure message misdiagnosed its own cause, recorded
`fixtures/system/`, and enrolled `system` across what turned out to be eight
hand-maintained enforcement lists rather than the three originally believed.

The eight-step sequencing in
`openspec/changes/archive/2026-08-27-add-space-kinematics/design.md:829` is
the parent of this list. This document supersedes its ordering of steps 3–5
(see *Why the order changed*) and adds the links that `decisions.md` created
after that design was written.

---

## The chain

| # | Change | Delivers | State |
| --- | --- | --- | --- |
| 1 | `add-space-kinematics` | `backend/space` — orbits, burns, parking, the fold | ✅ `a05dddf` |
| 2 | `add-proximity-disclosure` | `backend/disclosure` — the visibility mechanism, pure | ✅ `fca73ef` |
| 3 | `add-orbital-system-bodies` | Interiors emit real orbits; lane gates become bodies | ✅ `e00e79e` |
| — | `pin-system-generation-determinism` | *(unplanned insert)* generation pinned byte-identical across build targets | ✅ `b64be39` |
| 4 | `migrate-fleet-to-continuous-burns` | Fleets fly curves; cut drive / stop in place | ✅ `1f1c88a`…`55c46fb` |
| 5 | `replace-observation-with-sightings` | Disclosure wired into every read; `observation` deleted | ✅ `8f4dd65`…`99747e2` |
| 6 | `re-express-economy-positions` | Belt members become minable; target ids validated | ✅ `5fd28b5`…`fbbb316` |
| 7 | `add-fuel-as-cargo` | Δv priced in cargo mass; the first credit sink | ✅ `41e3c46` |
| 7b | `add-stationkeep-hold-verb` | *(carved out of 7)* the hold/release verbs + their fuel upkeep | 🔨 spec final (4 adversary rounds), 0/57 |
| 8a-1 | `serve-orbital-elements-and-burn-preview` | *(carved out of 8a)* elements on both DTOs, the preview endpoint, the upkeep rate | 📝 spec final, 0/42 |
| 8a-2 | `build-production-space-view` | The renderer, the docked panel; `board-view` retired | 📝 spec final, 0/106 |
| 8b | `add-scan-and-sightings-surface` | The focused scan's player-facing half **and** the sightings display, together | 📝 spec final (3 adversary rounds), 0/105 |
| 9 | `delete-the-lattice` | `board`, `polar`, their mirrors, fixtures, specs | 📝 spec, 0/80 |

Downstream and off the critical path: `add-station-exchange` (M12) gets
re-proposed after link 6; `add-cargo-transfer` (the rescue verb
`decisions.md`'s stranding ruling assumed already existed but does not —
see link 7's Why) is unscheduled, off the critical path, and a real design
surface in its own right (partial transfers, proximity vs. attachment,
ownership and hold capacity on both sides) rather than a bolt-on.

---

## Link 3 — `add-orbital-system-bodies`

**Why first.** Nothing has a position until bodies do. Every predicate in
`disclosure` and every burn in `space` resolves through a `space.Bodies`
table, and no implementation of that interface exists.

**Smaller than it looks.** `system.Feature` already carries `Orbit`,
`ParentId`, and `Fixed`, and the generator already thinks in parent chains.
The work is re-expressing the elements, not inventing them:

| `system.Orbit` (today) | `space.Orbit` (target) |
| --- | --- |
| `Ring int` | `Radius float64` |
| `Angle0 int` (slot) | `Phase SubTurns` |
| `Dir int` | ~~sign folded into `PeriodMs`~~ → **`Inclination`** (see below) |
| `Period` from `Tuning().OrbitPeriod(ring)` | `PeriodMs` stored |
| — | `Inclination SubTurns`, `Node SubTurns` (new) |
| `Footprint []board.Cell` | deleted |

**Correction to the table above (found during link 3, 2026-08-29).** The
`Dir int` row was wrong as originally written. A non-positive `PeriodMs` means
**motionless**, not retrograde — `backend/space/orbit.go:45` returns the stored
phase unchanged, and `space-kinematics` pins it. Folding direction into the
period sign would have silently frozen every retrograde body in the galaxy, and
it collides head-on with the lane-gate design, which spends the non-positive
period on "motionless" deliberately. Retrograde is expressed as **inclination
past a quarter turn** — the real astronomical convention, and at `SubTurn/2` the
rotation has determinant −1, so the sweep reverses while the phase still
advances positively.

**Also lands lane gates** (`decisions.md`, 2026-08-27): an ordinary entry in
the same `Bodies` table, placed at a derived bearing from the galaxy layout
toward the lane's far endpoint, motionless via a non-positive period. Follows
the `stations` precedent — derived, never rolled.

- **Touches:** `system-interior` (MODIFIED, heavy), `galaxy-generation` (gate
  bearings), `trading-station` (orbit re-expressed), `space-kinematics`
  (unchanged — `Bodies` is already the seam).
- **Decided (2026-08-29):** a gate imposes **no dwell** before jumping. The
  question was deferred out of link 3 (which carries no verb to attach it to)
  and is carried into link 4, where the jump lives.

## Link 4 — `migrate-fleet-to-continuous-burns`

**Landed 2026-08-30** across ten commits (`1f1c88a`…`55c46fb`), 90/94 tasks —
the four unchecked are §11's post-archive `## Purpose` hand-edits, which
deltas structurally cannot reach. Archived 2026-08-31 in `c235497`.

Four defects it surfaced are worth remembering, because each was invisible to
a green suite:

- **The jump resolver was never registered.** `RegisterResolvers` wired only
  `burnType`, so a committed jump's ETA would pass with nothing to settle it —
  leaving the fleet in `laneTransit` permanently, and since a fleet in transit
  has no position in either system, **invisible and uncommandable**. The unit
  was correct and tested; nothing called it.
- **Lane crossing time was specified backwards.** `tasks.md` said length ×
  lane rate; `LaneRate` is a *speed*, and the spec derives the effective rate
  as the minimum across the roster and calls it "the slowest ship" — which
  only holds under division. Multiplying would have made the slowest hull
  produce the **fastest** crossing. Caught by an SDET refusing to encode it.
- **The fold-first bug reached three sites** before `settleIfDue` became the
  single seam every transition routes through.
- **`GET /v1/fleets/:fleetId` had no ownership check at all** — only `List`
  filtered — returning 200 for any fleet to any caller.

Fleet position becomes a `space` state — park mode, committed burn, or free
drift. `BurnResolver` settles curved burns; the channel split and the delta
ledger carry over unchanged, since the fold contract is identical.

**Adds the cancel verbs** (`decisions.md`, 2026-08-27): *cut drive* (free,
instant, **replaces** the burn with a straight-line drift at constant
velocity, goes dark the same instant) and *stop in place* (a new burn that
nulls velocity — costs Δv, and is loud).

*Wording corrected 2026-08-30.* This read "truncates the burn interval" until
the link 4 analysis found that is not implementable: `space.Burn.Position(t)`
returns the burn's **intercept** for any `t >= ArriveMs`, so shortening
`ArriveMs` would teleport the fleet to its original destination and `StateAt`
would then settle it into that target's insertion park — arriving for free.
The implementable form anchors a free drift at the burn's position at the cut
time, carrying its tangent scaled by its speed there. Same intent; the
original phrasing described an edit that cannot be made. `decisions.md`
carries the full correction.

Free drift is a new stored shape alongside the three park modes, so this link
carries an ADDED requirement into `space-kinematics`. It is closed-form
(`anchor + v·t`) and needs no new math — folding it here rather than into its
own change is the recommendation, since the fixture family it would have to
prove itself against already exists.

- **Touches nine capabilities, not the three originally predicted here:**
  `fleet-movement` (MODIFIED, wholesale), `space-kinematics` (ADDED: free
  drift; MODIFIED: the persistence codec widens to burns/parks/drifts),
  `observation-fog-and-scan` (its live half removed outright — coverage has
  no centre once a fleet has no board cell), `system-interior` (the
  three-band fog projection loses its coverage source and becomes a stated,
  temporary, fully-disclosed interim), `board-view` (loses its fleet layer
  and every geometry-dependent verb), `fleet-roster` (re-derives status from
  kinematic state and becomes the fleet's command surface), `corporation-spawn`
  (the starting hull's seed position becomes a continuous-space park),
  `galaxy-view` (the route-preview gesture and transit card are removed with
  multi-hop routing), and `proximity-disclosure` (ADDED: the drifting-contact
  velocity/emission requirement `ModeDrift` needs). See `design.md`'s Impact
  section for each capability's specific reason.
- **`action-dispatch` was predicted here to take a delta. That prediction is
  wrong, and this link ships no delta against it.** Verified against
  `backend/action/params_validator.go`: its allowlist (`nil, string, bool,
  int, int64, float64, []string, []int64, []float64, []any,
  map[string]any`, recursed) already accepts every shape the new codec
  emits. The rule this link adds governs what the codec **emits**, not what
  the validator **accepts**, so it belongs in `space-kinematics`'s
  *Coordinates Cross the Persistence Boundary Through a Named Codec*
  requirement instead (design.md Decision 15).
- **Inherited obligation** (`pin-system-generation-determinism`, design.md
  Decision 5 / Open Question 1): this link owns recording the three fixture
  families link 3's Decision 13 declared but that change deferred —
  `keplerPeriodMs` (full R¹ box), `gateOrbit`, and `stationOrbit`
  (`StationContinuousOrbit`) — each currently an `inventory` entry in
  `fixtures/system/mirror-map.json` naming this link as `expectedChange`.
  The shipped rule that keeps them from evaporating: a rule-bearing shared
  function SHALL NOT remain in the inventory across more than one change
  that modifies its package — so this link must either record them or
  re-file the deferral explicitly if it still cannot.

## Link 5 — `replace-observation-with-sightings`

**Landed and archived 2026-09-02** (`8f4dd65`…`99747e2`), 90/90 tasks across
ten sections — 16 deltas, three new capabilities (`galaxy-knowledge`,
`sighting-records`, `focused-scan`), +45 requirements, 13 modified, 12
removed. The spec went through **three** adversary rounds, not one: resuming
it expired the prior verdict, and re-attacking the resumed content found 3
blockers, 7 majors and 4 minors, then 1 blocker and 2 majors in the text
those repairs introduced.

Three findings it surfaced are worth remembering. The first two are invisible
to a green suite and are the same species as link 4's four; the third is a
testing trap that makes a green suite look red:

- **`EnsureLaneHorizon` had been wired inside every body-table build**, not
  on the jump path. Two of those builds run inside Firestore transactions,
  where a nested transaction is refused before any RPC — so the call was not
  merely unwired there, it was *unwirable*. It also made the interior read
  silently grow the galaxy, an unenumerated trigger, and `ensureBlocksIn`
  short-circuits when everything is materialized, so it was inert on exactly
  the frontier branch it exists for. A §10 was opened to hoist it.
- **The trading station was absent from every interior read**, for every
  requester including its owner, because `StationContinuousOrbit` and
  `StationSize` had zero production callers since link 3 and
  `applyContinuousCascade` therefore dropped the station. M11's
  dock-then-sell loop was unreachable through the UI. This is blocker 5, the
  third instance of "a derivation built, unit-tested, and never called."

- **`go test ./...` is self-racing in this repo.** The root package's `TestMain`
  wipes and re-seeds the shared test emulator project, and Go runs package tests
  in parallel, so that wipe detonates under `action`, `corporations`, `fleet`,
  `galaxy`, `market` and `mine` mid-test. It produced 18 failures that read as a
  serious regression; **`-p 1` is fully green**. `backend/CLAUDE.md` warns about
  the Playwright collision over the same emulator but not about this one. Always
  run the emulator-backed suite as `go test ./... -p 1`.

The lesson link 5 keeps re-teaching: a storage-boundary guard applied to an
in-process construction converts a producer bug into a silent omission that
looks, in the log, exactly like data rot. The fix splits the degradation
signal by population — spliced bodies fail loudly, stored ones still degrade
quietly.

What has landed so far: **the galaxy is traversable again** — a player can
spawn, fly to a lane gate, and jump using only the UI, proven by a Playwright
journey against the real stack (`3d7e72d`, `886159b`, `9bde5b1`).
`backend/observation` is deleted and `backend/charts` holds the graph-tier
ladder, **rehomed rather than deleted** because `decisions.md`'s "no tier
ladder" is scoped to the live path, which the ladder was never on, and four
shipped capabilities consume it (`c0ba51e`). The sighting store (`7e972c5`),
`disclosure`'s wiring into the reads (`9c00216`), and the focused-scan verb
(`d18c255`) are in.

**Restoring traversability took four attempts, each ending with a green suite
and a stuck player** — the server 500, then a jump button that never rendered,
then a rendered button with no `laneId` to send, then a galaxy view deriving
gate identity from a charted-filtered list that is empty for exactly the
player who needs it. Worth remembering as the canonical example of why an
end-to-end test through the real router still is not evidence that a human can
perform the action.

**Most important consequence of link 4, stated up front: after link 4, no
fleet can ever jump.** Spawn charts zero lanes (`observation.RevealArrival`
mints home `explored` only), the scan verb that used to chart lanes is
deleted (section 7 of link 4's tasks.md), and travel-arrival charting
(`fleet-movement`'s jump resolver) only charts the lane just crossed — which
requires already having a charted lane to jump in the first place. That is
circular: nothing in the tree after link 4 can produce a corporation's first
charted lane. `backend/observation/service.go:129` names the job outright —
"finding the roads is the first scan's job" — and link 4 deleted that job
along with the rest of `observation`'s live half. **Restoring traversability
was therefore link 5's first job, and it is done** (§1, `3d7e72d`): the
charted-lane precondition was dropped outright rather than re-supplied,
because lane gates are bodies and reaching one is the real constraint.
Charting demotes to map and intel. This paragraph is kept in the past tense
as the record of *why* link 5 opened where it did — the jump verb link 4
built was untestable end-to-end, with no corporation able to reach a second
system, until that landed.

**Corrected scope (2026-08-31, recorded during link 4's task 9.6): link 4
already removed `observation`'s live half**, not link 5. Link 4's section 7
deleted the ambient-coverage/echo-disc/scan-resolution-mint/path-swept-reveal/
fleet-audience-visibility code outright and replaced `system`'s three-band fog
projection with a stated, temporary, fully-disclosed interim read
(`system-interior`: *Interior Reads Are Fully Disclosed, A Deliberate
Interim*). So link 5 does **not** find `observation-fog-and-scan` intact and
remove it "entirely" as this document originally predicted — it inherits an
already-reduced `observation` package (the four surviving requirements: the
monotonic graph-tier ladder, travel arrival reveal, spawn arrival reveal,
charted-lane set projection) plus a `system-interior` interim requirement that
link 5 is what's expected to replace with the real `disclosure`-projected read
(link 4's task 7.8 left a code comment at the interim read's implementation
naming this link for exactly that reason).

The integration link. `disclosure` is pure and has zero consumers; this wires
it into every read that currently projects through the (now-reduced)
`observation`, adds the persisted sighting pile, and deletes what remains of
`observation` outright.

`proximity-disclosure` already specifies more than the design doc anticipated
— masking and its chains, the focused scan, plume radius, star occlusion,
lane-transit invisibility, sighting records as stamped historical claims. What
remains is **storage and wiring**, not model:

- the sighting store (readable, inert, sellable later — the deliberate
  exception to "live disclosure persists nothing")
- `galaxy` / `system` / `fleet` handler reads projecting through `disclosure`
- deleting the remainder of `observation` and its spec, and replacing
  `system-interior`'s fully-disclosed interim read with a real
  `disclosure`-projected one
- **restoring lane charting** — without this, the jump verb is unreachable
  past a corporation's home system (see above)

- **Touches sixteen capabilities, not the six originally predicted here**,
  three of them brand new — `galaxy-knowledge`, `sighting-records`, and
  `focused-scan`.
  - `observation-fog-and-scan`'s four surviving requirements are **MOVED,
    not REMOVED**: the monotonic knowledge ladder, the charted-lane set
    projection, and the two arrival writers are re-ADDED unchanged in
    substance under the new `galaxy-knowledge` capability (Go package
    `backend/charts`), because `market`, `stations`, `corporations`, and
    `galaxy-generation` still consume them and the graph tiers were never
    on the live-perception path the pivot deleted. The capability itself
    retires with **no delta directory of its own** — the archiver rejects a
    rebuilt spec left with zero requirements — so
    `openspec/specs/observation-fog-and-scan/` is deleted by hand *after*
    the archive succeeds (task 7.6; `polar-lattice-math` is the precedent).
  - `system-interior` — its fully-disclosed interim and its charted-gate
    filter REMOVED, replaced by a `disclosure`-projected read (public
    bodies, disclosed ships, foreign presence as contacts, gates carrying
    their lane id).
  - `proximity-disclosure` — masking widens from "a ship docked to a host"
    to attached objects generally (per `decisions.md`'s spec note), plus
    the sweep's emission and its range-scaled emission radius, the
    union-over-a-corporation's-own-assets rule, and a sighting's system
    stamp.
  - `fleet-movement` — jump re-expressed as gated by gate *attachment*
    alone, foreign fleets 404'd on a direct fetch and surfaced only as
    anonymous contacts, and every command endpoint restricted to the
    owning corporation; `fleet-roster`,
    `galaxy-view`, and `board-view` carry the matching jump-commit and
    lane-id surfaces.
  - `action-dispatch` — its endpoints stop being caller-identity-blind and
    become owner-restricted (a foreign actor is indistinguishable from a
    nonexistent one); `request-authorization`'s corporation-resolution seam
    is re-expressed as something ownership checks consume, and
    `mine-extraction`'s ownership rule is restated on it.
  - `galaxy-generation` — `EnsureLaneHorizon` finally gets a production
    caller at jump arrival (blocker 4), and the graph read endpoint follows.
  - `corporation-spawn` (its arrival write rehomed onto `galaxy-knowledge`),
    `trading-station` (its fog-source exclusion retires with the fog), and
    `system-body-table` (the body table pinned as an unfiltered internal
    seam, never a response) round out the sixteen.
- **Four traversability blockers, not one.** The charting circularity above
  is only the first; three more sit under it, two of them silent because
  every unit test injects a fake for the thing production forgot to wire
  (proposal.md's *Why*; design.md Decisions 2, 5, 22, 23):
  1. **The circularity itself** — dissolved by dropping `Jump`'s
     charted-lane precondition entirely. Gates are bodies now, so
     *reaching* one physically is the constraint; charting demotes to map
     knowledge and a sellable intel product, never a permission.
  2. **`system/gates.go`'s `chartedGates`** filters every lane gate away
     from a corporation with no charted lane — which is every fresh
     corporation — so even with the precondition gone there would be
     nothing to fly to. Deleted, along with `BoardFog`'s tier lookup and
     `system-interior`'s *Charted Lane Gate Filtering*; gate bodies ship
     unfiltered.
  3. **`fleet.GraphSource` has no production implementation, and
     `router.go` never calls `WithGraph`/`WithTierSource`** — so `POST
     /v1/fleets/:id/jump` returns 500 for every real caller before any game
     rule runs. CI has never seen it: `jump_verb_test.go` injects a
     `fakeGraph`. Closed at the type signature rather than by a wiring
     test — the `GraphSource` becomes a required positional parameter of
     `fleet.NewServiceWith` and the optional-wiring shape is deleted
     outright, so an unwired router is a compile error.
  4. **`galaxy.EnsureLaneHorizon` has no production caller at all**, so the
     endless galaxy silently stops growing at the materialized frontier the
     moment a fleet reaches it. Called at jump arrival, ordered strictly
     before the destination's first body-table build, so an arriving fleet
     is never stranded with a truncated gate set.
- **Decided (2026-08-29):** focused-scan pricing is **time on the `action`
  sensor channel, scaling with range**, and **the scan emits** — the scanning
  fleet is detectable for the duration of the sweep. Range gating was already
  shipped (`disclosure.FocusedScanRange`), so it was never really open. Fuel is
  explicitly rejected as the currency: it does not exist until link 7 and the
  scan needs its price here.

## Link 6 — `re-express-economy-positions`

**Landed and archived 2026-09-02** (`5fd28b5`…`fbbb316`), 33/33 tasks. Four-person
panel (architect, DBA, security, UX) then three adversary rounds; QA 60 scenarios
PASS / 0 FAIL. +3 requirements, 11 modified.

**Two findings worth remembering, both about evidence rather than behaviour:**

- **A ruling was reversed mid-flight** — see the table below and
  `handoffs/link6-rulings.md`. The first shape split each belt into eight
  independently contestable lodes; the panel showed that makes belt mining
  *unreachable*, because members have no client affordance until link 8, so it
  closed the only reachable path while its replacement had none.
- **Seven validation scenarios were vacuously satisfied by code that did not
  exist**, and a later pass found two checked task boxes claiming test coverage
  that was never written. Both were caught by review, not by a failing build:
  the rejections were unreachable behind the not-docked check, so the existing
  `ErrNotDocked` answered every one of them. A green suite proved nothing.

**This link's premise above was wrong, and the spec says so.** Link 4 already
re-pointed the predicates: `mine` and `market` resolve "docked" through
`fleet.Fleet.DockedTo()`, and `grep 'board\.'` across their non-test sources
returns zero hits. `board.Within` and `board.LineOfSight` have no production
callers at all — their successors shipped in link 2 — so "becomes a sphere test"
was already true. Both are link 9 deletion material.

What the link actually turned out to be, once grounded against the code:

- **A belt member is a minable body `mine` structurally cannot mine.** Members
  (`<beltId>#<k>`, `AsteroidsPerBelt = 8`) exist only in the `BodyTable`, never in
  `interior.Features`, while `mine.Commit` resolves targets via
  `findFeature(interior, …)`. A fleet attached to `feat-belt-0#3` gets
  `ErrUnknownKind`. Fixed by resolving a member id to its parent belt for
  mineability, kinds, and ledger key alike.
- **`featureId` becomes a parsed client string** that composes a Firestore
  document id, and `action.Commit` validates `Params` but never `LedgerKey`.
  Validation lands, and the key is composed from the RESOLVED parent plus the
  fleet's own stored `systemId` — never client input.
- **Every body is a valid attachment host — and therefore a hiding place.**
  Attachment is the masking predicate's sole input, so this had to be written
  down with its consequence rather than left implicit.

**A ruling was reversed mid-flight.** The first shape split each belt into eight
independently-contestable member lodes with the belt demoted to a non-minable
container. The panel showed that would make belt mining *unreachable*: members
have no client affordance until link 8, so it closed the only reachable path
while its replacement had none — and the container would still have rendered a
mine panel refusing every commit. It also built a mechanic ahead of its only
consumer, the species this chain has now paid for five times. Reversed to **one
belt, one lode**; the ledger key never changes. Per-member lodes are deferred to
whichever link makes a member pickable, with the contested-place rationale
preserved so it is inherited rather than rediscovered.

- **Touches seven capabilities, not the five predicted:** `mine-extraction`
  (2 ADDED, 3 MODIFIED), `trading-station` (2 MODIFIED), `board-view` (2),
  `market-price-board` (2), `fleet-movement` (1 ADDED), `system-interior` (1),
  `goods-sale` (1). **`npc-market-demand` gets none** — it carries no positional
  language at all.
- **Q1 ruling:** `trading-station`'s lattice placement *derivation* is RETAINED
  until links 8-9 — the `Footprint` it derives is what the only playable view
  renders. Only the *predicate* half re-points. `stations/placement.go`'s comment
  claiming it "dies at link 6" is wrong and is corrected by a task.

## Link 7 — `add-fuel-as-cargo`

Split from link 6 because it is a design surface, not a re-expression. Fuel
occupies cargo mass like ore, is bought at stations with credits, and burns
down as Δv is spent — the economy's first real sink against M11's pure faucet.

- Burn commit gains a validation: a burn whose Δv price exceeds available fuel
  is rejected at commit.
- **Guardrail that must survive review:** commanded acceleration stays
  independent of loaded mass. Coupling them yields the rocket equation, which
  turns flight time into a differential equation and destroys the closed-form
  brachistochrone the whole capability rests on.
- **Decided (2026-08-29):** a fleet **can** strand, and stranding is a setback
  rather than a death — commit-time validation means it never strands
  mid-burn, and `orbit` is free so it sits indefinitely. **No blanket reserve**
  ("enough to get home" has no local computable definition). Commit **warns
  without blocking** when a burn would leave the fleet unable to reach a
  station or gate, priced at the acceleration floor (not the ceiling) so the
  warning never false-alarms against a fleet that could still crawl to
  safety — a correction made during this link's own panel review, since
  `Δv = 2·√(a·L)` rises with commanded acceleration, so a fleet's true
  maximum reach is at its *minimum* legal acceleration, not its ceiling.
- **Correction to the rescue half of the 2026-08-29 ruling, made during this
  link's own panel review:** "fuel-as-cargo means another fleet can rescue
  it" is false — no cargo-transfer verb exists anywhere in the tree.
  Stranding is therefore permanent (mitigated only by jumps costing no Δv),
  not "pending rescue." See `add-cargo-transfer` in the downstream list.
- **`stationkeep` upkeep gets a currency, but not in this link.** Pricing
  it in fuel the straightforward way would make `fleet.FreeHold` — read by
  four call sites including `mine`'s resolve clamp — time-dependent. Carved
  out to `add-stationkeep-hold-verb` (see the unplanned insert above), which
  ships immediately after this link and stores a precomputed dry instant on
  the park instead, mirroring "a burn past its arrival IS its settled park."

## Link 7 (insert) — `add-stationkeep-hold-verb`

The `hold`/`release` verbs `space.StationKeepRate`/`StationKeepUpkeep`/
`ReleaseStationkeep` have had zero production callers since
`add-space-kinematics` — carved out of link 7 itself (see above) rather than
shipped inline, because the correct fold needs a `space.Park` schema change
(a stored hold-start time and a precomputed dry instant) that link 7's own
introduction of fuel should not also have to get right in the same breath.
Ships the verb and its upkeep currency together, exactly as the standing
"ship the verb with the currency, or ship neither" principle requires —
only the timing moves, by one link.

**Split into two changes 2026-09-02.** `add-fuel-as-cargo` keeps fuel-as-cargo,
burn pricing and the commit-time affordability gate, the closed-form discard
refund, the stranding warning, the new `fuel-purchase` capability, spawn starting
fuel, and the client surface. `add-stationkeep-hold-verb` takes the `hold`/`release`
verbs **and** their fuel-denominated upkeep — together, one link later.

The carve-out was forced by a review finding, not by size: the station-keep half was
the only part needing a `space-kinematics` delta, a codec widening and a new fold,
and its first design folded `cargo["fuel"]` itself — which would have made
`fleet.FreeHold` time-dependent and silently broken `mine`'s resolve clamp, `mine`'s
commit gate, the fleet read, and `fuel-purchase`'s own free-hold check. The corrected
design stores a dry instant on the park and folds *that*, mirroring "a burn past its
arrival IS its settled park". **`add-fuel-as-cargo` MUST archive first** — both
changes modify `fleet-movement`'s *Fleet Cargo Pool*, and the reverse order silently
drops a scenario that `--strict` does not catch.

**Three adversary rounds; the findings that matter were arithmetic, not prose.**

- **Δv rises with commanded acceleration** — `Δv = 2·√(a·L)`, so maximum range is at
  MINIMUM acceleration. Two requirements computed range at the acceleration ceiling,
  which is the fleet's *shortest* reach, and labelled it the maximum. `decisions.md`
  already said this ("silent running is cheap in fuel and expensive in time"); the
  spec contradicted a settled ruling in the same directory and four readers missed it.
  Consequence now recorded: **fuel bounds speed, not reachability** — a nearly-dry
  fleet can always crawl, which weakens the supply-line pressure and partly defuses
  the stranding alarm.
- **`release` was a 5× overcharge, then a 1000× one.** It debited Δv into a
  tons-denominated field; the repair divided by `DeltaVPerTon` and still multiplied a
  per-second rate by a `WorldMillis` elapsed. Caught by dimensional analysis both
  times, and by a round-trip invariant: a release at exactly the dry instant must
  debit exactly the fuel held at hold start.
- **The corrected dry-instant formula lived only in design.md and tasks.md**, both of
  which move to `changes/archive/` — so post-archive the normative spec would again
  have permitted the 25× inversion, with every scenario passing. The repair had fixed
  the prose people read and left the artifact that survives.

Two more worth remembering: a **mid-hold refuel** was reachable (dock → hold → refuel,
all three preconditions hold) and the stale dry instant would have destroyed the whole
purchase; and `hold` at zero fuel wrote a park **its own codec requirement rejects**,
bricking exactly the stranded fleets link 7 exists to make discoverable.

## Link 8 — `build-production-space-view`

The renderer, last — the only part with visual-regression risk tests will not
catch. Graduates the PoC's grammar (ring = live position, ghost = position at
arrival, curve = the path).

**This is where the reversible determinism call gets tested.** Decision 1 made
Go the sole authority with no TypeScript mirror, which means every preview ETA
and Δv digit is a server round trip. `design.md`'s Open Questions records the
reversal cost as bounded while `space` has no consumers — by this link it no
longer will. If previews read as laggy in play, reversing means building
`frontend/lib/space` as a true fixed-point mirror.

- **Required scope, inherited from link 5: the focused scan's entire
  player-facing half.** Link 5 shipped the verb
  (`POST /v1/fleets/:fleetId/scan`) and the sighting pile
  (`GET /v1/sightings`) with **no client surface at all** — no scan command
  on any fleet or board view, no `scan` method on
  `frontend/lib/services/fleet-service.ts` and no `useScan` hook behind one
  (link 4 deleted the lattice-era `useScan` and link 5 did not restore it),
  no testid, and nothing that renders a sighting. The scan is API-only in
  the tree this link inherits. That was a deliberate deferral recorded in
  link 5's proposal, not an oversight: a scan button whose results cannot be
  seen is half a feature shipped twice, and this link already owns contact
  rendering, so the command surface and the sightings display are **one
  piece of work here** — the verb's affordance and the view of what it
  minted land together, or neither lands.
- **`board-view` is no longer link 8's alone to replace.** Link 4 already
  strips most of the fleet layer out of `board-view`: 12 of its requirements
  are REMOVED there (confirmed by archive rehearsal), of which 3 are
  re-expressed under a new name (picking, refetch rules, the running-mine
  gate), 1 is the fog-band cascade from `observation`'s live-half removal,
  and the remaining 8 are truly unrenderable once a fleet has no board cell
  (move/scan preview and commit, cancel, lane-gate departure, foreign-fleet
  contact marks, the scan-emission-cell render). What link 4 leaves behind is
  mine/sell/credits/camera/accessibility and the reduced picking/refetch
  surface — not a whole capability waiting to be swapped out. Link 8
  therefore **builds a new space view**, rather than replacing one still
  intact.
- **Touches:** `board-view` (its surviving mine/sell/camera surface folds
  into or alongside the new view), `galaxy-view`.

## Link 9 — `delete-the-lattice`

`backend/board`, `backend/polar`, `frontend/lib/board`, `frontend/lib/polar`,
`fixtures/board`, `fixtures/polar`, their mirror-map entries, and the
`board-tactical-math` spec. Per the ground rules this is deletion, not
deprecation.

---

## Why the order changed

`design.md` sequenced the fog replacement (its step 3) before generation (4)
and fleet (5). This document runs generation → fleet → disclosure instead.

The reason is that disclosure predicates operate on positions in R³. A fleet
has no such position until link 4, and no star exists to occlude with until
link 3. Wiring `disclosure` into reads first would mean wiring it against
lattice cells it cannot consume.

The original order was written while the fog *model* was still unknown and the
step was "decide the model." `add-proximity-disclosure` closed that question,
which converted the step from a design problem into an integration problem —
and integration goes last among the three.

## Open decisions gating the chain

**All three chain-gating decisions are settled** (2026-08-29). Rulings and
their reasoning live in `decisions.md`; summarized here so the table reads in
one place.

| Decision | Gated | Ruling |
| --- | --- | --- |
| Gate dwell time before jumping | link 3 → carried to link 4 | ✅ **No dwell.** Docking makes a fleet immediately jump-eligible. A docked camper is already masked and an arrival already unmasked, so a dwell adds waiting without adding a decision. |
| Focused-scan pricing | link 5 | ✅ **Sensor-channel time, scaled by range, and the scan emits.** Range gating was already shipped (`disclosure.FocusedScanRange`). Fuel explicitly rejected — it does not exist until link 7. |
| Whether a fleet can strand | link 7 | ✅ **Yes, and it is a setback, not a death — though link 7's own review found the "setback" framing rests on a rescue verb that does not exist, so stranding is permanent until `add-cargo-transfer` lands.** No blanket reserve — "enough to get home" has no local computable definition. Station-keeping upkeep force-demotes to `orbit` rather than draining to zero (link 7's own insert, `add-stationkeep-hold-verb`); commit warns without blocking, priced at the acceleration floor so it never false-alarms against a fleet that can still crawl. |
| What "holding" a body means; mine entity shape | combat — deferred, off-chain | ⬜ open, and deliberately so |

Also still open, and deferred with combat: whether a fleet can be attacked
while docked at a gate awaiting a jump.

## Removed

Both deleted from `openspec/changes/` on 2026-08-27, recoverable from git.

- **`revise-scan-instant-and-emission`** (0/24) — superseded. It was surgery
  on `observation-fog-and-scan`, which link 5 deletes wholesale. Its
  emission-as-cost pillar landed in `add-proximity-disclosure`. Its other
  pillar — retiring the sensor channel so scan resolves instantly at commit —
  is contradicted by the pivot, which keeps the `action` sensor channel with
  ETA as round-trip and mints a batch of sightings at resolve. Its motivating
  argument (light crossing only ~5× ship speed) was board-scale reasoning that
  does not transfer to real R³ radii.
- **`add-station-exchange`** (0/40) — not obsolete, mis-sequenced. Its lattice
  coupling was three lines; the rest is credits, listings, escrow, matching,
  and settlement, all orthogonal to spatial representation, and its real
  anchor — *docked* — became more central after the pivot, not less. Removed
  rather than parked because link 6 re-expresses the location half of its
  MODIFIED deltas and its target capability `hex-board-view` no longer exists
  under that name. Re-propose after link 6 against the specs as they then
  stand.

Both also carried the same mechanical breakage worth remembering: they wrote
deltas into `specs/hex-board-view/`, renamed to `board-view` by the polar
migration, and `openspec validate --strict` passed both anyway — it checks
structure, not whether a MODIFIED delta's target capability exists.
