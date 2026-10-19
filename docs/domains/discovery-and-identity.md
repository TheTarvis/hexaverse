# Discovery and identity

Purpose: player/corporation identity, home creation, exploration claims and naming.
Canonical domain record, 2026-10-16.

## Settled model

An account is the authenticated user; a corporation is the player entity owning
fleets, credits and knowledge. Discovery/ownership, naming entitlement and knowing
an object's identity are different concepts. Naming protection is not a combat
shield. [Sensors](sensors-and-stealth.md) owns observation/identification, not this
page's control and naming rights.

### Control and succession direction — 2026-10-19

Travis revised the earlier discovery/naming design during domain review: current
control of a celestial body grants naming authority. Initial analysis of an
untouched body establishes initial control; this does not guarantee permanent
control after the explorer leaves. Building a station around that body can
establish a later corporation's control and allow it to rename the body. Preserve
first-discovery attribution and the history of names and control changes. This
supersedes the earlier intent that exploration claims provide only display/naming
rights and that the first confirmed name is permanent. These are accepted design
directions, not implemented transfer or renaming mechanics.

Control may transfer by agreement, including purchase or another negotiated
exchange, as well as by military means. Neither the military mechanism nor
contract execution rules are settled. Bribery and subterfuge are longer-term
possibilities, not accepted mechanics.

Home stations belong to their spawning corporations; this is actual station
ownership, rather than honorary naming credit over NPC property. Station services
and starting protection require separate rules.

Control can extend across a system without infrastructure at every body.
Station ownership is distinct from system control: a corporation may allow
another corporation to build a station while retaining recognized control of
the system. Taxation is a longer-term possibility, outside the present scope.
Competing claims without agreement can leave a body or system **contested**;
multiple station owners alone need not imply a dispute.

A control dispute ends by agreement or when only one claimant retains an
established territorial foothold: competing footholds can be captured or
eliminated. Merely bringing a larger fleet through does not transfer control;
a defeated claimant retaining ships elsewhere does not keep the territory
contested indefinitely. What qualifies as a foothold and how capture works
remain unresolved. While control is contested, preserve the existing public
name and freeze renaming. A later uncontested controller may rename the place
without erasing discovery or naming history.

The reach of infrastructure-backed claims and their relationship to
individual-body control remain unresolved. No percentage-based control formula
has been accepted.

The exact meaning and scope of control, qualifying infrastructure, contested
control and station capture remain unresolved. The existing claim model does not
settle them. “Analysis” here describes the player's exploration intent; whether
the existing Survey command remains distinct from Analyze is still a question.

An account survives the end of its corporation. Voluntary **dissolution** should
let a player end a corporation and start over, including after an undesirable
spawn or becoming stranded. It must not permit two living corporations for one
account. Confirmation, effective timing, any undo period, asset disposition and
successor inheritance remain undecided. Account-level corporation history and
statistics are future possibilities outside this review's immediate scope.

## Current implementation and gaps

- [Account](../../backend/account/model.go) links Firebase identity/profile;
  [Corporation](../../backend/corporations/model.go) owns player state.
  [ResolveCorporation](../../backend/middlewares/corporation.go) resolves the
  account-linked corporation and can continue corpless. It does not currently
  filter a dead linked corporation or establish a restart flow. Old account scaffold organization/
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
  first confirmed name is permanent in current code, identical retry succeeds.
  That lock predates the revised control-based naming direction above. Names are unique
  within a system, star names also galaxy-wide; [validation](../../backend/discovery/validation.go)
  normalizes and rejects invalid/reserved/offensive forms.
- Corporation death requires zero fleets, but current gameplay has no fleet
  destruction path. Do not infer combat rules from administrative death support
  or equate `NamingProtected` with immunity to attack.

## Open questions

Define what establishes and transfers control, its scope across stars, planets,
moons and stations, and how contested control works. Implement corporation ownership of home stations consistently across station
records and discovery projections; define its services and protection separately. Determine how dissolution ends control without erasing history.
Which knowledge products can players trade? Confirm that contract separately. Active discovery/naming scratch work is implementation
tracking; durable decisions belong here once verified, not in a second rulebook.

Historical deferred intent: [backup/restore lore](../lore.md) and #0009 envision
restoration into a new corporation with mechanically fresh state, while preserving
narrative lineage. No implemented restore flow is established here. Death/restore
rules, persistence of knowledge and player-facing restart need separate scoping;
this is not permission to erase an existing corporation.

## Related sources

[World](world.md), [stations](stations.md), [ships/fleets](ships-and-fleets.md),
[sensors](sensors-and-stealth.md), [economy](economy.md), [actions](actions-and-time.md).
Historical sources: [spawn spec](../history/2026-rebuild/specs/0009-spawn.md), [spawn plan](../plans/spawn.md).
