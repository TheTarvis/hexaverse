# Fog of War — Brainstorm

> **Living doc, high-level only.** Scratchpad to think through per-player
> visibility before it hardens into a `/spec`. Nothing here is committed design.
> `?` marks an open question; **TODO(travis)** marks a blank only you can fill.
> Feeds a future `docs/specs/NNNN-scan-and-fog.md`. Created 2026-07-06.
>
> Context: `../vision.md` (two-tier map), `BRAINSTORM.md`, and specs **#0001** /
> **#0002** (both *stub* a per-system `discovered` flag this doc makes real) and
> the archived `git show bf9c637:client/docs/Gameplay.mdc` (original single-map
> scan/influence radii). **Boundary with `market.md` established below — read it
> first.**

---

## Fog vs. intel — the boundary (read this first)

Fog of war and the intel economy **share one data atom but answer different
questions.** Keeping them separate is the whole reason this doc and `market.md`
are two docs.

| | **Fog of War** (this doc) | **Intel** (`market.md`) |
|---|---|---|
| Question | can *I* see it *right now*? | what's this *recording* worth *later*? |
| Tense | present | past → future |
| Subject | me, live | a buyer, a snapshot |
| Logic | sensor coverage + traits → visible set | volatility class → decay → price |
| Owns | reveal, remember, the live filter | freshness, decay curves, the exchange |
| Does **not** own | how a snapshot ages / what it's worth | who can see what live |

**The shared atom** is one `observation { place, asOf, whatWasSeen, type }`. Fog
**filters** it (am I in range now?); the market **values** it (how stale, how
much?). The orbit-is-computable / ship-position-cone / half-life thinking is all
**valuation → it lives in `market.md`, not here.**

**Two bridge touchpoints** (cross-referenced, not merged):

1. **A scan does double duty** — reveals tiles to me (fog) **and** mints a
   timestamped, verified snapshot into my intel inventory (`market.md` §1–2).
2. **Buying intel writes a snapshot into my *Remembered* fog** — it *populates*
   my map, but a receipt never grants *Visible* (live). To get live truth you
   still have to go (`market.md` §8).

> Rule for this doc: **fog reveals and remembers; it never spoils.** Spoilage is
> `market.md`'s job. Anywhere a decay curve or a price shows up here, it's in the
> wrong doc.

---

## Fog lives at both tiers of the map

The old design (`Gameplay.mdc`) had one hex map, so one fog. The 2.0 two-tier map
(`vision.md`) applies fog **twice**, with different texture:

| | **Galactic graph** (strategic) | **Hex board** (tactical) |
|---|---|---|
| Unit of visibility | a **system node** | a **tile** |
| What's hidden | which systems exist / their character | terrain, resources, hazards, enemy units |
| Reveal by | travel (charts onward lanes), survey-scan, bought intel — star map always visible | ambient unit vision + scan actions |
| Re-fog feel | node stays; live activity stops updating | live layer stops updating; terrain stays drawn |
| Slice stub today | `discovered: boolean` (#0001/#0002) | nothing yet (hex board unspec'd) |

Both tiers use the same three states below; they differ only in granularity and
in *what reveals what*.

---

## The three states (both tiers)

```
  UNSEEN ───observe───▶ VISIBLE ───leave sensor range───▶ REMEMBERED
  (full fog)           (live truth)   ◀──re-observe───   (last snapshot)
```

1. **Unseen** — no *subspace* knowledge. On the graph you **still see the star**
   (lightspeed/telescope is common knowledge — `../lore.md`); what you lack is any
   subspace read: no charted lane to it, no current truth. On the board: black tile.
2. **Visible** — inside an active sensor radius **right now**. Live, authoritative
   truth: current enemy positions, everything.
3. **Remembered** — observed before, no longer in sensor range. The map **stays
   drawn** (terrain, orbits, that a system exists — you navigate fine), but you
   **stop receiving live updates** on anything that can move or change. A fleet
   you'd spotted is now a last-known ghost, or gone.

**Re-fogging, in the fog sense, is exactly the Visible → Remembered transition:**
*you stop getting live positions for things outside your current sensor coverage.*
That's all. The map does **not** erase back to black. **How much a given Remembered
snapshot is still *worth* — how its confidence decays — is `market.md`'s question,
not fog's.** Fog just marks it "not live."

---

## Sensing model — passive & active × (range / speed / quality)

**DECIDED (2026-07-06): one sensing system, two modes, three attributes.**
Passive and active aren't different mechanics — they're opposite corners of one
`(range × speed × quality)` space. Passive = the **fast-shallow-near** corner;
active = the **slow-deep-far** corner.

| | **Passive** (ambient) | **Active** (scan action) |
|---|---|---|
| **Range** | short | long (aimed) |
| **Speed** | continuous / instant refresh | slow — a timed action (async) |
| **Quality** | low — presence, coarse | high — full detail |
| Mints intel? | no | **yes** (snapshot → inventory; market bridge, touchpoint 1) |
| Cost | free (just being there) | an action / time / energy |

- **Passive presence keeps your own space live** so a chill player never re-scans
  their own doorstep — this **resolves `market.md` §6**: presence *is* what holds
  local knowledge fresh, so the market lives on *remote* intel (places you're not).
- **These six cells are *the* progression axes.** `vision.md`'s vague "better
  scanners" = bigger range / faster refresh / higher quality, on either mode. This
  is the concrete sensor sub-tree under its progression pillar.

**DECIDED (2026-07-06): active scan trades its axes — player's choice per scan.**
The same scanner can run a **quick sweep** (fast, wide, low quality → Rumored-level
"anything out there?") or a **deep scan** (slow, narrow, high quality →
Explored-level "fully work this system"). Chill-friendly and tactical; you upgrade
the *envelope* (hardware/tech), you spend within it *per scan*.

Three things quality drives (keeping fog's half clean of market's):

1. **Quality tiers-up graph knowledge.** Scan quality *is* the Rumored → Surveyed
   → Explored ladder: low → Rumored, medium → Surveyed, high → Explored. So
   **range = what you can reach, quality = what tier you learn, speed = how long /
   how fresh you hold it.**
2. **Quality sets the snapshot's *initial* confidence** — the clean hand-off to
   `market.md`: fog/scan mints an observation at some starting quality; the market
   *decays* it from there. Quality is fog-side (the sensing); decay is market-side
   (the aging). No boundary violation.
3. **Quality is where *detection* will live** (deferred): a faint/cloaked/distant
   thing needs higher quality to see at all — passive misses the stealthed fleet a
   deep-scan catches. Stealth/counter-sensor counterplay; combat-adjacent, so
   **flag-and-defer**, but it's why quality matters beyond flavor.

`?` **What grants ambient / range by unit type.** Leaning **any unit grants it,
radius scales by type** (probe tiny → ship small → base medium). Ambient is
*local*: a lone probe keeps its few tiles live, not a whole board — real live
coverage of a system costs real presence. (Board tier: live truth = union of your
units' radii; the rest sits Remembered, so an enemy can still slip the gaps.)
`?` **Relays — big sensors, or strong network + only modest sight?** Leaning
*modest ambient bump* but reserve *wide* sensing for dedicated scanner ships /
sensor-bases, so seeing stays a deliberate investment. Ties relays to the
station/relay network in `market.md`.
`?` Do tile traits cut **range/quality** (archive: nebula reduces scans)? Leaning
**yes** — cheap, adds terrain meaning, creates naturally-foggy regions (and
raises the quality bar to see *into* them — connection 3).

---

## Your own assets & the transmission gate

**DECIDED (2026-07-06): no fog on your own perception; the gate is on
*transmission*.** You **always see your own units and everything in their sensor
coverage** (passive range + any active scans), anywhere in the galaxy — a private
command link to your own Corporation. What's gated is **transmitting** what you
gathered onto the shared network: you can only transmit **when within network
range of a teleportation device** (station/relay). Off-grid, you *know* the intel
(it's in your own map/inventory) but it's **stranded** — unsellable, unlistable —
until you carry the unit back into network range or extend the net to it. Matches
`market.md`'s "intel requires network connectivity" decision.

This means **three separate fields** your infrastructure projects — keep them
distinct (an earlier draft lumped the last two as vague "network coverage"; they
are *not* one thing):

| Field | Answers | Projected by | Physics |
|---|---|---|---|
| **Sensor coverage** | what can I *see*? | units, scanners, bases, modest relays | fog (Visible vs Remembered) |
| **Relay / data net** | can I *sell* what I scanned? | relays (in-system) | **instant + global** across a connected relay; **one relay = in the intel market** |
| **Station / mass net** | can I *move materials*? | stations (in-system) | **short-range adjacent lane-hops, per-hop toll**; needs a contiguous chain |

**The two transmission nets are deliberately asymmetric** (DECIDED 2026-07-06),
enforced by **cost**: data is weightless → **cheap relays**, instant, global; mass
is heavy → **prohibitively expensive stations** (else everyone stations every node
and hauling dies), **short-range lane-hop** teleport, toll per hop. Consequences:
a lone frontier station connects to nothing; **hauling** (async, at-risk freighter
to the nearest hub) is the default for everything off a built-out corridor; choke
points are **hard for mass** (no chain across a laneless barrier) but **soft for
data** (a single relay still uplinks intel out). NPC hub stations anchor the core
so early trade works (`market.md`); the prohibitive cost is on *player* frontier
extension.

> Full two-network model → `market.md` (intel side) + `BRAINSTORM.md` → Goods &
> logistics (mass side). **Fog only needs one line: intel is sellable when in range
> of a connected relay** — everything else here is economy, parked in those docs.

## Graph-tier: progressive revelation (recommended)

> **Movement model → now owned by `movement-galaxy.md`** (the graph-tier movement
> doc). One line fog needs: **travel is lane-based** (follow #0001 edges;
> "adjacent" = lane-connected), and **travel is the primary reveal trigger** — you
> send a ship down a *known* lane and *arriving reveals the system **and its onward
> lanes***. You learn the road network by **presence, not sight** (below). Everything
> else — roads-vs-off-road, FTL range, lane cost, at-risk transit — lives in that doc.

**DECIDED (2026-07-08 — supersedes the 2026-07-06 "lanes are visible infrastructure"
call): the star map is always visible; the *road network* is discovered by presence.**
Two channels (`../lore.md`): **lightspeed** shows every star from t=0 (position +
coarse region) — common knowledge, always drawn. **Subspace lanes do not show at
range** — you learn a system's onward lanes only by **reaching it**, so you start
knowing only the lanes leaving places you've already been. The tiers therefore
describe your *subspace* knowledge of a star you can already see:

0. **Star-visible** — baseline, every system, free, from the telescope: it exists,
   where, coarse region. No charted lane to it, no current truth. This is the
   *aspirational* layer — you see the cluster you covet long before any road to it
   exists. *(This is what makes the graph beckon — the whole sky, glittering and
   unreached — the role the old "auto-Rumored neighbor" stubs used to play.)*
1. **Rumored** — you've learned (by presence at an endpoint) that a **lane reaches
   here**; it's reachable-next. Region already known from the star map; interior and
   current state unknown.
2. **Surveyed** — a **quick-sweep** scan, bought survey intel, or travel-adjacent:
   current subspace character beyond the ancient light (rough contents / activity /
   hazards) — not the full interior.
3. **Explored** — **travel there** / station a unit / **deep-scan** in-system. Full
   current interior (that board's own fog then begins, one tier down).

Why the reversal: route-finding becomes a real act — you must **trace subspace outward**
toward the stars you can already see, one system at a time, rather than reading a road
map handed to you for free. It's also lore-honest (subspace geometry ≠ real space, so
the telescope can't show the roads). This **confirms `movement-galaxy.md`'s open rider →
you can travel only *known* lanes** (no blind jump to a star with no charted route).

The star map is permanent and systems don't move, so **subspace reveal is monotonic** —
once Rumored/Surveyed/Explored, it never drops back. (What *ages* is a snapshot's
*worth* — a `market.md` concern, surfaced as "last scanned 3h ago," not the node
vanishing.)

This replaces #0001/#0002's stub `discovered: boolean` with a small enum. Because every
star is always drawn, the enum is about *subspace* knowledge:
`starVisible (all) → rumored → surveyed → explored` (older `discovered` consumers treat
`rumored+` as "has subspace knowledge"; the star layer renders regardless).

**Position is always precise** — the telescope pins real `(x,y,z)` from t=0. This
resolves the old Rumored-fuzzing question (no fuzzing) and happens to suit the #0002
renderer, whose nodes are pinned to true coords anyway.

---

## Data model — the scary part (per-player-per-place)

Naïve "store visibility per player per tile" explodes (players × tiles). Keep it
sane by separating **computed** from **stored**:

- **Visible (live) is computed, never stored.** At read time, from the player's
  unit/base positions + radii, compute the active sensor union. Cheap, always
  current, zero write amplification.
- **Remembered is stored, but sparse.** Persist only places a player has *actually
  observed* — bounded by where they've been, not the whole galaxy. Each is one
  **observation** doc (the shared atom): `{ place, asOf, whatWasSeen, type }`.
  This doubles as their **intel inventory** — same atom the market trades.

Sketch (Firestore, per `backend/CLAUDE.md` layering — server-authoritative):

```
players/{pid}/observations/{systemId}                 # graph tier: reveal-level + survey snapshot + asOf
players/{pid}/observations/{systemId}/tiles/{tileId}  # board tier: static memory + asOf (lazy, visited systems only)
```

- **Server-authoritative and filtered.** The backend decides what a player may see
  and **only sends that** — never ship the whole galaxy and hide it client-side
  (anti-cheat; a deferred *concern*, but the read path must not preclude it). The
  #0002 read API returns *already-fogged* data per requester.
- **Ambient-live overlay at read:** response = stored Remembered snapshots, with
  currently-Visible places overwritten by live truth and flagged `live: true`.

`?` Write cadence for snapshots — on scan-completion only (clean, event-driven via
Pub/Sub), or also on unit-move for ambient? Leaning **scan-completion + on-move**,
so Remembered captures where you passed through.
`?` Does the logged-out **frozen start area** (#0001/#0002) just ship
all-`explored`? Yes — curated static asset, no per-player state, fog is cosmetic
there.

---

## Slice MVP vs. deferred

The first vertical slice (`vision.md`) needs *enough* fog that exploration reads
as exploration — not more.

**In the slice:**
- Graph: **star map always drawn** (all systems visible, coarse region); replace the
  `discovered` stub with subspace tiers `rumored | explored` (survey optional) over
  it. **Onward lanes revealed on travel-arrival (presence)** — you begin knowing only
  home's lanes. **Monotonic.**
- Board: **two states** (Unseen / Seen) or a light three-state. Ambient vision
  around units + **one Scan action** that reveals a radius and persists.
- **Scan mints an observation** (so "scanning produces intelligence" is true from
  day one) — but nothing *consumes* freshness yet.

**Deferred (lands with the market, not fog):**
- Snapshot decay / valuation / freshness — all `market.md`.
- Buying/selling into fog (the touchpoint-2 write path).
- Relay/tech vision upgrades, trait-based scan reduction (cheap — could sneak in).
- Anti-cheat hardening of the per-player filter — *design* the read path for it
  now, *enforce* strictly later.

> Slice rule (restated): **it reveals and remembers; it doesn't yet spoil.**

---

## Open questions (fog-specific — decay/pricing questions live in `market.md`)

- **Graph sweep reach** — a quick-sweep surveys *direct* lane-neighbors (1 hop);
  does higher range/quality reach *2 hops* (survey a neighbor-of-a-neighbor)?
  (Range is an upgrade axis, so likely yes at higher tiers.)
- **Strict-lanes vs. hybrid** — *moved to `movement-galaxy.md`* (its open rider):
  commit to lanes-only forever, or keep the slow off-road hybrid as the target
  (leaning hybrid). Noted here only because fog-reveal rides on the travel model.
- **Rumored precision** — true coords vs. fuzzed until surveyed.
- **Snapshot write cadence** — scan-completion only, or ambient-on-move too.
- *(In the sensing section:* what grants ambient / range-by-type, relays as
  sensors vs. network, trait effects on range/quality.*)*
- ~~does fog apply to your own stuff?~~ **RESOLVED** — no fog on own perception;
  transmission is network-gated (see *Your own assets & the transmission gate*).
- ~~shared vision / alliances?~~ **RESOLVED (2026-07-06): fog is strictly
  per-Corporation.** Not merely "social is deferred" — free shared vision would
  *gut the intel market* (why buy intel an ally reveals for free?). The sanctioned
  way to share discovery **is** the exchange: sell it. Any future alliance sharing
  is a *market-design* problem (e.g. discounted intel between allies), **not** a
  fog one — so fog stays per-Corp regardless.
- ~~materials vs. data transmission~~ **RESOLVED** — two-network model recorded in
  `market.md` + `BRAINSTORM.md`; fog keeps only the relay/sell line.

## Next step

Graduate to `/spec scan-and-fog` (the name `market.md`'s build-order note uses) —
the intel *data model* + live visibility — **before** `/spec intel-market` (the
exchange that trades it). Likely paired with the hex-board interior spec (fog needs
tiles to hide). Flip the BACKLOG row (`docs/specs/BACKLOG.md`, Fog of war) to ✅
then.
