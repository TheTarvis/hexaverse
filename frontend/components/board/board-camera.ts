// board-camera — the board camera's DECISIONS, as pure functions.
//
// Every clamp, every gesture-delta → camera-state mapping, and the pan bound
// live here: clamping is a decision, and the port's plumbing/decision rule
// (port-board-to-webgl-renderer) keeps decisions outside `webgl/` where they
// are unit-tested without a GL context. This module imports neither React nor
// three.js — the event handlers in BoardStage are a thin shell that translates
// DOM events into these calls and writes the result into useBoardProjection's
// camera state.
//
// It is also what makes multi-touch pinch testable at all: `page.touchscreen`
// cannot dispatch a two-finger gesture without raw CDP, so the pinch half of
// the touch requirement is asserted here. The single-finger tap/pan half is
// NOT covered by this module — `touchstart`'s preventDefault() suppressing the
// synthesized click is DOM plumbing a pure reducer never sees, and needs its
// own e2e vehicle.
//
// Coordinate convention: `target` is in lib/board BOARD pixels (y-down, the
// same space `project`/`unproject` speak). The y-flip to the GL world's y-up
// happens once, in use-board-projection's boardToWorld — never here.

import { RADIAL_UNIT, type Point } from '@/lib/board'
import { ringRadius } from '@/lib/polar'

// The zoom clamp, inherited from the spike's tuned default
// (app/spike/webgl-board/WebGLBoard.tsx:187, `clamp(zoom * 0.9984^deltaY,
// 0.25, 6)`). Zoom is a multiplier over the fit-to-lattice framing
// (`dist = fitDist / zoom`), so the bound is scale-relative by construction
// and every production board shares one radius (common.Tuning().BoardRadius).
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 6

// The per-wheel-unit zoom factor, from the same spike line.
export const WHEEL_ZOOM_BASE = 0.9984

// One wheel "notch" in deltaY. Browsers report a mouse detent as ~100 in
// DOM_DELTA_PIXEL mode; it is the unit the keyboard zoom keys step by, so
// keyboard zoom inherits a step size already tuned once for wheel input
// rather than inventing a second one.
export const WHEEL_NOTCH_DELTA_Y = 100

// The tap/pan discriminator, in CSS pixels — the common touch-slop
// convention. Below it a pointer or touch sequence is a click and selection
// runs; at or above it the sequence is a pan and MUST NOT change the
// selection. Not left blank: at the implementation default of 1px every
// synthetic test still passes while real finger contact (which wanders 2-5px
// during a tap) resolves every tap as a pan, so touch users could select
// nothing at all.
export const DRAG_THRESHOLD_PX = 8

// One keyboard pan press moves the camera by one radial unit — the polar
// lattice's "one tile", the same increment a bare-cell arrow cursor would use.
export const KEY_PAN_STEP = RADIAL_UNIT

export interface BoardCamera {
  // Zoom multiplier over the fit-to-lattice framing. 1 = fit.
  zoom: number
  // The point the camera is centred on, in board pixels.
  target: Point
}

// The board's DEFAULT FRAMING, defined once and referenced by every reset:
// fit-to-lattice at zoom 1x with the pan target at the lattice origin — the
// single core cell, {ring: 0, slot: 0}. The `systemId` reset and the manual
// recenter control both resolve to exactly this, which is why they agree.
export const DEFAULT_CAMERA: BoardCamera = { zoom: 1, target: { x: 0, y: 0 } }

export function isDefaultCamera(c: BoardCamera): boolean {
  return c.zoom === DEFAULT_CAMERA.zoom && c.target.x === 0 && c.target.y === 0
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_MIN
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

// panBound is the radius of the lattice's bounding DISC, in board pixels —
// the polar lattice's natural bound, replacing the hex era's bounding box.
// The pan target may not leave it, so the board's centre of view is always
// over the lattice. A disc admits no corner region that is inside the bound
// but off the board, and the test is one hypot rather than a per-axis clamp.
export function panBound(maxRing: number, unit: number = RADIAL_UNIT): number {
  return ringRadius(maxRing) * unit
}

export function clampTarget(t: Point, maxRing: number, unit: number = RADIAL_UNIT): Point {
  const bound = panBound(maxRing, unit)
  const d = Math.hypot(t.x, t.y)
  if (d <= bound || d === 0) return t
  const k = bound / d
  return { x: t.x * k, y: t.y * k }
}

export function clampCamera(c: BoardCamera, maxRing: number, unit: number = RADIAL_UNIT): BoardCamera {
  return { zoom: clampZoom(c.zoom), target: clampTarget(c.target, maxRing, unit) }
}

// --- zoom -------------------------------------------------------------------
//
// Zoom is anchored on the camera's CURRENT PAN TARGET, not the cursor or the
// pinch midpoint: the point the camera is centred on stays at the same screen
// position across the zoom. That is the spike's actual behaviour, which is the
// only implementation evidence in this codebase; cursor-anchoring is the more
// common map convention but has no evidence here either way, so the target
// is left untouched by every zoom path below.

export function zoomByFactor(c: BoardCamera, factor: number): BoardCamera {
  if (!Number.isFinite(factor) || factor <= 0) return c
  const zoom = clampZoom(c.zoom * factor)
  return zoom === c.zoom ? c : { zoom, target: c.target }
}

// Wheel input: the spike's exponential mapping, so a fast scroll zooms more
// than a slow one and the feel is scale-invariant.
export function zoomByWheel(c: BoardCamera, deltaY: number): BoardCamera {
  if (!Number.isFinite(deltaY) || deltaY === 0) return c
  return zoomByFactor(c, Math.pow(WHEEL_ZOOM_BASE, deltaY))
}

// Keyboard zoom: one press equals one wheel notch. Positive `notches` zooms
// out (matching wheel deltaY's sign), negative zooms in.
export function zoomByNotches(c: BoardCamera, notches: number): BoardCamera {
  return zoomByWheel(c, notches * WHEEL_NOTCH_DELTA_Y)
}

// Pinch: the ratio of the two-finger distance drives the same multiplier and
// the same clamp as wheel zoom, anchored on the centre exactly as wheel is.
export function zoomByPinch(c: BoardCamera, prevDistPx: number, nextDistPx: number): BoardCamera {
  if (!(prevDistPx > 0) || !(nextDistPx > 0)) return c
  return zoomByFactor(c, nextDistPx / prevDistPx)
}

export function atZoomLimit(c: BoardCamera): 'min' | 'max' | null {
  if (c.zoom <= ZOOM_MIN) return 'min'
  if (c.zoom >= ZOOM_MAX) return 'max'
  return null
}

// --- pan --------------------------------------------------------------------

// panByPixels moves the camera so the board follows the pointer: dragging
// right moves the board right, i.e. the camera target moves LEFT. `dxPx`/
// `dyPx` are screen-pixel deltas (y down), `worldPerPixel` the projection's
// current board-units-per-screen-pixel at the board plane — which already
// carries zoom, so a drag covers the same amount of board at every zoom.
export function panByPixels(
  c: BoardCamera,
  dxPx: number,
  dyPx: number,
  worldPerPixel: number,
  maxRing: number,
  unit: number = RADIAL_UNIT,
): BoardCamera {
  const target = clampTarget(
    { x: c.target.x - dxPx * worldPerPixel, y: c.target.y - dyPx * worldPerPixel },
    maxRing,
    unit,
  )
  return { zoom: c.zoom, target }
}

// panBySteps moves the camera by whole radial units — the keyboard path.
// One press = one step on one axis, in board space (y down: `dySteps: 1` pans
// the view toward the bottom of the board).
export function panBySteps(
  c: BoardCamera,
  dxSteps: number,
  dySteps: number,
  maxRing: number,
  unit: number = RADIAL_UNIT,
): BoardCamera {
  const target = clampTarget(
    { x: c.target.x + dxSteps * KEY_PAN_STEP, y: c.target.y + dySteps * KEY_PAN_STEP },
    maxRing,
    unit,
  )
  return { zoom: c.zoom, target }
}

// atPanLimit reports whether the target sits on the bounding disc — the
// at-limit state keyboard input exposes in the DOM when a pan key is pressed
// with nowhere left to go.
export function atPanLimit(c: BoardCamera, maxRing: number, unit: number = RADIAL_UNIT): boolean {
  const bound = panBound(maxRing, unit)
  return Math.hypot(c.target.x, c.target.y) >= bound - 1e-9
}

// --- gesture bookkeeping ----------------------------------------------------

// A pointer/touch sequence in progress. `moved` accumulates TOTAL travel, not
// net displacement: a drag out and back is still a drag, not a click.
export interface DragTracker {
  lastX: number
  lastY: number
  moved: number
}

export function beginDrag(x: number, y: number): DragTracker {
  return { lastX: x, lastY: y, moved: 0 }
}

// advanceDrag folds one pointer sample into the tracker and reports the frame
// delta. Mutating the tracker in place is deliberate: it lives in a ref on the
// pointer-move path, where a fresh object per sample would be pure garbage.
export function advanceDrag(d: DragTracker, x: number, y: number): { dx: number; dy: number } {
  const dx = x - d.lastX
  const dy = y - d.lastY
  d.lastX = x
  d.lastY = y
  d.moved += Math.hypot(dx, dy)
  return { dx, dy }
}

// isPan is the discriminator: at or past the threshold the sequence is a pan
// and must not reach the selection model; below it, it is a click.
export function isPan(d: DragTracker): boolean {
  return d.moved >= DRAG_THRESHOLD_PX
}

export function touchDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// --- reveal -----------------------------------------------------------------

export interface ScreenRect {
  left: number
  top: number
  right: number
  bottom: number
}

// panToReveal pans by the MINIMUM displacement that brings `rect` (a
// container-relative screen rect — a focused hit target's focus indicator)
// fully inside the container, preserving zoom. A rect already inside returns
// the camera unchanged, so Tab-ing across visible glyphs never nudges the
// view. A rect larger than the viewport on an axis is aligned to its
// leading edge rather than left half-shown.
export function panToReveal(
  c: BoardCamera,
  rect: ScreenRect,
  viewport: { w: number; h: number },
  worldPerPixel: number,
  maxRing: number,
  unit: number = RADIAL_UNIT,
): BoardCamera {
  const axis = (lo: number, hi: number, size: number): number => {
    if (hi - lo >= size) return -lo
    if (lo < 0) return -lo
    if (hi > size) return size - hi
    return 0
  }
  // The rect must move by (sx, sy) on screen; the camera target moves the
  // opposite way, which panByPixels already expresses.
  const sx = axis(rect.left, rect.right, viewport.w)
  const sy = axis(rect.top, rect.bottom, viewport.h)
  if (sx === 0 && sy === 0) return c
  return panByPixels(c, sx, sy, worldPerPixel, maxRing, unit)
}
