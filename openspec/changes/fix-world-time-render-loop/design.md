## Context

`SystemSpaceView` calls `useWorldTime`, whose `requestAnimationFrame` tick
calls `setWorldTime` every frame. Everything downstream is keyed on that state:
`buildSceneModel` is a `useMemo` on `worldTime`, `SpaceStage` re-projects every
mark's DOM hit target in render, and `SpaceStage.tsx:200` runs an effect keyed
on `worldTime` that calls `setDrawWorldTime` — a second update inside every
commit, which is what React's `Maximum update depth exceeded` diagnostic (31 of
them in one journey) is reporting.

The WebGL layer is already not part of this problem: `webgl/SpaceWorld.tsx`
owns a `requestAnimationFrame` draw loop that reads `sceneRef.current` and
`cameraRef.current`. React's per-frame work today is not small: `worldTime` is
`SystemSpaceView`'s own state, so a frame re-renders the whole view — the
scene memo, `SpaceStage` and all six of `SpaceLayers`' mark layers, and the
entire floating command column (`SpaceCommandPanel`, `FleetActionsPanel`,
`ScanControl`, `FleetRoster`, `VitalsStrip`), every one of which takes
`worldTime` as a prop. What the picture actually needs from that render is two
things: a refilled `sceneRef` and moved DOM hit targets.

Evidence (2026-09-19, recorded in
`docs/plans/continous_space/handoffs/defect-cross-system-chevron-nav-stall.md`):
the chevron's cross-system `router.push` stalled past 20 s in 4 of 6 solo
repeats; with the tick's `setState` silenced from just before the click, 0 of
6. The full suite that reproduced it ran in 13.8 min, so machine load is ruled
out.

**What is not known.** React marks a starved transition lane expired after
~5 s and then renders it without yielding, which should rescue a navigation
well inside 20 s. It did not. The likeliest reason is that the target route
suspends more than once and each suspension clears the lane's expiry, but this
is unverified — and it matters for Decision 3: *a smaller per-frame React
render is not known to be safe.* Only "no per-frame React update at all" has
been shown to work.

Constraints: no backend or wire change; `frontend/lib/space` stays draw-only
(`space-kinematics` anti-mirror); solo toy — delete what is replaced, no
coexistence, no flag.

## Goals / Non-Goals

**Goals:**
- No React render is caused by a frame passing, in either view.
- The picture is exactly as continuous as today; the hit targets track it.
- Time-counting figures tick at 1 Hz.
- `add-vitals-strip`'s journey is green on its own dedicated closing run
  (`--repeat-each 20`, tasks.md 5.3) with no update-depth line in its console
  capture.
- The view's reduced-motion preference is honored **live** — a `change`
  listener on `matchMedia('(prefers-reduced-motion: reduce)')`, not a
  mount-only read — making *Space View Respects Reduced-Motion Preference*
  (`system-space-view/spec.md:1323-1337`, already fully specified with its
  scenario) true. Folded into this change per Travis's ruling on OQ1,
  reversing the panel's recorded lean (C4); see
  `drift-reduced-motion-never-detected.md` and tasks 2.5/3.8.

**Non-Goals:**
- Reducing what a *legitimate* render of `SystemSpaceView` costs (it is a
  979-line component; splitting it is 2b's and link 4's business).
- Any general "pause animation during navigation" mechanism (rejected below).
- Camera behaviour and picking rules — unchanged.
- A production-build measurement. Stated as unmeasured; not gated on.

## Decisions

### 1. A clock object, not a clock state

`frontend/lib/client-clock/`: `createWorldClock()` returns `{ anchor(world,
scale), now(), hasReading() }`. `now()` is `projectWorldTime` (moved here
verbatim from the deleted hook, with its tests) evaluated on demand against
`wallClock()`. No timer, no rAF, no subscription list — a frame loop *pulls*
the time; nothing pushes it.

**Not `lib/world-clock/`, deliberately.** `world-clock` is the name of a
Go-sole-authority capability (`openspec/specs/world-clock/spec.md`: the
process-wide simulation singleton, `WorldMillis`, `FromWall`), and this module
evaluates the same `world + elapsed × scale` formula in TypeScript. That is
permitted — `system-space-view`'s *Own-Fleet Position, Burn Curve, and
Arrival Ghost Render Continuously* explicitly requires the client to
extrapolate world time between polls at the served scale, because a paused
network must still animate — but it is permitted as a *projection of a served
reading*, never as a second authority: this module reads nothing but the
anchor a server read gave it, and no rule-bearing value is computed from its
output. Naming the directory after the Go capability invites exactly the
mirror the name forbids, and `check-mirror-map.sh` would not catch it (its six
pairs are `backend/<pkg> ↔ frontend/lib/<pkg>`; the Go clock lives in
`backend/common/worldtime.go`, so no pair exists to fire).

`now()` before the first `anchor()` call SHALL return the value implied by "no
reading yet" without throwing — the clock has no anchor to project from, so
`now()` SHALL return `0` (matching the deleted hook's initial `serverWorldTime
?? 0` state) rather than projecting against an uninitialized anchor.
`hasReading()` distinguishes this state for any caller that needs to skip
work rather than render at `0`. Without this, `now()` called before the first
`anchor()` ever runs — exactly the state the view is in for at least one
frame after mount, before the interior/fleet read lands — destructures a null
anchor and throws inside an animation-frame callback, which no React error
boundary can reach.

**Named caller (m18):** `GalaxyView`'s unserved-scale hold
(`specs/galaxy-view`'s ADDED requirement, B5) is exactly this caller.
`useWorldClock` re-anchors only when both a served world time and a served
scale are available (the fleet-list envelope's `scale` field — served
unconditionally per `fleet-movement`'s *Fleet Reads Serve the Simulation
Clock's Scale Alongside Their World Time*, including on an empty list —
falling back to `myFleets?.[0]?.scale`; `Galaxy` has no `scale` field), so
while no scale has been served — the own-fleets read has not yet landed,
which is the only window left once the envelope is read (task 3.4) — the
clock is never (re-)anchored, `hasReading()` stays `false`, and `GalaxyView`
renders the raw served world time it already holds directly instead of
`clock.now()`, holding the last served instant rather than projecting it
forward at an assumed rate (task 3.4).

`anchor()` SHALL replace the clock's anchor with a new object in a single
assignment, never mutate the previous anchor's fields in place.

`useWorldClock(serverWorldTime, scale)` holds one clock in a ref for the
view's lifetime and re-anchors it in an effect whenever a fresh served reading
arrives and a served scale is available (see the named-caller paragraph
above). Its return value is referentially stable, so passing it as a prop
never invalidates a memo.

*Alternative — `useSyncExternalStore` with a per-frame subscriber in a leaf.*
Rejected: it is still a default-priority React update every 16 ms, which is
the thing not known to be safe (Context).

*Alternative — keep the state, wrap the tick in `startTransition`.* Same-lane
updates do not interrupt a navigation, so this would probably fix the stall in
three lines. Rejected as the answer (Travis chose removal): it keeps the
60 Hz whole-view render and its nested update, and makes the picture's frame
rate hostage to every other transition. Kept in mind as the fallback if
Decision 3 proves larger than sized.

### 2. One coarse tick for everything React shows

`useCoarseWorldTime(clock)` returns a `number` that updates once per wall
second (`setInterval`, 1000 ms) and immediately on re-anchor. `SystemSpaceView`
and `GalaxyView` pass *this* as the `worldTime` prop the panels, roster and
strip already take — their prop types, `data-raw` contracts and formatter
calls do not change. `data-world-time` (on the sr-only `space-world-clock`
span — `SystemSpaceView.tsx:703-708` — not the view root, contra this
document's earlier draft) becomes the coarse value.

State flips gated on time (`mineRunning`, `ScanControl`'s `settling`,
`rosterCommandVisibility`) may now land up to 1 s after the served instant
instead of ≤16 ms. Accepted: every one of them is *already* followed by an
ETA-scheduled refetch with `ETA_CUSHION_MS`, which reads `worldTimeRef` —
that ref is replaced by `clock.now()`, so scheduling gets more accurate, not
less.

This refetch-scheduling argument covers only the self-scheduled `setTimeout`
calls, which read `clock.now()` at arm-time and are unaffected by tick
cadence (`SystemSpaceView.tsx:508-518`, `:595`). It does **not** cover
`mineRunning` (`SystemSpaceView.tsx:693`), `ScanControl`'s `settling`
(`ScanControl.tsx:179`), or `rosterCommandVisibility`'s gate-lift
(`FleetRoster.tsx:122-135`), which are plain per-render comparisons against
the `worldTime` prop and will lag the served instant by up to 1 s under the
coarse tick where they previously lagged by ≤16 ms. Accepted separately: no
requirement in `system-space-view`, `fleet-roster`, or `focused-scan` states a
freshness bound tighter than "at or before the current world time," and
`figure-formatting`'s own duration text has no sub-second resolution, so a 1 s
lag in a *state flip* that gates a control's presence is a genuine, if minor,
UX regression, not a spec violation. The ≤1 s bound itself is stated once, in
the ADDED requirement's cadence paragraph, which names these three by
capability, so it is not re-litigated per capability.

*Alternative — schedule a one-shot tick at the next served ETA as well.*
Deferred; add only if a test shows a gate visibly lagging.

### 3. The frame loop evaluates the scene and moves the hit targets

Today React builds one `SceneModel` per frame and hands it to `SpaceWorld` by
ref. After: `SystemSpaceView` hands the stage the scene's **inputs** (interior,
fleets here, selection, sightings, and `reducedMotion`) by ref plus the clock;
the extracted transform loop (decided below — not `draw()`) builds the
frame's `SceneModel` **once**, at one `clock.now()`, calling
`buildSceneModel({...inputs, worldTimeMs: clock.now()})` at the top of each
frame, syncs the DOM hit targets from it, and publishes it to the ref the GL
draw loop draws from. The GL loop builds no scene of its own — it is a
second, GL-only *consumer* of that published `SceneModel`, never a second
caller of `buildSceneModel` — so `buildSceneModel` still runs exactly once
per frame, 60×/s, same as today. `buildSceneModel` is already pure and
already runs 60×/s — this moves the call, not the cost.
`reducedMotion` is threaded through by ref from the new live
`prefers-reduced-motion` read (Goals; tasks 2.5/3.8) rather than from a
literal. The loop itself lives in its own module,
`frontend/components/space/space-transform-loop.ts`, **mounted from
`SpaceStage`** — not from the dynamically imported `webgl/SpaceWorld` module
(`SpaceStage.tsx:71-73`'s `dynamic(..., {ssr:false})` boundary) — which is
what keeps it observable directly under jsdom from `SpaceStage`/
`SystemSpaceView` tests (Decision 3's testability rationale, below).

**One writer per element.** React renders the *set* of targets (identity,
labels, tab order, aria) from a scene built at the coarse time and registers
each element in a `Map<markId, HTMLElement>` via a callback ref (`el ? set :
delete`, so a detached mark is de-registered rather than leaked — task 4.3a).
React writes **no position at all** — every target is anchored at the layer's
origin, and its entire placement, the −50%/−50% centring included, is one
`style.transform` written by the transform loop every frame it runs. That is
the point of the split: one writer per element, so a coarse render can never
re-anchor a target the loop has already moved this frame. An element is never
keyed on position and never replaced, which is what keeps *Focus survives the
view's animation frames* true by construction. A mark whose projection is
off-screen is transformed off-screen, replacing today's `left: -9999px`
sentinel — and the on-screen test that today decides whether a target is
placed at its mark or parked at `-9999px` (`SpaceStage.tsx:586-590`) moves
with it: that test is part of the *position* the loop writes every frame, not
a separate membership decision, so a mark re-entering the viewport is
clickable the instant the loop draws it there, never left parked off-canvas
for up to a second the way a coarse membership recompute alone would leave
it.

**Which marks the one-writer rule binds (m20).** Contacts and sighting
ghosts keep their React-written `left`/`top` from the coarse scene — frozen
in world space by requirement, they move on screen only when the camera does,
which is already a render. The one-writer rule above binds only the marks the
loop positions because they move under world time alone: bodies, lane gates
and own fleets.

**One basis, computed once per frame.** The transform loop's live
`viewBasisOf` result is published to a ref (Decision 7); `pickAt`'s
point-selection unprojection reads that ref instead of `SpaceStage`'s own
`[host]`-keyed memo, which is deleted. The DOM hit-target picking path itself
is unchanged and stays the
only mark-picking authority (Decision 8) — this basis is for unprojecting an
empty-space click to a point, never for resolving a click against a mark.

Membership that depends on position — the off-screen reach chips, a burn mark
appearing/disappearing — is recomputed at the coarse cadence and on camera
change. A chip may lag a body crossing the viewport edge by up to 1 s, in
either direction — bounded and stated in the ADDED requirement.

`data-draw-world-time` and `onFirstFrame` do **not** move to the loop —
see Decision 6.

*Alternative — coarse-render the hit targets too.* Rejected: a burning fleet's
target would trail its drawn mark by up to a second, and picking would miss.

**Decided — OQ3: the transform writer is extracted from GL construction.**
`draw()` never executes under any `SpaceStage` or `SystemSpaceView` test, and
never under the shared setup's default fake — confirmed by the harness
rather than inferred: `vitest.setup.ts:134-138`'s `fakeWebglContext()`
implements only `getExtension`, while `SpaceWorld.tsx:220-221` requires
`createProgram` before constructing a renderer.
`webgl/SpaceWorld.draw.test.tsx` is the one exception — it reaches `draw()`
under jsdom with its own per-file `getContext` spy and a `three` double,
never touching the shared fake — but that suite constructs `SpaceWorld` with
a `scene` prop, which task 4.2 removes, so it proves nothing about the
relocated system's coverage under option B. Left inside `draw()`, the
entire relocated system (`buildSceneModel` in the loop, the registry,
`projectMarks` against live inputs, the transform writes) would ship with no
automated coverage beyond a decontextualized pure-function test of
`projectMarks` and the tier-4 journey's navigation/console assertions, which
say nothing about hit-target correctness or leak-freedom.

**Decision: option (B).** Registry lookup + `projectMarks` +
`el.style.transform` becomes a function with its own rAF loop, gated on
`available` the same way `draw()` is, but **not** gated on the renderer
constructing. Testable under jsdom with no GL fake at all. Chosen for three
reasons: it is the more reversible change (one module, no change to the
shared test setup, no existing test's branch changes), it is what this
repo's standing lesson argues for (wire real behaviour under test rather
than build a faker), and it leaves the GL loop doing only GL. It does change
this change's own architecture — two loops instead of one, the
transform-writing loop and the GL draw loop as two rAF consumers of the same
scene inputs, not one — which is why the artifacts throughout this document
and tasks.md name "the transform loop", not `draw()`, as the frame-loop
authority for positioning.

**Rejected — option (A), extend the fake WebGL context** so THREE can
construct a renderer under jsdom (`createProgram`, `createShader`,
`createBuffer`, `getParameter`, …) — a bounded, known surface used by several
open-source THREE/jsdom setups. Rejected because it requires extending the
shared `vitest.setup.ts` WebGL fake, and every existing `SpaceStage` test
currently exercising the fail-soft branch — most of what those tests assert
today — would need to change behaviour; it would also leave a growing fake
that drifts from real GL over time.

### 4. When the canvas is unavailable

No draw loop runs, so nothing moves — correct, there is no picture. The
panels still tick on the coarse value. No change to the unavailability
requirements.

### 5. Proving "did not render"

Unit level: a render-count probe (`React.Profiler` `onRender`, or a counter in
a test-only child) around `SystemSpaceView`, fake timers, advance N frames of
rAF → count unchanged; advance 2 s → count grew by ~2. Update-depth: spy
`console.error` for the diagnostic string across the same window. Tier 4: the
existing journey's `[journey-console]` capture already greps for it.

The unit-level render-count and update-depth tests are regression guards for
the *mechanism this change removes* (a per-frame `setState`) — they are
necessary but not sufficient evidence for *Animation Never Re-Renders the
View, and Never Starves a Navigation*'s central navigation claim.
`SystemSpaceView.test.tsx` mocks `next/navigation`, so no unit test — under
this change or any future one — can exercise a real App Router transition;
only the tier-4 journey, against a real dev server, tests whether a
navigation actually arrives. Treat a green unit suite alone as proof of
nothing about navigation; the journey is the only evidence for that clause.

### 6. The draw stamp keeps its availability gate, and keeps a React writer

`data-draw-world-time` stays on the canvas region element
(`data-testid="space-canvas-region"`, owned by `SpaceStage`) and stays
**written from React**, at the coarse cadence, under the existing
`if (!available) return` guard. Only the *value* changes: it becomes
`clock.now()` sampled at the coarse tick rather than the per-frame `worldTime`
prop.

Rejected — stamping it from `draw()`. Two reasons, both structural rather
than stylistic:

1. The loop does not know about availability. `SpaceCanvas` keeps `SpaceWorld`
   mounted through the interrupted state on purpose (a detached canvas never
   receives `webglcontextrestored`), and three's lost-context handling
   early-returns from `render()` without stopping the rAF chain. A stamp
   written by the loop would therefore keep advancing while the context is
   lost — which is precisely what today's guard exists to prevent, and what
   *A restored context's first frame reflects live state, not a stale one*
   is asserted by.
2. Under jsdom the loop never runs (the `webgl2` probe returns null), so a
   loop-written stamp is unobservable in every component test. The one
   existing unit assertion for that scenario would have no surface left.

The stamp therefore remains "the newest world time React has seen while the
context was live", which is what the scenario actually needs, and gets no
worse: a coarse stamp still advances after a restore and still freezes during
the loss.

`onFirstFrame` likewise stays on the React side, for the same two reasons plus
a third: `SpaceWorld`'s effect dependency array is `[canvas, extent,
onFirstFrame]`, and the view supplies an inline arrow, so routing the callback
down would rebuild the renderer and every mesh on every render. If a future
change does want "first frame" to mean "a frame actually drew", the callback
must first be stabilised with `useCallback` at its source AND the loop must
also announce on its failure path — otherwise a first draw that throws
(`SpaceWorld` fails soft by design) leaves the loading overlay up forever,
because the renderer-availability guard is a separate pre-flight probe that
stays `live` through that throw.

### 7. One basis, computed once per frame, published by ref

The transform loop publishes the basis; the GL loop consumes it. The
transform loop — not `draw()` — is the single basis authority, and
`SpaceStage`'s memo deletion below still holds. Because the transform loop is
gated on `available` alone, never on the renderer constructing (Decision 3),
this holds even on the fail-soft path (`SpaceWorld.tsx:224-229` — probe live,
renderer threw): the transform loop still runs, still computes and publishes
a basis, and still positions the DOM hit targets and off-screen chips, even
though no `draw()` call ever executes and no picture is drawn. A GL-refusing
driver therefore still gets positioned hit targets and off-screen chips — a
plain property of the transform loop's design, not a conditional fallback —
so no separate React-side basis recompute is needed for that path (task
4.6).

`draw()` already recomputes `viewBasisOf(camera, {width, height})` from the
canvas's live client size every frame; `SpaceStage`'s own `basis` memo is
keyed on `[host]` and therefore never updates on a resize. Two projections
that agree only by accident become two projections that disagree the moment
one of them moves to the loop. The transform loop therefore computes and
writes the frame's basis into a ref that `pickAt` reads, so the point pick
unprojects through the same basis the marks were projected with.
`SpaceStage`'s `basis`/`viewport` memos are deleted rather than left beside
them — a second basis nobody reads is the next reader's trap.

**Coarse membership reads the same basis (M11).** The coarse membership
computation (Decision 3's off-screen-affordance recompute, task 4.6) reads
the same published basis the loop writes, sampled at the coarse tick and on
camera change; there is exactly one `viewBasisOf` result in the view at any
instant. Before the first frame publishes one, no mark is classified
off-screen and no chip is offered.

### 8. The DOM hit targets stay the only mark-picking authority

`pickAt` keeps receiving an empty mark list. This looks like an omission and
is not: `SpaceLayers` declares `onPointerUpCapture` but never calls it
(`SpaceStage.tsx:499` declares it, the function's parameter list at
`:502-526` never destructures it), so `resolvePick`'s mark loop has been
unreachable in production since it was written. Every body and gate pick is
resolved by `bodyIdUnder`'s `closest('[data-body-id]')` on the DOM targets,
and the DOM targets are precisely what this change makes frame-accurate.

Wiring the mark list live would create a second picking authority with a
different hit geometry — a 24 px CSS box versus `max(radiusPx + 8, 16)` — and
the two disagree in a band around every mark, where a click that produces a
point selection today would start producing a body selection. That is a
change to *Space View Picking Resolves to the Body, Lane Gate, or Point Under
the Pointer* and belongs in a change that specifies it. This change does
less, not more, at the picking boundary: once the DOM targets are positioned
by the frame loop (Decision 3's whole point), the DOM path is already
frame-accurate — which is exactly the property the dropped path was trying to
buy.

## Risks / Trade-offs

- **[Decision 3 is the expensive half, and it does not split]** `SpaceStage` is
  1034 lines across five test files. → Size the tasks against those files first
  (the system-hud chain's standing lesson). But the seam this risk originally
  proposed — ship the clock and the nested-effect removal with hit targets
  temporarily coarse — is **not available**: with React's per-frame work at zero
  and the scene still built in React, `sceneRef.current` carries a
  once-a-second scene and the picture steps, falsifying *An idle fleet renders
  at its live position, advancing with world time*; and coarse hit targets
  falsify *Hit targets SHALL be positioned at the marks actually drawn*. The
  invariant is atomic: the frame React stops rendering is the frame the loop
  must own both the scene and the moving targets. If the count exceeds ~40, cut
  scope instead — drop the `pickAt` mark-list rewire (dead in production today,
  see Decision 8) and bound the imperative set to the three mark classes that
  actually move under world time (Decision 7) — and if it still exceeds it,
  ship Decision 1's rejected `startTransition` fallback as its own change
  rather than half of this one.
- **[jsdom has no layout, tests fake rAF, and `draw()` never runs under a
  `SpaceStage` or `SystemSpaceView` test]** Imperative transforms are
  invisible to `getByRole`-style assertions, and — confirmed by the harness,
  not inferred — `SpaceWorld.tsx:220-221` requires `createProgram`, which
  `vitest.setup.ts`'s fake WebGL context does not implement, so `draw()`
  never executes under any `SpaceStage` or `SystemSpaceView` test, and never
  under the shared setup's default fake (`webgl/SpaceWorld.draw.test.tsx`
  reaches it with a per-file `getContext` spy and a `three` double, but that
  suite is neither of those two, and its `scene`-prop construction is
  removed by task 4.2). → Position assertions move to a pure
  `projectMarks(scene, basis)` unit; component-level coverage of the
  transform write itself is provided by the extracted transform loop
  (Decision 3, decided — option B), which runs under jsdom with no GL fake
  needed.
- **[The mechanism for the 20 s stall is not fully explained]** → The gate is
  empirical: this change's own dedicated closing run (`--repeat-each 20`,
  tasks.md 5.3) green and zero diagnostics. If it is not green after this
  change, the diagnosis was incomplete — stop and re-measure, do not tune. A
  single 20/20 leaves a ~14% 95%-upper-bound failure rate; a second
  independent 20-repeat run would tighten that further but is declined
  (USER RULING 2, OQ2) — not left as an open cost question.
- **[1 Hz gating lag]** → Decision 2; refetches are clock-accurate regardless,
  but `mineRunning`, `ScanControl`'s `settling`, and `rosterCommandVisibility`
  are a genuine (if minor) ≤1 s display lag the refetch argument does not
  cover — Decision 2's second paragraph.
- **[Two scene builds]** one coarse in React (`SystemSpaceView`'s scene memo),
  one per frame in the transform loop — that is the whole count: per
  Decision 3, only the transform loop calls `buildSceneModel` per frame and
  publishes the result by ref, and the GL loop consumes that published
  `SceneModel` rather than building its own, so this stays two builds total,
  not three. The per-frame one already exists today (the memo lists
  `worldTime` in its deps and therefore misses every frame), and the coarse
  one is 1 Hz. Net CPU falls by the whole-view render the frame no longer
  triggers, which is the scene memo plus six mark layers plus five panels.
  One caveat: the builder is pure except for its injected `log`, wired to
  `console.warn` and fired by the origin-omission rule. At frame rate (one
  `buildSceneModel` call per frame, not two), one omitted mark is still ~60
  warnings a second in the journey's `[journey-console]` capture — the
  surface this change greps for its own evidence. Unchanged from today, but
  the gate run should not be the first place it is noticed.

## Migration Plan

Frontend-only; deploys with the next Vercel build.

Archive order: **`add-vitals-strip` first, this change second.** 2a is built
and blocked only on this defect. This change's ADDED requirement names the
strip's fleet switcher, a `system-console` requirement that exists only
inside 2a's deltas — archiving in the other order leaves a live requirement
referencing a capability `openspec/specs/` does not have. The two changes'
MODIFIED headers are disjoint, so neither order corrupts the other;
`openspec-reconcile.py` is re-run after 2a archives regardless, because 2a's
archive is the only event that could invalidate this change's blocks and the
archiver's own check fires too late to be the first to know.

**Two separate closing invocations, not one shared run.** This change's
closing evidence is its own dedicated run of the journey spec at
`--repeat-each 20` (tasks.md 5.3) — this is what closes
`defect-cross-system-chevron-nav-stall.md`. `add-vitals-strip`'s archive gate
is a separate, later invocation of the full suite (tasks.md 5.4's `npm run
e2e`). A single shared execution would let one lucky green clear both records
off one data point; splitting by scope means neither stands in for the other.

Sequence: (1) implement this change; (2) this change's own tier-4 closing
evidence (5.3); (3) `openspec-reconcile.py`, archive `add-vitals-strip`;
(4) re-run `openspec-reconcile.py` — 2a's archive is the only event that can
invalidate this change's MODIFIED block; (5) archive this change.

**Rollback, post-archive.** Rollback before this change has archived is a
plain `git revert`. If a revert is needed *after* this change has archived,
`git revert` alone is insufficient: the ADDED requirement in
`openspec/specs/system-space-view/spec.md` must be reverted or reopened as
its own change alongside the code, and
`docs/plans/continous_space/handoffs/defect-cross-system-chevron-nav-stall.md`
must be reopened (status back to OPEN) — a code-only revert would leave the
spec asserting an invariant the code no longer holds, and `add-vitals-strip`'s
archived status must be reconsidered, since its own gate depended on this
fix.

## Open Questions

All four questions the panel raised
(`docs/plans/continous_space/handoffs/fix-world-time-render-loop-rulings.md`)
were answered directly by Travis, 2026-09-19 (that file's "USER RULINGS —
Travis, 2026-09-19" section). Three are kept below as the resolution record;
OQ3 is removed from this list entirely because its resolution is now folded
into Decision 3 above (extraction into a decided architecture), not a
separate open item.

- **OQ1 — Reduced-motion drift: fold into this change, or its own
  follow-up? Resolved: fold in (option A).** Reverses the panel's recorded
  lean (B, ruled in via C4 for lack of scope authorization on this run).
  `Space View Respects Reduced-Motion Preference` is already fully specified
  and already carries its scenario (`system-space-view/spec.md:1323-1337`;
  `drift-reduced-motion-never-detected.md`) — the code simply never
  satisfies it. Because the requirement is already correct, this is
  tasks-only, no spec delta (tasks 2.5, 3.8). Detection must track the
  preference live via the media query's `change` listener, not a mount-only
  read, because the requirement's condition is "WHILE", not a one-time
  check. See Goals (added) and Non-Goals (the reduced-motion bullet is
  removed — it is no longer out of scope).
- **OQ2 — A second independent `--repeat-each 20` run before closing the
  defect? Resolved: one run (option A),** matching the panel's lean.
  `R-8`'s statistical reasoning for raising 6 → 20 stands; the second run is
  declined by Travis, recorded here as a ruling rather than left as an
  open cost question.
- **OQ4 — `GalaxyView`'s clock has never been given a served scale**
  (`defect-galaxy-view-clock-ignores-served-scale.md`), pre-existing and not
  caused by this change. **Resolved: fix it now (option A),** matching how
  task 3.4 and the `galaxy-view` delta were already authored — the marginal
  cost is passing the served scale through the new
  `useWorldClock(serverWorldTime, scale)` call this change already writes.
  **The paragraph below — the reversal instruction offered against this
  ruling — is MOOT / SUPERSEDED and MUST NOT be executed by a later reader.**
  Kept only as the record of what was offered and declined:

  > If Travis prefers strictly behaviour-preserving scope instead, drop the
  > fourth paragraph and both its scenarios (*The projected clock runs at
  > the served scale*, *The projected clock holds when no scale has been
  > served*) from `specs/galaxy-view/spec.md`'s ADDED requirement before
  > implementation, amend task 3.4 to pass a literal `1` as the scale (not
  > *no* scale — `useWorldClock` anchors only on a served scale, so omitting
  > it freezes the clock at 0), and drop tasks 3.4c and 3.4d with their
  > scenarios, and note that under this branch `hasReading()` loses its
  > named caller and should be dropped from Decision 1 (m18) while
  > `defect-galaxy-view-clock-ignores-served-scale.md` stays open.

Carried from the original design, unmeasured and not blocking:
- Do the other two pushes (departure hand-off, roster row) stall today at a
  similar rate? Worth one repeat-6 measurement *before* the fix if a spec
  reaches them cheaply; not blocking.
- Should `defect-spacestage-keyboard-camera-timeout-flake.md` and
  `defect-wake-roster-row-flake.md` be re-tested after this lands? Both are
  "the app did not get there in time" on views that render per frame. Likely
  related, not claimed.
