# follow-up — the highlighted log row is not brought into view in the dock's panel

Filed 2026-10-05 by the `keep-console-tab-content-mounted` orchestrator
(FULL-AUTO RULING 13 of `keep-console-tab-content-mounted-rulings.md`): shed
from that change at the 40-task cap.

**What.** The dock's panel area shows roughly one to two log rows at the
1280×720 floor. Activating a ghost highlights its row, which may lie beyond the
visible part of the panel; nothing scrolls it into view.

**Text of record.** Predecessor UX finding U4
(`docs/handoffs/add-console-dock-panel-ux.md`, lines 77-95) — the scenario
"The highlighted row is brought into view in the panel" — and
`openspec/changes/archive/2026-10-05-add-console-dock/design.md` D-20 (a
`shown` prop on `SightingLog` and a scroll on `[shown, highlightedGhostId]`).
Copied in `docs/handoffs/keep-console-tab-content-mounted-draft-delta.md`,
§ U4.

**Size.** One scenario, one test arrangement group, one build task; the only
reason to edit `SightingLog.tsx`.

**Whose call.** 2b-ii's author should read this (it adds the second tab and
"state survives a switch"); otherwise a small standalone change.

**Status.** OPEN.
