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

## Where to write

| Content | Home |
| --- | --- |
| Shared game vocabulary | Root `GLOSSARY.md`: concise definitions, grouped by topic |
| Gameplay rules, settled intent, implementation gaps and open questions | Existing owner in `docs/domains/` |
| Shared interaction and visual direction | `docs/hud.md` and `docs/art-direction.md` |
| Reusable agent playbooks and workflow configuration | `docs/agents/` |
| Local specs, tickets, wayfinding maps, research, prototypes, design rounds, prompts and review evidence | `.scratch/<effort>/`; follow [tracker conventions](agents/issue-tracker.md) |
| Consequential decisions with a real trade-off that are costly to reverse | `docs/adr/`, created when the first qualifying decision is recorded |
| Retained historical records | `docs/history/`; numbered specs are archived under `docs/history/2026-rebuild/specs/`; `docs/plans/` records are historical |

Hexaverse uses one shared game vocabulary. Combat, economy and stations are
related gameplay domains, not separate language contexts. Keep one root glossary;
use `GLOSSARY-MAP.md` only if separate contexts with their own vocabularies emerge.
A glossary defines what a term means; the linked domain page explains the rules.

Before creating a durable document, update its existing owner when one exists.
Promote accepted decisions from scratch into that owner and link supporting
evidence. Reusable instructions belong in agents; each execution's artifacts
belong in scratch. New specs and plans use the local tracker, rather than adding
to the historical numbered-spec series or starting another gameplay authority.

## Authority and upkeep

Each domain separates **settled intent**, **current implementation/gaps** and
**open questions/proposals**, with dated provenance. Accepted intent can remain
unimplemented; historical “accepted” or “implemented” labels are not fresh evidence.
Record each rule in its owner and link related domains rather than copying it.
Update a resolved question where it lives; keep glossary definitions concise.
Use [ADRs](agents/domain.md) sparingly for consequential, hard-to-reverse trade-offs.

[Archived rebuild records](history/2026-rebuild/README.md),
[specs](history/2026-rebuild/specs/README.md) and [plans](plans/README.md) preserve history;
older hex/ring mechanics, retired workflow commands and unchecked milestones do
not become current requirements. [Defects](defects/) retain evidence; marketing
and agent operational guidance keep their own roles. Imported skills remain unchanged.

Scratch is ephemeral work in progress. Track each effort in its own directory;
[tracker conventions](agents/issue-tracker.md) define specs, tickets and maps.
Preserve accepted decisions in canonical owners and preserve referenced evidence
before pruning completed work. Existing scratch evidence remains available until
its references have been deliberately preserved or replaced.
