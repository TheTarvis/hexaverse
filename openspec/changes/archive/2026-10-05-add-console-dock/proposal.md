## Why

Link 2b of `docs/plans/system-hud/chain.md` moves the right-hand command column's panels into a console dock beneath the vitals strip. Sized against the test files it is about 150 tasks against the 40-task cap (`docs/handoffs/add-console-dock-analysis.md` § 1.4), so it is split (RULING 1 of `docs/handoffs/add-console-dock-rulings.md`), and the first piece was split again at placement against lifetime (RULING 15) when its panel found the honest task count past the cap. This change is that first piece: the dock's shell and the Log tab as the sighting log's home, with the log mounted when the tab is shown, exactly as it is mounted today.

## What Changes

- ADD to `system-console` five requirements, all placement and shell, none restating another capability's rule:
  - the dock beneath the strip, collapsed on every mount of the view, opened by a "Console" control that is outside the strip, with no remembered state and no live region changed by expanding or collapsing;
  - the tab list as its own small requirement (one tab, `Log`, with no count);
  - the Log tab as the sighting log's home on this view, naming the `sighting-log` and `system-space-view` requirements that own the log's content, its reads and the report's link, with a waiting indication while the interior read's first load is in flight, and the ghost highlight rule;
  - keyboard operation of the dock: tab semantics, focus moving to the selected tab on expand and to the "Console" control on a collapse from the tab bar or the panel, and tab order;
  - one fixed height (220 CSS px at 1280x720, strip included, the strip's row 56) with nothing covering the dock or covered by it, `FloatingNav` included, the 24 px targets, and the galaxy route's nav unmoved.
- MODIFY one `system-console` requirement, *The Vitals Strip Is Present on Every Render of the System Space View*: its "across the foot" becomes false while the dock is expanded (the strip is the dock's top row). Six scenarios, none of whose text changes. No other capability takes a delta (RULING 12, under its own exception clause; RULING 16).
- Delete the floating log panel, the `sighting-log-open` toggle and the `logOpen` state. No flag, no shim.
- Raise every bottom-band floating surface (the right column's foot, the sightings-unavailable card, the camera cluster, `FloatingNav`) from one published dock height.
- Migrate the tests that open the log through the retired toggle (`SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx`, `scan-journey`, `scan-lane-transit-fizzle`) and re-read the two 1280x720 collision legs.
- Not changed: when the log reads. It is mounted when the tab is shown, behind today's interior-read gate, so no read's timing and no e2e precondition moves.

### The split

Link 2b is six changes, archived in this order. Each later row is `not authored` in the chain doc, because a verdict authored now would expire when its predecessor archives.

1. **`add-console-dock` (this change)**: the shell and the Log tab, the log mounted on show.
2. **`keep-console-tab-content-mounted`** (2b-i-b): a tab's content stays mounted and hidden while not shown (RULING 2); showing or hiding the Log tab issues no read (RULING 8); the settle re-read that makes `sighting-log`'s *The log refetches after a sweep settles* true, closing `drift-sighting-log-not-reread-after-sweep-settles.md` (RULING 9); the mount latch with its warm-cache arm; Escape collapsing the dock (RULING 6); activating the dock changing no space-view selection; a read failure surviving a collapse; the highlighted row brought into view; and the e2e migrations that depend on when the log reads. Its draft text is preserved at `docs/handoffs/keep-console-tab-content-mounted-draft-delta.md` as unreviewed input.
3. `move-scan-control-to-console-dock`: the Scan tab; tab switching and arrow-key movement between tabs become real.
4. `move-fleet-roster-to-console-dock`: the Fleets tab.
5. `move-fleet-actions-to-console-dock`: the Acting-fleet tab holding `FleetActionsPanel`, and the jump control moved out of `SpaceCommandPanel`.
6. `retire-right-command-column`: `SpaceCommandPanel`'s course half into the Acting-fleet tab as its interim home, the column deleted, flags (a) (b) (c) of link 2a-iv.

### Costs said out loud

- **Coexistence (RULING 1, RULING 15).** The right column shrinks over six changes instead of being deleted in one. After this change a dock and the column exist side by side, which the chain's ground rule ("keep the thing it replaces: no") forbids in spirit; it is unavoidable under the 40-task cap, and the second split adds one more link of it. No piece keeps what it replaced and no flag guards anything: this change deletes the floating log and its toggle outright, and the column loses its last occupant in the sixth piece.
- **No Escape key until 2b-i-b (RULING 15).** The collapse control is the way out of an expanded dock; the chain doc's "`Esc` collapses the dock" is narrower for one link. Focus on a collapse from the collapse control still returns to the "Console" control.
- **The log is mounted when its tab is shown**, as the floating log was mounted when opened, so this change loses nothing of the log's reads or content that a player has today. What a collapse does to the log's loaded pages, scroll and read state is deliberately not specified here: RULING 2 states it in 2b-i-b, before any second tab exists.
- **A scrolling column under an expanded dock (panel A4).** With the dock expanded at 720 px tall the right-hand command column is a 400 px scroller until the sixth piece deletes it, and with the dock collapsed it is 68 px shorter than today (564 px, not 632). The geometry requirement says it by visible area and by each control being reachable once scrolled into view, not as an unscrolled bounding box.
- **One tab in a tab bar.** Until `move-scan-control-to-console-dock` archives, the tab bar holds the one tab, `Log`. The chain doc's four always-present tabs are reached one piece at a time; each later piece MODIFIES the tab-list requirement and no other.
- **`Log`, not `Log · N` (RULINGs 7, 17).** The wire serves no pile total and the chain forbids a backend field. A defined, wire-backed count is a later, separately ruled addition.
- **The expanded dock covers the canvas's lowest 220 px, and marks there cannot be picked.** The camera is not reframed for it; the strip's 56 px does the same today, so this is not new in kind but is four times the extent, in the state where the log is read against the scene. No off-screen chip is drawn for a mark merely covered by the dock; collapse the dock to pick it.
- **The chip/`FloatingNav` collision.** Raised to 236 px, the floating navigation's top reaches about y 387, so from the 15th off-screen reach chip onward (about the 21st today) the chips sit under it while the dock is expanded. Link 3 deletes the chips; the gate's chain-doc task carries this to link 3's section.
- **A ghost does not open the dock (RULING 10).** The ghost shows its highlight in the scene, and the row is highlighted when the Log tab is next shown.

### Out of scope, each deliberate

- Any backend field, endpoint or query, including a pile total for a tab count.
- The galaxy view, a persistent strip across views, and any mobile layout: no layout below 1280 CSS px wide is specified, produced or tested.
- Any palette, type-scale or panel-fill change.
- A resizable dock or a drag handle (RULING 3).
- Remembering the dock's state across a reload or a navigation (RULING 5).
- Everything moved to `keep-console-tab-content-mounted` (above), including any statement of what a collapse does to the log's loaded pages, scroll or read state: this change is silent on it.
- The Scan, Fleets and Acting-fleet tabs, tab switching, arrow-key movement between tabs, and "state survives a tab switch" (RULING 13: pieces 3 to 5).
- The own-ness deny scenario, which is carried by trigger (the first change that supplies the strip, or any dock tab rendering roster-derived figures, a fleet not drawn from the own-fleets read; link 4 expected; RULING 20), flags (a) (b) (c) (RULING 13: piece 6), and `drift-strip-cells-retain-figures-after-failed-fleets-read.md` (stays filed; no strip cell is re-homed here).
- The Selected-entity tab, open-on-select, the second-press Escape rule, figures on the arc and deleting `SpaceCommandPanel` (link 4); the in-system list and the off-screen chips (link 3).
- Layout of tab content beyond reachability and non-overflow; the canvas has no artboard for the Log tab.
- `docs/handoffs/followup-explain-withheld-burn-command.md` and the filed `committedEta` defect.

## Impact

- Affected specs: `system-console` (5 ADDED, 1 MODIFIED). No delta on `sighting-log`, `system-space-view`, `docked-fleet-actions`, `fleet-roster` or `figure-formatting`; no figure is rendered by the dock.
- Affected code (expected, frontend only): a new dock shell component, `frontend/lib/console-dock-layout.ts`, and `frontend/components/space/SystemSpaceView.tsx` (dock state replaces `logOpen`, the occupants' offsets), `frontend/components/space/SpaceStage.tsx` (camera cluster offset), `frontend/components/floating-nav.tsx` (follows the dock on the system route only), `frontend/components/space/SightingLog.tsx` (outer chrome only).
- Test files: new `ConsoleDock.test.tsx`, `SystemSpaceView.console-dock.test.tsx`, `frontend/lib/console-dock-layout.test.ts` and `frontend/components/floating-nav.dock.test.tsx`; migrations of `SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx` and the header of `SightingLog.test.tsx`; e2e migrations of `scan-journey.spec.ts` and `scan-lane-transit-fizzle.spec.ts`, a re-read of the collision legs in `vitals-strip-journey.spec.ts` and `burn-cost-overlay-journey.spec.ts`, and a new `frontend/e2e/tests/console-dock-journey.spec.ts` written at the gate.
- Explicitly: **no backend, no wire change**, no new read.
- Rulings bound: RULINGs 1-21 of `docs/handoffs/add-console-dock-rulings.md` (index beside it); the post-panel routing is `docs/handoffs/add-console-dock-panel-dispositions.md`.
