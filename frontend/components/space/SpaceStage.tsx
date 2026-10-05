'use client'

// SpaceStage — the space view's interactive canvas region (openspec change
// `build-production-space-view`, `system-space-view`: *Space View Picking
// Resolves to the Body, Lane Gate, or Point Under the Pointer*, *Body,
// Lane-Gate, and Point Selection Is Keyboard-Operable*, *Space View Camera
// Orbit, Pan, and Zoom* and its touch/keyboard/recenter siblings,
// *Off-Screen Bodies and Lane Gates Are Reachable by Pointer and Touch*,
// *Camera Controls Are Inert While the Space View Is Unavailable*).
//
// It composes three things and owns nothing GL:
//
//   SpaceCanvas   the guarded <canvas> + the shared renderer notices
//   SpaceWorld    the GL scene, dynamically imported (never on the SSR path)
//   SpaceLayers   the DOM hit targets, camera controls and affordances
//
// WHY THE LAYERS ARE A SEPARATE COMPONENT. They are the only place
// `scene.marks` is read, and they render INSIDE `CanvasRegionBoundary`, so a
// throw while building the drawn state is contained to this region instead
// of taking the surrounding panels down with it.
//
// CAMERA STATE LIVES HERE, and survives everything except a change of
// system: a selection change, a realtime refetch landing new positions, and
// every animation frame leave it exactly as the player left it. A new
// `systemId` is a new view, and resets it to the default framing with no
// transition.

import dynamic from 'next/dynamic'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Figure } from '@/components/figure/Figure'
import { formatByUnit, formatInstant, instantScaleLabel } from '@/lib/format'
import { unprojectToViewPlane, type DrawVec3, type DrawViewBasis } from '@/lib/space/draw'
import { SpaceCanvas } from './SpaceCanvas'
import { projectMarks } from './space-projection'
import {
  advanceDrag,
  atOrbitLimit,
  atPanLimit,
  atZoomLimit,
  beginDrag,
  clampCamera,
  defaultCamera,
  isGesture,
  orbitByPixels,
  orbitBySteps,
  panByPixels,
  panBySteps,
  pickRadius,
  touchDistance,
  zoomByPinch,
  zoomBySteps,
  zoomByWheel,
  type DragTracker,
  type SpaceCamera,
} from './space-camera'
import { CONSOLE_DOCK_LANE_CAMERA } from '@/lib/console-dock-layout'
import { resolvePick, type PickMark, type SpaceSelection } from './space-selection'
import type { SceneMark, SceneModel } from './space-scene'
import {
  applyHitTransform,
  createHitTargetRegistry,
  useSpaceTransformLoop,
  type HitTargetRegistry,
  type SpaceFrame,
  type SpaceFrameSource,
} from './space-transform-loop'

// three needs a GL context, so the world stays off the SSR path entirely.
const SpaceWorld = dynamic(() => import('./webgl/SpaceWorld').then((m) => m.SpaceWorld), {
  ssr: false,
})

/** The screen sentinel every mark reads while no basis has been published
 * yet (task 4.6, M11) — `x`/`y` are non-finite so the existing `screen.x ||
 * 0` idiom the contacts/sighting layers already use degrades to `0`, and
 * `onScreen: false` never counts toward off-screen membership (that is
 * handled separately, at zero marks, while `viewBasis` is null). */
const NO_BASIS_SCREEN = { x: NaN, y: NaN, depth: 0, onScreen: false } as const

export interface SpaceStageProps {
  systemId: string
  scene: SceneModel
  /** The interior's served continuous extent — every camera figure scales off it. */
  extent: number
  worldTime: number
  /**
   * The mounting view's served world-clock scale (add-figure-formatting,
   * design.md's un-defaulted-`servedScale` decision) — `undefined` when the
   * mount has not yet received one. Every duration/stamp figure this stage
   * renders (the fleet-facts arrival, the ghost's asOf labels) reads
   * `figure-formatting`'s absent form rather than assuming scale 1
   * (RULING 8/19).
   *
   * Required key, nullable value (contract §6) — a forcing function so a
   * mount site cannot silently omit it and fall back to an assumed scale.
   */
  scale: number | undefined
  selection: SpaceSelection | null
  onSelect?: (selection: SpaceSelection | null) => void
  onAvailabilityChange?: (available: boolean) => void
  onFirstFrame?: () => void
  /**
   * The currently highlighted sighting ghost's RECORD id (never a mark id) —
   * add-scan-and-sightings-surface, `system-space-view`: *A Log Row and Its
   * Ghost Address the Same Record By Its Served Id*. A ghost is highlighted,
   * never selected: this is separate, additional state, held alongside
   * `selection` rather than inside it.
   */
  highlightedGhostId?: string | null
  /** Activating a ghost reports its record id here — never a selection. */
  onHighlightGhost?: (recordId: string | null) => void
  /**
   * The fleet the view is commanding. Its mark is ringed, and activating
   * ANY own fleet's mark reports that fleet's id here — a fleet is never a
   * member of `selection` (it is not a burn target), so this is separate
   * state held beside it, exactly as the ghost highlight is.
   */
  actingFleetId?: string | null
  onActivateFleet?: (fleetId: string) => void
  /**
   * The transform loop's clock + inputs source (openspec change
   * `fix-world-time-render-loop`, impl contract §7.1). Required key,
   * nullable value: non-null means the loop builds each frame's scene at
   * `clock.now()` from the inputs ref; `null` means the loop publishes the
   * `scene` prop as-is (a static scene — tests only).
   */
  frameSource: SpaceFrameSource | null
}

const CAMERA_CONTROL_ATTR = 'data-space-camera-control'
const AFFORDANCE_ATTR = 'data-space-affordance'

const BUTTON =
  'pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-white/15' +
  ' bg-black/60 font-mono text-sm text-zinc-300 backdrop-blur transition-colors' +
  ' hover:bg-white/[0.16] hover:text-white' +
  ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'

const LIMIT_MESSAGE = {
  zoom: 'The camera is as close or as far as it goes.',
  pan: 'The camera is at the edge of the system.',
  orbit: 'The camera is as high or as low as it tilts.',
} as const

function selectionAttr(selection: SpaceSelection | null): string {
  if (!selection) return ''
  if (selection.bodyId !== undefined) return selection.bodyId
  return 'point'
}

export function SpaceStage({
  systemId,
  scene,
  extent,
  worldTime,
  scale,
  selection,
  onSelect,
  onAvailabilityChange,
  onFirstFrame,
  highlightedGhostId = null,
  onHighlightGhost,
  actingFleetId = null,
  onActivateFleet,
  frameSource,
}: SpaceStageProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [available, setAvailable] = useState(true)
  const [camera, setCamera] = useState<SpaceCamera>(() => defaultCamera(extent))
  const [drawWorldTime, setDrawWorldTime] = useState(worldTime)
  const [focusedMarkId, setFocusedMarkId] = useState<string | null>(null)
  const [hoveredContactId, setHoveredContactId] = useState<string | null>(null)
  const [hoveredGhostId, setHoveredGhostId] = useState<string | null>(null)
  const [hoveredFleetId, setHoveredFleetId] = useState<string | null>(null)
  const [viewBasis, setViewBasis] = useState<DrawViewBasis | null>(null)

  // A new system is a new view: the framing resets, with no transition, and
  // nothing else resets it. Adjusted during render (never in an effect) so a
  // frame is never painted with the previous system's camera.
  const framingKey = `${systemId}::${extent}`
  const framingRef = useRef(framingKey)
  if (framingRef.current !== framingKey) {
    framingRef.current = framingKey
    setCamera(defaultCamera(extent))
  }

  // THE transform loop's published frame (design.md Decision 3, decided
  // option B) — written by the loop, read by `pickAt`, the pan-by-pixels
  // gesture, and the focus/off-screen-chip reframe (Decision 3, Decision 7).
  const frameRef = useRef<SpaceFrame | null>(null)
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const staticSceneRef = useRef(scene)
  staticSceneRef.current = scene

  // A newly mounted target is placed from the last frame in the same
  // commit (via `applyHitTransform`), so it never flashes at the origin.
  const [registry] = useState<HitTargetRegistry>(() =>
    createHitTargetRegistry((id, el) => applyHitTransform(frameRef.current, id, el)),
  )

  const loop = useSpaceTransformLoop({
    enabled: available,
    host,
    registry,
    cameraRef,
    frameRef,
    source: frameSource,
    staticSceneRef,
    onViewChange: setViewBasis,
  })
  useLayoutEffect(() => {
    loop.refresh()
  }, [camera, loop])

  // Focus bookkeeping for the notice's focus claim. Cleared only when focus
  // lands somewhere else — never by an unmount, which in most engines moves
  // focus to nothing rather than firing a readable focusout.
  const focusInsideRef = useRef(false)
  const handleFocusIn = useCallback(() => {
    focusInsideRef.current = true
  }, [])
  const handleFocusOut = useCallback((e: ReactFocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget) focusInsideRef.current = false
  }, [])

  const handleAvailability = useCallback(
    (next: boolean) => {
      setAvailable(next)
      onAvailabilityChange?.(next)
    },
    [onAvailabilityChange],
  )

  // The draw stamp — a RENDER-PHASE state adjustment (React's sanctioned
  // "adjust state when a prop changes" pattern, not an effect: task 4.5,
  // design.md Decision 6, kickoff ruling K1). It advances only while the
  // context is live, so a redraw after a restore is observably taken from
  // the CURRENT world time rather than replayed from the stale one the loss
  // froze — and it costs no second commit the way a passive-effect write
  // would (K1: two commits per coarse tick would blow the ≤3-per-2s bound).
  if (available && drawWorldTime !== worldTime) {
    setDrawWorldTime(worldTime)
  }

  // `onFirstFrame` stays on the React side (design.md Decision 6) — never
  // threaded onto either loop.
  useEffect(() => {
    if (!available) return
    onFirstFrame?.()
  }, [available, onFirstFrame])

  const reframeOn = useCallback(
    (position: DrawVec3) => {
      setCamera((prev) => clampCamera({ ...prev, target: { ...position } }, extent))
    },
    [extent],
  )

  const recenter = useCallback(() => setCamera(defaultCamera(extent)), [extent])

  // --- picking -------------------------------------------------------------

  // Reads the transform loop's published frame — the SOLE basis authority
  // (design.md Decision 7). With no frame yet, returns `undefined` (never
  // `null`, which means "resolved to no selection") and `finishGesture`
  // below does not call `onSelect` at all.
  const pickAt = useCallback(
    (clientX: number, clientY: number, marks: PickMark[]): SpaceSelection | null | undefined => {
      const frame = frameRef.current
      if (!host || !frame) return undefined
      const rect = host.getBoundingClientRect()
      const planePoint = unprojectToViewPlane(
        clientX - rect.left,
        clientY - rect.top,
        frame.basis,
        frame.camera.target,
      )
      return resolvePick({
        screenX: clientX - rect.left,
        screenY: clientY - rect.top,
        // The DOM hit targets already claim a press over a mark, so the
        // pointer path here only ever resolves the point half.
        marks,
        planePoint,
        pickRadius: pickRadius(extent),
      })
    },
    [host, extent],
  )

  // --- pointer gestures ----------------------------------------------------

  interface Gesture {
    tracker: DragTracker
    bodyId: string | null
    secondary: boolean
  }
  const gestureRef = useRef<Gesture | null>(null)
  const pinchRef = useRef<number | null>(null)

  const isControl = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    !!target.closest(`[${CAMERA_CONTROL_ATTR}], [${AFFORDANCE_ATTR}]`)

  const bodyIdUnder = (target: EventTarget | null): string | null =>
    target instanceof Element
      ? (target.closest<HTMLElement>('[data-body-id]')?.dataset.bodyId ?? null)
      : null

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!available || isControl(e.target)) return
    gestureRef.current = {
      tracker: beginDrag(e.clientX, e.clientY),
      bodyId: bodyIdUnder(e.target),
      secondary: e.button === 2,
    }
  }, [available])

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current
      if (!gesture) return
      const { dx, dy } = advanceDrag(gesture.tracker, e.clientX, e.clientY)
      // A gesture that BEGINS over a mark still moves the camera — the mark
      // claims the press only if it turns out to be a click.
      if (!isGesture(gesture.tracker)) return
      if (gesture.secondary) {
        // Pan by pixels reads the LOOP's published viewport (design.md
        // Decision 7) — `SpaceStage`'s own `[host]`-keyed memo is deleted.
        // With no frame published yet, the move is skipped.
        const frame = frameRef.current
        if (!frame) return
        const viewportPx = { width: frame.basis.widthPx, height: frame.basis.heightPx }
        setCamera((prev) => panByPixels(prev, dx, dy, viewportPx, extent))
      } else {
        setCamera((prev) => orbitByPixels(prev, dx, dy))
      }
    },
    [extent],
  )

  const finishGesture = useCallback(
    (clientX: number, clientY: number, marks: PickMark[]) => {
      const gesture = gestureRef.current
      gestureRef.current = null
      if (!gesture || isGesture(gesture.tracker)) return
      if (gesture.bodyId) {
        onSelect?.({ bodyId: gesture.bodyId })
        return
      }
      const picked = pickAt(clientX, clientY, marks)
      if (picked === undefined) return
      onSelect?.(picked)
    },
    [onSelect, pickAt],
  )

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      // Over a DEAD canvas the page must scroll normally: nothing is
      // suppressed and no camera moves.
      if (!available) return
      setCamera((prev) => zoomByWheel(prev, e.deltaY, extent))
    },
    [available, extent],
  )

  // --- touch ---------------------------------------------------------------

  const handleTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (!available || isControl(e.target)) return
      if (e.touches.length >= 2) {
        pinchRef.current = touchDistance(
          { x: e.touches[0].clientX, y: e.touches[0].clientY },
          { x: e.touches[1].clientX, y: e.touches[1].clientY },
        )
        gestureRef.current = null
        return
      }
      const touch = e.touches[0]
      if (!touch) return
      gestureRef.current = {
        tracker: beginDrag(touch.clientX, touch.clientY),
        bodyId: bodyIdUnder(e.target),
        secondary: false,
      }
    },
    [available],
  )

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length >= 2) {
        const next = touchDistance(
          { x: e.touches[0].clientX, y: e.touches[0].clientY },
          { x: e.touches[1].clientX, y: e.touches[1].clientY },
        )
        const previous = pinchRef.current
        pinchRef.current = next
        if (previous) setCamera((prev) => zoomByPinch(prev, previous, next, extent))
        return
      }
      const gesture = gestureRef.current
      const touch = e.touches[0]
      if (!gesture || !touch) return
      const { dx, dy } = advanceDrag(gesture.tracker, touch.clientX, touch.clientY)
      // A single finger ORBITS, exactly as a primary-button drag does — it
      // never zooms; zoom is the two-finger pinch alone.
      if (!isGesture(gesture.tracker)) return
      setCamera((prev) => orbitByPixels(prev, dx, dy))
    },
    [extent],
  )

  const cameraJson = JSON.stringify(camera)

  return (
    <div
      ref={setHost}
      data-testid="space-canvas-region"
      data-camera={cameraJson}
      data-selection={selectionAttr(selection)}
      data-draw-world-time={String(drawWorldTime)}
      // Reframing is immediate: an eased camera move under a player reaching
      // for an off-screen gate is a moving target.
      data-reframe-animated="false"
      className="absolute inset-0"
      style={{ touchAction: 'none' }}
      onFocus={handleFocusIn}
      onBlur={handleFocusOut}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <SpaceCanvas
        onAvailabilityChange={handleAvailability}
        claimFocus={focusInsideRef.current}
        renderWorld={(canvas) => (
          <SpaceWorld canvas={canvas} frameRef={frameRef} extent={extent} actingFleetId={actingFleetId} />
        )}
      >
        <SpaceLayers
          scene={scene}
          camera={camera}
          extent={extent}
          scale={scale}
          viewBasis={viewBasis}
          registry={registry}
          selection={selection}
          focusedMarkId={focusedMarkId}
          hoveredContactId={hoveredContactId}
          hoveredGhostId={hoveredGhostId}
          highlightedGhostId={highlightedGhostId}
          hoveredFleetId={hoveredFleetId}
          actingFleetId={actingFleetId}
          onHoverFleet={setHoveredFleetId}
          onActivateFleet={onActivateFleet}
          onFocusMark={(id) => {
            setFocusedMarkId(id)
            const live = frameRef.current?.projected.get(id)
            if (live && !live.screen.onScreen) reframeOn(live.mark.position)
          }}
          onBlurMark={() => setFocusedMarkId(null)}
          onHoverContact={setHoveredContactId}
          onHoverGhost={setHoveredGhostId}
          onHighlightGhost={onHighlightGhost}
          onSelect={(next) => onSelect?.(next)}
          onCamera={setCamera}
          onRecenter={recenter}
          onReframe={(markId, coarsePosition) => {
            const live = frameRef.current?.projected.get(markId)
            reframeOn(live?.mark.position ?? coarsePosition)
          }}
          onPointerUpCapture={(clientX, clientY, marks) => finishGesture(clientX, clientY, marks)}
        />
      </SpaceCanvas>
      {/* Pointer release and touch end are bound on the region itself so a
          gesture that leaves the element it started on still resolves. */}
      <PointerRelease
        onPointerUp={(x, y) => finishGesture(x, y, [])}
        onTouchEnd={(x, y) => {
          pinchRef.current = null
          finishGesture(x, y, [])
        }}
        host={host}
        enabled={available}
      />
    </div>
  )
}

// PointerRelease binds pointerup/touchend on the region host. They are bound
// imperatively rather than as React props so a release that happens over a
// child which stops propagation still resolves the gesture.
function PointerRelease({
  host,
  enabled,
  onPointerUp,
  onTouchEnd,
}: {
  host: HTMLElement | null
  enabled: boolean
  onPointerUp: (x: number, y: number) => void
  onTouchEnd: (x: number, y: number) => void
}) {
  const upRef = useRef(onPointerUp)
  upRef.current = onPointerUp
  const endRef = useRef(onTouchEnd)
  endRef.current = onTouchEnd

  useEffect(() => {
    if (!host || !enabled) return
    const up = (e: PointerEvent) => upRef.current(e.clientX, e.clientY)
    const end = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      endRef.current(touch?.clientX ?? 0, touch?.clientY ?? 0)
    }
    host.addEventListener('pointerup', up)
    host.addEventListener('touchend', end)
    return () => {
      host.removeEventListener('pointerup', up)
      host.removeEventListener('touchend', end)
    }
  }, [host, enabled])
  return null
}

interface SpaceLayersProps {
  scene: SceneModel
  camera: SpaceCamera
  extent: number
  scale: number | undefined
  /** The transform loop's published basis (design.md Decision 7 addendum,
   * M11) — `null` before the loop's first publish. Membership recomputes
   * whenever this or `scene` changes. */
  viewBasis: DrawViewBasis | null
  /** Each pickable/own-fleet target registers itself here (task 4.3a); the
   * loop reads the registry to write every element's live position. */
  registry: HitTargetRegistry
  selection: SpaceSelection | null
  focusedMarkId: string | null
  hoveredContactId: string | null
  hoveredGhostId: string | null
  highlightedGhostId: string | null
  hoveredFleetId: string | null
  actingFleetId: string | null
  onHoverFleet: (id: string | null) => void
  onActivateFleet?: (fleetId: string) => void
  onFocusMark: (id: string) => void
  onBlurMark: () => void
  onHoverContact: (id: string | null) => void
  onHoverGhost: (id: string | null) => void
  onHighlightGhost?: (recordId: string | null) => void
  onSelect: (selection: SpaceSelection | null) => void
  onCamera: (next: (prev: SpaceCamera) => SpaceCamera) => void
  onRecenter: () => void
  onReframe: (markId: string, coarsePosition: DrawVec3) => void
  onPointerUpCapture: (clientX: number, clientY: number, marks: PickMark[]) => void
}

function SpaceLayers({
  scene,
  camera,
  extent,
  scale,
  viewBasis,
  registry,
  selection,
  focusedMarkId,
  hoveredContactId,
  hoveredGhostId,
  highlightedGhostId,
  hoveredFleetId,
  actingFleetId,
  onHoverFleet,
  onActivateFleet,
  onFocusMark,
  onBlurMark,
  onHoverContact,
  onHoverGhost,
  onHighlightGhost,
  onSelect,
  onCamera,
  onRecenter,
  onReframe,
}: SpaceLayersProps) {
  // THE ONE READ of `scene.marks`, inside the canvas region's error
  // boundary: a throw while building the drawn state is contained here.
  const marks = scene.marks

  // Membership recomputes on the coarse tick (a new `scene` each second) and
  // on camera/viewport change (a fresh `viewBasis`) — task 4.6, design.md
  // Decision 7 addendum M11. Before the loop's first publish, `viewBasis` is
  // null: no mark is off-screen and no chip is offered, but this layer still
  // reads `scene.marks` (below), which is what keeps the canvas region's
  // error boundary containing a throw.
  const projected = viewBasis
    ? projectMarks({ marks }, viewBasis)
    : marks.map((mark) => ({ mark, screen: NO_BASIS_SCREEN }))
  const pickables = projected.filter((p) => p.mark.pickable)
  // Bodies first, then lane gates — the tab order the requirement fixes,
  // each group in the scene's own stable order.
  const bodies = pickables.filter((p) => p.mark.kind !== 'gate')
  const gates = pickables.filter((p) => p.mark.kind === 'gate')
  const offScreen = viewBasis ? pickables.filter((p) => !p.screen.onScreen) : []
  const contacts = projected.filter((p) => p.mark.kind === 'contact')
  const sightings = projected.filter((p) => p.mark.kind === 'sighting')
  const fleets = projected.filter((p) => p.mark.kind === 'fleet')

  const panAtLimit = (right: number, up: number): boolean => {
    const next = panBySteps(camera, right, up, extent)
    return (
      next.target.x === camera.target.x &&
      next.target.y === camera.target.y &&
      next.target.z === camera.target.z
    )
  }
  const zoomLimit = atZoomLimit(camera, extent)
  const orbitLimit = atOrbitLimit(camera)
  // camera-orbit's own data-pan-at-limit (impl contract §10.3): the
  // space-separated set of blocked pan directions, computed per render from
  // the SAME panAtLimit helper the deleted camera-pan-* buttons used —
  // never routed through camera-limit-status's single-slot priority chain.
  const blockedPanDirections = (
    [
      panAtLimit(-1, 0) ? 'left' : null,
      panAtLimit(1, 0) ? 'right' : null,
      panAtLimit(0, 1) ? 'up' : null,
      panAtLimit(0, -1) ? 'down' : null,
    ].filter((d): d is string => d !== null)
  ).join(' ')
  const limitMessage = zoomLimit
    ? LIMIT_MESSAGE.zoom
    : atPanLimit(camera, extent)
      ? LIMIT_MESSAGE.pan
      : orbitLimit
        ? LIMIT_MESSAGE.orbit
        : ''

  // A body/gate hit target's ENTIRE placement — the −50%/−50% centring
  // included — is written by the transform loop's `style.transform`, every
  // frame it runs (design.md Decision 3's "one writer per element"). React
  // writes identity, labels, tab order and aria alone, from the coarse
  // scene: no `left`/`top`, no translate class.
  const hitButton = (entry: { mark: SceneMark }) => {
    const { mark } = entry
    return (
      <button
        key={mark.id}
        type="button"
        ref={registry.refFor(mark.id)}
        data-testid={`body-hit-${mark.id}`}
        data-body-id={mark.id}
        aria-label={mark.id}
        aria-pressed={mark.selected}
        className={
          'pointer-events-auto absolute left-0 top-0 rounded-full' +
          ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'
        }
        style={{ width: 24, height: 24 }}
        onFocus={() => onFocusMark(mark.id)}
        onBlur={onBlurMark}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onSelect({ bodyId: mark.id })
        }}
      >
        {focusedMarkId === mark.id && (
          <span
            data-testid="hit-focus-ring"
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-sky-400"
          />
        )}
      </button>
    )
  }

  return (
    <>
      {/* --- camera controls: FIRST in the tab order, and gone entirely
              while the canvas is unavailable (this whole layer is).
              SHRUNK to exactly four sibling cells (openspec change
              `add-vitals-strip`, `system-console`/`system-space-view`
              MODIFIED *Space View Camera Is Keyboard-Operable*, impl
              contract §10, RULING 10/23): `camera-orbit`, `camera-zoom-in`,
              `camera-zoom-out`, `camera-recenter`. The eight
              `camera-orbit-*`/`camera-pan-*` buttons are gone — discrete
              pointer orbit is already served by canvas drag-to-orbit, and
              keyboard pan moves onto `camera-orbit`'s own `Shift`+arrow
              binding below. The wrapper's own pre-existing tabIndex/
              onKeyDown (bare-arrow orbit) is UNCHANGED — it predates and is
              independent of the four now-deleted `camera-orbit-*` buttons.
              Re-anchored bottom-right, in the console dock's camera lane. --- */}
      <div
        {...{ [CAMERA_CONTROL_ATTR]: '' }}
        data-testid="space-camera-controls"
        role="group"
        aria-label="System camera"
        tabIndex={0}
        className={`pointer-events-none absolute ${CONSOLE_DOCK_LANE_CAMERA} right-4 grid grid-cols-4 gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400`}
        onKeyDown={(e) => {
          const step: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, 1],
            ArrowDown: [0, -1],
          }
          const s = step[e.key]
          if (!s) return
          e.preventDefault()
          onCamera((prev) => orbitBySteps(prev, s[0], s[1]))
        }}
      >
        {/* camera-orbit — the one focusable cell replacing the four
            camera-orbit-* buttons. Bare arrows orbit; `Shift`+arrow pans,
            with the deleted pan buttons' exact step vectors (Left [-1,0],
            Right [1,0], Up [0,1], Down [0,-1]) and the existing pan bound
            (impl contract §10.2). Both axes' at-limit state live here too
            (§10.3): `camera-orbit-up`/`-down` are gone, so the orbit axis's
            attribute moves onto the element that replaces them, and the pan
            axis's attribute is NEW (never routed through
            `camera-limit-status`'s single-slot zoom>pan>orbit chain, which
            would mask it behind a simultaneous zoom clamp). */}
        <div
          {...{ [CAMERA_CONTROL_ATTR]: '' }}
          data-testid="camera-orbit"
          role="group"
          tabIndex={0}
          aria-label="Orbit the camera with arrow keys; hold Shift and press arrow keys to pan"
          {...(orbitLimit ? { 'data-orbit-at-limit': orbitLimit } : {})}
          {...(blockedPanDirections ? { 'data-pan-at-limit': blockedPanDirections } : {})}
          className={
            'pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-white/15' +
            ' bg-black/60 font-mono text-sm text-zinc-300 backdrop-blur transition-colors' +
            ' hover:bg-white/[0.16] hover:text-white' +
            ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'
          }
          onKeyDown={(e) => {
            const step: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, 1],
              ArrowDown: [0, -1],
            }
            const s = step[e.key]
            if (!s) return
            e.preventDefault()
            // Stop here: the wrapper's OWN bare-arrow onKeyDown (unchanged,
            // for when the wrapper itself is directly focused) would
            // otherwise ALSO fire on the bubbling phase and double-apply
            // the orbit step alongside this cell's own handling.
            e.stopPropagation()
            if (e.shiftKey) {
              onCamera((prev) => panBySteps(prev, s[0], s[1], extent))
            } else {
              onCamera((prev) => orbitBySteps(prev, s[0], s[1]))
            }
          }}
        >
          ⟳
        </div>
        <CameraButton testId="camera-zoom-in" label="Zoom in" onPress={() => onCamera((p) => zoomBySteps(p, 1, extent))} atLimit={zoomLimit === 'min'} glyph="+" />
        <CameraButton testId="camera-zoom-out" label="Zoom out" onPress={() => onCamera((p) => zoomBySteps(p, -1, extent))} atLimit={zoomLimit === 'max'} glyph="−" />
        <CameraButton testId="camera-recenter" label="Recenter" onPress={onRecenter} atLimit={false} glyph="⌖" />
      </div>

      {/* select-pan-target-point — moved OUT of the wrapper (impl contract
          §10.1): a selection affordance, not a camera cell, so it does not
          count against "exactly four". Carries CAMERA_CONTROL_ATTR itself,
          since SpaceStage.tsx's own canvas-pick suppression
          (`target.closest('[data-space-camera-control], [data-affordance]')`)
          would otherwise fire both its own selection and the canvas pick on
          one click, now that it is outside the wrapper's subtree. The
          keyboard path to a POINT selection: without it — and without the
          keyboard pan above — a keyboard-only player can only ever name the
          star, the one point every burn solve rejects. */}
      <CameraButton
        testId="select-pan-target-point"
        label="Select the point at the camera's centre"
        onPress={() => onSelect({ point: { ...camera.target } })}
        atLimit={false}
        glyph="◎"
        controlAttr
      />

      <span className="sr-only" role="status" aria-live="polite" data-testid="camera-limit-status">
        {limitMessage}
      </span>

      {/* --- hit targets: bodies, then lane gates --- */}
      <div className="pointer-events-none absolute inset-0">
        {bodies.map(hitButton)}
        {gates.map(hitButton)}
      </div>

      {/* --- contacts: drawn, never pickable, with their SERVED velocity
              displayed rather than integrated --- */}
      <div className="pointer-events-none absolute inset-0">
        {contacts.map(({ mark, screen }) => (
          <div
            key={mark.id}
            data-testid={`contact-mark-${mark.id}`}
            className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/70"
            style={{ left: `${screen.x || 0}px`, top: `${screen.y || 0}px` }}
            onPointerOver={() => onHoverContact(mark.id)}
            onPointerOut={() => onHoverContact(null)}
          />
        ))}
      </div>
      {(() => {
        const shown = contacts.find(({ mark }) => mark.id === hoveredContactId)
        if (!shown?.mark.velocity) return null
        const v = shown.mark.velocity
        const speed = Math.hypot(v.x, v.y, v.z)
        const heading = ((Math.atan2(v.x, -v.z) * 180) / Math.PI + 360) % 360
        return (
          <div
            data-testid="contact-facts"
            className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-black/70 px-3 py-2 text-xs text-zinc-200"
          >
            <div>Bearing {heading.toFixed(0)}°</div>
            <div>Speed {speed.toFixed(2)}</div>
          </div>
        )
      })()}

      {/* --- sighting ghosts: frozen, never selected. `data-space-
              affordance` is the WHOLE mechanism that keeps activating one
              from ever becoming a point selection or arming a burn
              (system-space-view "A Ghost Is Not a Member of the Space
              View's Selection, and a Burn Never Consumes One") — without it
              a pointerdown here bubbles to the region and the exhaustive
              picking rule treats it as empty space. --- */}
      <div className="pointer-events-none absolute inset-0">
        {sightings.map(({ mark, screen }) => (
          <button
            key={mark.id}
            type="button"
            {...{ [AFFORDANCE_ATTR]: '' }}
            data-testid={`sighting-mark-${mark.recordId}`}
            data-highlighted={highlightedGhostId === mark.recordId ? 'true' : 'false'}
            aria-label={`Sighting at ${mark.recordId}`}
            className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-400/70 bg-fuchsia-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            style={{ left: `${screen.x || 0}px`, top: `${screen.y || 0}px` }}
            onPointerOver={() => onHoverGhost(mark.id)}
            onPointerOut={() => onHoverGhost(null)}
            onFocus={() => onHoverGhost(mark.id)}
            onBlur={() => onHoverGhost(null)}
            onClick={() => onHighlightGhost?.(mark.recordId ?? null)}
          >
            {mark.asOf !== undefined && (
              <GhostAsOfLabel recordId={mark.recordId ?? mark.id} asOf={mark.asOf} scale={scale} />
            )}
          </button>
        ))}
      </div>
      {(() => {
        const shown = sightings.find(({ mark }) => mark.id === hoveredGhostId)
        if (!shown) return null
        const v = shown.mark.velocity
        const speed = v ? Math.hypot(v.x, v.y, v.z) : 0
        const heading = v ? ((Math.atan2(v.x, -v.z) * 180) / Math.PI + 360) % 360 : 0
        return (
          <div
            data-testid="sighting-facts"
            className="absolute left-1/2 top-16 -translate-x-1/2 rounded-md bg-black/70 px-3 py-2 text-xs text-zinc-200"
          >
            <div>
              Observed at{' '}
              <Figure
                raw={shown.mark.asOf}
                unit="world-ms-instant"
                text={formatInstant(shown.mark.asOf, scale)}
                data-testid="sighting-facts-asof"
                title={instantScaleLabel(scale)}
              />
            </div>
            <div>Bearing {heading.toFixed(0)}°</div>
            <div>Speed {speed.toFixed(2)}</div>
          </div>
        )
      })()}

      {/* --- own fleets: an AFFORDANCE, never a selection. Clicking a mark
              makes that fleet the acting one (what the command panels are
              about); hovering or focusing it shows its facts. The
              `data-space-affordance` attribute is what keeps a press here
              from bubbling to the region's exhaustive picking rule, where it
              would read as empty space and become a point selection. --- */}
      <div className="pointer-events-none absolute inset-0">
        {fleets.map(({ mark }) => {
          const acting = mark.id === actingFleetId
          return (
            <button
              key={mark.id}
              type="button"
              ref={registry.refFor(mark.id)}
              {...{ [AFFORDANCE_ATTR]: '' }}
              data-testid={`fleet-mark-${mark.id}`}
              data-acting={acting ? 'true' : 'false'}
              aria-label={`Fleet ${mark.id}`}
              aria-pressed={acting}
              className={
                'pointer-events-auto absolute left-0 top-0 h-5 w-5 cursor-pointer rounded-full' +
                ' border border-emerald-300/40 hover:border-emerald-200/90 hover:bg-emerald-300/10' +
                ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400' +
                (acting ? ' ring-2 ring-emerald-400/70' : '')
              }
              onPointerOver={() => onHoverFleet(mark.id)}
              onPointerOut={() => onHoverFleet(null)}
              onFocus={() => onHoverFleet(mark.id)}
              onBlur={() => onHoverFleet(null)}
              onClick={() => onActivateFleet?.(mark.id)}
            />
          )
        })}
      </div>
      {(() => {
        const shown = fleets.find(({ mark }) => mark.id === hoveredFleetId)
        if (!shown) return null
        return (
          <FleetFacts
            mark={shown.mark}
            nowMs={scene.positionTimeMs}
            acting={shown.mark.id === actingFleetId}
            scale={scale}
          />
        )
      })()}

      {/* --- off-screen reach: pointer AND touch --- */}
      <div className="pointer-events-none absolute inset-0">
        {offScreen.map(({ mark }) => (
          <button
            key={mark.id}
            type="button"
            {...{ [AFFORDANCE_ATTR]: '' }}
            data-testid={`offscreen-${mark.id}`}
            aria-label={`Bring ${mark.id} into view`}
            className={
              'pointer-events-auto absolute left-4 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-[10px] text-zinc-200' +
              ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'
            }
            style={{ top: `${16 + offScreen.findIndex((o) => o.mark.id === mark.id) * 26}px` }}
            onClick={() => {
              onReframe(mark.id, mark.position)
              onSelect({ bodyId: mark.id })
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              onReframe(mark.id, mark.position)
              onSelect({ bodyId: mark.id })
            }}
          >
            {mark.id}
          </button>
        ))}
      </div>

      {/* The selected mark, drawn — including a bare point in vacuum, which
          has no body mark to highlight and no intrinsic outline. */}
      {selection?.point && <span className="sr-only" data-testid="point-selection-mark" />}
    </>
  )
}

/**
 * A sighting ghost's sr-only `asOf` label (`system-space-view`: "A ghost's
 * asOf label reads as a formatted stamp, on the mark and on its facts
 * surface"). The prose prefix is composed into the Figure's own `text`
 * because the mark's testid moves onto the Figure itself here (there is no
 * separate wrapper to hold "Observed at " as a sibling on the mark, unlike
 * the on-hover `sighting-facts` line below).
 */
function GhostAsOfLabel({
  recordId,
  asOf,
  scale,
}: {
  recordId: string
  asOf: number | undefined
  scale: number | undefined
}) {
  const stamp = formatInstant(asOf, scale)
  const text = 'Observed at ' + stamp
  return (
    <Figure
      raw={asOf}
      unit="world-ms-instant"
      text={text}
      className="sr-only"
      data-testid={`sighting-mark-asof-${recordId}`}
      title={instantScaleLabel(scale)}
    />
  )
}

/**
 * The hovered fleet's facts: what it is doing (from its SERVED mode), the
 * served arrival countdown for a burn, and the served heading and speed for
 * a drift. Every figure is a served value or a difference of served stamps
 * against the live clock — nothing is read back from a drawn position.
 */
function FleetFacts({
  mark,
  nowMs,
  acting,
  scale,
}: {
  mark: SceneMark
  nowMs: number
  acting: boolean
  scale: number | undefined
}) {
  let activity: string
  let detail: ReactNode | null = null
  if (mark.fleetMode === 0) {
    const remaining = mark.arriveMs !== undefined ? mark.arriveMs - nowMs : 0
    activity = remaining > 0 ? 'Under way' : 'Arriving'
    if (remaining > 0) {
      detail = (
        <>
          Arrives{' '}
          <Figure
            raw={remaining}
            unit="world-ms-span-in"
            text={formatByUnit(remaining, scale, 'world-ms-span-in')}
            data-testid="fleet-facts-arrival"
          />
        </>
      )
    }
  } else if (mark.fleetMode === 2) {
    activity = 'Drifting'
    if (mark.velocity) {
      const v = mark.velocity
      const speed = Math.hypot(v.x, v.y, v.z)
      const heading = ((Math.atan2(v.x, -v.z) * 180) / Math.PI + 360) % 360
      detail = `Bearing ${heading.toFixed(0)}° · Speed ${speed.toFixed(2)}`
    }
  } else if (mark.fleetMode === 1) {
    activity = 'Parked'
  } else {
    activity = 'Status unknown'
  }
  return (
    <div
      data-testid="fleet-facts"
      className="absolute left-1/2 top-28 -translate-x-1/2 rounded-md bg-black/70 px-3 py-2 text-xs text-zinc-200"
    >
      <div className="font-mono text-[11px] text-emerald-300">
        {mark.id}
        {acting ? ' · commanding' : ''}
      </div>
      <div>{activity}</div>
      {detail && <div className="text-zinc-400">{detail}</div>}
      {!acting && <div className="text-[10px] text-zinc-500">Click to command this fleet</div>}
    </div>
  )
}

function CameraButton({
  testId,
  label,
  onPress,
  atLimit,
  glyph,
  controlAttr,
}: {
  testId: string
  label: string
  onPress: () => void
  atLimit: boolean
  glyph: string
  /** RULING 10/impl contract §10.1: `select-pan-target-point` moves out of
   *  the `space-camera-controls` wrapper and must carry CAMERA_CONTROL_ATTR
   *  itself, or the canvas-pick suppression at `:252` misses it. */
  controlAttr?: boolean
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      className={BUTTON}
      {...(controlAttr ? { [CAMERA_CONTROL_ATTR]: '' } : {})}
      {...(atLimit ? { 'data-at-limit': 'true' } : {})}
      onClick={(e) => {
        e.stopPropagation()
        onPress()
      }}
    >
      {glyph}
    </button>
  )
}

export default SpaceStage
