# The change chain — lattice to continuous space

The ordered set of OpenSpec changes that carries the game from the polar
lattice to the continuous-space system map. `README.md` is the model,
`decisions.md` is the settled rulings; this is the sequencing.

**Status (2026-08-27):** links 1–2 landed. Links 3–8 unproposed. Two
lattice-era changes (`add-station-exchange`, `revise-scan-instant-and-emission`)
were removed from `openspec/changes/` on 2026-08-27 to clear the board — see
*Removed* at the bottom.

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
| 3 | `add-orbital-system-bodies` | Interiors emit real orbits; lane gates become bodies | ⬜ |
| 4 | `migrate-fleet-to-continuous-burns` | Fleets fly curves; cut drive / stop in place | ⬜ |
| 5 | `replace-observation-with-sightings` | Disclosure wired into every read; `observation` deleted | ⬜ |
| 6 | `re-express-economy-positions` | Mine/sell/dock re-anchored to bodies | ⬜ |
| 7 | `add-fuel-as-cargo` | Δv priced in cargo mass; the first credit sink | ⬜ |
| 8 | `build-production-space-view` | The renderer; `board-view` retired | ⬜ |
| 9 | `delete-the-lattice` | `board`, `polar`, their mirrors, fixtures, specs | ⬜ |

Downstream and off the critical path: `add-station-exchange` (M12) gets
re-proposed after link 6.

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
| `Dir int` | sign folded into `PeriodMs` |
| `Period` from `Tuning().OrbitPeriod(ring)` | `PeriodMs` stored |
| — | `Inclination SubTurns`, `Node SubTurns` (new) |
| `Footprint []board.Cell` | deleted |

**Also lands lane gates** (`decisions.md`, 2026-08-27): an ordinary entry in
the same `Bodies` table, placed at a derived bearing from the galaxy layout
toward the lane's far endpoint, motionless via a non-positive period. Follows
the `stations` precedent — derived, never rolled.

- **Touches:** `system-interior` (MODIFIED, heavy), `galaxy-generation` (gate
  bearings), `trading-station` (orbit re-expressed), `space-kinematics`
  (unchanged — `Bodies` is already the seam).
- **Needs decided first:** whether a gate imposes a dwell time before jumping.
  Recorded as still open.

## Link 4 — `migrate-fleet-to-continuous-burns`

Fleet position becomes a `space` state — park mode, committed burn, or free
drift. `BurnResolver` settles curved burns; the channel split and the delta
ledger carry over unchanged, since the fold contract is identical.

**Adds the cancel verbs** (`decisions.md`, 2026-08-27): *cut drive* (free,
instant, truncates the burn interval, straight-line drift at constant
velocity, goes dark the same instant) and *stop in place* (a new burn that
nulls velocity — costs Δv, and is loud).

Free drift is a new stored shape alongside the three park modes, so this link
carries an ADDED requirement into `space-kinematics`. It is closed-form
(`anchor + v·t`) and needs no new math — folding it here rather than into its
own change is the recommendation, since the fixture family it would have to
prove itself against already exists.

- **Touches:** `fleet-movement` (MODIFIED, wholesale), `space-kinematics`
  (ADDED: free drift), `action-dispatch` (the coordinate codec — float vectors
  through `space`'s named codec, same non-primitive-param discipline).

## Link 5 — `replace-observation-with-sightings`

The integration link. `disclosure` is pure and has zero consumers; this wires
it into every read that currently projects through `observation`, adds the
persisted sighting pile, and deletes `observation` outright.

`proximity-disclosure` already specifies more than the design doc anticipated
— masking and its chains, the focused scan, plume radius, star occlusion,
lane-transit invisibility, sighting records as stamped historical claims. What
remains is **storage and wiring**, not model:

- the sighting store (readable, inert, sellable later — the deliberate
  exception to "live disclosure persists nothing")
- `galaxy` / `system` / `fleet` handler reads projecting through `disclosure`
- deleting `observation` and its spec

- **Touches:** `observation-fog-and-scan` (REMOVED entirely),
  `proximity-disclosure` (MODIFIED — widen masking from "a ship docked to a
  host" to attached objects generally, per `decisions.md`'s spec note),
  `fleet-movement`, `galaxy-view`, `system-interior`, new sighting capability.
- **Needs decided first:** focused-scan pricing — time on the sensor channel,
  range gating, or fuel — so masking is strong but sweeping every body isn't
  free. Recorded as still open.

## Link 6 — `re-express-economy-positions`

Mine, sell, and dock re-anchored from cells to bodies. Cheap by design:
`decisions.md` settled that **places are bodies**, which is a recognition that
every landed mechanic already treats the body as the atom of place — docking,
mining, stations, gates, masking hosts, focused-scan targets.

- **Touches:** `mine-extraction`, `goods-sale`, `trading-station`,
  `npc-market-demand`, `market-price-board`.
- Co-location predicates become dock-state or radius tests. `board.Within`
  becomes a sphere test.

## Link 7 — `add-fuel-as-cargo`

Split from link 6 because it is a design surface, not a re-expression. Fuel
occupies cargo mass like ore, is bought at stations with credits, and burns
down as Δv is spent — the economy's first real sink against M11's pure faucet.

- Burn commit gains a validation: a burn whose Δv price exceeds available fuel
  is rejected at commit.
- `stationkeep` upkeep gets a currency; `orbit` stays the free park.
- **Guardrail that must survive review:** commanded acceleration stays
  independent of loaded mass. Coupling them yields the rocket equation, which
  turns flight time into a differential equation and destroys the closed-form
  brachistochrone the whole capability rests on.
- **Needs decided first:** whether a fleet can strand.

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

- **Touches:** `board-view` (REPLACED by a space view), `galaxy-view`.

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

| Decision | Gates |
| --- | --- |
| Gate dwell time before jumping | link 3 |
| Focused-scan pricing | link 5 |
| Whether a fleet can strand | link 7 |
| What "holding" a body means; mine entity shape | combat — deferred, off-chain |

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
