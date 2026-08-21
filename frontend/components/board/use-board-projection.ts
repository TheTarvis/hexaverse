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
// Coordinate convention, pinned once: `project`/`unproject` speak lib/hex BOARD
// pixels (y-down, the Go-pinned convention glyph-geometry emits). The y-flip to
// the GL world's y-up happens HERE (boardToWorld), exactly once. No caller
// negates a y.

import { useEffect, useMemo, useState } from 'react'
import { fitViewBox, hexesWithinRadius, type Point, type ViewBox } from '@/lib/hex/pixel'
import type { BoardCameraState } from './webgl/contract'

// The camera's vertical field of view — the spike's proven framing.
export const BOARD_FOV_DEG = 38

// The tuned camera tilt the port ships at (Travis's 2026-08-11 settings) — a
// production constant, not user-adjustable. The tuning bench may override it.
export const BOARD_TILT_DEG = 14

const HALF_FOV = (Math.PI / 180) * (BOARD_FOV_DEG / 2)
const TAN_HALF = Math.tan(HALF_FOV)

// boardToWorld — board pixels (y down) → GL world plane (y up). The board's
// tile disc is symmetric about the origin, so the viewBox centre is exactly
// (0,0) and the flip is a pure negation. THE one home of the y-flip.
export function boardToWorld(p: Point): Point {
  return { x: p.x, y: -p.y }
}

export interface BoardProjection {
  // False until the container has been measured (zero-size container).
  ready: boolean
  viewBox: ViewBox
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
}

// The pure factory — everything derived from (radius, container size, tilt).
// Exported for tests; the hook is a thin React binding over it.
export function createBoardProjection(radius: number, w: number, h: number, tiltDeg: number): BoardProjection {
  const viewBox = fitViewBox(hexesWithinRadius(radius))
  const ready = w > 0 && h > 0
  const width = ready ? w : 1
  const height = ready ? h : 1
  const aspect = width / height
  const vbAspect = viewBox.w / viewBox.h

  // "meet": whichever axis is tighter decides, exactly as the SVG overlay's
  // preserveAspectRatio does — which is what keeps the two layers in register.
  const visibleH = aspect > vbAspect ? viewBox.h : viewBox.w / aspect
  const dist = visibleH / (2 * TAN_HALF)
  const worldPerPixel = visibleH / height
  const tiltRad = (Math.PI / 180) * tiltDeg
  const sinT = Math.sin(tiltRad)
  const cosT = Math.cos(tiltRad)

  // The CSS perspective distance in element pixels: the GL camera's fit
  // distance expressed at screen scale — h / (2·tan(fov/2)), independent of
  // the viewBox.
  const perspectivePx = height / (2 * TAN_HALF)

  // Board-plane centre is (0,0) (symmetric disc); world = boardToWorld(board).
  // Camera sits below the target, looking up the tilt: C = (0, -sinT·d, cosT·d).
  const project = (p: Point): Point => {
    const wx = p.x
    const wy = -p.y
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
    const wx = t * Dx
    const wy = -sinT * dist + t * Dy
    return { x: wx, y: -wy }
  }

  return {
    ready,
    viewBox,
    project,
    unproject,
    overlayStyle: {
      // rotateX(+tilt): CSS y runs down, so a positive rotation sends the
      // element's top edge away from the viewer — the same edge the GL camera
      // (below the target, looking up) sends away. Verified numerically
      // against project() in the tests.
      transform: `perspective(${perspectivePx.toFixed(3)}px) rotateX(${tiltDeg}deg)`,
      transformOrigin: '50% 50%',
    },
    camera: { dist, tiltRad, worldPerPixel },
    size: { w: width, h: height },
  }
}

export interface UseBoardProjectionOptions {
  // Tuning-bench override; production always ships the tuned constant.
  tiltDeg?: number
}

export function useBoardProjection(
  host: HTMLElement | null,
  radius: number,
  options?: UseBoardProjectionOptions,
): BoardProjection {
  const tiltDeg = options?.tiltDeg ?? BOARD_TILT_DEG
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    if (!host) return
    const measure = () => setSize({ w: host.clientWidth, h: host.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [host])

  return useMemo(
    () => createBoardProjection(radius, size.w, size.h, tiltDeg),
    [radius, size.w, size.h, tiltDeg],
  )
}
