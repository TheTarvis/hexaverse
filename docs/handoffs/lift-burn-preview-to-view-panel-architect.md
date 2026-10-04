# lift-burn-preview-to-view — panel report, architect

Architect (`openspec-architect`), 2026-10-03, spec phase. Link 2a-ii of the
system-HUD chain. Code read at `a1d1c8d`. No stack booted, no tier 3/4 run, no
commit. `openspec validate lift-burn-preview-to-view --strict` passes before and
after my edit.

**Edited:** `openspec/changes/lift-burn-preview-to-view/design.md` only
(rewritten: Context facts, Decisions 2-6 and 9, Risks, Open Questions, the
requirements table). Proposal, tasks and the delta are untouched; replacement
text for them is below.

**Counts:** BLOCKER 0, MAJOR 4, MINOR 9.

Verified and found sound, so not findings: the seven live scenarios and all
three live body paragraphs are carried into the MODIFIED block with no line
removed (diffed, live `spec.md:478-561` against the delta); the U2 hunks
(`SystemSpaceView.tsx:187-192`, `:556-562`, import `:50`) are not touched by
anything the design requires; the e2e helper reads only `preview-panel` and
`burn-button` (`frontend/e2e/helpers/space-view.ts:455-456`).

---

## 1. Recommendations on the open questions

### 1.1 RULING 4's commit-clear mechanism — replace handler-clearing with a stored pair that is compared and dropped during render

**Setters of the selection — one.**

| Path | Site | Funnels through |
| --- | --- | --- |
| Pointer pick (body or point) | `SpaceStage.tsx:359`, `:364` | `onSelect` prop |
| Keyboard Enter/Space on a mark | `SpaceStage.tsx:680` | `onSelect` prop |
| Camera-centre point button | `SpaceStage.tsx:796` | `onSelect` prop |
| Off-screen target click / touch | `SpaceStage.tsx:963`, `:968` | `onSelect` prop |
| The view | `SystemSpaceView.tsx:821` — `onSelect={(picked) => setSelection((current) => toggleSelection(current, picked))}` | the only `setSelection` call in the tree |

No URL, roster, strip or log path sets the selection (`SightingLog.tsx:199`'s
`onSelect` is its own row highlight). Handler-clearing would be sound for the
selection.

**Setters of the acting fleet — two handlers, and one derivation no handler sees.**

| Path | Site | Clearable in a handler? |
| --- | --- | --- |
| Roster row | `SystemSpaceView.tsx:999` → `selectFleet` → `setActingFleetId` `:674` | yes |
| Strip chevron | `:1014` → `selectFleet` → `:674` | yes |
| Canvas fleet mark | `:827` — `onActivateFleet={setActingFleetId}` | no: the raw setter is the prop; clearing needs a new wrapper |
| **Derivation** | `:295-296` — `acting = allFleets.find((f) => f.id === actingFleetId) ?? here[0] ?? null` | **no handler exists** |

The last row is the defect in the provisional mechanism. With `actingFleetId`
null (the default: nobody has clicked a fleet), the acting fleet is `here[0]`,
and it changes when the own-fleets read lands differently: the implicit fleet
jumps out (`here` filters `!isInTransit`, `:291-294`), another arrives ahead of
it, or the chosen fleet leaves the read. No event handler runs. A commit-clear
record cleared "in the same event handlers that change the selection or the
acting fleet" would survive that change and go on suppressing the preview for a
fleet that never committed.

**Recommended mechanism (now design.md Decision 5).**

```ts
const [committed, setCommitted] = useState<{ fleetId: string; selectionKey: string } | null>(null)
const commitCleared =
  committed !== null && committed.fleetId === acting?.id && committed.selectionKey === selectionKey(selection)
if (committed !== null && !commitCleared) setCommitted(null)
```

- Set by a panel callback `onBurnCommitted({ fleetId, selectionKey })` fired in
  the order mutation's success callback, carrying the pair **captured at click
  time**. The panel already captures `quoted` at click (`SpaceCommandPanel.tsx:126`);
  the pair goes beside it.
- Compared against the derived `acting` and the live selection: no handler is
  enumerated, so the fourth row above is covered.
- Dropped during render the first time the pair stops matching. The drop is
  what the delta's "until the selection is cleared or replaced or the acting
  fleet changes" needs: without it, deselect-then-reselect of the same target
  and fleet A → B → A both match the stored key again and are re-suppressed,
  failing the delta scenario "Selecting the committed target again after
  clearing the selection is previewed".
- No effect, no timer.

**Is the panel-to-view callback the right seam?** Yes. The mutation lives in the
panel (`useOrder`, `:103`), and this view already takes a commit notification
from a child in the same shape: `onCommitAccepted={markScanCommitAccepted}`
(`SystemSpaceView.tsx:930`). Lifting `useOrder` to the view would rewrite the
panel's commit tests for a component link 4 deletes.

**Checked against the four named requirements.**

- *A Commit's Actual Result Is Never Silently Swapped for the Previewed One* —
  holds. The previewed figures live in the panel's own `commit` state
  (`:107`, `:139-143`), written from the click-time `quoted`; the clear only
  nulls the `preview`/`currentQuote` props. See finding A12 for one wording
  trap in the new scenario.
- *Burn Commit Reports Its Outcome* — holds. Toasts are untouched; "the current
  selection [is] unchanged" on failure holds because the callback is not called
  on failure and never changes the selection on success either.
- *A Burn Commit Is Quote-Locked to the Preview the Player Agreed To* — holds.
  Cap from `currentQuote`; cap rejection calls `onRequote`; the clear fires only
  on success so the re-quote is unobstructed. One reachable hole in the retry
  path is finding A6.
- *Animation Never Re-Renders the View, and Never Starves a Navigation* —
  holds. Its prohibition is "no effect SHALL write component state in response
  to a per-frame value"; the record is written in a mutation callback and
  dropped in render, and costs one extra render at a selection or acting-fleet
  change following a commit.

It does **not** hold against the carried text of its own requirement: finding A2.

### 1.2 Docked-at-target guard — expressible from served fields alone, as id equality with both operands required

Yes. `Fleet.attachedTo` is served (`lib/types/fleet.ts:147-150`), the selected
`bodyId` is an id the interior read served, and the code and the spec already
treat them as the same id space for all three host kinds:

- body: `interior.data.features.find((f) => f.id === acting.attachedTo)` (`SystemSpaceView.tsx:683`);
- station: `fleet.attachedTo === station.featureId` (`FleetActionsPanel.tsx:139`);
- gate: live spec, *Burn Command Targets...* — "the `id` the interior read
  served for that gate body — the same id that fleet's `attachedTo` reports
  once it arrives".

`SpaceSelection` has no kind tag (`space-selection.ts:7-13`), so the guard is
one string comparison with no kind branch and no Go rule mirrored. A point
selection has `bodyId` undefined and must never match — but only if the guard
requires both operands (finding A3). A point that coincides with the host is
reachable (reframe on the host, then `select-pan-target-point`,
`SpaceStage.tsx:796`) and is still requested; catching it needs a client
distance rule, which is the mirror this project forbids. Recorded as a residual
risk in design.md.

### 1.3 The "unaffected" list — one requirement is contradicted, by the delta's own carried text; one is newly load-bearing; the rest verify

| Requirement | Writer's verdict | Mine |
| --- | --- | --- |
| Burn Preview Reflects the Server-Solved Order (the MODIFIED one) | n/a | **Internally contradicted** — finding A2 |
| A Failed or Stale Preview Is Never Presented as a Current Quote | "Unaffected here; owned by 2a-iii" | Not falsified, but its WHILE clause ("SHALL remain available and SHALL be labelled as uncapped") now governs two new states and dictates the answer to design OQ 1 and 2. Not "owned by 2a-iii" for that clause. |
| A Burn Commit Is Quote-Locked | Unaffected | Verified |
| Burn Commit Reports Its Outcome | Unaffected | Verified |
| Burn and Jump Commit Controls Guard Against Double-Submit | Unaffected | Verified |
| A Commit's Actual Result Is Never Silently Swapped | Unaffected, scenario added | Verified; wording trap A12 |
| Burn Command Targets ... Uniformly | Unaffected, conditional | Verified |
| Toggle-to-Deselect | Unaffected | Verified; it names exactly the three acting-fleet paths enumerated above |
| Jump Commit | Unaffected | Verified |
| Realtime Refetch Rules | Unaffected | Verified (no preview clause, `spec.md:973-986`) |
| Animation Never Re-Renders | Unaffected, constrains | Verified |
| Fan-In | Deferred | Agreed; the read was already issued inside this view's tree |
| system-console *The Strip Issues No Read of Its Own* | Unaffected | Verified |
| docked-fleet-actions *Running Mine Gates* | Unaffected | Verified; presentation side-effect in A10 |
| fleet-movement preview, figure-formatting | Unaffected | Verified |

Not on the writer's list and checked: *Departure Hand-Off*, *Fleet Roster
Cross-Navigation* — unaffected (`selectFleet` is not edited).

### 1.4 One production call site plus a static guard — achievable; flat prop shape

Today exactly one non-test module references the hook
(`SpaceCommandPanel.tsx:37`). The guard is the `lib/realtime.test.ts` idiom
(`:36-47`: walk `app`, `components`, `hooks`, `lib`). It needs two clauses, not
one — see A9. The hook call must sit after `mineRunning` (`SystemSpaceView.tsx:739`),
which is before the `return` and unconditional, so the rules of hooks hold.

Prop shape (design.md Decision 2): six flat, required props — `preview`,
`currentQuote`, `previewStale`, `previewNoQuote`, `onRequote`,
`onBurnCommitted`. Types from `@/lib/types/fleet`, so the panel imports nothing
from the hook module, type or value. Every panel testid kept.

### 1.5 Task sizing — 32 becomes 36; four tests missing, two tasks mislabelled

Findings A3, A4, A6, A7, A9, A13. Full replacement tasks.md in section 3.

---

## 2. Findings

### A1 — MAJOR — RULING 4's provisional mechanism misses acting-fleet changes that have no handler (design; fixed in design.md)

**Evidence.** Draft design.md Decision 5: "cleared in the same event handlers
that change the selection or the acting fleet". `SystemSpaceView.tsx:295-296`:

```ts
const acting =
  allFleets.find((f) => f.id === actingFleetId) ?? here[0] ?? null
```

and `:827` `onActivateFleet={setActingFleetId}` (a raw setter, no handler body
to clear in).

**Effect.** A commit-clear record outlives a derived acting-fleet change and
suppresses the preview for a fleet that committed nothing — a "SHALL be
requested" violation with no visible symptom.

**Resolution.** design.md Decision 5 rewritten (section 1.1). For the writer,
replace tasks 4.4 (text in section 3). For the orchestrator: RULING 4 can be
finalised on "a stored (fleet, selection) pair, compared against the derived
acting fleet and the live selection, dropped when it stops matching".

### A2 — MAJOR — the commit-clear paragraph contradicts two sentences the MODIFIED block carries verbatim (delta; writer)

**Evidence.** Delta `spec.md:20-25`, carried from live `:495-500`:

> A preview SHALL be requested whenever a commit of that same order would be
> accepted, and only then. In particular a preview SHALL be requested while the
> acting fleet is **burning**: re-targeting mid-flight is an ordinary commit

Delta `:51-54`, new:

> A preview cleared by a committed order SHALL stay cleared: the selection is
> kept, and no preview is requested for it, until the selection is cleared or
> replaced or the acting fleet changes.

After a successful commit the acting fleet is burning, a re-commit to the same
selection would be accepted (the Burn control stays enabled), and no preview is
requested. Both carried sentences are false in that state. An adversary reading
the archived requirement can fail the implementation against either half.

The docked-at-target clause does not have this problem: the server refuses that
order, so "and only then" already forbids the request.

**Paste-ready.** Replace delta lines 20-28 (the second paragraph) with:

```
A preview SHALL be requested whenever a commit of that same order would be
accepted, and only then, with one exception: a selection whose order has
already committed, as stated below. In particular a preview SHALL be requested
while the acting fleet is **burning** and a selection that has not been
committed is current: re-targeting mid-flight is an ordinary commit
against the fleet's live tangent, it is the most consequential order in the
game, and offering the commit while withholding the quote would remove the
preview from the decision that most needs one. A preview SHALL NOT be
requested while the acting fleet's movement channel is claimed by a running
mine, or while it is in lane transit, since a commit would be refused in both
cases.
```

The live third paragraph already says "while it remains shown and the selection
is uncommitted", so the carve-out matches vocabulary the requirement has.

### A3 — MAJOR — the docked guard as drafted suppresses a free-flying fleet's point preview (design; fixed; one test missing)

**Evidence.** Draft design.md Decision 4: "The guard compares the selection's
body id with the acting fleet's `attachedTo`; a point selection has no body id
and never matches." `Fleet.attachedTo?: string` is "empty/absent when
free-flying" (`lib/types/fleet.ts:147-150`); `SpaceSelection.bodyId?: string` is
undefined for a point (`space-selection.ts:23-33`). The direct comparison
`selection?.bodyId === acting.attachedTo` is `undefined === undefined` — true —
for a free-flying fleet with a point selected: the commonest point preview in
the game, silently never requested.

Task 3.4 covers "docked, then a point"; nothing covers "not docked, a point".
Task 3.6 selects a body.

**Resolution.** design.md Decision 3/4 now state the guard with both operands
required:

```ts
const dockedAtTarget =
  !!acting?.attachedTo && selection?.bodyId !== undefined && selection.bodyId === acting.attachedTo
```

**Paste-ready task** (3.6 in section 3): "...with an acting fleet parked in the
system and attached to nothing: a selected body and a selected point are each
previewed...".

### A4 — MAJOR — three behaviours the mechanism must have are untested (tasks; writer)

**Evidence.** Tasks 3.7-3.9 test commit, re-target, clear-and-reselect, fleet
switch (once) and rejection. None covers:

1. an acting-fleet change with no handler (A1's case) — the test that
   distinguishes the derivation from handler-clearing;
2. a commit whose response lands after the selection was replaced — proves the
   pair is the click-time one, not the view's at response time. `order.mutate`
   resolves asynchronously (`SpaceCommandPanel.tsx:127-161`); a pair read at
   response time would suppress the *new* selection;
3. fleet A → B → A with the selection kept — proves the record is dropped, not
   merely compared.

**Paste-ready.** Tasks 3.8, 3.10, 3.11 in section 3.

### A5 — MINOR — the delta names a component in requirement text (delta; writer)

**Evidence.** Delta `:33`: "the panel SHALL present that state as neither a
quote nor a failed quote"; scenario `:105`: "the panel presents no preview
figure". The live requirement never says "panel"; its sibling says "the view
SHALL show". Link 4 deletes `SpaceCommandPanel` (chain doc, "What every link
must not do": "`SpaceCommandPanel` — each is deleted by the link that
supersedes it"), which would leave the requirement naming a surface that no
longer exists and force a MODIFIED for wording alone.

**Paste-ready.** `:33-35`:

```
selection itself is left as it is, and the view SHALL present that state as
neither a quote nor a failed quote: no figure, no no-quote state, no stale
marking and no retry affordance. A selected point is never a fleet's host.
```

`:105-107`:

```
- **AND** the view presents no preview figure, no no-quote state, no stale
  marking and no retry affordance, and the selection is still the station's
  body
```

### A6 — MINOR — the lifted retry can send a request while the preview is suppressed (hook; design Decision 6; needs a task and an Impact line)

**Evidence.** `use-burn-preview.ts:72-74`:

```ts
const retry = useCallback(() => {
  void query.refetch()
}, [query])
```

React Query's `refetch()` runs on a disabled query. The panel calls `retry()` on
a cap rejection (`SpaceCommandPanel.tsx:156`), which lands asynchronously. A
fleet docked at H, target X quoted and committed, selection moved to H before
the rejection lands: `retry()` refetches the disabled H query — the zero-length
preview this change exists to stop. Narrow, but it makes "SHALL NOT be
requested" depend on timing.

**Resolution.** design.md Decision 6: `retry` is a no-op while disabled.

**Paste-ready, proposal Impact** (replace "`frontend/hooks/use-burn-preview.ts`
keeps its signature."):

```
`frontend/hooks/use-burn-preview.ts` keeps its signature; its `retry` sends nothing while the preview is suppressed (one guard, one hook test).
```

Tasks 1.10 and 4.6 in section 3; 5.1 reworded.

### A7 — MINOR — section 2 is labelled red and is not; 2.1's recording mock has no consumer (tasks; writer)

**Evidence.** Tasks section 2 heading "View test harness (red)". The seven
files' mock returns `{ data, isLoading, isError, isFetching }`
(`SystemSpaceView.test.tsx:210-212` and six siblings). After the lift the view
reads `preview`, `stale`, `noQuote`, `retry` — all undefined, all falsy, and
nothing calls `onRequote` in those suites. They pass before and after. Task 2.1
builds "a hoisted recording mock ... so the call arguments can be asserted", but
section 3 asserts on real requests in a new file with the real hook (the
stronger proof RULING 2 prefers); nothing reads the recording.

**Paste-ready.** One task replaces 2.1 and 2.2 (section 3, task 2.1).

### A8 — MINOR — a mine that begins while a preview is shown: tested, but no scenario says so (delta; writer)

**Evidence.** Task 3.1: "a mine that begins after the selection stops further
requests", traced to a scenario whose THEN is "no preview request is sent for a
**newly made** selection" (delta `:95-98`). The body text is unconditional and
the hook withdraws the quote the moment it is disabled
(`use-burn-preview.ts:76`), so the behaviour is forced; the trace is not.

**Paste-ready**, add after the scenario at delta `:95-98`:

```
#### Scenario: A mine that begins while a preview is shown withdraws it
- **GIVEN** a preview is shown for the current selection
- **WHEN** a mine run begins on the acting fleet's movement channel
- **THEN** the shown preview is removed and no preview request is sent while
  the run holds the channel
- **AND** when the run ends with the same selection still current, a preview
  request is sent for it
```

(The proposal's scenario count becomes ten new, not nine.)

### A9 — MINOR — the static guard and two panel tests are under-specified (tasks; writer)

**Evidence.** Task 1.1: "exactly one non-test production module calls the hook".
Two `useBurnPreview(` calls inside `SystemSpaceView.tsx` satisfy that and double
the request rate. Task 1.6 does not say the notification carries the click-time
pair. No task proves the panel stopped deriving currency itself (the draft
Decision 2's whole point): a panel that still computes `preview && !stale`
passes every migrated test.

**Paste-ready.** Tasks 1.1, 1.6, 1.9 in section 3.

### A10 — MINOR — three presentation consequences need a UX ruling, none blocks (orchestrator / UX reviewer)

1. **Docked at the selected target:** Burn enabled, labelled "Uncapped: this
   burn will be committed with no fuel ceiling" (`SpaceCommandPanel.tsx:301-307`,
   `:314`); a click sends an order the server refuses. Recommendation: leave it.
   Live *A Failed or Stale Preview...* — "the burn command SHALL remain
   available and SHALL be labelled as uncapped" — and *Burn Command Targets...*
   — "allow the burn command to be invoked" — both say so; disabling needs two
   more MODIFIED blocks of six scenarios each.
2. **Just committed:** same label directly under the committed order; a second
   click is an uncapped re-target where today it is capped by the still-polled
   quote. The cap never prevented the second charge. Recommendation: leave it,
   same two requirements.
3. **Mine running with a target selected:** today a live quote shows; after the
   fix the uncapped label shows beside a disabled Burn (`disabled={... || mineRunning}`,
   `:314`). New, mildly misleading, presentation-only. Recommendation: accept
   in this link; link 4 redraws the surface.

### A11 — MINOR — proposal and chain-doc statements that the review makes stale (writer / orchestrator)

**Paste-ready, proposal "What Changes" bullet 4** (replace its last sentence
"The mechanism is provisional (see design.md Open Questions)."):

```
The view holds the committed (fleet, selection) pair, compares it against the acting fleet and the selection on every render, and drops it when it stops matching (design.md Decision 5).
```

`docs/plans/system-hud/chain.md:444-446` says "seven live scenarios verbatim
plus the two new ones"; the delta adds nine (ten with A8). Task 5.8 already
updates that section; name the count there.

### A12 — MINOR — the new "figures outlive" scenario pins a behaviour the code lacks when the shown quote was stale (delta; writer)

**Evidence.** Delta `:152-157`: "GIVEN a preview is shown and a burn commits ...
THEN the drift notice still surfaces the actual and the previewed figures that
were last shown". The panel captures `quoted = currentQuote`
(`SpaceCommandPanel.tsx:126`), which is null when the shown figures are stale;
the notice then reads "— no quote had been shown" (`:369`). A test written to
the scenario's letter with a stale shown preview fails against unchanged,
out-of-scope code.

**Paste-ready**, delta `:153`:

```
- **GIVEN** a current preview is shown and a burn commits with an actual
  arrival or delta-v differing from it
```

### A13 — MINOR — sequencing notes for the tasks header (tasks; writer)

**Evidence.** Deleting the panel test's hook mock (1.2) makes all 34 panel tests
throw "No QueryClient set" until 4.1 lands, and the per-commit gate runs the
whole vitest suite (`frontend/CLAUDE.md`, test tiers). Task 5.1 says
`use-burn-preview.test.tsx` stays green "with no further edit", which A6 changes.

**Paste-ready.** Header line and 5.1 in section 3.

---

## 3. Replacement tasks.md (36 tasks; cap 40)

```
Tiers are as defined in `docs/testing-tiers.md`; every test task below is tier 1 (vitest) unless the gate section says otherwise. Red tasks precede the implementation tasks they gate. Sections 1 and 3 go red together and turn green across section 4; because the per-commit gate runs the whole vitest suite, sections 1-4 land in one commit.

## 1. Panel prop contract, hook and guard (red)

- [ ] 1.1 Static guard test (new file, the `lib/realtime.test.ts` walk idiom): exactly one non-test module under `app`, `components`, `hooks`, `lib` imports `use-burn-preview` by any path; it is `components/space/SystemSpaceView.tsx`; that source contains exactly one `useBurnPreview(` (design decision 7)
- [ ] 1.2 Panel test file: delete the `vi.mock('@/hooks/use-burn-preview')` and the mutable `previewState`; the `panel()` helper supplies `preview`, `currentQuote`, `previewStale`, `previewNoQuote`, `onRequote`, `onBurnCommitted` with defaults (`SpaceCommandPanel.test.tsx`, 630 lines, 34 tests)
- [ ] 1.3 Migrate the arrange steps of the quote-display and failed/stale describes (scenarios "Selecting a target shows a preview curve and its figures", "An unaffordable preview is shown as such", the six failed/stale scenarios) to props; the remaining unrelated tests need no edit
- [ ] 1.4 Migrate the arrange steps of the quote-lock and commit-outcome describes (scenarios "A commit with a current preview carries a cap", "The ceiling the player agrees to is the one displayed", "A commit matching the preview shows no drift notice", "A commit differing from the preview surfaces both figures", "An uncapped commit still surfaces its actual figures")
- [ ] 1.5 Panel test: a cap rejection invokes `onRequote` and sends no second order (scenario "A cap rejection re-quotes in flow instead of failing the interaction")
- [ ] 1.6 Panel test: a successful burn commit calls `onBurnCommitted` once with the fleet id and selection key held at click time, even when the fleet or selection props changed before the response; a rejected commit does not call it (scenarios "A committed order clears the preview and none is requested for that selection", "A rejected commit leaves the preview shown")
- [ ] 1.7 Panel test: after `preview` and `currentQuote` become null following a successful commit, the drift notice still shows the actual and previewed figures (scenario "The committed order's own figures outlive the cleared preview")
- [ ] 1.8 Panel test: with null quote props and both flags false, the panel shows no figure, no no-quote line, no stale line and no retry (the presentation half of scenario "A fleet docked at its selected target requests no preview")
- [ ] 1.9 Panel test: `preview` supplied with `currentQuote` null and `previewStale` false shows no ceiling, shows the uncapped label, and commits with no `maxFuelTons` - the panel does not derive currency itself (design decision 2)
- [ ] 1.10 Hook test (`use-burn-preview.test.tsx`, added describe): `retry()` sends no request while `commitWouldBeAccepted` is false, and sends one when it is true (design decision 6)

## 2. View test harness (hygiene, not red)

- [ ] 2.1 Correct the wrong-shape `useBurnPreview` mock to `{ preview: null, stale: false, noQuote: false, retry }` in the seven view test files: `SystemSpaceView.test.tsx` and `.render-loop`, `.scan-refetch`, `.scan-settle-announcement`, `.scan-targets-refetch-on-arrival`, `.sighting-log-mount-ordering`, `.sighting-log-no-ghost-reasons` (one line each; they pass before and after)

## 3. View-level behaviour (red)

New file `SystemSpaceView.burn-preview.test.tsx` renders the real view, the real panel and the real hook, mocks `fleetService.preview` (not the hook), drives selection and fleet activation through a stage mock exposing body, gate-body, point and fleet-mark triggers, and makes a selection in every test.

- [ ] 3.1 Selection made, then a mine running: no preview request is sent; a mine that begins after a preview is shown withdraws it and stops further requests; when its ETA passes requests resume (scenarios "No preview is requested while a mine holds the movement channel", "A mine that begins while a preview is shown withdraws it")
- [ ] 3.2 Selection made with the acting fleet in lane transit, and with no acting fleet: no request (scenario "No preview is requested while a mine holds the movement channel")
- [ ] 3.3 Acting fleet attached to a station that is selected: no request across several intervals, the panel presents no quote, no no-quote and no retry, the selection is unchanged (scenario "A fleet docked at its selected target requests no preview"); repeat for a lane-gate body host
- [ ] 3.4 Acting fleet docked, a different body and then a point selected: each is previewed (scenario "Another body is previewed while the fleet is docked")
- [ ] 3.5 Acting fleet no longer attached to the selected former host: the host is previewed (scenario "A fleet that has left its host previews that host like any other target")
- [ ] 3.6 Acting fleet parked in the system and attached to nothing: a selected body and a selected point are each previewed, the quote renders, and exactly one request is sent per elapsed interval (scenarios "Selecting a target shows a preview curve and its figures", "The preview refreshes on exactly one named interval while shown"; refresh constant stays the single `PREVIEW_REFRESH_MS`; the point case guards the absent-equals-absent comparison of design decision 4)
- [ ] 3.7 Commit through the real panel: the quote is withdrawn, the selection stays, and no request is sent across later intervals (scenario "A committed order clears the preview and none is requested for that selection")
- [ ] 3.8 After a commit-clear: a different selection is previewed; clearing and re-selecting the same target is previewed; switching the acting fleet with the selection kept is previewed, by the roster row, by the canvas mark, and again after switching back to the committing fleet (scenarios "A re-target after a commit is previewed", "Selecting the committed target again after clearing the selection is previewed", "Switching the acting fleet ends the post-commit clear")
- [ ] 3.9 A rejected commit leaves the shown quote and sends the re-quote request (scenario "A rejected commit leaves the preview shown")
- [ ] 3.10 After a commit-clear with no fleet ever chosen, the own-fleets read changes which fleet is acting: the new acting fleet's preview is requested for the kept selection (scenario "Switching the acting fleet ends the post-commit clear"; design decision 5 - no handler runs on this path)
- [ ] 3.11 A commit whose response lands after the selection was replaced does not suppress the new selection's preview (scenario "A re-target after a commit is previewed")

## 4. Implementation

- [ ] 4.1 Call `useBurnPreview` once in `SystemSpaceView` after `mineRunning`, derive `currentQuote` once there, pass the six quote props to `SpaceCommandPanel`, delete the panel's hook call, import, currency derivation and stale header comments (gates 1.1-1.5, 1.9, 3.6)
- [ ] 4.2 Make the call site's flag require an acting fleet, no lane transit and no running mine (gates 3.1, 3.2)
- [ ] 4.3 Add the docked-at-target precondition to the flag with both ids required present, leaving the selection untouched (gates 3.3-3.6, 1.8)
- [ ] 4.4 Add the commit-clear record: view state holding the committed fleet id and selection key, set from `onBurnCommitted`, compared against the acting fleet and the selection on every render and dropped when it stops matching; no effect, no timer, no edit to the selection or acting-fleet handlers (gates 1.6, 1.7, 3.7-3.11)
- [ ] 4.5 Confirm by diff that the U2 hunks in `SystemSpaceView.tsx` are byte-identical, that no new text cites `wallMsUntil`, and that `PREVIEW_REFRESH_MS` and `BURN_FUEL_ALLOWANCE` are not redeclared (`lib/realtime.test.ts`, `lib/space-quote.test.ts` stay green)
- [ ] 4.6 Make the hook's `retry` a no-op while the preview is suppressed; signature unchanged (gates 1.10)

## 5. Validation and gate

- [ ] 5.1 `use-burn-preview.test.tsx` (its twelve existing tests unedited), `SystemSpaceView.render-loop.test.tsx` and the rest of the `SystemSpaceView*` family green
- [ ] 5.2 Per-commit gate green (tiers 1-2 per `docs/testing-tiers.md`)
- [ ] 5.3 Before the run, QA names the closing assertion for each scenario row in the delta
- [ ] 5.4 Journey at the archive gate (tier 4): select a target and read the quote in the panel; count `orders/preview` POSTs to prove one per interval; select the docked fleet's own host and see no request and no console error; hard `[journey-console]` assertion carried forward; panel testids unchanged so the e2e helpers need no edit
- [ ] 5.5 Tier 3 emulator suite at the archive gate, with the tree locked
- [ ] 5.6 `python3 harness/openspec-reconcile.py lift-burn-preview-to-view`, `openspec validate lift-burn-preview-to-view --strict`, and an archive rehearsal on a copy
- [ ] 5.7 Close `docs/handoffs/drift-running-mine-preview-unsuppressed.md` and `docs/handoffs/defect-docked-selection-polls-zero-length-preview.md` with the closing test and commit; leave the three related records untouched
- [ ] 5.8 Update `docs/plans/system-hud/chain.md`: link 2a-ii status, its scenario count and its Taught record
```

Count: 10 + 1 + 11 + 6 + 8 = 36.

---

## 4. Risks recorded in design.md that the orchestrator should know

- The guarded `setState` during render is new to `SystemSpaceView.tsx` (the file
  has ref writes during render at `:408-416`, not state). I did not run the
  linter against it. If lint rejects the guarded form, the named fallback keeps
  the stored pair and the comparison and moves the drop into the three setter
  sites (`:674`, `:821`, `:827`); only the A → B → A case loses its guarantee,
  and task 3.8's last clause would then fail. That is a design change to bring
  back, not to take silently.
- A reload mid-burn followed by selecting the burn's target can send one
  preview between the arrival instant and the fleet read that reports the
  attachment. One request, then the guard holds; the journey does not meet it.
- The journey waits at least two `PREVIEW_REFRESH_MS` intervals of wall time to
  count requests; budget it within the existing step timeouts, never by raising
  one.
