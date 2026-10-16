# Hexaverse documentation

Start with a domain below. These pages preserve settled intent and identify gaps;
code/tests define current behavior. Updated 2026-10-16 after Travis approved the
domain documentation structure. Documentation does not authorize unscoped gameplay work.

## Game domains

- [Stations](domains/stations.md) — venues, services and ownership.
- [Travel](domains/travel.md) — burns, parking, attachment and lane jumps.
- [Sensors and stealth](domains/sensors-and-stealth.md) — discovery, signatures,
  resolution/identity and historical knowledge.
- [Combat](domains/combat.md) — accepted weapon direction and unresolved engagements.
- [Ships and fleets](domains/ships-and-fleets.md) — hull roles, grouping and command units.
- [World](domains/world.md) — galaxy/system generation, features and orbits.
- [Economy](domains/economy.md) — mining, cargo, fuel, credits and trade.
- [Discovery and identity](domains/discovery-and-identity.md) — accounts/corporations,
  spawn/home, claims and naming.
- [Actions and time](domains/actions-and-time.md) — channels, ETA and resolution.

## Shared references

[Glossary](../GLOSSARY.md) defines terms; domain pages own behavior and open questions.
[HUD](hud.md) owns interaction/layout, [art direction](art-direction.md) owns style,
[vision](vision.md) and [lore](lore.md) preserve the broader setting.
[Architecture](game-architecture.md) helps locate code but includes historical milestones.
[Testing](testing-tiers.md) describes verification; [phone preview](phone-preview.md)
is a separately permission-dependent access proposal. [Migration map](documentation-migration.md)
records source coverage and retained historical paths.

## Authority and upkeep

Each domain separates **settled intent**, **current implementation/gaps** and
**open questions/proposals**, with dated provenance. Accepted intent can remain
unimplemented; historical “accepted” or “implemented” labels are not fresh evidence.
Record each rule in its owner and link related domains rather than copying it.
Update a resolved question where it lives; keep glossary definitions concise.
Use [ADRs](agents/domain.md) sparingly for consequential, hard-to-reverse trade-offs.

[Specs](specs/README.md) and [plans](plans/README.md) remain historical sources;
older hex/ring mechanics, retired workflow commands and unchecked milestones do
not become current requirements. [Defects](defects/) retain evidence; marketing
and agent operational guidance keep their own roles. Imported skills remain unchanged.

Scratch is ephemeral work in progress, never authoritative game rules. Its
[project checklist](../.scratch/weekend-visual-batch/status.md) tracks current work,
checks and blockers. Preserve accepted decisions in these canonical records and
preserve referenced assets/evidence before pruning a scratch area; prune only
once its implementation is finished. No scratch cleanup is part of this migration.
