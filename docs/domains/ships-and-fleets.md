# Ships and fleets

Purpose: the individual hulls and grouped units players own and command.
Canonical domain record, 2026-10-16.

## Settled intent

A fleet groups ships that travel/act together; command-fleet selection is distinct
from inspecting an object. Travis envisions hauler, miner, explorer and military
roles, including hauling with escorts and piracy (2026-10-16). Role capabilities,
ship/fleet controls and formations remain open. Persistent individual signatures
are accepted; [sensors](sensors-and-stealth.md) owns their observation/grouping and
identification rules. This does not authorize a new per-ship movement model.

The established composition contract pools cargo at fleet level, sums hull hold/
mining capability, and constrains movement by the limiting hull rates. Current
code evidence is below; individual ship roles do not imply per-ship cargo UI.

## Fleet relationships — design direction, 2026-10-22

During fleet/object card foundation review, Travis requested Objects → filter by
Fleets → see fleets, representing owned, friendly, enemy and unknown categories.
Owned, friendly and enemy are observer-relative relationships; an inspected
foreign fleet is not thereby an owned command fleet. These are display categories,
not accepted diplomacy mechanics or combat permissions.

Travis clarified Unknown as observed burns that have not been analyzed, not
identified fleets of undecided allegiance. It is a knowledge category alongside
the relationship categories in the Fleets browser; see
[unknown burns](sensors-and-stealth.md#unknown-burns--accepted-browser-meaning-2026-10-22). Do not collapse
[sensor knowledge](sensors-and-stealth.md) into allegiance or interpret every
foreign fleet as an enemy. Neutral relationships, how friendliness/hostility is
established, and who supplies classification remain open. This direction does not
claim relationship classification or identified foreign-fleet reads are shipped.

## Current implementation and gaps

[Fleet model](../../backend/fleet/model.go) stores one kinematic state and
attachment relationship per fleet. `ShipEntry` currently stores only class:
no individual ship identifier, signature or position. Only the generalist seed
class exists. New specialized roles and signatures require implementation.

[Roster derivation](../../backend/fleet/roster.go) aggregates hold/mining/drive
output and uses limiting acceleration/lane rate. A missing legacy roster is read
as one seed hull. Cargo is a fleet pool, not per-ship allocation. Owner-facing
reads expose composition/cargo; [foreign-read tests](../../backend/fleet/roster_handler_test.go)
check withholding. No split/merge/ship-transfer API was found in the current audit.

## Own-fleet roster

Players need an own-fleet roster from both galaxy and system views: truthful
system/lane location, derived activity/countdown, and navigation to the fleet.
Foreign fleets are not an ownership roster. [FleetRoster](../../frontend/components/fleet/FleetRoster.tsx)
now conditionally owns commands when its mounting view has no command owner;
otherwise the view owns them. The old #0011 “navigation only” restriction is
superseded. Fleet records now support optional owner-facing `name` metadata, returned by the
fleet DTO on owner reads and omitted for foreign readers. The current model had no
name field before this read-contract change; this does not establish that every
live fleet has a stored name. Command and related own-fleet HUD text prefer the
served name, with an explicit legacy-ID fallback when it is missing or blank.
No names are generated, no live fleets are renamed, and no migration/backfill or
name-writing endpoint is introduced. Assignment/renaming policy and alerts remain
future questions. Commands, selection and query identity continue to use fleet IDs.

Selected-fleet status now uses
[FleetStatusCard](../../frontend/components/fleet/FleetStatusCard.tsx) from System,
Galaxy and fixture stories. It reads the served fleet roster for pooled cargo,
free hold and ship class counts; missing rosters are unavailable rather than
invented seed-hull UI data. It does not create individual ship IDs or per-ship
cargo allocation. The Galaxy roster retains selection and quick commands;
[HUD](../hud.md) owns the separate status launcher and task handoffs.

## Open questions

How are individual hulls created, transferred, refitted or lost? How do escorts
act together while retaining individual roles? What formation controls are worth
the complexity? Reconcile per-ship signature persistence with today's class-only
roster without assuming per-hull physics. Sensor contact grouping is not a fleet
membership or command model. Combat capabilities follow [combat scoping](combat.md).

## Related sources

[Travel](travel.md), [sensors](sensors-and-stealth.md), [economy](economy.md),
[combat](combat.md), [identity](discovery-and-identity.md).
Historical sources: [mine/composition decisions](../history/2026-rebuild/specs/0010-mine.md),
[fleet roster](../history/2026-rebuild/specs/0011-fleet-roster.md),
[continuous-space fleet decision](../plans/continous_space/decisions.md).

Historical #0010's “additional hulls are unmanned drones” is not a newly settled
rule for the later specialized-ship/escort direction. Reconcile role/control
semantics during future ship design instead of silently importing that constraint.
