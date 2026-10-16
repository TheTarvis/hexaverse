# Design sources

Updated 2026-10-16. Start here to find a concept, its authority or an unresolved decision.

| Need | Source |
| --- | --- |
| Settled vocabulary | [GLOSSARY.md](../GLOSSARY.md) |
| Implemented behavior | Code and tests; [architecture](game-architecture.md) provides navigation and historical milestones |
| Sensing, signatures, parking and combat intent | [Stealth and combat](stealth-combat.md) |
| Production HUD goals and acceptance | [HUD](hud.md) |
| Authenticated remote phone testing proposal | [Phone preview](phone-preview.md) |
| Object style and revision tracking | [Art direction](art-direction.md) |
| Ephemeral work progress, evidence and blockers | [Project checklist](../.scratch/weekend-visual-batch/status.md) |
| Ephemeral visual implementation brief | [Batch brief](../.scratch/weekend-visual-batch/brief.md) |
| Checks and environment constraints | [Testing tiers](testing-tiers.md) |

## Recording decisions

Keep settled term meanings in the glossary. Put behavior, rationale and unanswered
questions in the relevant concept document. Label each **Confirmed intent**,
**Proposed**, **Open**, or **Current implementation**, with date and source when
recording new decisions. Confirmed intent can still require implementation; code
precedent is not acceptance of a proposed mechanic. Move resolved questions into
confirmed intent rather than retaining conflicting answers.

Create an ADR only for a consequential, hard-to-reverse trade-off; see
[domain documentation guidance](agents/domain.md). Workers read the relevant
concept record and glossary, then check code/tests for the actual starting point.
The checklist owns progress and blockers, not gameplay definitions. Travis confirmed
on 2026-10-16 that scratch is ephemeral work in progress and never authoritative
for game rules. Preserve accepted decisions in canonical documents before pruning;
prune a scratch work area only after its implementation is finished and referenced
assets/evidence are preserved. The [migration map](documentation-migration.md)
proposes domain homes and a staged cleanup; its structure awaits review.

[Vision](vision.md), [lore](lore.md), [specs](specs/README.md) and
[plans](plans/README.md) retain history. Check their implementation claims against
current code. The concept records identify later confirmed direction without
activating every historical idea as work.
