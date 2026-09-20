# fix-world-time-render-loop — implementation contract

Author: `openspec-architect`, who also owns this change's `design.md`.
Written 2026-09-19 at kickoff.

**What I read before writing this.** The change at verdict commit `3566af9`,
confirmed unchanged at `1b437af`: proposal, design (Decisions 1–8), tasks
(37), and the `system-space-view` and `galaxy-view` deltas. The four USER
RULINGs in `fix-world-time-render-loop-rulings.md`, plus the kickoff sizing
I appended to that file today. The panel and adversary records. The defect
records (`defect-cross-system-chevron-nav-stall.md`,
`defect-galaxy-view-clock-ignores-served-scale.md`,
`drift-reduced-motion-never-detected.md`). `frontend/CLAUDE.md` and
`docs/testing-tiers.md`. The live code at every site named below.

**Who this is for, and what it can decide.** The SDET writes the failing
suite from this document first. The single `openspec-nextjs-dev` then makes
that suite pass. This contract settles only what the spec and design leave to
implementation: module paths, exported signatures, test seams, the DOM
contract, and the order of work. **It has no authority over the spec.** If
this contract and a spec delta conflict, that task halts and goes back
through the orchestrator. The implementer never resolves it. Places where I
had to choose between literal task wording and a working design are in §15
as findings. Nothing there is silently reinterpreted.

**Frontend only.** There is no Go work, no wire change, and no new served
field. The list envelope's `scale` is already served
(`backend/fleet/handler.go:134`); the frontend just drops it today. No API
contract has to come first. The seam two agents would otherwise each invent
is the clock's surface, the transform loop's surface, and the test seams, so
§2–§9 cover those.

This document names **no commands and no timeouts**. `docs/testing-tiers.md`
is the one definition of tiers; §14 only says which tier gates what.

---

## 1. Module map, and the tier-0 test-file gate

Every new `.ts`/`.tsx` file under `frontend/` needs a sibling test file, or
`check-frontend-tests.sh` fails. That script skips `index.ts` and
`lib/types/*.ts`.

| File | Status | Sibling test |
|---|---|---|
| `frontend/lib/client-clock/index.ts` | NEW (§2) | `frontend/lib/client-clock/index.test.tsx`: NEW. The script would skip `index.ts`, but the pure tests move here anyway (task 3.1) |
| `frontend/hooks/use-reduced-motion.ts` | NEW (§3) | `frontend/hooks/use-reduced-motion.test.tsx`: NEW |
| `frontend/components/space/space-transform-loop.ts` | NEW (§6) | `frontend/components/space/space-transform-loop.test.ts`: NEW |
| `frontend/components/space/space-projection.ts` | extended (§5) | `space-projection.test.ts`: extended, existing cases untouched |
| `frontend/components/space/SpaceStage.tsx` | rewired (§7) | 5 existing suites migrated (§10) + NEW `SpaceStage.transform-loop.test.tsx` |
| `frontend/components/space/webgl/SpaceWorld.tsx` | `scene`/`camera` props → `frameRef` (§8) | `SpaceWorld.test.tsx` and `SpaceWorld.draw.test.tsx` migrated |
| `frontend/components/space/SystemSpaceView.tsx` | rewired (§9.1) | NEW `SystemSpaceView.render-loop.test.tsx`. Existing SSV suites untouched except the one comment in §10 |
| `frontend/components/galaxy/GalaxyView.tsx` | rewired (§9.2) | NEW `GalaxyView.render-loop.test.tsx`. `GalaxyView.test.tsx` loses one mock line |
| `frontend/lib/services/fleet-service.ts` | `listMine()` returns the envelope (§4) | `fleet-service.test.ts`: 2 assertions migrated |
| `frontend/hooks/use-fleets.ts` | `useMyFleets` exposes `scale`/`worldTime` (§4) | `use-fleets.test.tsx`: 1 assertion migrated, 1 test added |
| `frontend/lib/types/fleet.ts` | `FleetList.scale` (§4) | exempt |
| `frontend/hooks/use-world-time.ts` | **DELETED** (task 3.5) | `use-world-time.test.tsx` **DELETED** once its pure tests have moved |

Nothing goes under `frontend/lib/space/`, which is anti-mirror-scanned
against `backend/space`. Nothing is named `world-clock` (design Decision 1).

---

## 2. `lib/client-clock/index.ts`: the clock (tasks 3.1, 3.2, 3.6, 3.7)

The file starts with `'use client'`. Exports, exactly:

```ts
export interface WorldAnchor { world: number; wall: number }          // moved verbatim
export interface WorldReading extends WorldAnchor { readonly scale: number }

export interface WorldClock {
  /** Replace the reading. ONE assignment of a NEW object. The previous reading object is never mutated.
   *  A non-finite `world` or `scale` is a no-op. */
  anchor(world: number, scale: number): void
  /** projectWorldTime(reading, wall(), reading.scale). Returns 0 before the first anchor, and never throws. */
  now(): number
  /** True once anchor() has been called with finite values. */
  hasReading(): boolean
  /** The current reading object, or null. Its identity changes only when anchor() runs. */
  reading(): Readonly<WorldReading> | null
}

export function projectWorldTime(anchor: WorldAnchor, wallNow: number, scale: number): number  // verbatim
export function wallClock(): number                                                            // verbatim (performance.now, else Date.now)
export function createWorldClock(wall?: () => number): WorldClock                             // wall defaults to wallClock
export const COARSE_TICK_MS = 1000
export function useWorldClock(serverWorldTime: number | undefined, scale: number | undefined): WorldClock
export function useCoarseWorldTime(clock: WorldClock): number
```

**Why `reading()` exists alongside the three methods the task names.** Design
Decision 1 requires "one assignment of a new object". That rule makes a
re-anchor detectable by identity. `useCoarseWorldTime` needs exactly that
signal to update "immediately on re-anchor" (Decision 2), and there is no
subscription list to deliver it (Decision 1: nothing pushes). `reading()` is
the read side of the rule, not a new capability. `createWorldClock` takes an
optional `wall` so a test can inject a controlled wall clock. That seam is
what makes the pure tests for 3.6 and 3.7 possible without fake timers.

**`useWorldClock(serverWorldTime, scale)`:**
- It creates one clock per mount, using `useState(() => …)` with a lazy
  initializer. **The initializer anchors immediately** when both arguments
  are finite, so the clock is anchored during the first render. That is the
  render in which `SystemSpaceView`'s children (`ScanSweepWatcher`) first
  read it, and their effects run *before* the parent's.
- It re-anchors in a **`useLayoutEffect`** keyed on
  `[clock, serverWorldTime, scale]`. It does so only when both values are
  finite and at least one differs from the last pair it anchored. It never
  anchors on a reading alone (design m18). A layout effect is used rather
  than a passive one because every passive effect in the tree, children
  included, must see the fresh anchor.
- It returns the same object for the whole mount, so the return is
  referentially stable.

**`useCoarseWorldTime(clock)`:**
- Initial state is `clock.now()`.
- **It must be called after `useWorldClock`, in the same component.** A
  `useLayoutEffect` with no deps compares `clock.reading()` by identity with
  the last one seen. On a change it sets the value to `clock.now()`. This is
  the "immediately on re-anchor" path, and it works only because layout
  effects in one component run in declaration order.
- A passive effect keyed on `[clock]` does three things:
  - It sets `setInterval(tick, COARSE_TICK_MS)`, where
    `tick = () => { if (clock.hasReading()) setValue(clock.now()) }`. The tick
    does nothing while the clock has no reading, so an unanchored clock causes
    no renders.
  - It adds a `document` `visibilitychange` listener. When
    `document.visibilityState === 'visible'`, the listener calls `tick()`
    immediately and restarts the interval from that instant (task 3.7).
  - Its cleanup clears the interval and removes the listener. Unmount cleanup
    is part of what task 3.2 tests.
- It returns a plain `number`: unrounded world-ms. Callers that display it
  round it themselves, as `data-world-time` already does.

---

## 3. `hooks/use-reduced-motion.ts` (task 3.8)

The file starts with `'use client'`.

```ts
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
export function useReducedMotion(): boolean
```

- Initial state reads `window.matchMedia(REDUCED_MOTION_QUERY).matches`,
  guarded by `typeof window !== 'undefined' && typeof window.matchMedia === 'function'`.
  Without a window it is `false`.
- A passive effect with deps `[]`:
  - It calls `const mql = window.matchMedia(REDUCED_MOTION_QUERY)` **once** and
    uses that same object for both adding and removing the listener. The shared
    stub in `vitest.setup.ts` returns a fresh object per call.
  - It defines `sync = () => setReduced(!!mql.matches)` and calls `sync()` once
    right away.
  - It calls `mql.addEventListener('change', sync)`. Cleanup calls
    `removeEventListener`.
- **The handler reads `mql.matches` and never the event payload.** The test
  mock flips `matches` on the list object and then dispatches.

---

## 4. The fleet-list envelope (task 3.4, service/hook half)

- `lib/types/fleet.ts`: `FleetList` becomes
  `{ fleets: Fleet[]; worldTime: number; scale: number }`. `scale` is added
  as a required field: it is served unconditionally (`fleet-movement`'s
  *Fleet Reads Serve the Simulation Clock's Scale*).
- `fleetService.listMine(): Promise<FleetList>` returns
  `{ fleets: data.fleets ?? [], worldTime: data.worldTime, scale: data.scale }`.
  The empty-array normalisation still applies.
- `hooks/use-fleets.ts`:

```ts
export type MyFleetsResult = Omit<UseQueryResult<FleetList, Error>, 'data'> & {
  data: Fleet[] | undefined        // UNCHANGED shape for every existing consumer
  scale: number | undefined        // the ENVELOPE's served scale — not per fleet
  worldTime: number | undefined    // the ENVELOPE's served world time (same response as `scale`)
}
export function useMyFleets(
  options?: Omit<UseQueryOptions<FleetList, Error>, 'queryKey' | 'queryFn'>,
): MyFleetsResult
```

The hook returns `{ ...query, data: query.data?.fleets, scale:
query.data?.scale, worldTime: query.data?.worldTime }`.

**Why `data` keeps the `Fleet[]` shape.** Eight test files mock `useMyFleets`
as `{ data: [...] }` across about 25 sites. `FleetRoster.tsx:116`,
`SystemSpaceView.tsx:233/277` and `GalaxyView.tsx:179` all read `data` as an
array. Keeping the shape means none of them change. A mock that omits
`scale` reads as "no scale served", which is exactly the state the galaxy
hold tests need.

The only migrated assertions are these. `fleet-service.test.ts` has two
tests that read `result` as an array; they now read `result.fleets`, and the
first also asserts `result.scale`. `use-fleets.test.tsx` has the success test,
whose mock resolves an envelope; add one test asserting that `scale` and
`worldTime` come from the envelope.

---

## 5. `space-projection.ts` additions (task 4.1)

```ts
import type { DrawScreenPoint, DrawViewBasis } from '@/lib/space/draw'
import type { SceneMark, SceneModel } from './space-scene'

export interface ProjectedMark { mark: SceneMark; screen: DrawScreenPoint }
/** Pure. One entry per scene mark, in scene order: { mark, screen: projectToScreen(mark.position, basis) }. */
export function projectMarks(scene: Pick<SceneModel, 'marks'>, basis: DrawViewBasis): ProjectedMark[]

export const OFFSCREEN_PX = -9999
/** A hit target's ENTIRE placement, centring included. Off-screen, behind the eye, non-finite, or undefined → the sentinel. */
export function hitTargetTransform(screen: Pick<DrawScreenPoint, 'x' | 'y' | 'onScreen'> | undefined): string
// on-screen:  `translate3d(${x}px, ${y}px, 0px) translate(-50%, -50%)`
// otherwise:  `translate3d(-9999px, -9999px, 0px) translate(-50%, -50%)`
```

This introduces no import cycle: `space-scene` imports only `space-selection`.
jsdom round-trips this transform string verbatim (checked), so tests may
compare with `toBe`.

---

## 6. `space-transform-loop.ts`: the loop, the registry, the published frame (tasks 4.2, 4.3, 4.3a, 4.6, 4.8)

### 6.1 Types and exports

```ts
import type { WorldClock } from '@/lib/client-clock'
import type { DrawViewBasis } from '@/lib/space/draw'
import type { SpaceCamera } from './space-camera'
import { buildSceneModel, type SceneInput, type SceneModel } from './space-scene'
import { projectMarks, hitTargetTransform, viewBasisOf, type ProjectedMark } from './space-projection'

export type SceneFrameInputs = Omit<SceneInput, 'worldTimeMs'>

/** What SystemSpaceView hands the stage. Stable identity (useMemo on [clock]). */
export interface SpaceFrameSource {
  clock: WorldClock
  inputsRef: { readonly current: SceneFrameInputs | null }
}

/** THE published frame, and the one basis in the view (design Decision 7).
 *  A new object on every publish. Never mutated after publishing. */
export interface SpaceFrame {
  scene: SceneModel
  camera: SpaceCamera                    // the camera the basis was built from
  basis: DrawViewBasis
  projected: ReadonlyMap<string, ProjectedMark>   // keyed by mark.id
}

export interface HitTargetRegistry {
  /** A STABLE callback per mark id: (el) => el ? set(id, el) + onAttach(id, el) : delete(id).
   *  The cached callback is dropped when it receives null. */
  refFor(markId: string): (el: HTMLElement | null) => void
  get(markId: string): HTMLElement | undefined
  entries(): IterableIterator<[string, HTMLElement]>
  readonly size: number
}
export function createHitTargetRegistry(
  onAttach?: (markId: string, el: HTMLElement) => void,
): HitTargetRegistry

/** Writes el.style.transform = hitTargetTransform(frame?.projected.get(markId)?.screen). With no frame, it writes nothing. */
export function applyHitTransform(frame: SpaceFrame | null, markId: string, el: HTMLElement): void

export interface SpaceTransformLoopOptions {
  host: HTMLElement                                  // viewport = host.clientWidth || 1, host.clientHeight || 1
  registry: HitTargetRegistry
  cameraRef: { readonly current: SpaceCamera }
  frameRef: { current: SpaceFrame | null }           // written by the loop, read by everyone else
  source: SpaceFrameSource | null                    // null = publish staticSceneRef.current as-is
  staticSceneRef: { readonly current: SceneModel }
  /** Called when the published camera (by identity) or viewport size differs from the last call, including the first publish.
   *  Never called merely because a frame passed. */
  onViewChange?: (basis: DrawViewBasis) => void
}
export interface TransformLoopHandle { stop(): void; refresh(): void }
export function startSpaceTransformLoop(options: SpaceTransformLoopOptions): TransformLoopHandle

/** Mounts the loop while `enabled && host`. Returns a STABLE control whose refresh() is a no-op while the loop is stopped. */
export function useSpaceTransformLoop(
  options: Omit<SpaceTransformLoopOptions, 'host'> & { host: HTMLElement | null; enabled: boolean },
): { refresh(): void }
```

### 6.2 What one frame does

A `frame()` runs these steps in order, inside **one `try/catch`**:

1. **Build the scene.**
   - With a `source`: `scene = buildSceneModel({ ...source.inputsRef.current, worldTimeMs: source.clock.now() })`.
     This is **the only per-frame `buildSceneModel` call in the view**. If
     `inputsRef.current` is null, skip to step 7.
   - With no `source`: `scene = staticSceneRef.current`.
2. `camera = cameraRef.current`, then `basis = viewBasisOf(camera, { width: host.clientWidth || 1, height: host.clientHeight || 1 })`.
   This is the **only `viewBasisOf` call in the view.**
3. `projected = new Map(projectMarks(scene, basis).map((p) => [p.mark.id, p]))`.
4. For every `[id, el]` in the registry:
   `el.style.transform = hitTargetTransform(projected.get(id)?.screen)`. A
   registered element whose mark is not in this frame goes off-screen. The
   loop MAY skip a write whose string has not changed since that element's
   previous write.
5. `frameRef.current = { scene, camera, basis, projected }`.
6. If `camera !== lastCamera` or the width or height changed, call
   `onViewChange(basis)` and remember them.
7. `catch`: run `console.warn('[space] transform frame failed', err)` **once
   per loop lifetime**, then continue. A throw must never escape an
   animation-frame callback, because no React error boundary can reach it.
   `SpaceStage.renderer.test.tsx`'s poisoned `scene.marks` makes every static
   frame throw.

Scheduling:
- `startSpaceTransformLoop` runs **one frame synchronously** before it
  requests the first `requestAnimationFrame`. Each rAF callback runs `frame()`
  and then re-requests.
- `stop()` cancels the pending rAF.
- **`refresh()` re-runs steps 2–6 synchronously on the last built scene.**
  It never calls `buildSceneModel`. If no scene has been built yet it runs a
  full `frame()`.

**Why the synchronous first frame and `refresh()`.** Chip membership, focus
reframing and point picks all read the published frame (Decision 7: one
basis). Without these two properties:
- every existing test that queries a chip straight after `render()`, or picks
  straight after a camera input, would see a stale or absent basis;
- a real click in the ≤16 ms after a camera change would unproject through
  the previous camera.

With them:
- the published basis is current by the end of the commit that changed the
  camera (`SpaceStage` calls `refresh()` from a `useLayoutEffect` on
  `[camera]`, §7);
- eight of the nine at-risk migrations counted in 1.1 fall away (rulings
  file, kickoff sizing);
- `buildSceneModel` still runs **exactly once per animation frame**, as
  design Decision 3 requires. A camera change triggers a re-projection, not
  a rebuild.

### 6.3 What the loop never does

- It writes no React state per frame. `onViewChange` fires only on a camera or
  viewport change, and a camera change is already a render.
- It writes no `left`/`top`, and it positions no contact or sighting ghost.
  Those keep their React-written `left`/`top` from the coarse scene (m20).
  Only bodies, lane gates and own fleets are registered.
- It never reads GL state. It is not gated on the renderer constructing.
  It runs whenever `enabled` is true, which is `SpaceStage`'s `available`.
  So the fail-soft path (probe live, renderer threw) still gets positioned
  targets and chips (Decision 7).

---

## 7. `SpaceStage.tsx` (tasks 4.2, 4.3, 4.3a, 4.5, 4.6, 4.8, 4.9)

### 7.1 Props

`SpaceStageProps` stays as it is except for:

```ts
  /** The COARSE world time (design Decision 6). Drives data-draw-world-time only. Name unchanged. */
  worldTime: number
  /** Required key, nullable value (the `scale` prop's forcing-function precedent).
   *  Non-null: the loop builds each frame's scene at clock.now() from the inputs ref.
   *  Null: the loop publishes the `scene` prop as-is (a static scene; tests only). */
  frameSource: SpaceFrameSource | null
```

`scene` stays. It is the **coarse** scene, and React renders the target
*set*, labels, tab order, aria, contacts, ghosts and fleet facts from it.

### 7.2 Internals, in order of appearance

- `frameRef = useRef<SpaceFrame | null>(null)`.
- `cameraRef.current = camera` and `staticSceneRef.current = scene`, both
  written during render, following the file's existing ref precedent.
- `registry = useState(() => createHitTargetRegistry((id, el) => applyHitTransform(frameRef.current, id, el)))[0]`.
  A newly mounted target is placed from the last frame in the same commit, so
  it never flashes at the origin.
- `const [viewBasis, setViewBasis] = useState<DrawViewBasis | null>(null)`.
- `const loop = useSpaceTransformLoop({ enabled: available, host, registry, cameraRef, frameRef, source: frameSource, staticSceneRef, onViewChange: setViewBasis })`.
- `useLayoutEffect(() => loop.refresh(), [camera, loop])`.
- **Deleted:** the `viewport` and `basis` memos (`:172-176`).
- **Draw stamp (task 4.5, Decision 6).** `drawWorldTime` state and
  `setDrawWorldTime` both stay. The write becomes a **render-phase state
  adjustment**:
  `if (available && drawWorldTime !== worldTime) setDrawWorldTime(worldTime)`.
  This is React's sanctioned "adjust state when a prop changes" pattern: it
  re-runs this render before commit, with no second commit. The
  availability guard survives as the `available &&` condition. See finding
  F1 for why this is not an effect.
- **`onFirstFrame` stays on the React side** (Decision 6), as
  `useEffect(() => { if (!available) return; onFirstFrame?.() }, [available, onFirstFrame])`.
  It is not threaded to either loop.
- **`pickAt`** reads `frameRef.current`. With no frame, it returns
  `undefined` and `finishGesture` does not call `onSelect`. Otherwise the
  plane point is
  `unprojectToViewPlane(x, y, frame.basis, frame.camera.target)`. The mark
  list stays `[]` (Decision 8; task 4.4 is dropped).
- **Pan by pixels** uses
  `{ width: frame.basis.widthPx, height: frame.basis.heightPx }` from
  `frameRef.current`. With no frame, the move is skipped.
- **Focus reframe (task 4.9).** `onFocusMark(id)` sets `focusedMarkId`, then
  reads `live = frameRef.current?.projected.get(id)`. If `live` exists and
  `!live.screen.onScreen`, it calls `reframeOn(live.mark.position)`.
  - The **off-screen chip** click and touch reframe to
    `frameRef.current?.projected.get(id)?.mark.position ?? mark.position`.
  - Both read the same live ref `pickAt` reads. Nothing reframes to a
    coarse-rendered position when a live one exists.

### 7.3 `SpaceLayers`

- **Props removed:** `basis` and `viewport`. **Props added:**
  `viewBasis: DrawViewBasis | null` and `registry: HitTargetRegistry`.
  `onFocusMark` becomes `(id: string) => void`.
- **Membership (task 4.6).** When `viewBasis` is set, SpaceLayers computes
  `projected = projectMarks(scene, viewBasis)`, from the coarse scene and the
  published basis. `offScreen` is the pickables with `!screen.onScreen`.
  - While `viewBasis` is null, no mark is off-screen and no chip is offered
    (Decision 7, M11). SpaceLayers still reads `scene.marks` in render, which
    is what keeps the canvas region's error boundary containing a throw.
  - This recomputes on every coarse render (the parent passes a new `scene`
    each second) and on every camera or viewport change (`setViewBasis`).
- **Body and gate hit buttons** (`body-hit-*`) and **fleet buttons**
  (`fleet-mark-*`):
  - Each gets `ref={registry.refFor(mark.id)}`.
  - The `style` prop carries no position at all: `{ width: 24, height: 24 }`
    for body and gate buttons, and nothing extra for fleet buttons, which keep
    `h-5 w-5`.
  - className **drops** `-translate-x-1/2 -translate-y-1/2`. Those classes
    set the CSS `translate` property, which composes with `transform` and
    would centre the element twice. className **adds** `left-0 top-0`.
  - React never writes `transform`, `translate`, `left` or `top` on these
    elements. That is the one-writer-per-element rule.
  - Elements are keyed by `mark.id`, never by position, and never replaced.
- **Contacts and sighting ghosts are unchanged.** They keep React-written
  `left`/`top` from `projectMarks(scene, viewBasis)` (0 while `viewBasis` is
  null) and their translate classes.

---

## 8. `webgl/SpaceWorld.tsx` (task 4.2)

```ts
export interface SpaceWorldProps {
  canvas: HTMLCanvasElement
  frameRef: { readonly current: SpaceFrame | null }   // replaces `scene` AND `camera`
  extent: number
  actingFleetId?: string | null
  onFirstFrame?: () => void
}
```

`draw()` reads `const frame = frameRef.current`.
- If there is no frame yet, it renders nothing, does not announce, and
  re-requests.
- Otherwise:
  - `renderer.setSize(frame.basis.widthPx, frame.basis.heightPx, false)`, with
    `view.aspect` taken from the same values;
  - `view.position` = `basis.eye`, `view.up` = `basis.up`,
    `view.lookAt(frame.camera.target)`;
  - the `sync*` helpers read `frame.scene`, and `actingRef` is unchanged;
  - after it renders, it announces the first frame.

`sceneRef` and `cameraRef` are deleted. **The GL loop never calls
`buildSceneModel` or `viewBasisOf`.** It keeps its own rAF, so there are two
loops (Decision 3). `SpaceStage` passes `frameRef={frameRef}` and still does
not pass `onFirstFrame`.

---

## 9. The two views

### 9.1 `SystemSpaceView.tsx` (tasks 3.3, 3.3a, 3.8, 4.2)

- `const clock = useWorldClock(serverWorldTime, clockScale)`, with
  **`clockScale`** (the `?? 1` chain) and never `servedScale` (task 3.3).
  `const worldTime = useCoarseWorldTime(clock)` comes **immediately after**
  (see §2). Both replace `:426-428`.
- `worldTimeRef` is deleted. Its reads at `:512`, `:515` and `:595` become
  `clock.now()`.
- **`ScanSweepWatcher` (task 3.3a):**
  - The prop `worldTimeRef: MutableRefObject<number>` becomes
    `clock: WorldClock`.
  - `:182` reads `clock.now()`.
  - `clock` joins the dependency array at `:189`. It is stable, so the
    `eslint-disable` line stays only for `runningScan` and `settledScan`.
- `const reducedMotion = useReducedMotion()`, and
  `const sceneLog = useCallback((m, d) => console.warn(\`[space] ${m}\`, d), [])`.
- **The coarse scene memo** is `buildSceneModel({ interior, fleets: here, worldTimeMs: worldTime /* coarse */, reducedMotion, selection, log: sceneLog, sightings })`,
  with deps `[interior.data, here, worldTime, reducedMotion, selection, ghostFeed.sightings, sceneLog]`.
  The *per-frame* value leaves the deps; the coarse one is in them (finding
  F3).
- `sceneInputsRef` is a `useRef<SceneFrameInputs | null>`, assigned during
  render to
  `{ interior: interior.data ?? null, fleets: here, reducedMotion, selection, log: sceneLog, sightings: ghostFeed.sightings }`.
- `const frameSource = useMemo(() => ({ clock, inputsRef: sceneInputsRef }), [clock])`.
- `const handleFirstFrame = useCallback(() => setFirstFrame(true), [])`. The
  inline arrow at `:777` would otherwise re-fire the stage's announce effect
  on every render.
- **What `<SpaceStage>` receives:** `scene={scene}`, `frameSource={frameSource}`,
  `worldTime={worldTime}` and `onFirstFrame={handleFirstFrame}`. Every other
  `worldTime={worldTime}` site is already the coarse value by construction.
  That covers `SpaceCommandPanel`, `FleetActionsPanel`, `ScanControl`,
  `FleetRoster`, `VitalsStrip`, `rosterRowStatus` and `mineRunning` (`:693`).
- `data-world-time={String(Math.round(worldTime))}` stays on the sr-only
  `space-world-clock` span. The value is now coarse.

### 9.2 `GalaxyView.tsx` (task 3.4, view half)

```ts
const { data: myFleets, scale: envelopeScale, worldTime: envelopeWorldTime } = useMyFleets({ enabled: !isStartArea })
const servedScale = envelopeScale ?? myFleets?.[0]?.scale
const servedWorldTime = envelopeWorldTime ?? myFleets?.[0]?.worldTime ?? galaxy?.worldTime
const clock = useWorldClock(servedWorldTime, servedScale)
const coarse = useCoarseWorldTime(clock)
const worldTime = clock.hasReading() ? coarse : (servedWorldTime ?? 0)   // the hold (B5)
// <FleetRoster worldTime={worldTime} scale={servedScale} … />   (was: myFleets?.[0]?.scale)
```

The roster's formatting scale and the clock's projection scale are now the
same value, which is what the scenario *runs at the served scale* asserts.
While no scale has been served, `hasReading()` stays false, the coarse tick is
a no-op, and the roster sees the raw last-served instant. That is the
"holds" scenario. For why the envelope's `worldTime` comes first, see
finding F6.

---

## 10. Test seams: how the SDET writes each red test

**Import state.** Red tests import `@/lib/client-clock`,
`@/hooks/use-reduced-motion` and `./space-transform-loop` before those
modules exist. A failed import is an acceptable red.

1. **Driving animation frames.**
   - Setup: `vi.useFakeTimers()`. Under vitest 3.2.7 the default set fakes
     `requestAnimationFrame`, `cancelAnimationFrame` and `performance`.
     `wallClock()` reads the faked `performance.now()`, so `clock.now()`
     advances in lockstep with fake time.
   - One frame: `act(() => { vi.advanceTimersToNextFrame() })`.
   - A span: `await act(async () => { await vi.advanceTimersByTimeAsync(ms) })`.
   - Teardown: `vi.useRealTimers()` in `finally`/`afterEach`.
   - Under fake timers:
     - **do not use RTL `waitFor`/`findBy*`**, because they poll on the
       faked timers;
     - drive user input with
       `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.
   - Fake time does not move between a frame callback and the next assertion.
     So a test that reads `clock.now()`, or `performance.now()`, right after a
     frame sees exactly the instant that frame built at.
2. **Counting renders.**
   - Wrap the view in `<React.Profiler id="view" onRender={onRender}>` with
     `onRender = vi.fn()`. A render is **one `onRender` call**, which is one
     commit of anything in the view's tree. That is the spec's "the view's
     component tree has rendered".
   - **Settle before counting.** Mount, then
     `await act(async () => { await vi.advanceTimersByTimeAsync(COARSE_TICK_MS) })`.
     This lands the dynamic `SpaceWorld` import (which returns early under
     jsdom), the Suspense reveal, the availability and first-frame callbacks,
     and the first coarse tick at exactly t = 1000.
   - Then `onRender.mockClear()` and run the window.
   - For the frames-only tests (2.1, 3.4a), 10 frames run from t = 1000 to
     1160, before the next tick at 2000.
   - For the two-second tests (2.2, 3.4b), read `data-raw` as R0, advance
     2000 ms (ticks at 2000 and 3000), read R1, and assert
     `R0 − R1 === 2000 × scale` with at most 3 renders.
3. **Observing a hit target's position.**
   - Read `screen.getByTestId('fleet-mark-<id>' | 'body-hit-<id>').style.transform`.
   - The expected value (task 4.3b) is
     `hitTargetTransform(projectMarks(buildSceneModel({ ...inputs, worldTimeMs: t }), viewBasisOf(camera, { width: W, height: H })).find((p) => p.mark.id === id)?.screen)`.
     `camera` is `JSON.parse(region.dataset.camera!)`; JSON round-trips a JS
     number exactly.
   - At `SpaceStage` level the SDET may pass a hand-rolled `WorldClock`
     whose `now()` returns a number the test controls, instead of relying on
     fake time.
   - **Stub the viewport.** `HTMLElement.prototype.clientWidth/clientHeight`
     getters, as the existing suites already do. Otherwise the basis is 1×1,
     every mark is off-screen, and every transform is the constant sentinel.
     That would make 2.1's "position changed" red for the wrong reason.
4. **Spying on the frame build (2.5).**
   - Mock the module with a passthrough:
     `vi.mock('./space-scene', async (importOriginal) => { const a = await importOriginal<typeof import('./space-scene')>(); return { ...a, buildSceneModel: vi.fn(a.buildSceneModel) } })`.
     The loop and the view import the same module id, so both are spied.
   - **In a frames-only window, every call is a loop call**, because the
     coarse memo cannot rebuild without a render. So "exactly N calls for N
     frames" is also assertable.
   - Read the results through `mock.calls[i][0].reducedMotion` and
     `mock.results[i].value` (`decorativeTimeMs`, and `marks[].position` by
     id).
5. **Capturing the registry (4.3a).**
   - Wrap the factory the same way:
     `vi.mock('./space-transform-loop', async (importOriginal) => { const a = await importOriginal<…>(); return { ...a, createHitTargetRegistry: vi.fn((...args) => { const r = a.createHitTargetRegistry(...args); registries.push(r); return r }) } })`.
   - Assert on `registries[0].size`. Each `SpaceStage` mount creates exactly
     one registry.
6. **Per-test `matchMedia` with a working listener (2.5, 3.8).**
   - Use `vi.spyOn(window, 'matchMedia')`. Do **not** call `.mockImplementation`
     on the shared `vi.fn`: that persists across tests, and vitest 3's
     `restoreAllMocks` does not reset it. Restore the spy with `mockRestore()`
     in `afterEach`.
   - For `REDUCED_MOTION_QUERY` the spy returns **one** list object:
     `{ matches, media, onchange: null, addEventListener(t, l), removeEventListener(t, l), addListener, removeListener, dispatchEvent }`,
     backed by a real `Set` of listeners. Any other query falls through to
     the shared stub.
   - To flip the preference: set `mql.matches = next`, then call every
     listener with `{ matches: next, media }`, all inside `act`.
   - Expose the listener count, so a test can assert that unmount removed the
     listener.
7. **Visibility (3.7).**
   - Stub the state with
     `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })`
     and dispatch `document.dispatchEvent(new Event('visibilitychange'))`
     inside `act`. Restore with `delete (document as any).visibilityState`.
   - Inject the wall clock: `createWorldClock(() => wall.t)`, anchor it,
     `renderHook(() => useCoarseWorldTime(clock))`, set `wall.t += 60_000`,
     go hidden then visible, and assert the value equals `clock.now()`.
     Fake timers are not advanced.
8. **Console diagnostics (2.3).**
   - Use `vi.spyOn(console, 'error')`. The setup file wraps `console.error`,
     and the spy sits on top of that wrapper.
   - Match `/Maximum update depth|nested update/i` against `String(call[0])`.
   - Run at least 120 frames. **Record the pre-fix red** as task 2.3
     requires. If jsdom plus `act` cannot produce the diagnostic on the
     pre-fix tree, that is a dispute for the orchestrator. The fix is not to
     weaken the test.
9. **Fixtures.**
   - The burning fleet for 2.1/2.2/2.5 needs `Burn.Curve` with **at least two
     control points** and `DepartMs < T0 < ArriveMs`. `SystemSpaceView.test.tsx`'s
     `burningFleet()` has `Curve: []`, so its mark would not move.
   - `feat-body-0` (`periodMs: 18591`) also moves every frame.
   - The GalaxyView hold (3.4d) is a `useMyFleets` mock with no `scale`
     anywhere: `{ data: [fleetWithoutScale] }`. The served-scale cases
     (3.4b, 3.4c) mock `{ data: [f], scale: S, worldTime: W }`.
10. **Contacts in 2.5 (finding F2).** Contacts never advance, because they sit
    at their served position. Assert their position is **unaffected by the
    preference**: equal to the same build with `reducedMotion: false`. Do not
    assert that it advances.

### 10.1 Test files and what goes in each

| File | Owner | Tasks |
|---|---|---|
| `components/space/SystemSpaceView.render-loop.test.tsx` NEW | SDET | 2.1, 2.2, 2.3, 2.5. Also 3.3's new `data-world-time` coarse assertion (the proposal notes nothing asserts it today) and 3.6's second half (a frame loop before any served reading renders without error). **SpaceStage is real here.** Copy `SystemSpaceView.test.tsx`'s data-source mocks, and **not** its `./SpaceStage` mock |
| `components/space/SpaceStage.transform-loop.test.tsx` NEW | SDET | 2.4, 4.3a, 4.3b, 4.6 (the viewport-edge crossing: rerender with a new coarse `scene` to stand in for the tick, or drive it through SSV in the file above; the SDET chooses), 4.8 (a resize via the `clientWidth` getter, then a frame, then a point pick equal to `unprojectToViewPlane(…, viewBasisOf(camera, newSize), target)`), 4.9 |
| `components/space/space-transform-loop.test.ts` NEW | SDET | Loop unit tests: synchronous first frame; one build per frame; `refresh()` builds nothing; `onViewChange` only on a camera or size change; a thrown frame is contained and warned once; `stop()` cancels; registry `refFor` is stable and deletes on null |
| `components/space/space-projection.test.ts` extended | SDET | 4.1: `projectMarks` cases, plus the `hitTargetTransform` on-screen, off-screen, behind-eye and undefined cases |
| `lib/client-clock/index.test.tsx` NEW | SDET | 3.1 (the two `projectWorldTime` cases, moved verbatim), 3.2, 3.6 (unit half), 3.7 |
| `hooks/use-reduced-motion.test.tsx` NEW | SDET | 3.8 |
| `components/galaxy/GalaxyView.render-loop.test.tsx` NEW | SDET | 3.4a, 3.4b, 3.4c, 3.4d. Copy `GalaxyView.test.tsx`'s mocks, **without** a clock mock |
| `components/galaxy/GalaxyView.test.tsx` | SDET | Delete line 163's `use-world-time` mock. The new module has no rAF, so there is nothing to stub (finding F10). The "a live ETA" test already allows a small tolerance |
| `hooks/use-world-time.test.tsx` | SDET | Delete it after its pure tests have moved (3.1, 3.5). Its `useWorldTime` cases are superseded by the §2 hook tests |
| `components/space/SystemSpaceView.test.tsx:821` | SDET | Reword the comment so the 3.5 grep is clean. No assertion changes |
| `lib/services/fleet-service.test.ts`, `hooks/use-fleets.test.tsx` | SDET | §4 migrations |

**Migrating the 1.1 sites (task 4.7). Every moved test keeps its scenario
name in its title.**
- The **16 `<SpaceStage>` render sites** gain `frameSource={null}`, applied
  in each file's `stage()` helper where there is one.
- The **11 `<SpaceWorld>` sites** replace `scene={s} camera={c}` with
  `frameRef={{ current: { scene: s, camera: c, basis: viewBasisOf(c, { width: 1200, height: 900 }), projected: new Map(projectMarks(s, viewBasisOf(c, { width: 1200, height: 900 })).map((p) => [p.mark.id, p])) } }}`.
  Use a local `frameOf(s, c)` helper. The eye-placement test's
  `lookAt === camera.target` assertion holds as written.
- *Focus survives the view's animation frames* is restated as rAF-driven
  (task 2.4), with the old rerender loop removed.
- Nothing else in the eight files changes behaviour. That includes both
  draw-stamp assertions: the render-phase stamp sets `4242` and `999999`
  during render.

---

## 11. The DOM contract: stable ids and attributes

**No new `data-testid` values.** The existing ones keep their meaning:

| Id | What it is now |
|---|---|
| `space-world-clock` | sr-only span. `data-world-time` = `Math.round(coarse)`. `data-scale` = `clockScale`, unchanged |
| `space-canvas-region` | `data-draw-world-time` = the coarse value, frozen while unavailable. `data-camera` unchanged |
| `body-hit-<id>` | body and gate targets. **Position is only in `style.transform`.** No `left`/`top` inline styles and no translate classes |
| `fleet-mark-<id>` | own-fleet targets. **Position is only in `style.transform`.** No `left`/`top` inline styles and no translate classes |
| `offscreen-<id>` | off-screen chips. Membership comes from `projectMarks(coarse scene, published basis)` |
| `contact-mark-<id>` | contact marks. Unchanged: React `left`/`top` |
| `sighting-mark-<recordId>` | sighting ghosts. Unchanged: React `left`/`top` |
| `fleet-row-eta-<id>`, `vitals-pill-eta` | the countdown figures 2.2 and 3.4b read (`data-raw`) |

The e2e helpers locate by testid and click through Playwright. Targets moved
every frame before this change too, so Playwright's stability wait sees the
same behaviour and no e2e change is expected.

---

## 12. Task → file → owner

| Task | Owner | Production files | Test files |
|---|---|---|---|
| 1.1, 1.2 | architect, **done** | none | none |
| 2.1–2.3, 2.5 | SDET | none | `SystemSpaceView.render-loop.test.tsx` |
| 2.4 | SDET | none | `SpaceStage.transform-loop.test.tsx` |
| 3.1, 3.2, 3.6, 3.7 | dev (prod) / SDET (tests) | `lib/client-clock/index.ts` | `lib/client-clock/index.test.tsx` |
| 3.3, 3.3a | dev | `SystemSpaceView.tsx` | render-loop file (`data-world-time`) |
| 3.4 | dev | `lib/types/fleet.ts`, `lib/services/fleet-service.ts`, `hooks/use-fleets.ts`, `GalaxyView.tsx` | `fleet-service.test.ts`, `use-fleets.test.tsx`, `GalaxyView.test.tsx` (SDET) |
| 3.4a–3.4d | SDET | none | `GalaxyView.render-loop.test.tsx` |
| 3.5 | dev deletes the hook; SDET deletes its test and fixes the `:821` comment | `hooks/use-world-time.ts` | `hooks/use-world-time.test.tsx` |
| 3.8 | dev | `hooks/use-reduced-motion.ts`, `SystemSpaceView.tsx` | `use-reduced-motion.test.tsx` |
| 4.1 | dev | `space-projection.ts` | `space-projection.test.ts` |
| 4.2 | dev | `space-transform-loop.ts`, `SpaceStage.tsx`, `webgl/SpaceWorld.tsx`, `SystemSpaceView.tsx` | `space-transform-loop.test.ts`; SpaceWorld suites (4.7) |
| 4.3, 4.3a, 4.3b, 4.5, 4.6, 4.8, 4.9 | dev | `SpaceStage.tsx`, `space-transform-loop.ts` | `SpaceStage.transform-loop.test.tsx` |
| 4.7 | **SDET**, because tests are immutable to implementers | none | the §10.1 migration list |
| 5.1, 5.2 | dev | none | none |
| 5.3–5.6 | orchestrator (gate, records, archive) | none | none |

---

## 13. Build order: one developer

The dev starts only after the SDET's red suite and the 4.7 migrations are
committed. At every numbered step the tree compiles and the previous steps'
suites stay green.

1. **Clock** (3.1, 3.2, 3.6, 3.7). This step is isolated. Green:
   `lib/client-clock`.
2. **Reduced motion, the hook alone** (3.8, first half). Green:
   `use-reduced-motion`.
3. **Envelope** (3.4, service, hook and types). Consumers compile unchanged,
   because `data` keeps its shape.
4. **`projectMarks` and `hitTargetTransform`** (4.1).
5. **`space-transform-loop.ts` and the registry** (4.2 loop half, 4.3
   infrastructure). Green: the loop unit tests.
6. **`SpaceWorld` to `frameRef`, and `SpaceStage` wiring** (4.2, 4.3, 4.3a,
   4.3b, 4.5, 4.6, 4.8, 4.9). `SystemSpaceView` temporarily passes
   `frameSource={null}`. That static mode is coherent, and still per-frame,
   because SSV still re-renders every frame at this step. Green: every
   `SpaceStage` suite, `SpaceStage.transform-loop`, and both `SpaceWorld`
   suites.
7. **The atomic flip, in `SystemSpaceView`** (3.3, 3.3a, 3.8 threading, 4.2
   inputs):
   - `useWorldClock` and `useCoarseWorldTime` go in;
   - `frameSource` becomes non-null;
   - `onFirstFrame` is stabilised.

   **Do not leave the tree in a state where SSV renders coarsely while
   `frameSource` is null.** That state is the stepping picture design Risk 1
   forbids. Green: `SystemSpaceView.render-loop` and every existing SSV
   suite.
8. **`GalaxyView`** (3.4, view half). Green: both galaxy suites.
9. **Delete the hook** (3.5). Run the grep, excluding `node_modules` and
   `.next`.
10. **Gates** 5.1 and 5.2.

---

## 14. Gates

- **Per task:** tier 1 on the files touched.
- **Per commit:** tiers 0 and 1.
- **Once, at 5.3:** tier 4, the journey at `--repeat-each 20`, in its own
  invocation. It is the only evidence for the navigation clause (Decision 5).
  A green unit suite proves nothing about navigation.

---

## 15. Findings for the orchestrator

- **F1 — the draw stamp is a render-phase adjustment, not an effect.**
  - The conflict: task 4.5 and the proposal ("the state, the effect and its
    guard all stay") keep the stamp write in an effect. That effect is a
    passive-effect `setState`, so every coarse tick costs **two** commits
    (the tick, then the nested stamp commit). Two seconds is two ticks, and
    two ticks are four Profiler renders. That is more than the 3 that task 2.2
    and the scenario *A counting figure advances without a per-frame render*
    allow.
  - What §7.2 does: it keeps the state, the setter, the coarse cadence and the
    availability guard, which is everything Decision 6 names. The write moves
    to render-phase adjustment, with no second commit.
  - **Needed from you:** acknowledge this. If you reject it, the ≤3 bound
    cannot be met by a whole-tree count and the measurement would have to
    change instead. That is a spec-level question, not the dev's.
- **F2 — contacts do not advance under world time.** Task 2.5 says
  "body, fleet, **and contact** positions keep advancing". A contact is
  drawn at its served position and never integrated (`space-scene.ts`;
  design m20). The live *Space View Respects Reduced-Motion Preference*
  (`spec.md:1323-1337`) has the same wording. §10 item 10 has the test assert
  "unaffected by the preference" instead. **For the spec writer:** that
  wording is a baseline-text inaccuracy, a drift candidate, and does not
  block this change.
- **F3 — task 4.2's memo wording.** "Remove `worldTime` from the React-side
  `scene` memo's deps (it builds at the coarse value)" is read as: the
  per-frame value leaves and the coarse value stays. The literal reading
  contradicts its own parenthetical.
- **F4 — up to one frame of skew between the GL picture and the DOM
  targets.**
  - The cause: there are two rAF loops (Decision 3), and their order within
    a frame is fixed by mount order. `SpaceWorld` mounts in the same commit in
    which `SpaceStage`'s host lands, and a child's effects run first. So the
    GL loop can run first and draw the previous frame's published scene.
  - The impact: the picture and targets differ by one frame of motion. That
    is not a regression (today React-positioned targets trail by at least a
    frame), it cannot be seen at 20–24 px target sizes, and no test asserts
    GL-versus-DOM equality.
  - If you want the two exactly frame-coherent, the remedy is for the GL loop
    to draw from a transform-loop frame callback instead of its own rAF. That
    changes Decision 3's "two loops" wording, so it is design authority, and
    it is not taken here.
- **F5 — task 3.5's grep.** `grep -r use-world-time frontend` matches the
  comment at `SystemSpaceView.test.tsx:821`, and it scans `node_modules` and
  `.next`. The SDET rewords the comment, and the check excludes both
  directories.
- **F6 — GalaxyView's served world time.** Task 3.4 writes
  `myFleets?.[0]?.worldTime ?? galaxy?.worldTime`. The contract puts the
  envelope's `worldTime` first, so that the world time and the scale the
  clock anchors to come from the same response.
  - Without it, a requester with no fleets anchors the galaxy read's older
    world time at the wall instant the fleets read lands. It then projects
    behind by the gap between the two reads.
  - This is within 3.4's intent and is not a spec question.
- **F7 — a synchronous first frame and `refresh()` on camera change (§6.2).**
  This is an implementation choice inside Decisions 3 and 7. It keeps
  `buildSceneModel` at once per animation frame, and it removes eight of the
  nine at-risk test migrations counted in 1.1. It is recorded here because it
  changed the sizing narrative I appended to the rulings file.
- **F8 — the SSV-level acceptance tests need a new file.**
  `SystemSpaceView.test.tsx` mocks `SpaceStage` at its seam, so 2.1, 2.2, 2.3
  and 2.5 need a sibling file with a real stage (§10.1). The artifacts are
  unchanged by this.
- **F9 — task 2.3's pre-fix red is not guaranteed under jsdom.** React's
  nested-update counter under `act` and fake timers may not trip the way it
  does in a real browser. If the SDET cannot record the pre-fix red, it
  reports that as 2.3's own rule requires, and does not weaken the test.
  Treat this as a risk, not a defect.
- **F10 — the `GalaxyView.test.tsx` mock is deleted, not repointed.** Task 3.4
  says to "update GalaxyView.test.tsx's mock to the new module". The new
  module has no rAF, so there is nothing to stub, and the contract deletes the
  mock line instead. This is harmless.

## 16. OPEN questions

**None.** Nothing in this kickoff needed a new product decision. Everything
settled above either follows from Decisions 1–8 and the four USER RULINGs, or
is an implementation choice inside them. F1 is the one place where I need an
explicit acknowledgement before the SDET locks task 2.2's measurement.

## 17. Out of scope: do not drift into these

- Wiring `pickAt`'s mark list (task 4.4 is dropped, per Decision 8).
- Any "pause during navigation" mechanism.
- Splitting `SystemSpaceView`.
- Re-testing the two sibling flake defects, which is observation only, at
  5.4.
- Frame-exact GL/DOM coherence (F4).
- Extending the shared WebGL fake in `vitest.setup.ts`, which was rejected as
  option A.
