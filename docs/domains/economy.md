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

## Current implementation and gaps

- [Mining commit](../../backend/mine/service.go) requires ownership, attachment to
  a resource host, positive tonnage, remaining lode, mining capability, free hold
  and the movement channel. Belt member targets resolve to their parent belt lode.
  [Resolution](../../backend/mine/resolver.go) clamps to remaining resources/free
  capacity, records exactly-once lode debit and credits cargo, reporting completion,
  dry lode or full hold. Runs target tonnage of one resource kind; committed
  ETA derives from tons/rate. There is no scan prerequisite. Resource depletion
  deliberately gives players a reason to explore beyond a depleted host.
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
