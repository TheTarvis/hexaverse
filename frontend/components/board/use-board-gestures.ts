'use client'

// useBoardGestures — the thin DOM shell over board-camera's pure decisions.
// It translates pointer, wheel, and touch events into calls on that module and
// writes the result into useBoardProjection's camera state. It decides
// nothing: every clamp, threshold, and delta mapping lives in board-camera.ts,
// outside webgl/, where it is table-tested without a DOM.
//
// Two bindings here are load-bearing and easy to get wrong:
//
// 1. Listeners bind on the STAGE, in the CAPTURE phase — not on the canvas.
//    The port's overlay pointer policy makes the overlay <svg> root
//    `pointer-events: none` with only per-entity hit shapes `pointer-events:
//    auto`, so a canvas-bound listener would never see a gesture that starts
//    over a glyph: pan and zoom would dead-zone over every mark on the board.
//
// 2. Wheel binds through addEventListener with `{ passive: false }`, never
//    React's `onWheel`. React attaches wheel passively at the root, so
//    preventDefault() inside a synthetic handler is a no-op and a wheel zoom
//    would scroll the page underneath the board as well (the spike already
//    hit this — WebGLBoard.tsx's own wheel listener carries the same flag).
//
// Native pinch/pan suppression is done with CSS `touch-action: none` on the
// stage (see BoardStage), NOT with preventDefault() on `touchstart`. Both
// suppress the browser's gestures; only the latter also suppresses the
// synthesized `click` a tap produces, which is what selection rides on. The
// one preventDefault on the touch path is on `touchmove` while two fingers
// are actually down.

import { useEffect, useRef } from 'react'
import {
  advanceDrag,
  beginDrag,
  isPan,
  panByPixels,
  panBySteps,
  panToReveal,
  touchDistance,
  zoomByNotches,
  zoomByPinch,
  zoomByWheel,
  type BoardCamera,
  type DragTracker,
} from './board-camera'

// Marks the board's own on-screen camera controls. A gesture that starts on
// one is the control's, not the board's: it neither pans the camera nor
// reaches the click-to-pick path.
export const CAMERA_CONTROL_ATTR = 'data-board-camera-control'

// Which clamp a keyboard input just ran into, or null when it moved the
// camera. Surfaced in the DOM by BoardStage — a keyboard-only player needs to
// know why nothing happened, and a console.log or a same-frame CSS class with
// no rendered difference tells them nothing.
export type CameraLimit = 'pan' | 'zoom-min' | 'zoom-max'

// The confirmed key bindings (design.md's "Exact keyboard bindings" Open
// Question, resolved 2026-08-26): arrows pan one radial unit, +/- zoom one
// wheel-notch equivalent. Arrow keys are spent on camera pan — a future
// bare-cell roving cursor needs a different key set.
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}
const ZOOM_IN_KEYS = new Set(['+', '='])
const ZOOM_OUT_KEYS = new Set(['-', '_'])

export interface BoardGestureOptions {
  // The stage element every listener binds to.
  host: HTMLElement | null
  // False while the board is unavailable (renderer unsupported/interrupted).
  // Every listener stands down: a wheel scroll over that region must scroll
  // the page normally rather than be swallowed by a capture-phase
  // preventDefault().
  enabled: boolean
  radius: number
  worldPerPixel: number
  // The camera as currently rendered. The keyboard path needs it: it has to
  // know whether a press actually moved the camera to report the at-limit
  // state, and that answer is not available from inside a functional update.
  camera: BoardCamera
  setCamera(next: BoardCamera | ((prev: BoardCamera) => BoardCamera)): void
  onAtLimit?(limit: CameraLimit | null): void
}

export function useBoardGestures({
  host,
  enabled,
  radius,
  worldPerPixel,
  camera,
  setCamera,
  onAtLimit,
}: BoardGestureOptions): void {
  // Everything the listeners read is mirrored into one ref, so the listeners
  // bind once per host rather than re-binding on every camera change (a
  // pointer-move-cadence rebind would drop the drag in progress).
  const live = useRef({ enabled, radius, worldPerPixel, camera, setCamera, onAtLimit })
  live.current = { enabled, radius, worldPerPixel, camera, setCamera, onAtLimit }

  useEffect(() => {
    if (!host) return

    let drag: DragTracker | null = null
    let dragPointerId: number | null = null
    // A pan MUST NOT change the selection, so the click the browser fires at
    // the end of the sequence is swallowed on the way down.
    let suppressClick = false
    // Two fingers down: the pinch owns the gesture and the single-pointer pan
    // path stands off until both are lifted.
    let pinchDist: number | null = null

    const onControl = (target: EventTarget | null): boolean =>
      target instanceof Element && !!target.closest(`[${CAMERA_CONTROL_ATTR}]`)

    const onPointerDown = (e: PointerEvent) => {
      if (!live.current.enabled) return
      if (drag !== null || pinchDist !== null) return
      if (onControl(e.target)) return
      drag = beginDrag(e.clientX, e.clientY)
      dragPointerId = e.pointerId
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== dragPointerId) return
      if (!live.current.enabled) return
      const { dx, dy } = advanceDrag(drag, e.clientX, e.clientY)
      if (!isPan(drag)) return
      // Past the threshold the sequence is a pan for good — including the
      // travel already accumulated below it, so the board doesn't lurch when
      // the threshold is crossed.
      suppressClick = true
      const g = live.current
      g.setCamera((prev) => panByPixels(prev, dx, dy, g.worldPerPixel, g.radius))
    }

    const endPointer = (e: PointerEvent) => {
      if (e.pointerId !== dragPointerId) return
      drag = null
      dragPointerId = null
    }

    // Capture-phase click swallow: this runs before the overlay's per-entity
    // hit shapes and before the stage's own React onClick, so one listener
    // covers both halves of the picking path.
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return
      suppressClick = false
      e.stopPropagation()
      e.preventDefault()
    }

    const onWheel = (e: WheelEvent) => {
      if (!live.current.enabled) return
      if (onControl(e.target)) return
      e.preventDefault()
      live.current.setCamera((prev) => zoomByWheel(prev, e.deltaY))
    }

    const touchPoints = (t: TouchList): { x: number; y: number }[] =>
      [0, 1].map((i) => ({ x: t[i]!.clientX, y: t[i]!.clientY }))

    const onTouchStart = (e: TouchEvent) => {
      if (!live.current.enabled) return
      if (e.touches.length < 2) return
      // A second finger converts the gesture: the pan in progress ends where
      // it is rather than fighting the pinch for the same camera.
      drag = null
      dragPointerId = null
      const [a, b] = touchPoints(e.touches)
      pinchDist = touchDistance(a!, b!)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (pinchDist === null || e.touches.length < 2) return
      if (!live.current.enabled) return
      // The only preventDefault on the touch path, and only while two fingers
      // are down — a one-finger tap keeps its synthesized click.
      if (e.cancelable) e.preventDefault()
      const [a, b] = touchPoints(e.touches)
      const next = touchDistance(a!, b!)
      const prevDist = pinchDist
      pinchDist = next
      suppressClick = true
      live.current.setCamera((prev) => zoomByPinch(prev, prevDist, next))
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchDist = null
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const g = live.current
      if (!g.enabled) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const cur = g.camera
      const step = PAN_KEYS[e.key]
      if (step) {
        e.preventDefault()
        const next = panBySteps(cur, step[0]!, step[1]!, g.radius)
        g.setCamera(next)
        const moved = next.target.x !== cur.target.x || next.target.y !== cur.target.y
        g.onAtLimit?.(moved ? null : 'pan')
        return
      }
      if (ZOOM_IN_KEYS.has(e.key) || ZOOM_OUT_KEYS.has(e.key)) {
        e.preventDefault()
        const inward = ZOOM_IN_KEYS.has(e.key)
        const next = zoomByNotches(cur, inward ? -1 : 1)
        g.setCamera(next)
        if (next.zoom !== cur.zoom) g.onAtLimit?.(null)
        else g.onAtLimit?.(inward ? 'zoom-max' : 'zoom-min')
      }
    }

    // Tab landing on a hit target the current pan/zoom pushed off-screen pans
    // by the MINIMUM displacement that brings it back — immediately, and with
    // the current zoom preserved. Anything already in view is left alone, so
    // tabbing across visible glyphs never nudges the board.
    const onFocusIn = (e: FocusEvent) => {
      const g = live.current
      if (!g.enabled) return
      const el = e.target
      if (!(el instanceof Element) || onControl(el)) return
      const r = el.getBoundingClientRect()
      const box = host.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      g.setCamera((prev) =>
        panToReveal(
          prev,
          { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top },
          { w: box.width, h: box.height },
          g.worldPerPixel,
          g.radius,
        ),
      )
    }

    const cap = { capture: true } as const
    host.addEventListener('pointerdown', onPointerDown, cap)
    host.addEventListener('pointermove', onPointerMove, cap)
    host.addEventListener('pointerup', endPointer, cap)
    host.addEventListener('pointercancel', endPointer, cap)
    host.addEventListener('click', onClickCapture, cap)
    host.addEventListener('wheel', onWheel, { capture: true, passive: false })
    host.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    host.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    host.addEventListener('touchend', onTouchEnd, cap)
    host.addEventListener('touchcancel', onTouchEnd, cap)
    host.addEventListener('keydown', onKeyDown, cap)
    host.addEventListener('focusin', onFocusIn, cap)

    return () => {
      host.removeEventListener('pointerdown', onPointerDown, cap)
      host.removeEventListener('pointermove', onPointerMove, cap)
      host.removeEventListener('pointerup', endPointer, cap)
      host.removeEventListener('pointercancel', endPointer, cap)
      host.removeEventListener('click', onClickCapture, cap)
      host.removeEventListener('wheel', onWheel, cap)
      host.removeEventListener('touchstart', onTouchStart, cap)
      host.removeEventListener('touchmove', onTouchMove, cap)
      host.removeEventListener('touchend', onTouchEnd, cap)
      host.removeEventListener('touchcancel', onTouchEnd, cap)
      host.removeEventListener('keydown', onKeyDown, cap)
      host.removeEventListener('focusin', onFocusIn, cap)
    }
  }, [host])
}
