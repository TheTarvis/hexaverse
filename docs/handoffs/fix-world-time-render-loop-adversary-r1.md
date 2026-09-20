# Adversary round 1 — `fix-world-time-render-loop`

Persisted verbatim by the orchestrator, 2026-09-19. Reviewer:
`openspec-adversary` (opus), read-only. **Round 1 of a maximum 3**, counted
across the whole change.

**Verdict: FINDINGS — 5 BLOCKER, 9 MAJOR, 6 MINOR. BLOCKED.**

**Verdict commit: NONE.** This run is not a chain link and not `--full-auto`,
so the workflow skill does not require a verdict commit, and the orchestrator
was not authorized to commit on its own initiative. The change folder is
untracked (`?? openspec/changes/fix-world-time-render-loop/`), which means
**this verdict cannot be checked for currency by diff later** — the usual
`git diff <verdict-sha> -- …` test has no sha to run against. If Travis wants
the verdict pinned, committing the change folder plus this directory's
`fix-world-time-render-loop-*` files is the one step that does it.

## Orchestrator rulings

**All twenty findings are ACCEPTED.** None was disputed, none was residue of a
panel fix that was already correct, and three were independently verified by
the orchestrator against the tree before ruling:

- **B1 — CONFIRMED.** `frontend/components/galaxy/GalaxyView.tsx:248-253`,
  `handleShowFleet` is `setSelectedId(fleet.systemId)` +
  `controllerRef.current?.focusSystem(fleet.systemId)` — select and glide, no
  `router.push`. The roster's `onSelect` calls exactly that
  (`GalaxyView.tsx:478-481`). The galaxy delta demands a navigation this view
  does not have; `onBurn` → `handleBurn` (`:281`) is the redirect that exists.
- **B5 — CONFIRMED.** `grep -n 'scale' frontend/lib/types/galaxy.ts` returns
  nothing — the `Galaxy` type has no `scale` field, so task 3.4's
  `galaxy?.scale` does not compile. `Fleet.scale` is optional
  (`frontend/lib/types/fleet.ts:172`), so the unserved-scale state is ordinary,
  not exotic.
- **B4 — CONFIRMED.** Three artifacts disagree: `proposal.md:32` ("the effect
  is deleted"), `tasks.md:32` ("Delete `drawWorldTime` state … the effect keeps
  … its `setDrawWorldTime`" — self-contradictory on its own), and
  `design.md:265-271` ("stays written from React"). This re-opens the exact
  BLOCKER `A-F1` was accepted to close.

Two rulings that modify the adversary's proposed fix rather than taking it
verbatim:

- **B2 — ACCEPTED, with the bound stated directly.** The adversary is right
  that "SHALL commit" is unfalsifiable without a time bound and that the
  defect is a budget measurement, not a never-arrives. But its proposed text
  makes the requirement's normative content depend on `docs/testing-tiers.md`,
  a test-harness document. A capability spec must not take its threshold from
  a test doc. Writer: state the bound in the requirement directly — "SHALL
  arrive within 20 seconds of the action that requested it" — and keep the
  "SHALL NOT raise that budget to obtain a green" clause as the anti-tuning
  guard, citing the defect record for provenance rather than testing-tiers for
  the number.
- **m18 — ACCEPTED, and B5 supplies the caller.** `hasReading()` is a dead
  derivation as things stand. B5's required unserved-scale hold ("hold the
  last served instant rather than projecting it forward") is precisely a
  caller that needs to skip work rather than render at `0`. Writer: wire
  `hasReading()` to that branch and name it in the task, rather than dropping
  it.

**Round 2 is the repair round.** Findings confined to round-1 repairs are
residue and converge; a third full attack is available but is not the plan.

---

# Adversary round 1 — `fix-world-time-render-loop`

Read in full: the defect record (2026-09-19 section first), `docs/plans/system-hud/chain.md`'s dependency, all four panel reports, the consolidated work order, the rulings/OQ file, both drift records, the whole change (proposal/design/tasks/both deltas), the live `system-space-view` and `galaxy-view` specs, the named requirements in `figure-formatting`, `fleet-roster`, `focused-scan`, `docked-fleet-actions`, `add-vitals-strip/specs/system-console`, and the code the change claims things about (`use-world-time.ts`, `SystemSpaceView.tsx`, `SpaceStage.tsx`, `SpaceCanvas.tsx`, `webgl/SpaceWorld.tsx`, `GalaxyView.tsx`, `FleetRoster.tsx`, `ScanControl.tsx`, `vitest.setup.ts`, the five `SpaceStage*.test.tsx` files, `lib/types/galaxy.ts`, `lib/types/fleet.ts`).

Nothing below restates an applied panel finding. Several of these findings are *in text the panel's own fixes introduced* — the `galaxy-view` delta (A-F3), Decision 6 (A-F1/A-F2), the visibility qualifier (R-15), the OQ3 OPEN marking, and task 4.5.

---

## BLOCKERS

### B1 — The new `galaxy-view` requirement demands a navigation this view does not issue, and omits the one it does; task 3.4a would make an implementer invent it

**Evidence.** `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/specs/galaxy-view/spec.md:17-20`:

> "An in-app navigation issued from this view while it is mounted — the drill-in to a system's space view (*Drill-In Navigation to the System Board*), and **a roster row's selection of a fleet in another system** — SHALL commit."

and `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/tasks.md:20` (3.4a):

> "a drill-in click and **a cross-system roster selection** each still call `router.push`"

The galaxy view has exactly two `router.push` sites, and a roster-row selection is not one of them:

- `/Users/travis/Projects/hexaverse/frontend/components/galaxy/GalaxyView.tsx:245` — `handleEnterSystem` → `router.push('/systems/${systemId}')` (the drill-in).
- `/Users/travis/Projects/hexaverse/frontend/components/galaxy/GalaxyView.tsx:281` — `handleBurn` → `toast.error('Open the system view to choose a target'); router.push('/systems/${fleet.systemId}')` (the roster **burn** redirect).
- `GalaxyView.tsx:248-253` — `handleShowFleet`, which the roster's `onSelect` calls (`:476-480`): `setSelectedId(fleet.systemId); controllerRef.current?.focusSystem(fleet.systemId)` — **select and glide, never navigate**, with the comment "a jump is atomic and single-hop, so a mid-jump fleet has no other point on this graph to show (design.md Decision 10)".

No live requirement says otherwise: `fleet-roster`'s *Row Selection Delegated to the Mounting View* (`/Users/travis/Projects/hexaverse/openspec/specs/fleet-roster/spec.md:33-42`) explicitly leaves "camera focus, navigation, or activation" to the view, and `galaxy-view`'s own requirements never make it navigation. Cross-system roster navigation is a **`system-space-view`** behaviour (*Fleet Roster Cross-Navigation*, `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md:920-943`) — the architect's delta text appears to have carried it across capabilities. Meanwhile scenario 4 (`specs/galaxy-view/spec.md:47-50`, the roster burn redirect, folded in from `U-2`) covers the site the prose *doesn't* name.

**What it permits.** An implementer working from paragraph 3 and task 3.4a writes a test asserting a roster-row selection calls `router.push`, finds it fails, and **adds a navigation to the galaxy roster's row selection** — a behaviour change this change's proposal explicitly disclaims ("No backend change, no wire change, no new figure, no copy change"), contradicting `GalaxyView`'s Decision 10 and taking a player who clicked a row to focus the camera off the galaxy view entirely. The alternative reading — treat the clause as vacuous because no such navigation exists — leaves the requirement asserting something untestable.

**Smallest fix.** In `specs/galaxy-view/spec.md:17-20` replace "and a roster row's selection of a fleet in another system" with "and the roster's burn redirect, which sends a fleet's burn command to that fleet's system view (`fleet-roster`'s *The Roster Row Is the Fleet Command Surface Where the Mounting View Provides None, Jump Gated by Attachment Alone*)". In `tasks.md:20` replace "a cross-system roster selection" with "a roster burn command on a fleet in another system". Add one sentence to the same paragraph to lock the non-navigation in: "A roster row's *selection* on this view SHALL continue to select and reframe without navigating."

---

### B2 — "SHALL commit" carries no time bound anywhere in the change; the defect's 20-second budget is lost in translation

**Evidence.** `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/specs/system-space-view/spec.md:53-59`:

> "An in-app navigation issued from a mounted, animating view … **SHALL commit**. … the view SHALL NOT be the reason a requested navigation fails to arrive."

Scenario (`:103-107`): "**THEN** the browser arrives at that fleet's system route." Same shape in `specs/galaxy-view/spec.md:17-22, 42-50`. No duration appears in either delta.

The design document is a measurement against a budget: `/Users/travis/Projects/hexaverse/docs/plans/continous_space/handoffs/defect-cross-system-chevron-nav-stall.md:87-89` — "TimeoutError: page.waitForURL: Timeout 20000ms exceeded" — and `:135-142`, "**Do not raise the 20 s budget.** `docs/testing-tiers.md` is explicit that a timeout is a budget, not a knob". The defect is *not* "the navigation never arrives"; it is "it did not arrive inside 20 s, in 4 of 6 repeats".

**What it permits.** An implementation in which the cross-system navigation reliably arrives after 45 seconds satisfies every word of both requirements and every scenario, and still fails task 5.3's gate. Conversely a reviewer of a future regression has no stated threshold to test against — "SHALL commit" is unfalsifiable without one, since any test must pick a wait the spec does not supply. This is the playbook's "numbers changed or lost in translation" case, on the change's central clause.

**Smallest fix.** In both deltas, after "SHALL commit", add: "— and SHALL arrive within the navigation budget `docs/testing-tiers.md` sets for the tier-4 journey (20 seconds from the action that requested it), a budget this capability SHALL NOT raise to obtain a green." Amend both navigation scenarios' THEN to "**THEN** the browser arrives at that fleet's system route within 20 seconds of the selection."

---

### B3 — Decision 3 is marked OPEN (OQ3), but the proposal, Decision 7, the ADDED requirement's first sentence and four tasks all assert option (A) as settled

**Evidence.** `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/design.md:207` marks the choice open — "**OPEN — OQ3: how the relocated per-frame system gets test coverage at all**" — and `:230-238` records the lean as (B), noting "B changes this change's own architecture: two loops instead of one, and 'the same `draw()` projects each frame-scene mark' above stops being true". Every one of the following is true only under (A):

- `proposal.md:20-24`: "The picture is driven from **the draw loop that already exists** (`webgl/SpaceWorld.tsx`'s `requestAnimationFrame`): each frame it evaluates the scene at `clock.now()` and positions the DOM hit targets imperatively" — the proposal, the artifact the user reads, states the open branch as decided and never mentions OQ3.
- `proposal.md:80`: "`components/space/webgl/SpaceWorld.tsx` (scene evaluated in the draw loop)".
- `specs/system-space-view/spec.md:4-8`: "SHALL advance the space view's picture … **from its animation-frame draw loop alone**" — singular; under (B) there are two rAF consumers and the transform writer is not the draw loop.
- `design.md:304-314` (Decision 7, not marked conditional): "`draw()`'s live `viewBasisOf` result is published to a ref … `pickAt`'s point-selection unprojection reads that ref instead of `SpaceStage`'s own `[host]`-keyed memo, **which is deleted**."
- `tasks.md:28` (4.2) "`draw()` builds the frame scene"; `:29` (4.3) "`draw()` writes each element's full `style.transform` … **after `renderer.render`**"; `:35` (4.8) "`draw()` publishes the frame's `viewBasisOf` result to a ref"; `:36` (4.9) "read the frame loop's live mark ref".

Option (B) is specified at `design.md:225-228` as "**not** gated on the renderer constructing". Combine that with Decision 7 and the result is incoherent: when the `webgl2` probe reports available but `new THREE.WebGLRenderer` throws (`/Users/travis/Projects/hexaverse/frontend/components/space/webgl/SpaceWorld.tsx:220-226` — "No usable context here (jsdom, or a driver that refused) … this module simply does not draw"), `draw()` never runs, so the basis ref is never written, so `pickAt` unprojects against `undefined` — with `SpaceStage`'s own memo deleted, there is no fallback. Under (B) the transform loop must compute its own basis, which falsifies Decision 7's title ("One basis, computed once per frame") outright.

**What it permits.** Implementation cannot start. An implementer who takes the recorded lean (B) has no task list — 4.2, 4.3, 4.8 and 4.9 all name `draw()` — and silently contradicts Decision 7; one who takes (A) contradicts the lean and must extend the shared `vitest.setup.ts` fake, which the panel flagged as changing the branch most existing `SpaceStage` tests assert.

**Smallest fix.** Either resolve OQ3 before this change is presented, or mark every branch-dependent statement. Minimum text if it stays open: add to `design.md` Decision 7's opening, "**Conditional on OQ3.** Under (A) the GL `draw()` publishes the basis; under (B) the transform loop publishes it and the GL loop consumes it, so the transform loop — not `draw()` — is the single basis authority and `SpaceStage`'s memo deletion still holds"; append to tasks 4.2/4.3/4.8/4.9 "— under OQ3 (B), 'the frame loop' is the transform loop, not `draw()`"; change `specs/system-space-view/spec.md:4-6` from "its animation-frame draw loop alone" to "an animation-frame loop alone"; and add one sentence to `proposal.md:20-24` naming OQ3 as the open choice about which loop that is.

---

### B4 — proposal.md and tasks.md say the draw-stamp state and effect are deleted; design.md Decision 6 says they stay. This re-opens the exact BLOCKER `A-F1` was raised to close

**Evidence.** Three artifacts, three answers:

- `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/proposal.md:33-35`: "`SpaceStage`'s nested `setDrawWorldTime` effect **is deleted**; the draw stamp keeps its `if (!available) return` guard and is now keyed on the coarse tick". An effect that is deleted cannot keep a guard or be keyed on anything.
- `tasks.md:32` (4.5): "**Delete `drawWorldTime` state** and the `SpaceStage.tsx:200` effect's dependence on the per-frame value; the effect keeps its `if (!available) return` guard **and its `setDrawWorldTime`**". You cannot delete `const [drawWorldTime, setDrawWorldTime] = useState(...)` (`/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.tsx:156`) and keep its setter.
- `design.md:265-271` (Decision 6): "`data-draw-world-time` … stays **written from React**, at the coarse cadence, under the existing `if (!available) return` guard. Only the *value* changes."

**What it permits.** An implementer following the proposal and the task deletes the state, the effect and the attribute. `data-draw-world-time` is asserted at `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.renderer.test.tsx:249` and `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.test.tsx:56`; losing it leaves the live scenario *A restored context's first frame reflects live state, not a stale one* with no observable surface at all — which is precisely what `A-F1` (BLOCKER, RULING 2) was accepted to prevent, and it would fail `check.sh` in a way that invites "just delete the assertion".

**Smallest fix.** `proposal.md:33-35` → "`SpaceStage`'s `setDrawWorldTime` effect stops being keyed on a per-frame value: the state, the effect and its `if (!available) return` guard all stay, React-written, now keyed on the coarse tick (design.md Decision 6) — so the nested per-commit update disappears without the draw stamp losing its availability gate." `tasks.md:32` → "Re-key the `SpaceStage.tsx:200` effect from the per-frame `worldTime` prop to the coarse tick. `drawWorldTime` state, `setDrawWorldTime`, and the `if (!available) return` guard all stay (design.md Decision 6)."

---

### B5 — The galaxy-view served-scale requirement has no rule for its own first-mount state, and the task implementing it names a field that does not exist

**Evidence.** `specs/galaxy-view/spec.md:24-28`:

> "The world time this view projects SHALL be extrapolated at the served world-clock scale — **the same scale it hands the roster for formatting** — never at an assumed scale of 1."

`tasks.md:19` (3.4): "passing the served scale (`myFleets?.[0]?.scale ?? galaxy?.scale`)".

- `Galaxy` has no `scale` field: `/Users/travis/Projects/hexaverse/frontend/lib/types/galaxy.ts:93-101` is `{ id, seed, bounds, worldTime, nodes, links }`, and the wire shape `WireGalaxy` (`:60-67`) likewise serves `worldTime` and no scale. `galaxy?.scale` does not compile.
- `Fleet.scale` is optional: `/Users/travis/Projects/hexaverse/frontend/lib/types/fleet.ts:172` — `scale?: number`. `GalaxyView.tsx:474` passes `scale={myFleets?.[0]?.scale}` to the roster, i.e. possibly `undefined`.
- The unserved state is reachable and ordinary: first mount before the fleets read lands (the clock is anchored from `galaxy?.worldTime` at `GalaxyView.tsx:182` in exactly that window), and any corp with no fleets.

So "the same scale it hands the roster" can be `undefined`, and the requirement forbids the only fallback the code has. The repo has already answered this question twice and the delta contradicts both: `figure-formatting`'s *A Figure Whose Clock Scale Has Not Been Served Reads as Absent* (`/Users/travis/Projects/hexaverse/openspec/specs/figure-formatting/spec.md:408`), and `add-vitals-strip/specs/system-console/spec.md:605-616` — "WHILE no world-clock scale has been served, the stamp SHALL render the last served world instant **without projecting it forward** … because no honest wall-clock rate exists to advance it at". The system view's own code keeps the two separate for this reason (`/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.tsx:423-424`: `clockScale = … ?? 1` for the clock, un-defaulted `servedScale` for figures).

**What it permits.** The requirement is undecidable in its most common state, so two implementers diverge: one keeps `?? 1` (violating the requirement's letter on every first mount) and one holds the clock (a behaviour change with no scenario). Task 3.4 as written does not compile.

**Smallest fix.** Append to `specs/galaxy-view/spec.md:24-28`: "WHILE no world-clock scale has been served — before the own-fleets read lands, or for a requester with no fleets — the view SHALL hold the last served world instant rather than projecting it forward at an assumed rate, the same protection `system-console`'s clock cell takes." Add the scenario: "**GIVEN** the view has a served world time but no served scale / **WHEN** wall-clock time passes with no read landing / **THEN** the projected world time holds at the last served instant." Fix `tasks.md:19` to `myFleets?.[0]?.scale` alone (there is no galaxy-served scale) and name the hold branch.

---

## MAJORS

### M6 — Scenario *Frames pass without the view rendering* asserts "the drawn world time advances" against no observable surface; an implementation with no frame loop at all passes every testable scenario in the change

**Evidence.** `specs/system-space-view/spec.md:68-73`:

> "**THEN** the drawn world time advances **AND** the view's component tree has not rendered in that interval"

The only stamp in the tree is `data-draw-world-time` (`/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.tsx:365`), and Decision 6 (`design.md:265-271`) makes it deliberately **not** the loop's time — it is React's coarse value. `design.md:208-216` establishes that `draw()` never executes under any vitest test. Task 2.1 (`tasks.md:8`) implements only the second half: "advance 10 rAF frames with no other event → render count unchanged". Nothing, at any tier, observes that the picture advanced per frame.

**What it permits.** The laziest conforming implementation: move world time to the clock object, drive the panels from the coarse tick, and **never start the frame loop** (or start it and never call `buildSceneModel`). Render count unchanged ✓, counting figure advances ✓, visibility resync ✓, navigation arrives ✓, no update-depth diagnostic ✓. The picture freezes between coarse renders, or entirely — and the live requirement that would catch it (*Own-Fleet Position, Burn Curve, and Arrival Ghost Render Continuously*, `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md:330-334`) has exactly the same observability problem under jsdom. The change moves the picture's continuity into an unobserved loop and states the guarantee in a THEN nothing can read.

**Smallest fix.** Give the drawn time a surface and say which one, in the scenario: "**THEN** the position the loop writes to a moving mark's hit target has changed between those frames **AND** the view's component tree has not rendered in that interval." (Under OQ3 (B) that transform is jsdom-observable and under (A) it is Playwright-observable; either way the assertion is about the loop, not about React.) If a numeric stamp is preferred, require it explicitly and gate it the way Decision 6 gates the React one: "the loop SHALL publish the world time of its most recent drawn frame on the canvas region, distinct from `data-draw-world-time`, and SHALL stop publishing while the context is lost."

### M7 — The structural prohibition enumerates two mechanisms and misses the third — the one design.md explicitly rejects

**Evidence.** `specs/system-space-view/spec.md:8-11` (and verbatim in `specs/galaxy-view/spec.md:4-7`):

> "The passage of an animation frame SHALL NOT, by itself, cause **the view's component tree** to render: world time SHALL NOT be held in **component state** that is written per frame, and **no effect** SHALL write component state in response to a per-frame value."

`design.md:110-113` rejects the third mechanism by name: "*Alternative — `useSyncExternalStore` with a per-frame subscriber in a leaf.* Rejected: it is still a default-priority React update every 16 ms, which is the thing not known to be safe."

An external-store subscription in a leaf holds no component state and uses no effect, so it satisfies both enumerated clauses verbatim; and "the view's **component tree**" is readable as the tree from the view root, which a leaf-only re-render does not render.

**What it permits.** An implementer ships the rejected alternative — a leaf subscribing to the clock at 60 Hz — and claims conformance. Per design.md's own Context (`:30-34`), "a smaller per-frame React render is not known to be safe. Only 'no per-frame React update at all' has been shown to work", so this is not a hypothetical: it is the implementation most likely to re-produce the stall while passing a render-count probe scoped to the view root.

**Smallest fix.** In both deltas: "… SHALL NOT, by itself, cause **any component of this view's tree** to render: the live world time SHALL NOT be held in component state, in a React external store, or in any other value a component subscribes to per frame, and no effect SHALL write component state in response to a per-frame value. A frame-rate subscription in a leaf is the same default-priority update at a smaller scope, and is equally prohibited."

### M8 — The update-depth scenario has no window, and task 2.3's "red first" test is green against today's defect

**Evidence.** `specs/system-space-view/spec.md:109-112`:

> "**WHEN** the space view is mounted, animating, and **left idle** / **THEN** no update-depth or nested-update diagnostic is written to the browser console"

`tasks.md:10` (2.3, under the heading "## 2. Red — the invariant, failing first"): "`console.error` spy **across 2.1's window**" — and 2.1's window is `tasks.md:8`, "advance **10 rAF frames**".

React emits *Maximum update depth exceeded* only when its nested-update counter passes 50 consecutive commits-scheduling-commits; the counter resets whenever a commit produces no nested update. Today's defect is one nested passive update per frame (`SpaceStage.tsx:200-204`), so it needs roughly 50 frames — about 0.8 s at 60 Hz — to trip. Ten frames cannot reach it. The defect record's own count is consistent: 31 diagnostics across an entire journey, not per frame (`defect-cross-system-chevron-nav-stall.md:25-27`).

**What it permits.** Task 2.3 is written to fail first and will pass first, against the unfixed code — this repo's named "green test against broken code" failure (handoffs README, Lesson two). After the fix it still proves nothing, so a residual nested update reintroduced later is uncaught. The scenario inherits the hole: "left idle" for an unstated duration makes any window conforming.

**Smallest fix.** Scenario: "**WHEN** the space view is mounted, animating, and left idle for at least five wall-clock seconds". Task 2.3: "advance **at least 120 rAF frames** (React's nested-update diagnostic needs ~50 consecutive nested commits, so a 10-frame window cannot produce it) and record the test failing on the pre-fix tree before the fix lands — a 2.3 that is green before group 3 is not evidence."

### M9 — The visibility-resync scenario is contradicted by the task that is supposed to satisfy it, and is untestable in the harness it names

**Evidence.** `specs/system-space-view/spec.md:22-26` (the `R-15` qualifier, added this revision):

> "on the document becoming visible again, it SHALL reflect the current world time **within one wall-clock second**, never a value frozen from before the hidden interval."

`tasks.md:23` (3.7): "the next tick to fire (on visibility regained) reflects `clock.now()` at full precision within one wall-clock second of visibility returning — **no separate resync code is needed**, since `now()` is pulled fresh on every tick".

The design's coarse tick is a bare `setInterval(…, 1000)` (`design.md:122-124`). Whether an interval whose wake-up was aligned to a throttled schedule fires within a second of the page becoming visible is a property of the browser's un-throttling implementation that this change neither controls, states, nor measures — and under jsdom, which has no throttling at all, the test in 3.7 fires the interval on its own schedule and therefore **passes identically against an implementation with visibility handling and one without**. The requirement is a bound on a code path the change declares unnecessary and the test cannot distinguish.

**What it permits.** The scenario obliges nothing. If the browser does not deliver the tick promptly on foreground return, the requirement is false in production with a green suite — the same shape as the defect this change exists to fix, where unit tests said nothing about the real mechanism (`design.md:253-262`).

**Smallest fix.** Make the obligation a mechanism, not a hope. `tasks.md:23`: "`useCoarseWorldTime` subscribes to `visibilitychange` and, when `document.visibilityState` becomes `visible`, recomputes from `clock.now()` immediately and restarts its interval from that instant — the interval alone is subject to the browser's background-timer policy and is not evidence of the bound. Test: with fake timers **not** advanced, dispatch `visibilitychange` after a simulated hidden interval and assert the coarse value moved to `clock.now()`."

### M10 — "the figure counting down … has changed" is false for any arrival an hour or more out; the task's own assertion is the correct one

**Evidence.** `specs/system-space-view/spec.md:75-80`: "**GIVEN** the acting fleet is burning with a served arrival **in the future** … **WHEN** two wall-clock seconds elapse … **THEN** the figure counting down to that arrival **has changed**". Identical shape at `specs/galaxy-view/spec.md:36-40`.

`figure-formatting`'s *A Duration Reads in Exactly Two Adjacent Units Chosen by Its Magnitude* (`/Users/travis/Projects/hexaverse/openspec/specs/figure-formatting/spec.md:37-44`): "`Nm Ss` below one hour, `Nh Mm` below one day, and `Nd Hh` at or beyond one day." A burn arriving in three hours renders `3h 25m`; two seconds of world time change nothing about its text. The GIVEN admits that case, so the THEN is false under a legitimate reading of its own GIVEN.

Task 2.2 (`tasks.md:9`) already has the right observable — "the arrival figure's `data-raw` changed" — and it is right because `figure-formatting:471-473` pins a duration's `data-raw` to "its unscaled world-millisecond **span**", which decreases every tick regardless of magnitude.

**What it permits.** A tester writing the scenario literally with a distant arrival gets a red against correct code and "fixes" it by widening the wait or changing the figure; or the scenario is quietly narrowed to a case nobody wrote down.

**Smallest fix.** Both scenarios' THEN → "**THEN** that figure's raw span (`data-raw`) has decreased by the elapsed world-millisecond span". This also removes the hidden dependence on the arrival's magnitude, so the GIVEN needs no new constraint.

### M11 — After the split, nothing says where the *coarse* render gets a projection basis, and the only two candidates are deleted

**Evidence.** `tasks.md:35` (4.8): "`pickAt`'s point-selection unprojection reads that ref instead of `SpaceStage`'s `[host]`-keyed `basis`/`viewport` memos, **which are deleted**." Those memos are `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.tsx:172-176`, and `basis` is also the prop `SpaceLayers` projects every mark with (`SpaceStage.tsx:479`, `basis: ReturnType<typeof viewBasisOf>`).

The change still requires a coarse, React-side projection: `specs/system-space-view/spec.md:40-51` keeps membership — "Which marks HAVE targets, and which marks are currently off-screen and therefore offered through the off-screen affordance … MAY instead be recomputed once per wall-clock second and on every camera change" — and deciding "currently off-screen" requires a basis and a viewport. Neither design.md nor any task says which basis that computation reads after the memos are gone.

**What it permits.** The implementer re-creates a `[host]`-keyed memo for membership (the deleted bug, restored on the surface that decides whether a mark is reachable by chip or by hit target — so after a window resize the off-screen chip set is computed from a stale viewport and marks become reachable by neither path, indefinitely, not for the ≤1 s the requirement bounds); or reads the loop's ref during render, which nothing sanctions and which yields no chips at all before the first frame.

**Smallest fix.** Add to `design.md` Decision 7: "The coarse membership computation reads the **same published basis** the loop writes, sampled at the coarse tick and on camera change; there is exactly one `viewBasisOf` result in the view at any instant. Before the first frame publishes one, no mark is classified off-screen and no chip is offered." Add the sentence to task 4.6.

### M12 — Four scenarios have no implementing or verifying task, and the two galaxy navigation scenarios' only task is an assertion design.md says proves nothing

**Evidence.** Walking all 18 scenarios against the 30 tasks:

- *A hit target tracks its mark on every frame* (`specs/system-space-view/spec.md:89-94`) — **no task**. 4.1 tests `projectMarks` as a decontextualized pure function, 4.3 writes the transform, 4.3a counts registry entries. Nothing asserts a target is at its mark's drawn position on a frame. This is the scenario that protects *Space View Picking Resolves to the Body, Lane Gate, or Point Under the Pointer*'s "Hit targets SHALL be positioned at the marks actually drawn" — the live text at `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md:1664-1666`.
- *A roster countdown advances without a per-frame render* (`specs/galaxy-view/spec.md:36-40`) — **no task**. 3.4a covers render count on frames only.
- *The projected clock runs at the served scale* (`specs/galaxy-view/spec.md:52-56`) — **no task**. 3.4 implements it; nothing tests it. The change's own justification for writing this delta (`proposal.md:63-65`) is "Five derivations on this chain were built and never reached by production code; a requirement is what makes the call site load-bearing" — a requirement with no test is the next one.
- *A drill-in issued while the view animates arrives* and *A roster burn redirect … commits* — task 3.4a only, which asserts `router.push` was **called**. `design.md:253-262` (the `R-9` text, "the single most important sentence to keep") establishes that a mocked router "never enters React's scheduler, so it cannot be starved" and that "only the tier-4 journey … tests whether a navigation actually arrives". `router.push` is already called today, under the defect. 3.4a's hedge — "real `next/navigation`, not the existing mock, or a spy that distinguishes commit from call" — asks for the thing Decision 5 says cannot exist in vitest.

**What it permits.** Five scenarios that cannot fail. The galaxy view's two navigations — the ones the delta exists to make load-bearing — ship with an assertion that is green before and after the change, and no tier-4 coverage (task 5.3 runs only `vitals-strip-journey.spec.ts`; UX's proposed galaxy-drill-in gate was not carried into tasks.md).

**Smallest fix.** Add a task per uncovered scenario, and for the galaxy navigations state the honest position rather than a test that cannot deliver: amend 3.4a to "assert `router.push` is called with the right route (a call-site regression guard, **not** evidence about starvation — design.md Decision 5)", and add "5.3a — include one galaxy-view drill-in in the tier-4 closing run, or record in design.md's Open Questions that the galaxy view's navigations have no tier-4 evidence in this change and why that is accepted."

### M13 — The OQ4 reversal instruction is incomplete: dropping the paragraph leaves the behaviour change in task 3.4 with nothing specifying it

**Evidence.** `design.md:463-465`: "If Travis prefers strictly behaviour-preserving scope instead, **drop the fourth paragraph and its scenario** from `specs/galaxy-view/spec.md`'s ADDED requirement before implementation and leave the defect filed separately." `tasks.md:19` (3.4) bakes the fix into the implementation step regardless — "passing the served scale … closing the mismatch between projection (assumed scale 1) and display (served scale) in the same call" — and `proposal.md:81-84` describes the same call site as authored "per OQ4's recorded lean".

I checked the coherence question the brief asked: paragraphs 1–3 and scenarios 1–4 do stand without paragraph 4 — the requirement survives the excision cleanly. The problem is the other direction.

**What it permits.** If Travis takes option B, the code still changes the galaxy clock's rate while no requirement anywhere states it — an unspecified behaviour change in a fix change, which is the exact failure the galaxy delta was added to prevent.

**Smallest fix.** Extend `design.md:463-465`: "… drop the fourth paragraph and its scenario, **and amend tasks.md 3.4 to pass the scale the call site passes today (none, i.e. the projection keeps its assumed 1), so the code change matches the spec change**; the defect record stays open."

### M14 — Both deltas assert a React-internal mechanism as fact that design.md's own Context says is unexplained

**Evidence.** `specs/system-space-view/spec.md:56-59` and `specs/galaxy-view/spec.md:20-22`, identically:

> "A route transition is lower priority than an ordinary state update, so a view that renders every frame **can interrupt it indefinitely**"

`design.md:30-34`: "**What is not known.** React marks a starved transition lane expired after ~5 s and then renders it without yielding, which should rescue a navigation well inside 20 s. **It did not.** The likeliest reason is that the target route suspends more than once and each suspension clears the lane's expiry, but this is unverified". The defect record is equally careful (`defect-cross-system-chevron-nav-stall.md:53-56`, "**Not established:** whether production builds stall too … They share the mechanism by construction; none has been measured").

"Indefinitely" is not merely unproven; it is contradicted by the change's own account of React's expiry behaviour, and it is stated in the *spec*, where it outlives the change and reads as settled to the next author. The reliability reviewer's ruling that the requirement is sound turned precisely on it being "phrased as an outcome … not as an assertion of the mechanism" — this sentence is the assertion of the mechanism.

**Smallest fix.** Both deltas: "A route transition renders at a lower priority than an ordinary state update. Measured on this view: with the per-frame update in place the cross-system navigation failed to arrive within 20 seconds in 4 of 6 repeats; with it silenced, 0 of 6 (`defect-cross-system-chevron-nav-stall.md`). Why React's own starved-lane expiry did not rescue it is not established. The view SHALL NOT be the reason a requested navigation fails to arrive."

---

## MINORS

### m15 — The 1 Hz justification is still wrong in two places, both introduced by the `A-F9` replacement paragraph

`specs/system-space-view/spec.md:18-23`: "`figure-formatting` renders a duration by dividing its world-millisecond span by the served scale and rendering **the result's smaller unit in whole wall seconds**, and renders an absolute instant only to the minute — so **at any served scale**, a figure refreshed faster than once a wall second re-renders the view for a change the player cannot see."

(a) The smaller unit is seconds only below one hour (`figure-formatting:37-44`); above that it is minutes, then hours. (b) "At any served scale" is false above scale 60: an absolute instant is **not** divided by the scale (`figure-formatting:140-144`, "SHALL NOT divide an absolute stamp by the scale"), so at scale 600 the `T+ Dd HH:MM` stamp advances ten world-minutes per wall second and a faster refresh *would* show changes the player can see. The bound itself remains a fine trade-off; the invariant offered to license it does not hold. **Fix:** "One wall-clock second is the finest step any of them is legible at *at the scales this game runs* (`figure-formatting` renders a sub-hour duration's smaller unit in whole wall seconds and an absolute instant only to the world minute). Above a served scale of 60 the absolute stamp advances by more than one world minute per wall second and the coarse tick becomes a deliberate, accepted coarsening rather than a lossless one."

### m16 — Task 1.1's sizing list omits a fifth `SpaceStage` test file that asserts on a layer being rewired, and the three stop-thresholds do not compose

`tasks.md:3` enumerates "`SpaceStage.test.tsx`, `SpaceStage.renderer.test.tsx`, `SpaceStage.interaction.test.tsx`, `SpaceStage.fleet-mark.test.tsx`, `SystemSpaceView.test.tsx`". The tree has a fifth `SpaceStage` suite — `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.sighting-ghost-selection-guard.test.tsx` (221 lines) — whose assertions are exactly the membership kind 1.1 is counting (`getByTestId('sighting-mark-…')`, `:143`, `:212`) on the ghost layer whose `left`/`top` React writes (`SpaceStage.tsx:776`) task 4.3 removes. Separately, 1.1's stop rule ("If groups 3–4 exceed ~30 tasks' worth") plus the 12 tasks in groups 1/2/5 permits a 42-task change without stopping, while `design.md:352-354` and the rulings both cap at ~40. **Fix:** add the file to 1.1's list; restate 1.1's threshold as "if the total would exceed 40".

### m17 — proposal.md's Impact claims a test asserts `data-world-time`; none does

`proposal.md:89-92`: "`SpaceStage.test.tsx`, `SpaceStage.renderer.test.tsx`, `SystemSpaceView.test.tsx` assert `data-world-time` / `data-draw-world-time`". `grep` across `frontend/components` and `frontend/e2e` finds `data-draw-world-time` in two tests (`SpaceStage.test.tsx:56`, `SpaceStage.renderer.test.tsx:249`) and `data-world-time` in **none**; `SystemSpaceView.test.tsx` touches `space-world-clock` only to assert `data-scale` (`:828-838`). Same class as the two factual errors RULING 4 already corrected. **Fix:** "`SpaceStage.test.tsx` and `SpaceStage.renderer.test.tsx` assert `data-draw-world-time`; `data-world-time` has no assertion today, so the coarse value needs a new one (task 3.3)."

### m18 — `hasReading()` ships with no named caller — a dead derivation by this change's own standard

`design.md:95-97`: "`hasReading()` distinguishes this state for any caller that needs to skip work rather than render at `0`." No task, requirement or scenario names such a caller; task 3.6 tests only `now() === 0`. The galaxy delta's own rationale (`proposal.md:63-65`) is that unreferenced derivations are how five dark code paths happened on this chain. **Fix:** either name the caller in task 3.6 or drop `hasReading()` from Decision 1 and add it when something needs it.

### m19 — Task 4.8 silently repairs a live picking defect the proposal says nothing about

`SpaceStage.tsx:172-176` keys `viewport`/`basis` on `[host]`, so neither updates on a window resize; `pickAt`'s unprojection therefore mis-places a point selection after any resize **today**. Task 4.8's test — "a point pick after a simulated resize resolves against the post-resize basis" — asserts behaviour that is currently broken, i.e. a user-visible improvement, while `proposal.md:41` says "No backend change, no wire change, no new figure, no copy change" and the Impact section never mentions it. The repo's practice on this run was to *file* adjacent defects (two records exist). **Fix:** one line in proposal.md Impact — "Also corrects a pre-existing defect the split would otherwise entrench: point picks after a window resize currently unproject through a stale basis (`SpaceStage.tsx:172-176`)" — or file it as a record and reference it from task 4.8.

### m20 — Which layers stop receiving React-written positions is unstated for two of the three that have them

`A-F7`'s accepted fix ("React writes **no position at all**", `design.md:171-177`) and `tasks.md:29` are written about hit targets. React writes `left`/`top` on three layers: hit buttons (`SpaceStage.tsx:586-590`), fleet marks (`:840-844`), and the contact and ghost layers (`:736`, `:776`). The requirement then excuses the latter — `specs/system-space-view/spec.md:50-51`, "A mark whose position is frozen by requirement — a foreign contact, a sighting ghost — needs no per-frame positioning at all" — without saying who *does* position them, while their screen position still changes on every camera move. **Fix:** add to Decision 3: "Contacts and sighting ghosts keep their React-written `left`/`top` from the coarse scene — frozen in world space, they move on screen only when the camera does, which is already a render. The one-writer rule binds the marks the loop positions: bodies, lane gates and own fleets."

---

## Verdict

**FINDINGS — 5 BLOCKER, 9 MAJOR, 6 MINOR.** BLOCKED.

The three I would fix first, if only three: **B3** (the change cannot be implemented while Decision 3 is open and four tasks presume one branch), **B1** (the galaxy delta specifies a navigation the view does not have and a task that would make someone build it), and **B4** (the proposal and task 4.5 undo the panel's own `A-F1` BLOCKER fix). **M6** is the one a future reader will regret most: the change hands the picture to a loop and then states its continuity guarantee in a THEN that nothing can observe.
