# drift — the fleet cell's menu does not close on Escape when focus has left it

Filed 2026-10-05 by the `add-console-dock` orchestrator from the architect's
panel finding A5 (`docs/handoffs/add-console-dock-panel-architect.md`, § A5 — the
evidence of record; code reading, not observed on a stack).

**Spec.** `openspec/specs/system-console/spec.md`, *The Fleet Cell's Chevron and
Menu Are Keyboard-Operable*, scenario "Escape closes the menu without choosing".

**Code.** `frontend/components/space/VitalsStripFleetCell.tsx:91-114` handles
Escape only in `onKeyDown` of the chevron and of a menu entry. A menu opened by
pointer in a browser that does not focus a clicked button, or left open while
focus moves away, never sees the key.

**Whose call.** Predates `add-console-dock`; not fixed there. It bears on link
2b-i-b `keep-console-tab-content-mounted`, which adds the dock's own Escape and
must word its menu clause to what the menu actually takes (A5's paste-ready
text). Adjudication (code vs spec) is open.

**Status.** OPEN.
