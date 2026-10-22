# Discovery and identity

Purpose: player/corporation identity, home creation, exploration claims and naming.
Canonical domain record, 2026-10-16.

## Settled model

An account is the authenticated user; a corporation is the player entity owning
fleets, credits and knowledge. Discovery/ownership, naming entitlement and knowing
an object's identity are different concepts. Naming protection is not a combat
shield. [Sensors](sensors-and-stealth.md) owns observation/identification, not this
page's control and naming rights.

### Discovery, control and naming — accepted 2026-10-19–20

This review revises the earlier exploration-claim and permanent-name design.
Discovery credit, current territorial control and ownership of individual assets
are distinct facts. Control grants celestial naming authority; discovery credit
and the history of names and control changes survive later transfers.

- Initial analysis of an untouched body establishes initial exploration control
  and naming authority. This is provisional: leaving an unsupported exploration
  claim does not reserve permanent authority against later established control.
  “Analysis” describes the exploration intent here; this review does not merge
  the existing Survey command with the sensors domain’s Analyze terminology.
- The first completed, operational station establishes system control. It may
  orbit the star, a planet or a moon; no station at every body is required.
  Uncontested system control extends to bodies with only exploration claims,
  including the authority to rename them while preserving their histories.
- Home stations belong to their spawning corporations. This is actual asset
  ownership, superseding honorary naming rights over NPC-owned property.
- Station ownership is separate from system control. Bob may request permission
  to build in Alice’s system; if Alice agrees, Bob completing his station leaves
  Alice in control. Bob owns and may rename his own station. Multiple station
  owners do not automatically make the system contested.
- Bob must deliberately initiate a challenge to take system control. An
  established station anywhere in the system can support a competing system
  claim. The initiation mechanics belong to later combat/control design.
- Competing claims make control **contested**. Freeze celestial renaming for
  the star, planets and moons throughout a system-control dispute; preserve
  existing names. Ownership of individual stations remains separate, including
  their owners’ naming authority. No percentage-based control formula is needed
  for this model.
- A dispute ends through agreement or when only one claimant retains an
  established territorial foothold. Competing footholds may be captured,
  destroyed or voluntarily relinquished. Station count alone does not decide
  control, and a larger visiting fleet does not automatically transfer it.
- A completed, operational station is the initial qualifying **territorial
  foothold**. Construction in progress cannot establish control or freeze naming.
  Once established, temporary damage or disabling its services does not remove
  the foothold. Other qualifying infrastructure remains future scope.
- Military capture requires overcoming or suppressing station defenses and
  completing a capture operation with a fleet remaining nearby. Defenders can
  interrupt capture by driving that fleet away. Capture can retain the station
  intact; destroying it is an alternative. Equipment, proximity, duration and
  detailed defense/capture conditions remain for combat design.
- Control can also transfer by agreement, including purchase or another exchange,
  without military capture. Contract execution and enforcement remain future
  design. Taxation, bribery and subterfuge are longer-term possibilities, not
  mechanics established by this review.
- If all established footholds are removed, the system becomes uncontrolled.
  A surviving fleet alone does not gain lasting control, and earlier exploration
  claims do not automatically reactivate. Preserve current names and history;
  a new controller must establish a qualifying station to gain territorial naming
  authority. A former claimant’s fleets elsewhere do not prolong a dispute.
- A later uncontested controller may rename its territory. This supersedes the
  earlier rule that the first confirmed celestial name is permanently locked.

These are accepted domain directions, not implemented construction, territorial
transfer, capture or renaming mechanics. The existing claim model does not
establish the new contracts by itself.

### Account and corporation lifecycle

An account survives the end of its corporation. Voluntary **dissolution** should
let a player end a corporation and start over, including after an undesirable
spawn or becoming stranded. It must not permit two living corporations for one
account. Dissolution timing, confirmation, any undo period, asset disposition and
successor inheritance remain deferred. Account-level corporation history and
statistics are future possibilities outside this review’s immediate scope.

Corporation survival through station ownership was explicitly deferred on
2026-10-20. Retain the current coded lifecycle rule for now; this review does
not extend corporation survival to stations or establish a new automatic death
flow. Reconcile the disposition of a dead corporation’s stations and territorial
claims in that later lifecycle review.

## Current implementation and gaps

- [Account](../../backend/account/model.go) links Firebase identity/profile;
  [Corporation](../../backend/corporations/model.go) owns player state.
  [ResolveCorporation](../../backend/middlewares/corporation.go) resolves the
  account-linked corporation and can continue corpless. It does not currently
  filter a dead linked corporation or establish a restart flow. Old account
  scaffold organization/membership prose is not the current model.
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
  first confirmed name is permanent in current code, identical retry succeeds.
  That lock predates the revised control-based naming direction above. Names
  are unique within a system, star names also galaxy-wide; [validation](../../backend/discovery/validation.go)
  normalizes and rejects invalid/reserved/offensive forms.
- Stations currently have one venue identity per system, NPC provisioning and
  discovery name/owner overlays. Multiple independently owned stations, coherent
  corporation ownership, owner-directed station renaming and territorial disputes
  are not established by that implementation; see [stations](stations.md).
- Corporation death requires zero fleets, but current gameplay has no fleet
  destruction path. Do not infer combat rules from administrative death support
  or equate `NamingProtected` with immunity to attack.

## Deferred design and implementation boundaries

This review settles the domain contract above and defers the following details;
it does not authorize gameplay implementation.

- **Stations/construction:** costs, completion and operational requirements,
  services, permission workflow and starting protection. Support multiple stations
  and consistent asset ownership before treating current station overlays as
  implementation of the accepted model.
- **Combat/control:** challenge initiation, detailed capture and interruption
  conditions, and how independently supported local holdings interact with system
  claims beyond the system-wide dispute model above.
- **Agreements/economy:** transfer execution, recognition and enforcement; future
  taxation and subterfuge. Which knowledge products players can trade remains a
  separate economy question.
- **Naming:** implement control succession, history, celestial naming freezes and
  station-owner renaming. Detailed repeat-renaming and validation policies, and
  the Survey/Analyze command distinction, are not redesigned here.
- **Lifecycle:** dissolution and restart mechanics, station-based survival,
  inheritance and disposition of assets/control after corporation death.

Active discovery/naming scratch work tracks the earlier implementation. Its
approved design remains provenance, but this review supersedes its display-only
claims, permanently locked celestial names and fixed station-name policy where
those conflict with the accepted direction above.

Historical deferred intent: [backup/restore lore](../lore.md) and #0009 envision
restoration into a new corporation with mechanically fresh state, while preserving
narrative lineage. No implemented restore flow is established here. Death/restore
rules, persistence of knowledge and player-facing restart need separate scoping;
this is not permission to erase an existing corporation.

## Related sources

[World](world.md), [stations](stations.md), [ships/fleets](ships-and-fleets.md),
[sensors](sensors-and-stealth.md), [economy](economy.md), [actions](actions-and-time.md).
Historical sources: [spawn spec](../history/2026-rebuild/specs/0009-spawn.md), [spawn plan](../plans/spawn.md).
