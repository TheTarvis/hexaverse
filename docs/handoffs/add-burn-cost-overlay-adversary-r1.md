# `add-burn-cost-overlay` — adversary round 1

- Change: `openspec/changes/add-burn-cost-overlay/` (link 2a-iv of `docs/plans/system-hud/chain.md`)
- Round: 1 of at most 3
- Date: 2026-10-05
- Base commit: `d965f5d`; the change's content is uncommitted
- Mode: change (spec versus design input). Read whole: proposal, design.md, tasks.md, the delta, the rulings ledger, the chain doc's link sections and Taught records, live `system-console`, the cited `system-space-view` requirements, `Gauge.tsx`, `VitalsStrip.tsx`, `use-burn-preview.ts`, `SpaceCommandPanel.tsx`, the relevant parts of `SystemSpaceView.tsx` and `backend/fleet/service.go`. No suite, stack or git command that changes state was run.

Paths below: `delta` = `openspec/changes/add-burn-cost-overlay/specs/system-console/spec.md`; `tasks`, `proposal`, `design` are the files beside it.

Summary: 1 BLOCKER, 4 MAJOR, 7 MINOR. No fence is crossed. No ruling's stated basis was found missing from its source. The findings concentrate on the unaffordable mark and the band's height: both are stated in prose and neither is held by a scenario or task that a wrong build fails.

---

## BLOCKER

### B1 — A mark parked outside the rail at a cost at or above capacity passes the scenario and the task, and the three documents disagree about what tier 1 asserts

Clauses.

- delta:120-132, scenario *The unaffordable mark sits at the extent's end along the rail*: "at a cost of 250 the mark's position along the rail is the rail's end" and "in each case the mark's position is read from its own position relative to the extent's length".
- tasks:18 (2.2): "asserts the mark's position follows the extent's length (the mark's position equals the extent's length in percent at each cost: 0, 50 and 100), so a mark parked at the rail's start fails; pixel containment inside the rail is not asserted at tier 1 (jsdom does no layout) and is held by review and the journey".
- proposal:32: "the mark's position inside the rail is held by review, since tier 1 cannot read a clamped inline value".
- design:308-312: "Task 2.2 asserts the mark's presence and size and leaves its position to review." design:493 repeats it ("Position is assertable there but task 2.2 does not assert it").

Attack. The wrong build is `left: pct%` on the mark with no `translateX`. It satisfies task 2.2 exactly as written (`style.left` reads 0, 50 and 100, equal to the band's width). At a cost of 250 on a 200 t capacity the mark's leading edge is at 100 % of an `overflow-hidden` rail (`Gauge.tsx:85`), so the whole mark is clipped. The scenario's "the mark's position ... is the rail's end" does not say which edge of the mark, so this build also satisfies the scenario text. The requirement prose (delta:40-45, "wholly inside the rail at every cost", "flush with the rail's end") forbids it, but nothing a test runs does.

This is the central claim failing in its commonest severe case. By `backend/fleet/service.go:584-589` a fuel-tracked fleet with no refund cannot afford a cost above its capacity, so "cost at or above capacity" is almost always "unaffordable". That is where this build draws a full-rail band and no mark, leaving hue as the only difference between the states, which RULING 16 exists to prevent. Architect A9 said the same of the earlier child-of-extent shape ("clipped whenever the extent is clamped to 100 %, which is the most unaffordable case there is").

The journey does not close it: tasks:61 asserts the unaffordable overlay "only if a bounded probe arranges one, else logged UNTESTED", and analysis § 8 records that no e2e spec has ever observed `data-affordable="false"`.

The stated reason for not asserting it is false at this design. design:281-289 chose a plain percentage `left` plus `translateX(-pct%)` specifically because jsdom stores both verbatim, and design:302 lists "the pull-back is the same percentage" as a tier-1 "yes". There is no clamped inline value to be unreadable. proposal:32 and tasks:18 carry the reasoning from the superseded `clamp()` design.

Document contradictions inside this one clause:

- design:308 says 2.2 leaves position to review; tasks:18 asserts position (the `left` half only).
- proposal:32 says tier 1 cannot read the value; design:281-302 says it can.
- design:275-277 quotes requirement text ("at the extent's end, displaced only as far as it must be to remain wholly inside the rail") that is not in the delta.
- delta:130-131 ("the mark's position is read from its own position relative to the extent's length") is not a decidable THEN in any reading.

A repair must achieve: a tier-1 row that the untransformed build fails (the two equalities design:301-302 already names are enough, in 2.2's existing arrangement, so no new task); a scenario THEN that says which edge of the mark is where at the three costs, in words a reader can decide (for instance: at a cost at or above capacity the mark's trailing edge is at the rail's end and no part of the mark lies past it); and proposal, design and tasks saying the same thing about what is asserted and what is left to review. The proposal's "held by review" cost line should then shrink to what remains unobserved: pixels and the rounded cap.

---

## MAJOR

### M1 — The band's part-height SHALL has no scenario and no test; a full-height band passes all 36 scenarios and hides the fuel fill whenever cost is at or above the fuel aboard

Clause. delta:8-11: "The extent SHALL occupy only part of the rail's height, so that the end of the fill remains visible in the part of the rail the extent does not cover, both when the extent ends before the fill's end and when it ends after it."

Attack. The wrong build gives the band `inset-y-0`. Every tier-1 row reads the band's `left`, `width`, the state attribute and colour-family tokens; none reads its height. tasks:11 (1.7) tells the developer "part-height", but no SDET task in sections 1-4 asserts it, and design's Decision 5 table has a size row for the mark only. At the journey, "Both extents can be read on one rail" (delta:209-223) samples fill, extent and rail and asserts they differ pairwise. With a full-height band shorter than the fill, the fill is still sampleable to the band's right, so the leg passes. The arrangement that exposes the defect (band longer than the fill, covering it entirely) is judged "only if the journey arranges one" (delta:222-223).

The result is a gauge on which the fuel fill disappears for every quote costing at least the fuel aboard, which is the mock's own example (53.8 t against 47.2 t). design:434 ("Band under the fill: invisible whenever cost is at or below the fuel aboard") shows the author knew the layering matters; the spec has no row for it.

A repair must achieve: one decidable observation of part-height at tier 1 (the same kind of static-class assertion design:300 uses for the mark; it rides 1.1 or 1.4), and a scenario or an AND on an existing one stating it, so the SHALL is not prose-only.

### M2 — The mark's visibility has no decidable criterion: no size floor, no paint difference from the band, and the one paint scenario does not sample it

Clauses.

- delta:37-39: "one mark SHALL be drawn that spans the rail's full height and whose size does not depend on the cost".
- delta:117-118: "is the same size as in the same strip supplied a quote of `fuelCostTons` 30".
- delta:201-207 (colour families) and delta:214-218 ("the sampled colours of the fill, the extent and the rail differ pairwise").

Attack. Three wrong builds pass every scenario:

1. A mark with no width (or 1 px). "Same size at both costs" holds for a zero-width element; tasks:18 asserts identical size across costs and nothing else about size. design:300 would assert `w-1` and `inset-y-0`, but that is design text, not a task, and the delta gives no floor.
2. A mark painted in the band's own amber. Task 1.4 asserts only that the mark's classes are amber- or zinc-family with dark counterparts. A mark the same tone as the unaffordable band is invisible wherever it overlaps the band, which is always (delta:42-43: "the extent's end always lies on the mark").
3. A mark that does not span the rail's height. No row reads it.

delta:47-49 says the two states "SHALL differ in the presence of the mark as well as in paint, so that the extent's affordability does not depend on telling two paints apart". DOM presence satisfies that sentence; perceptible presence is what it means. The paint scenario names fill, extent and rail only, so even a journey that arranges an unaffordable overlay records nothing about the mark.

A repair must achieve: the requirement stating the mark's visibility in decidable terms at behaviour altitude (it is wider than zero and its width is fixed; its paint differs from the unaffordable extent's); a tier-1 assertion of the static size classes and of the mark's colour tokens differing from the band's (both ride 1.4 or 2.2); and the journey paint scenario adding the mark to the sampled set when an unaffordable overlay is arranged, UNTESTED otherwise as already ruled.

### M3 — An affordability computed at the wiring as `flag && cost <= fuel` passes every view-level row; design's "load-bearing restore row" claim is false for it

Clauses.

- tasks:31 (3.4): "the restore row is load-bearing because it is the only row where the served flag and the picture disagree at the view, so an affordability computed at the wiring fails only here".
- design:90: the wrong-reader table's row "an affordability computed at the mount (`cost <= fuel`) ... Rows that fail it: the view-level restore row (cost 45 t inside a fill of 80 t, flag false)".
- delta:251-252: "The overlay's cost and state SHALL be those of the newest preview response the view holds."

Attack. Every view-level row and its (fuel, cost, flag): 3.1 smoke 80/30/true; 3.4 80/30, 80/36, then 80/45/false; 3.5 80/30 and 80/50; 3.8 a true and a false quote; 3.10 20/30/false then 80/30/true. In none of them is the flag true while the cost exceeds the fuel aboard. So a wiring of `affordable: q.affordable && q.fuelCostTons <= fuel` yields the served flag in every row and passes sections 3 and 4. It is wrong in the refunded re-target (flag true, cost above fuel), one of the two states RULING 3 names, and it is client affordability arithmetic, which is a hard fence. The strip-level pair in 2.1 hand-sets the flag and cannot see the wiring (design:497 says so).

This is the 2a-iii Taught lesson again: "Every 'whether or not', 'both' and 'exactly once' needs a row a one-sided build fails."

A repair must achieve: one view-level row in which the response's flag is true and its cost exceeds the fixture's fuel aboard, asserting the state attribute reads affordable. It can ride an existing arrangement by changing a tonnage (3.5's second target or 3.4's 36 t answer), so no new task; a lifetime scenario should carry the concrete tonnages, as the restore scenario does for the other direction.

### M4 — "A refresh that has been sent and has not answered SHALL leave the overlay as the last successful response drew it" has two readings after a failed refresh, and no row decides between them

Clause. delta:241-243, immediately after "A stale or failed quote SHALL be withdrawn from the gauge, never marked and kept."

Attack. Arrange: a quote at 15 %, a refresh fails (overlay withdrawn), then the next interval's refresh, or the panel's "Retry quote", is sent and has not answered. Reading 1: nothing changes, the overlay stays withdrawn. Reading 2: the overlay is shown "as the last successful response drew it", that is 15 % again. Reading 2 re-presents a quote the view has marked stale as current, against RULING 5 and the sentence before it. A build that keys currency on `isFetching` produces it.

The tree gives reading 1 (React Query keeps `error` while a refetch over existing data is in flight, so `stale` holds at `use-burn-preview.ts:92-99`), but the scenarios do not pin it. *A refresh in flight never blanks the overlay* (delta:275-281) starts from a good quote. *A later successful refresh restores the overlay* (delta:292-299) asserts only the state after the success. The 3.4 walk (tasks:31) goes failure then success, with no assertion while the post-failure request is pending.

A repair must achieve: the sentence saying that a request in flight changes nothing (a drawn overlay stays drawn as the newest successful, non-superseded response drew it; a withdrawn one stays withdrawn until a response succeeds), and the refresh walk asserting no overlay while the request after the failure is pending. It rides 3.4.

---

## MINOR

### m1 — The proposal miscounts the scenarios

proposal:15: "2 ADDED: 17 and 18 scenarios". The delta has 18 and 18 (36, which is the number the brief and the validator see). Correct the count.

### m2 — The lag clause omits the round trip and states a world truth the same requirement contradicts

delta:255-256: "the overlay can lag the fill by at most one preview refresh interval, and nothing but the preview's own refresh changes it."

The lag runs until the next preview response lands, which is up to one interval plus that request's round trip; and if that refresh fails the overlay is withdrawn, not updated. "Nothing but the preview's own refresh changes it" is false as written: a selection change, a fleet switch, a withheld state and a commit each withdraw it, by this requirement's own scenarios. This is the shape 2a-iii's Taught record names ("a clause about a new surface may only say what that surface contributes"). A repair should scope the sentence to what a change in the fuel aboard does of itself (nothing; no preview request) and state the bound as "until the first preview response requested after the change lands, that request being sent no later than one refresh interval after it".

### m3 — The no-data exclusion is defined by a parenthetical narrower than the live definitions, and "exactly"/"every" reach a state the proposal says is unruled

delta:19-22 defines "a gauge that holds no data" as "(a `cargoCapacity` that is unserved or not positive, or no served fuel tonnage)". Live `system-console` also makes the fuel cell absent after a failed own-fleets read (spec.md:39-45; Fan-In, `system-space-view` spec.md:112-116), and `Gauge.tsx:61-63` treats a non-finite capacity as no data. With delta:230-233 ("SHALL draw it for every supplied quote that the content requirement does not exclude"), the delta's text mandates an overlay in the failed-read state over a retained roster, while proposal:25 says "This change writes no overlay rule for that state". Smallest repair: define the exclusion by reference only (no extent while the gauge's existing state attribute reads its no-data value, as the live requirements define that state) and drop the parenthetical.

### m4 — "No other new palette entry" is undecidable against design's own tokens; "the unaffordable state SHALL be painted in the amber family" versus the mark's zinc edge

delta:30-34. design:330-336 introduces `bg-amber-800`, `border-zinc-900` and `dark:border-zinc-950`, none of which appears under `frontend/components/space` or `frontend/components/fleet` today. If "palette entry" means a shade token, design breaks the delta; if it means a family, the sentence should say so. The mark, which is the unaffordable state's own element, carries a zinc border, which delta:201-205 allows and delta:30-32 does not obviously allow. Repair: say "no colour family other than amber and zinc", and say the amber rule is about the extent's paint.

### m5 — Two absence scenarios can be satisfied on a gauge that could never draw an overlay

delta:266-273 (*A first preview still pending draws no overlay*, *A failed first preview draws no overlay*) carry no GIVEN establishing a fuel-bearing gauge and no positive control. Written against the existing fixture (`cargo: {}`, capacity 40) they pass whatever the wiring does, which is the trap tasks:26 itself warns about; and on the fuel-bearing fixture no plausible build fails them, since no cost exists yet. Repair: give both the 80 t on 200 t GIVEN, and have 3.3 end each arm with the control (the response lands, or the retry succeeds, and the overlay is then drawn).

### m6 — The 2b forward flag says the rule "stays true either way"; it does not for the lifetime requirement

proposal:37 and tasks:68 (6.9a): "either the view stops supplying the quote while the panel is collapsed, or 2b gives the strip a text carrier; the rule stays true either way". Under the first option delta:227-229 ("SHALL supply the strip a burn quote exactly while the view holds a successful, current burn preview") becomes false, so 2b must MODIFY this requirement. The flag should say so, or the next link inherits an "X is unaffected" that is wrong.

### m7 — Loose THENs

- delta:216-218: "differ pairwise" has no definition. Any one-step difference in one channel passes, and anti-aliasing supplies that. RULING 16 rules out a ratio gate, not a definition; say what counts as differing (for instance, exact sRGB inequality of the sampled centre pixels of each region, with the regions' sample points named), and say the leg is UNTESTED when the served extent is too short to sample (under 5 t is under one pixel; the band is 2 px high).
- delta:198-199: "the text's value and the extent's state attribute are the same". One is copy or a `true`/`false` attribute, the other reads `affordable`/`unaffordable`; state the correspondence.
- delta:16, 140: "no marker" for the clamp, beside "the mark" and "the draining marker". Three near-identical nouns in one requirement; delta:140 ("it carries no marker") sits next to scenarios about the mark's presence.
- delta:218-221: process statements ("judged at the journey, not at tier 1", "the journey record states ...") inside a scenario's THEN/AND. They are the proposal's and tasks.md's to say.

---

## Verdict

**NOT CLEAR** — 1 BLOCKER (B1), 4 MAJOR (M1-M4), 7 MINOR. Every repair above rides an existing task's arrangement; none needs a new task, a new production file or a ruling to be reopened.

## Checked and found sound (do not re-attack in round 2 unless the revision touches it)

- **Fences.** No backend field, endpoint or query. No client affordability, shortfall or remainder arithmetic in the delta or design (M3 is a missing test row, not a sanctioned computation). No cost or shortfall text on the strip. Amber and zinc families only (m4 is wording). No galaxy-view work. Nothing replaced is kept.
- **Rulings' bases.** RULINGs 2, 3, 5, 6, 8, 9, 11, 12, 13 and 14 each quote text that is in the cited source (chain doc lines 136-138, 263-265, 577-581, 678-679, 762-765, 785-790; live `system-console` spec.md:471-474; live `system-space-view` spec.md:582-584; archived `add-vitals-strip` design.md:101). RULING 11's code citations hold at `d965f5d` (`VitalsStrip.tsx:242,264-265`; `SystemSpaceView.tsx:1072`). RULING 3's predicate holds (`backend/fleet/service.go:584-589`; note a third term the client lacks, `FuelActive`).
- **"No delta" claims against live text.** `system-console` *The Hold Cell...* ("the gauge itself SHALL expose no figure, no fill percentage and no accessible value"): the new attribute is a two-valued state and the band's inline width is the same kind of geometry the fill already carries. *The Fuel Cell...* no-fill and no-data clauses: untouched given RULING 15. *The Strip Carries No Verb*, *Issues No Read of Its Own*, *Announces Only Its Own Balance Changes*, the width floor: no sentence becomes false. Fan-In's strip-driver sentence: already non-exhaustive at HEAD (the running-mine read feeds the pill through `rosterRowStatus`, `SystemSpaceView.tsx:743-744`), so RULING 8's "illustrative" basis holds. The committed-selection requirement's enumeration of preview elements and the stale-preview requirement's "figures": neither is exhaustive in form, and neither becomes false. `figure-formatting`: the overlay carries no figure and no token.
- **The reader rule against the tree.** `currentQuote` (`SystemSpaceView.tsx:793`) is non-null exactly when the panel renders `preview-affordable` and a ceiling (`SpaceCommandPanel.tsx:148, 262-315`), including while the canvas is unavailable, so "never drawn without the ceiling" and "only while the view presents the affordability as text" are true at HEAD. The hook returns `preview: null` while disabled and removes the query (`use-burn-preview.ts:84-91`), so the resume, fleet-switch and selection-replace rows cannot be satisfied by re-presenting old data; `gcTime: 0` and the keyed query cover the previous target and previous fleet.
- **Named wrong readers that the rows do kill.** The hook's raw preview (3.4 failed refresh). State or mark decided by geometry at the strip (2.1's disagreeing pair). A mark parked at the rail's start (2.2). Blanking during a refresh over a good quote (3.4 pending assertion). The previous selection's or fleet's cost (3.5, 4.5). A hook call in the strip or gauge (`use-burn-preview.call-site.test.ts`, which exists).
- **Harness placement.** No section-3 row asserts anything after an accepted commit; all commit-lifetime rows are in the real-`use-fleets` harness. Both harnesses render the real roster and `fleet-row-<id>` is already clicked there (`stranding-notice.test.tsx:570, 843-884`), so 4.5 needs no mock edit. Fixture facts in design § 11 are as stated (`cargo: {}`, capacity 40, 744.2984 t).
- **Traceability.** All 36 scenarios map to a task; no task implements behaviour no requirement states. 39 is an honest count in the ruled unit (one task per test arrangement group); 1.6 and 2.2 are the fullest, and each is one walk or one parametrised table.
- **Journey plan.** The three must-PASS legs are arrangeable: a spawned hull has starting fuel and the gauge reads `filled` on the e2e stack (`vitals-strip-journey.spec.ts:320`), and the state-equals-panel-flag leg does not depend on which value is served. Both colour schemes are reachable by media emulation (Tailwind v4 default `dark` variant; no class-based override in `frontend/app`). The unaffordable and extent-past-fill legs logging UNTESTED follows RULING 14.
- **Impact.** No task forces a production edit outside `Gauge.tsx`, `VitalsStrip.tsx` and `SystemSpaceView.tsx`. design § 10's timer-hunk lines are correct at `d965f5d` (`:193`, `:592`).
- **No in-flight change** other than this one exists under `openspec/changes/`.

## Orchestrator rulings


Orchestrator, 2026-10-05. Every finding is **confirmed and accepted**; none is
disputed and none reopens a ruling. Binding directions for the repair (the
writer repairs proposal/tasks/delta; the architect then aligns design.md; no
new task — each repair rides an existing arrangement group; count stays ≤ 40):

- **B1 — accepted.** The mark's position must be pinned so a mark with no
  pull-back fails: the scenario's THEN states, per cost, both where the mark
  starts along the rail and that it lies wholly inside the rail at 0, 100 and
  250 t — in terms tier 1 can decide (the two position components design.md
  Decision 5 shows jsdom stores), without naming a style property in the spec.
  The process sentence in the AND goes. Proposal, design.md and tasks 2.2 are
  made to say the same thing about what tier 1 asserts; design.md stops quoting
  requirement text that is not in the delta.
- **M1 — accepted.** Partial height gets a scenario a full-height band fails,
  ridden by the gauge-atom geometry task.
- **M2 — accepted.** The mark's visibility is stated as behaviour: non-zero
  fixed width, full rail height, paint that differs from the band's. Tier 1
  holds it by the class-family task; the journey samples the mark only if an
  unaffordable quote is arranged (RULING 14), else UNTESTED.
- **M3 — accepted.** One view-level row with the flag true and cost above the
  fuel aboard (state affordable, no mark), on an existing walk, so affordability
  computed at the wiring fails. The "load-bearing" claims in tasks and design.md
  are corrected to name the row that actually kills that mutant.
- **M4 — accepted.** The refresh-in-flight sentence is scoped to a refresh sent
  over a current quote; a row asserts no overlay between a failed refresh and
  the next success, on the existing refresh walk.
- **m1, m2, m4, m5, m7 — accepted** as the finding directs.
- **m3 — accepted.** "No data" is defined by the gauge's existing no-data state
  as `system-console`'s live fuel-cell requirement defines it, not by a
  parenthetical of this change's own; no "exactly"/"every" that would mandate an
  overlay in the failed-own-fleets state (RULING 11: no rule for that state).
- **m6 — accepted.** The 2b forward flag says plainly: if 2b stops supplying the
  quote while the dock is collapsed, it must MODIFY this change's lifetime
  requirement ("exactly while").

Verdict commit: none — round 1 is NOT CLEAR; no verdict is issued at this round.
