> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Spawn & identity — a mind wakes in a hull

> **Living doc, high-level only.** Scratchpad for **who the player *is*, how a
> Corporation enters the galaxy, and what it means to lose one**. Nothing here
> is committed design. `?` = open question; **DECIDED** = locked;
> **INHERITED** = fixed by an upstream spec, not re-litigated here.
> **Graduated 2026-07-09 → `../specs/0009-spawn.md` (accepted).** Created
> 2026-07-09 from a design
> conversation with Travis — the identity model and death rules were decided
> in that conversation; placement spacing was deliberately left open.
>
> Context: `../vision.md` (§Core loop — the Corporation; §First vertical slice
> step 3), `../specs/0001-galaxy-generation.md` (the graph spawn picks from;
> the frozen start area), `../specs/0003-system-interior.md` (the body
> skeleton — the bootstrap-resource guarantee reads it),
> `../specs/0004-movement-board.md` + both movement docs (the **fleet** is the
> mover/actor — this doc supplies the lore that made that true),
> `fog-of-war.md` (what a fresh Corporation can see), `../lore.md` (the two
> knowledge channels; what a wipe touches — the star map persists, the
> subspace estate dies), `action-timer.md` (spawn is *not* an action — it's
> instant), `BRAINSTORM.md` (loss/restart),
> `../specs/BACKLOG.md` (rows: player spawn, Corporation, unit taxonomy,
> new-player grace).

---

## Boundary — what this doc owns

The **identity model** (what a Corporation and a fleet *are*), the **death and
restart rules**, and **spawn placement** (where and with what a new mind
wakes). It does **not** own combat (how fleets die), the build verb (how
copies are made), or fog mechanics (what a scan reveals) — it only fixes what
those specs must stay consistent with.

| Owns | Defers to |
|---|---|
| Corporation ↔ fleet ↔ mind identity model | fleet movement/state machine (#0004) |
| death trigger + backup-restore restart | *how* a fleet is destroyed (combat, later) |
| spawn-site criteria + starting package | graph shape & frontier cadence (#0001) |
| the drift lore canon | per-verb progression axes (verb specs) |

---

## The identity model — Bobiverse, not colonists (DECIDED 2026-07-09)

The player is an **uploaded consciousness** — an AI mind in a self-replicating
ship, à la the Bobiverse (*We Are Legion (We Are Bob)*). Not a colonist
planting a flag. There is no homeland, no capital, no seat of government.

- **Corporation = the mind's lineage.** The persistent player entity is the
  *continuity of copies*, not a place or a headquarters. (The name
  "Corporation" survives as the in-world legal fiction the mind operates
  under.)
- **Fleet = a replicant copy of the mind in a hull.** Every fleet you own is
  a copy of you. #0004's fleet-is-the-actor decision is this lore made
  mechanical — the fleet moves, senses, mines, and owns its state because the
  fleet *is* a player-instance.
- **Drift (canon, DECIDED).** Copies diverge — each replicant develops its own
  personality, priorities, and path, like the Bobs. Drift is the canonical
  justification for players **following their own path**: specialization,
  playstyle, and (later) per-fleet flavor are *drift*, not menu picks.
  Leaning: **lore-only at first** — a mechanical hook (per-copy traits chosen
  or rolled at replication) is a natural post-slice ornament, not a
  commitment the schema needs today.

What the frame dissolves, for free:

- **The starting package question** → one hull (§Starting package). No base,
  no colony entity, no settlement mechanics anywhere in the slice.
- **The unit-taxonomy blocker (BACKLOG ⬜)** → a *build-tree* decision, not a
  spawn-time one. Probes, relays, outposts are things a mind *constructs*
  from mined materials later; decide the taxonomy when the build verb is
  spec'd.
- **Fog is diegetic.** You know exactly what your hulls have sensed, nothing
  more — there is no homeland that starts revealed (`fog-of-war.md` needs no
  special case).
- **Multi-fleet control is lore-native.** A new fleet is a new copy —
  replication, not recruitment. It arrives as progression, not as a UI
  feature needing an excuse.

---

## Death, backup & restart (DECIDED 2026-07-09)

- **A fleet's death kills the copy, not the Corporation.** The Corporation
  lives while **≥ 1 fleet lives**. Ten fleets, lose nine → the Corporation
  persists (bruised, not dead).
- **Losing the *last* fleet ends the Corporation.** Total loss — the lineage
  has no living copy. This is `vision.md`'s "you can lose everything" made
  precise: the stake is the lineage, and it dies with its last hull.
- **Restart = backup-restore.** An archived backup of the mind wakes in a new
  hull at the frontier — a **new Corporation**, lore-continuous with the old
  but mechanically fresh. The drift canon does the narrative work: the
  restored copy has drifted; it is *you, following a new path*, not your old
  save reloaded. Progress and assets do not carry.
- **Interlock with the slice:** no combat in the slice → no death path needs
  building yet. The model is recorded *now* so the combat and economy specs
  inherit it instead of inventing a different one.

`?` **Orphaned assets** — what happens to a dead Corporation's structures and
claims? Leaning: they go derelict (salvage/exploration content for others —
on-theme for a dangerous frontier), but this belongs to the combat/economy
era. Not slice.

`?` **What carries across a restore** — name, cosmetics, a "memories"
flourish (discoveries remembered but not owned)? Leaning: nothing
*mechanical* carries; a name-lineage flavor (Bob-1, Bob-2…) is cheap and very
Bobiverse. The lore backs this two ways (`../lore.md`): the star map is
universal astronomy (so the "knowledge" a restore keeps is exactly what
everyone has anyway), and the archive holds the **seed copy**, not a snapshot
of the veteran — what wakes never knew those roads. Decide at restart-flow
time.

---

## Spawn placement — waking on the frontier

Spawn = **create a Corporation + its first fleet in a chosen system**, then
hand the player the camera. It is instant — not an action on the timer spine.

**Site criteria (leaning, shape agreed 2026-07-09):**

1. **Unclaimed & quiet** — minimum graph-distance from other Corporations'
   known space (the modern descendant of the old design's 8–25-tile padding).
2. **Bootstrap-guaranteed** — the system has ≥ 1 mineable body on its #0003
   skeleton, so a fresh mind can always run the slice loop (scan → mine) and
   is never softlocked in a dead system.
3. **Frontier-weighted** — biased toward the periphery, per `vision.md`
   ("new players spawn at the fresh edge where their first-scans are
   genuinely valuable").

`?` **Spacing formula — deliberately open (2026-07-09).** How far apart minds
wake is a property of **the graph as a whole** — node density, region sizes,
and #0001's frontier-growth cadence — not a number this doc can pick in the
abstract. Decide with real generated graphs in hand, together with the
frontier-cadence work. The old 8–25 padding is precedent for the *shape*
(a min–max band), not for the numbers.

`?` **Is the wake-up system's initial scan free, or the first action?**
Free-at-spawn gives an immediate "here's home" moment; scan-as-first-action
tutorializes the core verb and leans into slice step 5. Leaning: first
action — but cheap to change, decide when the spawn spec meets
`scan-and-fog`.

**Frozen start area tie-in (leaning).** The logged-out landing (#0001's
frozen slice) reads naturally as **the mind in cold storage** — browsing a
recorded sector before waking. Signup = waking. This gives the start area a
diegetic frame and costs nothing; the open vision question (tutorial instance
vs. straight-to-frontier) is unchanged.

---

## Starting package (DECIDED 2026-07-09)

**One hull.** No base, no colony, no escort. The hull carries the minimal fit
the slice verbs require — sublight drive (#0004), a scanner, cargo space for
mine — with the actual numbers belonging to the verb specs and tuning, not
here. Everything else a player ever owns is **built**, not granted.

---

## Slice MVP vs. deferred

**In the slice:**
- Spawn endpoint: create Corporation + one fleet, placed by a simple version
  of the criteria (unclaimed system, ≥ 1 mineable body, away from other
  Corporations — trivially satisfied while the world is single-player, but
  shaped right from day one).
- The identity model in the schema: fleet references its Corporation; the
  Corporation is the auth-account-linked entity.
- Initial fog state per `fog-of-war.md` (whatever the free-vs-first-action
  scan decision says).

**Deferred:**
- Replication / multi-fleet (the build verb owns it).
- Any mechanical drift (traits at replication) — lore-only until then.
- The actual death → backup-restore flow (needs combat to exist first).
- Spacing tuning (needs real graphs + frontier cadence).
- Orphaned-asset / derelict rules; name-lineage carry-over.
- New-player grace (BACKLOG ⬜) — interacts with spacing; decide together.

---

## Open questions (rolled up)

**Decided 2026-07-09:**
- ~~Who is the player?~~ — an uploaded mind; Corporation = lineage, fleet =
  replicant copy in a hull; drift is canon ("follow your own path").
- ~~Starting package~~ — one hull, everything else is built.
- ~~Death trigger~~ — Corporation lives while ≥ 1 fleet lives; gone with the
  last fleet.
- ~~Restart model~~ — backup-restore; the restored mind is a drifted copy,
  mechanically fresh.

**Still open:**
- **Spacing formula** — a whole-graph property; decide with real graphs +
  frontier cadence (#0001 era).
- **Initial scan: free vs. first action** (leaning first action).
- **Orphaned assets** on Corporation death (leaning derelict/salvage; combat
  era).
- **What carries across a restore** (leaning nothing mechanical; name-lineage
  flavor cheap).

## Next step

Graduate as `/spec spawn` after the action-timer and `scan-and-fog` specs
land (spawn's fog interaction needs their contracts). On graduation: flip the
BACKLOG row (*Player spawn & placement*) to ✅, update the *Corporation* and
*unit taxonomy* rows to cite the spec, and make sure `vision.md`'s Core-loop
framing still matches (updated 2026-07-09 to the mind/lineage model).
