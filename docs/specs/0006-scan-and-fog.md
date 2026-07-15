---
number: 0006
title: Scan & Fog of War
status: accepted   # draft | accepted | implemented | superseded
created: 2026-07-09
owner: Travis Wilson
supersedes:     # spec number(s) this replaces, if any
superseded_by:  # filled in when this spec is retired
---

# 0006 — Scan & Fog of War

> Per-Corporation visibility across both map tiers — **the star map is free,
> subspace knowledge is earned** — with three states (Unseen → Visible →
> Remembered), a **360° scan sweep** — occluded by large bodies, castable
> mid-burn — that reveals to you *and* mints the timestamped **observation**
> the intel market will later trade, and a server-side fog filter on every
> read. Fog **reveals and remembers; it never spoils** — spoilage (decay,
> valuation) belongs to the market. *(Revised 2026-07-14 — Decisions
> #15–#21: line-of-sight occlusion, lanes-by-scanning, two action channels,
> the sweep; #22–#24: the radial echo; #25–#26: going loud, the
> origin-pinned pulse.)*

## Problem / motivation

Exploration is the game's first pillar (`../vision.md`), and exploration only
reads as exploration if there is something you *don't know*. Today the world
model is fog-blind: #0001/#0002 stub a per-system `discovered: boolean` that
was always a placeholder, #0003 generates a full interior but delegates "what
counts as Explored" to this spec, and #0004 broadcasts burning fleets "while
Visible" with nobody defining who counts as Visible. Meanwhile the signature
mechanic — intel as a tradable good (`../plans/market.md`) — needs its atom:
scanning must *produce* something ownable and timestamped, or "knowledge is a
commodity" stays a slogan.

The design is worked out and locked in `../plans/fog-of-war.md` (graph tier
2026-07-08, board tier 2026-07-09), grounded in the two-channels lore
(`../lore.md`: lightspeed is common knowledge, subspace is earned), and
prototyped in `frontend/app/spike/hex-board/`. This spec is its buildable
distillation: the **observation data model + live visibility filter + the scan
verb**, built *before* the intel market that trades it.

## Goals

- **Three states, both tiers**: Unseen (no subspace knowledge) → Visible (live
  truth, inside sensor coverage now) → Remembered (last snapshot; the map stays
  drawn, live updates stop). Re-fog is exactly Visible → Remembered — never
  back to black.
- **Graph tier — star map free, roads earned**: every system renders from t=0
  (position, coarse region, **major-body inventory** — the "option (a)"
  skeleton), but lanes are learned **by scanning**: your first scan inside a
  system charts its lanes (the one you rode in was already charted — you can
  only travel known lanes). Subspace knowledge is a monotonic enum replacing
  the `discovered` stub; the working ladder is `starVisible → rumored →
  explored` (`surveyed` is reserved for the market's bought-intel write).
- **Board tier — three bands**: the **astronomical layer** (star, major
  bodies, orbital geometry) free and permanent from arrival; **ambient**
  presence resolves the small/dark and shows live activity; **scan** — a
  360° line-of-sight sweep — earns composition, threats, and the sellable
  snapshot.
- **Line of sight is real**: large bodies (the star, planets) shadow
  everything behind them from **both** sensing modes — beam and ambient
  bubble alike. Parking behind a planet hides you, even from an aimed scan;
  covering a system takes several scans as alignments shift.
- **Scanning doesn't stop the ship**: movement and sensing are separate
  single-slot action channels — a burning fleet can scan mid-burn, but never
  run two scans (or two burns) at once.
- **Scan does double duty**: reveals to me (fog) *and* mints a verified,
  timestamped observation into my inventory — the shared atom
  `{place, asOf, whatWasSeen, type}` the market later values.
- **Going active is loud — and the pulse marks your past**: an active scan
  is a broadcast, not a private read — every other Corporation with a unit
  in the system perceives the pulse at its **emission hex**: where you were
  when you pinged, not where you are now. Scanning is a tactical decision,
  not a free action: drift quiet on ambient, or light up the room —
  knowing that what you gave away is a stale fix (scan-then-run is real
  play).
- **Remembered = the clockwork keeps ticking, the activity freezes**: a
  remembered body keeps drifting to its correct orbital position (elements are
  deterministic); what stales is activity ("remaining: 340u, as of 2h ago").
- **Visible is computed, Remembered is stored sparse** — no players × tiles
  explosion; memory is **per-feature**, not per-tile.
- **Server-authoritative filtering**: every read returns *already-fogged* data
  for the requester; the raw world never ships to the client.
- **Fog is strictly per-Corporation** — sharing discovery is the market's job
  (selling intel), never a fog feature.
- **Resolves #0004's delegation**: the audience for a burning fleet's volatile
  snapshots = Corporations whose live sensor union covers it.
- **Resolves #0003's delegation**: physical **arrival is the "Explored"
  trigger** that generates a board's detail layer.

## Non-goals

- **Valuation, decay, freshness, the exchange** — how a snapshot *ages* and
  what it's *worth* is `../plans/market.md` → the future intel-market spec.
  Anywhere a decay curve or price appears in fog code, it's in the wrong place.
- **Buying intel into fog** (market touchpoint 2 — a purchase writes into
  Remembered) — lands with the market spec; the observation schema must simply
  not preclude it.
- **Alliance / shared vision** — decided *against* at the fog layer regardless
  of future social features: free shared vision would gut the intel market.
  Any future sharing is a market-design problem (discounted intel), not fog.
- **Stealth / detection depth** — quality-gated detection of faint/cloaked
  things is flagged as *where detection will live*, but is combat-adjacent and
  deferred. (Line-of-sight occlusion is *not* stealth — it's geometry, and it
  ships now. The **loud-scan rule** — Decision #25 — also ships now: it's the
  hook the stealth game later hangs on, not the stealth game itself.
  Quiet-running stances, emission control, and burn-flare detection stay
  deferred but must not be precluded.)
- **Scan variants** — quick-sweep vs. deep-scan and the per-scan
  `(range × speed × quality)` trade are **cut** (2026-07-14, Decision #18),
  not merely collapsed: one scan verb. Sensor progression returns later as
  hardware, not verb variants.
- **Directional (aimed) scan** — deferred, not cut (Decision #21): a future
  variant lets the player trade the full sweep for a narrow aimed cone. Its
  geometry (`board.BeamHexes`, golden-pinned, TS-mirrored) ships now unused;
  the slice verb is the 360° sweep.
- **Scanner as buildable hardware** — the intended progression (mine → build
  a scanner → install it on a hull → scan → find the lanes); the slice lets
  every hull scan as a placeholder fit.
- **Murk as a beam attenuator** — murk stays visible-but-occluding in
  spirit; slice occluders are star + planets only, murk attenuation is a
  follow-on.
- **Relay & sensor-tech upgrades, trait-based scan reduction** — deferred
  progression knobs (cheap to add).
- **Anti-cheat hardening** — the read path is *designed* server-filtered now;
  strict enforcement/auditing is deferred.
- **The transmission gate & two-network economy** (sell only in relay range,
  data-vs-mass asymmetry) — recorded in `market.md`/`BRAINSTORM.md`; fog keeps
  one line: intel is sellable when in range of a connected relay.

## Proposed approach

**One rule, both tiers: the lightspeed layer is free and common; subspace
truth is earned by presence or scanning** (`../lore.md`).

**Graph tier.** The whole star field renders for everyone from t=0 — position
(always precise; no fuzzing), coarse stellar character, and each system's
major-body skeleton (#0001 generates it eagerly; #0002 draws it). What's
earned is the *subspace* ladder over that free sky:

```
starVisible (all, free) → rumored → explored     (surveyed: reserved, market-only)
```

- **Rumored** — a charted lane reaches here: scanning a system charts its
  lanes and rumors their far endpoints.
- **Explored** — you went: full current interior; that board's own fog begins.
- **Surveyed** — *no fog writer* (2026-07-14, Decision #20). The enum value
  stays, reserved for the market's future bought-intel write — the paid
  appraisal without the trip.

**Scanning is the road-reveal trigger** — arrival explores the system you're
in, but its onward lanes stay dark until you **scan**: lanes are subspace
apertures, so lane detection is non-directional and never occluded — any
completed scan in the system charts them all, wherever the beam pointed. You
trace the network outward scan by scan (confirms `movement-galaxy.md`: you
can travel only *known* lanes — the one you arrived on was charted before you
rode it). Reveal is **monotonic** — tiers never drop; what ages is a
snapshot's worth, which is the market's problem.

**Board tier.** A hex is an orbital sector light-hours across — you can't hide
a planet, but you can't appraise one by looking either. Three bands:

| Band | Covers | Earned by | Live? |
|---|---|---|---|
| **Astronomical** (free) | star; major bodies' position + type + rough size/count; ring geometry; visible murk | free & permanent from arrival | static geometry |
| **Ambient / Visible** | the small/dark you pass; **live activity** (ships, mining *now*) | a unit's short sensor bubble, riding the unit — line-of-sight | **live** |
| **Scanned** | composition/richness, threats (incl. invisible killers), activity snapshot, ruins/anomalies — **mints the intel** | the slow 360° scan sweep — line-of-sight | snapshot |

The free dial is **generous** (inventory at a glance) but withholds worth;
asymmetry by body type is a feature — murk (nebula) is visible but hides
what's behind it and cuts scanning into it; invisible killers (gravity well,
radiation) show nothing until scanned or suffered.

**Sensing is one system, two modes, one law** — passive (ambient) is the
short live bubble riding every unit; active (scan) is the slow 360° sweep and
the only minter of intel. The law both obey is **line of sight**: large
bodies (the star, planets) shadow everything behind them, wherever the
clockwork puts them at the evaluation instant. A ship holding station behind
a planet is invisible to bubble and beam alike; the first occluder on a line
is itself seen (you see the planet, not past it).

**The sweep** (revised 2026-07-14, Decision #21) is a full 360° pass around
the fleet's position at the scan's ETA: one manual trigger, an automatic
all-around sweep that reveals scanned-band detail and mints observations for
every feature with **clear line of sight** — and nothing in shadow. Because
large bodies still occlude, covering a system takes several scans, from
several positions or times, as planet/star alignments shift — *where to scan
from* is still the play. A future **directional variant** (deferred) trades
the sweep for an aimed narrow cone (`board.BeamHexes` is its ready geometry).

**Going active makes you loud — from where you pinged** (2026-07-14,
Decisions #25–#26). The sweep is a broadcast in the lightspeed channel: the
pulse grows from the **emission hex pinned at commit** and stays there — the
ship moves on and collects the returns wherever it is. Every other
Corporation with a unit in the origin system perceives that pulse
(LOS-filtered per observer, the one law: a pulse behind a planet goes unheard
by the ship it shadows) via a pulse event on the system SSE channel the
moment the scan commits — but what they learn is the emission hex, a **stale
fix**, not a live track of the scanner. Passive presence sees only its short
bubble; going active buys system-wide reach at the cost of announcing where
you just were. That trade is the point — bait scans, scan-then-run, "who
just pinged us?" — and it is the seed the sensor/stealth/combat game grows
from.

**Scan rides the action spine (#0005), on its own channel**: movement (burn,
lane travel) and sensor (scan) are separate single-slot channels on the
fleet — a mid-burn fleet can scan, but never two scans at once. Commit
computes the ETA and pins the origin system; resolution evaluates
*everything at eta* — beam origin (`StateAt`), occluder positions, the
feature set — and mints observations with `asOf: eta`, correct even resolved
hours late, because state-at-eta is computable (fold the ledger ≤ eta,
evaluate kinematics at eta). If the fleet has left the origin system by eta
(a lane departure committed meanwhile), the scan **fizzles**: it resolves
`done` with an interrupted outcome and mints nothing. No fog on your own
perception: you always see your own units and their coverage, anywhere.

**The board is born in two phases** (resolves #0003's trigger): the
**skeleton** (star + major bodies + geometry) is generated eagerly at
system-creation — free, immutable, shown on the graph; the **detail**
(resources, small bodies, hazards, anomalies) is rolled lazily by the **first
fleet to physically arrive**, persisted create-if-absent (#0003's race guard,
triggered by #0005's arrival resolution), and becomes everyone's canon —
which every later player still fogs fresh from their own entry.

## Design details

- **Where it lands:** a top-level **`backend/observation/` domain**
  (handler→service→DAO per `backend/CLAUDE.md`) owning the observation atom,
  the reveal writes, and a **fog-filter service** that other domains
  (`system`, `fleet`, future `market`) call to project any read per requester
  — cross-domain via services, never DAOs. The scan verb is an action `type`
  registered with the #0005 dispatch.
- **Data model (Firestore, per-Corporation):**

  ```
  players/{pid}/observations/{systemId}            # graph tier
    tier      : 'rumored' | 'surveyed' | 'explored'   # monotonic; 'surveyed'
                # has no fog writer — reserved for the market's bought intel
    asOf      : worldTime of the last survey-grade snapshot
    snapshot? : the surveyed appraisal (worth, hazards, activity summary)

  players/{pid}/lanes/{laneId}                     # charted lanes
    via   : 'traveled' | 'scanned'    # (| 'purchased' — market, later)
    asOf  : worldTime charted

  players/{pid}/observations/{systemId}/features/{featureId}   # board tier
    elements  : the body's orbital elements as observed (geometry lives)
    detail?   : last-scanned composition/threat report
    activity? : last-seen activity (mining, fleets)
    asOf      : worldTime of last observation
  ```

  - **Per-feature, never per-tile** — bounded by where a player has actually
    been. **Empty space is never remembered** (nothing to store; it reverts to
    Unseen when the bubble leaves).
  - The observation doubles as the **intel inventory** — the same doc the
    market will list/sell (schema shared with `market.md`; valuation fields
    live there, not here).
- **The geometry is `board/` math** (pure, no Firestore/clock):
  `LineOfSight(origin, target, occluders)` — a hex is seen iff no large body
  sits strictly between it and the origin on the hex line — and
  `BeamHexes(origin, aim, params)` — the widening corridor from origin
  through the aim hex, clipped to the rim. Occluders are the large-body
  features (star, planets) at their computed positions for the evaluation
  instant. Golden cases in `/fixtures/board/cases.json`; `frontend/lib/hex`
  mirrors both (the Go↔TS contract, as with `SolveIntercept`).
- **Two channels on the fleet doc**: `activeActionId` (movement — #0005's
  original slot) + `activeScanId` (sensor), each claimed transactionally at
  commit and released at resolve/cancel. This cashes in #0005's
  "shaped to allow it later" hook; the action *queue* stays deferred.
- **API:** `POST /v1/fleets/:id/scan` — no aim; the sweep is all-around
  (Decision #21). Commit claims the sensor slot, pins the origin `systemId`
  **and the emission hex** (Decision #26) in the action params, and freezes
  the ETA (`now + Duration`). Cancel via
  the standard #0005 `POST /v1/actions/:id/cancel`. The deferred directional
  variant reintroduces a `{target}` body.
- **Visible is computed at read time** — the union of the requester's
  unit/base sensor radii, **line-of-sight filtered per unit**, evaluated
  against current positions (`f(elements, worldTime)` for coasters; live
  snapshots for burners). Never stored, zero write amplification. One
  definition — every consumer (board read, fleet audience, SSE fan-out)
  computes the union through the same board primitives.
- **Read path:** the #0002 graph read and the system/board read return
  **already-fogged** projections: stored Remembered snapshots, overwritten by
  live truth where currently Visible and flagged `live: true`. The subspace
  enum replaces `discovered` (older consumers treat `rumored+` as "has
  subspace knowledge"; the star layer renders regardless).
- **Charted lanes (graph-read filter):** the #0002 graph read ships the free
  star map — **every node** — but only the requester's **charted lanes**. A
  lane is charted iff the Corporation **traveled it**, **completed a scan in
  a system it's incident to**, or (later) bought it as intel — the per-lane
  docs above, *no longer derived from Explored-incidence* (revised
  2026-07-14). Everything else is filtered **server-side** (no ship-and-hide
  — Decision #13), so a fresh spawn sees **no lanes at all** until its first
  home scan (Decision #17 — amends #0009's onward-lane grant). This is the
  same charted-lane graph #0008 routes over; a Rumored neighbor is Rumored
  *because* a charted lane reaches it. (Node subspace tier still ships
  per-system so the inspector can label Uncharted/Rumored/Explored; only
  *lanes* are filtered out of the payload.)
- **Reveal writes:**
  - **Travel-arrival** (a #0005 lane-travel/burn resolution): system →
    `explored`, first-arrival detail generation triggered if absent. **No
    lane reveal** (revised 2026-07-14, Decision #17): onward lanes wait for
    a scan.
  - **Scan resolution**: mints/updates observations for the beam-touched,
    unshadowed features (`asOf: eta`); charts **all** the origin system's
    lanes (subspace — non-directional, regardless of aim) and tiers their
    far endpoints to `rumored`. Grants no tier above that; `explored` stays
    travel's.
  - **Ambient on-move** (decided 2026-07-09): passing through updates
    per-feature `asOf`/activity — so Remembered captures where you've been.
    The write happens **at movement-action resolution** (#0005), covering the
    sensor bubble **along the resolved path**, **line-of-sight filtered at
    each swept position** (deterministic, so what the bubble swept is
    computable at resolve time) — never per tick. Per-feature upserts keyed
    by featureId make repeat passes idempotent overwrites.
  - **Spawn** (amends #0009): home → `explored` only; **no lanes charted**.
    The wake-up beat is *scan to find the roads* — the first taught verb.
- **SSE audience (#0004 Decision #19's delegated half):** a burning fleet's
  volatile snapshots go to the system channel; the fog filter decides **per
  subscriber** whether the fleet is inside their live, LOS-filtered sensor
  union before fan-out (a fleet behind a planet is in nobody's union) — or
  on refetch (SSE stays invalidation-only per #0005).
- **The loud pulse (Decisions #25–#26):** scan commit publishes a
  **scan-pulse event** onto the origin system's SSE channel carrying the
  **emission hex** (identity: open question — leaning anonymous contact),
  fanned out to subscribers with a unit in that system, LOS-checked per
  observer against the emission hex — the "who just pinged us?" flash.
  That's the whole grant: **no live-band read of the scanner**, the
  foreign-fleet 404 gate stays governed by the ordinary union, and hearers
  get **nothing durable** — the pulse is a stale fix rendered client-side,
  gone when it fades.
- **Tuning is data:** ambient radius, scan duration, and the beam's width
  knobs (base half-width + spread-with-distance) live in the params object /
  `common.Tuning()`, spike values as defaults; quality tiers are gone with
  the scan variants.
- **Reference client:** `frontend/app/spike/hex-board/` demonstrates the
  three bands, presence reveal, deep-scan, Remembered ghosts that keep
  orbiting, and the KNOWN-FACTS panel — the production client reuses the
  rendering treatment (dim astronomical layer, live vs. remembered styling).

## Scenarios

*(Added 2026-07-14 with the beam revision — 0006 predates the scenario
convention; these pin the revised behavior.)*

### S1 — The sweep reveals what has line of sight, and only that

- **Given** a fleet in a system with features at clear angles and one in a
  large body's shadow
- **When** it commits a scan and the ETA resolves
- **Then** feature observations exist with `asOf = eta` for exactly the
  features with clear line of sight from the emission hex (occluders at
  eta — Decision #26) — all around, no aim — and the shadowed feature stays
  unseen for that Corporation

### S2 — A large body shadows the sweep

- **Given** a planet sitting on the line between the fleet and a farther
  feature
- **When** the scan resolves
- **Then** the planet itself is revealed but the feature in its shadow is
  not; a later scan from a position with a clear angle reveals it

### S3 — A burning fleet can scan

- **Given** a fleet mid-burn (movement slot claimed)
- **When** it commits a scan
- **Then** the commit succeeds on the sensor channel, both actions resolve
  independently, and the sweep's origin is the **emission hex pinned at
  commit** — the fleet's position then, via `StateAt` — while the burn
  carries the ship onward (Decision #26)

### S4 — One scan at a time

- **Given** a fleet with a scan already running
- **When** it commits a second scan
- **Then** the commit is rejected (sensor slot busy); cancelling the running
  scan releases the slot

### S5 — The first scan charts the system's lanes

- **Given** a Corporation present in a system with only its arrival lane
  charted
- **When** any scan it commits there resolves, regardless of aim
- **Then** all the system's lanes are charted for that Corporation, each far
  endpoint tiers up to `rumored` (monotonically — an `explored` neighbor
  stays `explored`), and no tier above `rumored` is granted

### S6 — A fresh spawn knows no roads

- **Given** a new account
- **When** it spawns
- **Then** home is `explored` with **zero** lanes charted and its graph read
  carries every node but no lanes; after its first home scan resolves, the
  home system's lanes appear

### S7 — Arrival explores but charts nothing new

- **Given** a fleet lane-traveling to a rumored system
- **When** the travel resolves
- **Then** the destination is `explored` for the owner and its onward lanes
  remain uncharted until a scan there resolves

### S8 — The ambient bubble is occluded

- **Given** a foreign fleet within my unit's ambient radius but behind a
  planet
- **When** I read the board or that fleet
- **Then** the foreign fleet is hidden (no live activity on the board; the
  direct fleet read 404s); when the alignment opens, it becomes visible

### S9 — Leaving the system fizzles a running scan

- **Given** a fleet with a scan running in system A
- **When** it departs down a lane and the scan's eta lands after departure
- **Then** the scan resolves `done` with an interrupted outcome and mints
  nothing

### S10 — A late-resolved scan mints the same snapshot

- **Given** a scan whose eta passed hours ago, during which occluders and the
  fleet kept moving
- **When** it resolves
- **Then** the minted observations are identical to an on-time resolve —
  sweep origin, occluder positions, and the feature set all evaluated at eta

## Acceptance criteria

*(Behavioral "done" lives in Scenarios above. Unchecked boxes are the
2026-07-14 beam-revision delta; checked ones survived it unchanged.)*

- [x] The graph read returns **every** system (star layer: position, region,
      major-body inventory) for any player from t=0, with a per-requester
      subspace tier; the `discovered` boolean is gone from #0001/#0002
      surfaces.
- [x] Subspace tiers are **monotonic** — no code path lowers one.
- [x] The working tier ladder is `starVisible → rumored → explored`: **no fog
      code path writes `surveyed`** (the enum value remains, reserved for the
      market). *(2026-07-14: `TestScanResolver_ChartsLanesAndRumorsNeighbors`.)*
- [x] The #0002 graph read returns only the requester's **charted lanes** —
      per-lane records written by travel and scan — filtered **server-side**;
      nodes still all ship. *(2026-07-14: `TestToDTO_ChartedLaneFilter`;
      routing runs over the same set — `TestPlanRoute_UnchartedLaneRefused`.)*
- [x] Beam and line-of-sight math live in **`board/`** as pure geometry with
      golden cases in `/fixtures/board/cases.json`, mirrored by
      `frontend/lib/hex` (Go↔TS agreement pinned by the golden test).
      *(2026-07-14: `board/visibility.go` ↔ `lib/hex/visibility.ts`.)*
- [x] The fleet doc carries **two single-slot channels** — `activeActionId`
      (movement) + `activeScanId` (sensor) — each claimed transactionally at
      commit and released at resolve/cancel. *(2026-07-14:
      `TestCommit_TwoChannelsCoexist`.)*
- [x] **One sensor-union definition**: board reads, fleet audience checks,
      and SSE fan-out all compute Visible through the same LOS-filtered union
      primitive (`observation.Coverage`) — no consumer rolls its own.
- [x] Board reads return the **astronomical layer for any arriver** (star,
      major bodies, geometry — from the eager #0003 skeleton), ambient-live
      content only inside the requester's **LOS-filtered** sensor union, and
      remembered features elsewhere.
- [x] **Remembered features keep orbiting**: a stored observation renders at
      its *current* computed orbital position, with activity/detail frozen at
      `asOf`. Empty space reverts to Unseen.
- [ ] **First physical arrival** triggers the #0003 detail roll exactly once
      (create-if-absent under #0005's resolution guard); later arrivers fog
      the same canon fresh.
- [x] Every fleet/system/graph read is **fog-filtered server-side per
      requester**; no API response contains world state the requester hasn't
      earned (verified by test: two players, one scans, the other's read is
      unchanged).
- [x] A burning fleet's snapshot reaches only observers whose **live,
      LOS-filtered sensor union** covers it (the #0004 audience contract).
      *(2026-07-14: `TestFleetVisibleTo_AmbientBubbleIsOccluded`.)*
- [x] Own-perception is never fogged: a player always reads their own units
      and their coverage, anywhere in the galaxy.
- [x] The frozen start area serves all-`explored` static data with no
      per-player state.
- [x] Ambient radius and scan duration live in the params object /
      `common.Tuning()`. (The directional variant's beam-width knobs return
      with it — Decision #21.)
- [ ] **A scan is loud from its emission hex** (#25–#26): commit publishes a
      pulse event carrying the emission hex to every corp with a unit in the
      origin system (LOS-checked per observer against that hex); hearers get
      a stale fix only — no live-band read of the scanner, no durable write,
      the fleet-read 404 gate untouched. Corps with no unit in the system
      perceive nothing. *(Scenarios S11+ to be added with the
      implementation — the spec is `accepted`, so scenarios arm the
      spec-to-test gate the moment they're written.)*
- [x] **The pulse is pinned at its origin** (#26): one ring, mechanically and
      visually — the echo front is `dist(emissionHex, F) ≤ front`,
      LOS-filtered from the emission hex, joining the live band as before;
      the resolve mints the LOS-clear features **from the emission hex**
      (occluders and the feature set still evaluated at eta); `ScanDuration`
      drops to match the faster single ring (tuning only). *(2026-07-14:
      `TestCoverage_EchoPinnedAtOrigin` + legacy fallback; commit pinning in
      `TestScan_CommitOnSensorChannel`/`TestScan_WhileBurning`; one-ring
      render in `ScanPing.test.tsx`.)*
- [ ] **Slice bar:** wake → scan home (lanes appear) → travel a lane → arrive
      (astronomical layer) → aim scans around a planet's shadow → detail +
      timestamped observations you own → leave → the system stays drawn,
      activity frozen at `asOf`.

## Decisions (imported from `../plans/fog-of-war.md`)

1. **Fog vs. intel boundary (2026-07-06):** one shared atom
   (`observation`); fog filters it (can I see it *now*?), the market values it
   (what's this recording worth *later*?). Fog reveals and remembers; it never
   spoils.
2. **One sensing system** — passive/active are corners of
   `(range × speed × quality)`; the six cells are the sensor progression axes;
   active scans trade their axes per scan (quick-sweep vs. deep-scan).
   *(Axis-trading scan variants cut 2026-07-14 — Decision #18.)*
3. **No fog on your own perception (2026-07-06)** — the gate is on
   *transmission* (sellable only in relay range; economy detail lives in
   `market.md`).
4. **Star map always visible; roads discovered by presence (2026-07-08** —
   supersedes "lanes are visible infrastructure"**)** — subspace geometry ≠
   real space; you must trace the network outward. Confirms lanes-only travel
   against *known* lanes. *(The "by presence" half superseded 2026-07-14 —
   Decision #17: roads are discovered by scanning; the star-map-free half
   stands.)*
5. **The graph shows the major-body inventory ("option (a)", 2026-07-09)** —
   beckons for free, withholds worth; survey intel's product becomes "how
   good", not "how big". Forces the character dial toward detail (richness/
   hazards) over count.
6. **Positions are always precise** — no Rumored fuzzing; reveal is
   **monotonic**.
7. **Board tier: three bands (2026-07-09)** — astronomical free (generous
   dial), ambient by presence, detail by scan; asymmetric by body type (murk
   visible-but-occluding; invisible killers blank until scanned/suffered).
8. **Presence vs. scan division** — presence = live activity + resolving the
   small/dark (mints nothing); scan = composition + threats + the sellable
   report (the only minter).
9. **Remembered = geometry lives, activity freezes** — the fog line sits on
   the ephemeris-vs-activity seam (#0004 Decision #6's wire split, same seam).
10. **Memory is per-feature, not per-tile; empty space is never remembered;
    Visible is computed, Remembered stored sparse.**
11. **Two-phase board birth (2026-07-09)** — skeleton eager at
    system-creation; detail lazy on **first physical arrival** (the "Explored"
    trigger #0003 delegated), first-arriver's roll is canon, later players fog
    it fresh.
12. **Fog is strictly per-Corporation (2026-07-06)** — shared vision would gut
    the intel market; sharing *is* the exchange.
13. **Server-authoritative filtering** — reads return already-fogged
    projections; never ship-and-hide client-side.

Resolved at acceptance (2026-07-09):

14. **Snapshot write cadence: both** — scan-completion *and* ambient-on-move.
    Scan-only would make Remembered forget live activity you watched but
    never scanned; ambient memory records presence's product (what was there,
    what it was doing) without touching scan's (composition, threats, the
    minted intel). Ambient writes land **at movement-action resolution**,
    path-swept by the bubble (endpoint-only is the acceptable degenerate
    fallback if path-sweeping proves fiddly in the slice; path-swept is the
    honest semantics).

The beam revision (2026-07-14, Travis):

15. **Scan is an aimed, occluded beam** — a straight(ish) corridor from the
    fleet (position at eta) through a target hex to the rim, width a tunable
    narrow cone; large bodies shadow what's behind them; covering a system
    takes several scans as alignments shift. Replaces the system-wide
    radius-0 slice scan. *(Superseded for the slice by #21, same day: the
    aimed cone is the deferred directional variant; occlusion-at-eta and
    everything else here stands.)*
16. **Line of sight is the lightspeed channel's law; lanes are subspace** —
    occlusion applies to the beam *and* the ambient bubble (and the SSE
    audience math); lane detection is non-directional and never occluded.
17. **Lanes are found by scanning** (supersedes the "by presence" half of
    Decision #4; amends #0008 arrival and #0009 spawn) — travel charts only
    the lane you rode; arrival explores but reveals no lanes; spawn charts
    none. Any completed scan in a system charts all its lanes and rumors
    their far endpoints.
18. **One scan verb; quick-sweep/deep-scan cut, not deferred** — aiming
    replaces quality as the interesting choice. Intended progression:
    scanner as buildable hardware (mine → build → install → scan); slice
    hulls carry a placeholder scanner.
19. **Two action channels** — movement + sensor, each single-slot
    (`activeActionId` + `activeScanId`); cashes in #0005's "shaped to allow
    it later" hook; the action queue stays deferred.
20. **`surveyed` writer retired** — the fog ladder in play is
    `starVisible → rumored → explored`; `surveyed` stays in the enum,
    reserved for the market's bought-intel write.
21. **The slice scan is a full 360° sweep (2026-07-14, Travis — playtest
    revision of #15)** — one manual trigger, an automatic all-around sweep
    from the fleet's position at eta; line-of-sight occlusion unchanged, so
    shadows still gate coverage and alignments still matter. Aiming is
    deferred to a **directional variant** (player trades the sweep for a
    narrow cone — `board.BeamHexes` stays as its ready, golden-pinned
    geometry; the width knobs return with it).

The radial-echo revision (2026-07-14, Travis — playtest revision of #21):

22. **The scan is a radial echo riding the fleet: details return by
    distance.** `ScanDuration` is the round-trip to the rim, so the
    returned-echo front sits at `BoardRadius × elapsed/duration` hexes —
    **centred on the unit's live position**: the antenna moves with the ship,
    burning or orbiting (a commit-pinned emission point was tried the same
    day and read wrong the moment a fleet drifted off its own scan). #21's
    origin-at-eta stands for the durable mint — where the antenna ends up is
    where the full sweep mints from — occluders and the feature set stay
    evaluated at eta, and the fizzle rule stands. *(Live-centring and the
    mint-at-eta origin superseded by #26, same day: one faster ring pinned
    at the emission hex; return-by-distance, eta evaluation of occluders/
    features, and the fizzle rule stand.)*
23. **Mid-scan reveal rides the LIVE band, not partial mints.** While a scan
    runs, the fog read (`observation.Coverage`) adds an **echo disc** —
    centred on the unit's live hex *(centring superseded by #26: the disc
    grows from the emission hex)*, radius = the front, LOS-filtered at read
    time — to the corp's live union, exactly as ambient bubbles join it. The
    #0005 spine is untouched: ONE resolve at eta still mints the durable
    memory (asOf eta), exactly-once; the front is computed per read, never
    stored. Everything inside the front reads `visible` (features, foreign
    fleets, the SSE audience math) and collapses to `remembered` at
    resolution.
24. **Cancelling a scan keeps nothing durable** (for now) — the transient
    live front vanishes with the claim; no partial mint on cancel. If
    playtest wants "abort keeps what echoed", that's a resolve-on-cancel
    variant to design against the exactly-once ledger. Owner: Travis;
    follow-on.

Going loud (2026-07-14, Travis):

25. **Going active makes you loud.** An active scan is a broadcast, not a
    private read: while a corp's scan runs, the pulse is perceptible to
    **every Corporation with a unit in the origin system** — a pulse event
    on the system SSE channel at commit, and the scanning fleet joining each
    hearer's live band for the scan's duration (LOS-filtered per observer —
    Decision #16's one law applies to the pulse too; live band only, no
    durable mint for the hearer, per #23's pattern). This makes scanning a
    **tactical decision, not a free action** — drift in quiet on passives,
    or light up the room and announce yourself — and it generates gameplay
    for free: bait scans, scan-then-run, "who just pinged us?". Recorded as
    the direction for scanning *and combat*: this rule is the seed of the
    Expanse-style sensor game; the stealth verbs it implies (quiet-running,
    emission control, burn-flare detection) stay deferred (Non-goals) but
    nothing may preclude them. Cancelling mid-scan closes the gate with the
    claim, same as #24 — a short ping-and-abort is itself a play (you were
    loud while it ran). *(The hearer's grant amended by #26, same day: the
    pulse marks the emission hex — a stale fix — with no live-band tracking
    of the scanner.)*

The origin-pinned pulse (2026-07-14, Travis — playtest revision of #22/#23/#25):

26. **One ring, faster, pinned at its origin.** The pulse — visual and
    mechanical, one consolidated ring — grows from the **emission hex pinned
    at commit** and stays there; the ship moves on and still collects the
    returns wherever it is. This reverses #22's live-centring with the
    benefit of a day's playtest: the commit-pinned point originally "read
    wrong" under a **two-ring** render (fast/bright flash + slow/dim front)
    where only the slow ring betrayed that it was following the ship; one
    faster ring left at its origin reads honestly — the stationary-antenna
    approximation, acceptable exactly because scans got fast. And pinning
    turns the loud rule (#25) into a stealth mechanic for free: hearers
    learn **where you pinged from, not where you are** — scan-then-run is
    real play, a bait ping doubly so. Consequences: the echo front (#23) is
    `dist(emissionHex, F) ≤ front`, LOS-filtered from the emission hex; the
    resolve mints the LOS-clear features **from the emission hex**, with
    occluders and the feature set still evaluated at eta (S10's late-resolve
    convention stands); #25's pulse event carries the emission hex and
    grants no live-band read of the scanner; fizzle-on-departure stands;
    `ScanDuration` drops via tuning — "faster" is a knob, not a schema
    change. The bistatic ellipse (both legs honest —
    `../plans/sensors-and-stealth.md`) stays shelved as the refinement if
    origin-pinning ever reads wrong again.

## Open questions

- **Scan duration default** — how slow before scanning feels like busywork;
  settled by feel at manual verify. Owner: Travis.
- **The directional variant** — when the aimed narrow cone lands, how do
  sweep and cone trade off (duration? reach past murk?). Owner: Travis;
  deferred (Decision #21).
- **Murk as attenuator** — murk should cut the beam (visible-but-occluding);
  slice occluders are star + planets only. Owner: Travis; follow-on.
- **Ambient: type or presence-only** for the small/dark it resolves (leaning
  presence-only — "something's here, scan it").
- **Character dial: detail vs. count** — how much may body-count vary before
  the free inventory leaks the appraisal (leaning count roughly uniform;
  richness/hazards carry character). Owner: Travis, with #0001 generation
  tuning.
- **Ambient grant & radius by unit type; relays as sensors vs. network** —
  leaning any-unit-grants-scaled-radius; relays get a modest bump only.
  Progression-era tuning.
- **Frozen start-area board: fog-off showcase vs. fog-on tutorial** — ties to
  `../vision.md`'s open tutorial-instance question. Owner: Travis; not
  blocking (slice ships fog-off showcase).
- **Pulse anonymity** — does the hearer learn *who* pinged, or only "a pulse
  from that hex at T"? With #26 there's no union-machinery read to reuse, so
  the lean flips to **anonymous contact** — identity becomes a
  detection-depth refinement that lands with stealth. Owner: Travis.
- **Pulse reach** — slice is origin-system-only, LOS-filtered. Physically a
  one-way pulse carries farther than its own round-trip return; should
  neighbors-with-presence, or very distant in-system listeners, hear a
  degraded ping? Owner: Travis; combat-era tuning.
- **Does a heard pulse leave a memory?** — "a ping came from there at T" as a
  Remembered trace would be tradable intel; slice keeps the hearer's side
  live-band only (Decision #25). Owner: Travis; market-adjacent follow-on.
- **"Known empty" / per-hex scanned memory** — the echo front shows scanned
  vs. not while a scan RUNS, but memory stays per-feature (Decision #10):
  space you swept and found empty is not recorded, so the board can't tint
  "seen space" after the fact. Persisting swept coverage (or scan origins +
  asOf, recomputed) would change storage and the fog read. Owner: Travis;
  design question, not slice-blocking.

## References

- `../plans/fog-of-war.md` — the full design (sensing model, arrival
  walkthrough, band tables, data-model reasoning).
- `../lore.md` — the two channels (lightspeed free / subspace earned); this
  spec is that lore made mechanical.
- Related specs: **#0005** (the action spine; two channels land here),
  **#0003** (skeleton/detail split; race guard), **#0004** (Visible audience
  for volatile snapshots; the fleet doc's slots), **#0008** (routes over
  charted lanes; arrival amended by Decision #17), **#0009** (spawn's fog
  write amended by Decision #17), **#0001/#0002** (the `discovered` stub this
  replaces; eager skeleton + inventory rendering).
- `../plans/market.md` — the boundary doc: valuation/decay/exchange; the
  transmission gate & two-network model.
- `../plans/movement-galaxy.md` — travel-as-reveal; known-lanes-only.
- `../plans/sensors-and-stealth.md` — the future-ideas shelf: exotic sensing
  verbs, the stealth game seeded by Decision #25, and the live tensions
  (bistatic ellipse, ping-vs-survey depth) not yet folded into this spec.
- `frontend/app/spike/hex-board/` — the three-bands prototype.
- `../vision.md` — exploration-first; knowledge as commodity.
