# `keep-console-tab-content-mounted` (2b-i-b) — draft input for the future author

**Unreviewed draft. This file carries no verdict.** It is not a spec, not a
panel finding and not a ruling. It preserves, for whoever authors link 2b-i-b
(`keep-console-tab-content-mounted`, `not authored`; RULING 15 of
`add-console-dock-rulings.md`), the text that was cut from `add-console-dock`
when that change was split again at placement against lifetime, plus the
paste-ready text of every panel finding the dispositions
(`add-console-dock-panel-dispositions.md`) sent to this link. Every block
below is copied verbatim from its source; the source named above each block is
the text of record, and anything here that disagrees with it is a copying
error. The author must re-review all of it against the tree as it stands when
2b-i-b is authored (2b-i will have archived by then).

Design decisions that move to this link unchanged, in
`openspec/changes/add-console-dock/design.md`: D-1 (content lifetime under the
`hidden` attribute; 2b-i builds the attribute only for the shell's own region),
D-2, D-7, D-8, D-11, D-16, D-20. That file's scope section says so.

Findings deferred here, by id: A3, A5, A7 (latch half), A8 item 3, A9 (timing
half), A10, U1, U2 (Escape scenario), U4 (row brought into view); plus two
items that follow their requirements here — A6's "Collapsing with focus on the
strip's chevron" scenario (it needs Escape to arrange), the M1 clause below, and A8 item 5's
pointer-press journey leg (it belongs to *Activating the Dock Changes No
Space-View Selection*).

---

## Part 1 — the four requirements that moved, as first authored (delta text of `add-console-dock` before the split)

Source: `openspec/changes/add-console-dock/specs/system-console/spec.md` as
first authored (9 ADDED, 52 scenarios). Their text assumed the log is mounted
with the dock; review findings A5, A6, A7, U1, U2, U4 amend them (Part 2).

### Requirement: A Tab's Content Stays Mounted While It Is Not Shown

The content of a tab that is not shown — as of this change, the Log tab's content while the dock is collapsed — SHALL stay mounted and SHALL be hidden from sight, from the keyboard tab order and from assistive technology. Collapsing the dock SHALL NOT discard the content's state. While its tab is selected and the dock is expanded, the content SHALL be shown, focusable and exposed to assistive technology.

#### Scenario: Pages loaded with load-more survive a collapse and re-expand
- **GIVEN** the log has loaded a first page and a second page by load-more
- **WHEN** the dock is collapsed and then expanded
- **THEN** the rows of both pages are listed
- **AND** no pile request was issued by the collapse or the expansion

#### Scenario: A row's highlight and its no-mark statement survive a collapse and re-expand
- **GIVEN** one row is selected whose record has no ghost drawn, so the log states that it has no mark in the open system
- **WHEN** the dock is collapsed and then expanded
- **THEN** the same row is still selected and the statement is still shown

#### Scenario: Nothing of the log is reachable while the dock is collapsed
- **GIVEN** the log has loaded rows and the dock is collapsed
- **WHEN** the keyboard tab order is walked from the strip's chevron to the end of the view
- **THEN** no element of the log receives focus
- **AND** no element of the log is exposed to assistive technology

#### Scenario: A pile read that answers while the dock is collapsed is shown on re-expand
- **GIVEN** the dock is collapsed and a pile read answers with a record the log had not listed
- **WHEN** the dock is expanded
- **THEN** the log lists that record
- **AND** no further pile request was issued by the expansion

#### Scenario: The log is shown and exposed while its tab is selected
- **WHEN** the dock is expanded with the Log tab selected
- **THEN** the log's rows are visible, focusable and exposed to assistive technology

### Requirement: Showing or Hiding the Log Tab Issues No Read

Showing, hiding and re-showing the Log tab SHALL issue no network request. The log's reads are those *The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer* names and no others: because the log is mounted with the dock, its first pile read is issued when the log mounts, whether or not the dock is ever expanded, and a record minted after that read reaches the log on a settled sweep's re-read or on explicit refresh and not on re-expansion.

#### Scenario: The log's first read is issued without the dock being expanded
- **GIVEN** the view has opened and the interior read's first load has finished
- **WHEN** the dock is never expanded
- **THEN** the log's first pile read is issued

#### Scenario: Expanding and re-expanding after the first read issues no request
- **GIVEN** the log's first pile read has been answered
- **WHEN** the dock is expanded, collapsed and expanded again
- **THEN** no network request is issued by any of the three actions

#### Scenario: A record filed since the last read is not listed on re-expansion
- **GIVEN** the log has listed a pile and the server's pile has since gained a record, with no sweep settled in the view
- **WHEN** the dock is collapsed and then expanded
- **THEN** the log does not list the new record

#### Scenario: A record filed since the last read is listed after an explicit refresh
- **GIVEN** the log has listed a pile and the server's pile has since gained a record, with no sweep settled in the view
- **WHEN** the dock is expanded and the player invokes the log's refresh affordance
- **THEN** the log lists the new record

### Requirement: Escape Collapses the Expanded Dock

WHEN Escape is pressed while the dock is expanded, anywhere in the system space view, the dock SHALL collapse, unless the fleet cell's menu is open, in which case the menu takes the key first (*The Fleet Cell's Chevron and Menu Are Keyboard-Operable*) and the dock SHALL NOT collapse. Pressing Escape SHALL change no space-view selection and no acting fleet and SHALL issue no request. While the dock is collapsed, Escape SHALL change nothing in the dock.

#### Scenario: Escape with focus inside the dock collapses it
- **GIVEN** the dock is expanded with keyboard focus inside it
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed

#### Scenario: Escape with focus on the canvas region collapses it
- **GIVEN** the dock is expanded with keyboard focus on a camera control
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed

#### Scenario: Escape with the dock collapsed changes nothing
- **GIVEN** the dock is collapsed and a body is selected
- **WHEN** Escape is pressed
- **THEN** the dock is still collapsed and the same body is still selected

#### Scenario: Escape collapsing the dock clears no selection
- **GIVEN** the dock is expanded and a body is selected and a fleet is acting
- **WHEN** Escape is pressed
- **THEN** the dock collapses, the same body is still selected and the same fleet is still acting
- **AND** no network request is issued

#### Scenario: Escape with the fleet cell's menu open closes the menu and leaves the dock expanded
- **GIVEN** the dock is expanded and the fleet cell's menu is open
- **WHEN** Escape is pressed
- **THEN** the menu closes with focus on the chevron
- **AND** the dock is still expanded

### Requirement: Activating the Dock Changes No Space-View Selection

Activating any part of the dock — the "Console" control, the tab bar, a tab, the collapse control or the panel — by pointer or keyboard SHALL NOT change the space view's current body, lane-gate or point selection, SHALL NOT change the acting fleet, and SHALL NOT be treated as a space-view click, regardless of what the canvas draws beneath it.

#### Scenario: A pointer press on any part of the dock leaves the selection unchanged
- **GIVEN** a body is selected and a fleet is acting
- **WHEN** the "Console" control is pressed, and with the dock expanded the tab bar, the Log tab, the panel and the collapse control are each pressed in turn
- **THEN** after each press the same body is selected and the same fleet is acting
- **AND** the canvas has received no pick from any of them

#### Scenario: Expanding and collapsing the dock leaves the acting fleet unchanged
- **GIVEN** a fleet is acting
- **WHEN** the dock is expanded and collapsed with the pointer and with the keyboard
- **THEN** the same fleet is acting after each

### Scenario text cut from kept requirements because it uses Escape or a collapse-survival premise

From *The Dock Is Keyboard-Operable* as first authored:

#### Scenario: Collapsing with Escape moves focus from inside the dock to the Console control
- **GIVEN** the dock is expanded with keyboard focus on the Log tab
- **WHEN** Escape is pressed
- **THEN** keyboard focus is on the "Console" control

(U7 dropped "A record filed since the last read is not listed on re-expansion"
from *Showing or Hiding the Log Tab Issues No Read*; the requirement above
still carries it, as first authored. The dispositions say it moves here
WITHOUT that scenario.)

### Test and build tasks as first authored that belong to this link

Source: `openspec/changes/add-console-dock/tasks.md` before the re-cut
(numbering is the old one).

- [ ] 1.4 SDET: test mounted-and-hidden with a stateful probe child that counts its own mounts and holds a typed value: across collapse and re-expand the probe mounted once and kept its value, the wrapper carries the `hidden` attribute while collapsed and not while expanded, the probe's button is absent from a default role query while collapsed and present while expanded (content: "Pages loaded with load-more survive a collapse and re-expand" (the mount half), "The log is shown and exposed while its tab is selected"); a conditional-render implementation fails the mount count and a `visibility` or `opacity` implementation fails the attribute

- [ ] 2.2 SDET: test Escape as one arrangement group on the real view: expanded with focus inside the dock collapses; expanded with focus on a camera control collapses; collapsed with a body selected changes nothing; expanded with a body selected and a fleet acting collapses the dock and leaves the selection, the acting fleet and the request count unchanged; expanded with the fleet cell's menu open closes the menu, puts focus on the chevron and leaves the dock expanded; and a second Escape then collapses it (content: "Escape with focus inside the dock collapses it", "Escape with focus on the canvas region collapses it", "Escape with the dock collapsed changes nothing", "Escape collapsing the dock clears no selection", "Escape with the fleet cell's menu open closes the menu and leaves the dock expanded", "Collapsing with Escape moves focus from inside the dock to the Console control"); the second-Escape row is the positive control that fails a build that swallows Escape in the menu forever

- [ ] 2.3 SDET: test that activating the dock is not a pick: with a body selected and a fleet acting, a pointer press on the "Console" control and, expanded, on the tab bar, the Log tab, the panel and the collapse control (parametrised) leaves the selection and the acting fleet unchanged and the stage mock's pick count at zero; expanding and collapsing by pointer and by keyboard leave the acting fleet unchanged (content: "A pointer press on any part of the dock leaves the selection unchanged", "Expanding and collapsing the dock leaves the acting fleet unchanged")

- [ ] 2.6 SDET: test the log's survival and its reads under collapse as one arrangement group, with the pile requests counted at the service boundary: after a second page by load-more, a collapse and re-expand list both pages and issue no pile request; a selected row's highlight and its no-mark statement survive a collapse and re-expand; a pile read answered while collapsed is listed on re-expand with no further request; a record added to the served pile after the first read is not listed on re-expansion and is listed after the log's refresh affordance; the first pile read is issued with the dock never expanded; expand, collapse and expand again issue no request (content: "Pages loaded with load-more survive a collapse and re-expand", "A row's highlight and its no-mark statement survive a collapse and re-expand", "A pile read that answers while the dock is collapsed is shown on re-expand", "Nothing of the log is reachable while the dock is collapsed" (the role-query half), "The log's first read is issued without the dock being expanded", "Expanding and re-expanding after the first read issues no request", "A record filed since the last read is not listed on re-expansion", "A record filed since the last read is listed after an explicit refresh"); owners named in the rows are `sighting-log`'s and are not restated

### Ownership note for the old 3.x tasks (not a task)

Source: `tasks.md` before the re-cut, the paragraph that preceded old tasks 3.1-3.3; it is prose, not a task, and is kept here as context for them.

Ownership: the SDET writes the red tests (3.1-3.3) and ticks them; the developer's build task 5.4 makes 3.1 and 3.2 green. These harnesses mock the service boundary and run the real `useSightings`, because the existing ordering tests mock the hook and count any call of it, which today observes the ghost feed and not the log (D5). 3.1 and 3.2 must be seen red against the unfixed tree before 5.4 is written. They make a live `sighting-log` scenario true and carry no delta (RULING 9).

- [ ] 3.1 SDET: test D1 on the ETA-scheduled exit: with the log mounted (dock collapsed, never expanded) and a running sweep whose scheduled settle refetch completes, the unfiltered pile (`queryKeys.sightings.pile(null)`) is read again after the settling interior read and the newly minted record is listed when the dock is then expanded (content: `sighting-log` *The log refetches after a sweep settles*, which has no delta here; "A pile read that answers while the dock is collapsed is shown on re-expand")

- [ ] 3.2 SDET: test D1 on the early-settle exit (the interior read that settles the sweep before its scheduled instant): the same read-after-the-settling-read and the same listed record (content: the same live scenario, the other exit)

- [ ] 3.3 SDET: migrate `SystemSpaceView.sighting-log-mount-ordering.test.tsx` by adding a log-specific arm that distinguishes the unfiltered pile from the system-filtered one: with the interior read in flight no unfiltered pile read is issued, and with a past-ETA unsettled sweep the log's first unfiltered pile read follows the settling interior read; the existing arm is kept and re-read (content: "The log is not mounted while the interior read's first load is in flight"; `sighting-log` *A mount during an unsettled past-ETA sweep reads the pile after the settling read*)

- [ ] 5.3 nextjs-dev: add the dock-wide Escape handler (collapse when expanded, defer to the fleet cell's open menu, change no selection) and the focus move to the "Console" control when the dock collapses with focus inside it, and the dock's non-pick activation, so 1.5, 2.2 and 2.3 pass

- [ ] 5.4 nextjs-dev: make the settle path read the unfiltered pile again on both exits (ETA-scheduled watcher and early-settle exit), sequenced after the settling interior read like its siblings, so 3.1 and 3.2 pass


---

## Part 2 — paste-ready text of the findings deferred here

Each block is copied from the reviewer's report named in its heading.

### A3 — MAJOR — tasks 3.2 and 5.4 misdescribe the early-settle exit, so the test would be arranged on the wrong trigger

Source: `docs/handoffs/add-console-dock-panel-architect.md`, lines 183-191.

Evidence: Job 2(c). `SystemSpaceView.tsx:390-431`: the exit is the commit window ending on a successful running-status read that carries nothing running; no interior read is involved. The existing arrangement of it is `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:663-760` (commit, second `mockListRunning` answer carrying nothing).

Paste-ready, tasks.md:

- `- [ ] 3.2 SDET: test D1 on the early-settle exit, arranged as \`SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx\` arranges it (a scan commit accepted, then the acting fleet's running-status read answering successfully with no running sweep, so no ETA is ever learned and no watcher timer arms): the unfiltered pile is read again after that running-status read has answered and not before, and the newly minted record is listed when the dock is then expanded; a control row in which that read fails issues no pile re-read (content: the same live scenario, the other exit)`
- `- [ ] 5.4 nextjs-dev: make the settle path read the unfiltered pile again on both exits through one stable callback that calls the existing ghost-feed refetch and then invalidates \`queryKeys.sightings.pile(null)\` (design.md D-11): as the watcher's \`onSettled\`, which already runs after the settling interior read has resolved, and at the early-settle exit, which runs when the running-status read reports no running sweep; \`SightingLog.tsx\` is not edited for this; so 3.1 and 3.2 pass`
- Section 3 header, replace "3.1 and 3.2 must be seen red against the unfixed tree before 5.4 is written" with: `3.1 and 3.2 are judged red only once 5.1, 5.2 and 5.5 are in (before that they are red for want of a dock, which proves nothing); they must then be seen red for the reason "the unfiltered pile was not read again" before 5.4 is written.`

### A5 — MINOR — the Escape requirement's menu clause is wider than the mechanism can deliver

Source: `docs/handoffs/add-console-dock-panel-architect.md`, lines 211-221.

Evidence: `VitalsStripFleetCell.tsx:91-114` — the menu handles Escape only in `onKeyDown` of the chevron and of an entry. A menu opened by pointer in a browser that does not focus a clicked button (Safari, Firefox on macOS), or left open while focus moves away, never sees the key; with design.md D-7 the dock then collapses and the menu stays open, against "unless the fleet cell's menu is open … the dock SHALL NOT collapse". Making the dock probe the strip's DOM instead turns Escape into a dead key in that state.

Paste-ready, spec delta, first sentence of *Escape Collapses the Expanded Dock*:

> WHEN Escape is pressed while the dock is expanded, anywhere in the system space view, the dock SHALL collapse, unless the fleet cell's open menu takes the key (*The Fleet Cell's Chevron and Menu Are Keyboard-Operable*: keyboard focus on the chevron or on one of the menu's entries), in which case the dock SHALL NOT collapse.

and the scenario's GIVEN: `- **GIVEN** the dock is expanded and the fleet cell's menu is open with keyboard focus on one of its entries`.

To file, not fix (it predates this change): against live *The Fleet Cell's Chevron and Menu Are Keyboard-Operable*, scenario "Escape closes the menu without choosing" — the menu does not close on Escape when focus has left it. Suggested record: `docs/handoffs/drift-fleet-menu-ignores-escape-when-unfocused.md`.

### A6 — the Escape-only scenario cut from 2b-i (`docs/handoffs/add-console-dock-panel-architect.md`, line 231)

Scenarios: adopt U2's three as written; add `#### Scenario: Collapsing with focus on the strip's chevron leaves focus there` / `- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron and its menu closed` / `- **WHEN** Escape is pressed` / `- **THEN** the dock is collapsed and keyboard focus is still on the chevron`.

### A7 — MAJOR — the mount gate as the delta and task 5.2 state it is too weak at the new mount site, and one scenario's GIVEN is false on a warm cache

Source: `docs/handoffs/add-console-dock-panel-architect.md`, lines 233-248 (the latch half). 2b-i keeps the observable wording and today's gate; the latch, the warm-cache arm and the "first read without expansion" GIVEN are this link's.

Evidence: Job 2(d); and the security reviewer's closing observation, which I confirm: `useSightings(null)` runs under the app-wide 60 s `staleTime` (`lib/query-client.ts:78`) and the `QueryClient` outlives a client-side navigation, so on a view opened within 60 s of the last unfiltered pile read the log mounts and issues nothing. That is true today of opening the log; it makes "THEN the log's first pile read is issued" false as written.

Paste-ready, spec delta:

- *The Log Tab Is the Sighting Log's Home on This View*, replace "The view SHALL NOT mount the log's content while the interior read's first load is in flight." with: `The log SHALL NOT issue its first pile read, and the panel SHALL show no log content, until the interior read the view opened with — its first load, or the re-read of an interior it already held — has answered or failed; until then the Log tab's panel SHALL show a waiting indication that is not the log's own loading state.`
- Rename and widen the scenario: `#### Scenario: The log reads nothing until the interior read the view opened with has finished` / `- **GIVEN** the view has opened and the interior read it opened with has not finished, on a first load and again on a return to a system whose interior is being re-read` / `- **WHEN** the view renders, with the dock collapsed and then with it expanded` / `- **THEN** no read of the unfiltered pile is issued and no log content is present in either state`.
- Adopt U3's two scenarios (the waiting indication; replaced by the log once that read has answered or failed).
- *Showing or Hiding the Log Tab Issues No Read*, scenario "The log's first read is issued without the dock being expanded": `- **GIVEN** the view has opened with no pile read answered earlier in the session, and the interior read it opened with has finished`.
- In the same requirement's prose, "because the log is mounted with the dock, its first pile read is issued when the log mounts, whether or not the dock is ever expanded" is mechanism; the behaviour is: `the log's first pile read is issued when the view opens, once the interior read it opened with has finished and whether or not the dock is ever expanded,`.

Paste-ready, tasks.md:

- 5.2, replace "carry the mount gate (`!interior.isLoading`) onto the Log tab's content so the content mounts with the dock once the interior's first load finishes" with: `mount the Log tab's content at the first render of this mount of the view in which no interior read is in flight (\`!interior.isLoading && !interior.isFetching\`) and keep it mounted from then on — a latch, never a live condition, because the view re-reads the interior every 20 s (design.md D-16) — with the panel showing the waiting indication until then`.
- 3.3, append: `; and a warm-cache arm: with the interior already held and its re-read in flight at mount (\`isLoading: false, isFetching: true\`) no unfiltered pile read is issued, it is issued once that re-read finishes, and a later interior re-read (\`isFetching: true\` again) neither unmounts the log nor issues a pile read`.

### A8 item 3 — request counts need the real hook (`docs/handoffs/add-console-dock-panel-architect.md`, line 254)

3. **2.6 counts pile requests "at the service boundary" inside a section whose harness mocks the sightings hook.** The rows that count requests or need a second page need the real `useSightings` over a mocked `sightingService` and belong in section 3's harness. Paste-ready: move 2.6 to section 3 as 3.4 and split it per A1's table.

### A8 item 5 — the pointer-press journey leg (`docs/handoffs/add-console-dock-panel-architect.md`, line 256)

Follows *Activating the Dock Changes No Space-View Selection*.

5. **2.3 is close to vacuous at tier 1.** With the stage a mocked sibling, a click on the dock cannot reach it whatever the build does. The failure this requirement guards is a pointer press falling through a `pointer-events-none` wrapper to the canvas, which only a browser shows. Keep 2.3 for the keyboard and state rows; add to 6.2: `with a body selected, a pointer press on the tab bar's empty area and on the panel's empty area leaves the selection unchanged`.

### A9 — MAJOR — mount timing (Job 5): what changes, where, and whether tasks.md covers it

Source: `docs/handoffs/add-console-dock-panel-architect.md`, lines 260-287. 2b-i keeps the selector/opener migrations. This link takes: the fizzle spec's
refresh-before-count (the 4.4 replacement below), scan-journey step 5 without a
re-open, the vitals intercept note (4.5 append below), and task 4.7's hook half
(the 58-test family run, each now running a second unmocked read).

What changes timing: (i) the log mounts with the view instead of on open, so one more `GET /v1/sightings` (no `systemId`) is issued at every view open and the log's DOM exists, hidden, from then on; (ii) opening the log is no longer a read. Nothing else moves in time; the camera cluster, the sightings card, the column and `FloatingNav` move in space only.

| File | Lines | What the precondition was | What it is now | In tasks.md? |
| --- | --- | --- | --- | --- |
| `e2e/tests/scan-lane-transit-fizzle.spec.ts` | 296-299 | opening the log read the pile, so `rows toHaveCount(0)` proved the server pile empty after the fizzle | the log was read at view open, before the sweep settled; zero rows passes on a cache that predates the fizzle and proves nothing | **No.** 4.4 only swaps the opener |
| `e2e/tests/scan-journey.spec.ts` | 124-131 | the report's link mounted the log, hence a fresh read | the row is there only if the settle re-read ran (the end-to-end form of D1) | Yes (4.3) |
| same | 150-155, 219 | toggle closes; toggle visible means the scan surface survived a reload | collapse control; `console-dock-open` visible | Yes (4.3), but it says "six uses of the toggle"; there are four (`:150`, `:219`, `:252`, `:293`) plus the report link at `:124` |
| same | 249-256, 271-299 | after `page.goto`/`reload`, open and find the seeded row | unchanged in effect (a hard navigation gives a cold cache, so the mount read sees the seed) | Yes (4.3) |
| same | 301-302 | `ghost.click()` with the floating log open beside the column | the dock is expanded and covers the canvas's lowest 220 px; the seeded ghost at `{X: 8, Z: 4}` is near the star and probably clear, but the click must not depend on it | **Partly.** 4.3 should say: collapse the dock before `ghost.click()`, then re-expand and read the row's `data-highlighted` (which is also this change's own scenario "The row for an activated ghost is highlighted when the tab is next shown") |
| `e2e/tests/vitals-strip-journey.spec.ts` | 458-460 | the `**/v1/sightings**` route failed one read (the ghost feed) | it fails two; the log sits in its failed state, hidden. The leg's assertions are scoped to `sightings-unavailable` and still hold | Not mentioned; no edit needed, but 4.5 should record it so a second "Retry" in the DOM is not read as a regression |
| same; `burn-cost-overlay-journey.spec.ts` | 479-495; 1022-1034 | column 632 px tall, cluster at 72 px | column 564 px tall and cluster at 100 px with the dock collapsed (these legs never expand it) | Yes (4.5, 4.6) |
| `e2e/helpers/scan-fixtures.ts` | 250-253 | comment explains a hang by "the sighting-log drawer open over `scan-control`" | stale comment | No; fold into 4.3 |
| `components/space/SystemSpaceView.test.tsx` (52 tests), `SystemSpaceView.render-loop.test.tsx` (6) | whole file | neither mocks `@/hooks/use-sightings`; today one real `useSightings(systemId)` runs and fails or hangs harmlessly | a second real read runs in every test, and its failed state (a "Retry" button, "The sighting pile could not be read.") is in the DOM under the hidden region. I found no text or role query in either file that it collides with | **No.** Covered only by the gate. Add a task |
| `SystemSpaceView.sighting-log-mount-ordering.test.tsx` | 181-213 | counts any `useSightings` call | the same count now also sees the log's call once the latch opens; the existing arm stays green | Yes (3.3) |
| `SystemSpaceView.scan-refetch.test.tsx`, `…scan-targets-refetch-on-arrival.test.tsx`, `…scan-settle-announcement`, `…burn-preview`, `…stranding-notice` | their `vi.mock('@/hooks/use-sightings')` | one consumer of the mock | two consumers; the mocks return `{ data: { pages: [{ sightings: [], nextCursor: '' }] }, … }`, which `SightingLog` renders as its empty state, hidden. No assertion in them counts hook calls except the mount-ordering file | No edit needed; same new task |
| `SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx` | 206 | clicks the toggle | opens the dock | Yes (4.1) |

Paste-ready, tasks.md:

- 4.4, replace with: `SDET: migrate \`frontend/e2e/tests/scan-lane-transit-fizzle.spec.ts\`: open the dock through the "Console" control, then invoke the log's refresh affordance and wait for the unfiltered \`/v1/sightings\` response before asserting zero rows — the log now reads at view open, so an unrefreshed count would pass on a pile read before the sweep settled`
- 4.3, append: `; the cross-highlight test collapses the dock before clicking the ghost and re-expands to read the row's \`data-highlighted\`; the stale "drawer open over \`scan-control\`" comment in \`e2e/helpers/scan-fixtures.ts\` is corrected` and change "six uses" to "four uses".
- 4.5, append: `; note in the spec's header that its \`**/v1/sightings**\` intercept now fails the log's read as well as the ghost feed's and that the log's hidden failed state is expected`.
- New `- [ ] 4.7 SDET: after 5.2, run the whole \`SystemSpaceView*.test.tsx\` family and \`SpaceStage*.test.tsx\` and attribute every red to its cause before any is edited: each of the 58 tests in \`SystemSpaceView.test.tsx\` and \`SystemSpaceView.render-loop.test.tsx\` now runs a second, unmocked \`useSightings\` read, and each hook-mocking harness now feeds two consumers; none is expected to need an edit, and an edit is a finding for the orchestrator, not a silent fix`.
- 6.2, the galaxy leg: `the galaxy route is reached by the app's own "Galaxy" link from an expanded dock (a client-side navigation — a \`page.goto('/')\` reloads the document and cannot see a leaked height), and there the nav's foot is 72 CSS px above the viewport's foot`.

Under the A1 seam, the first three rows' changes and task 4.7's hook-related half move to the second change, where the timing actually changes.

### A10 — MINOR — the settle re-read joins an in-flight first read; the retry loop multiplies the re-read

Source: `docs/handoffs/add-console-dock-panel-architect.md`, lines 289-292.

- `query-core/build/modern/query.js:166-176`: a fetch requested while one is in flight cancels and restarts only when the query already has data; otherwise it returns the in-flight promise. If the log's first pile read (no data yet) is still in flight when a settle callback invalidates it, no new read is issued and the answer in flight, requested before the settle, is taken as fresh. Reachable only when a pile read outlasts a commit round trip plus a running-status read (early settle just after the view opens) or the 400 ms cushion plus an interior read (a return inside the interior's stale window). The ghost layer's `refetch()` has the identical property today. A cancel-then-invalidate would close it but reverts a data-less query to `pending`/`idle`, which `SightingLog` renders as its empty state for a moment (`SightingLog.tsx:176-188` tests `isLoading`, not `isPending`) — a failed-is-not-empty violation traded for a rare stale read. Not taken; recorded in design.md Risks and to be filed with the two gaps the predecessor named.
- While a past-ETA sweep stays unsettled the watcher calls `onSettled` on every attempt (`SystemSpaceView.tsx:141-179`), so the log's pile is re-read every 20 s, every loaded page each time (the security report's `P` requests). Bounded and equal in kind to the ghost layer's; *The log does not poll while open* is conditioned on "no sweep running". No change asked.

### U1 — MAJOR — a pile-read failure while collapsed must survive to the expansion, and not read as empty

Source: `docs/handoffs/add-console-dock-panel-ux.md`, lines 15-32 (a failure while collapsed survives; retries are independent).

Attaches to: *A Tab's Content Stays Mounted While It Is Not Shown* (and *The Log Tab Is the Sighting Log's Home*).

Answer to the brief's question: while the dock is collapsed, nothing tells the player the log's own read failed. The `sightings-unavailable` card is the ghost feed's (system-filtered pile) and appears only when that read fails; a failure of the unfiltered read alone is silent. That is no worse than today (a closed log shows nothing), and I do not recommend a collapsed-state failure marker: it would be a new figure/affordance on a surface the chain keeps quiet. But the first read now happens at view open, so a failure is far more likely to be sitting there when the player first looks. The spec pins the failed state only for "dock expanded WHILE the read fails". Pin the other order, plus that the two retries are independent (consistent with *The Sweep Surface's Reads Fail Independently*).

```
#### Scenario: A pile read that failed while the dock was collapsed shows its failed state on expansion
- **GIVEN** the dock is collapsed and the log's pile read has failed
- **WHEN** the dock is expanded
- **THEN** the panel shows the log's failed state with its retry affordance, and neither its empty state nor its loading state
- **AND** no pile request was issued by the expansion

#### Scenario: The log's retry and the sightings-unavailable card's retry are independent
- **GIVEN** both the system-filtered pile read and the log's unfiltered pile read have failed and the dock is expanded
- **WHEN** the sightings-unavailable card's retry is activated and that read succeeds
- **THEN** the log still shows its failed state until its own retry or the explicit refresh succeeds
```

### U2 — Escape with focus outside the dock (`docs/handoffs/add-console-dock-panel-ux.md`, lines 51-55)

(U2's other two scenarios, focus on expand and the report link moving focus,
stay in `add-console-dock`.)

#### Scenario: Escape with focus outside the dock leaves focus where it was
- **GIVEN** the dock is expanded with keyboard focus on a camera control
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on that camera control

### U4 — MAJOR — the cross-highlight can land on a row the player cannot see

Source: `docs/handoffs/add-console-dock-panel-ux.md`, lines 77-95. The positive half (the ghost is highlighted while the dock is collapsed) stays
in `add-console-dock`. This link takes the second scenario below and
design.md D-20 (`shown` prop and `scrollIntoView`; architect report A12 row
U4).

Attaches to: *The Log Tab Is the Sighting Log's Home*, scenario "The row for an activated ghost is highlighted when the tab is next shown" (and the expanded-dock case).

The panel area is 128 px; a row is about four lines tall and the log carries its own title and refresh row, so at the 1280×720 floor roughly one to two rows are in view. A highlight on row 9 of a scrolling list is no feedback. `sighting-log` does not (and should not, by this change's own RULING 12) say "scrolled into view"; the dock owns the geometry that makes it necessary. Also RULING 10's scenario lacks the positive half.

```
#### Scenario: Activating a ghost while the dock is collapsed highlights the ghost and leaves the dock collapsed
- **GIVEN** the dock is collapsed and a ghost is drawn for a record whose row the log has loaded
- **WHEN** the ghost is activated in the scene
- **THEN** the ghost is highlighted in the scene and the dock is still collapsed

#### Scenario: The highlighted row is brought into view in the panel
- **GIVEN** the log has loaded more rows than the panel area shows, at a 1280×720 CSS-pixel viewport, and a ghost was activated for a record whose row lies beyond the visible part of the panel
- **WHEN** the dock is expanded, and again when a different such ghost is activated while the dock is expanded
- **THEN** the highlighted row lies wholly inside the panel area without the player scrolling it
```

(Replaces the existing "Activating a ghost while the dock is collapsed leaves it collapsed" scenario, whose THEN is a subset.)

### A15 and RULING 15 carry (not findings of this link, for orientation)

The three unfiled gaps this link is to file (settle watcher's disarm race, the
ghost layer's warm-cache gate, the join-in-flight first read) are listed in the
chain doc by `add-console-dock`'s gate task. This link closes
`docs/handoffs/drift-sighting-log-not-reread-after-sweep-settles.md`.

### M1 — the "focus anywhere else" clause shed from `add-console-dock` (adversary round 1; `docs/handoffs/add-console-dock-adversary-r1.md`, ruling M1)

Amends RULING 18's delivery: the third clause of the focus rule is 2b-i-b's. The cap forced it (M10). `add-console-dock`'s *The Dock Is Keyboard-Operable* now says only that a collapse from the tab bar or the panel moves focus to the "Console" control.

Clause, to restore in *The Dock Is Keyboard-Operable* (the sentence about a collapse): `focus anywhere else, the strip's chevron included, SHALL NOT be moved by a collapse`.

Scenarios, both needed (the clause had none in `add-console-dock`; a build that always focuses "Console" on collapse passes without them):

#### Scenario: Collapsing with focus on the strip's chevron leaves focus there
- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron and its menu closed
- **WHEN** Escape is pressed
- **THEN** the dock is collapsed and keyboard focus is still on the chevron

(A6's scenario, repeated from above. It needs Escape.) And the adversary's arrangement that needs no Escape:

#### Scenario: Collapsing by a pointer press that moves no focus leaves focus on the chevron
- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron
- **WHEN** the collapse control is activated by a pointer press that does not move focus
- **THEN** the dock is collapsed and keyboard focus is still on the chevron

Arrangement note: Safari and Firefox on macOS do not focus a clicked button (design.md D-7), so this is a real state. In jsdom, `fireEvent.click` (not `user.click`) leaves `document.activeElement` alone. Task text to add to the focus group (the old 1.5): a row for the arrangement above, closing on `document.activeElement` being the chevron. Build side: `add-console-dock`'s 4.3 no longer carries "focus elsewhere being left alone"; this link's build box does.
