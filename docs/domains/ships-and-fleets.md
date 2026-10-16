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

## Open questions

How are individual hulls created, transferred, refitted or lost? How do escorts
act together while retaining individual roles? What formation controls are worth
the complexity? Reconcile per-ship signature persistence with today's class-only
roster without assuming per-hull physics. Sensor contact grouping is not a fleet
membership or command model. Combat capabilities follow [combat scoping](combat.md).

## Related sources

[Travel](travel.md), [sensors](sensors-and-stealth.md), [economy](economy.md),
[combat](combat.md), [identity](discovery-and-identity.md).
Historical sources: [mine/composition decisions](../specs/0010-mine.md),
[fleet roster](../specs/0011-fleet-roster.md),
[continuous-space fleet decision](../plans/continous_space/decisions.md).
