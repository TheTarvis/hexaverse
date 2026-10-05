# add-console-dock (system-HUD link 2b) — design analysis

Analyst, 2026-10-04 run, tree and `openspec/specs/` at `d777cfd`, `openspec list`
empty. Read-only on the tree; no stack booted, no suite run, no fixture
regenerated. Inputs read whole: `docs/plans/system-hud/chain.md`,
`docs/plans/system-hud.md`, the canvas at `docs/handoffs/add-console-dock-canvas/`
(`Main`, `Collapsed`, `Console`; `canvas.json`), the live specs named in the
brief, `SystemSpaceView.tsx`, `SpaceCommandPanel.tsx`, `ScanControl.tsx`,
`SightingLog.tsx`, and by structure `FleetActionsPanel.tsx`, `FleetRoster.tsx`,
`VitalsStrip*.tsx`, `SpaceStage.tsx`, every `*.test.tsx` that mounts them, every
spec under `frontend/e2e/tests/` and both e2e helpers.

Everything below marked INFERRED is mine, not the documents'. Counts of tests
are `grep` counts of `it(`/`test(` at HEAD; they were not obtained by running
anything.

---

## 0. Verdict in one screen

- **The link is five changes, not one.** Honest size of the whole: **about 150
  tasks** (range 140–165) in the predecessors' unit (one task per test
  arrangement group, plus build and gate tasks). The chain doc's row would have
  been authored at roughly four times the cap.
- **The dock shell is most of the first piece.** Tab bar, collapse, Esc,
  default-collapsed, mounted-and-hidden, focus, fixed height and the collisions
  of a 220 px dock are about 30 tasks before any tab's content. The shell plus
  exactly one tab fits the cap; the shell plus two does not.
- **Recommended first piece: the shell plus the Log tab**, keeping the id
  `add-console-dock`. It is the one tab whose old home (a toggled floating
  panel) is already an on-demand surface, so nothing that is always visible
  today becomes hidden by default, no requirement is shipped false, and none of
  the 2a-iv flags or the `useOrder` warning is triggered.
- **Mounted-and-hidden makes the vitest migration small and the e2e migration
  the real cost.** `getByTestId` and `fireEvent` ignore `hidden`; Playwright's
  `click`, `toBeVisible`, `selectOption` and `scrollIntoViewIfNeeded` do not.
  One vitest assertion goes *vacuous* rather than red under `hidden`
  (§ 4, row P9) — the dangerous direction.
- **The chain doc's "a 'mounted in the console' clause on each requirement" is
  the archiver trap times twenty-three.** No `docked-fleet-actions` or
  `sighting-log` requirement names a placement that changes. By RULING 8 of
  2a-iv, placement is stated once, in ADDED `system-console` requirements that
  name the owners. The whole link needs **at most seven MODIFIED blocks**, and
  the first piece needs **none**.
- **Three things found by reading that nobody has filed** (§ 7): the open
  sighting log is never re-read after a sweep settles (masked today only
  because opening the log is a mount; the mask is removed by this link); a
  command failure that lands while its tab is hidden is announced to nobody; a
  read failure's retry card would be hidden by default.
- **Two hard-stop candidates, neither in the first piece** (§ 10): what a player
  gets for a selected target while the dock is collapsed and Burn lives in a
  hidden tab; and what carries the quote's affordability while the dock is
  collapsed. One mild candidate in the first piece: what `N` means in
  `Log · N` when the wire serves no total.

---

## 1. Sizing against the test files

### 1.1 What `hidden` does to each kind of test (the rule the counts rest on)

| Tool call | Element inside a `hidden` tab | Consequence |
| --- | --- | --- |
| RTL `getByTestId` / `queryByTestId` / `getByText` | found | view-level vitest keeps passing with no edit |
| RTL `fireEvent.*`, `userEvent.click` | dispatched (userEvent checks `pointer-events`, not `hidden`) | same |
| RTL `getByRole` / `queryByRole` (default `hidden: false`) | **not found** | a presence assertion goes red; an **absence assertion passes vacuously** |
| jest-dom `toBeVisible` | false | none used in the view-level files (grep: 0) |
| Playwright `toContainText`, `toHaveCount`, `toHaveAttribute`, `getAttribute` | work | the roster-row state oracle (`/under way/`, `/docked/`, `/in transit/`, `toHaveCount(1)`, `data-active`) survives |
| Playwright `click`, `toBeVisible`, `selectOption`, `scrollIntoViewIfNeeded`, `focus` + key | **fail or time out** | every spec that drives a moved surface needs the dock open on the right tab first |

So: "inheriting a testid preserves the selector, not the precondition" (2a
Taught) lands almost entirely on tier 4, and on one tier-1 line.

### 1.2 Per surface — tests and specs whose arrangement, selector or precondition changes

`V` = vitest tests in files that mount or select into the surface (total / that
must change). `E` = Playwright specs that drive it. Tests rendered standalone
against the component keep passing; they change only where the component's own
chrome changes.

| Surface | Component-level vitest (standalone) | View-level vitest (mount `SystemSpaceView`) | e2e specs that drive it | What actually changes |
| --- | --- | --- | --- | --- |
| **Dock shell** (tab bar, collapse, Esc, default-collapsed, mounted-and-hidden, height, collisions) | none exists — all new | none exists — all new; `SpaceStage.interaction.test.tsx` (36) and `.renderer.test.tsx` (23) select `space-camera-controls` by testid, class not asserted; `floating-nav.test.tsx` (3) asserts no class | `vitals-strip-journey` and `burn-cost-overlay-journey` each carry a 1280×720 collision leg that names `space-fleet-panel`, `preview-panel`, `space-camera-controls`, `floating-nav` | ~12 new arrangement groups at the shell component, ~5 at the view; the two geometry legs re-read each time a named surface moves |
| **Log tab** (+ floating panel and toggle retire) | `SightingLog.test.tsx` 16 / 0–1 (header comment pins `sighting-log-open`); `SightingLog.drawn-record-membership.test.tsx` 5 / 0 | `…sighting-log-no-ghost-reasons.test.tsx` 4 / **4** (one helper clicks `sighting-log-open`); `…sighting-log-mount-ordering.test.tsx` 1 / 1 (re-read: it counts *any* `useSightings` call, so today it observes the ghost feed, not the log) | `scan-journey` (4 tests; 6 uses of the toggle, incl. toggle-closes and reload-shows-toggle legs), `scan-lane-transit-fizzle` (1 use) | selector `sighting-log-open` deleted; precondition "log visible ⇒ just mounted ⇒ freshly read" deleted (§ 7 D1) |
| **Scan tab** | `ScanControl.test.tsx` 21 / 0; `ScanControl.inbox-failures-and-affordances.test.tsx` 5 / 0–1 (the live region); `use-scan-double-submit.test.tsx` 4 / 0 | `…scan-targets-refetch-on-arrival.test.tsx` 11 / **1 vacuous** (line 875, `within(scan-control).queryByRole('button', {name:/cancel/})…not.toBeInTheDocument()`); `…scan-refetch.test.tsx` 3 / 0; `…scan-settle-announcement.test.tsx` 1 / 0 | `scan-journey` (37 scan selectors, 24 `toBeVisible`), `scan-lane-transit-fizzle` (12), `helpers/scan-fixtures.ts` (3 functions; `scrollIntoViewIfNeeded` at :253, `selectOption` + `click` at :305–306); one reference each in `space-journey`, `vitals-strip-journey`, `burn-cost-overlay-journey` | precondition on every scan click; `onOpenLog` becomes a tab switch |
| **Fleets tab** | `FleetRoster.test.tsx` 23 / 0–2 (only if the roster's own header/toggle is suppressed in the tab) | `SystemSpaceView.test.tsx` cross-navigation describe (3) / 0; `…render-loop.test.tsx` 6 / 0; `…stranding-notice.test.tsx` 24 row references / 0 | `toBeVisible` on the roster or a row: `renderer-availability:232`, `world-time-render-loop-journey:148`, `space-journey:264`, `new-user:99`; row `click`: `scan-lane-transit-fizzle:278`. The other eleven specs read the row as a text oracle and survive | 5 specs' preconditions; `helpers/space-view.ts:219` (`toHaveCount`) survives |
| **Acting-fleet tab — `FleetActionsPanel`** | `FleetActionsPanel.test.tsx` 46 / 0 (chrome only); +1 group if jump arrives | `SystemSpaceView.test.tsx` 52 tests, 36 action selectors, 11 error-card selectors, all by testid / 0 forced | `refuel-commit` (15), `slice` (21), `space-double-submit` (22; 5 tests), `space-journey` (17), `burn-preview-journey` (16 — the mine leg), `vitals-strip-journey` (6), `burn-cost-overlay-journey` (4), `jump-commit`, `burn-geometry-refusals`, `commit-stranding-notice`, `committed-selection` (1 each) | precondition on every verb click in 11 specs |
| **Jump leaving `SpaceCommandPanel`** | `SpaceCommandPanel.test.tsx` jump describe 4 / **4 move**; `FleetActionsPanel.test.tsx:338` (mine gate names jump) / 1 | `SystemSpaceView.test.tsx` "gate-targeted burn ends in a jumpable attachment" (2) / 0 (testid `fleet-cmd-jump-<id>` kept) | `jump-commit`, `slice`, `space-journey`, `space-double-submit` (2) — testid stable | 4 tests change file and harness; 2 MODIFIED blocks |
| **Course half's interim home** | `SpaceCommandPanel.test.tsx` 43 / 0 beyond jump | `…burn-preview.test.tsx` 29 tests / 49 selectors; `…stranding-notice.test.tsx` 41 / 83; `…scan-targets-refetch-on-arrival` 20 selectors — all by testid / 0 forced, **but every one of them now asserts on a hidden subtree unless its arrangement opens the dock** | every burn spec, through two helpers: `expectSelectionLanded` (`[data-testid$="-facts"]` `toBeVisible`, `helpers/space-view.ts:436`) and `burnToSelectionAndDock` (`preview-panel` `toBeVisible` + `burn-button` click, `:455–456`); directly: `committed-selection` (48 selectors, incl. the keyboard-focus leg), `burn-preview-journey` (21), `space-journey` (15), `commit-stranding-notice` (13), `burn-cost-overlay` (11), `space-double-submit` (7), `scan-journey` (6), `vitals-strip-journey` (5), `new-user` (2); `gate-facts` `toBeVisible` in 4 | precondition in 12 of 18 specs |

Sixteen of the eighteen e2e specs drive a surface this link moves; only
`smoke` and `endless-frontier` do not.

### 1.3 MODIFIED blocks — live requirement and scenario counts

Only requirements whose text names something that ceases to be true. Every
other requirement the chain doc lists takes **no delta** (§ 6, claims C3, C5).

| Capability | Live header (character-for-character) | Live scenarios | Why it changes | Piece |
| --- | --- | --- | --- | --- |
| `system-space-view` | `### Requirement: The Scan Surface Remains Usable While the Canvas Is Unavailable` | 4 | "SHALL therefore remain invokable through the `docked-fleet-actions` fleet panel" — already loose, plainly false once scan and fleet verbs are different tabs | Scan |
| `system-space-view` | `### Requirement: A Settled Sweep and the Scan Controls Are Reachable and Announced` | 2 | scenario "tabs through the fleet panel … the sighting-log affordance" | Scan |
| `docked-fleet-actions` | `### Requirement: Running Mine Gates the Fleet Panel's Commands` | 2 | names "`system-space-view`'s command panel (burn and jump) and this capability's own fleet panel (cut drive and stop)" — only if jump moves | Fleet actions |
| `system-space-view` | `### Requirement: Fleet Roster Cross-Navigation` | 3 | "the burn and jump commands on this capability's command panel" — only if jump moves | Fleet actions |
| `system-space-view` | `### Requirement: A Burn Order Committed From This View Withholds Its Quote and the Burn Command for That Selection While It Is the Fleet's Running Burn, as Last Read` | 21 | "the command column's order" twice (body, and scenario *Keyboard focus survives the burn command becoming unavailable*) — the column is deleted. Rulable as no-delta: the parenthetical defines the order without the column (§ 10 Q20) | Column retirement |
| `system-space-view` | `### Requirement: System Space View Route and Data Fan-In` | 15 | "an error state in the fleet panel region" + scenario *A failed own-fleets read shows a retriable error in the fleet panel* — only if the error cards are ruled out of the hidden tab (§ 10 Q15) | Column retirement |
| `fleet-roster` | `### Requirement: Collapsible Panel` | 1 | only if the roster's own collapse toggle is withheld inside the tab (§ 10 Q17) | Fleets |

Ruled no-delta candidates worth naming because a reviewer will ask:
`system-console` *The Vitals Strip Is Present on Every Render of the System
Space View* (6) says "across the foot … the bottom-most always-visible band of
the view's console region" — still literally true when the strip is the
expanded dock's top row; `system-space-view` *Renderer Unavailability Is an
Explicit State* (12) says the roster and the fleet panel "remain mounted and
usable/interactive" — true mounted-and-hidden if the dock itself stays operable
without the canvas, which an ADDED dock scenario asserts.

### 1.4 Task estimate

Unit: one task per test arrangement group (RULINGs 11–13 of
`surface-commit-stranding-warning`), one per e2e spec re-arranged, plus build,
journey and gate tasks. Each number is before the panel; every predecessor grew
10–25 % under review.

| Piece | New arrangement groups | Migrated vitest | e2e specs re-arranged | Build | Journey + gate | **Total** |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Shell + Log tab | 17 (12 shell, 5 view) | 3 | 2 (+1 geometry re-read) | 7 | 5 | **35** (41 with every shell rule; see sheds in § 2.4) |
| 2. Scan tab | 8 | 2 | 4 | 4 | 5 | **23–28** |
| 3. Fleets tab | 8 | 1–2 | 5 | 4 | 5 | **24–28** |
| 4. Fleet actions tab + jump | 10 + 3 (jump) | 5 (4 jump tests move) | 8 | 6 | 5 | **33–37** |
| 5. Course half into the tab, column deleted, quote carrier | 10 | 3 | 6–8 | 5 | 5 | **29–33** |
| **Whole link** | | | | | | **≈ 150 (144–167)** |

Per surface, as the brief asks it: dock shell ≈ 30; Log ≈ 8–11; Scan ≈ 23–28;
Fleets ≈ 24–28; Acting-fleet verbs ≈ 28–30; jump ≈ 5–7 inside that piece (12–14
if shipped alone); course half + column deletion + flags (a)(b)(c) ≈ 29–33.

---

## 2. Seams

### 2.1 What forces the shape

1. **The shell cannot ship empty and cannot carry two tabs under the cap.**
2. **Nothing in the documents says what a player sees for a selected target
   while the dock is collapsed and the course half sits in a hidden tab** (§ 10
   Q13). That question, flags (a) and (b), the `useOrder` warning, the
   `command column's order` clause and the hidden live regions all attach to
   the two command surfaces. They must not be in the first piece: an unruled
   product call would stop the run.
3. **The column is deleted by the last piece, not the first.** Any split under
   the cap leaves a shrinking column for the pieces in between. That is a
   coexistence period the chain's ground rule forbids in spirit; it is
   unavoidable under the 40-task cap and should be said out loud in each
   proposal. No piece keeps what it replaced and no flag guards anything.
4. **Jump is not a dock change.** Both halves of `SpaceCommandPanel` land in the
   same tab, so "the jump control out of `SpaceCommandPanel`" is a
   panel-to-panel refactor that link 4 needs (it deletes the panel). It can
   ride with the fleet-actions piece or be cut loose.

### 2.2 Candidate first pieces compared

| Candidate first piece | Right column afterwards | Always-visible surface becomes hidden by default? | Requirement shipped false in the interim? | Unruled product call inside it? |
| --- | --- | --- | --- | --- |
| **Shell + Log** (recommended) | fleets-error card, `SpaceCommandPanel`, `FleetActionsPanel`, `ScanControl`, station and board error cards, `FleetRoster`. The log toggle button, the floating panel and `logOpen` are gone | No — the log is toggled today | None found. `sighting-log` *The Log Is Reachable…* is satisfied by a tab as written; *The Log Reads on Mount…* is satisfied **only if** D1 (§ 7) is fixed in the same change | `Log · N` (§ 10 Q1) — mild; "omit N" is a safe ruling |
| Shell + Fleets | everything but the roster | Yes — the roster | *Renderer Unavailability…* "mounted and interactive" needs a ruling; `fleet-roster` *Empty When There Is Nothing to Manage* against "tabs that always exist" | zero-fleet tab, roster's own header (Q17) |
| Shell + Scan | everything but `ScanControl`; the log toggle and floating panel remain as an orphan pair beside a dock | Yes — the scan control | the two scan requirements in § 1.3 (MODIFIED in-piece); a hidden assertive live region (D2) | none, but the floating log beside a dock is the "legacy layout" the chain forbids |
| Shell + Acting fleet (the table row's order) | `ScanControl`, log toggle, roster | Yes — every verb, and Burn | flag (a): *The Cost Overlay Is Drawn Only…* or the affordability-text clause; D2; D3; the committed-selection focus clause | **Q13 and Q14 — both hard-stop candidates** |

**Shell + Log must go first** because (a) every other tab needs the shell, (b)
it is the only candidate with no hidden-by-default regression and no unruled
product call, and (c) it forces every shell decision (affordance, default,
Esc, focus, height, the five bottom-band occupants) on the smallest content.

### 2.3 The recommended split

All five ids are verb-led kebab-case and absent from
`openspec/changes/archive/` (38 entries checked).

| # | Change-id | Delivers | Deletes | Column afterwards | Journey (one) | Est. |
| --- | --- | --- | --- | --- | --- | --- |
| 2b-i | `add-console-dock` | The dock shell beneath the strip (expand affordance, tab bar, collapse control, Esc, default collapsed, mounted-and-hidden, fixed 220 px, bottom-band occupants re-anchored) and the **Log** tab | the floating log panel (`SystemSpaceView.tsx:910–922`), the `sighting-log-open` toggle (`:996–1003`), `logOpen` state | six occupants (above) | open the dock from the chip, read the log, collapse by Esc, re-expand and find the loaded pages and the highlighted row intact; commit a sweep from the column, let it settle, follow the report's link into the Log tab and see the new record without a refresh | 35 |
| 2b-ii | `move-scan-control-to-console-dock` | The **Scan** tab; tab switching becomes real (two tabs); the report's link is a tab switch; a failure landing while hidden is still announced | `ScanControl`'s column mount | fleets-error, `SpaceCommandPanel`, `FleetActionsPanel`, station/board cards, roster | the chain doc's own: commit a sweep, switch to Log while it runs, switch back and cancel, the log's row count unchanged by the tab dance | 23–28 |
| 2b-iii | `move-fleet-roster-to-console-dock` | The **Fleets · N** tab, `commandOwner="view"` | the roster's column mount | fleets-error, `SpaceCommandPanel`, `FleetActionsPanel`, station/board cards | switch the acting fleet from the tab; select a fleet in another system and land there with the dock collapsed again; with the canvas forced unavailable, open the dock and the roster is operable | 24–28 |
| 2b-iv | `move-fleet-actions-to-console-dock` | The **Acting fleet** tab holding `FleetActionsPanel`; jump moved into it from `SpaceCommandPanel`; station and board failure cards placed per ruling | `FleetActionsPanel`'s column mount; the jump control and `useJump`/`jumpGuard` in `SpaceCommandPanel` | fleets-error, `SpaceCommandPanel` (course half only) | dock at the station, open the tab, refuel; commit a sell, collapse before the response, re-expand and find the result; burn to a gate and jump from the tab | 33–37 |
| 2b-v | `retire-right-command-column` | `SpaceCommandPanel`'s course half mounted in the Acting-fleet tab (its interim home until link 4); the own-fleets failure card placed per ruling; the column `div` deleted; flags (a) (b) (c) and the own-ness deny scenario | the column (`:932–1063`) | **nothing — the column is gone** | select a target with the dock collapsed and read what the ruling says a player gets; open the tab, commit from the keyboard, press Esc before the response, and find the committed state, the toast and (if warned) the notice | 29–33 |

Order constraints: i first. ii and iii are independent of each other (ii
second because it makes the lean's reason — a stateful tab surviving a switch —
real on the smallest verb surface, and because Log and Scan are one feature).
iv before v (the tab must exist before the course half takes it as an interim
home; v deletes the column so it is last).

If iv passes the cap under review, its pre-identified seam is the jump:
`move-jump-command-to-fleet-panel` (12–14 tasks, under the floor, and
shippable at any point after 2b-i because it touches no dock code).

### 2.4 Sheds that keep the first piece under the cap, each landing in a named later piece

| Shed | Why it is honest | Lands in |
| --- | --- | --- |
| Arrow-key movement between tabs | vacuous with one tab | 2b-ii |
| "State survives a tab *switch*" scenarios | one tab cannot be switched; "survives collapse and re-expand" lands now | 2b-ii |
| The own-ness deny scenario and flag (c) | its premise ("mounts the strip against an arbitrary selected entity") is false for every 2b piece (§ 6 C14); it is a strip-component assertion with no dependence on a tab | 2b-v (or link 4, where the premise becomes true) |
| `drift-strip-cells-retain-figures-after-failed-fleets-read` | RULING 11 of 2a-iv: Travis's to schedule; 2b does not re-home the cells (§ 6 C22) | not in 2b; restated in 2b-v's proposal because Q15 makes it worse |

### 2.5 What each later piece must deliver and inherit

- **2b-ii inherits** the shell's tab-enumeration requirement (MODIFY that small
  block only — keep the tab list in its own requirement in 2b-i so each later
  piece carries three scenarios, not thirty); the `hidden` mechanism and the
  ban on React's `<Activity>` (§ 5 D-4); the expand-on-a-named-tab entry point
  the report's link uses. **Must deliver** P9's de-vacuumed assertion, D2 for
  `scan-error-live-region`, the two small MODIFIED blocks, and proof that
  `selectedHostId`, the stale-target notice and the commit-pending window
  survive a switch and a collapse.
- **2b-iii must rule** Q17 (zero fleets; the roster's own header and toggle
  inside a tab that already says `Fleets · N`) and the *Renderer
  Unavailability…* reading. `FleetRoster` is shared with the galaxy view:
  *Collapsible Panel* must stay true there.
- **2b-iv must deliver** D2 for `panel-error-live-region` (a live requirement:
  `docked-fleet-actions` *A Failed Command Is Announced to Assistive
  Technology*), proof that a mine/sell/refuel response landing while the tab is
  hidden or the dock collapsed still runs its mutate-level callback
  (`committedEta`, the price-changed notice, the guards' release), and the jump
  move with its guard. It **inherits** the filed `committedEta`-never-cleared
  defect (`followup-explain-withheld-burn-command.md`) and must not fix it by
  accident.
- **2b-v must rule** Q13, Q14, Q15, Q20 before authoring. It **inherits** the
  2a-iii/2a-iii-b warning verbatim: the committed record is written from
  `SpaceCommandPanel`'s mutate-level `onSuccess` (`SpaceCommandPanel.tsx:165–191`,
  `onCommitAccepted`), which React Query drops for an unmounted observer — so
  the panel stays mounted in a hidden tab, and a test must show a commit whose
  response lands after Esc still enters the committed state, shows both toasts
  and the notice. It should read `followup-explain-withheld-burn-command.md`
  (the docked-at-target state reads worse when the only surface that explains
  it is hidden).

---

## 3. Decomposition

### 3.1 Capability map

| Capability | New / delta | In 2b-i | Across the whole link |
| --- | --- | --- | --- |
| `system-console` | delta (16 live requirements, 111 scenarios; `## Purpose` present and correct) | **ADDED ×7–8, MODIFIED ×0** | ADDED ≈ 14; MODIFIED: the tab-enumeration requirement 2b-i adds (once per later piece); *The Fuel Gauge Draws…* (20) or *The Cost Overlay Is Drawn Only…* (20) only under one branch of Q14 |
| `sighting-log` | delta | **no delta** (D1 makes a live scenario true; needs a view-level test, not a delta) | none |
| `system-space-view` | delta | **no delta** | MODIFIED 2 (scan, 4 + 2 scenarios) in 2b-ii; 1 (cross-navigation, 3) in 2b-iv; 0–2 (committed selection 21; Fan-In 15) in 2b-v by ruling |
| `docked-fleet-actions` | delta | no delta | MODIFIED 1 (*Running Mine Gates…*, 2) in 2b-iv; the other fourteen untouched |
| `fleet-roster` | delta | no delta | MODIFIED 0–1 (*Collapsible Panel*, 1) in 2b-iii |
| `focused-scan` | — | untouched | untouched: it is the backend capability. The scan *surface* requirements live in `system-space-view` (lines 2061–2940). The scoping doc's "Specs touched: … `focused-scan`" is wrong |
| `figure-formatting`, `market-board-panel` | — | untouched | untouched in 2b (`market-board-panel` is link 4's) |

No in-flight change exists (`openspec list`: none), so no conflict.

### 3.2 2b-i — requirements (all ADDED to `system-console`)

Draft names; the writer owns the wording. Scenarios marked INFERRED come from
what the design implies, not states.

**R1 — The Console Dock Extends Beneath the Strip and Is Collapsed When the View Opens.**
The system SHALL render, beneath the vitals strip, a dock that is either
collapsed (the strip alone) or expanded (the strip as its top row, a tab bar,
one tab's panel), and SHALL show it collapsed on every mount of the system
space view.
- Collapsed on open: WHEN the view opens THEN only the strip is shown, no tab
  bar and no panel, and an expand affordance is present.
- Expand: WHEN the expand affordance is activated THEN the tab bar and the
  selected tab's panel are shown beneath the strip and a collapse control is
  present in the tab bar.
- Collapse: WHEN the collapse control is activated THEN only the strip is shown.
- The strip's five cells are identical in both states (cell set, figures,
  chevron).
- INFERRED — a reload, or navigation to another system and back, shows the dock
  collapsed (Q6).
- INFERRED — the dock is present and expandable while the interior read has
  failed, while the own-fleets read has failed, and while the canvas is
  unavailable.
- INFERRED — expanding and collapsing issue no network request and cause no
  announcement.

**R2 — The Dock Carries These Tabs** (kept small on purpose — every later piece
MODIFIES this block). As of this change: one tab, the sighting log.
- The tab bar lists exactly the tabs this requirement names, in its order.
- Exactly one tab is selected whenever the dock is expanded; its panel is the
  one shown.
- INFERRED — the first expansion after the view opens selects the first tab;
  a later expansion restores the tab last selected (Q3).

**R3 — The Log Tab Is the Sighting Log's Home on This View.** The tab's panel
SHALL be `sighting-log`'s log; this capability names the placement and restates
none of that capability's rules (the 2a-iv RULING 8 shape).
- The tab's panel contains the log with its rows, refresh, load-more, and its
  empty, loading and failed states.
- The log's content is not mounted until the interior read has resolved once
  (owner: `sighting-log` *The Log Reads on Mount…*; this scenario exists so the
  placement cannot drop the gate — today's gate is `!interior.isLoading` at
  `SystemSpaceView.tsx:910`).
- WHEN a settled sweep's report offers its link to the log and it is activated
  THEN the dock is expanded with the Log tab selected, whatever state it was in.
- INFERRED — WHEN a ghost is activated in the scene while the dock is collapsed
  THEN the dock stays collapsed (Q8) and the row is highlighted when the tab is
  next shown.
- The tab's label per the ruling on Q1.
- No other affordance on the view opens the log (the toggle is gone), and
  nothing floats the log over the canvas.

**R4 — A Tab's Content Stays Mounted While It Is Not Shown.** Content of a tab
that is not shown (dock collapsed, or — from 2b-ii — another tab selected)
SHALL stay mounted and SHALL be hidden from sight, from the tab order and from
assistive technology.
- Pages loaded with load-more are still listed after a collapse and re-expand,
  with no pile request issued by either.
- A row's "no mark in the open system" statement and a row's highlight survive
  a collapse and re-expand.
- While collapsed, no element of the log is focusable or exposed to assistive
  technology.
- A pile read that answers while the dock is collapsed is shown on re-expand.
- INFERRED — the log's scroll offset after re-expand: **do not write this
  scenario without a browser check**; whether `display: none` preserves an
  element's scroll offset is engine behaviour I did not verify.

**R5 — The Dock Is Keyboard-Operable.**
- The expand affordance, the tab, and the collapse control are each reachable
  by Tab and activatable by Enter or Space, with a visible focus indicator.
- The expand affordance and collapse control expose expanded state
  (`aria-expanded`, `aria-controls`); the tab bar is a tab list whose selected
  tab controls its panel (INFERRED — the WAI-ARIA tabs pattern; no document
  says it).
- WHEN the dock collapses while keyboard focus is inside it THEN focus moves to
  the expand affordance, never to the start of the document (INFERRED — the
  committed-selection requirement's focus rule is the in-repo precedent for
  "focus SHALL NOT be lost to the start of the document").
- The dock's controls come after the strip's chevron in the view's tab order,
  and the camera controls still precede the body and lane-gate hit targets
  (`system-space-view` *Space View Camera Is Keyboard-Operable*, unchanged).

**R6 — Escape Collapses the Expanded Dock.**
- WHEN Escape is pressed while the dock is expanded THEN it collapses.
- WHEN Escape is pressed while the dock is collapsed THEN nothing changes; in
  particular the space view's selection is unchanged (link 4 adds
  selection-clearing and will MODIFY this requirement — say so in design.md).
- WHEN Escape is pressed while the fleet cell's menu is open THEN the menu
  closes with focus on the chevron (`system-console` *The Fleet Cell's Chevron
  and Menu Are Keyboard-Operable*, unchanged) and the dock does not collapse.
- INFERRED — Escape while a native `select` popup or a toast has it: journey
  observation only; do not spec an engine behaviour.
- Escape changes no selection, no acting fleet, and issues no request.

**R7 — The Dock Has One Fixed Height and Nothing Covers It or Is Covered by It.**
- At 1280×720 CSS px the expanded dock, strip included, is 220 CSS px tall and
  full width; no control changes its height.
- Content taller than the panel area scrolls inside it; no control of the
  selected tab is clipped out of reach.
- At 1280×720, in each state, every floating surface the view or the app layout
  mounts is fully inside the viewport, activatable, and neither covers nor is
  covered by the dock or the strip (the enumeration is § 5).
- At 1280×720 with the dock expanded, the strip's five cells are inside the
  viewport and unoverlapped (the live *Strip Is Laptop-First* scenarios hold in
  the new state).

**R8 — Activating the Dock Changes No Space-View Selection.**
- A pointer press or click on the tab bar, a panel, the expand affordance or the
  collapse control is not a space-view pick and leaves the selection unchanged.
- Expanding, collapsing and selecting a tab leave the acting fleet unchanged.

Not a requirement, but a live scenario this piece must make true with a
view-level test and no delta: `sighting-log` *The log refetches after a sweep
settles* (§ 7 D1), on both settle paths (the ETA-scheduled watcher and the
early-settle exit).

### 3.3 Outline for the later pieces

- **2b-ii:** MODIFIED R2 (+Scan); ADDED "The Scan Tab Is the Focused-Scan
  Control's Home" (placement only); ADDED "A Failure in a Tab That Is Not Shown
  Is Still Announced" (cross-tab, so 2b-iv reuses it); the switch scenarios shed
  from R4/R5; MODIFIED the two `system-space-view` blocks of § 1.3.
- **2b-iii:** MODIFIED R2 (+Fleets, with its count); ADDED "The Fleets Tab";
  ADDED a scenario set for the dock without the canvas; `fleet-roster` per Q17.
- **2b-iv:** MODIFIED R2 (+Acting fleet, labelled by the served id — the fleet
  cell's own rule, since no fleet name is served); ADDED "The Acting-Fleet Tab";
  ADDED "A Command Response That Lands While Its Tab Is Not Shown Takes Full
  Effect"; MODIFIED *Running Mine Gates the Fleet Panel's Commands* and *Fleet
  Roster Cross-Navigation*.
- **2b-v:** ADDED "The Course Panel's Interim Home"; ADDED the collapsed-dock
  quote carrier per Q14; ADDED the own-ness deny requirement; MODIFIED per Q15
  and Q20; nothing remains anchored to the right edge.

---

## 4. Behaviour that could change under a placement change

"Remount" = what happens if tab content were conditionally rendered. "Hidden" =
what happens under the ruled lean (`hidden` attribute, content stays mounted).

| # | Behaviour | Where it lives | Under a remount | Under mounted-and-hidden | Test that must observe it at its new home |
| --- | --- | --- | --- | --- | --- |
| P1 | Double-submit guards | `useSubmitGuard()` refs inside `SpaceCommandPanel` (burn, jump), `FleetActionsPanel` (mine, sell, refuel), `ScanControl` | **lost mid-flight** — a remount between click and response gives a fresh, unclaimed guard: two orders | preserved | per verb: click, hide the tab (collapse / Esc / switch), show it, click again before the response → one request |
| P2 | Running-mine gating before the running read lands | `FleetActionsPanel`'s `committedEta` (`:149`, set in the mutate-level `onSuccess`) | lost: the panel un-gates until the inbox read lands | preserved. The filed never-cleared defect is preserved too | commit a mine, collapse, re-expand before the running read answers → still gated |
| P3 | Inbox-driven cancel | `ScanControl.commitCancel` (running action id from `useRunningScan`); mine cancel in `FleetActionsPanel` | reads survive (query cache); a cancel in flight loses its `onError` | preserved | the chain doc's journey leg: switch away, back, cancel |
| P4 | The log's mount-ordering rule | the mount gate `logOpen && !interior.isLoading` | n/a | **changes meaning**: "mount" becomes "the dock mounts", i.e. once per view. The gate must be carried onto the tab's content. The existing ordering test observes the ghost feed, not the log | a log-specific arm: with the interior read in flight, the *unfiltered* pile has not been requested |
| P5 | The log is fresh when you look at it | today: opening the log is a mount; React Query refetches a stale entry (default `staleTime` 60 s, `lib/query-client.ts:78`) | unchanged | **lost**: one read per view open; then only settle and explicit refresh. Makes D1 visible | § 7 D1's tests; Q7 |
| P6 | The running-sweep marker (`committedPending`, `earlySettleHandoff`) | `SystemSpaceView.tsx:337–451`, a query-cache marker computed outside `ScanControl` precisely so it survives a remount | survives (that is why it was built that way) | survives | existing `…scan-targets-refetch-on-arrival` rows, re-run with the control in a hidden tab |
| P7 | `ScanControl` local state: chosen target, stale-target notice, error announcement text | `useState` ×3 | lost | preserved | choose a non-default target, switch tabs, return → same target |
| P8 | `useOrder` / `useJump` / `useMine` / `useSell` / `useRefuel` / `useScan` mutate-level callbacks | each panel's `mutate(vars, { onSuccess, onError, onSettled })` | **dropped** for an unmounted observer: no toast, no committed record, no stranding notice, no guard release | fire. **But see D-4: React 19.2's `<Activity mode="hidden">` tears down effects and must not be the hiding mechanism** | per verb in 2b-iv/v: response lands while hidden → effect present on show |
| P9 | A `visible ⇒ …` assumption in a spec or test | `…scan-targets-refetch-on-arrival.test.tsx:875` (`queryByRole` absence); every Playwright `toBeVisible` used as "the read landed" (`scan-control` at `scan-journey:218`, `fleet-roster` at `world-time-render-loop-journey:148`, `preview-panel` at `helpers/space-view.ts:455`) | n/a | the vitest line **passes with a cancel button present**; the Playwright waits now mean "dock open on that tab" and say nothing about data | rewrite the role query with `hidden: true` or open the dock in the arrangement; in e2e, wait on the served attribute, not on visibility |
| P10 | Effects keyed on mount | `useScanTargets` (`staleTime: 0`, `refetchOnMount: 'always'`, `use-scan.ts:34–35`) — its "fresh list on re-selection" rule rides the *key change*, not a remount; `FleetRoster` and `SightingLog` own their reads | a remount per tab switch would issue a scan-target read per switch (a priced-looking poll by tab-flipping) | none issued by a switch | assert zero requests across a switch |
| P11 | Focus and keyboard order | DOM order: column (fleets-error → course → actions → scan → log toggle → cards → roster) then strip | — | order becomes strip → dock chrome → shown tab's content; hidden content leaves the order. Focus inside content that becomes hidden falls to `<body>` unless moved | R5; and in 2b-v the committed-selection focus scenario, whose "next focusable element after the panel" is now inside a tab |
| P12 | Live-region announcements | `space-announcer` (view root — safe); credits cell (strip — safe); `panel-error-live-region` (`FleetActionsPanel:341`, assertive) and `scan-error-live-region` (`ScanControl`, assertive) — **inside the panels** | — | **a region inside a `hidden` subtree announces nothing** (D2) | failure response lands while the tab is hidden → still announced |
| P13 | What `hidden` does to the accessibility tree | — | — | everything in an unshown tab is gone for a screen reader: with the dock collapsed that is the quote's figures, the affordability line, every verb, every retry | flags (a)/(b): § 4.1 |
| P14 | Per-frame work | panels re-render on the coarse clock tick | — | hidden tabs keep re-rendering and keep their query observers subscribed, as all of them do today; `system-space-view` *Animation Never Re-Renders the View…* is unaffected, and the dock's two pieces of state change only on user action | none new; do not add a `useEffect` that depends on a mutation object (frontend gotcha) |

### 4.1 Flags (a) and (b), and whether the overlay-lifetime requirement stays true

Live text, `system-console` *The Fuel Gauge Draws…*: "The extent is decorative
and SHALL NOT be relied on as the presentation of the quote's affordability.
The mounting view SHALL supply the strip a quote only while that view also
presents the same quote's affordability as text. This capability places no rule
on where or how the view presents that text." Scenario: *A drawn extent is
always accompanied by the quote's affordability as text*.

Live text, *The Cost Overlay Is Drawn Only for the View's Successful, Current
Preview, as the View Last Read It*: "SHALL supply the strip a burn quote
exactly while the view holds a successful, current burn preview … and SHALL
supply none otherwise."

- **Through 2b-iv both stay true with no edit**: `SpaceCommandPanel` is still
  in the column, on screen, printing `preview-affordable`.
- **At 2b-v they collide.** With the panel in a tab that is hidden by default,
  text inside a `hidden` subtree is not "presented" to anyone. Either the view
  presents the affordability somewhere that is not hidden (the first sentence
  stays true, the second is untouched), or it stops supplying the quote while
  the panel is hidden (the first stays true, **the second's "exactly while"
  goes false and its 20-scenario block must be MODIFIED** — and the default
  state loses the overlay 2a-iv built for it).
- What a keyboard or screen-reader user gets today while collapsed, if nothing
  is done: the fuel cell's text (`47.2 t · range 13.9k`), and nothing about the
  quote — the extent and its unaffordable mark are inside `aria-hidden`. A
  fleet with no fuel aboard draws no overlay at all (the no-data rule), so its
  only carrier is the panel's text, which would be hidden.
- The unaffordable mark must be kept whichever way it is ruled (flag (b)).
- No document records a lean between the two branches
  (`add-burn-cost-overlay-panel-architect.md` A2: "either … or …; the clause
  stays true either way"). Q14.

---

## 5. Bottom- and right-anchored occupants a 220 px dock can collide with

By grep for `fixed|absolute` with `bottom-|right-|inset-x-0|inset-y` across
`frontend/components` and `frontend/app` (catalyst and spikes excluded), plus
the layout mounts and the framework.

| Occupant | Where | Anchor today | With the dock expanded (strip at 164–220 px from the foot, tab bar 128–164, panel 0–128) |
| --- | --- | --- | --- |
| Vitals strip wrapper | `SystemSpaceView.tsx:1070` | `absolute inset-x-0 bottom-0 z-20` | becomes the dock's top row; rises 164 px |
| Right column | `SystemSpaceView.tsx:932` | `absolute top-4 bottom-[4.5rem] right-4 w-72 max-w-[85vw]`, `overflow-y-auto` | its foot must rise to 236 px or the dock covers its last panel. At 720 px tall that leaves 468 px for six occupants — it scrolls. Present until 2b-v |
| Floating log panel | `:912` | `absolute right-[calc(18rem+2rem)] top-4 z-20` | deleted by 2b-i |
| Sightings-unavailable card (carries a Retry) | `:896` | `absolute bottom-[4.5rem] left-1/2 -translate-x-1/2` | **covered** unless raised with the dock |
| Camera cluster (four buttons) | `SpaceStage.tsx:716` | `absolute bottom-[4.5rem] right-4 grid grid-cols-4` | **covered** unless raised; the mock puts it at `bottom: 232px` expanded and `bottom: 100px` collapsed (above the chip). Needs an offset the stage does not have today |
| Expand affordance ("Console" chip) | new; mock `Collapsed.dc.html`: `right: 16px; bottom: 64px` | — | collapsed only. It sits exactly where the camera cluster is today and inside the column's lane — both must move for it |
| Collapse control | new; mock `Main.dc.html`: right end of the tab bar | — | expanded only |
| Fleet cell's chevron menu | `VitalsStripFleetCell.tsx:151` | `absolute bottom-full left-0 z-10` (opens upward from the strip) | opens upward from the raised strip; fine |
| **`FloatingNav`** (app-wide, from the layout; Galaxy link, e-mail, Sign out) | `components/floating-nav.tsx:33` | `fixed bottom-[4.5rem] left-4 z-50` | **sits on top of the tab bar's first tabs and the panel's left 230 px, above them in z-order** — the same fatal shape as 2a's collision, on the dock's primary controls. It is outside the view's subtree, so the view cannot restyle it by class |
| Toaster | `app/layout.tsx:29` | `position="top-right"` | over the column's top today; no dock collision |
| Next.js dev-mode issues badge (`nextjs-portal`) | framework; bottom-left by default | off in the e2e stack (`next.config.ts:18`, `devIndicators: false` when `ENV=test`) and hidden again by five journeys' `addInitScript` | in `npm run dev` it is in the bottom-left corner over the strip's fleet cell today, and would sit over the expanded panel's corner. Not in any gate; real for Travis's own eyes |
| Canvas error, loading and unsupported states | `:840`, `:863`, `SpaceCanvas.tsx:139` | `absolute inset-0 grid place-items-center` | centred in the full viewport; a `max-w-md` card centred at 360 px clears a dock that starts at 500 px on a 720 px viewport. Tight below ~640 px tall, which is under the floor |
| Off-screen reach chips | `SpaceStage.tsx` | top-left | none (link 3 deletes them) |
| Galaxy view | `GalaxyGraph.tsx:380`, `GalaxyView.tsx:482` | — | not this view. But `FloatingNav` is shared: whatever raises it on the system view must leave the galaxy route at `4.5rem` |

Five occupants must follow the dock's height: the column (until 2b-v), the
sightings card, the camera cluster, `FloatingNav`, and the chip's own
appearance. That is one mechanism, not five (§ 8 D-2).

---

## 6. Chain-doc claims checked against spec text and code

| # | Claim | Verdict | Evidence |
| --- | --- | --- | --- |
| C1 | "four tabs that always exist" | **Gap.** | `fleet-roster` *Empty When There Is Nothing to Manage*: the roster renders nothing with zero fleets (`FleetRoster.tsx:145`) — an always-present Fleets tab would be empty. The Acting-fleet tab "by name" has no name when there is no acting fleet |
| C2 | "`ScanControl`, whole" / "`SightingLog`, whole" | **True of behaviour, false of markup, and false of one precondition.** | both are `w-72`/`w-80` floating cards (`ScanControl.tsx:182`, `SightingLog.tsx:157` `max-h-[70vh] w-80`) written for a column; the panel area is 128 px tall. `SightingLog`'s freshness depended on being mounted on open (P5). `ScanControl`'s `onOpenLog` is `setLogOpen(true)` |
| C3 | "The requirements move, not change… the delta is a 'mounted in the console' clause on each" | **Refuted as a delta plan.** | none of `docked-fleet-actions`' 15 requirements (57 scenarios) or `sighting-log`'s 8 (26) names a placement: they say "the fleet panel", "the acting fleet's panel section", "an affordance that opens the sighting log". A clause on each is 23 MODIFIED blocks carrying 83 scenarios verbatim to add words no scenario tests. 2a-iv RULING 8 is the precedent: ADDED in the new owner, naming the old |
| C4 | "Touches: MODIFIED `system-console` (the dock, tabs, collapse, Esc)" | **ADDED, not MODIFIED.** | no live `system-console` requirement mentions the dock; its `## Purpose` already does and survived (it is not the `TBD` placeholder) |
| C5 | "`system-space-view` (the column retired; the log-reachable, scan-surface and roster cross-navigation requirements re-pointed at the dock)" | **Mostly wrong.** | there is no column requirement — "column" appears once, as "the command column's order", in the 21-scenario committed-selection requirement. The log-reachable requirement is in `sighting-log`. *Fleet Roster Cross-Navigation* names panels, not a placement; it changes only if jump moves. Two scan requirements do need re-pointing (§ 1.3) |
| C6 | "`FleetRoster`, `commandOwner="view"`" | True today (`:1058`); unchanged | |
| C7 | "`Esc` collapses the dock" | **Unstated conflict.** | Escape already closes the fleet cell's menu, by a live requirement. No other Escape handler exists in the view (`SpaceStage` has none) |
| C8 | "`SystemSpaceView.tsx` already computes the running-sweep marker *outside* `ScanControl`" | True (`:337–388`) — and it is the *only* state already protected. P1, P2, P7, P8 are not | |
| C9 | "Source: `SystemSpaceView.tsx:779–890`" | **Stale.** The column is `:925–1063`, the floating log `:910–922`, the strip `:1070–1086` | |
| C10 | "The right column (`inset-y-4 right-4 … w-72`)" | **Stale.** It is `top-4 bottom-[4.5rem] right-4` since 2a | |
| C11 | "a tab bar and a ~164px detail area (220px total with the strip)" | The 164 px **includes the 36 px tab bar** (mock: strip 56, tab bar 36). The panel area is 128 px, 92 px inside the mock's padding | `Main.dc.html` |
| C12 | "default collapsed"; the strip "stays as the dock's top row" | Consistent, with a consequence nobody states: **the strip moves up 164 px on expand**, and so does everything anchored to it | mock; *The Vitals Strip Is Present…* says "across the foot" |
| C13 | "The `SpaceCommandPanel` loses its jump half" | It is one button, one guard, one hook, four tests and two MODIFIED blocks — and `system-space-view` *Renderer Unavailability…* already says jump is invokable "through the fleet panel", which is **false today** (`SpaceCommandPanel.tsx:432–443`) and becomes true by the move | |
| C14 | "This link mounts that component against an *arbitrary selected entity*" (own-ness) | **False for 2b.** | the audit says "Link 2b's selected-entity tab" — written when that tab was in 2b; it is link 4's. In every 2b piece the strip's `acting` still comes from `useMyFleets()` (`:303–309`). The deny scenario is still worth one cheap strip-level arrangement group; its premise arrives in link 4 |
| C15 | The journey (refuel, scan, log, cancel) | It is the whole link's journey and needs three tabs. Each piece needs its own (§ 2.3) | |
| C16 | "Tab remount is the trap … rule it" | Ruled by the lean; see D-4 for the mechanism trap inside the ruling | |
| C17 | "Inherited from 2a's security audit … mounts that component against an arbitrary selected entity" | as C14 | |
| C18 | "The `85vw` cap the column had is the floor" | Superseded: the floor is **1280×720** (2a RULING 12, live in *The Strip Is Laptop-First…*) | |
| C19 | "No coexistence period for the old right column" | **Cannot hold under the cap** (§ 2.1 item 3) | |
| C20 | Table row: "MODIFIED `system-console`, `system-space-view`, `docked-fleet-actions`, `fleet-roster`, `sighting-log`" | Predicted actual: ADDED `system-console` ≈ 14; MODIFIED `system-space-view` 3–5, `docked-fleet-actions` 1, `fleet-roster` 0–1, `sighting-log` **0** | § 1.3 |
| C21 | "the log's mount-ordering rule [is] most likely to break" | It does not break; it changes meaning (P4), and a neighbouring scenario is already false (D1) | |
| C22 | "Link 2b re-homes these cells and should read [the drift note]" | **2b re-homes no strip cell.** The strip is untouched except for what sits beneath it. The drift (stale fuel/hold figures after a failed refetch over retained data) is unchanged by 2b, and gets *worse to look at* if Q15 hides the failure card | `VitalsStrip.tsx:242`; `drift-strip-cells-retain-figures-after-failed-fleets-read.md` |
| C23 | U1–U10 "must stay byte-identical where possible" | **No re-homing forces any of them to move.** Only U2 is in a file this link edits (`SystemSpaceView.tsx`, the two `wallMsUntil(...) + ETA_CUSHION_MS` timers, now `:193` and `:592`); both are in effects, not in the JSX being rearranged, so they keep their bytes and lose only their line numbers. U1 (`lib/client-clock`), U6/U7 (`package.json`, `playwright.config.ts` — `stdout: 'pipe'` is already there at `:31`), U9 (`e2e/setup/backend-stack.ts`) and the backend hunks U3–U5, U8, U10 are untouched | `add-vitals-strip-qa-reverify.md` § 3 |
| C24 | Scoping doc: "Specs touched: … `focused-scan`" | Wrong capability (§ 3.1) | |

---

## 7. Findings (by code reading; none observed on a stack)

**D1 — The open sighting log is never re-read after a sweep settles.**
`sighting-log` *The Log Reads on Mount, After a Sweep Settles, and on Explicit
Refresh — Never on a Timer*, scenario *The log refetches after a sweep
settles*: "WHEN the space view's post-sweep settle refetch completes THEN the
pile is read again and any newly minted records appear." The settle path calls
`onSettled={refetchGhostFeed}` (`SystemSpaceView.tsx:830`, `:426`), which
refetches the **system-filtered** pile (`queryKeys.sightings.pile(systemId)`);
`SightingLog` reads the **unfiltered** one (`pile(null)`, a different cache
entry by design), and nothing invalidates `queryKeys.sightings.all` or that key
anywhere under `hooks/` or `components/`. Today the gap is masked: the log is
normally closed when a sweep settles and is mounted — hence read — when opened
(and `scan-journey` step 5 does exactly that). With the log always mounted, the
ordinary path (open the view, sweep, look at the Log tab) shows a pile read
before the sweep, and `scan-journey` step 5 goes red. **2b-i must make the
scenario true** on both settle exits, sequenced after the settling interior
read like its siblings. No delta; needs a view-level test over a real
`useSightings` (the existing ordering tests mock the hook and count any call).

**D2 — A command failure that lands while its tab is hidden is announced to
nobody.** `panel-error-live-region` and `scan-error-live-region` are rendered
inside their panels. `docked-fleet-actions` *A Failed Command Is Announced to
Assistive Technology* is a live requirement for sell and refuel; the scan
region is unspecced. Commit, press Esc, the request fails: a toast appears, the
live region updates inside a `hidden` subtree. 2b-ii and 2b-iv must each keep
the announcement in a subtree that is never hidden.

**D3 — A read failure's retry would be hidden by default.** The own-fleets,
station and board failure cards are column children (`:933–948`,
`:1009–1048`). If they follow their panels into the Acting-fleet tab, a failed
own-fleets read shows, in the default state, a strip of absent cells and
nothing else — and `system-console` says outright that "the strip itself
renders no error or retry affordance of its own — the failure is surfaced on
the fleet panel". Q15.

**D4 — `system-space-view` *Renderer Unavailability…* says jump is invokable
"through the fleet panel"; it is on the command panel.** Harmless, and made
true by 2b-iv's move. Recorded so nobody "fixes" the spec the other way.

**D5 — The mount-ordering test does not observe the log.**
`…sighting-log-mount-ordering.test.tsx` never opens the log; its spy counts any
`useSightings` call, i.e. the ghost feed's. After 2b-i the log is mounted with
the dock, so the same spy starts observing it — good — but it cannot tell the
two reads apart. P4's log-specific arm is the fix.

---

## 8. Design decisions worth a design.md (2b-i)

- **D-1 Hiding mechanism.** The HTML `hidden` attribute on each tab's panel
  wrapper and on the tab bar and panel region when collapsed. Tailwind v4's
  preflight gives `[hidden]` `display: none !important`, so a `flex` utility on
  the same element cannot defeat it (worth one line of proof in the journey —
  jsdom applies no CSS).
- **D-4 Not React `<Activity>`.** The repo is on React 19.2, whose
  `<Activity mode="hidden">` preserves state but destroys effects while hidden.
  React Query's observers subscribe in effects, so an Activity-hidden panel
  would, as I read both libraries (not verified by running), drop exactly the mutate-level callbacks this link was warned about
  twice. Record it as a rejected alternative so nobody reaches for it.
- **D-2 One source for the dock's height.** Five occupants follow it, one of
  them (`FloatingNav`) outside the view's subtree and one (`SpaceStage`'s
  cluster) inside a component the view feeds by props. A CSS custom property
  published by the view and read by all five is the candidate; the alternative
  is a prop to the stage plus a context for the nav. Whatever is chosen must
  leave the galaxy route's nav where it is.
- **D-3 Where dock state lives.** `expanded` and the selected tab are view
  state (they replace `logOpen`); the report's link needs an "expand on this
  tab" entry point. Not persisted (Q6).
- **D-5 Per-tab layout is not specified.** The canvas has no artboard for any
  tab this link builds: `Main.dc.html` shows only link 4's selected-entity tab;
  `Console.dc.html` is the rejected direction C. The spec states reachability
  and non-overflow (R7), not layout; the components change their outer chrome
  only.
- **D-6 The dock's own Purpose.** `openspec archive` discards a delta's
  `## Purpose`; `system-console`'s live Purpose is correct and should be
  extended by hand after archive to say the dock's tabs host other
  capabilities' panels and issue those panels' reads (the "issues no read"
  sentence is the strip's).
- **D-7 Journey instrumentation carried forward** (2a Taught): the
  `[journey-console]` capture as a hard `afterEach` assertion, and the
  `nextjs-portal` hide; `webServer.stdout: 'pipe'` is already configured.
- **D-8 e2e arrangement policy.** Whether helpers open the dock (few edits, the
  default-collapsed state exercised only by the new journey) or each spec does
  (many edits, each honest). 2b-i has two specs and can afford the honest form;
  2b-v cannot without a helper.

---

## 9. Figure sweep — every figure the dock would render, against the served types

| Figure | Tab | Source | On the wire? |
| --- | --- | --- | --- |
| `Log · N` | tab label | `SightingPage { sightings, nextCursor }` | **No total is served.** Only the number of rows loaded so far is knowable, and it under-counts whenever `nextCursor` is non-empty. Q1 |
| Log row: system, `asOf`, host id, hull count, hull types, clean-sweep | Log | `Sighting`; system name from the galaxy read | yes (name falls back to id, by a live requirement) |
| `Fleets · N` | tab label | length of the own-fleets read | yes — the roster header already prints it (`FleetRoster.tsx:158`). What it reads when that read has failed or is empty is unstated (Q17) |
| Roster row: fuel, range, ETA, stranded | Fleets | `Fleet.roster.cargo.fuel`, `estimatedRange`, burn/jump/mine ETAs, `stranded` | yes, unchanged |
| Acting-fleet tab label "by name" | tab label | — | **No fleet name is served** (`system-console` *The Fleet Cell Names the Acting Fleet…*: "no fleet name exists on the wire … SHALL NOT synthesise a client-side display name"). The label is the served id, by that rule |
| "state, park mode" | Acting fleet | `rosterRowStatus` (the strip pill's derivation); `state.Park.Kind` | yes. Must be the same projection as the pill, not a third one |
| Hold/release drain rate | Acting fleet | `roster.stationKeepRateTonsPerSecond` | yes |
| Mine ETA preview, sell proceeds, refuel cost | Acting fleet | `roster.miningRate`; venue quotes; `roster.fuelPricePerTon` | yes, unchanged |
| Course: arrival, Δv, fuel, ceiling, affordability, stranding | Acting fleet (interim) | `BurnPreview` | yes, unchanged |
| Scan: target kind, host id, sweep duration; countdown | Scan | scan-target read; action inbox | yes, unchanged |
| Tab counts as "figures" | — | — | a count is interpolated, not formatted, in the roster header today and passed link 1's check, so counts are outside `figure-formatting`'s vocabulary by precedent — **confirm against *A Player-Facing Figure Is Produced Only By the Shared Formatter* before writing a label scenario** |

Mock-only figures that are **not** this link's and not on the wire, listed so no
piece of 2b picks them up from the canvas: `Short by 6.6 t`, `53.8 t of 47.2`,
`Refuel 7 t · 28 ₡`, `burned 21.3 t · 32.5 t to go` (shortfall and burn progress
are unserved — known since 2a and 2a-iv). They belong to link 4's analyst.

No field, endpoint or query is needed by any 2b piece. D1's fix is an
invalidation of an existing query, not a new read.

---

## 10. Open questions

Each with its recorded lean and where it is recorded. "None" means I found no
lean in the chain doc, the scoping doc, the canvas, the specs or the handoffs.

### Hard-stop candidates (a product call with no lean anywhere)

**Q13 — (2b-v) While the dock is collapsed, what does a player get for a
selected target?** Chain doc: the course half is "mounted in that same tab as
an interim home"; scoping doc: "Default is collapsed … the strip alone must
carry the common case and the arc label must be sufficient to commit a burn" —
but the arc label is link 4. Between 2b-v and link 4, selecting a target would
show a gauge band and nothing else; Burn is two activations away in a hidden
tab. Options: (1) ship as written; (2) selecting a target expands the dock on
the Acting-fleet tab (pulls link 4's open-on-select forward, onto a different
tab than link 4 will use); (3) leave the course panel floating outside the dock
until link 4 deletes it. **Lean: none** on the consequence; the letter of the
chain doc is (1). Most reversible: (1) — it adds no behaviour link 4 must
unpick — with the cost stated in the proposal. (3) is the only option that
changes nothing a player does today, and the only one that contradicts "the
right column is deleted".

**Q14 — (2b-v) What carries the quote's affordability while the dock is
collapsed?** Flags (a) and (b). Options: (i) the view presents it as text
outside the hidden tab (where, and whether visually hidden, is the call); (ii)
the view stops supplying the quote while the panel is hidden — MODIFIES the
20-scenario *Cost Overlay Is Drawn Only…* block and removes the overlay from
the default state. **Lean: none** — `add-burn-cost-overlay-panel-architect.md`
A2 and the chain doc's flag (a) list both and choose neither. Most reversible:
(i) with a visually hidden, non-live text element at the view level present
only while a quote is supplied and the panel's own line is hidden: no MODIFIED
block, nothing a sighted player sees changes, removable in one line when link 4
gives the arc a label.

**Q1 — (2b-i, mild) What is `N` in `Log · N`?** The mock shows `Log · 3`; the
wire serves no total. Options: no count; rows loaded so far; rows loaded with a
marker while more pages exist. **Lean: none** (the chain doc and scoping doc
both write `Log · N` without defining N). Most reversible: label the tab `Log`
with no count in 2b-i; adding a count later is one scenario.

### Not hard stops

| # | Piece | Question | Recorded lean and source | Most reversible / recommendation |
| --- | --- | --- | --- | --- |
| Q2 | i | What opens a collapsed dock? | **Canvas**: a "Console" chip, `right: 16px; bottom: 64px`, outside the strip (`Collapsed.dc.html`); its note says "one click away". No prose document mentions it | the chip, outside the strip element so *The chevron is the strip's only interactive element* stays true |
| Q3 | i | Which tab is shown on expand? | none | first tab on first expand, last-selected thereafter (INFERRED) |
| Q4 | i | Escape's scope and its conflicts (fleet menu, native select) | partial: chain doc "`Esc` collapses the dock (the second-press rule lands with selection in link 4)" | view-wide; the menu's own Escape wins; no engine behaviour specced |
| Q5 | all | Layout of each tab's content in a 128 px area | none — no artboard exists for any 2b tab | do not spec layout; R7 states reachability and scrolling; outer chrome only (D-5) |
| Q6 | i | Does the dock's state survive a reload or cross-system navigation? | scoping doc "Default is collapsed" | collapsed on every mount |
| Q7 | i | Does showing the Log tab re-read the pile? | none. Lean of the tabs ruling ("survive a tab switch without a lifted-state refactor") points to no | no read on show; D1's settle re-read and the explicit Refresh are the only triggers. Costs: records minted by an own sweep in *another* system no longer appear on re-open after a minute; they appear on Refresh |
| Q8 | i | Does activating a ghost open the dock on the Log tab? | none; link 4's open-on-select is for selectable entities, and a ghost is not one | no |
| Q9 | i | *The Vitals Strip Is Present…* says "across the foot" — delta? | 2a-iv RULING 8 (name the owner, restate nothing); the text's own "bottom-most always-visible band" | no delta |
| Q10 | i | One tab in a tab bar after 2b-i — acceptable? | chain ground rules: each link shippable | yes; said in the proposal |
| Q11 | i | Does `FloatingNav` follow the dock up, or move elsewhere? | 2a precedent: "raised clear of the strip", same offset as its siblings (`floating-nav.tsx:9–15`) | follows the dock (D-2). Its permanent home is undecided by any document and is not this chain's |
| Q12 | split | Which piece keeps the id `add-console-dock`? | precedents disagree: 2a kept its id for the first half; `add-burn-cost-overlay` kept it for the last | the first — the canvas directory and this file are already keyed to it |
| Q15 | iv, v | Where do the own-fleets, station and board failure cards live once their panel is hidden by default? | none. `system-console`: "the failure is surfaced on the fleet panel" | keep each visible outside the dock (the `sightings-unavailable` precedent); costs a 15-scenario Fan-In MODIFIED for "in the fleet panel region" unless ruled that a notice naming the fleet panel's read satisfies it |
| Q16 | ii, iv | Hidden live regions (D2) | none; preserve-behaviour is the link's stated adversary target | lift the regions out of the hidden subtree |
| Q17 | iii | Fleets tab with zero fleets; the roster's own header and collapse toggle inside the tab | none | the tab exists with an explicit empty statement; the roster's own toggle is withheld by a mount prop and *Collapsible Panel* scoped to mounts that keep it |
| Q18 | iv | Acting-fleet tab's label and content with no acting fleet | resolved for the label by `system-console` (served id; absent form when none); content: `FleetActionsPanel`'s existing "no fleet" branch (`:321`) | as resolved |
| Q19 | iv | Jump moves in 2b or with link 4's deletion of the panel? | chain doc: here | in 2b-iv; seam available (§ 2.3) |
| Q20 | v | "the command column's order" — MODIFY the 21-scenario block? | 2a-iv Taught: "a 21-scenario MODIFIED block to add two words is the archiver trap at its largest" | no delta; the parenthetical already defines the order; design.md records the dead name for link 4, which rewrites that requirement anyway |
| Q21 | v | The own-ness deny scenario | chain doc: "assert it, do not inherit it" | one ADDED strip-level requirement with two scenarios (absent form and no segments; no extent and no extent state attribute), not a scenario bolted onto three 20-scenario blocks |
| Q22 | iii | *Renderer Unavailability…* "mounted and interactive" under a collapsed dock | none | no delta; an ADDED dock scenario proves the dock opens and the roster and verbs operate without the canvas; `renderer-availability.spec.ts:232` opens the dock first |
| Q23 | — | Fix the strip's retained-figures drift here? | 2a-iv RULING 11: filed, Travis's to schedule | not in 2b |

---

## 11. Out of scope (record in each proposal as deliberate)

- The **Selected entity** tab, open-on-select, and the second-press Escape rule
  — link 4.
- Figures on the arc, Burn on the arc, deleting `SpaceCommandPanel` — link 4.
- The in-system list and the off-screen chips — link 3.
- A resizable dock, a drag handle, a mobile layout, any palette or type change,
  the galaxy view, a persistent strip across views — chain doc "Out of the
  chain" and "What every link must not do".
- Any backend field, endpoint or query — including a pile total for `Log · N`,
  a fleet name, a shortfall figure.
- `explain-withheld-burn-command`, the `committedEta` defect, the strip's
  retained-figures drift, the commit response's missing delta-v — filed, not
  this link's.
- Layout of tab content beyond reachability and non-overflow.

---

## 12. Files

- Chain and scoping: `/Users/travis/Projects/hexaverse/docs/plans/system-hud/chain.md`,
  `/Users/travis/Projects/hexaverse/docs/plans/system-hud.md`
- Canvas: `/Users/travis/Projects/hexaverse/docs/handoffs/add-console-dock-canvas/`
  (`Main.dc.html`, `Collapsed.dc.html`, `Console.dc.html`, `canvas.json`)
- Specs: `/Users/travis/Projects/hexaverse/openspec/specs/{system-console,system-space-view,sighting-log,docked-fleet-actions,fleet-roster}/spec.md`
- Code: `/Users/travis/Projects/hexaverse/frontend/components/space/{SystemSpaceView,SpaceCommandPanel,FleetActionsPanel,ScanControl,SightingLog,VitalsStrip,VitalsStripFleetCell,SpaceStage}.tsx`,
  `/Users/travis/Projects/hexaverse/frontend/components/fleet/FleetRoster.tsx`,
  `/Users/travis/Projects/hexaverse/frontend/components/floating-nav.tsx`,
  `/Users/travis/Projects/hexaverse/frontend/hooks/{use-sightings,use-scan,use-fleets,use-actions}.ts`,
  `/Users/travis/Projects/hexaverse/frontend/lib/query-client.ts`
- Tests that carry the cost: `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx`,
  `…/SystemSpaceView.sighting-log-mount-ordering.test.tsx`,
  `…/SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` (line 875),
  `/Users/travis/Projects/hexaverse/frontend/e2e/tests/scan-journey.spec.ts`,
  `…/scan-lane-transit-fizzle.spec.ts`, `…/vitals-strip-journey.spec.ts`,
  `…/burn-cost-overlay-journey.spec.ts`,
  `/Users/travis/Projects/hexaverse/frontend/e2e/helpers/{space-view,scan-fixtures}.ts`
- Handoffs read: `add-vitals-strip-security-audit.md`,
  `drift-strip-cells-retain-figures-after-failed-fleets-read.md`,
  `followup-explain-withheld-burn-command.md`, `add-vitals-strip-qa-reverify.md`
  (§ 3), `add-burn-cost-overlay-rulings-index.md` and RULING 19,
  `add-burn-cost-overlay-panel-{architect,ux,security}.md` (the notes addressed
  to link 2b), all under `/Users/travis/Projects/hexaverse/docs/handoffs/`
