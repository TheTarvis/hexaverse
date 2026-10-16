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
| Current work, evidence and blockers | [Project checklist](../.scratch/weekend-visual-batch/status.md) |
| Current visual scope and working decisions | [Batch brief](../.scratch/weekend-visual-batch/brief.md) |
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
The checklist owns progress and blockers, not gameplay definitions.

[Vision](vision.md), [lore](lore.md), [specs](specs/README.md) and
[plans](plans/README.md) retain history. Check their implementation claims against
current code. The concept records identify later confirmed direction without
activating every historical idea as work.
