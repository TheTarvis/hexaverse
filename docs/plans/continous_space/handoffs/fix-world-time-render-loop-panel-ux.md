# Panel report — UX (`fix-world-time-render-loop`)

Persisted verbatim by the orchestrator, 2026-09-19. Reviewer: `openspec-ux`,
Phase 1, read-only.

---

UX review — `fix-world-time-render-loop` (Phase 1, read-only). Findings below are numbered by severity; every one carries file:line evidence I read myself. Cleared hypotheses are listed in their own section at the end with the evidence that cleared them.

## BLOCKER

None. Nothing here loses player data or traps a player with no recovery path — the closest candidates (keyboard reframe precision, GalaxyView's shared stall shape) degrade the experience or leave a risk unmeasured rather than stranding anyone, so I've rated them MAJOR below. If the panel disagrees on GalaxyView, I'd support escalating finding 2 to BLOCKER given it reproduces the exact archive-blocking defect's mechanism on a second, completely unspecified surface.

## MAJOR

### 1. Keyboard Tab-focus camera reframe will read stale (≤1s) mark positions — `Space View Camera Is Keyboard-Operable`, line 1595

Evidence: `frontend/components/space/SpaceStage.tsx:591` — `onFocus={() => onFocusMark(mark.id, screen.onScreen ? null : mark.position)}`, where `mark` and `screen` come from `const marks = scene.marks` / `projected = marks.map((mark) => ({ mark, screen: projectToScreen(mark.position, basis) }))` (`SpaceStage.tsx:527-531`). `onFocusMark` feeds `reframeOn(position)` (`SpaceStage.tsx:408-410`), which sets the camera's pan target directly to that `position` (`SpaceStage.tsx:206-211`) — no further correction.

`scene` here is the **React-rendered** scene model. design.md Decision 3 and tasks.md 4.2 say explicitly: *"Remove `worldTime` from the React-side `scene` memo's deps (it builds at the coarse value)."* Decision 3 also states `pickAt` is deliberately re-pointed at "the frame loop's latest mark list (kept in a ref), so a click resolves against what is on screen, not against the last coarse render" — but it says nothing about `onFocusMark`/`reframeOn`, which read the *same* `scene.marks` object as `pickAt` used to, and after this change will be up to 1 second stale for a moving body, a burn mark, or a lane gate's bearing.

The live requirement (`system-space-view/spec.md:1551-1554`) is absolute and untimed: *"the camera SHALL reframe by the minimum adjustment that brings that hit target's focus indicator fully within the visible viewport, immediately and with no animated or eased transition."* With a stale position, the "minimum adjustment" computed at focus time can under- or over-shoot a fast-moving target (a burning fleet, an orbiting body near the edge), and — because the reframe is a one-shot action, not a recurring effect — nothing re-corrects it until the player tabs away and back. A keyboard-only player could tab to a mark and have the "immediate" reframe not actually bring it into view, with no visible indication anything is wrong.

This is unaudited: neither design.md nor tasks.md mentions `onFocusMark`, `reframeOn`, or this requirement at all, despite task 4.2 directly changing the cadence of the exact data this flow reads.

Proposed fix (implementation note for the writer/impl, not spec text, since the *requirement* doesn't need to change — the *implementation* needs to match it): `onFocusMark`'s off-screen test and the position it hands to `reframeOn` should read the frame loop's live mark ref (the same one `pickAt` now uses), not `scene.marks`. If the team decides a coarse-cadence reframe is acceptable instead, then the requirement needs an explicit bound, e.g.:

```
#### Scenario: A reframe-on-focus target is current, not a coarse-cadence snapshot
- **GIVEN** a body or lane gate whose position has changed since the view's
  last coarse render
- **WHEN** keyboard focus moves to that hit target
- **THEN** the camera reframes using the mark's current drawn position, not
  a position more than one animation frame old
```
I'd only propose adding this scenario if the team accepts a coarse-cadence reframe; my recommendation is to fix the implementation instead and leave the requirement's "immediately" as-is.

### 2. `galaxy-view` shares the exact stall mechanism, is being migrated by this change's own tasks, and gets zero spec delta or verification

Evidence:
- `frontend/components/galaxy/GalaxyView.tsx:36,182`: `useWorldTime` is called unconditionally, driving a 60 Hz `setState` across the *whole* `GalaxyView` tree (identical shape to the defect's root cause in `SystemSpaceView`).
- `GalaxyView.tsx:244-247`: `handleEnterSystem` — `router.push('/systems/${systemId}')`, the drill-in navigation (`galaxy-view`'s *Drill-In Navigation to the System Board*, spec line 82).
- `GalaxyView.tsx:278-284`: `handleBurn` — the roster's burn command from the galaxy tier also does `router.push('/systems/${fleet.systemId}')`.
- `openspec/changes/fix-world-time-render-loop/proposal.md:32-35`: *"`GalaxyView` — its only other caller… moves to the coarse tick in the same change; it has the same `router.push`-under-a-per-frame-render shape."* — the author states outright that GalaxyView has the identical defect shape.
- `proposal.md:53-54`: *"`galaxy-view` takes no delta: no requirement of it names the clock's cadence, and its observable behaviour does not change."*
- `tasks.md` 3.4 migrates `GalaxyView` to the new clock; nothing in group 5 (green/gate) runs a repeat-6 (or any) journey against GalaxyView's own drill-in or burn-redirect navigation — only `vitals-strip-journey.spec.ts` (SystemSpaceView's chevron nav) is gated at `--repeat-each 6` (task 5.3).
- `openspec/changes/fix-world-time-render-loop/specs/` has no `galaxy-view/` directory at all — confirmed by directory listing.

The "no delta needed" claim is not supported: (a) the code *is* changing (task 3.4) because `useWorldTime` is being deleted out from under it, not because galaxy-view's behavior is untouched; (b) whether galaxy-view's own drill-in and burn-redirect navigations stall today at a similar rate is not measured, not mentioned as an open question anywhere in design.md (design.md's "Open Questions" only asks about *SystemSpaceView's* other two pushes — the departure hand-off and the roster row *inside* the system view — never GalaxyView's own pushes); (c) after this change, if GalaxyView's navigations *were* at risk, the fix silently benefits them with zero scenario asserting it, so a future regression here would have no spec or test to catch it. This is precisely the standing lesson about treating "X is unaffected" as a hypothesis, and precisely lesson one's shape (a fix reaching a call site with no requirement forcing anyone to verify it landed there correctly).

Proposed delta — add `openspec/changes/fix-world-time-render-loop/specs/galaxy-view/spec.md`:

```
## MODIFIED Requirements

### Requirement: Drill-In Navigation to the System Board
The system SHALL offer an "Enter system" action on a selected system when
authenticated, navigating to that system's space-view route (the
continuous-space `/systems/:systemId` view — `system-space-view`), and
SHALL NOT offer it on the frozen start area (a read-only showcase with no
space view to enter). This navigation SHALL commit even while the galaxy
graph is mounted and animating: the graph's own animation SHALL NOT be the
reason a requested drill-in navigation fails to arrive.

#### Scenario: Entering a system navigates to its board
- **WHEN** "Enter system" is invoked for a selected system while
  authenticated
- **THEN** the view navigates to that system's space-view route

#### Scenario: No drill-in on the start area
- **WHEN** viewing the frozen start area
- **THEN** no "Enter system" action is offered

#### Scenario: Entering a system commits while the graph animates
- **GIVEN** the galaxy graph is mounted and animating
- **WHEN** "Enter system" is invoked for a selected system while
  authenticated
- **THEN** the browser arrives at that system's space-view route
```

And a small addition wherever the roster's burn-from-galaxy redirect is specified (or as its own scenario on the same requirement, since it's the same navigation class):

```
#### Scenario: A roster burn redirect from the galaxy view commits while the graph animates
- **GIVEN** the galaxy graph is mounted and animating
- **WHEN** a fleet's burn command is invoked from the roster on this view
- **THEN** the browser arrives at that fleet's system route
```

And a tasks.md addition: extend 5.3 (or a new 5.3b) to repeat-6 a GalaxyView drill-in journey the same way the vitals-strip journey is gated, or explicitly document why that's deferred with a filed follow-up defect (not silently dropped).

### 3. `Space View Respects Reduced-Motion Preference` (line 1323) has no production wiring today — design.md's "unchanged" claim is true but misleading

Evidence:
- `frontend/components/space/space-scene.ts:162,192,282,512`: the freeze mechanism (`decorativeTimeMs: reducedMotion ? 0 : worldTimeMs`) exists and is unit-tested (`space-scene.test.ts:453-501`).
- `frontend/components/space/SystemSpaceView.tsx:438`: the **only** production call site — `reducedMotion: false` is **hardcoded**.
- No production file anywhere calls `matchMedia('(prefers-reduced-motion...')` or a `useReducedMotion` hook: `grep -rn "prefers-reduced-motion|matchMedia|reducedMotion" frontend --include='*.ts' --include='*.tsx' | grep -v test` returns only the dead parameter above and one unrelated `use-is-mobile.ts` breakpoint query.

So this is exactly lesson one's shape: built, unit-tested, never reached by production code. The requirement is presently **unimplemented** for any real player. Design.md's Non-Goal — *"Reduced-motion behaviour… unchanged"* — is technically accurate but reads as reassurance ("nothing to worry about here") when the honest statement is "still completely unimplemented, this change doesn't fix or worsen that." Worse: Decision 3's enumeration of what gets handed to the frame loop by ref — *"the stage the scene's inputs (interior, fleets here, selection, sightings) by ref plus the clock"* (design.md line 99-100) — **omits `reducedMotion` entirely**. Since the one call site currently passing it (hardcoded `false`) is exactly the call site being relocated into the draw loop, there's a real risk the parameter gets dropped silently in the refactor rather than merely staying hardcoded — an already-broken requirement quietly becoming *harder* to fix later because its last call site is now inside an imperative rAF loop instead of a memo.

Recommendation: since the call site is being touched anyway, this is the cheapest moment to wire a real `matchMedia('(prefers-reduced-motion: reduce)')` read into the inputs and close this gap in the same change — cost is near zero (one media-query hook, one prop threaded where `false` is threaded today). If the team scopes that out, I'd ask for an explicit line in design.md's Non-Goals naming the defect (not just "unchanged") and a filed defect record, so this doesn't disappear the way the standing-lessons file warns about.

### 4. Time-gated state flips get an unbounded, untested ≤1s lag: `mineRunning`, `ScanControl` `settling`, roster command visibility — no requirement pins the bound

Evidence of the mechanism, precisely:
- `frontend/components/space/SystemSpaceView.tsx:693`: `const mineRunning = !!runningMine && runningMine.eta > worldTime` — this is the **render-time** `worldTime` prop (the value that becomes the coarse 1 Hz tick), used directly to disable/enable controls in `SpaceCommandPanel` (`mineRunning={mineRunning}`, line 854) and `FleetActionsPanel` (`FleetActionsPanel.tsx:151`). This is the value that lags.
- By contrast, `SystemSpaceView.tsx:595-597` (`const mineNow = !!runningMine && runningMine.eta > worldTimeRef.current; if (mineRunningRef.current && !mineNow) landed.push('Mining run complete.')`) reads `worldTimeRef.current` inside an effect keyed on `[allFleets, runningMine]` (line 600) — i.e. triggered by a **data change**, not the coarse tick, and (post-migration) reading `clock.now()`, which is always live. So the *announcement* is unaffected (see Cleared #5 below) but the *button-disabled state* is affected, and only the button state.
- `frontend/components/space/ScanControl.tsx:179`: `const settling = runningEta !== null && runningEta <= worldTime` — same `worldTime` prop, same lag direction.
- `openspec/specs/docked-fleet-actions/spec.md:693-694`: *"Once the ETA passes, the gating SHALL lift without requiring navigation."* No numeric bound.
- `openspec/specs/fleet-roster/spec.md:106-110` (*A past-ETA mine action no longer drives the label*): no numeric bound.
- `openspec/specs/system-space-view/spec.md:2120-2121,2151-2155` (settling): no numeric bound.

The lag is in the **safe direction** (gating persists slightly longer than the true instant; nothing unlocks early), so nothing is unsafe. But it is a real, player-visible change (a "Mining" gate, or a scan's countdown-to-Settling flip, can now visibly hang for up to a second past the moment the player expects it to change) with **zero scenario anywhere asserting the bound is acceptable or has a ceiling**. The ADDED requirement's own text tries to cover this ("a state that flips when a served instant passes… SHALL update at least once per wall-clock second") but that clause lives only in `system-space-view`'s spec and doesn't say it also governs `docked-fleet-actions`' and `fleet-roster`'s own requirements, which are independently specified capabilities consuming a prop `system-space-view` happens to supply.

Proposed delta text — add to `docked-fleet-actions`'s *Running Mine Gates the Fleet Panel's Commands* (line 682, if this change or a follow-up is allowed to touch it):

```
#### Scenario: The gating lift is bounded by the mounting view's clock cadence
- **WHEN** the acting fleet's running mine action's ETA passes
- **THEN** the gating on burn, cut-drive, stop, and jump lifts within one
  second of that instant, without requiring navigation or a refetch
```

And to `system-space-view`'s settling rule (line 2120):

```
#### Scenario: A sweep's settling display is bounded by the view's clock cadence
- **WHEN** a running scan action's ETA passes
- **THEN** the control's display transitions to settling within one second
  of that instant
```

If the panel judges this out of `fix-world-time-render-loop`'s declared capability scope (only `system-space-view` is listed as modified), at minimum the ADDED requirement's own text should explicitly name `mineRunning`, `ScanControl`'s `settling`, and roster command visibility by name as the "state that flips" it means to bound, rather than the generic "every figure this view presents" — because those three specific flags live in `docked-fleet-actions` and `fleet-roster`, not literally "this view."

### 5. Off-screen reach chip lag is disclosed for the "appear" direction only; the "disappear" direction is untested and stands in tension with an absolute existing scenario

Evidence: design.md line 114-116 — *"Membership that depends on position — the off-screen reach chips, a burn mark appearing/disappearing — is recomputed at the coarse cadence and on camera change. A chip may lag a body crossing the viewport edge by up to 1 s."* Task 4.6 tests only: *"a chip appears within one coarse tick of its body leaving the viewport."* No task or scenario covers the reverse: a body re-entering the viewport (its own drift/orbit motion, not a camera change) while its chip is still shown.

The live scenario at `system-space-view/spec.md:1742-1745` (*The affordance covers only off-screen marks*) is unconditional: *"WHEN a body or lane gate's mark is inside the current viewport THEN no off-screen affordance is offered for it."* With the coarse-cadence membership, there is now a real window (up to 1s) in which a mark has re-entered the viewport but its chip is still shown — that scenario, read literally at any instant, is violated during that window, since the code accepts the lag deliberately.

Proposed delta text (append to the same requirement in the ADDED/MODIFIED delta, since it's this change's own tradeoff to disclose):

```
#### Scenario: Chip membership lag is bounded to the coarse cadence in both directions
- **WHEN** a body or lane gate's mark crosses the viewport boundary — in
  either direction — with no accompanying camera change
- **THEN** its off-screen affordance's presence updates to match within one
  second of the crossing, not immediately and not indefinitely
```
This turns the accepted engineering tradeoff into a testable, bounded guarantee instead of leaving the absolute scenario technically false for up to a second at a time.

### 6. Altitude/testability of the ADDED requirement's two most technical scenarios

Evidence — `openspec/changes/fix-world-time-render-loop/specs/system-space-view/spec.md:31-44`:
- *Frames pass without the view rendering*: "**THEN** the view's component tree has not rendered in that interval."
- *A counting figure advances without a per-frame render*: "**AND** the view rendered on the order of once per elapsed second, not once per animation frame."

Both name React's own render behavior — something no player can ever observe (the entire point of the fix is that a player sees *no difference* whether the tree renders once per frame or once per second, only that the picture keeps moving and nothing stutters or breaks). This project's spec convention already treats certain DOM instrumentation (`data-raw`, `data-scale`, `data-world-time`, `data-draw-world-time`) as an accepted proxy for values a player perceives indirectly through rendered text — that's a reasonable and consistent convention. "Component tree has not rendered" and "rendered on the order of once per elapsed second" are a step further than that: they're not a proxy for anything the player perceives, they're a proxy for the *mechanism* used to avoid a defect. That's legitimate as an **implementation-verification** test (and tasks.md 2.1-2.3 correctly treats it that way, with a `React.Profiler` probe and a `console.error` spy), but as **requirement scenarios** they set the bar at the wrong altitude: a requirement scenario should be falsifiable by *what the game does*, and "did React re-render" is falsifiable only by *how the code is built*, which is design.md's job, not the spec's.

The requirement's other two scenarios (*A cross-system selection made while the view animates arrives*, *The animating view raises no update-depth diagnostic*) are much closer to the right altitude — a navigation committing is genuinely player-observable (they get where they clicked), and while "no update-depth diagnostic" is also implementation-facing, it's at least a proxy for a real, player-visible failure mode this same defect record documents (the 20s hang).

Proposed restatement — replace the two flagged scenarios with player-observable framing, keeping the mechanism as design.md's business:

```
#### Scenario: The picture keeps advancing without interrupting other work
- **GIVEN** the space view is mounted with its reads settled and no input,
  refetch, or coarse tick occurring
- **WHEN** several animation frames elapse
- **THEN** the drawn world time advances
- **AND** an unrelated in-app navigation issued during that interval
  commits without waiting on the view

#### Scenario: A counting figure keeps pace without a visible stall elsewhere
- **GIVEN** the acting fleet is burning with a served arrival in the future
- **WHEN** two wall-clock seconds elapse with no read landing
- **THEN** the figure counting down to that arrival has changed by
  approximately the elapsed span
- **AND** no other interaction on the page (keyboard focus movement, a
  pending navigation) is delayed by this view's own updates
```

If the team prefers to keep the render-count scenarios as-is because jsdom/vitest genuinely cannot assert "an unrelated navigation wasn't delayed" without the render-count proxy, I'd accept that as a considered tradeoff — but then the requirement text should say so explicitly (e.g., "verified at the implementation level by a render-count probe, since no DOM-observable proxy exists for a render that did not happen"), rather than presenting the render-count scenario as the primary player-facing acceptance criterion.

## MINOR

None beyond what's folded into the MAJOR items above (I didn't find copy, focus-indicator, or five-states gaps that stood alone at MINOR severity — the reduced-motion and altitude issues are more than polish).

## Cleared hypotheses (evidence included)

1. **"Reduced motion works by suppressing the world-time advance"** — refuted, but not in the reassuring direction. `space-scene.ts:162,282,512` freezes only a separate `decorativeTimeMs` channel, never `worldTimeMs` itself — architecturally the freeze is already decoupled from the clock, so relocating the clock doesn't structurally break the freeze mechanism. The real problem (finding 3 above) is that nothing in production ever sets `reducedMotion` to anything but `false` (`SystemSpaceView.tsx:438`), so the mechanism is sound but dark.

2. **"A restored context's first frame reflects live state" (design.md Decision 3) — verified true.** Today, `data-draw-world-time` is set by an effect at `SpaceStage.tsx:200-204` keyed on `[available, worldTime, onFirstFrame]` — literally the second `setState`-in-a-commit the defect record names. After the change, `draw()` stamps `data-draw-world-time` imperatively every animation frame, reading `clock.now()` directly — not gated by the coarse tick at all. The scenario text at `system-space-view/spec.md:1170-1174` ("the view's redraw is invoked with the post-restore world time…") is architecture-neutral and is, if anything, more directly satisfied after the change (no dependency on a React state update landing) than before.

3. **"Does the focus indicator still track the moving target?" — yes, by construction.** The focus ring is either the native `focus-visible:outline` on the hit-target element itself (`SpaceStage.tsx:584`) or a child `<span data-testid="hit-focus-ring">` positioned `absolute inset-0` inside that same button (`SpaceStage.tsx:599-603`). Since Decision 3 guarantees the button element is never replaced or remounted and moves only via `style.transform`, both the native outline and the child ring move with it automatically — no additional code is needed for this to keep working, and it doesn't depend on React re-rendering.

4. **"Picking against the frame loop's marks" — no regression.** Decision 3 explicitly re-points `pickAt` at "the frame loop's latest mark list (kept in a ref)" rather than the coarse React scene, so *Space View Picking Resolves to the Body, Lane Gate, or Point Under the Pointer* (line 1651) stays accurate to what's actually drawn. (Contrast with finding 1: `onFocusMark`/`reframeOn` were *not* given the same treatment.)

5. **"A Landed Resolution Is Announced to Assistive Technology" (line 1753) — cadence-independent, confirmed by code.** The announcement effect is keyed on `[allFleets, runningMine]` (`SystemSpaceView.tsx:600`), i.e. it fires when a refetch lands new data, not on the coarse tick's interval; the `mineNow` comparison inside it reads `worldTimeRef.current` (soon `clock.now()`), which is always live. The 1 Hz tick governs only the React `worldTime` *prop* used for render-time gating (finding 4), not this effect's trigger or its comparison value.

6. **`add-vitals-strip`'s `system-console` cadence-bearing scenarios do not collide with the 1 Hz tick.** *The countdown advances between reads* (`add-vitals-strip/specs/system-console/spec.md:341-345`) and *The stamp advances between reads* (`:636-640`) only assert monotonic advancement between two reads, with no rate requirement of their own — they were already designed to tolerate any render cadence. Since `system-console` consumes the same `worldTime` prop `system-space-view` already threads to the roster/strip (design.md Decision 2), it inherits the coarse tick with no scenario broken. This confirms design.md's Migration Plan ordering (`fix-world-time-render-loop` archives, then `add-vitals-strip`'s archive gate reruns) is the right order and doesn't require touching `add-vitals-strip`'s frozen deltas.

7. **MODIFIED scenario headings preserved verbatim** (the archiver trap this repo's memory warns about): *Tab reaches hit targets in the defined order*, *Focus survives the view's animation frames*, *A focused body or gate shows a focus indicator*, *Enter/Space selects the focused body or gate*, *A keyboard control selects the point at the camera's pan target*, *The point-selection control is in the tab order and shows focus* all match the live spec's headings exactly (compared `specs/system-space-view/spec.md:1292-1321` against the delta's `:83-112`).

## Items from the brief I did not independently clear or found genuinely uncertain

- **"Is the requirement still sound if the mechanism [for the 20s stall] is only partly understood?"** — Not squarely a UX question, but from a testability standpoint: the ADDED requirement's acceptance bar is empirical (tasks.md 5.3: repeat-6 green, zero update-depth diagnostics) rather than mechanism-dependent, so an incomplete mechanistic explanation doesn't weaken the requirement's *testability*. It does mean a regression with a different root cause could still pass the same gate by coincidence — that's a process/adversary concern more than a UX one; I'd defer to that reviewer.
- **Task sizing against the 40-task cap** — 24 tasks across 5 groups by my count; under the cap. Not a UX-lens item; noting only because the brief asked every flagged item be ruled on.

## Files referenced (all read directly)

- `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/{proposal.md,design.md,tasks.md,specs/system-space-view/spec.md}`
- `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md` (lines 240-380, 870-1330, 1525-1610, 1630-1810, 2090-2160)
- `/Users/travis/Projects/hexaverse/openspec/specs/galaxy-view/spec.md` (lines 1-150, 270-310)
- `/Users/travis/Projects/hexaverse/openspec/specs/fleet-roster/spec.md` (lines 53-190)
- `/Users/travis/Projects/hexaverse/openspec/specs/docked-fleet-actions/spec.md` (lines 682-708)
- `/Users/travis/Projects/hexaverse/openspec/specs/figure-formatting/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/changes/add-vitals-strip/specs/system-console/spec.md` (lines 276-345, 593-645) — read only, not edited
- `/Users/travis/Projects/hexaverse/docs/plans/continous_space/handoffs/defect-cross-system-chevron-nav-stall.md`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.tsx` (lines 400-460, 545-600, 690-730)
- `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.tsx` (lines 180-230, 520-600, 860-895)
- `/Users/travis/Projects/hexaverse/frontend/components/space/ScanControl.tsx` (lines 160-230)
- `/Users/travis/Projects/hexaverse/frontend/components/space/space-scene.ts` (grep lines 162,192,282,512)
- `/Users/travis/Projects/hexaverse/frontend/components/galaxy/GalaxyView.tsx` (lines 182, 235-290, 440-500)

## Verdict

**NEEDS SCENARIOS.** The change is close on its stated scope (system-space-view's own requirements are internally consistent, and three of the author's five flagged weak points clear cleanly), but it has one unaudited implementation gap that can produce visibly wrong keyboard behavior (finding 1), one capability that receives the same code change with zero requirement coverage (finding 2, galaxy-view), one pre-existing dead requirement this change is positioned to fix cheaply but currently doesn't even list as an input (finding 3, reduced motion), and two places where an accepted ≤1s cadence lag needs to be written down as a bound rather than left implicit (findings 4-5). None of these require re-architecting the change; all five have paste-ready or clearly-scoped text above.
