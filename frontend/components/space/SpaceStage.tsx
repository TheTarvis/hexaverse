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
// system. A focused fleet supplies the live pivot; orbit and zoom retain
// following, while pan, recenter and other-object focus release it. A new
// system resets framing before applying its initial fleet focus.

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
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { usePhoneHud } from '@/hooks/use-phone-sheet'
import { bindMapBrowserGestures, type MapTouchActions } from './map-browser-gestures'
import { Figure } from '@/components/figure/Figure'
import { formatByUnit, formatInstant, instantScaleLabel } from '@/lib/format'
import { unprojectToViewPlane, type DrawVec3, type DrawViewBasis } from '@/lib/space/draw'
import { SpaceCanvas } from './SpaceCanvas'
import { projectMarks } from './space-projection'
import { placeAnnotations } from './space-annotations'
import {
  advanceDrag,
  atOrbitLimit,
  atPanLimit,
  atZoomLimit,
  beginDrag,
  clampCamera,
  defaultCamera,
  fleetCamera,
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
  onPendingChange?: (pending: boolean) => void
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
  initialFocusFleetId?: string | null
  focusFleetRequest?: { fleetId: string; sequence: number } | null
  focusBodyRequest?: { bodyId: string; sequence: number } | null
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
  onPendingChange,
  onFirstFrame,
  highlightedGhostId = null,
  onHighlightGhost,
  initialFocusFleetId = null,
  focusFleetRequest = null,
  focusBodyRequest = null,
  actingFleetId = null,
  onActivateFleet,
  frameSource,
}: SpaceStageProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [available, setAvailable] = useState(false)
  const [touchOrbit, setTouchOrbit] = useState(false)
  const [camera, storeCamera] = useState<SpaceCamera>(() => defaultCamera(extent))
  const frameRef = useRef<SpaceFrame | null>(null)
  const setCamera = useCallback((next: SpaceCamera | ((prev: SpaceCamera) => SpaceCamera)) => {
    storeCamera(prev => {
      const live = frameRef.current?.camera
      const current = prev.followFleetId && live?.followFleetId === prev.followFleetId
        ? { ...prev, target: live.target, distance: live.distance } : prev
      return typeof next === 'function' ? next(current) : next
    })
  }, [])
  const [drawWorldTime, setDrawWorldTime] = useState(worldTime)
  const [focusedMarkId, setFocusedMarkId] = useState<string | null>(null)
  const [hoveredContactId, setHoveredContactId] = useState<string | null>(null)
  const [hoveredGhostId, setHoveredGhostId] = useState<string | null>(null)
  const [hoveredBodyId, setHoveredBodyId] = useState<string | null>(null)
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

  // One request per system entry: later fleet refetches never fight camera input.
  const entryFocus = useRef<string | null>(null)
  const entryKey = `${systemId}::${initialFocusFleetId}`
  const entryMark = initialFocusFleetId ? scene.marks.find(mark => mark.kind === 'fleet' && mark.id === initialFocusFleetId) : null
  if (entryMark && entryFocus.current !== entryKey) {
    entryFocus.current = entryKey
    setCamera(fleetCamera(extent, entryMark.id, entryMark.followAnchor?.position ?? entryMark.position))
  }

  const fleetRequest = useRef<string | null>(null)
  const fleetRequestKey = focusFleetRequest ? `${systemId}:${focusFleetRequest.fleetId}:${focusFleetRequest.sequence}` : null
  const fleetMark = focusFleetRequest ? scene.marks.find(mark => mark.kind === 'fleet' && mark.id === focusFleetRequest.fleetId) : null
  if (fleetMark && fleetRequestKey !== fleetRequest.current) {
    fleetRequest.current = fleetRequestKey
    setCamera(fleetCamera(extent, fleetMark.id, fleetMark.followAnchor?.position ?? fleetMark.position))
  }

  const focusedRequest = useRef<string | null>(null)
  const requestKey = focusBodyRequest ? `${systemId}:${focusBodyRequest.bodyId}:${focusBodyRequest.sequence}` : null
  const requestedMark = focusBodyRequest ? scene.marks.find(mark => mark.id === focusBodyRequest.bodyId && mark.kind !== 'fleet') : null
  if (requestedMark && requestKey !== focusedRequest.current) {
    focusedRequest.current = requestKey
    setCamera(clampCamera({ ...defaultCamera(extent), target: { ...requestedMark.position } }, extent))
  }

  // THE transform loop's published frame (design.md Decision 3, decided
  // option B) — written by the loop, read by `pickAt`, the pan-by-pixels
  // gesture, and the focus/off-screen-chip reframe (Decision 3, Decision 7).
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const staticSceneRef = useRef(scene)
  staticSceneRef.current = scene

  // A newly mounted target is placed from the last frame in the same
  // commit (via `applyHitTransform`), so it never flashes at the origin.
  const [registry] = useState<HitTargetRegistry>(() =>
    createHitTargetRegistry((id, el) => applyHitTransform(frameRef.current, id, el)),
  )

  const [annotationRegistry] = useState(() => createHitTargetRegistry())
  useLayoutEffect(() => {
    placeAnnotations(frameRef.current, annotationRegistry)
  })

  const loop = useSpaceTransformLoop({
    annotationRegistry,
    extent,
    // Publishing current scene state must precede the first GPU frame and
    // continue during recovery; only canvas input is gated by readiness.
    enabled: true,
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
      setCamera((prev) => clampCamera({ ...prev, followFleetId: undefined, target: { ...position } }, extent))
    },
    [extent, setCamera],
  )

  const recenter = useCallback(() => setCamera(defaultCamera(extent)), [extent, setCamera])

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
    affordance: HTMLElement | null
  }
  const gestureRef = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<number | null>(null)
  const touchPinched = useRef(false)
  const touchPair = useRef<{ ids: string; center: DragTracker; distance: number } | null>(null)
  const orbitPivot = useCallback((): DrawVec3 | undefined => {
    if (selection?.bodyId) return frameRef.current?.projected.get(selection.bodyId)?.mark.position
    const point = selection?.point
    return point && ('x' in point ? point : { x: point.X, y: point.Y, z: point.Z })
  }, [selection])

  const isControl = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    !!target.closest(`[${CAMERA_CONTROL_ATTR}], [${AFFORDANCE_ATTR}]`)

  const bodyIdUnder = (target: EventTarget | null): string | null =>
    target instanceof Element
      ? (target.closest<HTMLElement>('[data-body-id]')?.dataset.bodyId ?? null)
      : null

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!available || e.pointerType === 'touch' || isControl(e.target)) return
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* Detached/cancelled input. */ }
    if (pointers.current.size > 1) {
      const [a, b] = [...pointers.current.values()]
      pinchRef.current = touchDistance(a, b)
      gestureRef.current = null
      return
    }
    gestureRef.current = {
      tracker: beginDrag(e.clientX, e.clientY),
      bodyId: bodyIdUnder(e.target),
      secondary: e.button === 2,
      affordance: null,
    }
  }, [available])

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!available || e.pointerType === 'touch' || !pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size > 1) {
        const [a, b] = [...pointers.current.values()]
        const distance = touchDistance(a, b), previous = pinchRef.current
        pinchRef.current = distance
        if (previous) setCamera(prev => zoomByPinch(prev, previous, distance, extent))
        return
      }
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
        setCamera((prev) => orbitByPixels(prev, dx, dy, orbitPivot()))
      }
    },
    [available, extent, setCamera, orbitPivot],
  )

  const finishGesture = useCallback(
    (clientX: number, clientY: number, marks: PickMark[]) => {
      const gesture = gestureRef.current
      gestureRef.current = null
      if (!gesture || isGesture(gesture.tracker)) return
      if (gesture.affordance) {
        if (gesture.affordance.isConnected && !gesture.affordance.closest('[inert], [hidden]')) gesture.affordance.click()
        return
      }
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
    [available, extent, setCamera],
  )

  const cancelGesture = useCallback(() => {
    gestureRef.current = null
    pinchRef.current = null
    touchPair.current = null
    touchPinched.current = false
    pointers.current.clear()
  }, [])
  useEffect(() => {
    if (!available) cancelGesture()
    window.addEventListener('blur', cancelGesture)
    return () => window.removeEventListener('blur', cancelGesture)
  }, [available, cancelGesture])
  const releasePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const tracked = pointers.current.has(event.pointerId)
    const single = pointers.current.size === 1
    pointers.current.delete(event.pointerId)
    if (tracked && single) {
      if (gestureRef.current) advanceDrag(gestureRef.current.tracker, event.clientX, event.clientY)
      finishGesture(event.clientX, event.clientY, [])
    }
    else gestureRef.current = null
    pinchRef.current = null
    // A finger left after a pinch cannot become a tap; a new press starts a gesture.
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Already lost. */ }
  }, [finishGesture])

  const touchActions = useRef<MapTouchActions>(null!)
  touchActions.current = {
    start: event => {
      if (event.touches.length >= 2) {
        const [a, b] = Array.from(event.touches)
        touchPair.current = { ids: [a.identifier, b.identifier].sort().join(':'), center: beginDrag((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2), distance: touchDistance({ x: a.clientX, y: a.clientY }, { x: b.clientX, y: b.clientY }) }
        touchPinched.current = true
        gestureRef.current = null
      } else if (!touchPinched.current && event.touches[0]) {
        const point = event.touches[0]
        gestureRef.current = { tracker: beginDrag(point.clientX, point.clientY), bodyId: bodyIdUnder(event.target), secondary: !touchOrbit, affordance: event.target instanceof Element ? event.target.closest<HTMLElement>(`[${AFFORDANCE_ATTR}]`) : null }
      }
    },
    move: event => {
      if (event.touches.length >= 2) {
        const [a, b] = Array.from(event.touches)
        const next = touchDistance({ x: a.clientX, y: a.clientY }, { x: b.clientX, y: b.clientY })
        const pair = touchPair.current
        const ids = [a.identifier, b.identifier].sort().join(':')
        touchPinched.current = true
        gestureRef.current = null
        if (!pair || pair.ids !== ids) { touchActions.current.start(event); return true }
        const { dx, dy } = advanceDrag(pair.center, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
        const spread = next - pair.distance
        const previous = pair.distance
        pair.distance = next
        // A stationary finger in a pinch shifts the centroid by half the spread.
        // Orbit only common motion that dominates that radial component.
        const rotate = isGesture(pair.center) && Math.hypot(dx, dy) > Math.abs(spread) * 0.75
        const pivot = orbitPivot()
        setCamera(camera => {
          const zoomed = Math.abs(spread) >= 1 ? zoomByPinch(camera, previous, next, extent) : camera
          return rotate ? orbitByPixels(zoomed, dx, dy, pivot) : zoomed
        })
        return true
      }
      const gesture = gestureRef.current, point = event.touches[0]
      if (!gesture || !point) return touchPinched.current
      const { dx, dy } = advanceDrag(gesture.tracker, point.clientX, point.clientY)
      if (!isGesture(gesture.tracker)) return false
      const frame = frameRef.current
      if (!gesture.secondary) setCamera(camera => orbitByPixels(camera, dx, dy, orbitPivot()))
      else if (frame) setCamera(camera => panByPixels(camera, dx, dy, { width: frame.basis.widthPx, height: frame.basis.heightPx }, extent))
      return true
    },
    end: event => {
      if (event.touches.length) { gestureRef.current = null; pinchRef.current = null; touchPair.current = null; touchPinched.current = true; return true }
      const point = event.changedTouches[0], gesture = gestureRef.current
      if (gesture && point) advanceDrag(gesture.tracker, point.clientX, point.clientY)
      const nativeAffordanceTap = !!gesture?.affordance && !isGesture(gesture.tracker) && !touchPinched.current
      if (nativeAffordanceTap) gestureRef.current = null // Native click owns fleet/ghost/offscreen taps.
      else if (point) finishGesture(point.clientX, point.clientY, [])
      else gestureRef.current = null
      touchPinched.current = false; pinchRef.current = null; touchPair.current = null
      return !nativeAffordanceTap
    },
    cancel: cancelGesture,
  }
  useLayoutEffect(() => {
    if (!host || !available) return
    return bindMapBrowserGestures(host, {
      start: event => touchActions.current.start(event), move: event => touchActions.current.move(event),
      end: event => touchActions.current.end(event), cancel: () => touchActions.current.cancel(),
    })
  }, [host, available])

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
      style={{ touchAction: 'none', overscrollBehavior: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', isolation: 'isolate' }}
      onFocus={handleFocusIn}
      onBlur={handleFocusOut}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUpCapture={releasePointer}
      onPointerCancel={event => { if (event.pointerType !== 'touch') cancelGesture() }}
      onLostPointerCapture={event => { if (event.pointerType !== 'touch' && pointers.current.has(event.pointerId)) cancelGesture() }}
      onWheel={handleWheel}
    >
      <SpaceCanvas
        onAvailabilityChange={handleAvailability}
        onPendingChange={onPendingChange}
        claimFocus={focusInsideRef.current}
        renderWorld={(canvas, bindings) => (
          <SpaceWorld canvas={canvas} {...bindings} frameRef={frameRef} extent={extent} actingFleetId={actingFleetId} />
        )}
      >
        {ready => <SpaceLayers
          available={ready}
          scene={scene}
          camera={camera}
          extent={extent}
          scale={scale}
          viewBasis={viewBasis}
          registry={registry}
          annotationRegistry={annotationRegistry}
          hoveredBodyId={hoveredBodyId}
          onHoverBody={setHoveredBodyId}
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
          orbitPivot={orbitPivot()}
          touchOrbit={touchOrbit}
          onTouchOrbit={() => { cancelGesture(); setTouchOrbit(value => !value) }}
          onRecenter={recenter}
          onReframe={(markId, coarsePosition) => {
            const live = frameRef.current?.projected.get(markId)
            reframeOn(live?.mark.position ?? coarsePosition)
          }}
          onPointerUpCapture={() => { /* Region capture owns each release once. */ }}
        />}
      </SpaceCanvas>
    </div>
  )
}

interface SpaceLayersProps {
  available: boolean
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
  annotationRegistry: HitTargetRegistry
  hoveredBodyId: string | null
  onHoverBody: (id: string | null) => void
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
  orbitPivot?: SpaceCamera['target']
  touchOrbit: boolean
  onTouchOrbit: () => void
  onRecenter: () => void
  onReframe: (markId: string, coarsePosition: DrawVec3) => void
  onPointerUpCapture: (clientX: number, clientY: number, marks: PickMark[]) => void
}

function SpaceLayers({
  available,
  scene,
  camera,
  extent,
  scale,
  viewBasis,
  registry,
  annotationRegistry,
  hoveredBodyId,
  onHoverBody,
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
  orbitPivot,
  touchOrbit,
  onTouchOrbit,
  onRecenter,
  onReframe,
}: SpaceLayersProps) {
  const phone = usePhoneHud()
  const [panOpen, setPanOpen] = useState(false)
  // THE ONE READ of `scene.marks`, inside the canvas region's error
  // boundary: a throw while building the drawn state is contained here.
  const marks = scene.marks
  if (!available) return null

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
  const hasSelectedObject = marks.some(mark => mark.selected)

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
        aria-label={mark.name || mark.id}
        aria-pressed={mark.selected}
        className={
          'pointer-events-auto absolute left-0 top-0 rounded-full' +
          ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'
        }
        onPointerOver={() => onHoverBody(mark.id)}
        onPointerOut={() => onHoverBody(null)}
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
        className={`pointer-events-none absolute z-20 ${CONSOLE_DOCK_LANE_CAMERA} right-4 grid grid-cols-4 gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400`}
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
          onCamera((prev) => orbitBySteps(prev, s[0], s[1], orbitPivot))
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
              onCamera((prev) => orbitBySteps(prev, s[0], s[1], orbitPivot))
            }
          }}
        >
          ⟳
        </div>
        <CameraButton testId="camera-zoom-in" label="Zoom in" onPress={() => onCamera((p) => zoomBySteps(p, 1, extent))} atLimit={zoomLimit === 'min'} glyph="+" />
        <CameraButton testId="camera-zoom-out" label="Zoom out" onPress={() => onCamera((p) => zoomBySteps(p, -1, extent))} atLimit={zoomLimit === 'max'} glyph="−" />
        <CameraButton testId="camera-recenter" label="Recenter" onPress={onRecenter} atLimit={false} glyph="⌖" />
      </div>

      {phone && <div data-space-camera-control data-testid="space-pan-controls" className="absolute z-20" style={{ right: 'max(12px, env(safe-area-inset-right))', bottom: 'calc(var(--phone-vitals-height, 64px) + 64px + env(safe-area-inset-bottom))' }}>
        <p className="mb-1 max-w-56 rounded bg-black/70 px-2 py-1 text-[10px] text-zinc-300" data-testid="touch-camera-hint">{touchOrbit ? '1 finger rotates' : '1 finger pans'} · 2 fingers rotate · Pinch zooms</p>
        <div className="flex justify-end gap-1">
        <button type="button" data-testid="camera-touch-rotate" aria-label="Rotate camera with one finger" aria-pressed={touchOrbit} onClick={onTouchOrbit} className={BUTTON} style={{ minWidth: 76, height: 44, borderColor: touchOrbit ? '#67e8f9' : undefined }}>{touchOrbit ? '✓ Rotate' : '⟳ Rotate'}</button>
        <button type="button" aria-label="Pan controls" aria-expanded={panOpen} onClick={() => setPanOpen(value => !value)} className={BUTTON} style={{ width: 44, height: 44 }}>↔</button>
        </div>
        {panOpen && <div role="group" aria-label="Pan the map" style={{ position: 'absolute', bottom: 52, right: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 4, padding: 4, background: '#08121df2' }}>
          {([['Pan left', -1, 0, '←'], ['Pan up', 0, 1, '↑'], ['Pan right', 1, 0, '→'], ['Pan down', 0, -1, '↓']] as const).map(([label, x, y, glyph], index) => <button key={label} type="button" aria-label={label} onClick={() => onCamera(previous => panBySteps(previous, x, y, extent))} className={BUTTON} style={{ width: 44, height: 44, gridColumn: index === 3 ? 2 : undefined }}>{glyph}</button>)}
        </div>}
      </div>}

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

      {/* Depth-sorted mark z-indices stay inside this layer, below camera
          controls and outside HUD sheets. A near mark must never eat a HUD tap. */}
      <div className="pointer-events-none absolute inset-0" style={{ isolation: 'isolate' }} data-testid="space-mark-layer">
      {/* --- hit targets: bodies, then lane gates --- */}
      <div className="pointer-events-none absolute inset-0">
        {bodies.map(hitButton)}
        {gates.map(hitButton)}
      </div>

      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {projected.filter(({ mark }) => ['star', 'body', 'belt', 'gate', 'fleet'].includes(mark.kind)).map(({ mark }) => {
          const selected = mark.selected || selection?.bodyId === mark.id || actingFleetId === mark.id
          const hovered = hoveredBodyId === mark.id || focusedMarkId === mark.id || hoveredFleetId === mark.id
          const detailed = selected || hovered
          return (
            <div
              key={mark.id}
              ref={annotationRegistry.refFor(mark.id)}
              data-testid={`space-annotation-${mark.id}`}
              data-priority={selected ? 2 : hovered ? 1 : 0}
              className={'absolute left-0 top-0 max-w-40 rounded border px-2 py-1 text-[10px] leading-4 shadow-sm ' +
                (selected ? 'border-cyan-300/70 bg-slate-950/90 text-cyan-100' : detailed ? 'border-white/30 bg-slate-950/90 text-white' : 'border-white/10 bg-slate-950/65 text-slate-300')}
              style={{ pointerEvents: 'none', visibility: 'hidden' }}
            >
              <div className="truncate">{mark.name || mark.id}</div>
              {detailed && (mark.bodyType || mark.starClass) && <div className="text-slate-400">{[mark.bodyType, mark.starClass].filter(Boolean).join(' · ').replaceAll('_', ' ')}</div>}
              {detailed && mark.kind === 'fleet' && <div className="text-slate-400">{mark.fleetMode === 0 ? 'Under way' : mark.fleetMode === 1 ? 'Parked' : mark.fleetMode === 2 ? 'Drifting' : 'Status unknown'}</div>}
            </div>
          )
        })}
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
          const showActingRing = acting && !hasSelectedObject
          return (
            <button
              key={mark.id}
              type="button"
              ref={registry.refFor(mark.id)}
              {...{ [AFFORDANCE_ATTR]: '' }}
              data-testid={`fleet-mark-${mark.id}`}
              data-acting={acting ? 'true' : 'false'}
              aria-label={`Fleet ${mark.id}`}
              aria-pressed={showActingRing}
              className={
                'pointer-events-auto absolute left-0 top-0 h-5 w-5 cursor-pointer rounded-full' +
                ' border border-emerald-300/40 hover:border-emerald-200/90 hover:bg-emerald-300/10' +
                ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400' +
                (showActingRing ? ' ring-2 ring-emerald-400/70' : '')
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

      {/* TODO(HUD-HIDDEN-CLEANUP): Off-screen pointers are CSS-hidden in the live system HUD due to label noise. Review other stage consumers before removing this renderer and its positioning logic. */}
      <div data-testid="space-offscreen-reach" data-empty={offScreen.length === 0} className="pointer-events-none absolute inset-0">
        {offScreen.map(({ mark }) => (
          <button
            key={mark.id}
            type="button"
            {...{ [AFFORDANCE_ATTR]: '' }}
            data-testid={`offscreen-${mark.id}`}
            aria-label={`Bring ${mark.name || mark.id} into view`}
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
            {mark.name || mark.id}
          </button>
        ))}
      </div>

      {/* The selected mark, drawn — including a bare point in vacuum, which
          has no body mark to highlight and no intrinsic outline. */}
      {selection?.point && <span className="sr-only" data-testid="point-selection-mark" />}
      </div>
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
