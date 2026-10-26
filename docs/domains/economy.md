# Economy

Purpose: mining resources, hauling cargo, spending fuel and exchanging goods for
credits. Canonical domain record, 2026-10-16; current behavior is code-backed below.

## Settled intent

Physical goods require transport; information/credits and physical cargo are
separate concerns. The starter loop is mine → haul → dock → sell. Station services
belong to [stations](stations.md), movement to [travel](travel.md). Learned/traded
signature intelligence supports identification, but an intelligence-market product,
sale/disclosure contract and full exchange remain future design.
Historical source: [goods-market decisions](../plans/goods-market.md).

Resource-site terminology confirmed on 2026-10-23: the glossary's resource-host
role can overlap any [body kind](world.md), including planets and moons.
Physical kind alone does not determine extractable resources or mining eligibility;
current action checks below remain authoritative for implementation.

## Local capacity tuning — accepted direction, 2026-10-26

When local developer tuning reduces a ship class's hold capacity, discard cargo
above the affected fleet's new derived capacity. Travis explicitly chose
truncation rather than preserving an over-capacity load, given the local-only
tool's purpose, and asked for the simplest implementation. Trim cargo in one
proportional pass across all kinds, including fuel, without priority rules. This
does not establish a production cargo-loss rule or authorize cargo-population dev
tools. [HUD](../hud.md#developer-tuning-workspace--accepted-direction-2026-10-26)
owns the tuning controls and startup profile. The local
[cargo tool](../../backend/fleet/tuning_cargo.go) now performs this truncation
after Apply and on startup, including imported capacity reductions. It settles
accrued station-keeping upkeep and rebases a hold's fuel budget when clipping it.
The ordinary production cargo-loss contract is unchanged.

## Current implementation and gaps

- [Mining commit](../../backend/mine/service.go) requires ownership, attachment to
  a resource host, positive tonnage, remaining lode, mining capability, free hold
  and the movement channel. Belt member targets resolve to their parent belt lode.
  [Resolution](../../backend/mine/resolver.go) clamps to remaining resources/free
  capacity, records exactly-once lode debit and credits cargo, reporting completion,
  dry lode or full hold. Runs target tonnage of one resource kind; committed
  ETA derives from tons/rate. There is no scan prerequisite. Resource depletion
  deliberately gives players a reason to explore beyond a depleted host.
- The owner-only [mining options read](../../backend/mine/options.go) exposes
  current attachment/commit target, available resource kinds and remaining lode,
  free hold, mining rate, minimum tonnage and channel occupancy. It does not
  reserve resources; commitment revalidates them. The production
  [mining controller](../../frontend/hooks/use-mining-journey.ts) uses those
  prerequisites and confirms the exact action after a fleet settlement read.
  [HUD](../hud.md#production-mining-travel-and-search-adoption--2026-10-25)
  owns the shared review/status presentation and pending in-app acceptance.
- Cargo is pooled by fleet; all cargo, including fuel, occupies hold capacity.
  [Roster derivation](../../backend/fleet/roster.go) owns capacity/mining rate and
  free-hold arithmetic. Fuel is a reserved non-mineable cargo kind, not ore to sell.
- [Sell](../../backend/market/service.go) is an instant idempotent transaction,
  requiring an owned fleet attached to a visible station. It combines cargo debit,
  demand consumption and credit settlement; operation keys and optional price/
  proceeds guards protect retries and slippage. NPC demand combines a regional
  floor with finite expiring premium requests; [provisioning](../../backend/market/provisioning.go)
  and [parameters](../../backend/market/params.go) own their tuning.
- [Corporation credits](../../backend/corporations/credits.go) use a transactional
  balance and ledger with idempotency/fingerprint and reconciliation checks.
- [Refuel](../../backend/refuel/service.go) buys station fuel subject to attachment,
  hold and credits, idempotently, with rounded-up cost. Current station fuel supply
  is unlimited; this is not a market stock/listing engine.
- [Fuel rules](../../backend/fleet/fuel.go) and [parameters](../../backend/fleet/fuel_params.go)
  price burns by delta-v/hull count, refund unspent burn time on discard and reserve
  fuel for station-keeping. Numeric grants/prices/rates are tuning placeholders,
  not permanently agreed balance. Current burn cost does not model loaded cargo mass.

## Open questions

What intel can be sold, copied or retained, and how does buying it affect knowledge
without creating live visibility? Reconcile older [intel scoping](../plans/market.md)
with the later accepted sensing model before implementing contracts. Player listings,
manufacturing, dynamic pricing, station storage and network logistics in historical
roadmaps are not all current mechanics or new task scope.

## Related sources

[Stations](stations.md), [travel](travel.md), [ships/fleets](ships-and-fleets.md),
[sensors](sensors-and-stealth.md), [actions/time](actions-and-time.md).
Historical provenance: [mine spec](../history/2026-rebuild/specs/0010-mine.md),
[goods plan](../plans/goods-market.md), [intel plan](../plans/market.md).
