'use client'

// useBoardProjection — the one seam between the board's two render layers
// (port-board-to-webgl-renderer, "three layers — canvas world, SVG overlay, one
// projection seam"). The hook OWNS the camera parameters (container size, fit
// distance, tilt) as React-side state and hands them down: the canvas places
// its THREE camera from them each frame and never writes them back; the SVG
// overlay registers against the canvas via the camera-matched CSS 3D transform
// published here. `project`/`unproject` are the exact point mappings for
// anything needing one (canvas tile picking); the CSS transform is the bulk
// mechanism for every overlay shape lying on the board plane.
//
// This module imports no three.js and evaluates in jsdom with no GL context —
// projection math is plain arithmetic, unit-tested like any other decision.
//
// Coordinate convention, pinned once: `project`/`unproject` speak lib/board
// BOARD pixels (y-down, the Go-pinned convention glyph-geometry emits). The
// y-flip to the GL world's y-up happens HERE (boardToWorld), exactly once. No
// caller negates a y.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { boardExtent, fitViewBox, type Point } from '@/lib/board'
import { clampCamera, DEFAULT_CAMERA, type BoardCamera } from './board-camera'
import type { BoardCameraState } from './webgl/contract'

// The camera's vertical field of view — the spike's proven framing.
export const BOARD_FOV_DEG = 38

// The tuned camera tilt the port ships at (Travis's 2026-08-11 settings) — a
// production constant, not user-adjustable. The tuning bench may override it.
export const BOARD_TILT_DEG = 14

const HALF_FOV = (Math.PI / 180) * (BOARD_FOV_DEG / 2)
const TAN_HALF = Math.tan(HALF_FOV)

// boardToWorld — board pixels (y down) → GL world plane (y up). The board's
// cell disc is symmetric about the origin, so the viewBox centre is exactly
// (0,0) and the flip is a pure negation. THE one home of the y-flip.
export function boardToWorld(p: Point): Point {
  return { x: p.x, y: -p.y }
}

export interface BoardProjection {
  // False until the container has been measured (zero-size container).
  ready: boolean
  // The overlay <svg>'s viewBox attribute, ready to apply verbatim.
  viewBox: string
  // The board square's half-width in board pixels — the numeric form of the
  // same bound `viewBox` expresses, for anything that needs to size or place a
  // shape against the board's extent rather than emit an attribute.
  extent: number
  // Board pixels → container-relative screen pixels.
  project(p: Point): Point
  // Container-relative screen pixels → board pixels (ray ∩ board plane).
  unproject(p: Point): Point
  // The camera-matched CSS 3D transform the overlay <svg> carries. Applying it
  // maps the overlay's board-coordinate content into pixel register with the
  // canvas (verified against project() in use-board-projection.test.ts).
  overlayStyle: { transform: string; transformOrigin: string }
  camera: BoardCameraState
  size: { w: number; h: number }
  // The logical camera these values were derived from — already clamped, so a
  // control reading it back sees what the board is actually showing rather
  // than what was last requested.
  boardCamera: BoardCamera
  // Gesture handlers write here. The hook is the ONE owner of camera state
  // (port-board-to-webgl-renderer's ownership model); nothing reads a camera
  // value back out of the THREE camera.
  setCamera(next: BoardCamera | ((prev: BoardCamera) => BoardCamera)): void
  // Reset to the default framing — fit-to-lattice at zoom 1x with the pan
  // target at the lattice origin. The `systemId` reset and the manual
  // recenter control both go through this, which is why they agree.
  resetCamera(): void
}

// The pure factory — everything derived from (radius, container size, tilt).
// Exported for tests; the hook is a thin React binding over it.
export function createBoardProjection(
  radius: number,
  w: number,
  h: number,
  tiltDeg: number,
  requested: BoardCamera = DEFAULT_CAMERA,
): BoardProjection {
  const boardCamera = clampCamera(requested, radius)
  const viewBox = fitViewBox(radius)
  const extent = boardExtent(radius)
  const ready = w > 0 && h > 0
  const width = ready ? w : 1
  const height = ready ? h : 1
  const aspect = width / height

  // "meet": whichever axis is tighter decides, exactly as the SVG overlay's
  // preserveAspectRatio does — which is what keeps the two layers in register.
  // The polar board's viewBox is square by construction (a disc's bounding
  // box), so its aspect is exactly 1 and the tighter axis is whichever of the
  // container's is narrower.
  const side = 2 * extent
  const visibleH = aspect > 1 ? side : side / aspect
  // Zoom is a MULTIPLIER over the fit framing: dist = fitDist / zoom. Both
  // published camera expressions are re-derived from it here, on every camera
  // change — under the port's fixed camera a construct-time write was
  // indistinguishable from a correct one, and this is where they diverge.
  const fitDist = visibleH / (2 * TAN_HALF)
  const zoom = boardCamera.zoom
  const dist = fitDist / zoom
  const worldPerPixel = visibleH / (zoom * height)
  // The camera's pan target in WORLD coordinates (boardToWorld is the one
  // y-flip); project/unproject work relative to it.
  const tw = boardToWorld(boardCamera.target)
  const tiltRad = (Math.PI / 180) * tiltDeg
  const sinT = Math.sin(tiltRad)
  const cosT = Math.cos(tiltRad)

  // The CSS perspective distance in element pixels: the GL camera's fit
  // distance expressed at screen scale — h / (2·tan(fov/2)), independent of
  // the viewBox.
  const perspectivePx = height / (2 * TAN_HALF)

  // The overlay <svg>'s own layout scale under preserveAspectRatio="meet":
  // board units → element pixels, before the CSS transform runs. The pan
  // translate is expressed in element pixels, so it needs this.
  const fitScale = Math.min(width, height) / side

  // Board-plane centre is (0,0) (symmetric disc); world = boardToWorld(board).
  // Camera sits below the target, looking up the tilt: C = (0, -sinT·d, cosT·d).
  const project = (p: Point): Point => {
    const wx = p.x - tw.x
    const wy = -p.y - tw.y
    const denom = dist + sinT * wy
    const sx = width / 2 + (perspectivePx * wx) / denom
    const sy = height / 2 - (perspectivePx * cosT * wy) / denom
    return { x: sx, y: sy }
  }

  const unproject = (p: Point): Point => {
    const f = 1 / TAN_HALF
    const xn = (2 * p.x) / width - 1
    const yn = 1 - (2 * p.y) / height
    // View-space ray through the pixel, rotated into world space.
    const dvx = (xn * aspect) / f
    const dvy = yn / f
    const Dx = dvx
    const Dy = dvy * cosT + sinT
    const Dz = dvy * sinT - cosT
    // Intersect z = 0 (the board plane) from C = (0, -sinT·dist, cosT·dist).
    const t = -(cosT * dist) / Dz
    const wx = tw.x + t * Dx
    const wy = tw.y - sinT * dist + t * Dy
    return { x: wx, y: -wy }
  }

  return {
    ready,
    viewBox,
    extent,
    project,
    unproject,
    overlayStyle: {
      // rotateX(+tilt): CSS y runs down, so a positive rotation sends the
      // element's top edge away from the viewer — the same edge the GL camera
      // (below the target, looking up) sends away. Verified numerically
      // against project() in the tests.
      // Composition order is load-bearing: applied right-to-left, the overlay's
      // board-coordinate content is first shifted so the pan target sits at the
      // element centre, then scaled by zoom, and only then tilted and divided.
      // Appending a scale after rotateX instead would put the tilt's
      // perspective divide on the wrong side of the zoom and drift the two
      // camera expressions apart at non-unit zoom.
      transform:
        `perspective(${perspectivePx.toFixed(3)}px) rotateX(${tiltDeg}deg)` +
        ` scale(${zoom.toFixed(6)})` +
        ` translate(${(-boardCamera.target.x * fitScale).toFixed(3)}px, ${(-boardCamera.target.y * fitScale).toFixed(3)}px)`,
      transformOrigin: '50% 50%',
    },
    camera: { dist, tiltRad, worldPerPixel, target: tw },
    size: { w: width, h: height },
    boardCamera,
    // Replaced by the hook's real state writers; the pure factory has no
    // state to write, and a caller of the factory alone has nothing to drive.
    setCamera: () => {},
    resetCamera: () => {},
  }
}

export interface UseBoardProjectionOptions {
  // Tuning-bench override; production always ships the tuned constant.
  tiltDeg?: number
  // The route's system. A new board is a new view: when this changes the
  // camera resets to the default framing, immediately and with no eased
  // transition. Implemented as an effect HERE rather than a `key={systemId}`
  // remount of BoardStage — a remount would tear down and recreate the WebGL
  // context on every system-to-system navigation, and drag the player back
  // through the first-frame loading state each time.
  systemId?: string
}

export function useBoardProjection(
  host: HTMLElement | null,
  radius: number,
  options?: UseBoardProjectionOptions,
): BoardProjection {
  const tiltDeg = options?.tiltDeg ?? BOARD_TILT_DEG
  const systemId = options?.systemId
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [camera, setCameraState] = useState<BoardCamera>(DEFAULT_CAMERA)

  useEffect(() => {
    if (!host) return
    const measure = () => setSize({ w: host.clientWidth, h: host.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [host])

  const resetCamera = useCallback(() => setCameraState(DEFAULT_CAMERA), [])

  // Reset on systemId change only — never on a selection change, never on a
  // realtime refetch. Snapping a player's view back mid-interaction because a
  // routine poll landed is hostile; neither of those is wired to anything
  // here, and the tests assert the absence.
  const firstSystem = useRef(true)
  useEffect(() => {
    if (systemId === undefined) return
    if (firstSystem.current) {
      firstSystem.current = false
      return
    }
    setCameraState(DEFAULT_CAMERA)
  }, [systemId])

  const projection = useMemo(
    () => createBoardProjection(radius, size.w, size.h, tiltDeg, camera),
    [radius, size.w, size.h, tiltDeg, camera],
  )

  return useMemo(
    () => ({ ...projection, setCamera: setCameraState, resetCamera }),
    [projection, resetCamera],
  )
}
