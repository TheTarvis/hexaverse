## Why

`build-production-space-view` (link 8a-2) cannot render a moving system or
price a burn before the player commits it, because three values the backend
already computes never reach the wire: a body's continuous orbital element
set (generated and persisted since `add-orbital-system-bodies`, serialized
nowhere), a lane gate's orbital element set (derived by `system.gateOrbit`
and thrown away), and the station-keeping upkeep rate (`space.StationKeepRate`,
on no DTO). And `space.SolveBurn` has no HTTP surface at all: the only way to
solve a burn is to commit it, so a pre-commit preview is unreachable without
either an endpoint or a client-side kinematics mirror the sole-authority rule
forbids.

This change is the backend half, split out of `build-production-space-view` on
its panel review's ruling (H7). It is **purely additive** — every field is new,
every endpoint is new, every rejection is opt-in — which is exactly what makes
the split safe: no coexistence period, no feature flag, no lattice field
removed here. **Neither half is a deferral**: 8a-2 cannot render or price
without this change, and this change is dead code until 8a-2 calls it. The
decisive reason to sequence them is that an SDET can write the failing
wire/preview contract suite before either developer starts — which the
renderer half's atomic-swap risk profile demands.

## What Changes

- **ADD the continuous orbital element set to the interior read's bodies**,
  under the new wire key `orbitElements`
  (`parentId`/`radius`/`periodMs`/`phase`/`inclination`/`node`). **The key is
  deliberately NOT `orbit`**: `orbit` is already occupied on that DTO by the
  *lattice* orbit (`{ring, angle0, period, dir}`), and reusing it would
  silently retype an occupied key. `orbitElements` is a distinct key, so
  nothing already on the wire changes meaning. The star carries none.
- **ADD the same element set to every lane-gate body** on the same read.
  `system.gateOrbit` already derives it at body-table construction and
  discards it; without it a gate snaps between polls while planets glide, and
  a gate-targeted burn's arrival ghost cannot be placed.
- **ADD `POST /v1/fleets/:fleetId/orders/preview`** — the solved burn (curve
  control points, arrival world-time, delta-v, fuel cost, affordability, the
  stranding indication) with no action created, no channel claimed, no fuel
  debited, and no burn stored. One handler over the solve half of the existing
  `fleet.OrderTo` path: no new math, no new fixture family, no
  `space-kinematics` delta, Go's sole authority over kinematics intact.
- **ADD an optional `maxFuelTons` cap on the burn commit** (`POST
  /v1/fleets/:fleetId/orders`). When present and exceeded by the solved fuel
  cost, the commit is rejected with its own named reason, distinct from the
  insufficient-fuel rejection, and nothing is debited. Absent, no cap is
  applied — so this is additive against every existing caller. This is the
  reject half of the quote-lock ruling `goods-sale`'s *Sell Commit* already
  proved; see design.md Decision 6 for why "there is no wrong price" was wrong.
- **ADD an owner-only station-keeping upkeep rate to the fleet read**, in fuel
  tons per second, so the hold/release control's drain readout has a wire
  source rather than a four-line client-side re-derivation from
  `orbitElements.periodMs`/`radius` — which would be a mirror of
  `space.StationKeepRate` and the `FuelParams.DeltaVPerTon` conversion, both
  rule-bearing.
- **Widen the fleet command endpoints' ownership check** to cover
  `/orders/preview`: unchecked, it would disclose a foreign fleet's live
  position, velocity, roster-derived acceleration and held fuel through the
  solved figures it returns.

## Impact

- **Affected specs**: `system-interior` (*Interior Read Endpoint*),
  `fleet-movement` (*Fleet Command Endpoints Are Restricted to the Owning
  Corporation*, plus three new requirements).
- **Affected code**: `backend/system` (`fog.go`'s `fogFeatureDTO`, `gates.go`'s
  `LaneGate`, `handler.go`), `backend/fleet` (`service.go`'s `OrderTo` solve
  extraction, `handler.go`'s new route and DTO fields), `backend/space` (read
  only — nothing in it changes).
- **Sequencing**: archives after `add-fuel-as-cargo` and
  `add-stationkeep-hold-verb` (its `fleet-movement` MODIFIED body is authored
  against their post-archive text) and before `build-production-space-view`.

## What this change deliberately does NOT do

- It removes **no** field. The lattice `orbit`, `parentId`, `fixed`,
  `footprint`, `band`, `live`, per-feature `asOf`, and a lane gate's `cell` all
  stay exactly as they are; `build-production-space-view` removes them, in the
  same change that stops reading them. Removing them here would break the
  live lattice view and make the split a migration.
- It ships no client code. Nothing in the frontend calls any of this until
  `build-production-space-view` lands, and that is stated rather than hidden:
  this change's own exit criterion is a green contract suite, not a playable
  screen.
