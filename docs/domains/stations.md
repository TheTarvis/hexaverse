# Stations

Purpose: dockable venues connecting travel, cargo and trade. Canonical domain
record, 2026-10-16; [documentation guide](../README.md) explains authority.

## Settled intent

The starter loop includes an NPC trading station in each spawn/respawn home
system so mining, hauling, docking and selling can begin locally. Stations are
structures with ownership, distinct from mineable resource hosts. Player-built
stations and network infrastructure are future ambitions, not shipped services.
Sources: [goods-market decisions](../plans/goods-market.md),
[Station definition](../../GLOSSARY.md).

## Current implementation and gaps

- [Station model](../../backend/stations/model.go) stores one venue per system;
  system ID is its venue identity, while `feat-station` is a local travel target.
  NPC provisioning is idempotent in [EnsureStation](../../backend/stations/service.go).
- Stations have their own store, separate from generated features. The
  [interior service](../../backend/system/service.go) splices them into system
  reads and derives orbital geometry. An orbit/park position alone is not
  permission to transact: attachment is a separate relationship.
- Requester reads use [GetVisible](../../backend/stations/service.go), gated by
  graph knowledge; hidden existence returns not-found. This differs from the
  internal ungated structural read. Discovery records can overlay name/owner;
  provisioning itself creates an NPC station.
- Station demand and docked sales exist; their rules belong to
  [economy](economy.md). Fuel service and docking semantics are linked there and
  in [travel](travel.md). Model fields for ownership are not a construction game.

## Open questions

What services, construction costs and ownership permissions should player stations
have? What station/relay networks are desired? Resolve these against current
claim/protection behavior before expanding station gameplay. Older plans' storage,
exchange and mass-transport ideas are not all implemented or newly approved.

## Related sources

[Economy](economy.md), [travel](travel.md), [discovery/identity](discovery-and-identity.md),
[world](world.md), [historical goods scoping](../plans/goods-market.md).
