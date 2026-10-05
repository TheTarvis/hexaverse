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

## Evidence narrowed — 2026-10-05 (`keep-console-tab-content-mounted`, FULL-AUTO RULING 7)

The "Code" paragraph above overstates the reach. A menu with entries focuses
its first entry whenever it opens, by pointer or keyboard
(`VitalsStripFleetCell.tsx:76-78`), so it takes Escape in the ordinary case.
The unfocused state is real in two cases only: (i) an EMPTY menu (a failed
own-fleets read, or no other fleet, `:74`) opened by pointer in a browser that
does not focus a clicked button (Safari, Firefox on macOS); (ii) focus that
left an open menu (Tab out of it, or a press elsewhere — there is no blur or
outside dismiss).

`keep-console-tab-content-mounted` did not fix this and its requirement
*Escape Collapses the Expanded Dock* states nothing about that state. What
happens there, by mechanism: with the dock expanded, Escape collapses the dock
and the menu stays open. Recovery: a pointer press on the chevron toggles the
menu, or Shift+Tab back to the chevron and Escape closes it.

**Status.** Still OPEN; adjudication (code vs spec) still open.
