# Discovery and identity

Purpose: player/corporation identity, home creation, exploration claims and naming.
Canonical domain record, 2026-10-16.

## Settled model

An account is the authenticated user; a corporation is the player entity owning
fleets, credits and knowledge. Discovery/ownership, naming entitlement and knowing
an object's identity are different concepts. Naming protection is not a combat
shield. [Sensors](sensors-and-stealth.md) owns observation/identification, not this
page's claim and naming rights.

## Current implementation and gaps

- [Account](../../backend/account/model.go) links Firebase identity/profile;
  [Corporation](../../backend/corporations/model.go) owns player state.
  [ResolveCorporation](../../backend/middlewares/corporation.go) resolves the
  living corporation and can continue corpless. Old account scaffold organization/
  membership prose is not the current model.
- [Spawn](../../backend/corporations/service.go) reuses an existing corporation,
  validates names, atomically anchors account/corporation/home reservation, then
  heals interrupted assets. The normal service stack seeds at the home station,
  grants credits/fuel and reveals home; [healing tests](../../backend/corporations/spawn_healing_test.go)
  cover resumability. Point spawn is a legacy fallback, not the normal UI promise.
- [Site selection](../../backend/corporations/siteselection.go) walks the endless
  lane graph and selects from the first qualifying ring using an account-seeded
  choice: mineable, separated from other living explored systems, unreserved and
  with a safe station shell. Finite/periphery spawn descriptions are historical;
  spacing constants are [tuning](../../backend/corporations/params.go).
- [Survey](../../backend/fleet/survey.go) is a sensor-channel action for eligible,
  unprotected, in-range celestial targets with continuous survey-history checks.
  [Claim award](../../backend/discovery/claim.go) picks earliest valid ETA, breaking
  ties by action ID, and preserves an existing owner. [Arrival](../../backend/discovery/arrival.go)
  records first arrival separately.
- [Home/name transactions](../../backend/discovery/dao.go) reserve home star/station
  rights, arrival and station name. Home star ownership alone does not grant naming
  entitlement without survey. Name confirmation requires ownership/entitlement;
  first confirmed name is permanent, identical retry succeeds. Names are unique
  within a system, star names also galaxy-wide; [validation](../../backend/discovery/validation.go)
  normalizes and rejects invalid/reserved/offensive forms.
- Corporation death requires zero fleets, but current gameplay has no fleet
  destruction path. Do not infer combat rules from administrative death support
  or equate `NamingProtected` with immunity to attack.

## Open questions

How should future sovereignty, station construction and combat interact with
claims/home rights? Which knowledge products can players trade? Confirm those
contracts separately. Active discovery/naming scratch work is implementation
tracking; durable decisions belong here once verified, not in a second rulebook.

## Related sources

[World](world.md), [stations](stations.md), [ships/fleets](ships-and-fleets.md),
[sensors](sensors-and-stealth.md), [economy](economy.md), [actions](actions-and-time.md).
Historical sources: [spawn spec](../specs/0009-spawn.md), [spawn plan](../plans/spawn.md).
