# add-console-dock — Phase-1 panel, architect

Reviewer: architect (replacement run, 2026-10-05; the first architect's run was cut off at 23:36 on 2026-10-04 after rewriting `design.md` and before writing this file).
Change: `openspec/changes/add-console-dock/` (9 ADDED / 52 scenarios / 38 tasks as drafted).
Method: the predecessor's `design.md` (D-1 to D-19) read whole and treated as a colleague's draft; each decision below is marked VERIFIED (I re-derived it from source), CORRECTED (design.md edited) or KEPT-UNVERIFIED (not re-derived, reason given).

This file is written incrementally. It is complete only if it ends with `STATUS: COMPLETE`.

## Job 2 — library claims, confirmed or refuted by evidence

Installed versions (read from `frontend/node_modules/*/package.json`): react / react-dom 19.2.3, @tanstack/react-query and query-core 5.90.11, tailwindcss 4.1.17, next 15.5.25, jsdom 26.1.0, @testing-library/user-event 14.6.1.

### 2(a) `<Activity mode="hidden">` drops mutate-level callbacks — CONFIRMED, by source and by execution. RULING 2 stands.

Source:
- `node_modules/react/cjs/react.development.js:795` exports `Activity`.
- React Query subscribes through `useSyncExternalStore` (`@tanstack/react-query/build/modern/useMutation.js:23`, `useBaseQuery.js:55`), and React implements that subscription as a passive effect: `mountSyncExternalStore` ends in `mountEffect(subscribeToStore.bind(…), [subscribe])` (`react-dom/cjs/react-dom-client.development.js:8109-8146`). A hidden Activity disconnects passive effects (`recursivelyTraverseDisconnectPassiveEffects`, `:16177`; `disconnectPassiveEffect`, `:16207`).
- `query-core/build/modern/mutationObserver.js`: `#notify` runs the mutate-level `onSuccess`/`onError`/`onSettled` only `if (this.#mutateOptions && this.hasListeners())`, and `onUnsubscribe()` calls `this.#currentMutation?.removeObserver(this)` when the last listener leaves — so the observer is not even told the mutation finished.

Execution (a throwaway node + jsdom script outside the repo, against the installed libraries; one component holding a `useMutation` and a `useInfiniteQuery` on `['sightings','pile','all']`; fire the mutation, hide, invalidate the pile key, resolve the mutation, show):

| | effect cleanups while hidden | pile reads issued by an invalidation while hidden | callbacks run when the response lands while hidden | `useMutation` status after re-show | pile reads caused by the re-show |
| --- | --- | --- | --- | --- | --- |
| `<Activity mode="hidden">` | 1 | 0 | hook-level `onSuccess` only | `pending` (stuck) | 1 |
| `hidden` attribute | 0 | 1 | hook-level `onSuccess`, mutate-level `onSuccess`, mutate-level `onSettled` | `success` | 0 |

So the analyst's reading was right and understated: under Activity the mutate-level callbacks never run, the hook reports `pending` forever after re-show, and (this piece's own concern) an invalidation of the log's pile while hidden issues no read and defers it to the re-show — a read on expand, which RULING 8 forbids. The `hidden` row is also the direct evidence for design.md D-8 and D-11: an invalidation by key reaches a mounted-and-hidden observer at once, and showing it again reads nothing.

### 2(b) Tailwind v4 preflight makes `[hidden]` win over `flex`/`grid` on the same element — CONFIRMED by source.

`frontend/app/globals.css:1` → `app/tailwind.css:1` `@import "tailwindcss"`; `node_modules/tailwindcss/index.css:1` declares `@layer theme, base, components, utilities;` and preflight (`preflight.css:390-392`, inlined in `index.css` inside `@layer base`, `:486`/`:890`) is

```css
[hidden]:where(:not([hidden='until-found'])) { display: none !important; }
```

An `!important` declaration in an earlier cascade layer beats every declaration in a later layer, important or not, so it wins over `flex`, `grid` and `!flex` (all in `utilities`) and over a non-important inline `style`. Two things defeat it and must not appear on a dock element: an inline `display: … !important`, and `hidden="until-found"`. I did not re-run the predecessor's Chromium measurement (no stack, no browser run in this review); the journey's one-line proof (task 6.2) stays as the tier-4 confirmation.

**Correction to the predecessor's D-1 (design.md edited): jsdom is not stylesheet-free for this attribute.** `node_modules/jsdom/lib/jsdom/browser/default-stylesheet.js:783` carries `[hidden] { display: none }`, and jsdom's `getComputedStyle` applies it. Consequences at tier 1, all usable by the SDET:
- `user.tab()` skips everything under a `hidden` wrapper (`user-event/dist/esm/utils/focus/getTabDestination.js` returns only an element for which `isVisible` holds; `utils/misc/isVisible.js` walks ancestors for computed `display: none`). So the keyboard half of "Nothing of the log is reachable while the dock is collapsed", "The dock's controls follow the strip's chevron in the tab order", and U5's "Tab from the Log tab continues into the panel" are **tier-1 testable as a real Tab walk**, not only as DOM order.
- jest-dom `toBeVisible` reads false under the wrapper.
- What tier 1 still cannot see is the app's stylesheet: a `flex` class cannot fight `[hidden]` in jsdom, so a build that hides with a class, or one that sets inline `display` with `!important`, is caught only by the journey line.

### 2(c) Analysis § 7 D1 — CONFIRMED. Fix shape: one stable callback, `refetchGhostFeed()` then an invalidation of `queryKeys.sightings.pile(null)`, at both call sites.

- The only uses of a sightings key outside tests are `hooks/use-sightings.ts:28` (the query itself) and the factory (`lib/query-keys.ts:103-104`). Nothing invalidates or refetches `['sightings','pile','all']`.
- Both settle exits call `refetchGhostFeed` and nothing else for the pile: `SystemSpaceView.tsx:145` (the watcher's `onSettled`, wired at `:830`) and `:426` (early settle). `refetchGhostFeed` reaches `SightingsGhostFeed`'s `useSightings(systemId).refetch` (`:225-237`, `:291-293`) — the system-filtered entry. `SightingLog.tsx:117` reads `useSightings(null)`.
- Shape (design.md D-11, kept): `const rereadPilesAfterSettle = useCallback(() => { refetchGhostFeed(); void qc.invalidateQueries({ queryKey: queryKeys.sightings.pile(null) }) }, [refetchGhostFeed, qc])`, passed as the watcher's `onSettled` and called at `:426`. It must be `useCallback`-stable: `onSettled` is in the watcher's timer-effect deps (`:203`). `SightingLog.tsx` is not edited. Keep `refetchGhostFeed`: `SystemSpaceView.scan-refetch.test.tsx:264,274` and `…scan-targets-refetch-on-arrival.test.tsx:757-759` assert that hook-mock's `refetch` spy and stay green unedited because an invalidation is a no-op under a mocked hook.
- The probe in 2(a) shows the mechanism works on a hidden-but-mounted observer: one read issued by the invalidation while hidden, none on re-show.
- **Sequencing, ETA-scheduled exit:** correct by position — `onSettled()` runs inside the `.then` of the settling `resyncInterior()` (`:142-145`).
- **Sequencing, early-settle exit:** tasks.md 3.2 and 5.4 describe it wrongly (finding A3). It is not triggered by an interior read. It fires on the `committedPending` true→false transition (`:419-431`) when the acting fleet's running-status read has succeeded carrying no running sweep (`:423`). An action leaves `running` only in its resolve transaction, which is also where records are minted, so "the running read reports nothing running" is itself the proof that the sweep is settled; the pile re-read issued there is ordered after the settle with no interior read involved.
- **One sequencing hole, shared with the ghost layer, not closed here (finding A10):** `Query.fetch` joins an in-flight fetch instead of restarting it when the query has no data yet (`query-core/build/modern/query.js:166-176`: cancel-and-restart only `if (this.state.data !== void 0 && fetchOptions?.cancelRefetch)`). So an invalidation that arrives while the log's *first* pile read is still in flight issues no new read.

### 2(d) The mount-ordering gate once the log mounts with the dock — today's gate is NOT sufficient at the new mount site; the predecessor's latch (design.md D-16) is right, with one residual case stated.

- Today's gate is `logOpen && !interior.isLoading` (`SystemSpaceView.tsx:910`). `isLoading` is `isPending && isFetching` (`queryObserver.js:310`), so it is false from the first render whenever the interior is still in the query cache (`gcTime` 5 min, `lib/query-client.ts:79`) — including the first render of a return to a system whose stale interior is being refetched (`queryObserver.js:248-252` gives the optimistic first result `fetchStatus: 'fetching'` with data present).
- That refetch is exactly "the space view's interior read that settles that sweep" for a sweep whose ETA passed while the player was on the galaxy view (`sighting-log` *The Log Reads on Mount…*, second paragraph). Today the log escapes it because a human opens the log later. Mounted with the dock, the log would issue its first pile read alongside that settling read on every such return, and RULING 8 means re-expanding never corrects it.
- **Kept:** the log's content mounts at the first render of this mount of the view in which no interior read is in flight (`!interior.isLoading && !interior.isFetching`), latched (the view polls the interior every `BOARD_POLL_MS` = 20 s, `lib/realtime.ts:27`; a live test would unmount the log on every poll). A failed first load opens the latch (not loading, not fetching), which is what U3 needs. Harness mocks of `useSystemSpace` that carry no `isFetching` are unaffected (`undefined` is falsy); the only `isFetching` in the space tests is `ScanControl.test.tsx`'s scan-targets mock.
- **Residual case, now written into D-16:** a return inside the interior's 60 s stale window issues no interior read at mount, so the latch is open at once and the log's first read (if its own entry is stale or absent) precedes the watcher's settling read, which fires `ETA_CUSHION_MS` (400 ms) later from the cached running-scan ETA. The outcome is still corrected by D-11's re-read (the entry has data by then, so the invalidation cancels and restarts), but the letter of "first pile read … only after" is not met in that sub-case. It is not met today either, and the ghost layer has the same exposure; it is filed with the other two pre-existing gaps, not fixed here.
- The existing test (`SystemSpaceView.sighting-log-mount-ordering.test.tsx:181-213`) stays green unedited (it counts any `useSightings` call while `isLoading: true`, which is zero under either gate). It still cannot tell the log's read from the ghost feed's, so task 3.3's log-specific arm is needed, plus one arm it does not have: the warm-cache row (A7).

## Job 3 — mechanism decisions (all in design.md; summary)

| Question | Decision | design.md | Status of the predecessor's draft |
| --- | --- | --- | --- |
| Single source of the dock's height | One module `frontend/lib/console-dock-layout.ts`: the property name `--console-dock-height`, the two values (`3.5rem`, `13.75rem`) and three complete lane class literals `bottom-[calc(var(--console-dock-height,3.5rem)+N)]` (`1rem` nav and sightings card, `2.75rem` camera cluster, `5.25rem` column). The dock publishes the property on `document.documentElement` in a layout effect and removes it in cleanup. No prop, no context, no route check. Unset → `4.5rem`, the galaxy nav's value today. | D-3 | VERIFIED in part: the four literals are exactly `floating-nav.tsx:33`, `SystemSpaceView.tsx:896`, `:932`, `SpaceStage.tsx:716`, and no test asserts any of them; the three class literals compile with the installed Tailwind to `bottom: calc(var(--console-dock-height,3.5rem) + 1rem)` etc. (compiled in a throwaway script). The predecessor's Chromium pixel measurements (72/100/140, 236/264/304) are KEPT-UNVERIFIED — arithmetic checks, no browser run here. |
| Where dock state lives; the "expand on this tab" entry point | `{ expanded, openSeq }` in the view's `useState`, replacing `logOpen`. One opener, `openDockOn(tab)`, used by the "Console" control and by `ScanControl`'s `onOpenLog`; open-only by construction. | D-4 | VERIFIED: `logOpen` is `:295`, `onOpenLog={() => setLogOpen(true)}` is `:990`; the view remounts per system (`next/dist/client/components/layout-router.js:398-411`, `create-router-cache-key.js`: a dynamic segment's key is `name|value|type`; `bfcache.js:13` keeps one entry unless `__NEXT_ROUTER_BF_CACHE`; `next.config.ts` sets no `experimental`). |
| DOM order vs the tab-order scenarios | Canvas layer, column, then the dock last; inside the dock: strip row, "Console", then the hidden-while-collapsed region (tab list with its one tab, the collapse control as the tab list's sibling, the panel). No positive `tabindex`. | D-17 | VERIFIED against today's order (`:838`, `:932`, `:1070`). |
| Focus on expand and on collapse | Every open request focuses the selected tab (including when already expanded). On collapse, if focus was inside the region being hidden, focus the "Console" control, decided before the state change. Otherwise focus is not moved. | D-18 | KEPT; agrees with U2. |
| Escape | A `keydown` listener on `document`, attached only while expanded, ignoring `defaultPrevented`. | D-7 | VERIFIED: the menu's handlers call `preventDefault()` on Escape (`VitalsStripFleetCell.tsx:96-98`, `:112-114`) and are the only Escape handlers under `components/space`, `hooks` or `lib`. |

## Job 4 — the two possibly shipped-false live sentences

### 4(a) `system-space-view` *A Settled Sweep and the Scan Controls Are Reachable and Announced*, scenario "The sweep can be commanded and cancelled from the keyboard alone" — NOT false after this change. No MODIFIED block.

Checkable argument. Within `system-space-view`, "the affordance that opens the sighting log" is introduced by *A Settled Sweep Reports Its Outcome…* ("A sweep that minted records SHALL be reported as having filed them, with an affordance that opens the sighting log", `openspec/specs/system-space-view/spec.md:2552-2553`, and its scenario at `:2615-2618`), and the requirement at issue lists it directly after "the report's dismiss affordance" (`:2928-2930`). That affordance is the button `ScanControl.tsx:345-353` renders inside `scan-report`. This change leaves `ScanControl` mounted where it is (`SystemSpaceView.tsx:986`, in the right column the scenario calls "the fleet panel") and changes only what its `onOpenLog` does. So a keyboard player tabbing through the column still reaches the target list, the commit control, the cancel affordance and that link, each a native `<button>`/`<select>` activatable with Enter or Space, in the same order as today. The control this change deletes is the standalone `sighting-log-open` toggle (`:996-1003`); no `system-space-view` requirement names it, and `sighting-log` *The Log Is Reachable From the System Space View Without Leaving It* ("an affordance that opens the sighting log") stays true through the "Console" control. The sibling sentence in *The Scan Surface Remains Usable While the Canvas Is Unavailable* ("The affordance that opens the sighting log SHALL likewise remain reachable", `:2849`, scenario `:2865-2867`) stays true by either reading: the report's link is unmoved, and the "Console" control is present and expandable while the canvas is unavailable (this delta's own scenario "The dock is present and expandable in the strip's failure states"). **2b-ii makes the keyboard scenario false** (the scan control leaves "the fleet panel") and must MODIFY it; carry that into the 2b-ii chain section at task 6.9.

### 4(b) `system-console` *The Vitals Strip Is Present on Every Render of the System Space View* — FALSE after this change in the expanded state. MODIFIED block required now (finding A2).

The live first sentence makes two positional claims (`openspec/specs/system-console/spec.md:18-20`). "The bottom-most always-visible band of the view's console region" stays true: the tab bar and panel are lower but not always visible (UX U9 reads this clause as false; it is not). "Across the foot of the system space view" does not: with the dock expanded the strip is the dock's top row and its lower edge is 164 CSS px above the view's foot, the foot being occupied by the Log panel — this change's own scenario measures the dock "from the top of the strip's row to the foot of the viewport" as 220. The requirement is quantified "on every render of that view", so the expanded render falsifies it. RULING 12 leaned no delta for Q9 but carries its own exception ("unless a reviewer shows a live sentence this change makes false"); this is that showing. The block is the requirement's full text with the first sentence reworded and **all six live scenarios verbatim** (copied by `sed -n '27,62p'` from the live spec and diffed clean): 6 scenarios. The delta becomes 9 ADDED + 1 MODIFIED.

```markdown
## MODIFIED Requirements

### Requirement: The Vitals Strip Is Present on Every Render of the System Space View

The system SHALL render a single full-width strip as the top row of the
console dock — across the foot of the system space view while the dock is
collapsed, and directly above the dock's tab bar while the dock is expanded;
in either state the bottom-most always-visible band of the view's console
region — on every render of that view, including while the interior
read has failed, while the own-fleets read has failed, and while the
renderer is unavailable. A cell whose served input is unavailable SHALL
render `figure-formatting`'s absent form for its figures rather than being
removed, so the strip's cell set is fixed and a player never has to work out
which instrument disappeared.

#### Scenario: The strip renders with every read resolved
- **WHEN** the view renders with interior, own-fleets, station, board,
  session and galaxy reads resolved
- **THEN** the strip is present with its fleet, fuel, hold, credits and
  clock cells

#### Scenario: The strip survives a failed interior read
- **WHEN** the interior read fails
- **THEN** the strip is still rendered; the cells fed by the fleet read and
  the session are unchanged

#### Scenario: The strip survives a failed own-fleets read
- **WHEN** the own-fleets read fails
- **THEN** the strip is still rendered, its fleet, fuel and hold cells show
  the absent form exactly as the no-acting-fleet case does, and the strip
  itself renders no error or retry affordance of its own — the failure is
  surfaced on the fleet panel, which owns the own-fleets read's error and
  retry surface

#### Scenario: The strip survives an unavailable renderer
- **WHEN** the canvas region shows the unsupported or interrupted state
- **THEN** the strip is still rendered and its figures still read

#### Scenario: With no acting fleet the fleet-scoped figures read absent and the chevron stays
- **WHEN** the view renders with no own fleet in this system while the
  requester owns fleets elsewhere
- **THEN** the fleet cell's identity and its fuel and hold figures show the
  absent form, the credits and clock cells still show their figures, and the
  chevron is still present and still lists the fleets the requester owns
  elsewhere

#### Scenario: A requester owning no fleet at all still gets the strip
- **WHEN** the view renders for a requester who owns no fleet anywhere
- **THEN** the strip is present, the fleet, fuel and hold cells show the
  absent form, the chevron's menu is empty rather than absent, and the
  credits and clock cells still show their figures
```

A third live sentence was checked because the brief's rule is "no requirement ships false": `system-console` *The Strip Is Laptop-First and Never Overflows the View*, scenario "No other floating surface covers a strip cell" ("every such surface remains fully visible and activatable itself"). Not newly false: the right column has been an `overflow-y-auto` scroller since link 2a (`SystemSpaceView.tsx:932`) and nothing bounds its content to its box, so the scenario already holds only in the sense that each surface can be brought fully into view within its scroller. This change narrows that box; it does not change the kind of claim. But this change's own ADDED geometry scenario states the stronger, unscrolled form and is not feasible as written (finding A4).

## Findings

### A1 — BLOCKER — 38 is not an honest count; the honest count is 52 as drafted and 56 with the sound review additions; no set of sheds reaches 40; the seam is content lifetime against placement

Unit applied: one task per test arrangement group; two scenarios share a task only as rows of one parametrised arrangement with the same closing assertion (the unit the previous link used).

| tasks.md box | Scenarios it names | Distinct closing assertions | Honest tasks |
| --- | --- | --- | --- |
| 1.1, 1.2, 1.4, 1.5, 1.6 | 2, 3, 2, 2, 1 | 1 each | 5 |
| 1.3 | 4 | attributes and roles read; keyboard activation performed | 2 |
| 2.1 | 8 | collapsed on mount and remount; strip figures identical; strip enumeration; three failure states (parametrised); no live-region change; order | 6 |
| 2.2 | 6 | dock collapsed; selection, acting fleet and request count unchanged; menu closed with the dock still expanded, then a second Escape | 3 |
| 2.3 | 2 | selection and pick count | 1 |
| 2.4 | 5 | log inside the panel and nowhere else, no toggle; three states (parametrised); report link opens and does not toggle | 3 |
| 2.5 | 2 | 1 | 1 |
| 2.6 | 8 | rows listed with no request by show (three rows of one arrangement); highlight and no-mark statement kept; first read with no expansion; refresh lists the new record; not listed on re-expansion | 5 |
| 2.7, 2.8 | 2 | 1 each | 2 |
| 3.1-3.3 | — | — | 3 |
| 4.1-4.6 | — | one per file | 6 |
| 5.1-5.6 | — | — | 6 |
| 6.1-6.9 | — | — | 9 |
| **Total** | | | **52** |

Additions I consider sound (rulings in A12): U1's independent-retries scenario (+1; its other scenario is a row of the 2.6 group), U3's waiting indication (+1), U4's row brought into view (+1), the warm-cache arm of the mount gate (A7, +1). U2 and U5 add rows to existing groups, U6 and U8 add journey legs, U7 removes a row, the MODIFIED block (A2) adds no task. **56.**

Sheds available to the named later pieces, each honest: the Escape requirement (3 tasks) and U4's scroll (1) to 2b-ii. That is 52, with nothing else that can leave without shipping a collision, an untested mechanism or a lost-focus path. **Sheds do not reach 40.**

**The seam (the predecessor reached the same one; I confirm it with counts): placement against lifetime.**

- **`add-console-dock` (keeps the id, 2b-i)** — the dock shell, the "Console" and collapse controls, the tab list, the Log tab as the log's home, the report's link as an open-only entry, focus on open and collapse, the tab and disclosure semantics, the published height and the five occupants, the MODIFIED strip block, deletion of the floating panel, the toggle and `logOpen`. **The log is mounted on show, exactly as `logOpen && !interior.isLoading` mounts it today**, so no read's timing changes, D1 stays exactly as masked as it is today and no e2e precondition changes. Requirements kept: *The Console Dock Extends Beneath the Strip…*, *The Dock Carries These Tabs*, *The Log Tab Is the Sighting Log's Home…*, *The Dock Is Keyboard-Operable* (less its Escape scenario), *The Dock Has One Fixed Height…*, plus the MODIFIED block. Honest count: shell 5 (1.1, 1.2, 1.3 ×2, 1.5 with U2's rows) + view 13 (collapsed on mount and remount; strip identical; enumeration; failure states; no request and no live-region change; the Tab walk; log placement and no toggle; three states; report link with focus; ghost; U3 waiting indication; lanes; nav) + migrations 5 (4.2 folded into 4.1) + build 5 + gate 9 = **37**.
- **`keep-console-tab-content-mounted` (new, 2b-i-b, archived before 2b-ii; id absent from `openspec/changes/archive/`, 38 entries checked)** — *A Tab's Content Stays Mounted While It Is Not Shown*, *Showing or Hiding the Log Tab Issues No Read*, *Escape Collapses the Expanded Dock*, *Activating the Dock Changes No Space-View Selection*, U1, U4; design.md D-1, D-2, D-7, D-8, D-11, D-16, D-20 move to it unchanged; it closes `drift-sighting-log-not-reread-after-sweep-settles.md`. Honest count: tests 15 (the probe; rows-with-no-request group; highlight and no-mark kept; first read with no expansion; refresh; independent retries; row into view; Escape ×3; not-a-pick; 3.1; 3.2; 3.3 ×2) + migrations 2 (`scan-journey` step 5 reads with no re-open; the fizzle spec's count, A9) + build 4 + gate 9 = **30**.

Why this seam and not another: I sized the alternative (keyboard, Escape and not-a-pick out; lifetime in) and its first half is still 46, because the lifetime half carries the real-hook harness. Cost of the seam, said out loud: 9 more gate tasks and two specs touched twice; one more link of coexistence; the first half ships the log remounting on show, which is today's behaviour and loses nothing a player has today, and RULING 2 is then ruled in a change of its own before any second tab exists (the chain's "Tab remount is the trap. Rule it" is honoured before 2b-ii, which is where a remount first costs something). RULING 1 needs an amendment and the chain table one more row.

If the orchestrator rules against a split, the change is 56 tasks and the previous chain's 119- and 131-task links are the precedent for what that costs.

### A2 — MAJOR — a MODIFIED block is required for *The Vitals Strip Is Present on Every Render of the System Space View*

Evidence and the complete block: Job 4(b) above. Paste-ready consequences:

- proposal.md, replace the last bullet of "What Changes": `- MODIFY one \`system-console\` requirement, *The Vitals Strip Is Present on Every Render of the System Space View*: its "across the foot" becomes false while the dock is expanded (the strip is the dock's top row). Six scenarios, none of whose text changes. No other capability takes a delta (RULING 12, under its own exception clause).`
- proposal.md Impact: `- Affected specs: \`system-console\` (9 ADDED, 1 MODIFIED).`
- tasks.md 6.6: reconcile must report the block's six scenario headings present; 6.7's rehearsal diff must show that requirement's first paragraph changed and nothing else in it.
- tasks.md 6.8, append: `and change "the always-on vitals strip along the bottom of that view" to "the always-on vitals strip that is the top row of the console dock at the bottom of that view".`

### A3 — MAJOR — tasks 3.2 and 5.4 misdescribe the early-settle exit, so the test would be arranged on the wrong trigger

Evidence: Job 2(c). `SystemSpaceView.tsx:390-431`: the exit is the commit window ending on a successful running-status read that carries nothing running; no interior read is involved. The existing arrangement of it is `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx:663-760` (commit, second `mockListRunning` answer carrying nothing).

Paste-ready, tasks.md:

- `- [ ] 3.2 SDET: test D1 on the early-settle exit, arranged as \`SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx\` arranges it (a scan commit accepted, then the acting fleet's running-status read answering successfully with no running sweep, so no ETA is ever learned and no watcher timer arms): the unfiltered pile is read again after that running-status read has answered and not before, and the newly minted record is listed when the dock is then expanded; a control row in which that read fails issues no pile re-read (content: the same live scenario, the other exit)`
- `- [ ] 5.4 nextjs-dev: make the settle path read the unfiltered pile again on both exits through one stable callback that calls the existing ghost-feed refetch and then invalidates \`queryKeys.sightings.pile(null)\` (design.md D-11): as the watcher's \`onSettled\`, which already runs after the settling interior read has resolved, and at the early-settle exit, which runs when the running-status read reports no running sweep; \`SightingLog.tsx\` is not edited for this; so 3.1 and 3.2 pass`
- Section 3 header, replace "3.1 and 3.2 must be seen red against the unfixed tree before 5.4 is written" with: `3.1 and 3.2 are judged red only once 5.1, 5.2 and 5.5 are in (before that they are red for want of a dock, which proves nothing); they must then be seen red for the reason "the unfiltered pile was not read again" before 5.4 is written.`

### A4 — MAJOR — the expanded-state geometry scenario is not feasible as a bounding-box assertion while the right column is a scroller

Evidence. At 1280×720 with the dock expanded the column's box is about 400 CSS px tall (720 − 16 − 304; design.md D-3) for four panels and up to three failure cards. It is `overflow-y-auto` (`SystemSpaceView.tsx:932`). A panel scrolled partly out of that box keeps its full layout box: `getBoundingClientRect()` on `space-fleet-panel` or the roster then extends below the column's foot, over the dock's rectangle, and can exceed the viewport. The existing collision helper hit-tests each control at its centre without scrolling (`e2e/tests/vitals-strip-journey.spec.ts:227-255`), so a control clipped by the column reads as "covered by" whatever is painted there. "Each such surface lies wholly inside the viewport, is activatable, and overlaps neither the dock nor the strip" is therefore false for the column's lower occupants in the ordinary expanded state, whatever the build does, until 2b-v deletes the column.

Paste-ready, spec delta, in *The Dock Has One Fixed Height and Nothing Covers It or Is Covered by It*, replace the sentence beginning "At the same viewport, in each of the two states, every floating surface…" with:

> At the same viewport, in each of the two states, every floating surface the view or the app layout mounts SHALL be shown wholly inside the viewport and clear of the dock, the strip and the "Console" control, and every control it carries SHALL be activatable, and the strip's five cells SHALL lie inside the viewport and be unoverlapped. A surface that scrolls its own content — the right-hand command column, for as long as it exists — meets this by its visible area lying wholly inside the viewport and clear of them, and by each control it carries being activatable once scrolled into view within it.

and the two scenarios' THEN lines with:

> - **THEN** each such surface's visible area lies wholly inside the viewport and overlaps neither the dock nor the strip, and each control it carries is activatable, a control inside a scrolling surface being first scrolled into view within that surface

(the collapsed scenario keeps its "nor any other of them" and "the "Console" control").

Paste-ready, tasks.md 6.2, replace the leg "every floating surface lies inside the viewport and overlaps neither the dock, the strip nor the "Console" control in both states" with: `the visible area of every floating surface — the command column measured as one scrolling surface by its own testid \`space-command-column\`, the camera cluster, the sightings-unavailable card, \`FloatingNav\` and the "Console" control — lies inside the viewport and overlaps neither the dock, the strip nor any other of them, in both states; each control in each is hit-tested at its centre after \`scrollIntoViewIfNeeded\` within its surface`. And 5.6 gains: `the column takes the testid \`space-command-column\``.

The proposal's "Coexistence" cost should say it in a sentence: with the dock expanded at 720 px tall the column is a 400 px scroller until the fifth piece deletes it.

### A5 — MINOR — the Escape requirement's menu clause is wider than the mechanism can deliver

Evidence: `VitalsStripFleetCell.tsx:91-114` — the menu handles Escape only in `onKeyDown` of the chevron and of an entry. A menu opened by pointer in a browser that does not focus a clicked button (Safari, Firefox on macOS), or left open while focus moves away, never sees the key; with design.md D-7 the dock then collapses and the menu stays open, against "unless the fleet cell's menu is open … the dock SHALL NOT collapse". Making the dock probe the strip's DOM instead turns Escape into a dead key in that state.

Paste-ready, spec delta, first sentence of *Escape Collapses the Expanded Dock*:

> WHEN Escape is pressed while the dock is expanded, anywhere in the system space view, the dock SHALL collapse, unless the fleet cell's open menu takes the key (*The Fleet Cell's Chevron and Menu Are Keyboard-Operable*: keyboard focus on the chevron or on one of the menu's entries), in which case the dock SHALL NOT collapse.

and the scenario's GIVEN: `- **GIVEN** the dock is expanded and the fleet cell's menu is open with keyboard focus on one of its entries`.

To file, not fix (it predates this change): against live *The Fleet Cell's Chevron and Menu Are Keyboard-Operable*, scenario "Escape closes the menu without choosing" — the menu does not close on Escape when focus has left it. Suggested record: `docs/handoffs/drift-fleet-menu-ignores-escape-when-unfocused.md`.

### A6 — MINOR — "inside it" must mean inside the tab bar or the panel

Evidence: the strip's row is inside the dock; the chevron is in the strip. As written, "WHEN the dock collapses while keyboard focus is inside it, focus SHALL move to the "Console" control" would pull focus off the chevron on Escape, which nothing needs (the chevron is not hidden by a collapse).

Paste-ready, *The Dock Is Keyboard-Operable*, replace that sentence and add U2's rule:

> WHEN the dock expands, keyboard focus SHALL move to the selected tab. WHEN the dock collapses while keyboard focus is in its tab bar or its panel, focus SHALL move to the "Console" control and SHALL NOT be lost to the start of the document; focus anywhere else, the strip's chevron included, SHALL NOT be moved by a collapse.

Scenarios: adopt U2's three as written; add `#### Scenario: Collapsing with focus on the strip's chevron leaves focus there` / `- **GIVEN** the dock is expanded with keyboard focus on the strip's chevron and its menu closed` / `- **WHEN** Escape is pressed` / `- **THEN** the dock is collapsed and keyboard focus is still on the chevron`.

### A7 — MAJOR — the mount gate as the delta and task 5.2 state it is too weak at the new mount site, and one scenario's GIVEN is false on a warm cache

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

### A8 — MAJOR — five tier assignments in tasks.md do not hold

1. **2.1 claims "the camera controls precede the body and lane-gate hit targets" in a harness whose stage is mocked** (section 2 header: "stage mocked"). Nothing in that harness renders a camera control or a hit target. The order lives inside `SpaceStage` and is held by `SpaceStage.interaction.test.tsx:116-140`, which this change does not touch (only the cluster's `bottom` class changes, `SpaceStage.tsx:716`). Paste-ready: delete that clause and its scenario name from 2.1 and add to 6.2: `a Tab walk with the dock expanded reaches a camera control before any body or lane-gate hit target (content: "The camera controls still precede the scene's hit targets with the dock expanded"; tier 1 cover is the unedited \`SpaceStage.interaction.test.tsx\` "keyboard tab order" describe)`.
2. **2.7's "by changing it once and observing all four move" cannot be done in jsdom**, which resolves no `calc()`/`var()` and lays nothing out. Paste-ready 2.7: `SDET: test the single source as one arrangement group: the dock publishes \`--console-dock-height\` on the document root as \`3.5rem\` collapsed and \`13.75rem\` expanded and removes it on unmount; the sightings-unavailable card, the camera cluster and the command column each carry the lane class exported by \`lib/console-dock-layout.ts\` (asserted against the imported constant, not a copied string) and no \`bottom-[4.5rem]\` literal remains in \`SystemSpaceView.tsx\`, \`SpaceStage.tsx\` or \`floating-nav.tsx\` (content: the structural half of the two "No floating surface…" scenarios; the geometry half is 6.2)`. The camera cluster is asserted in `SpaceStage`'s own test file, since 2.x mocks the stage.
3. **2.6 counts pile requests "at the service boundary" inside a section whose harness mocks the sightings hook.** The rows that count requests or need a second page need the real `useSightings` over a mocked `sightingService` and belong in section 3's harness. Paste-ready: move 2.6 to section 3 as 3.4 and split it per A1's table.
4. **6.2 names "tier 1 as cover" for the scroll and height-after-load-more legs.** Tier 1 cannot cover a height or a scroll. The scroll leg does not need a lucky fixture: the panel shows at most two rows, and `seedSightingFixture` (`e2e/helpers/scan-fixtures.ts:126`) already writes records. Paste-ready: `the scroll leg is must-PASS: seed three records with \`seedSightingFixture\`, reload, expand, scroll the panel to its end, and the last row lies wholly inside the viewport with the dock still 220 CSS px tall; the load-more half ("height unchanged after load-more") needs more than one served page (\`PageMax\` = 50, \`backend/sightings/model.go:26\`) and is logged UNTESTED with no cover claimed unless 51 records are seeded`.
5. **2.3 is close to vacuous at tier 1.** With the stage a mocked sibling, a click on the dock cannot reach it whatever the build does. The failure this requirement guards is a pointer press falling through a `pointer-events-none` wrapper to the canvas, which only a browser shows. Keep 2.3 for the keyboard and state rows; add to 6.2: `with a body selected, a pointer press on the tab bar's empty area and on the panel's empty area leaves the selection unchanged`.

And one assignment that can move down a tier: jsdom applies `[hidden] { display: none }` and `user.tab()` honours it (Job 2(b)). "Nothing of the log is reachable while the dock is collapsed", "The dock's controls follow the strip's chevron in the tab order" and U5's "Tab from the Log tab continues into the panel" are testable at tier 1 as a real Tab walk; section 1's header sentence "asserts structure, attributes and roles only … never `toBeVisible`" should be relaxed to say so. Dimensions, overlap and click-through stay tier 4.

### A9 — MAJOR — mount timing (Job 5): what changes, where, and whether tasks.md covers it

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

- `query-core/build/modern/query.js:166-176`: a fetch requested while one is in flight cancels and restarts only when the query already has data; otherwise it returns the in-flight promise. If the log's first pile read (no data yet) is still in flight when a settle callback invalidates it, no new read is issued and the answer in flight, requested before the settle, is taken as fresh. Reachable only when a pile read outlasts a commit round trip plus a running-status read (early settle just after the view opens) or the 400 ms cushion plus an interior read (a return inside the interior's stale window). The ghost layer's `refetch()` has the identical property today. A cancel-then-invalidate would close it but reverts a data-less query to `pending`/`idle`, which `SightingLog` renders as its empty state for a moment (`SightingLog.tsx:176-188` tests `isLoading`, not `isPending`) — a failed-is-not-empty violation traded for a rare stale read. Not taken; recorded in design.md Risks and to be filed with the two gaps the predecessor named.
- While a past-ETA sweep stays unsettled the watcher calls `onSettled` on every attempt (`SystemSpaceView.tsx:141-179`), so the log's pile is re-read every 20 s, every loaded page each time (the security report's `P` requests). Bounded and equal in kind to the ghost layer's; *The log does not poll while open* is conditioned on "no sweep running". No change asked.

### A11 — MINOR — "SHALL make no announcement to assistive technology" contradicts the focus move

Expanding moves focus to the Log tab (A6), and a screen reader speaks a newly focused control. What is meant and what is tested is that no live region changes. Paste-ready, *The Console Dock Extends Beneath the Strip…*: replace "and SHALL make no announcement to assistive technology" with "and SHALL change no live region's text"; rename the scenario "Expanding and collapsing issue no request and change no live region".

### A12 — MAJOR (as a set) — the UX findings: technical shape, feasibility and tier

| UX | Adopt? | Technical shape | Tier | Task effect |
| --- | --- | --- | --- | --- |
| U1 failure while collapsed survives; retries independent | Yes | Free under `hidden`: the failed state is the mounted component's own. Independence is already structural (two cache entries, two `refetch`es). | 1, real hook or the per-argument hook mock of `…no-ghost-reasons.test.tsx:57-66` | first scenario is a row of the rows-with-no-request group; second +1 |
| U2 focus on expand | Yes | design.md D-18; forced anyway, because the "Console" control is hidden by the expansion it causes. | 1 (jsdom focus is real); journey confirms | rows of 1.5 and of the report-link group |
| U3 waiting indication | Yes | The dock's panel renders a neutral placeholder (`console-panel-waiting`) until the mount latch opens; it must not be the log's "Reading the pile…". A failed interior read opens the latch, so the panel is never blank forever. | 1 | +1 |
| U4 ghost highlighted (positive half); row brought into view | Yes; positive half is a row | The row cannot scroll itself when it becomes highlighted, because under `display: none` there is nothing to scroll. `SightingLog` takes one optional prop `shown` (default true) and, in an effect on `[shown, highlightedGhostId]`, calls `scrollIntoView({ block: 'nearest' })` on the highlighted row while shown (design.md D-20). This is the one `SightingLog.tsx` edit beyond chrome. | 1 as a spy on `Element.prototype.scrollIntoView` (jsdom does not implement it; the test must define it); the "lies wholly inside the panel area" claim is tier 4 and needs a ghost whose row is below the fold — arrange with `seedSightingFixture`, else UNTESTED with the spy named as the only cover | +1; first candidate to shed to 2b-ii (or it rides the second half of the A1 seam) |
| U5 tab panel role and name; Tab continues into the panel | Yes | `role="tabpanel"` with `aria-labelledby` the tab; the collapse control is a sibling of the tab list, before the panel in the DOM, so the walk is tab → collapse → the log's controls. UX wrote the scenario to hold either way. No `tabindex` on the panel: it always holds the Refresh button. | 1 (roles; and the Tab walk, see A8) | rows |
| U6 24 px targets | Yes | "Console" is 24-28 px tall by D-5; the collapse control and the tab take `min-h-6 min-w-6`. | 4 only | one journey leg |
| U7 drop "not listed on re-expansion" | Yes | It pins a staleness a later improvement would have to delete; the request-count scenario already pins the behaviour. | — | −1 row |
| U8 refresh control and first row in view | Yes | Needs the log's own chrome trimmed inside the panel (`max-h-[70vh] w-80`, border, shadow, `p-3` at `SightingLog.tsx:156`); with the title row and one three-line row the content is about 100 px of the 128. Chrome only, as tasks.md section 5 already allows. | 4 only | one journey leg |
| U9 | Partly | "bottom-most always-visible" is not false; "across the foot" is (Job 4(b), A2). | — | — |
| U10 | Agree | Ask the writer to cite analysis § 5's enumeration in 6.2 so "every floating surface" is finite; A4's wording does this. | — | — |

### A13 — MINOR — capability boundary and requirement-versus-design hygiene

- **Boundary: sound.** `system-console` owns the dock, its controls, its geometry, what floats over the canvas and where another capability's panel is placed; `sighting-log` keeps the log's rows, reads and states; `system-space-view` keeps the canvas, selection and the scan report. The delta names the owners and restates none of their rules, with one exception: the mount-gate sentence restates `sighting-log`'s ordering rule in mechanism terms ("SHALL NOT mount the log's content") — reworded in A7 to the observable (no read, no content, a waiting indication).
- *A Tab's Content Stays Mounted While It Is Not Shown*: "mounted" is the chain's own vocabulary ("Do tabs stay mounted when hidden?") and the live spec says "the mounting view" throughout, so I do not ask for a rename; but the SHALL that a test can fail is "SHALL NOT discard the content's state", and the delta does not name `hidden`. Fine as written.
- *Showing or Hiding the Log Tab Issues No Read*: "because the log is mounted with the dock" is a reason, not a behaviour (reworded in A7).
- The delta states pixel positions nowhere except the three dimensions the chain rules (220, 56, 1280×720) and the nav's 72. Fine.
- tasks.md 5.1 says "never `<Activity>`, never conditional rendering": correct to keep in the task; it is the build's negative control for 1.4.

### A14 — MINOR — the security reviewer's S1: agreed, no 2b-i delta

Task 6.9 should carry the own-ness deny scenario forward by trigger, not by piece: "the first change that supplies `VitalsStrip`, or any dock tab that renders roster-derived figures, a fleet not drawn from the own-fleets read" (link 4 expected). The scenario text in the security report is the text to carry.

### A15 — MINOR — items to carry into the chain doc's later sections at 6.9

- **2b-ii** MODIFIES `system-space-view` *A Settled Sweep and the Scan Controls Are Reachable and Announced* ("tabs through the fleet panel") and *The Scan Surface Remains Usable While the Canvas Is Unavailable* ("through the `docked-fleet-actions` fleet panel"), both made false when `ScanControl` moves; rules Q3 (which tab an expand shows) before `sighting-log` *The log is opened from the space view* can stay true, since "Console" may then open on Scan; MODIFIES the tab-list requirement; takes arrow-key movement and "survives a tab switch".
- **Every later piece:** never `<Activity>`, never `experimental.routerBFCache` (Job 2(a); the latter wraps inactive route segments in a hidden Activity, `next/dist/client/components/layout-router.js:520-525`).
- **2b-v:** delete the column lane class and the `space-command-column` testid with the column; the expanded-state scroller clause of A4 goes with it (a MODIFIED block on *The Dock Has One Fixed Height…*).
- **Link 4** MODIFIES *Escape Collapses the Expanded Dock* for the second-press rule.
- **To file, not fix:** the settle watcher's disarm race; the ghost layer's warm-cache mount gate; the join-in-flight first read (A10); the fleet menu ignoring Escape when unfocused (A5).

### A16 — MINOR — work order for kickoff (unsplit form; under the A1 seam the second and fourth steps move to the second change)

1. Contract first, for the SDET: `frontend/lib/console-dock-layout.ts` (the property name, two values, three lane classes) and the testids of design.md D-19. No API contract: frontend only.
2. SDET writes sections 1-3 red.
3. nextjs-dev: 5.1 (shell) → 5.6 (lanes; independent of the rest) → 5.2 and 5.5 together (state, entry point, latch, deletion) → 5.3 (Escape, focus) → then 3.1 and 3.2 are observed red for the right reason → 5.4.
4. SDET: 4.7 (attribute the family), 4.1-4.6, then 6.2.

Nothing here is Go; there is no cross-boundary payload.

## What I changed in design.md

- Header and D-1: corrected "jsdom applies no stylesheet" (it applies `[hidden] { display: none }`), with the tier-1 consequences; recorded that the Chromium measurements were the predecessor's and were not re-run.
- D-2: kept; noted the result was reproduced in this run.
- D-3: kept; added that the lane classes were compiled, that the column takes `space-command-column`, and that the expanded column is a 400 px scroller the spec must describe as one.
- D-6: kept both verdicts; added the third sentence checked (*Laptop-First*).
- D-11: added the join-in-flight property and the rejected cancel-then-invalidate.
- D-16: added the residual fresh-cache sub-case honestly.
- New D-20 (the highlighted row is brought into view by the log, given `shown`), D-21 (the waiting indication), D-22 (what each tier holds).
- D-19: two names added.
- D-12: the log's chrome is trimmed enough for U8.
- Risks: three added (scroller column under the expanded dock; join-in-flight; the fizzle count) and the jsdom line corrected. Open Questions: the size question rewritten with counts and the seam's allocation of decisions; U4 no longer conditional; the unrepeated browser measurements listed.
- `openspec validate add-console-dock --strict` still passes (design.md only was edited; proposal.md, tasks.md and the spec delta are untouched).

STATUS: COMPLETE
