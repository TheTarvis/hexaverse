## Context

Two client surfaces render three.js scenes directly: the tactical board
(`components/board/`, spike at `app/spike/webgl-board/`, slated to become the
production renderer under `port-board-to-webgl-renderer`) and the galaxy view
(`components/galaxy/GalaxyGraph.tsx`, via `react-force-graph-3d`). On the
galaxy view the missing handling is a live gap on the home route today. On
the board it becomes more severe the moment the WebGL port lands: today the
SVG board always renders regardless of GPU support, so a failed board render
is impossible; after the straight swap (`port-board-to-webgl-renderer`,
phase 6, DECIDED) the board has no fallback renderer, and a user without a
working WebGL2 context gets nothing unless this change exists first.

No *first-party* handling exists — `webglcontextlost` / `webglcontextrestored`
/ `contextlost` appear in zero `.ts`/`.tsx` files under `frontend/`. The
runtime is not entirely bare, though, and the difference shapes the work:
`three@0.185.1` already registers `webglcontextlost`, `webglcontextrestored`
and `webglcontextcreationerror` on its own canvas inside the `WebGLRenderer`
constructor, already calls `preventDefault()` on loss — so a browser restore
is genuinely reachable — already re-initializes the GL context on restore,
and already no-ops `render()` while lost. The same is true of the renderer
`react-force-graph-3d` owns. What is missing is entirely **UI state**:
nothing tells the player anything, nothing survives a context that never
comes back, and a context that fails to *create* still throws out of a
commit-phase effect with no boundary to catch it. Our handlers layer on top
of three's; they do not replace them.

The immediate, concrete failure mode this change closes: `new
THREE.WebGLRenderer()` in the board's spike code (and, per the same pattern,
wherever the port's production module constructs one) throws from inside a
`useEffect` with no `try` around it — today's failure mode for a
context-creation failure is an uncaught error, not a graceful message. On the
galaxy view the same throw originates inside `react-force-graph-3d`'s own
mount path, where no `try`/`catch` of ours can reach it at all — a separate
mechanism is required there (see Decisions, "failure is intercepted by a
pre-flight probe...").

## Goals / Non-Goals

- Goal: define an explicit, observable, renderer-agnostic contract for two
  client-capability / GPU-triggered failure states — context creation
  failure, and runtime context loss with its restore/never-restore paths —
  scoped identically in both `hex-board-view` and `galaxy-view`.
- Goal: establish the canvas-region-only scoping (board canvas / graph
  canvas), so the rest of each view keeps working when its renderer can't —
  and make that scoping actually true structurally (a pre-flight probe plus
  a scoped error boundary), not just true of a conditional render a future
  refactor can silently break.
- Goal: state honestly which of the view's remaining verbs genuinely survive
  a lost canvas (scan, mine, cancel-burn, cancel-mine; galaxy fleet-roster
  selection) and which do not (move, depart, interstellar travel — they have
  no non-canvas path to a target today), and stop the surrounding UI from
  instructing the player to do the thing they cannot do.
- Goal: make the failure/retry lifecycle accessible (announced, keyboard-
  operable, focus-safe) and observable (recorded distinguishably by cause),
  given it can appear unprompted mid-session on a client machine nobody can
  inspect directly.
- Non-goal: no renderer swap. `HexBoard`/`BoardScene` are untouched here;
  that deletion belongs to `port-board-to-webgl-renderer`. `SystemBoardView`'s
  render tree is not modified by this change — see the board-half decision
  below.
- Non-goal: no fog treatment, picking, camera controls, or any other
  behavioural surface of the port. This change is exactly the requirements in
  scope.
- Non-goal: no SVG fallback renderer. Per the port doc's own decision,
  unavailability is handled as UI state, not as a fallback renderer — keeping
  a second renderer alive as an automatic fallback would reintroduce the
  dual-maintenance burden the straight swap exists to escape.
- Non-goal: specifying the exact retry backoff or attempt-cap mechanics —
  only that a retry affordance exists, releases the prior attempt's
  resources, refuses concurrent attempts, and reports success/failure. This
  is a narrower non-goal than the original draft: leak-safety and
  concurrency ARE in scope (see Decisions/G6-derived scenarios); a
  backoff/attempt-cap schedule is not.
- Non-goal: a non-canvas target-selection affordance for Move/Depart/Travel
  (e.g. a textual feature/gate list, a system list in the intel panel) so
  those verbs survive a lost canvas the way Scan/Mine do. Genuine
  product-shape decision, out of scope for this change — see Open Questions.
- Non-goal: a debounce/grace period before the interrupted state becomes
  visible on ordinary tab backgrounding, and a software-rasterizer detection
  heuristic. Both are real gaps; neither has a sourced number or threshold —
  see Open Questions.

## Decisions

### Decision: A3 — the unsupported/interrupted state replaces the canvas region only, not the whole view

On the board: `SystemBoardView` keeps `FactsPanel` and the fleet roster
mounted and usable; only the board's own canvas region shows the unsupported
or interrupted state. On the galaxy view: `GalaxyGraph`'s canvas region is
replaced; the intel panel and system inspector (`GalaxyView.tsx`'s
`IntelPanel` and inspector) stay mounted and usable.

Rationale: if the unsupported state took the whole view, a player without a
working WebGL2 context could not see their fleet, hold, or verbs at all — the
game would be unplayable rather than degraded. The design doc's own phrase is
"the board's error slot" — the board's slot, not the view's — which reads as
canvas-region scoping, not whole-view replacement. Degraded is the only
reading consistent with "naming the cause rather than showing an empty
stage": an empty stage next to a working FactsPanel is still a legible,
actionable screen.

**Revision note (panel review):** canvas-only scoping is confirmed correct,
but "degraded, still playable" was overstated. UX traced the code: Move,
Depart, and interstellar Travel have **no non-canvas path to a *new target
selection*** — `FactsPanel.canMoveToSelection`/`TravelSection` require a
board or graph selection, and the only *board*-side selection setter is the
canvas's own click handler. Scan, Mine, Cancel-burn, Cancel-mine (board) and
fleet-roster selection (galaxy) genuinely do survive, by construction,
because their state lives as a sibling of the canvas region, not a child of
it. The spec now says exactly this partition instead of a blanket "stays
usable" claim, and requires the facts panel / inspector to stop instructing
the player to do the one thing they can't (see the `Renderer Unavailability
Is an Explicit State` scenarios covering surrounding-affordance survival and
move/departure/travel unreachability, both capabilities).

**Repair note (adversary round 1):** the galaxy side of that partition was
wrong, not merely imprecise — `GalaxyView.handleShowFleet` (the fleet
roster's own row callback) already does `setSelectedId(fleet.systemId)` for
any fleet not in lane transit, which populates the inspector and arms
`TravelSection`'s live `travel-button` through ordinary React state. So on
the galaxy view, "fleet-roster selection survives" is not merely "the roster
stays clickable" — it is a real, working path to a system, its inspector,
and Travel, with no canvas involved at any step. The spec and tasks now say
this explicitly (`Roster selection still reaches a system, its inspector,
and travel`) instead of instructing an implementer to make `TravelSection`
deliberately un-renderable in that state, which would have deleted a live
affordance to satisfy a false enumeration. The board has no equivalent
roster-reaches-selection path today — its fleet roster is a status list, not
a selection setter — so Move/Depart there remain unreachable as new
selections, as originally stated.

Alternatives considered: replacing the entire view (`SystemBoardView` /
`GalaxyView`) with the unsupported state — rejected, it makes an otherwise-
playable session unplayable over a rendering failure alone, and it has no
textual support in the doc beyond the ambiguous "error slot" phrase. This
reading is a `[READING]`, not an explicit statement in the source doc — see
Open Questions.

### Decision: A4 — context loss that never restores persists with a retry affordance

`webglcontextrestored` only fires if the paired `webglcontextlost` event was
`preventDefault()`ed, and a driver reset can kill a context permanently. A
spec that only describes the restore path leaves permanent loss as undefined
behaviour — exactly the uncaught-error class this change exists to close.
The interrupted state therefore has three defined outcomes: lost (no
uncaught error), restored (resume without navigation, showing current state
rather than a stale frame), and never restored (persist, offer retry with
defined success/repeat-failure/concurrency semantics).

Browser restore is genuinely reachable (three already `preventDefault()`s
loss and re-initializes on restore — see Context), which strengthens this
decision rather than weakening it: permanent loss is the driver-death /
`WEBGL_lose_context` case, not the common case. The common case
(backgrounded tab) is a separate, still-open question — see Open Questions.

**Qualification (QA, post-ship):** "genuinely reachable" holds only while
the *same* canvas element that registered the listener stays attached to the
document. `webglcontextrestored` fires on the canvas, not on the component;
detach that canvas — e.g. by unmounting the region it lives in — and the
event has nowhere left to land, permanently, even though the browser-level
restore three.js is waiting for is otherwise available. See the composition
repair note under "the shared guard module's public API" for the defect
this produced and the fix: the canvas region now stays mounted through
`interrupted`, which is what makes this paragraph true rather than aspirational.

Alternatives considered: leaving the never-restored case unspecified (status
quo before this change — rejected, it's the gap being closed); auto-retrying
on a timer without a user-visible control — rejected, silent looping against
a permanently dead context is indistinguishable from a hang and gives the
player no way to know something is wrong or to act on it.

### Decision: failure is intercepted by a pre-flight probe, with an error boundary as the blast-radius backstop

Verified facts: there is no `app/error.tsx` and no `global-error.tsx`
anywhere in the app. `frontend/components/error-boundary.tsx` exports
`ErrorBoundary`/`QueryErrorBoundary` but is imported by nothing outside its
own test. `new THREE.WebGLRenderer()` throws **synchronously** from a
commit-phase effect. So the nearest boundary to a throwing renderer
construction today is the Next.js root: the failure takes the **route**, not
the canvas region. A3 is structurally *available* — both views already
render the canvas as a sibling of their panels (`GalaxyView.tsx:280` vs
`:300`; `SystemBoardView.tsx:364` vs `:413`/`:419`) — but nothing *enforces*
it, so a plain conditional render still lets a construction throw take the
whole route down.

Mechanism matrix:

| Mechanism | Board (owns renderer) | Galaxy (FG3D owns renderer) |
|---|---|---|
| `try`/`catch` around construction | works | **impossible** — construction is inside the library |
| Pre-flight probe (`getContext('webgl2')` → `null`, never throws) | works | works |
| `ErrorBoundary` around the canvas region | works | works (catches the library's throw) |

**DECIDED: probe as the primary path, boundary as the backstop.**

Two mechanisms, layered, because neither alone makes A3 true:

1. **Pre-flight capability probe.** Before any renderer is constructed, the
   guard probes `document.createElement('canvas').getContext('webgl2')`. A
   missing context returns `null` rather than throwing, so this is an
   ordinary render-time branch: the guard renders the named unsupported
   state and never mounts the renderer. This is the path both surfaces
   share, and the only mechanism available to the galaxy view for
   *pre-emption*, since `react-force-graph-3d` constructs the renderer
   itself.
2. **An explicit `ErrorBoundary` scoped to the canvas region.** A context can
   pass the probe and still fail inside three.js — `new
   THREE.WebGLRenderer()` throws synchronously from a commit-phase effect.
   On the galaxy view that throw originates inside the library, where no
   `try`/`catch` of ours can reach it. The guard therefore wraps its canvas
   region in `components/error-boundary.tsx`'s `ErrorBoundary` with a custom
   `fallback` rendering the same unsupported state.

**Placement is what makes A3 true, and it is not currently true of
anything.** The app mounts no error boundary today (`ErrorBoundary` is
exported and unused; there is no `app/error.tsx`), so an uncaught renderer
throw propagates to the Next.js root and takes the whole route. The boundary
goes around `<GalaxyGraph>` only — a sibling of the panel overlay — and
around the board's canvas region only, a sibling of `FleetRoster`/
`FactsPanel`. Both views already have the sibling structure; only the
boundary is missing.

**What the boundary does not catch,** and must be handled locally: a throw
inside a `webglcontextlost`/`webglcontextrestored` DOM handler or inside a
`requestAnimationFrame` callback. Those are outside React's lifecycle and
are not boundary-catchable at any placement.

**Consequence for A4's retry.** A boundary that has caught has already
unmounted its subtree. Retry is therefore `reset()` plus a remount — a `key`
bump on the canvas region — not merely a re-run of the construction effect.
On the galaxy this is load-bearing: FG3D exposes no API to recreate its
renderer in place, so retry *is* remounting `<ForceGraph3D>`, which re-runs
the camera-rig init and loses the current camera pose.

Alternatives considered: `try`/`catch` around construction alone — rejected,
it cannot reach FG3D's internal construction, leaving the galaxy view (the
live gap this change exists to close) unprotected. A route-level
`app/error.tsx` alone — rejected, that is exactly the whole-view replacement
A3 forbids. A probe alone without a boundary — rejected, it makes the common
case graceful and leaves the uncommon case a whole-route crash, which is the
failure mode of record.

### Decision: the shared guard module's public API (pinned for the SDET)

The requirement text is renderer-agnostic; the module that makes it true is
not. Pinning the surface here is what lets the acceptance suite be written
before either consumer exists. `frontend/components/render-guard/`, one
co-located `.test.ts(x)` per file (`check-frontend-tests.sh` requires it and
this directory takes **no** `components/board/webgl/` exemption — the guard
decides what the player sees):

| File | Responsibility |
|---|---|
| `probe.ts` | `probeWebgl2(): ProbeOutcome` — the pre-flight capability probe |
| `guard-machine.ts` | `reduceGuard(state, event): GuardState` — the pure loss/restore/retry state machine |
| `use-render-guard.ts` | the React binding: listeners on a canvas, retry sequencing, recording |
| `RendererStateNotice.tsx` | the unsupported/interrupted presentation, retry control, live region, focus move |
| `CanvasRegionBoundary.tsx` | `components/error-boundary.tsx`'s `ErrorBoundary` scoped to one canvas region, retry = key bump |
| `record-renderer-failure.ts` | the recorded-by-cause sink (`console.error` floor) |
| `index.ts` | barrel |

```ts
// probe.ts
export type ProbeOutcome = { supported: true } | { supported: false; detail?: string }
export function probeWebgl2(): ProbeOutcome
```

- Creates a detached `<canvas>`, registers a one-shot
  `webglcontextcreationerror` listener (its `statusMessage` is the
  `detail` the recorder wants — and the string the UI must never show),
  calls `getContext('webgl2')` inside `try`/`catch`. Returns, never throws.
- **On success it immediately releases the probe context**
  (`ctx.getExtension('WEBGL_lose_context')?.loseContext()`, drop the canvas).
  A probe that keeps its context is a context leak charged against the same
  budget (Chrome: 16) the retry risk in Risks/Trade-offs is about — the probe
  would become a cause of the failure it detects.
- **Not memoized at module scope.** Every call re-probes; retry depends on a
  second call being able to return a different answer.

```ts
// guard-machine.ts
export type GuardStatus = 'live' | 'unsupported' | 'interrupted' | 'retrying'
export type FailureCause = 'creation' | 'lost' | 'restore-failed'
export interface GuardState { status: GuardStatus; cause: FailureCause | null }
export type GuardEvent =
  | { type: 'probed'; supported: boolean }
  | { type: 'contextLost' }
  | { type: 'contextRestored' }
  | { type: 'renderError'; cause: FailureCause }
  | { type: 'retryStarted' } | { type: 'retrySucceeded' } | { type: 'retryFailed' }
export function reduceGuard(state: GuardState, event: GuardEvent): GuardState
```

Transition table — the no-op rows **return the same object by reference**, so
"a second loss changes nothing" and "a second retry starts nothing" are
assertable facts rather than absences:

| from | event | to |
|---|---|---|
| any | `probed{false}` | `unsupported` / `creation` |
| any | `probed{true}` | `live` / `null` |
| `live` | `contextLost` | `interrupted` / `lost` |
| `interrupted` | `contextLost` | **identity** (same object) |
| `interrupted` | `contextRestored` | `live` / `null` |
| `unsupported` | `contextRestored` | **identity** |
| `unsupported`\|`interrupted` | `retryStarted` | `retrying` (cause preserved) |
| `retrying` | `retryStarted` | **identity** |
| `retrying` | `retrySucceeded` | `live` / `null` |
| `retrying` | `retryFailed` | back to `unsupported` (cause `creation`) or `interrupted` (cause `lost`) |
| `retrying` | `contextLost` | **identity** |
| any | `renderError{cause}` | `interrupted` if cause is `lost`, else `unsupported` |

```ts
// use-render-guard.ts
export interface RenderGuardOptions {
  canvas: HTMLCanvasElement | null       // null while none exists yet
  surface: 'board' | 'galaxy'            // for the recorder and the notice's copy
  onSuspend?: () => void                 // board: pause rAF; galaxy: pauseAnimation()
  onResume?: () => void                  // resume AND force a redraw from live data
  onRetry?: () => Promise<boolean>       // consumer-specific re-establishment
  probe?: () => ProbeOutcome             // test seam, defaults to probeWebgl2
  record?: RecordFn                      // test seam, defaults to recordRendererFailure
}
export interface RenderGuard {
  status: GuardStatus
  cause: FailureCause | null
  available: boolean                     // status === 'live' — the value FactsPanel.available takes
  retry: () => void                      // no-op while status === 'retrying'
  reportRenderError: (error: unknown, cause?: FailureCause) => void
}
export function useRenderGuard(o: RenderGuardOptions): RenderGuard
```

Behavioural contract the hook owns:

- Probes on mount and on every retry.
- Registers `webglcontextlost`/`webglcontextrestored` on `canvas` exactly
  once per canvas identity; re-registration on a second loss is forbidden
  (the identity rows above are how that is observed). Removes them on
  unmount, on canvas change, and before a retry.
- **Does not call `preventDefault()` on loss.** The renderer's owner does —
  three already does it inside `WebGLRenderer`, for the board's future
  renderer and for FG3D's alike. Two owners for one event is how a restore
  silently stops being reachable.
- Every listener body and every `onResume`/`onRetry` invocation is wrapped
  in `try`/`catch` → `reportRenderError` + record. This is task 1.3's local
  catch; a boundary cannot reach any of it.
- `retry()` sequence, in order: guard on `retrying` → remove listeners and
  `onSuspend()` (release before recreate) → `await onRetry?.()` → re-probe →
  `retrySucceeded` + `onResume()` or `retryFailed`. `onRetry` is a promise so
  the disabled/in-progress window is real on the galaxy's remount path; on
  the synchronous probe-only path it resolves immediately, which is exactly
  what task 1.7 says.

`RendererStateNotice` testids — distinct from the loading fallbacks by
construction (task 3.7): `renderer-unsupported`, `renderer-interrupted`,
`renderer-retry`, plus `data-surface="board" | "galaxy"`. `GraphFallback` in
`GalaxyView.tsx` gains `graph-loading`.

Composition at each surface is identical and is what makes A3 structural.

**Repair note (QA, real browser, post-ship): the two-arm form below is
superseded — do not reintroduce it.** The original composition unmounted the
canvas subtree on *any* non-`'live'` status, `'interrupted'` included. That
is a MAJOR defect, not a cosmetic one: `webglcontextrestored` fires on the
canvas element itself, and **a canvas that has been detached from the
document never fires it again** — there is no re-registration path once
React tears the element down. Three.js's own restore handling (Decision A4,
"browser restore is genuinely reachable") therefore became permanently
unreachable the instant the two-arm form showed the interrupted notice: an
ordinary tab background/foreground cycle — the *common* trigger for
`webglcontextlost`, not an edge case — left the player staring at "Rendering
interrupted" forever, with no code path left that could clear it short of
the explicit Retry remount. This is the single most important line in this
document for anyone touching this code: **the canvas region must stay
mounted through `'interrupted'`, or the browser's native restore path is
dead on arrival.** Do not "simplify" the three-arm form below back to two
arms without re-reading this paragraph.

The shipped composition (`GalaxyView.tsx`, `BoardCanvas.tsx`) is three arms,
keyed on `guard.status`, not two:

```tsx
guard.status === 'unsupported' ? (
  <RendererStateNotice status="unsupported" … />          // no usable context — tear down is correct
) : guard.status === 'retrying' ? (
  <RendererStateNotice status="retrying" … />              // explicit Retry always remounts fresh
) : (
  <>
    {/* 'live' or 'interrupted' — the canvas subtree stays mounted in BOTH */}
    <CanvasRegionBoundary key={attempt} onError={guard.reportRenderError}
                          fallback={<RendererStateNotice status="unsupported" … />}>
      {/* GalaxyGraph, or the port's BoardCanvas content */}
    </CanvasRegionBoundary>
    {guard.status === 'interrupted' && (
      <RendererStateNotice status="interrupted" className="absolute inset-0" … />
    )}
  </>
)
```

`'unsupported'` has no usable context, so tearing its subtree down is
unchanged and correct. `'retrying'` is the explicit Retry escape hatch —
that path is *supposed* to tear down and remount fresh, so it is excluded
from the stay-mounted rule on purpose. `'live'` and `'interrupted'` share one
arm: the canvas subtree (`CanvasRegionBoundary` + its children) stays
mounted for both, and `RendererStateNotice` renders only for `'interrupted'`,
as an `absolute inset-0` overlay stacked above the still-live canvas rather
than as a replacement for it. The boundary's own `fallback` still covers a
construction throw inside that arm (probe-passed, three-throws case); it and
the interrupted overlay are mutually exclusive by construction (only one
`guard.status` is active at a time), so nothing double-renders. Retry after a
boundary catch bumps `key` on the boundary itself, which remounts the
boundary and its subtree in one move; the guard's state lives *above* the
boundary and therefore survives.

**`canvasRegionMounted` vs `canvasAvailable` — two different booleans, do not
conflate them.** `canvasAvailable` (`guard.status === 'live'`) is unchanged
from the original design: it gates `IntelPanel`'s recenter and `Inspector`'s
`available` prop, because those verbs are genuinely unusable while
interrupted. `canvasRegionMounted` (`guard.status === 'live' || guard.status
=== 'interrupted'`) is new, gates only the composition above, and is
strictly wider than `canvasAvailable`. The defect had a second, connected
half that this second boolean fixes: the effect that nulls
`controllerRef.current` (galaxy) — so a stale ref doesn't outlive its
controller — was originally keyed on non-`'live'`, i.e. effectively on `!
canvasAvailable`. That nulled the ref on entering `'interrupted'` even once
the canvas subtree above was fixed to stay mounted, so a genuine browser
restore firing `onResume` (`controllerRef.current?.resume?.()`) hit a stale
`null` ref and silently did nothing — `resumeAnimation()` never ran, even
though the canvas itself had recovered. Rekeying that effect to
`!canvasRegionMounted` closes it: the controller/canvas ref now survives
exactly as long as the canvas subtree does, and is nulled only when the
subtree actually tears down (`'unsupported'` or a Retry remount). The board's
`BoardCanvas` carries the same distinction for its own canvas-owning
equivalent of `controllerRef`.

**Why the jsdom unit suite never caught this.** This defect was found by QA
driving a real browser, not by `frontend`'s vitest/jsdom suite, and could
not have been — jsdom's canvas stub is never actually detached from a real
compositor/GPU surface the way a real `HTMLCanvasElement` is, so a unit test
asserting "the boundary/notice swap happens on `contextLost`" is satisfied
identically whether or not the underlying element would, in a real browser,
have lost its ability to ever fire `webglcontextrestored` again. The two
pins this repair adds — the canvas subtree staying mounted through
`'interrupted'`, and `controllerRef`/its board equivalent surviving via
`canvasRegionMounted` rather than `canvasAvailable` — are **structural**
properties of the composition and the effect's dependency array; jsdom can
assert they exist (the DOM nodes are present, the ref is non-null) but
cannot assert the property they exist *for* (that a real browser's restore
event actually reaches them). That browser-level guarantee is exercised only
by `frontend/e2e/tests/renderer-availability.spec.ts`'s real loss/restore
test, which drives an actual `webglcontextlost` → `webglcontextrestored`
round trip against a live page. Treat that spec, not the unit suite, as the
regression guard for this class of defect.

**Repair note (post-ship): neither surface passes `onRetry`.** The
composition above only mounts `children` (`<GalaxyGraph>`, or the board's
guarded content) once `guard.status === 'live'`. An `onRetry` awaited from
inside the `retrying` state to "wait for the remounted graph to report
ready" is therefore circular for the galaxy — the graph does not exist
until after the transition `onRetry` would be waiting to cause. Both
shipped surfaces sidestep this the same way: `onRetry` is omitted, and the
guard's own re-probe (`probeWebgl2()`) is the sole success signal. On the
galaxy, the fresh `<GalaxyGraph key={attempt}>` then mounts naturally via
the branch swap once `status` flips to `live`; if that remount itself
throws, `CanvasRegionBoundary` catches it and converts it to the
unsupported/interrupted state via `renderError` — the same observable
outcome a `retryFailed` transition would produce, reached by a different
event. `onRetry` remains part of `RenderGuardOptions` and is exercised by
`use-render-guard.ts`'s own test suite (a controllable stub); it exists for
a future surface whose re-establishment is genuinely asynchronous — do not
delete it as dead code or wire it circularly against the galaxy remount.

Consequence, stated plainly: because neither surface passes an async
`onRetry`, the "retry affordance prevents duplicate concurrent attempts"
behaviour has no real in-progress window at the `GalaxyView`/`BoardCanvas`
level — both surfaces' re-establishment is synchronous (probe-only), so
`retrying` resolves within the same tick it's entered. The guard's contract
still enforces the concurrency rule (the `retrying` → `retryStarted`
identity row in the transition table above) and the hook's own tests still
pin it via a controllable `onRetry` stub with a deliberately unresolved
promise, but at the shipped surfaces the scenario is satisfied without an
observable pause — there is nothing mid-attempt for a user, or a test
driving `GalaxyView`/`BoardCanvas` directly, to see.

Placement note: `use-render-guard.ts` sits in the module, not in
`frontend/hooks/`. That directory is the React Query domain layer
(`use-fleets`, `use-galaxy`, …); this is a component-local DOM binding, and
the "one module" decision above is worth more than a filename convention it
was never meant to cover.

### Decision: jsdom has no WebGL, so the test baseline must declare availability globally

Verified in this repo: `frontend` does not install the `canvas` package, so
jsdom's `HTMLCanvasElement.prototype.getContext('webgl2')` **returns `null`**
(and emits a "Not implemented" jsdomError to stderr). It does not throw.

Consequence: the moment `GalaxyView` gates `<GalaxyGraph>` on the probe,
every existing test that renders the galaxy lands in the unsupported state —
`GalaxyView.test.tsx:229` (`inspector` reads `/select a system/i`) and the
whole mocked-graph interaction suite would go red for a reason that has
nothing to do with what they assert.

**Decided:** `vitest.setup.ts` stubs `HTMLCanvasElement.prototype.getContext`
to return a minimal fake context for `'webgl'`/`'webgl2'` (supporting
`getExtension('WEBGL_lose_context') → { loseContext() }`), i.e. the default
jsdom world declares WebGL **available**. Tests that want unavailability
override it per-test. This keeps the 73-file / 714-test baseline green for
the right reason (the app is available, and behaves), removes existing
stderr noise, and makes "unsupported" an explicit thing a test asks for
rather than an accident of the environment.

Rejected: leaving jsdom's `null` as the default and stubbing availability in
each affected file — it inverts the default so that any future test touching
a canvas silently exercises the failure path.

### Decision: why ADDED, not MODIFIED, against the existing loading/error requirements

`hex-board-view`'s `### Requirement: System Board Route and Data Fan-In` and
`galaxy-view`'s `### Requirement: Loading and Error States` are both scoped
to a data-read failure (the interior/fleet reads; the galaxy read). Renderer
unavailability shares a UI *slot* with those states but not their *trigger*
— it fires on a client-capability / GPU event that is orthogonal to whether
the data read succeeded. Folding it into either existing requirement would
force a complete-replacement MODIFIED rewrite of an unrelated requirement
for no shared behaviour; a standalone ADDED requirement is cleaner and keeps
each requirement testable by exactly one trigger class.

### Decision: same requirement name, two capabilities, two implementations

`hex-board-view` and `galaxy-view` each get requirements named
`### Requirement: Renderer Unavailability Is an Explicit State` and
`### Requirement: Lost Rendering Context Recovers Without Navigation`.
Requirement names are scoped per-capability, so there is no archiver
collision. The identical naming is deliberate: it makes "same rule, two
independent implementations" legible in `openspec show`/`openspec list`.

The galaxy view does not own its renderer — `react-force-graph-3d` does;
`GalaxyGraph.tsx` reaches it only through the library's imperative ref
accessor (`FgRef.renderer(): () => THREE.WebGLRenderer`, already declared
and used for the camera rig). That accessor is the right seam for attaching
**loss/restore listeners to an already-mounted renderer** — it is the
**wrong** seam for **creation failure**: three throws inside the
constructor, which runs inside react-kapsule's mount path, so
`fgRef.current` is never populated with a usable renderer and
`fgRef.current.renderer()` is never reached. Creation failure arrives as a
**React error**, not a ref value, and is caught by the probe (pre-emptively)
or the boundary (when thrown) — never by the ref accessor.

The implementations differ in *renderer ownership*, not in most of the
guard. The board constructs and owns its `THREE.WebGLRenderer` directly
(today only in the spike; in the production module the port adds). The
galaxy view does not — `react-force-graph-3d` does, and `GalaxyGraph.tsx`
reaches it through the library's imperative ref accessor, already declared
and used for the camera rig.

**Shared, one module, outside `components/board/webgl/`:** the capability
probe, the canvas-region error boundary wrapper, the unsupported/interrupted
presentation and its retry control, and the
`webglcontextlost`/`webglcontextrestored` state machine parameterised by a
canvas. **Not shared:** how each surface obtains its canvas (board: the one
it created; galaxy: `fgRef.current.renderer().domElement`) and how each
suspends its loop (board: its own rAF; galaxy: `pauseAnimation()` /
`resumeAnimation()`).

Sharing this much is what keeps the two capabilities' identical requirement
text honest. An earlier framing — "two implementations, drift mitigated by
shared spec text" — accepted as a risk something a shared module removes
structurally. Placement note: the shared module must live outside
`components/board/webgl/`, whose test-coverage exemption is for GL plumbing
that decides nothing. This guard decides what the player sees, so it is
tested.

### Decision: render-loop suspension is an implementation detail, not a requirement

Neither requirement's text says "the render loop is suppressed," and neither
scenario asserts it as a `THEN`. Loop suspension is not user-observable on
its own — the observable facts are "no uncaught error" and "the resumed
frame is current, not stale" — and three's `render()` already no-ops while
its own context is lost, so asserting suppression again would test a
dependency's behaviour. The two surfaces suspend differently anyway: the
board pauses its own `requestAnimationFrame` loop; the galaxy view calls
`pauseAnimation()`/`resumeAnimation()` on the FG3D controller. Both exist
purely to save CPU while nothing is drawable, not for correctness — the
probe/boundary/state-machine trio is what makes the requirement true.

### Decision: at ship time the board guard is mounted but its loss/restore listeners have no canvas

`components/board/` creates no rendering context today — the only `new
THREE.WebGLRenderer()` in the repo is in the spike. So this change ships, for
the board: the probe, the boundary, the unsupported and interrupted states,
and the retry affordance, mounted at the canvas-region slot `SystemBoardView`
already renders into. The `webglcontextlost`/`webglcontextrestored`
attachment is implemented in the **shared** guard module and exercised by
unit test against a stub canvas; it becomes live when
`port-board-to-webgl-renderer` mounts a real canvas into that slot. The port
adopts the guard; it does not re-derive it.

This is why the board's `hex-board-view` requirement is archived ahead of the
renderer it describes: the port's risk section cites the unavailability state
as a mitigation of record, and a mitigation authored in the same commit as
the risk is not a mitigation. The galaxy half is live on ship day and closes
the real gap.

Consequently `SystemBoardView.tsx` is not modified by this change — `HexBoard`
and `BoardScene` remain exactly what it renders (Non-Goals, above). The
board-side artifact this change ships is `BoardCanvas` (named to match
`port-board-to-webgl-renderer`'s seam so both changes describe the same
component), built and unit-tested standalone in `frontend/components/board/`
against a stub canvas, composing the shared guard module. It is ready for
`SystemBoardView` to mount in place of `HexBoard` the moment the port's
straight swap lands; that mount is the port's change, not this one.

**Repair note (adversary round 1):** "not modified" was true of
`SystemBoardView.tsx` but the first draft let it become true of `FactsPanel`
too, by deferring the facts-panel copy fix to "documented sibling contract"
with no implementing task anywhere in this change or the port's. That let
the requirement archive as satisfied while `FactsPanel.tsx` kept rendering
"Select a body, tile, or gate." beside a WebGL-unavailable canvas forever.
The fix stays inside the stated boundary: `FactsPanel.tsx` (not
`SystemBoardView.tsx`) gains an `available: boolean` prop, defaulted `true`
so no existing caller changes behaviour, that switches the empty-selection
copy. That is testable today, directly against `FactsPanel`, with no canvas
and no `SystemBoardView` involved — the port wires the prop from the guard's
state when it mounts `BoardCanvas` in `SystemBoardView`'s place.

Alternatives considered: making this change galaxy-only and moving both
`hex-board-view` requirements into the port — rejected, it destroys the
sequencing argument that motivated the split. Pulling the port's
`WebGLBoard` forward so the board's listeners are live here — rejected, that
is the port.

### Decision: two testability notes

- The unsupported state must be distinguishable from the galaxy's existing
  `next/dynamic({ ssr: false })` loading fallback (`GraphFallback`), which
  also occupies the canvas region while `GalaxyGraph` is being code-split in.
  Distinct `data-testid`s on the loading fallback vs. the unsupported/
  interrupted states are what make "the unsupported state is independent of
  the galaxy data read" (and, by the same logic, independent of the loading
  fallback) assertable rather than merely believed.
- `GalaxyGraph.test.tsx` already mocks `react-force-graph-3d` wholesale, so
  the galaxy's creation-failure test is "make the mock throw, assert the
  boundary converts it" — which tests the right thing under the probe/
  boundary decision above and tests nothing under the retired "surfaced
  through the ref" framing. `BoardCanvas`'s equivalent is a stub-canvas unit
  test, not a `SystemBoardView` integration test (see the board-half
  decision above). Name this in tasks so nobody invents a real GL harness in
  jsdom.

### Decision: where the observability scenario lives

The recorded-by-cause scenario (context fails to create, is lost, or fails to
restore) is attached to `### Requirement: Lost Rendering Context Recovers
Without Navigation` in both capabilities, not to a new requirement and not
to the creation-failure requirement. That requirement is already the
lifecycle one — it is the only requirement whose text already names all
three outcomes (lost / restored / never-restored) as a single defined
sequence, so "record which of the three happened" reads as one more property
of that same sequence rather than a fourth, disconnected concern. Creation
failure is included in the *scenario's* trigger even though it lives on the
other requirement; that is a property of the recording behaviour, not a
reason to duplicate it.

### Decision: retry deliberately does not toast on failure

Every existing mutating verb in `hex-board-view` (move, scan, mine, cancel)
toasts on failure. The retry affordance specified here does not, on purpose:
the persistent interrupted/unsupported state IS the failure signal — it is
already on screen, already named, and already offering the next action. A
toast layered on top would be redundant with content already present, unlike
a mutating verb's toast, which is often the *only* signal a fire-and-forget
action failed.

## Risks / Trade-offs

- `BoardCanvas`'s shape here is a bet on what the WebGL port's phase 1
  extraction (`components/board/webgl/`) will adopt — mitigated by placing
  the guard at the natural seam (the canvas-region wrapper `SystemBoardView`
  already renders into) and by naming it identically to the port's own
  design (`BoardCanvas`), so the port's extraction is adoption, not a
  rename-and-reconcile.
- A user-invoked retry affordance that itself fails silently would be worse
  than no retry at all — mitigated by the retry's success/failure/
  concurrency paths being individually specified and testable (not merely
  "it re-runs context creation").
- Mounting the codebase's first error boundary changes failure behaviour for
  anything else that throws inside the guarded region. Scoped narrowly on
  purpose: only the canvas region is wrapped, so no data/panel error path
  changes.
- The galaxy guard is coupled to `react-force-graph-3d`'s imperative surface
  (`^1.29.1`, a caret range). It adds `pauseAnimation()`/`resumeAnimation()`
  to the accessors `GalaxyGraph` already depends on. **Correction (kickoff
  review): declaring them on `FgRef` does NOT buy a compile error.**
  `GalaxyGraph.tsx:24` is `dynamic(() => import('react-force-graph-3d'))
  as any` and `fgRef` is a hand-written `useRef<FgRef | null>`, so TypeScript
  never structurally checks `FgRef` against the library's real type — a
  rename in the library is invisible to `tsc` today and would stay invisible.
  The honest mitigations are the two that actually hold: optional-call
  degradation (`fg.pauseAnimation?.()` → "interrupted state shown, loop not
  paused", never a crash), and a unit test that asserts the guard still
  reaches the interrupted state when the accessors are absent. `FgRef` is
  still where they get declared — for legibility, not for enforcement. The
  library offers no API to recreate its renderer in place, so galaxy retry is
  a remount; that is a cost of not owning the renderer, accepted.
- Retry that doesn't dispose the failed renderer and re-attach fresh
  listeners can, over repeated clicks or a flaky driver, exhaust the
  browser's live-WebGL-context budget (Chrome: 16) and make the failure
  permanent for the whole page — mitigated by the retry scenarios requiring
  disposal-before-recreate and at most one live context per canvas at a time.
  Distinct from the backoff/attempt-cap mechanics the Non-Goals still defer.
- The wake-up handoff (`GalaxyView.tsx:133-143`) reads `sessionStorage`'s
  `wakeFocus` and removes it immediately, then only acts on it once
  `graphReady` becomes true (`:246`) — which never happens if the graph
  never mounts. A freshly spawned player without a working WebGL2 context
  loses the one-shot home-system selection permanently: the sibling case to
  "in-flight selection survives a context loss," uncovered by any scenario.
  Accepted as a known limitation rather than specified here — it is a
  spawn/first-mount edge case, not a mid-session loss, and the honest fix
  (holding `wakeFocus` until the graph is ready or genuinely unsupported, or
  surfacing it in the intel panel unsupported-state copy) is product-shape
  work close to the Open Questions' non-canvas target-selection item, not a
  spec-repair-sized change.

## Migration Plan

No data migration, no API change, no deletion. Additive at two component
seams.

1. Land the shared guard module (probe, boundary wrapper, unsupported and
   interrupted states, retry) outside `components/board/webgl/`, with unit
   tests.
2. Wire the galaxy view: boundary around `<GalaxyGraph>` inside `GalaxyView`,
   loss/restore listeners attached via the FG3D ref once the graph has
   mounted. Live on ship day; closes the standing gap on the home route.
3. Build `BoardCanvas` and the guard standalone, with their own tests.
   `SystemBoardView` is untouched by this change; the loss/restore
   attachment ships in the shared module and becomes live when
   `port-board-to-webgl-renderer` mounts the guard into `SystemBoardView`.
4. Archive before `port-board-to-webgl-renderer` begins. The port's phase 1
   extraction adopts this guard rather than authoring its own.

Rollback is deleting two wrappers; both views return to current behaviour.

## Open Questions

- **A3's board-canvas-region-only (and graph-canvas-region-only) scoping** is
  an orchestrator reading of the design doc's "the board's error slot," not
  an explicit statement in `docs/plans/webgl-board-port.md`. Confirm or
  correct with Travis before this ships: should the unsupported/interrupted
  state really leave `FactsPanel`/fleet roster (board) and the intel
  panel/system inspector (galaxy) usable, or should it take the whole view?
- **A4's retry affordance** is specified as a retry control the player
  invokes, not a reload prompt. Confirm or correct with Travis: is a
  same-view retry control the right shape, or should the never-restored path
  instead prompt a full page reload?
- **A non-canvas target-selection affordance for Move/Depart/Travel.** This
  change's minimum fix stops the facts panel/inspector from instructing the
  player to do something impossible without a canvas, but it does not give
  Move/Depart/Travel any working path when the canvas is down — those verbs
  stay genuinely unreachable in that state. UX's panel review proposed going
  further: a textual list of in-system features/gates (board) and a system
  list in the intel panel (galaxy), so Move/Depart/Travel survive a lost
  canvas the way Scan/Mine already do. That is a product-shape decision
  (what the non-canvas interaction model is), not a spec repair, and it
  materially expands this change's scope — deliberately not adopted here.
  Below is a reconstruction of that proposal's shape, paraphrased from the
  panel review (no literal requirement text was supplied by the reviewer, so
  this is not a verbatim quote — it's ready to refine and adopt if Travis
  wants it):

  ```markdown
  ### Requirement: Non-Canvas Target Selection (NOT adopted — reference only)
  WHEN the board's canvas region shows the unsupported or interrupted state,
  the system SHALL offer a textual list of the current system's selectable
  features and lane gates as an alternative Move/Depart target-selection
  affordance in the facts panel.

  WHEN the galaxy graph's canvas region shows the unsupported or interrupted
  state, the system SHALL offer a textual list of systems as an alternative
  travel-destination affordance in the intel panel.
  ```

- **Backgrounded-tab loss.** `webglcontextlost` fires on ordinary tab
  backgrounding, not only on true GPU failure — it is the most common
  real-world trigger on mobile, usually followed by an immediate harmless
  restore. Showing the interrupted state on *every* loss would flash an
  error on ordinary tab switching. Should the interrupted state have a grace
  period before becoming visible, or is showing it immediately and
  unconditionally intended? No number is sourced from the design doc;
  confirm with Travis before inventing one.
- **Software-renderer fallback.** Context creation can *succeed* against a
  software rasterizer: unusably slow, no exception, never fires
  `webglcontextlost`, so neither requirement's trigger fires and the player
  gets a technically-live but unplayable board/graph. Detecting it needs a
  heuristic (`WEBGL_debug_renderer_info`, a frame-time budget) with no
  threshold given in the source doc. Out of scope by design for this change
  — `port-board-to-webgl-renderer` records the same gap in its own Risks;
  keep the two consistent if either is revised.
- **Resolved: the board's canvas-only control.** Kickoff review flagged that
  `FactsPanel`'s `scan-fx-toggle` (`FactsPanel.tsx:203-212`), which switches
  which effect the **board** draws for a running scan, is a genuine
  canvas-only control that exists today — not something introduced by a
  later change — and recommended covering `hex-board-view`'s `A canvas-only
  control is disabled while the canvas is unavailable` scenario here rather
  than deferring it to `add-board-camera-controls` task 8.1. Orchestrator
  ruling: it qualifies, and it is covered here. Task 2.2c now gates
  `scan-fx-toggle` on `available`; `add-board-camera-controls` still
  separately inherits the same rule for the camera controls it adds. No
  spec edit was needed (the scenario already read this way).

- **Observability sink.** No client-side error-reporting service exists
  today (`@vercel/analytics` is pageview-only). Confirm the intended sink for
  the recorded-by-cause scenario — `console.error` as the floor, or is a
  reporting service now in scope? Don't let "record" quietly mean nothing.
- **Fog/observation boundary — unverified by a security reviewer.** This
  change's dedicated security review did not return findings for this run.
  The orchestrator's own read is that this change touches no data path, no
  read, and no fog projection, so it cannot affect the fog/observation
  boundary — but that is a read, not a completed security sign-off. Flagged
  honestly rather than silently assumed clean.
