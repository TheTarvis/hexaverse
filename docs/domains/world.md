# World

Purpose: the galaxy, systems, generated objects and orbital geometry that other
activities use. Canonical domain record, 2026-10-16.

## Settled direction

The game has a galaxy/lane graph and continuous local system space. Seeded,
reproducible world generation connects system character to body/resource/hazard
content. Objects carry resources/effect data; geometric representation is not
itself a mining, visibility or hazard rule. Go owns authoritative physics; clients
render served geometry. Historical hex/ring cells are not the current world model.

Terminology confirmed by Travis on 2026-10-23: **Body** groups planets, moons,
asteroids and belts. **Resource site** is an overlapping resource-host role,
not a mutually exclusive physical kind. A planet or moon can be both a body
and a resource site. Stars and manufactured structures retain their separate
player-facing categories. Stations and lane gates are **Structures**, the shared
manufactured-installation category confirmed on 2026-10-23. This grouping does
not grant gates station services or station ownership rules. The glossary owns these definitions;
[economy](economy.md) owns extraction rules. This classification does not make
every body mineable or establish current action eligibility.

## Local tuning — accepted direction, 2026-10-26

Travis approved shared orbital-law and generation tuning staged until an explicit
Regenerate local world action. These controls must identify their regeneration
requirement. Existing bodies, stored fleet parking periods and derived station
orbits must not silently acquire inconsistent laws during ordinary play or a
restart. Regeneration starts fresh gameplay state: world, corporations, fleets,
actions and economy. Retain login accounts, tuning settings and audio preferences.
The local [reset DAO](../../backend/devtools/dao.go) recursively removes gameplay
collections, including orphaned subcollections, while preserving account
documents and leaving Firebase Auth alone. The service then promotes staged
generation settings and seeds a fresh live galaxy. World time retains its anchor;
signed-in players create a new corporation. The isolated
[emulator test](../../backend/devtools/dao_test.go) verifies the preservation and
recursive-deletion boundary. [HUD](../hud.md#developer-tuning-workspace--accepted-direction-2026-10-26)
owns the local-only controls and profile workflow; [actions/time](actions-and-time.md#local-clock-tuning--accepted-direction-2026-10-26)
owns live clock-speed continuity, which changes the pace of the whole simulation.

## Current implementation and gaps

- [Galaxy field](../../backend/galaxy/field.go) is an unbounded coordinate-pure
  seeded field, materialized in blocks by [galaxy service](../../backend/galaxy/service.go),
  with deterministic IDs/regions/gaps and lanes/bridges. The start-area asset is
  a frozen subset via [GenerateStartArea](../../backend/galaxy/generator.go), not
  proof the whole galaxy is finite or generated at seed time. [Lane records](../../backend/galaxy/model.go)
  store topology, with travel costs derived; bridge lanes are mechanically ordinary lanes.
- [Skeleton](../../backend/galaxy/skeleton.go) determines star/major-body types
  and mineability. [Interior generation](../../backend/system/generator.go)
  extends that skeleton with bodies, moons, belts and special features; composition
  and continuous geometry use separate deterministic streams.
- [GetOrCreateInterior](../../backend/system/service.go) materializes on the first
  request, with create-if-absent race handling in [DAO](../../backend/system/dao.go).
  Historical first-arrival-only detail generation remains an intention/gap; do
  not call it the exclusive shipped trigger.
- [Feature model](../../backend/system/model.go) carries resource/effect payloads,
  continuous size/extent and hierarchical [orbits](../../backend/space/orbit.go).
  [Continuous generation](../../backend/system/continuous.go) uses parent-child
  geometry; surviving generator ring ordinals are not navigable cells.
- [Stations](stations.md) use separate records spliced into system reads with
  [derived orbit geometry](../../backend/system/station_continuous.go). Corrupt
  geometry is omitted through the service's continuous cascade.
- Authenticated [interior reads](../../backend/system/handler.go) currently serve
  every feature and gate in full, even without a corporation; [tests](../../backend/system/fog_test.go)
  pin this. [Sensors](sensors-and-stealth.md) separately own foreign-ship disclosure.
  This supersedes old three-band feature-fog descriptions as current behavior.
- Hazard scan/movement modifier fields are generated data. The audit found no
  corresponding consumers in fleet/disclosure/mine/space; art and payload presence
  alone do not establish working hazard mechanics.

The existing served `SpaceBody` container is broader than the player-facing
Body category: it also carries stars and stations, with gates served as bodies.
The accepted vocabulary does not rename that transport type or change generation.

## Galaxy view and knowledge boundary

The galaxy uses native world coordinates, not force-directed rearrangement:
[GalaxyGraph](../../frontend/components/galaxy/GalaxyGraph.tsx) renders custom
Three geometry. [GalaxyView](../../frontend/components/galaxy/GalaxyView.tsx)
provides a free astronomical skeleton inspector and wake-focus;
[presence](../../frontend/components/galaxy/presence.ts) marks/recenters own fleets
outside lane transit. The [shared camera rig](../../frontend/components/map/map-camera-rig.ts)
provides orbit, ground-plane pan and touch dolly/pan to Galaxy and System. Galaxy
adapts Z-up coordinates; System adapts Y-up coordinates and extent-based limits.
The [HUD record](../hud.md) owns current input bindings; tuning is not fixed here.
[Galaxy query](../../frontend/hooks/use-galaxy.ts) separates authenticated live reads
from the frozen logged-out landing asset and waits for auth resolution.

[Galaxy handler](../../backend/galaxy/handler.go) projects the explicit charted-lane
set, not every lane incident to an explored system. Historical purchased-intel
writers and automatic explored-incidence reveal are not current implementations.
Future camera following/bounds/handoff and discovery changes remain separate design.

## Open questions

Should detail materialization become exclusive to arrival? What discovery rules
should hide anomalies/resources? What hazard effects should actually alter play?
Scope these deliberately with sensors/economy/travel rather than reviving old
checkboxes. New visual categories preserve current server disclosure.

## Related sources

[Discovery](discovery-and-identity.md), [sensors](sensors-and-stealth.md),
[travel](travel.md), [economy](economy.md), [stations](stations.md),
[art direction](../art-direction.md). Provenance:
[galaxy spec](../history/2026-rebuild/specs/0001-galaxy-generation.md),
[interior spec](../history/2026-rebuild/specs/0003-system-interior.md),
[continuous-space decisions](../plans/continous_space/decisions.md).
The [migration audit](../documentation-migration.md) explains #0003's surviving
ideas and stale claims; its numbered path remains for historical/code references.
