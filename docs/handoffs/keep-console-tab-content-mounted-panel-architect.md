# keep-console-tab-content-mounted — Phase-1 panel, architect

Reviewer: architect, 2026-10-05, tree at `3f83cf9`.
Change: `openspec/changes/keep-console-tab-content-mounted/` (4 ADDED, 1 MODIFIED, 39 boxes as drafted).
Wrote: `openspec/changes/keep-console-tab-content-mounted/design.md` only. `openspec validate keep-console-tab-content-mounted --strict` still passes.
Frontend paths are relative to `frontend/`; spec paths to `openspec/specs/`.

What was run: one jsdom probe of Escape listener ordering against the installed React 19.2.3 (script at `/private/tmp/claude-501/-Users-travis-Projects-hexaverse/9d55a6b8-d206-4d64-9014-7f1fdac0e26d/scratchpad/escape-probe.cjs`), and `openspec validate --strict`. No test suite, no stack. Everything else is by reading the files cited. The predecessor's `hidden` and `<Activity>` measurements were not repeated.

## What design.md settles (one line)

The mount site is the view's one expression (D-1); hiding is the `hidden` attribute (D-2); the gate is a per-mount latch held as render-phase state (D-3); both settle exits share one stable callback that keeps `refetchGhostFeed` and invalidates `pile(null)` (D-4); Escape is a `window` bubble listener in the shell honouring `defaultPrevented`, `repeat` and `isComposing` (D-5); every collapse goes through the existing `handleCollapse` (D-6); what each tier can and cannot hold (D-8).

## Verdict

No BLOCKER. Five MAJOR, ten MINOR. The change fits the cap: **40 as written, 39 with the one cut in A6**, and no headroom beyond that.

Nothing here asks to reverse a ruling. A3 applies RULING 4's condition to a sentence the ruling did not reach. A12 asks for a ruling on a case no ruling covers.

## The Escape verification (analysis § 4 claim 9)

**Confirmed, by source and by execution.** Predecessor D-7's account ("React dispatches them from the root container before the event reaches `document`") is false in production.

- Source: `node_modules/next/dist/client/app-index.js:30` is `const appElement = document`, hydrated at `:224`. React attaches its delegated listeners to that container (`listenToAllSupportedEvents(container)`, `react-dom/cjs/react-dom-client.development.js:28057`, `:28113`). So React's `keydown` listener and a `document` listener of the dock are on the same node and run in registration order.
- Probe (a button whose `onKeyDown` prevents Escape while "open"; a second listener recording `defaultPrevented` for three keydowns: a press, an auto-repeat, a second press):

| React root | Second listener | Press 1 seen as prevented |
| --- | --- | --- |
| `document` | `document`, bubble, registered in an effect | yes |
| `document` | `document`, capture | **no** |
| `document` | `document`, bubble, registered before the root | **no** |
| `document` | `window`, bubble, registered before the root | yes |
| `document` | `window`, bubble, registered in an effect | yes |
| `div` | `document`, bubble, either order | yes |
| `div` | `window`, bubble | yes |

  In all eight runs the auto-repeat and the second press arrived unprevented (the menu had closed), so `event.repeat` needs its own guard (RULING 11).

Consequence: a `window` bubble listener gets the menu's precedence by propagation under both root shapes. That is design.md D-5 and finding A1.

## Findings

### A1 — MAJOR — task 4.3 does not name the listener's target, and the mechanism the tasks assume holds in production only by registration order

Evidence: the section above. tasks.md 4.3 says "a listener present while, and only while, the dock is expanded" with no target; section 2's header and 5.2 say "production dispatches both handlers on `document` and tier 1 cannot see the order". A developer following predecessor D-7 builds a `document` listener that tier 1 passes for the wrong reason and that one refactor (capture phase, or a listener registered at module load) breaks with tier 1 still green.

Paste-ready, tasks.md 4.3, replace "a listener present while, and only while, the dock is expanded, collapsing it unless the fleet cell's open menu consumed the key, ignoring a repeated keydown and a keydown during composition" with:

> a `keydown` listener on `window` in the bubble phase (never `document`, never the capture phase: design.md D-5), present while, and only while, the dock is expanded, which on an Escape that is not `defaultPrevented`, not a repeat and not part of a composition calls the shell's existing `handleCollapse` and prevents the event's default

and replace "and one focus rule shared by every way of collapsing, decided before the state change, moving focus…where it is" with:

> and no second collapse path: Escape and the collapse control both go through `handleCollapse` (`ConsoleDock.tsx:90-93`), which already decides before the state change whether focus is in the tab bar or the panel

Paste-ready, section 2 header, replace the last sentence ("Under the testing library the React root is a `div`, so…§ 5.2 row 5).") with:

> The dock listens on `window`, so the fleet menu's precedence is by propagation both under the testing library (root container a `div`) and in production (root container `document`); tier 1 proves the mechanism production runs, and the journey's menu-open leg confirms it (design.md D-5).

Paste-ready, 5.2, replace "because production dispatches both handlers on `document` and tier 1 cannot see the order" with:

> as the production confirmation of the `window` listener's ordering (design.md D-5)

### A2 — MAJOR — an ADDED sentence contradicts a live requirement: "While the dock is collapsed, Escape SHALL change nothing in the dock"

Evidence: `system-console/spec.md:1173` defines the dock as "made of the vitals strip's row and, while the dock is expanded, a tab bar…"; the strip's row holds the fleet cell's menu; `system-console/spec.md:186-187` says "Escape SHALL close the menu without choosing an entry and return focus to the chevron". With the dock collapsed and the menu open, Escape changes something in the dock, by a live SHALL.

Paste-ready, delta, last sentence of *Escape Collapses the Expanded Dock*:

> While the dock is collapsed, Escape SHALL leave it collapsed and SHALL change no space-view selection and no acting fleet; the fleet cell's open menu still closes on it, as its own requirement states.

The scenario *Escape with the dock collapsed changes nothing* is already worded to the narrower claim and needs no edit.

### A3 — MAJOR — an ADDED sentence promises a read that RULING 4 says is not always issued

Evidence: delta, *Showing or Hiding the Log Tab Issues No Read*: "WHEN the view opens, a read of the pile … SHALL be issued once the interior read the view opened with has finished". Inside the 60 s stale time (`lib/query-client.ts:78`; `hooks/use-sightings.ts:27-36` sets none) a mount issues nothing. RULING 4 conditioned the scenario and filed the gap in `sighting-log`; the requirement sentence restates the unconditional claim in a second capability. This is not a reversal of RULING 4; it is the ruling applied to the sentence above its scenario.

Paste-ready, replace that sentence with:

> The log's first pile read, where *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* has the log issue one, SHALL NOT wait for the dock to be expanded: it SHALL be issued no earlier than the moment the interior read the view opened with has finished (*The Log Tab Is the Sighting Log's Home on This View*), and whether the dock is expanded SHALL have no bearing on whether or when it is issued.

### A4 — MAJOR — two "no request" clauses are assigned to harnesses that cannot observe a request

1. **2.4** closes on "the service boundary's request count unchanged" in a file whose header says "mocked reads" and "follows `SystemSpaceView.console-dock.test.tsx`", which mocks every read hook (`SystemSpaceView.console-dock.test.tsx:53-110`). No build can issue a service call there, so the clause "AND no network request is issued" (*Escape collapsing the dock clears no selection*) cannot fail.
2. **1.13** asserts "a later interior re-read … issues no pile read" in the mount-ordering file, which mocks `useSightings` and records hook calls (`SystemSpaceView.sighting-log-mount-ordering.test.tsx:90-95`). A hook call count rises on every render and cannot tell a read from a render. The build this clause exists to fail (the settle callback wired into `resync`, so the pile is re-read on every 20 s poll) is invisible there.

Both belong as rows of 1.8, whose harness runs the real hook and whose closing assertion is already "the request count of the service boundary unchanged". No new arrangement group.

Paste-ready, 1.8, replace "parametrised over the "Console" control (expand, collapse, expand) and the settled report's link (dock collapsed)" with:

> parametrised over the "Console" control (expand, collapse, expand), a collapse by Escape followed by a re-expansion, the settled report's link (dock collapsed), and a re-read of the interior with no sweep running (the interior mock's `isFetching` true then false, and the view's baseline poll fired)

and append to its content list: `"Escape collapsing the dock clears no selection" (its request clause), "A later re-read of the interior neither removes the log nor issues a pile read" (its request clause)`; and to its failing builds: `; a build that invalidates the pile from the view's resync fails the last row`.

Paste-ready, 2.4, replace "the same body selected, the same fleet acting and the service boundary's request count unchanged" with:

> the same body selected, the same fleet acting, and no mocked read's `refetch` and no mutation called (the request clause proper is a row of 1.8, over the real hook)

Paste-ready, 1.13, replace "and a later interior re-read (`isFetching: true` again) removes nothing and issues no pile read" with:

> and a later interior re-read (`isFetching: true` again) leaves the log in the panel with its rows (that the re-read issues no pile request is a row of 1.8, which can see one)

### A5 — MAJOR — the journey's warm-cache leg cannot run as written

Evidence: 5.2 asks for "the warm-cache latch by delaying the interior response on a client-side return from the galaxy route, requiring no unfiltered read before it answers". The interior query has no `staleTime` of its own (`hooks/use-system-space.ts:20-26`), so the app-wide 60 s applies, and the view re-reads it every 20 s while open (`SystemSpaceView.tsx:618-622`). On a client-side return the entry is at most 20 s old plus the time spent away, so no interior request is issued until the player has been away more than 40 s. The per-test timeout is 60 s (`playwright.config.ts:87`) and may not be raised (`docs/testing-tiers.md`). As written the leg either waits on a request that never comes or passes vacuously.

Paste-ready, 5.2, replace that clause (from "the warm-cache latch by delaying" to "(tier 1 holds it)") with:

> the warm-cache latch is tier 1's (1.13, 1.14): on a client-side return from the galaxy route the journey logs whether an interior request was issued at all (none is inside the interior's 60 s stale time, which the view's own 20 s poll keeps fresh) and only if one was requires that no unfiltered read preceded its response; otherwise UNTESTED, never failed, and no wait is added to age the entry

Also add to 5.2, at no cost in tasks, the two observers tier 1 lacks (A13): `after the "Console" control is pressed with a body selected the selection is unchanged; and one Escape with focus on a real camera control collapses the dock and leaves focus on that control`.

### A6 — MINOR — recount: 1.11 is two arrangement groups; cut its control row

See the recount below. 1.11's "control row in which that running-status read fails issues no pile re-read" needs a second run with a different stub and closes on a different claim. It also tests a guard this change does not build (`SystemSpaceView.tsx:433`) and that no scenario in the delta or in `sighting-log` states; the existing file does not hold it for the ghost feed either (the failed-read test at `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:565-598` makes no assertion about follower reads at all).

Paste-ready, 1.11, delete ", and a control row in which that running-status read fails issues no pile re-read" and append:

> ; the callback sits inside the existing guard at the early-settle exit, which this change does not move and does not test

### A7 — MINOR — three boxes are green on arrival and do not say so

Section 1's header requires a box that is green on arrival to say so.

- **1.6**: the two retries are already independent with the dock expanded (the log mounts on show and has its own observer). Append: `; green on arrival, recorded as the control for 1.5`.
- **2.3**: `ConsoleDock.tsx:90-93` already leaves focus alone when it is outside the region. Append: `; green on arrival (the shell already decides this), it guards 4.3 against a second collapse path`.
- **2.4**: only the "Escape with the dock expanded" row is red; the other three are controls. Append: `; only the first row is red before 4.3`.

Section 2's header says "the SDET writes the red tests (2.1-2.6)"; replace with `the SDET writes the tests (2.1-2.6), red where the box says so`.

### A8 — MINOR — the MODIFIED sentence widens a window in which a carried scenario is false

Evidence: carried scenario *A settled sweep's report link expands a collapsed dock to the Log tab* ends "…with the Log tab selected and the log shown" and has no GIVEN about the interior read. While the latch is closed the panel shows the waiting indication. That was already so during a cold first load; the MODIFIED gate sentence extends it to the re-read on a warm return, when a settled report can be on screen from the cached inbox. The heading cannot change; the body can, as the writer did for scenario 1.

Paste-ready, that scenario's GIVEN:

> - **GIVEN** the interior read the view opened with has finished, a settled sweep's report is shown and the dock is collapsed

### A9 — MINOR — *Activating the Dock Changes No Space-View Selection*: "any part of the dock" takes in the strip, and the sentence is false at 2b-iii

Evidence: `system-console/spec.md:1173` makes the strip's row part of the dock, and the strip's chevron changes the acting fleet (`system-console/spec.md:94`). The enumeration after the dash excludes the strip only by implication. Separately, "the panel and the controls inside it … SHALL NOT change the acting fleet" stops being true when 2b-iii puts the roster in the dock.

Paste-ready, first sentence:

> Activating the "Console" control, the tab bar, a tab, the collapse control, or the panel and the controls inside it — every part of the dock other than the strip's row, which *Activating the Strip Changes No Space-View Selection* covers — by pointer or keyboard SHALL NOT change the space view's current body, lane-gate or point selection, SHALL NOT change the acting fleet, and SHALL NOT be treated as a space-view click, regardless of what the canvas draws beneath it.

And for 5.9: `carry to 2b-iii's author that the roster's row selection changes the acting fleet from inside the panel, so that link MODIFIES this sentence`.

### A10 — MINOR — the mounted-content requirement's body keeps the selected row unconditionally; only its scenarios hold the scene fixed

Evidence: "the row the player selected and the statement that row carries … are as the collapse left them". A highlight is decided from what the scene drew (`SightingLog.tsx:137-141`, `:196`), and this change's own settle callback refetches the ghost feed while the dock is collapsed (design.md D-4). RULING 9 put the fixed-scene condition in the two scenarios' GIVENs; the sentence above them lacks it.

Paste-ready, insert after "…or as a read that finished while the dock was collapsed left them.":

> Whether a row is highlighted still follows what the scene draws (*A Log Row and Its Ghost Address the Same Record By Its Served Id*), so a highlight is kept only while its ghost is still drawn.

### A11 — MINOR — the proposal names the wrong suite as the one that would notice the reconcile cost

Evidence: proposal.md "Costs said out loud": "the `SystemSpaceView.render-loop` suite is what would notice". That suite counts `Profiler` commits (`SystemSpaceView.render-loop.test.tsx:244-257`, `:292`) with an empty pile; it cannot see per-row render cost. It could see an extra commit from the log's unmocked read, which is 3.2's concern. The view renders at least once a second (`SystemSpaceView.tsx:486`), so the cost is every loaded row once a second under `display: none`.

Paste-ready, that bullet:

> - **A permanently present log re-renders every loaded row whenever the view renders (at least once a second) under `display: none`.** Unmeasured, and no suite would notice it: `SystemSpaceView.render-loop` counts commits, not cost. The remedy if it is ever measured is in design.md Risks.

### A12 — MINOR — task 4.3 builds a composition guard no scenario states (needs a ruling)

Evidence: 4.3 "ignoring … a keydown during composition"; the delta says Escape collapses the dock "anywhere in the system space view". The view's only fields are `type="number"` (`components/space/FleetActionsPanel.tsx:366-369`, `:467-470`, `:503-506`), so the case is unreachable in this view today. design.md Open Questions carries the recommendation: keep the guard and say so.

Paste-ready if kept, delta, after the "One press of Escape SHALL do one thing…" sentence:

> An Escape keydown that belongs to an input method's composition SHALL NOT collapse the dock.

with one more step in 2.5's run (`a keydown with \`isComposing: true\` leaves the dock expanded`) and no new box. Paste-ready if not kept: delete "and a keydown during composition" from 4.3.

### A13 — MINOR — tier-1 stand-ins the tasks should name

- 2.2's "camera control": the view-level harness mocks the stage, so no camera control exists there; the row uses the stage mock's button (any focusable outside the dock's region exercises the same test, `ConsoleDock.tsx:91`). Say so in the box. A5's journey addition gives it one real observer.
- 2.2's "text field holding a typed value": the fields are `Input type="number"` and render only for a docked fleet with the sell, refuel or mine form shown. The row needs that fixture; say so. The delta's scenario title and GIVEN say "text field"; "a field holding a typed value" is accurate (wording only, no ruling touched).
- 2.2 carries five scenarios across at least four fixtures under one closing assertion. It counts as one group only if every row closes on the same three checks (collapsed; `document.activeElement` unchanged; that element's `value` unchanged). It is the first box an adversary will split.

### A14 — MINOR — requirement and design hygiene, no change asked

- "(The gloss: the content stays mounted.)" and the requirement's title name the mechanism. Accepted: the chain doc and RULING 1 bind the names, and the body leads with the observable.
- The capability boundary is sound: all five blocks are `system-console`'s; `sighting-log` and `system-space-view` take no delta and I found no sentence of either that this change falsifies beyond what RULINGs 4, 10 and 12 already file.
- tasks.md 4.3 and the proposal call the focus rule a build ("the focus guard"). It exists (`ConsoleDock.tsx:82-93`); the build is the listener and routing it through `handleCollapse` (design.md D-6).

### A15 — MINOR — one more gap to file at 5.10, and two notes for 5.9

- 5.10, add: `a paused first pile read (offline) renders the log's empty state, because \`SightingLog.tsx:183-188\` tests \`isLoading\`, which is false for a paused pending query; pre-existing, newly reachable at view open`.
- 5.9, add: the A9 note for 2b-iii; and `carry to 2b-ii's and link 4's authors that the dock yields Escape to any handler that prevents its default, wider than the requirement's "the fleet cell's open menu" (design.md Open Questions)`.

## Recount (RULING 13)

Unit, as the predecessor's A1 applied it: one task is one test arrangement group with one closing assertion. Rows share a task when they close on the same assertion, whatever their fixtures (the predecessor's "three failure states (parametrised)" was one). A sequence run forward through one arrangement, with checkpoints and one final assertion, is one. A row that needs its own run and closes on a different claim is its own group.

| Box | Writer | Mine | Why, where it differs or is close |
| --- | --- | --- | --- |
| 1.1 | 1 | 1 | three rows, one closing assertion |
| 1.2, 1.3 | 2 | 2 | split by RULING 9 |
| 1.4 | 1 | 1 | one arrangement run forward; the re-expansion step is a checkpoint already held by the existing dock file |
| 1.5-1.7 | 3 | 3 | |
| 1.8 | 1 | 1 | stays one with A4's two added rows: same closing assertion |
| 1.9, 1.10 | 2 | 2 | |
| **1.11** | 1 | **2** | the failed-read control needs a second run and closes on "no re-read", a different claim |
| 1.12 | 1 | 1 | mirrors the file's one existing test for the unfiltered argument |
| 1.13 | 1 | 1 | one run forward: in flight, finished, re-read again |
| 1.14 | 1 | 1 | four rows, one closing assertion |
| 2.1 | 1 | 1 | |
| 2.2 | 1 | 1 | eight rows, one closing assertion if written as A13 says; the weakest "one" in the file |
| 2.3 | 1 | 1 | |
| 2.4 | 1 | 1 | rows are acts; the closing assertion is the same claim |
| 2.5 | 1 | 1 | one run forward: press (menu closes), auto-repeat (dock still expanded), second press (collapsed); a build without the repeat guard fails at the second step |
| 2.6 | 1 | 1 | |
| 3.1-3.6 | 6 | 6 | one per file, plus the family run |
| 4.1-4.3 | 3 | 3 | |
| 5.1-5.10 | 10 | 10 | |
| **Total** | **39** | **40** | |

**As written: 40.** One box is more than one group: 1.11. **With A6's cut: 39.**

Plainly: the change fits. It is at the cap as written and one under it with the cut. None of my findings adds a group (A4 and A12 add rows or steps to existing groups; A1, A5, A7, A13 are rewording). There is no headroom for an adversary addition that is a new arrangement group; if one arrives after the cut, the count is 40, and a second one is the Escape seam (2.1-2.5 and 4.3 to 2b-ii, by a further ruling). As a sanity check on the unit: this change has 30 new scenarios across 20 test groups; the predecessor archived 49 across 21.

## Work order for kickoff

No cross-boundary contract: no wire change, no new testid (the tests bind to `console-dock*`, `console-tab-log`, `console-panel-log`, `console-panel-waiting`, `sighting-log*`, all existing).

1. SDET: section 1 (new real-hook file; 1.12 and 1.13 in the mount-ordering file) and section 2, reds seen for their stated reasons; 3.1.
2. Developer: 4.1 (`SystemSpaceView.tsx` only). Orchestrator: 3.2 before anything else is edited.
3. Developer: 4.2 (`SystemSpaceView.tsx`) and 4.3 (`ConsoleDock.tsx`). They share no file and no test; either order.
4. SDET: 3.3-3.6, then 5.2 once every box above is ticked.

STATUS: COMPLETE
