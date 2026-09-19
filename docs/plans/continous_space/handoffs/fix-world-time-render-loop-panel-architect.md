# Panel report — architect (`fix-world-time-render-loop`)

Persisted verbatim by the orchestrator, 2026-09-19. Reviewer: `openspec-architect`,
Phase 1, read-only round.

---

# Architect review — `fix-world-time-render-loop` (Phase 1 panel)

Read-only round. No file under `openspec/changes/fix-world-time-render-loop/` was
touched. Every design.md and delta change I propose is given below as paste-ready
text for the spec writer's consolidated pass.

**Verification posture.** I checked every code claim the change makes against the
tree. Three claims are true as written, four are true but materially understated,
and two are false. `openspec validate fix-world-time-render-loop --strict` and
`python3 .claude/scripts/openspec-reconcile.py` both run clean today (re-run
confirmed this session); the MODIFIED block for *Body, Lane-Gate, and Point
Selection Is Keyboard-Operable* carries all 6 live scenarios verbatim (diffed
programmatically — only the prose clause differs), so the archiver's
scenario-omission gate is satisfied.

---

## F1 — BLOCKER — Moving the draw stamp into `draw()` drops an availability gate and makes a live scenario's only evidence vacuous

**Evidence.** Today the stamp is written under an explicit availability guard:

`frontend/components/space/SpaceStage.tsx:197-204`
```
  // The draw stamp advances only while the context is live, so a redraw
  // after a restore is observably taken from the CURRENT world time rather
  // than replayed from the stale one the loss froze.
  useEffect(() => {
    if (!available) return
    setDrawWorldTime(worldTime)
    onFirstFrame?.()
  }, [available, worldTime, onFirstFrame])
```

During the interrupted (context-lost) state, `SpaceWorld` **stays mounted** —
deliberately — while the interactive layers unmount:

`frontend/components/space/SpaceCanvas.tsx:135-136`
```
        {canvas && renderWorld?.(canvas)}
        {available && children}
```
(with `SpaceCanvas.tsx:16-21` stating the reason: "`interrupted` keeps this SAME
`<canvas>` mounted and attached — a detached canvas never receives
`webglcontextrestored` again".)

And `draw()`'s rAF loop is never cancelled on context loss — only on effect
cleanup (`SpaceWorld.tsx:627-650`, `SpaceWorld.tsx:652-653` `disposeAll` →
`cancelAnimationFrame`, invoked only from the effect teardown at
`SpaceWorld.tsx:689` or the first-draw catch at `:684-686`). three's own
context-lost handling early-returns from `render()`; the rAF chain keeps running.

**Why it matters.** Task 4.5 ("`draw()` stamps `data-draw-world-time` on the
canvas region after a successful render") removes the `if (!available) return`
gate with nothing replacing it. The stamp would then advance *throughout* the
interrupted state. The live scenario

`openspec/specs/system-space-view/spec.md:1170-1174`
```
#### Scenario: A restored context's first frame reflects live state, not a stale one
- **WHEN** a lost rendering context is restored
- **THEN** the view's redraw is invoked with the post-restore world time and
  the latest interior/own-fleets read
- **AND** no pre-loss image is retained
```
is asserted at unit level by exactly one test, which reads that attribute:
`frontend/components/space/SpaceStage.renderer.test.tsx:249`
```
      expect(screen.getByTestId('space-canvas-region')).toHaveAttribute('data-draw-world-time', '999999'),
```
If the stamp advances during the loss, that assertion passes for a view that
replayed a stale frame — a green test proving nothing (lesson two, verbatim).

**Second half of the same finding.** Under jsdom the renderer is never
constructed (`SpaceWorld.tsx:220-221`: the `webgl2` probe returns null and the
effect returns), so `draw()` never runs and `data-draw-world-time` is **never
written at all**. Task 4.5's "Re-point the lost-context restore test at the
stamp" is not possible as written: there will be no stamp in any
`SpaceStage`-level test. The same applies to `SpaceStage.test.tsx:56`.

**Paste-ready design.md (new Decision 6, replacing the last paragraph of
Decision 3):**

```markdown
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
```

**tasks.md correction (for the writer):** 4.5 should read *"Delete
`drawWorldTime`'s dependence on the per-frame value; the `SpaceStage.tsx:200`
effect keeps its `if (!available) return` guard and its `setDrawWorldTime`, now
keyed on the coarse tick. `SpaceStage.renderer.test.tsx`'s restore assertion
stays where it is, unchanged."*

---

## F2 — BLOCKER — Moving `onFirstFrame` onto the draw loop can wedge the loading state forever, and would rebuild the whole GL world every render

**Evidence.** `SpaceStage` does **not** pass `onFirstFrame` to `SpaceWorld`
today — the prop exists on `SpaceWorld` but is unused in production:

`frontend/components/space/SpaceStage.tsx:382-390`
```
        renderWorld={(canvas) => (
          <SpaceWorld
            canvas={canvas}
            scene={scene}
            camera={camera}
            extent={extent}
            actingFleetId={actingFleetId}
          />
        )}
```
(grep confirms the only callers of `SpaceWorld`'s `onFirstFrame` are
`webgl/SpaceWorld.draw.test.tsx:425`. In production the announcement comes from
`SpaceStage.tsx:203`.)

It gates the loading overlay:
`frontend/components/space/SystemSpaceView.tsx:694`
```
  const showLoading = !interiorFailed && canvasAvailable && (interior.isLoading || !firstFrame)
```
against the live requirement
`openspec/specs/system-space-view/spec.md:76-80`
```
The system SHALL show a loading state while the interior read is in flight,
or, while the view's rendering context is available and uninterrupted, until
it has produced its first rendered frame.
```
(the identical sentence is inside `add-vitals-strip`'s MODIFIED block at
`openspec/changes/add-vitals-strip/specs/system-space-view/spec.md:61`, so it is
live either way).

**Why it matters — failure mode.** `SpaceWorld` fails soft on a first-draw
throw and never announces:
`frontend/components/space/webgl/SpaceWorld.tsx:682-687`
```
    try {
      draw()
    } catch {
      disposeAll()
      return
    }
```
Availability is decided by a *separate* pre-flight guard
(`SpaceCanvas.tsx:89-90`, `const available = guard.status === 'live'`), which
stays `live` in that case. So: renderer constructs, first draw throws, guard says
live, `firstFrame` never set → "Charting the system…" forever, with no error
state and no retry. Today the React effect fires `onFirstFrame` regardless, so
this mode does not exist.

**Why it matters — second, independent hazard.** `SpaceWorld`'s effect dependency
array is `[canvas, extent, onFirstFrame]` (`SpaceWorld.tsx:690`), and
`SystemSpaceView.tsx:777` supplies an inline arrow:
```
              onFirstFrame={() => setFirstFrame(true)}
```
Threading that identity down through `SpaceStage` into `SpaceWorld` without
stabilising it tears down and rebuilds the entire three.js scene — renderer,
starfield, every mesh, every belt field — on **every React render**. That would
convert a performance change into a performance catastrophe, and it would do it
silently (the picture still draws).

**Paste-ready design.md addition (append to Decision 6):**

```markdown
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
```

**tasks.md correction:** strike "`onFirstFrame` stays on the loop's existing
`announced` path" from 4.5. That path is not the one production uses.

---

## F3 — MAJOR — `galaxy-view` DOES need a delta. The "no delta" claim is true about *observable change* and false about *obligation*

**The claim under test** (`proposal.md:53-54`):
> `galaxy-view` takes no delta: no requirement of it names the clock's cadence,
> and its observable behaviour does not change.

**Evidence, half one — the premise is right.** I grepped
`openspec/specs/galaxy-view/spec.md` (524 lines, 14 requirements): no requirement
names a clock, a cadence, a frame, or world time. True.

**Evidence, half two — the conclusion does not follow.** `GalaxyView` is rewired
by this change (task 3.4), and it has the same starvation shape:

`frontend/components/galaxy/GalaxyView.tsx:182`
```
  const worldTime = useWorldTime(myFleets?.[0]?.worldTime ?? galaxy?.worldTime)
```
`frontend/components/galaxy/GalaxyView.tsx:245`
```
    (systemId: string) => router.push(`/systems/${systemId}`),
```
`frontend/components/galaxy/GalaxyView.tsx:281`
```
      router.push(`/systems/${fleet.systemId}`)
```
and `worldTime` has exactly one consumer, `GalaxyView.tsx:473`
(`<FleetRoster worldTime={worldTime} …>`). So on this view the 60 Hz whole-view
render drives **nothing but roster countdowns**, and interrupts the drill-in
navigation that `galaxy-view`'s *Drill-In Navigation to the System Board*
(`openspec/specs/galaxy-view/spec.md:82-92`) requires to commit.

**Why it matters — this is lesson one, exactly.** After this change, *no
requirement anywhere obliges `GalaxyView` to have been rewired*. An implementer
who deletes `hooks/use-world-time.ts` and replaces its `GalaxyView` call with a
fresh ad-hoc `setInterval`, or with a per-frame `useSyncExternalStore`, or who
simply leaves a second copy of the hook in `components/galaxy/`, satisfies every
scenario in the change. The five prior "built and never called" instances on this
chain are the same shape: a unit proved correct, production unreached. The
`system-space-view` ADDED requirement cannot reach across a capability boundary
to force it.

There is a second, concrete reason: `GalaxyView` **projects at scale 1 while
formatting at the served scale**. Line 182 passes no `scale` (the hook defaults it
— `hooks/use-world-time.ts:53`, `const scale = options?.scale ?? 1`), while line
474 passes `scale={myFleets?.[0]?.scale}` to the roster. Task 3.4's "same swap" is
therefore ambiguous: `useWorldClock(serverWorldTime, scale)` either preserves the
mismatch or silently fixes it, and nothing decides which. Unobservable at scale 1
(every world runs at 1 today) — and unverifiable forever without a requirement.

**Ruling.** The invariant is genuinely cross-capability. It should NOT be widened
inside `system-space-view` (a requirement of one capability constraining another's
component is the boundary error). `galaxy-view` gets its own ADDED requirement,
scoped to what is true of *that* view.

**Paste-ready — new file
`openspec/changes/fix-world-time-render-loop/specs/galaxy-view/spec.md`:**

```markdown
## ADDED Requirements

### Requirement: Animation Never Re-Renders the Galaxy View, and Never Starves a Navigation
The galaxy view SHALL NOT render its component tree because an animation frame
has passed: the live world time it projects SHALL NOT be held in component
state that is written per frame, and no effect SHALL write component state in
response to a per-frame value. This view's clock drives no picture at all — its
only consumer is the fleet roster's countdowns and command gating
(`fleet-roster`) — so a per-frame render here buys nothing and costs a
navigation.

Every figure this view presents that counts in time, and every roster command
whose availability turns on a served instant passing, SHALL update within one
wall-clock second of that instant, and SHALL NOT require a per-frame render to
do so.

An in-app navigation issued from this view while it is mounted — the drill-in
to a system's space view (*Drill-In Navigation to the System Board*), and a
roster row's selection of a fleet in another system — SHALL commit. A route
transition is lower priority than an ordinary state update, so a view that
renders every frame can interrupt it indefinitely; this view SHALL NOT be the
reason a requested navigation fails to arrive.

The world time this view projects SHALL be extrapolated at the served
world-clock scale — the same scale it hands the roster for formatting — never
at an assumed scale of 1. A clock advancing at one rate while its countdowns
are formatted at another disagrees with itself the moment a world runs at any
scale but 1.

#### Scenario: Frames pass without the galaxy view rendering
- **GIVEN** the galaxy view is mounted with its reads settled and no input,
  refetch, or coarse tick occurring
- **WHEN** several animation frames elapse
- **THEN** the view's component tree has not rendered in that interval

#### Scenario: A roster countdown advances without a per-frame render
- **GIVEN** an own fleet is burning with a served arrival in the future
- **WHEN** two wall-clock seconds elapse with no read landing
- **THEN** that fleet's roster row countdown has changed
- **AND** the view rendered no more than three times in that interval

#### Scenario: A drill-in issued while the view animates arrives
- **WHEN** "Enter system" is invoked for a selected system while the view is
  mounted and animating
- **THEN** the browser arrives at that system's space-view route

#### Scenario: The projected clock runs at the served scale
- **GIVEN** a world whose simulation clock runs at a scale other than 1
- **WHEN** the view projects world time for the roster between reads
- **THEN** it projects at the scale the read served — the same scale it passes
  to the roster for formatting
```

**Scope note for the orchestrator.** The fourth paragraph and its scenario fix a
latent defect (`GalaxyView.tsx:182` vs `:474`) rather than preserving today's
behaviour. It is one argument at the call site and it closes the ambiguity in
task 3.4. If you want this change strictly behaviour-preserving, drop that
paragraph and its scenario and file the mismatch as a separate defect — but then
say explicitly in design.md which of the two the swap ships. Silence there is how
the mismatch survives another year.

**proposal.md correction (paste-ready, replacing lines 53-54):**

```markdown
`galaxy-view`: ADDED *Animation Never Re-Renders the Galaxy View, and Never
Starves a Navigation*. No existing requirement of it names a clock or a
cadence, and no figure it presents changes — but `GalaxyView` is rewired by
this change, its `router.push` sites share the starved-transition mechanism by
construction, and without a requirement of its own nothing obliges the rewire
to have happened or to have used the new clock. Five derivations on this chain
were built and never reached by production code; a requirement is what makes
the call site load-bearing.
```

---

## F4 — MAJOR — Decision 3's pre-identified split seam is not clean: the first half would falsify a live requirement

**The seam as written** (`design.md:142-147`):
> If it passes ~40 tasks, split at the seam: clock + coarse tick +
> nested-effect removal (which alone makes React's per-frame work zero *if* hit
> targets go coarse temporarily) — but do not ship that half without the journey
> green.

**Why it is not clean.** Making React's per-frame work zero without moving the
scene build into the loop means `sceneRef.current` is fed a scene built at the
coarse time. `SpaceWorld`'s loop consumes that ref (`SpaceWorld.tsx:207-210`,
`sceneRef.current = scene` during render; `syncMarks()` at `:415` reads
`sceneRef.current.marks`). The picture would then step once per second. That
directly falsifies the live requirement

`openspec/specs/system-space-view/spec.md:330-333`
```
#### Scenario: An idle fleet renders at its live position, advancing with world time
- **WHEN** an own fleet's effective state is a park or a drift
- **THEN** it renders at that state's position evaluated at the current
  world time, moving between frames with no additional network request
```

And the "hit targets go coarse temporarily" half falsifies the picking
requirement's positioning clause
(`openspec/specs/system-space-view/spec.md:1664-1666`):
```
Hit targets
SHALL be positioned at the marks actually drawn, sized generously around
each body's drawn radius.
```
A burning fleet's target would trail its drawn mark by up to a second — which
design.md itself rejects at `:122-124` in the *Alternative — coarse-render the
hit targets too* paragraph. The risk register and the decision contradict each
other.

**Ruling: there is no two-ship seam here.** The invariant is atomic. The instant
React stops rendering per frame, every per-frame-positioned element must move to
the loop in the *same* commit, or a live requirement is false in the interval.
The first half is neither independently shippable nor independently verifiable —
it would ship a state that satisfies no requirement and breaks two.

**What to do instead if the cap binds.** Two principled reductions, both of which
shrink group 4 without a half-state (see F6 and F8 for the detail):

1. **Drop task 4.4 entirely** (F6): `pickAt`'s marks path is dead code today;
   activating it is unbacked scope.
2. **Bound the imperative set by motion, not by layer** (F8): only bodies, lane
   gates and own fleets move under world time. Contacts and sighting ghosts are
   *frozen at their served positions* by requirement
   (`spec.md:377-378`, "A contact SHALL be drawn **frozen at its served
   position** between reads"; `space-scene.ts:430-431` and `:454-459` implement
   it), and the off-screen chips are a fixed left-edge stack
   (`SpaceStage.tsx:880`, `top: ${16 + index * 26}px`) whose membership is
   camera-driven. Those three layers stay React-positioned at the coarse
   cadence, with the reason stated. That removes roughly half of task 4.3's
   surface.

If after both reductions the count still exceeds 40, the correct response is
**design.md's own Decision 1 fallback** (`startTransition` around the tick,
`design.md:69-75`) as a *separate, smaller change* — not a split of this one.

**Paste-ready design.md replacement for the first risk bullet:**

```markdown
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
```

---

## F5 — MAJOR — The change creates a second projection basis with no single source of truth

**Evidence.** React's basis is memoised on `host` alone and never updates on
resize:

`frontend/components/space/SpaceStage.tsx:172-176`
```
  const viewport = useMemo(
    () => ({ width: host?.clientWidth || 1, height: host?.clientHeight || 1 }),
    [host],
  )
  const basis = useMemo(() => viewBasisOf(camera, viewport), [camera, viewport])
```
The loop's basis is recomputed live, from the canvas, every frame:

`frontend/components/space/webgl/SpaceWorld.tsx:628-634`
```
      const width = canvas.clientWidth || 1
      const height = canvas.clientHeight || 1
      renderer.setSize(width, height, false)
      view.aspect = width / height
      view.updateProjectionMatrix()

      const basis = viewBasisOf(cameraRef.current, { width, height })
```

**Why it matters.** Today both projections happen to agree because the DOM
targets and the GL marks are both rendered from React's per-frame pass, and a
stale viewport is *equally* stale on both sides. After this change, the hit
targets are projected by `draw()`'s live basis while `pickAt`
(`SpaceStage.tsx:217-238`) still unprojects the *point* pick through React's
memoised basis. Following a window resize with no camera change, a click over
empty space resolves against a different basis than the one the marks were drawn
with — the point selection lands somewhere the player did not click, and
*Clicking empty space selects the point under the pointer*
(`spec.md:1679-1682`) fails in a way no test covers.

This is the "every cross-boundary payload has one source of truth" rule applied
inside a component: the basis is now a contract between two writers and must be
computed once.

**Paste-ready design.md (new Decision 7 fragment — merge into Decision 3):**

```markdown
**One basis, computed once per frame, published by ref.** `draw()` already
recomputes `viewBasisOf(camera, {width, height})` from the canvas's live
client size every frame; `SpaceStage`'s own `basis` memo is keyed on `[host]`
and therefore never updates on a resize. Two projections that agree only by
accident become two projections that disagree the moment one of them moves to
the loop. The loop therefore writes the frame's basis into a ref that `pickAt`
reads, so the point pick unprojects through the same basis the marks were
projected with. `SpaceStage`'s `basis` memo is deleted rather than left beside
it — a second basis nobody reads is the next reader's trap.
```

**tasks.md addition:** a task under group 4 — *"`draw()` publishes the frame's
`viewBasisOf` result to a ref; `pickAt` unprojects through it; `SpaceStage`'s
`basis`/`viewport` memos are deleted. Test: a point pick after a simulated resize
resolves against the post-resize basis."*

---

## F6 — MAJOR — Task 4.4 activates a dead code path and changes picking at the boundary, with no requirement behind it

**Evidence.** `onPointerUpCapture` is declared on `SpaceLayersProps` and passed
by `SpaceStage`, but `SpaceLayers` never destructures or calls it:

`frontend/components/space/SpaceStage.tsx:420`
```
          onPointerUpCapture={(clientX, clientY, marks) => finishGesture(clientX, clientY, marks)}
```
`frontend/components/space/SpaceStage.tsx:499` (interface) — and the function's
own parameter list, `SpaceStage.tsx:502-526`, ends at `onReframe,`. Neither
`onPointerUpCapture` nor `viewport` is destructured.

The only real caller passes an empty array, twice:
`frontend/components/space/SpaceStage.tsx:426,429`
```
        onPointerUp={(x, y) => finishGesture(x, y, [])}
...
          finishGesture(x, y, [])
```

So `resolvePick`'s entire mark loop (`space-selection.ts`, `resolvePick`, the
`for (const mark of input.marks)` block) is unreachable in production. Body and
gate picks are served today by the DOM hit targets alone, via
`SpaceStage.tsx:254-257` (`bodyIdUnder` → `target.closest('[data-body-id]')`) in
`handlePointerDown`, consumed at `SpaceStage.tsx:289-292`.

**Why it matters.** Task 4.4 ("`pickAt` reads the frame loop's latest marks from
a ref, not the last render's") would wire that dead path live. That creates a
*second* picking authority with a *different* geometry: the DOM path uses a 24×24
CSS box (`SpaceStage.tsx:588`, `width: 24, height: 24`), the mark path uses
`max(radiusPx + 8, 16)` (`space-selection.ts`, `PICK_PADDING_PX`,
`MIN_PICK_TARGET_PX`). Where they disagree, a click that today produces a **point**
selection would produce a **body** selection. `Clicking empty space selects the
point under the pointer` (`spec.md:1679-1682`) is the scenario at the boundary,
and the point-selection kind is the only path to `space-kinematics`'s point
target.

And the change does not need it. Once the DOM targets are positioned by the frame
loop (Decision 3's whole point), the DOM path is *already* frame-accurate — which
is exactly the property 4.4 was trying to buy.

**Ruling: drop task 4.4.** If the orchestrator would rather activate the path, it
needs a MODIFIED delta on *Space View Picking Resolves to the Body, Lane Gate, or
Point Under the Pointer* stating which authority wins and why, plus boundary
scenarios — and that is a different change.

**Paste-ready design.md (new Decision 8):**

```markdown
### 8. The DOM hit targets stay the only mark-picking authority

`pickAt` keeps receiving an empty mark list. This looks like an omission and is
not: `SpaceLayers` declares `onPointerUpCapture` but never calls it
(`SpaceStage.tsx:499` declares it, the function's parameter list at `:502-526`
never destructures it), so `resolvePick`'s mark loop has been unreachable in
production since it was written. Every body and gate pick is resolved by
`bodyIdUnder`'s `closest('[data-body-id]')` on the DOM targets, and the DOM
targets are precisely what this change makes frame-accurate.

Wiring the mark list live would create a second picking authority with a
different hit geometry — a 24 px CSS box versus `max(radiusPx + 8, 16)` — and
the two disagree in a band around every mark, where a click that produces a
point selection today would start producing a body selection. That is a change
to *Space View Picking Resolves to the Body, Lane Gate, or Point Under the
Pointer* and belongs in a change that specifies it.
```

---

## F7 — MAJOR — The hit-target registry gives each element two position writers; the design does not say React stops writing

**Evidence.** Positions are inline styles written by React today, on three
separate layers:

`frontend/components/space/SpaceStage.tsx:586-590` (bodies and gates)
```
        style={
          screen.onScreen
            ? { left: `${screen.x}px`, top: `${screen.y}px`, width: 24, height: 24 }
            : { left: '-9999px', top: '-9999px', width: 24, height: 24 }
        }
```
`frontend/components/space/SpaceStage.tsx:840-844` (own fleets) — same shape.
`frontend/components/space/SpaceStage.tsx:736`, `:776` (contacts, sightings) —
`left`/`top` from `screen.x || 0`.

Centring is a Tailwind utility on the same elements:
`SpaceStage.tsx:583` — `'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full'`.

**Why it matters.** Design.md Decision 3 says `draw()` "writes `style.transform`
on its element". Two problems, both silent:

1. **Two writers.** If React keeps emitting `left`/`top` at the coarse cadence
   while the loop writes `transform`, then every coarse render re-anchors the
   element to a one-second-old position and the next frame's transform is applied
   relative to *that*. Either the transform is an absolute-position write (and
   React must stop emitting `left`/`top` entirely, anchoring every target at
   `0,0`), or it is a delta from the coarse anchor (and both writers must agree on
   the anchor every tick). The design picks neither.
2. **`transform` collides with the centring utility.** `-translate-x-1/2
   -translate-y-1/2` is the −50%/−50% centring on these elements; an imperative
   `style.transform` write must carry that offset itself or every hit target
   shifts by half its own box. The off-screen sentinel (`left: -9999px`) also has
   to be re-expressed.

**Paste-ready design.md (replace the DOM-hit-targets paragraph of Decision 3):**

```markdown
DOM hit targets: React renders the *set* of targets (identity, labels, tab
order, aria) from a scene built at the coarse time and registers each element
in a `Map<markId, HTMLElement>`. React writes **no position at all** — every
target is anchored at the layer's origin, and its entire placement, the −50%/−50%
centring included, is one `style.transform` written by `draw()` after
`renderer.render`. That is the point of the split: one writer per element, so a
coarse render can never re-anchor a target the loop has already moved this
frame. An element is never keyed on position and never replaced, which is what
keeps *Focus survives the view's animation frames* true by construction. A mark
whose projection is off-screen is transformed off-screen, replacing today's
`left: -9999px` sentinel.
```

---

## F8 — MAJOR — The coarse/fine split is observable and unspecified, in two places the spec's own words already touch

This is the altitude question the brief flags. The spec must not name
`style.transform` or a `Map` — agreed. But it must also not leave the split
unspecified where it is observable, and it is observable twice:

**(a) Position vs membership.** The picking requirement says
(`spec.md:1664-1666`) "Hit targets SHALL be positioned at the marks actually
drawn". After the change positions are frame-exact — *better* than today — but
*membership* is coarse. There is no requirement stating that, and nothing stops an
implementer making membership frame-exact (re-rendering React per frame, undoing
the change) or making positions coarse (design.md's own rejected alternative).
Two implementations, both passing every scenario, one of which is the defect.

**(b) The off-screen chips.** `spec.md:1719-1720`:
```
The affordance SHALL cover only marks that are currently off-screen — a mark
inside the viewport is selected through its ordinary hit target
```
"currently" becomes a ≤1 s-stale currently for the one case the camera does not
cover: a body that crosses the viewport edge under world time alone.

**Ruling.** Neither *Space View Picking…* nor *Off-Screen Bodies and Lane Gates…*
needs a delta — scattering the cadence rule across three requirements is worse
than stating it once. Both are covered by adding the bound to the ADDED
requirement, which is where the cadence lives. That also clears the author's
flagged weak points on both, **with the bound written down** rather than left as
a design-note.

I confirmed the existing off-screen tests survive: every one of them changes
membership through the **camera**, which design.md already recomputes on
(`SpaceStage.interaction.test.tsx:544,557,567-570,576`, and `:593-599` which pans
200 steps to push a body off-screen). No existing test drives membership by time
alone.

**Paste-ready — insert as a new paragraph in the ADDED requirement, after the
"Every figure this view presents that counts in time…" paragraph:**

```markdown
A hit target SHALL be positioned at its mark's drawn position on every frame
that mark is drawn, so a moving mark and the target over it never separate
(*Space View Picking Resolves to the Body, Lane Gate, or Point Under the
Pointer*). Which marks HAVE targets, and which marks are currently off-screen
and therefore offered through the off-screen affordance (*Off-Screen Bodies and
Lane Gates Are Reachable by Pointer and Touch*), MAY instead be recomputed once
per wall-clock second and on every camera change rather than every frame:
membership changes only when a read lands, the selection changes, or the camera
moves — all of which are already changes the view renders for — and the one
case left is a mark drifting across the viewport edge under world time alone,
which SHALL be reflected within one wall-clock second. A mark whose position is
frozen by requirement — a foreign contact, a sighting ghost — needs no per-frame
positioning at all.
```

**And two new scenarios:**

```markdown
#### Scenario: A hit target tracks its mark on every frame
- **GIVEN** an own fleet is burning, so its mark moves every animation frame
- **WHEN** animation frames elapse with no render of the view's component tree
- **THEN** that mark's hit target is at the mark's drawn position on each of
  those frames

#### Scenario: A mark drifting off-screen becomes reachable within a second
- **GIVEN** a body inside the viewport whose orbit carries it past the
  viewport edge, with no camera input
- **WHEN** its mark leaves the viewport
- **THEN** its off-screen affordance is offered within one wall-clock second
```

---

## F9 — MAJOR — The ADDED requirement's justification for the 1 Hz bound is factually wrong, and the bound itself is stated only as a floor

**Evidence.** The requirement says
(`openspec/changes/fix-world-time-render-loop/specs/system-space-view/spec.md:16-18`):
> One second is the finest resolution any such figure formats to
> (`figure-formatting`), so a faster cadence would re-render the view for no
> visible change.

That is wrong in both directions:

- **Instants are coarser.** `frontend/lib/format/figures.ts:136-153`,
  `formatInstant` renders `T+ ${days}d ${hh}:${mm} ${suffix}` — resolution is one
  **minute of world time**. The world-clock readout and every `asOf` stamp change
  at most once a minute at scale 1.
- **Durations are in wall units, not world units.** `figures.ts:117`, `const
  wallMs = magnitudeMs / scale`. The finest step is one second of *wall* time, at
  any scale. The claim happens to hold for durations only because of this
  division — which the sentence does not say, and which is the whole reason the
  bound is scale-independent.

**Second half — "at least once per wall-clock second" is a floor with no
ceiling.** As written, a conforming implementation may update once per
*animation frame* (that satisfies "at least once per second") — i.e. the defect.
The paragraph above it forbids it by another route, but the cadence paragraph
should carry its own bound, because the bound is what the rest of the change's
latitude (F8, F10) hangs off.

**Paste-ready — replace the second paragraph of the ADDED requirement in full:**

```markdown
Every figure this view presents that counts in time — a relative duration, the
world-clock readout, a state that flips when a served instant passes — SHALL
update within one wall-clock second of the instant its value changes, and SHALL
NOT require a per-frame render to do so. One wall-clock second is the finest
step any of them is legible at: `figure-formatting` renders a duration by
dividing its world-millisecond span by the served scale and rendering the
result's smaller unit in whole **wall** seconds, and renders an absolute
instant only to the minute — so at any served scale, a figure refreshed faster
than once a wall second re-renders the view for a change the player cannot see.

A state that flips when a served instant passes — a running mine's command
gating (`docked-fleet-actions`'s *Running Mine Gates the Fleet Panel's
Commands*), a sweep's settling (`focused-scan`), a roster row's command
visibility (`fleet-roster`) — MAY therefore lag that instant by up to one
wall-clock second and SHALL NOT lag it further. The refetch each of those
schedules against that instant SHALL still be scheduled from the view's clock
read at full precision, never from the once-a-second value: the display's
resolution is a presentation choice and the schedule's is not.
```

---

## F10 — MAJOR — Ordering ruling: `add-vitals-strip` archives FIRST. tasks.md 5.6 has it backwards, and design.md contradicts itself

**The two statements.**
`design.md:163-165`:
> Land and archive **before** re-running `add-vitals-strip`'s archive gate; that
> gate's journey is this change's tier-4 evidence, so one quiet-machine run
> serves both.

`tasks.md:38`:
> 5.6 `python3 .claude/scripts/openspec-reconcile.py`, then archive; then re-run
> `add-vitals-strip`'s archive gate.

These contradict each other: "one run serves both" and "re-run 2a's gate after"
cannot both be true.

**Ruling — archive order: `add-vitals-strip`, then `fix-world-time-render-loop`.**
Four reasons:

1. **2a is built; this is its unblocker.** `docs/plans/system-hud/chain.md:9-10`
   ("link 2a built and waiting on its archive gate") and `:56` ("**The archive
   order is the row order**"). 2a is a row; this change is not.
2. **Forward reference.** The ADDED requirement's third scenario reads "chosen
   from **the fleet switcher** or the roster". The fleet switcher is the strip's
   chevron — `system-console`'s *The Fleet Cell Names the Acting Fleet and
   Delegates a Switch to the Mounting View*, a requirement in a capability that
   exists **only inside `add-vitals-strip`'s deltas** (chain.md:65 records the
   same hazard for link 2a-ii). Archiving this change first puts a live
   `system-space-view` requirement naming a control no live capability defines —
   a dangling cross-reference, which `--strict` does not catch and the archiver
   does not check (README:115 lists dangling cross-references among the traps
   rehearsal is still for).
3. **No MODIFIED-block hazard in either direction, verified.** Header sets are
   disjoint: 2a modifies *System Space View Route and Data Fan-In*,
   *Toggle-to-Deselect Single Selection…*, *Space View Camera Is
   Keyboard-Operable*; this change ADDs one and modifies *Body, Lane-Gate, and
   Point Selection Is Keyboard-Operable*. 2a does not touch that header, so this
   change's MODIFIED block (6/6 scenarios verbatim, diffed) stays valid after 2a
   archives.
4. **One gate run serves both.** 2a's archive gate *is* the full tier-4 suite,
   which tasks 5.3 and 5.4 already run. There is no second run to schedule.

**Mandatory step after 2a archives, before this change archives:** re-run
`python3 .claude/scripts/openspec-reconcile.py`. It is one command, it exits
non-zero on exactly the failure the archiver refuses on, and 2a's archive is the
only event that could invalidate this change's blocks. Cheap insurance against
the late-firing gate README:103-112 documents.

**Paste-ready tasks.md 5.6 replacement:**

```markdown
- [ ] 5.6 Archive order — `add-vitals-strip` first, this change second. 5.3/5.4's
      quiet-machine run IS 2a's archive gate: on green, run
      `python3 .claude/scripts/openspec-reconcile.py`, archive `add-vitals-strip`,
      re-run `openspec-reconcile.py` (2a's archive is the only event that can
      invalidate this change's MODIFIED block), then archive this change. Do not
      archive this change first: its ADDED requirement names the strip's fleet
      switcher, whose capability (`system-console`) exists only inside
      `add-vitals-strip`'s deltas until that change archives.
```

**Paste-ready design.md Migration Plan replacement:**

```markdown
## Migration Plan

Frontend-only; deploys with the next Vercel build. Rollback is `git revert`.

Archive order: **`add-vitals-strip` first, this change second.** 2a is built and
blocked only on this defect; its archive gate is the full tier-4 suite, which is
also this change's tier-4 evidence, so one quiet-machine run closes both. This
change's ADDED requirement names the strip's fleet switcher, a `system-console`
requirement that exists only inside 2a's deltas — archiving in the other order
leaves a live requirement referencing a capability `openspec/specs/` does not
have. The two changes' MODIFIED headers are disjoint, so neither order corrupts
the other; `openspec-reconcile.py` is re-run after 2a archives regardless,
because 2a's archive is the only event that could invalidate this change's
blocks and the archiver's own check fires too late to be the first to know.
```

**Semantic collision check — cleared.** `system-console`'s cadence-bearing
scenarios (*The countdown advances between reads*, at
`openspec/changes/add-vitals-strip/specs/system-console/spec.md:341-346`, and
*The stamp advances between reads*, `:636-640`) both read "WHEN the projected
world clock advances with no read landing / THEN … increased by the elapsed
world-millisecond span". A 1 Hz tick satisfies both for any elapsed span of one
second or more, and both are asserted against a `VitalsStrip` that takes
`worldTime` as a prop (`SystemSpaceView.tsx:971`) — so their existing unit tests
supply the value directly and are untouched by this change. The residual is that
a *view-level* test advancing, say, 500 ms would now see no change. I found no
such test. No delta needed; the F9 paragraph makes the latitude explicit anyway.

---

## F11 — MAJOR — `frontend/lib/world-clock/` takes the name of a Go-authority capability, and needs no capability of its own

**Ruling on the brief's open question.** The frontend projection needs **no new
capability and no requirement in `world-clock`.**

`openspec/specs/world-clock/spec.md` is unambiguously the Go clock: `WorldMillis`
as a Go type, `time.Now()`, `FromWall(t)`, "Process-Wide Singleton,
Config-Driven Scale", "Injectable for Tests". I grepped it for
client/frontend/browser/project — zero hits. Putting a browser requirement there
would put two implementations of one formula under one capability header, which
is how a mirror is born.

The frontend projection is **already specified**, in `system-space-view`:
```
openspec/specs/system-space-view/spec.md:272-273
**The current world time** SHALL be extrapolated from the most recent served
reading at the **served world-clock scale**, never at an assumed scale of 1.
```
That is the requirement `frontend/lib/world-clock/` implements. This change's
ADDED requirement adds the cadence constraint on top. The only gap is
`galaxy-view`, which F3's delta closes. Nothing else is needed.

**Anti-mirror collision — checked, no mechanical collision, but a naming hazard.**
`.claude/scripts/check-mirror-map.sh` runs anti-mirror mode over six hardcoded
pairs: `backend/space ↔ frontend/lib/space`, plus `system`, `fleet`, `galaxy`,
`disclosure`, and the one real mirror `backend/market ↔ frontend/lib/market`. A
new `frontend/lib/world-clock/` pairs with nothing (the Go clock is
`backend/common/worldtime.go`, and `backend/common` has no TS counterpart), so
the check does not fire. `frontend/lib/space` stays draw-only — the new module
holds no kinematics and does not touch it.

But the **name** is the hazard: a TypeScript directory named after a Go-sole-
authority capability, containing that capability's own formula
(`use-world-time.ts:36-38`, `anchor.world + (wallNow - anchor.wall) * scale`,
against `world-clock`'s `(wallNow − epoch) × scale`). The next reader has to
re-derive why that is permitted. Lesson five: an inherited rule is never
re-derived by the agent following it.

**Recommendation:** name it `frontend/lib/client-clock/` (or
`frontend/lib/clock-projection/`), and state the permission with its cause.

**Paste-ready design.md replacement for Decision 1's first line + a new paragraph:**

```markdown
`frontend/lib/client-clock/`: `createWorldClock()` returns `{ anchor(world,
scale), now(), hasReading() }`. `now()` is `projectWorldTime` (moved here
verbatim from the deleted hook, with its tests) evaluated on demand against
`wallClock()`. No timer, no rAF, no subscription list — a frame loop *pulls*
the time; nothing pushes it.

**Not `lib/world-clock/`, deliberately.** `world-clock` is the name of a
Go-sole-authority capability (`openspec/specs/world-clock/spec.md`: the
process-wide simulation singleton, `WorldMillis`, `FromWall`), and this module
evaluates the same `world + elapsed × scale` formula in TypeScript. That is
permitted — `system-space-view`'s *Own-Fleet Position, Burn Curve, and Arrival
Ghost Render Continuously* explicitly requires the client to extrapolate world
time between polls at the served scale, because a paused network must still
animate — but it is permitted as a *projection of a served reading*, never as a
second authority: this module reads nothing but the anchor a server read gave
it, and no rule-bearing value is computed from its output. Naming the directory
after the Go capability invites exactly the mirror the name forbids, and
`check-mirror-map.sh` would not catch it (its six pairs are
`backend/<pkg> ↔ frontend/lib/<pkg>`; the Go clock lives in
`backend/common/worldtime.go`, so no pair exists to fire).
```

**Lesson-one check on the new module and on `projectMarks`.** Both get a forcing
production call site: the clock through task 3.3/3.4 *and* (with F3's delta) a
requirement in each view that obliges it; `projectMarks` through task 4.3, whose
output is the only thing writing a hit target's position, and whose absence is
observable by scenario *A hit target tracks its mark on every frame* (F8). One
gap remains: **task 4.1 does not say where `projectMarks` lives.** It must not
land in `frontend/lib/space/` (that directory is scanned by the anti-mirror check
against `backend/space`, and `projectMarks` takes a `SceneModel`, a
component-layer type). `components/space/space-projection.ts` is its home, beside
`viewBasisOf` and `projectToScreen`. Say so in 4.1.

---

## F12 — MAJOR (drift report, not a delta) — `reducedMotion` is hardcoded `false`; the reduced-motion requirement is currently unimplemented in this view

The author flagged "the design claims no delta is needed [for reduced-motion]. Check
that claim." **The claim is correct — and it conceals pre-existing drift.**

**Evidence.**
`frontend/components/space/SystemSpaceView.tsx:432-444`
```
  const scene = useMemo(
    () =>
      buildSceneModel({
        interior: interior.data ?? null,
        fleets: here,
        worldTimeMs: worldTime,
        reducedMotion: false,
        ...
```
`reducedMotion` is the only input to the decorative freeze
(`space-scene.ts:282`, `:512`, `decorativeTimeMs: reducedMotion ? 0 : worldTimeMs`),
which `SpaceWorld` consumes at `:448` and `:459`. Nothing reads
`prefers-reduced-motion` anywhere on this path. The hook's own `animate: false`
escape hatch (`use-world-time.ts:22-23`, documented as "for reduced-motion and
deterministic tests") is passed by neither caller.

Against the live requirement `openspec/specs/system-space-view/spec.md:1323-1337`
(*Space View Respects Reduced-Motion Preference* — "SHALL hold the starfield,
nebula, film-grain, body-surface, and fleet-plume animation static").

**Why it matters here.** The change moves the `buildSceneModel` call site into
`draw()`. Whoever writes the new call site must carry `reducedMotion` through the
inputs ref. If they hardcode `false` again the drift persists silently; if they
wire the media query, that is unscoped work landing under a perf fix. The design
says "Reduced-motion behaviour … unchanged" (Non-Goals, `design.md:48`) without
saying what that behaviour currently is.

**Ruling.** No delta (the requirement is unchanged and correct). Per
`nextjs-engineering`'s spec-first discipline, this is drift: reported with
file:line, not patched. Design.md should name it so the new call site does not
quietly re-decide it.

**Paste-ready design.md (append to Non-Goals):**

```markdown
- Reduced-motion behaviour — **unchanged, and currently unimplemented in this
  view.** `SystemSpaceView.tsx:438` passes `reducedMotion: false` as a literal;
  nothing reads `prefers-reduced-motion` on this path, so *Space View Respects
  Reduced-Motion Preference*'s decorative freeze never fires today. The frame
  loop's new `buildSceneModel` call site carries `reducedMotion` through the
  inputs ref as the literal it is today, so this change neither deepens nor
  silently closes that gap. Filed as drift for the orchestrator; closing it is
  its own change.
```

---

## F13 — MINOR — design.md's Context understates React's per-frame work, weakening its own strongest argument

`design.md:12-14` says:
> React's only per-frame job today is to *refill that ref* and move the DOM hit
> targets.

Not so. `worldTime` is a state value of `SystemSpaceView`, so a frame re-renders
the **entire view**, including the whole floating command column:
`SpaceCommandPanel` (`SystemSpaceView.tsx:849-857`), `FleetActionsPanel`
(`:859-869`), `ScanControl` (`:877-885`), `FleetRoster` (`:946-953`) and
`VitalsStrip` (`:962-973`) — all of which receive `worldTime={worldTime}` — plus
`SpaceStage`'s `JSON.stringify(camera)` per render (`SpaceStage.tsx:357`) and
every one of `SpaceLayers`' six mark layers.

This matters because it is the evidence for the *Two scene builds → net CPU
falls* claim (F14). Stating it accurately strengthens the change.

**Paste-ready replacement for that sentence:**

```markdown
React's per-frame work today is not small: `worldTime` is `SystemSpaceView`'s
own state, so a frame re-renders the whole view — the scene memo, `SpaceStage`
and all six of `SpaceLayers`' mark layers, and the entire floating command
column (`SpaceCommandPanel`, `FleetActionsPanel`, `ScanControl`, `FleetRoster`,
`VitalsStrip`), every one of which takes `worldTime` as a prop. What the picture
actually needs from that render is two things: a refilled `sceneRef` and moved
DOM hit targets.
```

---

## F14 — MINOR (premise verified, one caveat) — the two-scene-builds claim holds

Both premises check out:

- **`buildSceneModel` is pure** — `space-scene.ts:266-515` reads only its
  argument and module constants, allocates fresh arrays, returns a new object.
- **It really is called per frame today** — `SystemSpaceView.tsx:432-444`'s
  `useMemo` lists `worldTime` in its deps (`:443`), and `worldTime` changes every
  frame, so the memo misses every frame.

So the arithmetic is right: after the change, one build per frame (moved, not
added) plus one per second (new), against the removal of a 60 Hz whole-view
render. Net falls, and by much more than the design claims once F13's correction
lands.

**One caveat worth a sentence.** `buildSceneModel` takes an *injected effectful*
argument — `log` (`space-scene.ts:195`, `SceneInput.log`), supplied as
`(message, detail) => console.warn('[space] …', detail)`
(`SystemSpaceView.tsx:440`) and fired by the origin-omission rule
(`space-scene.ts:298-304`). Calling the builder at frame rate means a
frame-rate `console.warn` for any omitted mark. That is true today too — so it is
not a regression — but the journey's `[journey-console]` capture is this change's
tier-4 evidence surface, and 60 warnings/second of unrelated noise in it is worth
knowing about before the gate run rather than during it.

**Paste-ready design.md (replace the "Two scene builds" risk bullet):**

```markdown
- **[Two scene builds]** one coarse in React, one per frame in the loop — the
  per-frame one already exists (`SystemSpaceView`'s scene memo lists `worldTime`
  in its deps and therefore misses every frame), and the coarse one is 1 Hz.
  Net CPU falls by the whole-view render the frame no longer triggers, which is
  the scene memo plus six mark layers plus five panels. One caveat: the builder
  is pure except for its injected `log`, wired to `console.warn` and fired by
  the origin-omission rule. At frame rate, one omitted mark is ~60 warnings a
  second in the journey's `[journey-console]` capture — the surface this change
  greps for its own evidence. Unchanged from today, but the gate run should not
  be the first place it is noticed.
```

---

## F15 — MINOR — "on the order of once per elapsed second" is not a decidable bound

`specs/system-space-view/spec.md:42-43` in the delta:
```
- **AND** the view rendered on the order of once per elapsed second, not once
  per animation frame
```
"on the order of" is not decidable — two engineers would write different tests.
tasks.md 2.2 already picks a number ("the render count grew by ≤3"); the scenario
should carry it, because tasks.md is not the contract.

**Paste-ready replacement:**
```markdown
- **AND** the view rendered no more than three times in that interval, not once
  per animation frame
```

---

## F16 — MINOR — Two small factual errors in the change's own description of the code

1. **`data-world-time` is not on the view root.** design.md Decision 2
   (`:83-84`) and the proposal both say "on the view root". It is on an sr-only
   span: `SystemSpaceView.tsx:703-708`,
   `data-testid="space-world-clock" data-scale=… data-world-time=…`. The view
   root is `data-testid="space-view"` (`:698`) and carries neither. Two tests
   read it through `space-world-clock` (`SystemSpaceView.test.tsx:828,838`).
   Harmless, but a reviewer grepping the root for it will not find it.

2. **Task 3.3's "replace every `worldTimeRef.current` read with `clock.now()`" is
   a component-boundary change, not an in-place edit.** Line 182 of the four the
   task names is inside `ScanSweepWatcher`, a separate component that takes the
   ref as a **prop**: `SystemSpaceView.tsx:105,112`
   (`worldTimeRef: MutableRefObject<number>`), instantiated at `:723-733`. Its
   prop type, and the eslint-disabled dep array at `:188-189`, both change. Worth
   its own sub-task so it is not discovered mid-implementation.

---

## F17 — MINOR — Naming the cause on the imperative-registry prohibition

Lesson five ("a prohibition should name its cause"). Decision 3 says an element
"is never replaced, which is what keeps *Focus survives the view's animation
frames* true by construction" — good, that one names its cause. Two others do
not, and both are in F7's and F5's paste-ready text above (one writer per
element; one basis per frame). Nothing further needed if those land.

---

# The brief's flagged weak points — dispositions

Each of the author's eight, with the evidence that settles it.

**1. "Frames pass without the view rendering" / "rendered on the order of once
per elapsed second" — testable, and at the right altitude?**
**Partly cleared, partly founded.**
*Altitude — cleared.* Naming React's render is consistent with this repo's own
established practice for structural requirements: `add-vitals-strip`'s *No second
derivation of fleet state exists in the strip*
(`openspec/changes/add-vitals-strip/specs/system-console/spec.md:347-354`,
"WHEN the strip's component tree is inspected"), `system-space-view`'s *No
displayed value is derived from a drawn position* (`spec.md:356-361`), and
`space-kinematics`'s *Every Rule-Bearing Value of This Capability Is Computed
Only in the Authoritative Implementation* are all code-inspection requirements
that archived and are live. The generic rule (spec-writing-quality: move the
technology to design.md) yields to the repo's own precedent here, and it should:
paragraph 3 alone ("a navigation SHALL commit") is satisfiable by design.md's own
*rejected* `startTransition` alternative, so dropping the structural paragraph
would make the requirement unable to distinguish the chosen fix from the one
Travis declined.
*Testability — one founded defect.* "on the order of" is not decidable — F15,
with a number.
*One more tightening, offered:* paragraph 4's "cause the UI framework to report
an update-depth or nested-update diagnostic" names an unnamed framework. Make the
surface observable —
```markdown
The view SHALL NOT, while mounted, animating, and left idle, cause an
update-depth or nested-update diagnostic to be written to the browser console.
Such a diagnostic is the signal that a commit is scheduling another commit, and
it is the cheapest standing evidence that the per-frame update has not returned
by some other route: the tier-4 journey's console capture already greps for it.
```

**2. "The mechanism for the 20 s stall is not fully explained — is the
requirement still sound?"**
**Cleared.** The requirement is sound *because* it is stated as behaviour, not as
mechanism: "an in-app navigation … SHALL commit" is true or false independently of
why it was false. The experiment that matters is a controlled one —
`defect-cross-system-chevron-nav-stall.md:40-42`, 4/6 stalling vs 6/6 passing with
one variable changed — which establishes *sufficiency of the removal* without
establishing the React-internal mechanism. design.md:151-155 already books the
right consequence ("If it is not green after this change, the diagnosis was
incomplete — stop and re-measure, do not tune"). The one thing the partial
understanding *does* cost is recorded correctly at `design.md:26-29`: a *smaller*
per-frame render is not known to be safe — which is exactly why F4's ruling
(no split seam) matters.

**3. "The 1 Hz coarse tick delays time-gated flips — does that violate any
existing requirement?"**
**Cleared for all five capabilities, with one latitude that must be written
down.** I checked each:
- `docked-fleet-actions` *Running Mine Gates the Fleet Panel's Commands*
  (`spec.md:682-695`): "Once the ETA passes, the gating SHALL lift **without
  requiring navigation**." No deadline, no navigation involved — a 1 s lift
  conforms.
- `fleet-roster`: the only cadence-adjacent scenario is *A burning fleet counts
  down to arrival* (`spec.md:85-90`), which constrains presentation, not
  frequency. `rosterCommandVisibility` (`frontend/components/fleet/roster-commands.ts:26-45`)
  and `rosterMineGate` (`:57-65`) both take `worldTime` — they flip ≤1 s late,
  which no scenario forbids.
- `focused-scan`: grepped for "settl" — every hit concerns server-side
  settlement, none a client refresh cadence.
- `figure-formatting`: the finest presentational step is one **wall** second
  (`lib/format/figures.ts:117`), and instants are minute-resolution (`:136-153`).
- `system-console` (inside 2a's deltas): *The countdown advances between reads*
  and *The stamp advances between reads* both hold for any elapsed span ≥ 1 s,
  and both are asserted against a strip that takes `worldTime` as a prop.
**But:** the latitude is real and currently unwritten, which is how "X is
unaffected" hypotheses become next quarter's defect. F9's second paragraph states
the ≤1 s bound explicitly, with the named requirements it covers.

**4. "Off-screen reach chips recomputed at coarse cadence vs *Off-Screen Bodies
and Lane Gates Are Reachable by Pointer and Touch*."**
**Founded, and small.** Every existing off-screen test drives membership through
the camera — `SpaceStage.interaction.test.tsx:544, 557, 567-570, 576`, and
`:593-599` which zooms 200 steps and pans 200 steps to push a body off-screen —
all of which design.md already recomputes on. The single uncovered case is a body
crossing the edge under world time alone, against the word "currently" at
`spec.md:1719-1720`. No delta on that requirement; the bound goes in the ADDED
requirement (F8), with a scenario.

**5. "Picking against the frame loop's marks vs *Space View Picking Resolves to
the Body, Lane Gate, or Point Under the Pointer*."**
**Founded, and the fix is to do less.** The mark-list path `pickAt` receives is
dead in production — `SpaceLayers` declares `onPointerUpCapture`
(`SpaceStage.tsx:499`) and never destructures it (`:502-526`), and the only live
caller passes `[]` (`:426`, `:429`). Activating it (task 4.4) creates a second
picking authority with a different hit geometry and changes outcomes in a band
around every mark, with no requirement behind it. Drop 4.4 — F6. The positioning
clause of the same requirement ("Hit targets SHALL be positioned at the marks
actually drawn", `:1664-1666`) is *better* served after the change, and F8's
paragraph is what stops a future implementation from satisfying it by making
positions coarse instead.

**6. "Reduced-motion and lost-context requirements: the design claims no delta is
needed."**
**Split verdict.**
*Reduced-motion — the no-delta claim is correct, and it conceals drift.*
`SystemSpaceView.tsx:438` hardcodes `reducedMotion: false`; the requirement
(`spec.md:1323-1337`) is currently unimplemented in this view. Reported as drift,
not patched — F12.
*Lost-context — the no-delta claim is correct but the design's own changes break
it.* No delta is needed on *Lost Rendering Context Recovers Without Navigation*;
what is needed is for the change to stop dropping the availability gate on the
draw stamp (F1, BLOCKER) and stop moving `onFirstFrame` onto a loop that does not
run under jsdom and does not announce on failure (F2, BLOCKER). The requirement
text is fine; the implementation plan falsifies it.

**7. "Whether `galaxy-view` really needs no delta."**
**Founded.** The premise is right (no requirement of `galaxy-view` names a clock
or a cadence — grepped all 14 requirements) and the conclusion does not follow:
`GalaxyView` is rewired, its two `router.push` sites (`GalaxyView.tsx:245, 281`)
share the mechanism by construction, and with no requirement nothing obliges the
rewire to have happened or to have used the new clock. Plus the live scale
mismatch (`:182` projects at 1, `:474` formats at the served scale). Full delta
in F3.

**8. "Task sizing against the 40-task cap and whether the pre-identified split
seam is clean."**
**Both founded.**
*The cap is in real danger.* Group 4's seven checkboxes cover: extracting
`projectMarks`; threading scene inputs + clock + registry + marks-ref + basis-ref
+ the canvas-region element through `SystemSpaceView` → `SpaceStage` →
`SpaceCanvas`'s `renderWorld` → `SpaceWorld`, every one of them ref-wrapped
because `SpaceWorld`'s effect deps are `[canvas, extent, onFirstFrame]`
(`SpaceWorld.tsx:690`) and any unstable addition rebuilds the entire three.js
world; converting three mark layers from inline `left`/`top` to an imperative
transform including their −50%/−50% centring; the stamp; the off-screen
recompute; and migrating assertions across five files. Honest sizing is 18-25 in
group 4 alone, ≈ 35-42 overall.
*One correction to the risk's premise, which changes what the cost actually is.*
design.md:142-143 says the five test files assert "mark positions through render".
They largely do not — I grepped style/left/top/getBoundingClientRect across all
five and found one hit per file, all in fixtures or camera-limit strings. What
those files assert heavily is **membership** (`queryByTestId('offscreen-…')`,
`getByTestId('body-hit-…')`) and **interaction**. Membership stays React-rendered,
so most assertions survive untouched. The migration cost is lower than feared;
the *plumbing* cost is higher. Task 1.1 should count membership assertions and
plumbing sites, not position assertions.
*The seam is not clean* — F4: its first half falsifies two live requirements. Cut
scope instead (F6, F8), and if the cap still binds, ship Decision 1's
`startTransition` fallback as its own change rather than half of this one.

---

## Files referenced (absolute)

- `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/proposal.md`
- `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/design.md`
- `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/tasks.md`
- `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/specs/system-space-view/spec.md`
- proposed new: `/Users/travis/Projects/hexaverse/openspec/changes/fix-world-time-render-loop/specs/galaxy-view/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/galaxy-view/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/world-clock/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/docked-fleet-actions/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/fleet-roster/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/figure-formatting/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/changes/add-vitals-strip/specs/system-console/spec.md`
- `/Users/travis/Projects/hexaverse/openspec/changes/add-vitals-strip/specs/system-space-view/spec.md`
- `/Users/travis/Projects/hexaverse/frontend/hooks/use-world-time.ts`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceCanvas.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/space-scene.ts`
- `/Users/travis/Projects/hexaverse/frontend/components/space/space-selection.ts`
- `/Users/travis/Projects/hexaverse/frontend/components/space/webgl/SpaceWorld.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.interaction.test.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceStage.renderer.test.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/galaxy/GalaxyView.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/fleet/roster-commands.ts`
- `/Users/travis/Projects/hexaverse/frontend/lib/format/figures.ts`
- `/Users/travis/Projects/hexaverse/.claude/scripts/check-mirror-map.sh`
- `/Users/travis/Projects/hexaverse/docs/plans/system-hud/chain.md`
- `/Users/travis/Projects/hexaverse/docs/plans/continous_space/handoffs/defect-cross-system-chevron-nav-stall.md`
