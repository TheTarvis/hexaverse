# add-burn-cost-overlay — panel review, architect

Reviewer: `openspec-architect`, 2026-10-04, tree at `d965f5d`. Read-only on the
change except `design.md`, which I authored
(`openspec/changes/add-burn-cost-overlay/design.md`). No suite run, no stack
booted. `openspec validate add-burn-cost-overlay --strict` is clean with
`design.md` present. The one script I ran is
`harness/check-color-compliance.py`, on probe files in the session scratchpad.

Read: role file and backing skills, root and `frontend/CLAUDE.md`,
`docs/plans/system-hud/chain.md` whole, `docs/plans/system-hud.md`, the
analysis whole, the rulings ledger whole (RULINGs 2-14 taken as binding), the
proposal, tasks and delta, `Gauge.tsx`, `VitalsStrip.tsx`, `SystemSpaceView.tsx`
(`:128-200`, `:270-475`, `:572-612`, `:700-830`, `:860-1088`),
`SpaceCommandPanel.tsx`, `use-burn-preview.ts`, `lib/types/fleet.ts`,
`Gauge.test.tsx`, the harness sections of `VitalsStrip.test.tsx`,
`SystemSpaceView.burn-preview.test.tsx` and
`SystemSpaceView.stranding-notice.test.tsx`,
`hooks/use-burn-preview.call-site.test.ts`, live `system-console` (fuel, hold,
no-read, announce, width requirements) and the `system-space-view` passages for
Fan-In, the burn preview, the stale preview and the committed selection. I read
the UX panel's U1, U2 and Q4 only, to check one of its proposals for
implementability (A9).

## Verdict

One BLOCKER, five MAJOR, seven MINOR. No ruling is contradicted by the tree.
The capability placement is right (RULING 8 holds on reading: nothing in the
delta needs a `system-space-view` delta), but two clauses reach across the
boundary and bind the command panel from `system-console` (A1, A2). Honest task
count is **46**, not 39 (A7).

| Id | Severity | One line |
| --- | --- | --- |
| A1 | BLOCKER | "Each SHALL be present exactly when the other is" is false in states the delta itself defines, and reachable (a dry fleet) |
| A2 | MAJOR | "Never the only carrier" puts a new SHALL on the command panel from `system-console`, stronger than the owner's text |
| A3 | MAJOR | "Both extents can be read on one rail" names tonnages the journey cannot arrange |
| A4 | MAJOR | The canvas-unavailable scenario cannot be arranged in either real-hook harness as tasked |
| A6 | MAJOR | Task 5.1 duplicates an existing green guard and its second half is false at HEAD |
| A7 | MAJOR | tasks.md is 46 arrangement groups, not 39; shed list given |
| A5 | MINOR | The non-boolean flag clause: drop it |
| A8 | MINOR | Task 1.8 credits the colour gate with checks it does not make |
| A9 | MINOR | If UX's end mark is adopted, it cannot be a child of the extent; "a single element" must be relaxed |
| A10 | MINOR | The refuel scenario asserts a cause no harness can observe |
| A11 | MINOR | The only view-level flag-versus-picture row does not state its own fuel |
| A12 | MINOR | "No numeric extent attribute" reads as contradicting the inline geometry the scenarios measure |
| A13 | MINOR | Two scenarios restate `system-space-view` rules as `system-console` THENs |

---

## Findings

### A1 — BLOCKER — the overlay-and-ceiling biconditional is false in states the delta defines

Against (lifetime requirement, first paragraph):

> "The mounting view SHALL supply the strip a burn quote — and so the strip
> SHALL draw the cost overlay — exactly while the view holds a successful,
> current burn preview"

> "The overlay and the burn command's fuel ceiling are two readers of that one
> determination: each SHALL be present exactly when the other is."

and the scenario *The overlay and the fuel ceiling are present together*.

Evidence. The ceiling is present whenever `currentQuote` is non-null
(`SpaceCommandPanel.tsx:148`, `ceiling = currentQuote ? ... : null`). The
content requirement removes the overlay in three states where `currentQuote`
is non-null:

1. A gauge with no data. A fleet holding no fuel serves no `fuel` entry
   (live *The Fuel Cell Shows the Served Fuel Tonnage...*: "a dry fleet and an
   unserved roster are one absence"). A dry fleet with a selection has a
   current quote, a ceiling, and by the delta's own "A gauge with no data draws
   no overlay", no overlay.
2. A cost that is not a finite non-negative number.
3. A flag that is not a boolean (if A5 is not taken).

State 1 is ordinary play and is the state of both view fixtures today:
`SystemSpaceView.burn-preview.test.tsx:256-259` seeds `cargo: {}`,
`cargoCapacity: 40`, and its tests assert the ceiling is present with a
current quote. So the sentence is false in the existing harness before any
code is written.

Second problem, the 2a-iii lesson: "each SHALL be present exactly when the
other is" is a SHALL on the ceiling, which `system-space-view` owns. Read
literally it requires the ceiling to be absent for a dry fleet.

Fix: make the biconditional about what the view supplies, and make the drawn
overlay one-directional, conditioned on the content requirement.

Paste-ready, replacing the first paragraph of the lifetime requirement from
"The mounting view SHALL supply" through "exactly as in any other state.":

```
The mounting view SHALL supply the strip a burn quote exactly while the view
holds a successful, current burn preview for the acting fleet and the current
selection, **as the view last read it**, and SHALL supply none otherwise.
The strip SHALL draw the cost overlay only while a quote is supplied, and
SHALL draw it for every supplied quote that the content requirement (*The
Fuel Gauge Draws the Served Fuel Cost of the Supplied Burn Quote as One
Start-Anchored Extent*) does not exclude. "A successful, current preview" is
the determination of *A Failed or Stale Preview Is Never Presented as a
Current Quote* applied to the withheld states of *Burn Preview Reflects the
Server-Solved Order, Without Committing* and to the committed selection of *A
Burn Order Committed From This View Withholds Its Quote and the Burn Command
for That Selection While It Is the Fleet's Running Burn, as Last Read*; this
requirement does not restate those states, their ends or their lags, and the
overlay inherits each of them from its owner. A stale or failed quote SHALL be
withdrawn from the gauge, never marked and kept. The quote the view supplies
is the one determination from which the burn command's fuel ceiling is
derived: the overlay SHALL NOT be drawn while that ceiling is absent, and
this requirement places no rule on the ceiling. WHEN a withheld preview
resumes, no overlay SHALL be drawn until the restoring response lands, and the
overlay then drawn SHALL be that response's.
```

(The canvas sentence is handled in A4.)

Paste-ready, replacing the scenario *The overlay and the fuel ceiling are
present together* (heading changed, since nothing live carries it yet):

```
#### Scenario: The overlay is never drawn without the fuel ceiling
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and a current quote of `fuelCostTons` 30, so that the overlay is
  drawn and the burn command's fuel ceiling is present
- **WHEN** a refresh fails over the shown figures, and then a later refresh
  succeeds
- **THEN** after the failure the overlay is not drawn and the ceiling is
  absent, and after the success the overlay is drawn and the ceiling is
  present
```

Task 3.3 already carries this walk; no task changes.

### A2 — MAJOR — "never the only carrier" binds the command panel from `system-console`

Against (content requirement, last sentence):

> "The extent SHALL NOT be the only presentation of the quote's affordability:
> WHILE it is drawn, the view's command surface SHALL present that same
> quote's affordability as text."

and the scenario *The overlay is never the only carrier of the quote's
affordability*.

Evidence.

- The owner says less. `system-space-view` *Burn Preview Reflects the
  Server-Solved Order, Without Committing* requires the view to render
  "whether that cost is currently affordable" (spec `:485`) and its scenario
  *An unaffordable preview is shown as such* asks only for "a state visually
  distinct from an affordable one" (`:625-629`). Nothing live says "as text".
  This clause is therefore a new obligation on the command panel, written in a
  capability that does not own the panel. Chain doc, 2a-iii Taught: "A clause
  about a new surface may only say what that surface contributes."
- It has a known expiry. Link 2b collapses the panel by default and link 4
  deletes `SpaceCommandPanel`. As written, link 4 would have to MODIFY a
  `system-console` gauge requirement in order to retire a panel.
- It is true in code today with no edit: `preview-affordable` renders whenever
  `preview` is non-null (`SpaceCommandPanel.tsx:307-315`), and `currentQuote`
  non-null implies `preview` non-null (`SystemSpaceView.tsx:793`).
- The scenario covers only `affordable: false`.

Fix: state it as a condition on what the view may supply to the strip, which
is this capability's own interface, and observe both values.

Paste-ready, replacing that last sentence:

```
The extent is decorative and is hidden from assistive technology with the
rest of the gauge; it SHALL NOT be relied on as the presentation of the
quote's affordability. The mounting view SHALL supply the strip a quote only
while that view also presents the same quote's affordability as text. This
capability places no rule on where or how the view presents that text.
```

Paste-ready, replacing the scenario:

```
#### Scenario: A drawn extent is always accompanied by the quote's affordability as text
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t
- **WHEN** an extent is drawn in the view for a quote whose `affordable` flag
  is false, and again for a quote whose flag is true
- **THEN** in each case the view presents that quote's affordability as text,
  and the text's value and the extent's state attribute are the same
```

Forward flag for link 2b's "read first" stays as the proposal has it, with one
change of wording: after 2b, either the view stops supplying the quote while
the panel is collapsed, or 2b gives the strip a text carrier. The clause above
stays true either way, which the draft's does not.

### A3 — MAJOR — "Both extents can be read on one rail" cannot be arranged at the tier it names

Against:

> "GIVEN a rail rendered at the 1280×720 CSS-pixel viewport floor with the
> fill at 20 % and the extent at 30 % (fuel 40 t, cost 60 t, capacity 200 t),
> and again with the fill at 40 % and the extent at 10 % (fuel 80 t, cost
> 20 t) ... this scenario is judged at the journey"

Evidence. Analysis section 8: the e2e stack spawns a fleet with 100 t of fuel
on a 200 t hold; nothing sets a fleet's fuel; a quote's cost is whatever the
random system's geometry gives; RULING 14 forbids a fuel-setting fixture. The
journey can show one arrangement by construction, a fill of 50 % with an
extent inside it. The extent-past-the-fill arrangement exists at the journey
only if the bounded probe of RULING 14 happens to arrange it. Neither named
tonnage pair can be produced. Tier 1 cannot judge paint (jsdom applies no
Tailwind CSS). So the scenario's GIVEN has no tier.

Paste-ready replacement:

```
#### Scenario: Both extents can be read on one rail
- **GIVEN** the system space view at the 1280×720 CSS-pixel viewport floor,
  with the acting fleet's fill and an overlay for a current quote both drawn
  at whatever lengths the reads serve
- **WHEN** a reviewer inspects a screenshot of the fuel gauge
- **THEN** the end of the fill and the end of the extent can each be located
  by eye in the same rail; this scenario is judged at the journey, not at
  tier 1, because a unit test cannot judge paint
- **AND** the arrangement in which the extent ends past the fill is judged
  only if the journey arranges one, and is otherwise recorded untested
```

Task 6.2 already says "paint legibility judged on screenshots"; add "at the
lengths served; the extent-past-fill arrangement only if the bounded probe
arranges it, else UNTESTED".

### A4 — MAJOR — the canvas-unavailable scenario cannot be arranged as tasked

Against the scenario *The overlay is drawn while the canvas is unavailable*,
the sentence "WHILE the canvas is unavailable, the overlay SHALL be drawn for
a current quote exactly as in any other state", and task 3.6:

> "3.6 SDET: test that the overlay is drawn for a current quote while the
> canvas region shows the unsupported or interrupted state"

Evidence. Both real-hook harnesses hard-code availability in their
`SpaceStage` mock: `SystemSpaceView.burn-preview.test.tsx:143` and
`SystemSpaceView.stranding-notice.test.tsx:136` call
`props.onAvailabilityChange?.(true)`. The six harnesses that can switch it
(`const stage = vi.hoisted(() => ({ available: true, ... }))`, for example
`SystemSpaceView.test.tsx:223-229`) all mock `useBurnPreview` to null and can
never show an overlay. So no existing file can hold both a current quote and
an unavailable canvas. Arranging it means editing the shared `vi.mock('./SpaceStage')`
factory in `burn-preview.test.tsx`, which every one of that file's 22 tests
runs through. Section 3's stated method is "add the fuel-bearing fixture
beside the existing ones". Also, the stage is mocked whole, so "the canvas
region shows the unsupported or interrupted state" is not observable there;
what is observable is the panel's `canvas-required-notice`
(`SpaceCommandPanel.tsx:243-248`).

The behaviour itself needs no code: `canvasAvailable` is not a term of
`currentQuote` (design.md, Open Question Q5).

Two ways out. I recommend the first because of A7.

Option 1 (recommended), shed the scenario to the filed follow-up. Delete the
sentence "WHILE the canvas is unavailable, the overlay SHALL be drawn for a
current quote exactly as in any other state.", the scenario, and task 3.6.
Add to the proposal's out-of-scope list:

```
- Pinning the overlay while the canvas is unavailable. The overlay is drawn in
  that state by construction (canvas availability is not a term of the view's
  current-quote determination; design.md Open Question Q5), and no real-hook
  view harness can arrange it without editing a shared mock. It joins
  `docs/handoffs/followup-explain-withheld-burn-command.md`, whose
  "Canvas unavailable with a selection held" entry already owns whether a
  preview is requested in that state.
```

Option 2, keep it and say what it costs. Replace task 3.6 with:

```
- [ ] 3.6 SDET: give this file's `SpaceStage` mock a hoisted availability
  switch defaulting to available (the `stage` idiom of
  `SystemSpaceView.test.tsx`), confirm the file's existing tests are green
  unedited, and test that with a current quote and the canvas reported
  unavailable the overlay is still drawn while the command panel shows its
  canvas-required notice (lifetime: "The overlay is drawn while the canvas is
  unavailable") [provisional, Q5]
```

and replace the scenario's WHEN and THEN:

```
- **WHEN** the canvas is reported unavailable and the command surface shows
  that plotting a course needs it
- **THEN** the overlay is still drawn, as the command panel's quote figures
  are
```

### A5 — MINOR — the non-boolean flag clause (the writer's judgement call): drop it

Against:

> "and so SHALL a quote whose served `affordable` flag is not a boolean"

the scenario *A flag that is not a boolean draws no overlay*, and the second
half of task 1.3.

Is it reachable? Not from a conforming server, and not through the types.

- `frontend/lib/types/fleet.ts:209` types it `affordable: boolean`.
- `frontend/lib/services/fleet-service.ts:73-79` casts the response with no
  runtime check, so a malformed body could carry anything; that is the only
  path.
- `backend/fleet/handler.go:307-322`: `Affordable bool \`json:"affordable"\``
  with no `omitempty`, and a comment saying it is served unconditionally on
  purpose.

Reasons to drop:

1. The guard is dead code under the type. The strip's input is typed
   `boolean` end to end (design.md Decision 2); the test has to cast through
   `unknown` to reach the branch.
2. It makes the two readers of one malformed quote disagree. The panel reads
   `!preview.affordable` (`SpaceCommandPanel.tsx:224`), so a missing flag
   shows an amber panel reading "Not affordable with the fuel aboard" beside a
   gauge that draws nothing.
3. It is a fourth state in which A1's biconditional fails.
4. Nothing else in the tree runtime-checks a served boolean. If malformed
   responses are a concern, the place is the service boundary, for every
   reader at once, and that is outside this link's Impact.

The degenerate-cost clause is different and stays: `NaN`, an infinity and a
negative are all values of type `number`, and the atom already guards
capacity the same way (`Gauge.tsx:61-63`).

Paste-ready: in the content requirement, replace

> "A cost that is not a finite, non-negative number SHALL draw no extent, and
> so SHALL a quote whose served `affordable` flag is not a boolean."

with

```
A cost that is not a finite, non-negative number SHALL draw no extent.
```

Delete the scenario *A flag that is not a boolean draws no overlay*. Replace
task 1.3 with:

```
- [ ] 1.3 SDET: test that a degenerate cost (NaN, infinite, -5) draws no
  extent and leaves the fill, the existing state attribute and the absence of
  the extent state attribute unchanged (content: "A cost that is not a finite
  non-negative number draws no overlay")
```

### A6 — MAJOR — task 5.1 duplicates a green guard, and half of it is false today

Against:

> "5.1 SDET: add a static guard test that the view has exactly one
> preview-request call site and that neither the strip nor the gauge imports a
> hook"

Evidence.

- The guard exists and is green: `frontend/hooks/use-burn-preview.call-site.test.ts:35-52`
  asserts exactly one production importer of `use-burn-preview` across `app`,
  `components`, `hooks` and `lib`, that it is `SystemSpaceView.tsx`, and that
  the view holds exactly one `useBurnPreview(` call. It already fails if
  `VitalsStrip.tsx` or `Gauge.tsx` imports the hook. A new test for the same
  claim cannot be written red.
- "Neither the strip nor the gauge imports a hook" is false at HEAD:
  `VitalsStrip.tsx:25` imports `useRef` (the clock cell's latch), and
  `VitalsStripFleetCell.tsx:20` imports `useEffect`, `useRef`, `useState`. A
  test of the sentence as written is red forever or forces an edit outside
  Impact.
- The task names no file, and the proposal's test-file list has none for it.

Paste-ready: delete task 5.1, renumber 5.2 to 5.1, and replace section 5's
ownership line with:

```
Ownership: the nextjs-dev implements 5.1 and ticks it. Wiring edits only
`SystemSpaceView.tsx` among production files beyond the section 1 and 2
files; `use-burn-preview.ts` and `SpaceCommandPanel.tsx` are not edited (Q7
as drafted). The static half of "The overlay is silent and costs no request"
is already held by `frontend/hooks/use-burn-preview.call-site.test.ts` (one
importer of the preview hook, the view), which this change does not edit and
which fails if the strip or the gauge imports the hook.
```

### A7 — MAJOR — tasks.md is 46 arrangement groups, not 39

Against the tasks file as a whole (39 boxes, cap 40). Counted one task per
test arrangement group, the unit `clear-burn-preview-on-commit` RULING 13
set; a parametrised table over one arrangement is one.

| Task | Boxes | Honest | Why |
| --- | --- | --- | --- |
| 1.1 | 1 | 1 | |
| 1.2 | 1 | 1 | one cost-to-width table (250, 200, 0) |
| 1.3 | 1 | 2 | degenerate cost and non-boolean flag vary different inputs |
| 1.4 | 1 | 1 | |
| 1.5 | 1 | 1 | |
| 1.6 | 1 | 2 | invariants with an extent drawn; identical subtree with the input omitted |
| 1.7, 1.8 | 2 | 2 | |
| 2.1, 2.2 | 2 | 2 | |
| 2.3 | 1 | 3 | omitted quote plus hold subtree; no-data fuel gauge; draining marker. Three fixtures. |
| 2.4, 2.5 | 2 | 2 | |
| 3.1 | 1 | 1 | |
| 3.2 | 1 | 2 | no selection needs no click; pending and failed-first share one |
| 3.3, 3.4 | 2 | 2 | each is one walk |
| 3.5 | 1 | 2 | three withheld arrangements as a table; the resume is its own walk |
| 3.6-3.9 | 4 | 4 | |
| 4.1 | 1 | 1 | |
| 4.2 | 1 | 2 | once a read has answered, "no read has since answered and the next one fails" is a separate branch |
| 4.3-4.6 | 4 | 4 | |
| 5.1, 5.2 | 2 | 2 | |
| 6.1-6.9 | 9 | 9 | |
| **Total** | **39** | **46** | |

Shed list, to a filed follow-up or by merging, never to a new link (analysis
section 5: the atom-and-strip half and the wiring half are not separately
shippable). Each line names what is lost.

| # | Shed | Saves | Lost |
| --- | --- | --- | --- |
| S1 | Task 5.1 (A6) | 1 | nothing; the guard exists |
| S2 | The non-boolean flag clause, scenario and half-task (A5) | 1 | a guard for a malformed response |
| S3 | Task 1.8 folded into 6.1 (A8) | 1 | nothing; tier 0 runs the colour validator on changed files |
| S4 | The canvas-unavailable scenario and 3.6 to the follow-up (A4, option 1) | 1 | a pin on a state drawn by construction |
| S5 | Merge 2.1 into 2.2: the strip's affordable and unaffordable pair IS the flag-versus-picture pair | 1 | nothing; the disagreeing tonnages are a stricter version of the same pair |
| S6 | 2.3's no-data row: keep it at the atom only (1.5) | 1 | a strip-level repeat; `FuelCell` adds no branch for it |
| S7 | 1.6's omitted-input test: covered by the 18 unedited `Gauge.test.tsx` tests staying green and by 2.3's identical hold subtree | 1 | an explicit atom-level statement |
| S8 | Drop *A failed own-fleets read in the gap leaves the overlay withdrawn* | 1 | an inherited sub-case of the committed selection's life; a reader that passes the acceptance row cannot fail it without re-deriving committed-ness |

46 minus S1-S6 is **40**; taking S7 and S8 as well gives **38** and two tasks
of room for the adversary. S8 removes a scenario and is the writer's and
orchestrator's call; the lifetime requirement says it "does not restate those
states", and that scenario is such a restatement.

If S5 is taken, replace tasks 2.1 and 2.2 with:

```
- [ ] 2.1 SDET: test that a supplied quote draws the extent on the fuel
  gauge's scale with its state copied from the flag, as a parametrised pair
  whose tonnages disagree with the picture (fuel 40 t, cost 60 t, flag true:
  extent 30 % past a 20 % fill, state affordable; fuel 80 t, cost 20 t, flag
  false: extent 10 % inside a 40 % fill, state unaffordable), with the fill
  unchanged, so an implementation deciding state by geometry fails both
  (content: "A supplied quote draws one extent on the gauge's own scale", "An
  affordable quote's extent...", "An unaffordable quote's extent...", "The
  flag wins when the extent runs past the fill", "The flag wins when the
  extent lies inside the fill")
```

Two wording notes that change no count:

- 3.3 says "that the overlay reads the view's current-quote determination and
  not the hook's raw preview". A test cannot assert which variable is read.
  Write "so that an implementation reading the hook's raw preview fails".
- 4.5 switches the acting fleet by `fleet-row-<id>`
  (`stranding-notice.test.tsx:1455`); that harness's stage mock has no
  fleet-activation trigger. Say so in the task so the SDET does not add one.

### A8 — MINOR — task 1.8 credits the colour gate with checks it does not make

Against:

> "1.8 nextjs-dev: run the colour-compliance gate ... and fix any new tone
> class that lacks its dark variant on the same line or introduces red or
> blue"

Evidence. I ran `harness/check-color-compliance.py` on a probe file holding
`'bg-red-500'`, `'bg-blue-500 dark:bg-blue-400'`, `'bg-amber-500'` (no dark
variant) and `'bg-zinc-700'` (no dark variant). All four lines passed with no
error and no warning. The script's rules (`:61-102`) are: `gray`/`slate`/
`neutral` scales and `dark:bg-zinc-900` as errors; `dark:bg-zinc-800`,
`bg-black`, and exactly three classes without a same-line dark variant
(`text-zinc-900`, `bg-zinc-100`, `border-zinc-200`) as warnings; hex colours
in inline styles as warnings. It has no rule about red, blue or amber.

So the gate cannot hold RULING 4. The tier-1 class assertions hold it (task
1.4 and the strip-wide "no red or blue class" row). The script is also already
run on changed files by tier 0 (`docs/testing-tiers.md`, row 0), which 6.1
covers.

Paste-ready: delete task 1.8 and extend 1.4:

```
- [ ] 1.4 SDET: test the extent state attribute as a pair, affordable and
  unaffordable copied from the flag, with the unaffordable extent carrying a
  class in the amber family, the affordable extent a zinc class pair already
  present in the gauge's own shades, each tone class carrying its dark variant,
  and no class naming red or blue anywhere in the gauge (content: "An
  affordable quote's extent carries the affordable state", "An unaffordable
  quote's extent carries the unaffordable state in amber"); this test, not the
  colour validator, is what holds the palette rule: the validator has no rule
  for red, blue or amber
```

The candidate pairs in design.md Decision 6 (`bg-zinc-700 dark:bg-zinc-600`,
`bg-amber-500 dark:bg-amber-400`) pass the script clean.

### A9 — MINOR — UX's end mark is implementable, but not as a child of the extent

Against the content requirement's "The extent SHALL be a single element,
separate from the fill", read together with UX finding U1's note "the mark is
a child of the extent element".

Evidence. The rail is `relative overflow-hidden rounded-full`
(`Gauge.tsx:85`), 40 px wide (`VitalsStrip.tsx:83`). U1's own case is an
extent of 0.2 % (0.08 px). A fixed-size child anchored to the end of that
extent, inside it, lies almost wholly to the left of the rail's start and is
clipped. A child placed just past the extent's end is clipped whenever the
extent is clamped to 100 %, which is the most unaffordable case there is.
Either way the mark is invisible exactly where U1 needs it.

What is implementable (design.md Decision 7): the mark as a second element, a
sibling of the extent inside the rail, with its own inline `left` clamped so
the whole mark stays inside the rail, its presence keyed to the state
attribute. jsdom may discard a `clamp()` or `calc()` inline value, so tier 1
can assert the mark's presence and size, not its position; U1's scenario
asserts presence and equal size and is fine.

Also: "a single element" is DOM structure in a requirement. What the
behaviour needs is that the extent is distinct from the fill and leaves it
unchanged.

Paste-ready, replacing "The extent SHALL be a single element, separate from
the fill, anchored at the gauge's start as the fill is." (use the second
sentence only if U1 is adopted):

```
The extent SHALL be drawn separately from the fill, anchored at the gauge's
start as the fill is, and SHALL leave the fill's own length unchanged.
[If U1 is adopted:] The unaffordable mark is drawn separately from both and
SHALL remain wholly inside the rail at every cost, including a cost of zero
and a cost at or above the capacity.
```

If U1 is adopted it adds one arrangement group to section 1 (A7's total
becomes 47 before sheds).

### A10 — MINOR — the refuel scenario asserts a cause no harness can observe

Against *A refuel moves the fill before it moves the overlay*:

> "THEN the fill spans 40 % of the rail and the overlay's state attribute
> still reads unaffordable, and no preview request has been sent because of
> the refuel"

Evidence. Task 3.9 places this in `SystemSpaceView.burn-preview.test.tsx`,
where "a refuel" can only be a changed answer from the mocked own-fleets read
(`setFleets`, `:337-344`). `useRefuel` is mocked inert in that file
(`:108-117`) and in the stranding-notice file, so no view harness runs the
real mutation or its invalidations. A build that added a preview invalidation
to the refuel mutation would pass this scenario. RULING 13 says no
invalidation is added, which is a non-edit; a test that could see it belongs
to `use-market`'s own tests, outside this link's Impact, and I do not
recommend adding it.

Paste-ready replacement of the scenario, stating only what the tier observes:

```
#### Scenario: The fill can move before the overlay does
- **GIVEN** the acting fleet serves 20 t of fuel against a `cargoCapacity` of
  200 t, and the current quote of `fuelCostTons` 30 reads unaffordable
- **WHEN** the own-fleets read next reports 80 t of fuel aboard, before the
  next preview refresh is due
- **THEN** the fill spans 40 % of the rail, the overlay's state attribute
  still reads unaffordable, and the number of preview requests sent is
  unchanged
- **AND** when the next preview response lands with `affordable` true, the
  overlay's state attribute reads affordable
```

Update task 3.9's citation to the new heading.

### A11 — MINOR — the only view-level flag-versus-picture row does not state its own fuel

Against *A later successful refresh restores the overlay at the new cost and
state*:

> "GIVEN a failed refresh has withdrawn the overlay / WHEN a later refresh
> succeeds with `fuelCostTons` 45 and `affordable` false / THEN the overlay is
> drawn spanning 22.5 % of the rail with its state attribute reading
> unaffordable"

Evidence. The strip and atom rows hand-set the flag, so they cannot fail an
implementation that computes affordability at the view's wiring (for example
`cost <= fuel` at the `<VitalsStrip>` mount). The only rows that can are
view-level rows where the flag and the picture disagree. This is the one: 45 t
inside a fill of 80 t, flag false. But the 80 t lives in the previous
scenario's GIVEN, so the scenario does not stand alone, and nothing tells the
SDET this row is load-bearing.

Paste-ready replacement:

```
#### Scenario: A later successful refresh restores the overlay at the new cost and state
- **GIVEN** the acting fleet serves 80 t of fuel against a `cargoCapacity` of
  200 t, and a failed refresh has withdrawn the overlay
- **WHEN** a later refresh succeeds with `fuelCostTons` 45 and `affordable`
  false
- **THEN** the overlay is drawn spanning 22.5 % of the rail, inside the fill
  of 40 %, with its state attribute reading unaffordable, as the response's
  flag does
```

### A12 — MINOR — "no numeric extent attribute" against the inline geometry the scenarios measure

Against:

> "The extent SHALL carry no figure, no text, no raw-value attribute, no unit
> attribute, no numeric extent attribute and no accessible value"

Evidence. Every geometry scenario measures the extent's length ("spanning
15 % of the rail"), and RULING 12 with analysis section 3 has tests read it
from the element's inline style, as `Gauge.test.tsx:135-175` reads the fill.
An inline `style` is an attribute that carries a number. An adversary can
read the clause as forbidding the mechanism the scenarios depend on. The live
fuel scenario already distinguishes the two ("with the fill geometry
ignored").

Paste-ready replacement of that phrase:

```
The extent SHALL carry no figure, no text, no raw-value attribute, no unit
attribute, no accessible value, and no attribute stating its length or the
cost as a number; its drawn geometry, like the fill's, is the only place its
length appears.
```

### A13 — MINOR — two scenarios restate `system-space-view` rules as `system-console` THENs

Against *A withheld preview draws no overlay and no no-quote state*:

> "THEN in each arrangement no overlay is drawn and the command panel shows no
> no-quote state"

and *The overlay is silent and costs no request*:

> "AND exactly one fresh preview request is sent per elapsed refresh interval
> while the preview is shown, with the strip and the command panel both
> mounted, and none between"

Evidence. Both second halves are live `system-space-view` scenarios, word for
word in substance: *A withheld preview is never presented as a failed one*
(under *A Failed or Stale Preview Is Never Presented as a Current Quote*) and
*The preview refreshes on exactly one named interval while shown* (spec
`:612`; the first is at `:815`), each already tested at the view
(`SystemSpaceView.burn-preview.test.tsx:438`, `:684`). The lifetime
requirement says it "does not restate those states". Restated here, a later
change to either owner has to touch `system-console` too.

Paste-ready. Rename the first scenario and trim its THEN:

```
#### Scenario: A withheld preview draws no overlay
- **GIVEN** an overlay is drawn for the current selection
- **WHEN** the view's last reads report, in turn, a running mine for the acting
  fleet whose ETA has not passed, then the acting fleet in lane transit, then
  the selection as the body the acting fleet is attached to
- **THEN** in each arrangement no overlay is drawn
```

Replace the second scenario's AND:

```
- **AND** the number of preview requests sent across those three is the number
  the refresh interval alone accounts for: drawing the overlay adds none
```

Update the citations in tasks 3.5 and 3.8.

---

## Review answers that are not findings

**Capability boundary.** The placement is right. Everything the delta says
about content is the gauge's; everything about lifetime is written as what
the mounting view supplies to the strip, which `system-console`'s Purpose
already makes its interface ("renders only figures the mounting view
supplies"). Nothing in the delta needs a `system-space-view` delta, so RULING
8 holds on reading. The three places the delta reaches into the other
capability are A1 (the ceiling), A2 (the panel's text) and A13 (two restated
THENs).

**Feasibility against the component tree.** Every content scenario is
buildable with one optional prop on `Gauge`, one on `FuelCell`, one on
`VitalsStrip`, and one expression in `SystemSpaceView.tsx`. No lifetime
scenario needs code beyond that expression: each is `currentQuote` going null
or non-null by logic three predecessor links built. A refresh in flight keeps
the overlay (`query.data` is retained and there is no error); a refused commit
changes nothing it reads.

**Scenarios a wrong implementation still passes.** A reader of
`burnPreview.preview` passes every lifetime scenario except *A failed refresh
withdraws the overlay and nothing else* and the ceiling scenario (A1). A
second, identical derivation written at the mount passes everything; review
holds it. A state copied by an effect passes everything under `act`; design.md
Decision 8 excludes it. An affordability computed at the wiring passes every
strip and atom row and fails only the restore row (A11). A gauge that decides
state by geometry fails both flag-wins rows. Details: design.md Decision 1.

**Tier.** Paint cannot be judged at tier 1; A3 is the one scenario affected.
The tone scenarios are testable at tier 1 as class tokens only (A8).

**Edits outside the stated Impact.** None is forced if A4 option 1 and A6 are
taken. Otherwise: A4 option 2 edits a shared mock in a listed test file,
which the proposal's "new fuel-bearing fixtures beside the existing ones"
does not describe, and 5.1 needs a file the proposal does not list. Inside
Impact but easy to miss: `Gauge.tsx:20-25`'s header comment ("The one state
this element DOES carry is `data-gauge-state`") goes false and must be
updated in the same edit. No static guard in `frontend/lib` or
`frontend/hooks` is line-anchored to `Gauge.tsx`, `VitalsStrip.tsx` or
`SystemSpaceView.tsx`.

## Recommendations on the four panel questions

**Q2, overlay on a no-data gauge: no overlay, as drafted.** The extent is
drawn on the fill's scale, so the gauge's one validity predicate gates both
and the atom gains no second state ("valid capacity but no fuel"). The other
answer forces a MODIFIED block on *The Fuel Cell Shows the Served Fuel Tonnage
and Estimated Range Over a Gauge*, carrying four headings verbatim (*The fuel
cell shows tonnage and range*; *An unserved roster reads absent, and the gauge
shows no fill*; *A fleet holding no fuel reads absent, exactly as its roster
row does*; *The gauge's no-data state is DOM-distinguishable from a sub-pixel
fill*), to say what "no fill" and the no-data attribute mean beside a drawn
cost. "No overlay" also composes with RULING 11's later fix with no edit.
Cost: a dry fleet sees no overlay; its panel says "Not affordable with the
fuel aboard". This ruling is what makes A1 a blocker rather than a nicety.

**Q4, painting, technical half.** The extent is the rail's last child, painted
over the fill by DOM order, absolutely positioned with inline `left` and
`width`, its tone and vertical placement static classes from a two-entry map.
No minimum width; the fill is not edited. Implementable on the 6 px rail
without touching the fill's geometry: a partial-height band, translucency, an
outline, an end tick. The band is the only one that keeps both ends locatable
whichever is longer without leaning on tone contrast; a vertically centred
band is clipped least by the 3 px rounded cap. Not implementable inside the
fences: under-the-fill (invisible whenever cost is at or below the fuel
aboard), a hatch (needs a gradient), a larger rail, a pulse. UX's end mark is
implementable under A9's condition. One weakness for UX to judge on the
screenshot: in the dark scheme no zinc shade already on the gauge contrasts
well with both the light fill and the dark rail.

**Q5, overlay while the canvas is unavailable: drawn.** It is drawn by
construction, because canvas availability is not a term of the current-quote
determination, and withholding it for the strip alone would be a second
derivation that disagrees with the panel about one quote. I recommend not
pinning it with a scenario in this link (A4, option 1): the pin costs a shared
mock edit, and the filed follow-up already owns that state.

**Q7, the panel's styling under a stale quote: not touched.** The panel marks
a stale quote and the gauge withdraws it; each is true to its own
requirement, and A2's rewritten clause holds because nothing is supplied to
the strip while the quote is stale. Editing `SpaceCommandPanel.tsx` is outside
Impact, link 4 deletes the file, and the follow-up already proposes to change
the requirement that governs it.

## Honest task count

**46** as drafted, against 39 boxes. **40** after S1-S6; **38** after S1-S8.
If UX's U1 is adopted, add one.
