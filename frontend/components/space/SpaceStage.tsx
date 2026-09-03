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
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { projectToScreen, unprojectToViewPlane, type DrawVec3 } from '@/lib/space/draw'
import { SpaceCanvas } from './SpaceCanvas'
import { viewBasisOf } from './space-projection'
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
import { resolvePick, type PickMark, type SpaceSelection } from './space-selection'
import type { SceneMark, SceneModel } from './space-scene'

// three needs a GL context, so the world stays off the SSR path entirely.
const SpaceWorld = dynamic(() => import('./webgl/SpaceWorld').then((m) => m.SpaceWorld), {
  ssr: false,
})

export interface SpaceStageProps {
  systemId: string
  scene: SceneModel
  /** The interior's served continuous extent — every camera figure scales off it. */
  extent: number
  worldTime: number
  selection: SpaceSelection | null
  onSelect?: (selection: SpaceSelection | null) => void
  onAvailabilityChange?: (available: boolean) => void
  onFirstFrame?: () => void
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
  selection,
  onSelect,
  onAvailabilityChange,
  onFirstFrame,
}: SpaceStageProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [available, setAvailable] = useState(true)
  const [camera, setCamera] = useState<SpaceCamera>(() => defaultCamera(extent))
  const [drawWorldTime, setDrawWorldTime] = useState(worldTime)
  const [focusedMarkId, setFocusedMarkId] = useState<string | null>(null)
  const [hoveredContactId, setHoveredContactId] = useState<string | null>(null)

  // A new system is a new view: the framing resets, with no transition, and
  // nothing else resets it. Adjusted during render (never in an effect) so a
  // frame is never painted with the previous system's camera.
  const framingKey = `${systemId}::${extent}`
  const framingRef = useRef(framingKey)
  if (framingRef.current !== framingKey) {
    framingRef.current = framingKey
    setCamera(defaultCamera(extent))
  }

  const viewport = useMemo(
    () => ({ width: host?.clientWidth || 1, height: host?.clientHeight || 1 }),
    [host],
  )
  const basis = useMemo(() => viewBasisOf(camera, viewport), [camera, viewport])

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

  // The draw stamp advances only while the context is live, so a redraw
  // after a restore is observably taken from the CURRENT world time rather
  // than replayed from the stale one the loss froze.
  useEffect(() => {
    if (!available) return
    setDrawWorldTime(worldTime)
    onFirstFrame?.()
  }, [available, worldTime, onFirstFrame])

  const reframeOn = useCallback(
    (position: DrawVec3) => {
      setCamera((prev) => clampCamera({ ...prev, target: { ...position } }, extent))
    },
    [extent],
  )

  const recenter = useCallback(() => setCamera(defaultCamera(extent)), [extent])

  // --- picking -------------------------------------------------------------

  const pickAt = useCallback(
    (clientX: number, clientY: number, marks: PickMark[]): SpaceSelection | null => {
      if (!host) return null
      const rect = host.getBoundingClientRect()
      const planePoint = unprojectToViewPlane(
        clientX - rect.left,
        clientY - rect.top,
        basis,
        camera.target,
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
    [host, basis, camera.target, extent],
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
      setCamera((prev) =>
        gesture.secondary
          ? panByPixels(prev, dx, dy, viewport, extent)
          : orbitByPixels(prev, dx, dy),
      )
    },
    [viewport, extent],
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
      onSelect?.(pickAt(clientX, clientY, marks))
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
          <SpaceWorld canvas={canvas} scene={scene} camera={camera} extent={extent} />
        )}
      >
        <SpaceLayers
          scene={scene}
          camera={camera}
          extent={extent}
          basis={basis}
          viewport={viewport}
          selection={selection}
          focusedMarkId={focusedMarkId}
          hoveredContactId={hoveredContactId}
          onFocusMark={(id, position) => {
            setFocusedMarkId(id)
            if (position) reframeOn(position)
          }}
          onBlurMark={() => setFocusedMarkId(null)}
          onHoverContact={setHoveredContactId}
          onSelect={(next) => onSelect?.(next)}
          onCamera={setCamera}
          onRecenter={recenter}
          onReframe={reframeOn}
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
  basis: ReturnType<typeof viewBasisOf>
  viewport: { width: number; height: number }
  selection: SpaceSelection | null
  focusedMarkId: string | null
  hoveredContactId: string | null
  onFocusMark: (id: string, reframeTo: DrawVec3 | null) => void
  onBlurMark: () => void
  onHoverContact: (id: string | null) => void
  onSelect: (selection: SpaceSelection | null) => void
  onCamera: (next: (prev: SpaceCamera) => SpaceCamera) => void
  onRecenter: () => void
  onReframe: (position: DrawVec3) => void
  onPointerUpCapture: (clientX: number, clientY: number, marks: PickMark[]) => void
}

function SpaceLayers({
  scene,
  camera,
  extent,
  basis,
  selection,
  focusedMarkId,
  hoveredContactId,
  onFocusMark,
  onBlurMark,
  onHoverContact,
  onSelect,
  onCamera,
  onRecenter,
  onReframe,
}: SpaceLayersProps) {
  // THE ONE READ of `scene.marks`, inside the canvas region's error
  // boundary: a throw while building the drawn state is contained here.
  const marks = scene.marks

  const projected = marks.map((mark) => ({ mark, screen: projectToScreen(mark.position, basis) }))
  const pickables = projected.filter((p) => p.mark.pickable)
  // Bodies first, then lane gates — the tab order the requirement fixes,
  // each group in the scene's own stable order.
  const bodies = pickables.filter((p) => p.mark.kind !== 'gate')
  const gates = pickables.filter((p) => p.mark.kind === 'gate')
  const offScreen = pickables.filter((p) => !p.screen.onScreen)
  const contacts = projected.filter((p) => p.mark.kind === 'contact')

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
  const limitMessage = zoomLimit
    ? LIMIT_MESSAGE.zoom
    : atPanLimit(camera, extent)
      ? LIMIT_MESSAGE.pan
      : orbitLimit
        ? LIMIT_MESSAGE.orbit
        : ''

  const hitButton = (entry: { mark: SceneMark; screen: { x: number; y: number; onScreen: boolean } }) => {
    const { mark, screen } = entry
    return (
      <button
        key={mark.id}
        type="button"
        data-testid={`body-hit-${mark.id}`}
        data-body-id={mark.id}
        aria-label={mark.id}
        aria-pressed={mark.selected}
        className={
          'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full' +
          ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'
        }
        style={
          screen.onScreen
            ? { left: `${screen.x}px`, top: `${screen.y}px`, width: 24, height: 24 }
            : { left: '-9999px', top: '-9999px', width: 24, height: 24 }
        }
        onFocus={() => onFocusMark(mark.id, screen.onScreen ? null : mark.position)}
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
              while the canvas is unavailable (this whole layer is). --- */}
      <div
        {...{ [CAMERA_CONTROL_ATTR]: '' }}
        data-testid="space-camera-controls"
        role="group"
        aria-label="System camera"
        tabIndex={0}
        className="pointer-events-none absolute bottom-4 left-4 grid grid-cols-4 gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
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
        <CameraButton testId="camera-orbit-left" label="Orbit left" onPress={() => onCamera((p) => orbitBySteps(p, -1, 0))} atLimit={false} glyph="◀" />
        <CameraButton testId="camera-orbit-right" label="Orbit right" onPress={() => onCamera((p) => orbitBySteps(p, 1, 0))} atLimit={false} glyph="▶" />
        <CameraButton testId="camera-orbit-up" label="Orbit up" onPress={() => onCamera((p) => orbitBySteps(p, 0, 1))} atLimit={orbitLimit === 'max'} glyph="▲" />
        <CameraButton testId="camera-orbit-down" label="Orbit down" onPress={() => onCamera((p) => orbitBySteps(p, 0, -1))} atLimit={orbitLimit === 'min'} glyph="▼" />
        <CameraButton testId="camera-pan-left" label="Pan left" onPress={() => onCamera((p) => panBySteps(p, -1, 0, extent))} atLimit={panAtLimit(-1, 0)} glyph="←" />
        <CameraButton testId="camera-pan-right" label="Pan right" onPress={() => onCamera((p) => panBySteps(p, 1, 0, extent))} atLimit={panAtLimit(1, 0)} glyph="→" />
        <CameraButton testId="camera-pan-up" label="Pan up" onPress={() => onCamera((p) => panBySteps(p, 0, 1, extent))} atLimit={panAtLimit(0, 1)} glyph="↑" />
        <CameraButton testId="camera-pan-down" label="Pan down" onPress={() => onCamera((p) => panBySteps(p, 0, -1, extent))} atLimit={panAtLimit(0, -1)} glyph="↓" />
        <CameraButton testId="camera-zoom-in" label="Zoom in" onPress={() => onCamera((p) => zoomBySteps(p, 1, extent))} atLimit={zoomLimit === 'min'} glyph="+" />
        <CameraButton testId="camera-zoom-out" label="Zoom out" onPress={() => onCamera((p) => zoomBySteps(p, -1, extent))} atLimit={zoomLimit === 'max'} glyph="−" />
        <CameraButton testId="camera-recenter" label="Recenter" onPress={onRecenter} atLimit={false} glyph="⌖" />
        {/* The keyboard path to a POINT selection. Without it — and without
            the keyboard pan above — a keyboard-only player can only ever
            name the star, the one point every burn solve rejects. */}
        <CameraButton
          testId="select-pan-target-point"
          label="Select the point at the camera's centre"
          onPress={() => onSelect({ point: { ...camera.target } })}
          atLimit={false}
          glyph="◎"
        />
      </div>

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
            className="absolute right-4 top-4 rounded-md bg-black/70 px-3 py-2 text-xs text-zinc-200"
          >
            <div>Bearing {heading.toFixed(0)}°</div>
            <div>Speed {speed.toFixed(2)}</div>
          </div>
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
              'pointer-events-auto absolute right-2 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-[10px] text-zinc-200' +
              ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'
            }
            style={{ top: `${8 + offScreen.findIndex((o) => o.mark.id === mark.id) * 26}px` }}
            onClick={() => {
              onReframe(mark.position)
              onSelect({ bodyId: mark.id })
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              onReframe(mark.position)
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

function CameraButton({
  testId,
  label,
  onPress,
  atLimit,
  glyph,
}: {
  testId: string
  label: string
  onPress: () => void
  atLimit: boolean
  glyph: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      className={BUTTON}
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
