# Documentation migration map

Approved by Travis on 2026-10-16: “Lets go with your doc idea.” The canonical
entry point and nine domain owners are now written. This records source coverage,
implementation gaps and retained history; it establishes no new gameplay scope.
No historical source or scratch asset has been moved/deleted or pruned.

## Confirmed documentation requirements

Travis wants to inspect what stations, combat, travel, stealth and other domains
mean without repeating earlier conversations, including from his phone. Scratch
is ephemeral work in progress, never the authority for game rules. Prune scratch
only after its implementation is finished and its accepted decisions have been
preserved in canonical documentation. Preserve existing work while choosing the
structure. Confirmed intent and current implementation must remain distinguishable.

## Inventory and problem

Snapshot before adding this map: **63 Markdown files / 15,642 lines in docs**:
24 plans, 14 specs, 10 defects, nine root references, three agent guides and three
marketing files. **Scratch: 50 Markdown files / 3,156 lines**, grouped in five
work areas. Counts include working-tree documents, not just committed files;
images and source code are excluded.

[Specs](specs/README.md) and [plans](plans/README.md) already label their contents
historical. Their individual pages nevertheless contain accepted/implemented
badges, unresolved checkboxes and later amendments. Discovery by filename alone
can mistake those old claims for current requirements. The combined
[concept record](stealth-combat.md) was the starting point for current intent.
It now redirects to the owning domain pages; stations now have a concise home.

## Canonical navigation and ownership

[README](README.md) provides the phone-readable domain list and one-line purposes,
linked from root CLAUDE.md and the glossary. Each domain
page starts with purpose and settled rules, followed by open questions, current
implementation/gaps and related domains. Label intent, proposal and implemented
facts explicitly; link code/tests instead of copying implementation inventories.

| Canonical page | Owns | Related domains and current starting evidence |
| --- | --- | --- |
| [stations](domains/stations.md) | What a station is; docking/services/ownership and intended station gameplay | Travel, economy, discovery; [station model](../backend/stations/model.go), [service](../backend/stations/service.go), [goods history](plans/goods-market.md) |
| [travel](domains/travel.md) | In-system burns, point parking, body attachment, gates/lane travel and cancellation semantics | Ships/fleets, actions, sensors; [fleet](../backend/fleet/model.go), [space](../backend/space/park.go), [travel HUD](hud.md) |
| [sensors-and-stealth](domains/sensors-and-stealth.md) | Visibility, Sweep/Analyze, signatures, resolution/identity, historical intelligence | Travel, combat, ships/fleets, economy; current [confirmed record](stealth-combat.md), [disclosure](../backend/disclosure/contact.go) |
| [combat](domains/combat.md) | Lasers/missiles/PDC direction, targeting/control questions and later combat rules | Sensors, ships/fleets; current [confirmed record](stealth-combat.md); combat implementation is deferred |
| [ships-and-fleets](domains/ships-and-fleets.md) | Fleet vs individual ship, composition/roles, escort and piracy context | Travel, sensors, combat, economy; [fleet model](../backend/fleet/model.go), [historical decisions](plans/continous_space/decisions.md) |
| [world](domains/world.md) | Galaxy/systems, feature families, generation, orbits and immutable vs mutable world data | Discovery, travel, stations; [system model](../backend/system/model.go), [generation service](../backend/system/service.go), #0001/#0003 history |
| [economy](domains/economy.md) | Mining/cargo, fuel, credits, station demand/trade; intelligence trade as separately labeled intent | Stations, travel, sensors; [market](../backend/market/service.go), [mining](../backend/mine/service.go), goods/intel histories |
| [discovery-and-identity](domains/discovery-and-identity.md) | Account/corporation, spawn/home, discovery/claims/naming and protection | World, stations, sensors; [discovery](../backend/discovery/service.go), #0009 and active naming work |
| [actions-and-time](domains/actions-and-time.md) | Asynchronous commands, world time, channels and resolution contract | Travel, economy, sensors, combat; #0005 and current action code/tests |

Keep [HUD](hud.md), [art direction](art-direction.md), [testing](testing-tiers.md),
[phone preview](phone-preview.md), [vision](vision.md) and [lore](lore.md) as
cross-cutting references, linked from the new entry point. The glossary remains
one vocabulary source: short definitions with links to owning pages, no copied
rules. ADRs remain optional for real consequential trade-offs, following
[domain guidance](agents/domain.md). Directory boundaries do not imply new services.

`design-index.md` now points to README; `stealth-combat.md` redirects to domain
owners. Both historical paths remain discoverable. Accepted signature/LOS decisions,
open command contracts and code-audit gaps are preserved in the owner pages.

## Source-to-destination map

This maps every pre-migration docs group to an owner or retained reference role.
It is source coverage, not a claim that every historical line has been revalidated.
The initial domain pass uses targeted code audits; unresolved contracts remain open.
“Extract” means compare with code and later
confirmed intent, preserve uniquely relevant decisions in its owner, then retain
history with a clear pointer. It does not mean copying all historical rules.

| Current source(s) | Ownership / retained-source treatment |
| --- | --- |
| `specs/0001-galaxy-generation.md`, `0002-galaxy-view.md`, `0003-system-interior.md` | Extract world generation/data intent into world; discovery/read visibility into sensors/discovery. Retain numbered history and code-comment references. |
| `specs/0004-movement-board.md`, `0008-movement-galaxy.md` | Extract travel; cross-link actions. Mark hex/coast-era rules historical where code or later decisions replaced them. |
| `specs/0005-action-timer.md` | Extract actions/time contract after code verification; keep historical milestone scenarios separate. |
| `specs/0006-scan-and-fog.md` | Extract sensors history with explicit current/confirmed differences; accepted signature/LOS decisions are preserved in sensors-and-stealth. |
| `specs/0007-hex-board-view.md` | Historical renderer reference; transfer only surviving interaction principles into HUD, not hex architecture. |
| `specs/0009-spawn.md`, `0011-fleet-roster.md` | Discovery/identity and ships/fleets respectively; UI interaction belongs in HUD. |
| `specs/0010-mine.md` | Economy owns extraction/cargo intent; travel owns attachment semantics. |
| `specs/README.md`, `BACKLOG.md`, `TEMPLATE.md` | Retain historical index/template provenance initially. Old backlog is not active work; replace discovery with domain index, not a second live backlog. |
| `plans/hex-board.md`, `continous_space/{README,decisions,chain,visualization-spikes}.md` | Extract world/travel/ships/sensors decisions selectively. Retain history: even continuous-space notes contain obsolete mirror and rollout guidance. |
| `plans/movement-board.md`, `movement-galaxy.md`, `propellant-and-delta-v.md`, `camera-and-input.md` | Travel owns gameplay/physics intent, HUD owns input behavior. Validate supersession rather than accepting every “decided” label. |
| `plans/fog-of-war.md`, `sensors-and-stealth.md` | Sensors owns surviving intent; later canonical decisions supersede older scan/fog ideas. |
| `plans/market.md`, `goods-market.md`, `spawn.md`, `action-timer.md` | Economy, stations, discovery/identity and actions/time by ownership. Separate historical intended storage/listing/network features from actual implemented transactions. |
| `plans/system-hud.md`, `system-hud/chain.md`, `board-visual-language.md`, `webgl-board-port.md`, `webgpu-migration/brief.md`, `canvas/README.md` | HUD/art/architecture references; preserve accepted appearance and interaction decisions, not retired build chains. |
| `plans/README.md`, `BRAINSTORM.md`, `build-order.md` | Historical context/index. Route surviving confirmed concepts to domain owners; ideas and old milestones remain labeled history. |
| Root `stealth-combat.md`, `hud.md`, `art-direction.md` | Combined record split into domain owners with its old path retained as a redirect; HUD/art retain cross-cutting ownership. |
| Root `game-architecture.md`, `vision.md`, `lore.md`, `testing-tiers.md`, `phone-preview.md`, `design-index.md` | Keep reference roles above. Architecture needs historical/current distinction, not duplicated gameplay rules. Phone preview remains a permission-dependent proposal. |
| `agents/{domain,issue-tracker,triage-labels}.md` (3) | Keep operational agent guidance; point discovery to accepted canonical index. Imported skills remain unmodified. |
| `defects/*.md` (10) | Keep evidence/repro provenance; link affected domain/current code as useful. Do not turn defects into settled gameplay rules. |
| `marketing/README.md`, `marketing/social/CLAUDE.md`, `marketing/social/x/activity-log.md` (3) | Keep separate marketing role; no gameplay authority. |

## #0003 audit: preserve provenance, retire misleading authority

[System interior spec](specs/0003-system-interior.md) is dated July 7 and marked
accepted. It mixes durable domain ideas with retired representation and unresolved
implementation claims:

| Claim | Current evidence / classification |
| --- | --- |
| Hex/axial/cube coordinates, ring-sector bodies, SVG renderer | Superseded representation. [System model](../backend/system/model.go) has continuous orbital elements; [architecture](game-architecture.md) records deleted lattice and Go-owned physics/current WebGPU. Do not migrate the hex rules as current world design. |
| Unified features, resources/effects hanging from features, separate interior fetch | Surviving concepts evidenced by model/service; document in world after tracing current projections. Stations are now separately stored and spliced into reads. |
| Deterministic per-system generation and create-if-absent persistence | Present in [service](../backend/system/service.go) and [DAO](../backend/system/dao.go), despite stale unchecked persistence boxes in the spec. |
| Detail only on first physical arrival | Historical confirmed intention, **not the current exclusive trigger**: GetOrCreateInterior materializes on first request with an explicit arrival TODO. Record as intent/implementation gap; do not assert arrival gating is shipped. |
| Client/server evaluate matching hex positions; orbital period derived from ring tuning | Historical contract. Current continuous space has Go authority; exact surviving period/tuning rules need code verification, not copy/paste. |
| Hazards later modify movement/sensing | Intended/deferred in the spec, not established by storing effects or rendering hazard art. Confirm actual consumers before claiming mechanics. |

Inbound reference audit, excluding the spec itself: **24 files / 99 matching lines**
for `#0003`, `specs/0003` or `0003-system-interior` across docs/scratch/Go/TS sources
(excluding dependency/build trees). Of those, 19 are docs and five are Go files.
Only three docs name the exact filename: [spec index](specs/README.md),
[spawn plan](plans/spawn.md), [hex-board plan](plans/hex-board.md); many references
are plain-text spec numbers, not clickable links. High-density dependencies include
[board movement](specs/0004-movement-board.md) (21 matching lines),
[build order](plans/build-order.md) (11), and [scan/fog](specs/0006-scan-and-fog.md) (8).
Go references in system model/params and galaxy model/seed/skeleton preserve decision
provenance. Keep the numbered path or an explicit redirect; review incoming numeric
references as well as Markdown links before any archival move.

Duplicate chains to consolidate by ownership: hex-board plan → #0003 → build-order
→ architecture; fog-of-war plan → #0006 → sensors brainstorm → newer concept record;
movement plans → #0004/#0008 → continuous-space notes; HUD plan → scratch travel
spec → production HUD record. Later does not automatically mean fully implemented.

## Progress and scratch lifecycle

1. **Done:** domain boundaries approved; all nine owners and README are written. Historical sources and active scratch remain in place.
2. **Initial pass done:** stations/travel first, then remaining owners, using targeted
   code/source audits. Continue refining individual domains as work changes. Reconcile historical sources, current code and accepted
   conversation decisions. Capture each rule once, with origin and open discrepancies;
   link related owners instead of repeating shared rules. Review stations/travel first
   for immediate playability, while preserving the new sensing/combat decisions.
3. **Done:** README/glossary/CLAUDE discovery links, historical index pointers and
   combined-record redirect. Local links in changed files resolve. The old combined
   record has no incoming anchor fragments in docs/scratch; its file path remains.
   Numbered #0003 references retain their source path and a current-world pointer.
4. Scratch remains active while implementation/review is unfinished. Preserve accepted
   HUD shell/travel and art-production decisions in canonical HUD/art/domain records;
   preserve any referenced review assets or deliberately replace their links first.
   The current art-direction page itself links scratch images/prompts, so deleting
   scratch wholesale would break canonical references even after text extraction.
5. After implementation is finished and canonical decisions/evidence references are
   preserved, inspect incoming links, then prune only the completed scratch area.
   Preserve operational provenance needed for spending, asset rights and reproducibility.

Migration acceptance checks: phone-readable domain entry links; one owner per rule; confirmed
vs proposed vs implemented gaps distinguishable; no newly dangling links; no lost
accepted decisions; no deletion of active work; current code/tests still authoritative
for behavior. No gameplay behavior changes are part of this documentation migration.
