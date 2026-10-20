# Feature design and review playbook

Accepted process, 2026-10-19. Use for a new feature or a focused improvement to
an existing interaction. Work through one player task at a time, with concrete
comparisons and recorded feedback. Travel controls are the first exercise.

## 1. Resume from evidence

Read the canonical domain/HUD guidance, existing implementation and the effort's
previous design record. Treat old spec status labels as historical evidence;
identify which decisions still apply and which behavior already ships. Report
differences before proposing replacement work.

### Foundation check — required

Before creating concepts, Storybook examples or implementation, inspect the
existing shared foundations and their current stories. Repeat this check when
the feature's scope introduces another kind of surface or control. Record in
the effort's brief which existing components, tokens and assets will cover each
part of the feature, and identify any capability they genuinely lack.

For HUD work, read [shared HUD foundations](../hud.md#shared-hud-foundations),
then inspect the applicable components and `HUD/Typography/Shared Foundations`:

- `HudCardShell`, `HudTypography` and `HudFacts` for framing and content.
- `HudIcon`, `HudObjectThumbnail` and existing assets for utility/object visuals.
- `HudControls` for the single button/link interface, icon helpers, search inputs
  and selects over Catalyst. Use its shared presentations for rows, chrome and
  map targets; [action ownership](../hud.md#shared-action-interface-and-ownership)
  defines the styles agents may adjust centrally.
- `frontend/components/hud/hud-tokens.css` for shared visual defaults.

Build prototypes and production features from those same foundations. Feature
CSS owns arrangement; shared defaults stay with their existing owner. When a
capability is missing, describe the gap and extend the appropriate shared
foundation instead of creating a feature-local replacement. Consult the relevant
specialist playbook for other surfaces, such as graphics or audio.

This check is complete when the brief maps the feature to reusable foundations
and accounts for every proposed new primitive or override.

Record a short brief under `.scratch/<effort>/`: player task, current problem,
scope, accepted constraints, open decisions and next review. Link to existing
owners rather than copying their rules. This stage ends when Travis confirms
the task and boundaries.

## 2. Compare directions

Ask the decisions needed for the next comparison, with recommendations. Look
up implementation facts yourself. Carry accepted answers forward between rounds.

Present clearly labeled alternatives using the same sample situation. Recommend
a direction and explain the meaningful differences. Use images for appearance,
playable examples for audio, and interactive Storybook examples when behavior
matters. Existing shell, typography and accepted assets provide the context.
This stage ends with a selected direction or concrete feedback for another round.

## 3. Refine and try the interaction

Record feedback as Keep / Change / Remove / Compare next. Preserve earlier
rounds and make the next comparison address the unresolved choice. Return to
broader alternatives when the basic approach misses the task.

For controls, provide a reproducible Storybook journey with realistic content,
desktop and portrait-phone layouts, and relevant ready, pending, blocked,
failure and success states. Clearly identify simulated outcomes. Exercise the
whole player task, including Back, dismissal and returning to ongoing work.
This stage ends when Travis accepts the reviewed design and interaction.

## 4. Integrate the accepted direction

Identify the production changes needed to deliver the accepted interaction,
reusing current services and domain behavior. Surface any new gameplay decision
before implementing it. Continue within existing authorization; identify any
additional scope or permission needed for the concrete next action.

Verify the implementation uses the brief's shared foundations; remove temporary
copies and local default-style overrides introduced during exploration.

Run checks appropriate to the changes and review actual desktop and phone-width
rendering. Record what was verified, what remains simulated, and device limits.
This stage ends with the integrated feature ready for in-game review.

## 5. Review in-game and preserve decisions

Compare the integrated result with the accepted direction in its real context.
Track design acceptance, implementation, verification and in-game acceptance
separately. Checks establish behavior; Travis's review establishes acceptance
of the experience. Keep unresolved refinements visible.

Save each round's references, comparison, feedback and next action in the effort
directory. Keep Storybook focused on the selected example and the active
comparison. Once a direction is selected, retire its discarded exploration
stories and unused branches; preserve prior rounds as saved review evidence.
Reusable component/state coverage retains its own role. Promote accepted
interaction rules into `docs/hud.md` and gameplay rules into their existing
domain owner. Record resolved vocabulary in
`GLOSSARY.md`; use ADRs only under the criteria in [domain guidance](domain.md).

For specialist work, use the [object-art](object-art-playbook.md) or
[audio](audio-playbook.md) playbook for production and review details. Their
specific accepted constraints remain applicable.

## Start or resume

```text
Follow docs/agents/feature-playbook.md for <player task>.
Save this effort under .scratch/<effort>/.
Read its existing design record and resume at the first unresolved stage.
Complete the foundation check before creating or changing the feature.
Preserve accepted choices, compare concrete alternatives, and record feedback.
```
