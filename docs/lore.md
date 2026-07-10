# Hexaverse — Universe & Lore

> **Living doc.** The *fiction that grounds the mechanics* — the "because" behind
> the rules the specs encode. When a mechanic needs a reason it exists, it should
> trace to something here; when the lore implies a mechanic, note it. High-level
> and evolving. `?` = open question; **TODO(travis)** = a blank only you can fill.
> Created 2026-07-08.
>
> **Grounds / grounded-by:** `vision.md` (what we're building & why), `plans/fog-of-war.md`
> (subspace knowledge *is* the fog), `plans/movement-galaxy.md` (lanes *are* subspace
> travel), `plans/market.md` (the market trades *current subspace* intel),
> `plans/spawn.md` (who the player *is* — the mind, its copies, death & backup),
> and specs #0001 (the star map) / #0004 (in-system movement).

---

## Premise

Every player is an **uploaded mind** — a consciousness archived long ago, woken
into a self-replicating hull on the galactic frontier (Bobiverse-style;
`plans/spawn.md`). The **Corporation** is the legal fiction a mind operates
under — and, more truly, its **lineage**: every fleet you own carries a copy of
you, and each copy **drifts**, developing its own personality and path. You
explore, extract, build, and compete — and knowledge itself is the scarce,
tradable prize. The galaxy is a shared, persistent, dangerous place; a lineage
can end, and a drifted backup can begin again. (See `vision.md` for the game's
goals and pillars; this doc explains the *world* those pillars sit in.)

---

## The two channels of knowledge (the load-bearing idea)

Everything about visibility, exploration, and the intel economy falls out of one
fact: **there are two ways to know something about the galaxy, carried by two
different physics, and they reveal completely different things.**

| | **Lightspeed** — telescopes | **Subspace** — lanes & presence |
|---|---|---|
| Medium | ordinary light, crossing real space | subspace, entered only via lanes |
| Reveals | the **star map**: that a system exists, where, coarse stellar character | the **road network** + **current truth**: lanes, live occupants, real resources, the interior |
| Reach | the whole galaxy, always | only where you have **presence** (or a relay/sensor that does) |
| Age | ancient & coarse (old light) | current & precise (now) |
| Who has it | **everyone** — common knowledge, unhideable | **only you**, earned, perishable |

### Lightspeed: you can always see the stars

Light crosses the galaxy, so from the very first moment every Corporation sees the
entire **star field** — positions, and coarse stellar character (a star-rich sector
literally *glows* richer; a dead zone is dim — that is a telescope reading). This is
common knowledge. No one can hide a star, and no one can sell you the fact that a
star is *there*. What the telescope gives you is **scale, orientation, and ambition**:
you can see the glittering cluster you covet long before you can reach or truly know
it.

### Subspace: the roads, and the truth, are earned

Faster-than-light travel happens only through **subspace lanes**. Light does not
travel them, and — crucially — **subspace geometry does not match real-space
geometry.** Two stars that look adjacent in the sky may have no lane between them;
a lane may run to somewhere that looks far away. So **the star map tells you nothing
about the roads.** You cannot infer routes by looking; you have to *map subspace by
being in it.*

This is why **you must reach a system to discover its onward lanes.** A lane's far
end is only detectable from within the system it departs — arrive, and that system's
subspace connections resolve; until then you know only the lanes leaving places
you've already been. Exploration is therefore the act of **tracing the road network
outward, one system at a time, toward stars you can already see but cannot yet
reach.**

Everything *current and actionable* — who is in a system right now, what it actually
yields, its hazards, its interior board — is likewise subspace/presence-gated. Old
light shows you a coarse, ancient star; only going there (or a subspace sensor/relay
that reaches there) shows you the truth as it is *now*.

---

## Barriers are subspace chokes, not walls

A galactic **barrier** is a region where subspace corridors are sparse or impossible
— but **light still crosses it.** So you *see* the stars on the far side with your
telescope (the promised land, glittering) while there are few or no lanes to get
there. A barrier is something you can look at and not reach. This is why barriers
funnel traffic through a handful of crossings (economic chokes) without ever being a
black wall — and it's exactly what the galaxy generator already produces: stars
visible everywhere, lanes sparse across the seam (spec #0001).

---

## Corporations — a mind, its copies, and what death means

A **Corporation** is the persistent player entity — in-fiction, a **lineage**:
one uploaded mind, copied into every hull it builds. **DECIDED (2026-07-09,
`plans/spawn.md`):**

- **Each fleet carries a replicant copy of the mind.** The fleet is the actor
  (#0004) because a fleet *is* a player-instance — it moves, senses, and works
  because someone is *in there*.
- **Copies drift.** Like the Bobs, each replicant diverges — its own voice,
  priorities, and path. Drift is the canon behind players (and later,
  individual fleets) following their own path: specialization is personality,
  not a menu.
- **The lineage lives while any copy lives.** Lose nine of ten fleets and the
  Corporation persists, bruised. Lose the last hull and the lineage is gone —
  total loss.
- **Restart is backup-restore.** An archived copy wakes in a new hull at the
  fresh frontier — a **new** Corporation, lore-continuous but mechanically
  fresh. *Leaning hand-wave for why nothing carries:* the archive holds the
  **seed copy** — the original upload, not a running snapshot of the veteran
  who died. What wakes is you, but not the you who mapped those roads; it has
  drifted in storage besides.

The wipe respects the two channels:

- **The star map is universal astronomy — it persists.** The sky doesn't reset;
  the woken copy sees the same stars everyone does.
- **What dies with the lineage is its *subspace* estate:** the lanes it had
  mapped, the systems it had surveyed, its holdings, and its intel inventory.
  The perishable, *earned* channel is exactly the one that starts over.

New Corporations — first spawns and restarts alike — wake at the **fresh
frontier edge** (`vision.md`), where the surrounding roads are unmapped and
first-hand subspace intel is genuinely valuable. Spawn criteria, spacing, and
the starting hull: `plans/spawn.md`.

---

## What the two channels ground (mechanic map)

The whole design leans on this spine. Each row is a mechanic and the lore fact it
rests on:

| Mechanic | Rests on |
|---|---|
| **Fog of war** = your *subspace-knowledge* layer over an always-visible star map | two channels — light is common, subspace is earned |
| **Exploration** = tracing the lane network outward by presence | subspace geometry is only locally detectable |
| **Movement** = travel only along known lanes | lanes are the only FTL medium |
| **Intel market** trades *current subspace* surveys, not star positions | the star map is free & common; subspace truth is scarce & perishable |
| **Generator regions** (star-rich / dead / barrier) read at a glance | coarse stellar character is a telescope observation |
| **Frontier** = the edge of *your mapped roads*, not the edge of what exists | you see the whole sky; you've charted little of it |
| **Restart** wipes subspace holdings, keeps the sky | the star map is universal, your road-map is yours |
| **Fleet as the actor** (#0004) — the fleet moves, senses, owns its state | each hull carries a copy of the mind; a fleet *is* a player-instance |
| **Multi-fleet control** (later) arrives as *replication*, not recruitment | a self-replicating mind builds copies; drift gives each one its flavour |

---

## Open threads

- **How much leaks through the telescope** (the dial): bare points of light →
  + brightness → + spectral class/region → + hints of large planets. Leaning: enough
  to see the star field and coarse richness (orientation + romance), with current
  truth and the road network firmly subspace-gated.
- **Relays / sensors as remote subspace eyes** — can a good subspace sensor detect a
  *neighbouring* system's lanes without travelling there (survey-at-range), or is
  presence always required? (Progression hook; base case = presence-only.)
- **Where do backups live?** The seed-archive hand-wave covers *what* wakes;
  *who keeps the archive* (an institution? automated vaults drifting between the
  stars?) is open flavour. Whatever it is, it's also the diegetic frame for the
  logged-out start area — the mind in **cold storage**, browsing before waking
  (`plans/spawn.md`).
- **How do copies share knowledge?** Fog is per-Corporation
  (`plans/fog-of-war.md`), which implies a lineage's copies pool what they
  sense — presumably over the subspace data network. Does a far-flung copy's
  discovery reach the lineage instantly, or only within relay reach? Base
  case: instant/abstracted; a relay-gated version is a progression hook that
  ties into the two-network (data vs. mass) model.
- **Why subspace geometry diverges from real space** — flavour depth we can leave
  vague, but a consistent hand-wave (subspace folds along mass/gravity, not distance)
  keeps barriers and long lanes feeling intentional.
