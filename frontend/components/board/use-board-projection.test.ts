import { describe, it, expect } from 'vitest'
import { boardExtent, cellToPoint, pointToCell, productionSchedule } from '@/lib/board'

const S = productionSchedule()
import { boardToWorld, createBoardProjection, BOARD_TILT_DEG } from './use-board-projection'
import { DEFAULT_CAMERA, ZOOM_MAX, ZOOM_MIN, type BoardCamera } from './board-camera'

const W = 1200
const H = 900

describe('createBoardProjection — the point mappings', () => {
  it('project→unproject round-trips board points at the production tilt', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG)
    for (const cell of [
      { ring: 0, slot: 0 },
      { ring: 8, slot: 3 },
      { ring: 10, slot: 4 },
      { ring: 16, slot: 0 },
    ]) {
      const board = cellToPoint(cell, S)
      const round = p.unproject(p.project(board))
      expect(round.x).toBeCloseTo(board.x, 6)
      expect(round.y).toBeCloseTo(board.y, 6)
    }
  })

  it('unproject → pointToCell picks the clicked cell (the canvas click path)', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG)
    const target = { ring: 5, slot: 2 }
    const screen = p.project(cellToPoint(target, S))
    expect(pointToCell(p.unproject(screen), S)).toEqual(target)
  })

  it('matches the SVG "meet" mapping exactly at tilt 0', () => {
    // At tilt 0 the map is the plain preserveAspectRatio=xMidYMid-meet fit —
    // the register the wipe comparator proved.
    const p = createBoardProjection(16, W, H, 0)
    // The polar board's viewBox is square by construction, so the "meet" scale
    // is just the tighter container axis over the board's full width.
    const side = 2 * boardExtent(16)
    const s = Math.min(W / side, H / side)
    const board = cellToPoint({ ring: 7, slot: 3 }, S)
    const screen = p.project(board)
    expect(screen.x).toBeCloseTo(W / 2 + board.x * s, 6)
    expect(screen.y).toBeCloseTo(H / 2 + board.y * s, 6)
  })

  it('centres the origin at the container centre at any tilt', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG)
    const screen = p.project({ x: 0, y: 0 })
    expect(screen.x).toBeCloseTo(W / 2, 6)
    expect(screen.y).toBeCloseTo(H / 2, 6)
  })

  it('computes worldPerPixel as visible height over container height', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG)
    const side = 2 * boardExtent(16)
    const visibleH = W / H > 1 ? side : (side * H) / W
    expect(p.camera.worldPerPixel).toBeCloseTo(visibleH / H, 9)
  })

  it('reports not-ready (and stays finite) for a zero-size container', () => {
    const p = createBoardProjection(16, 0, 0, BOARD_TILT_DEG)
    expect(p.ready).toBe(false)
    const s = p.project({ x: 10, y: 10 })
    expect(Number.isFinite(s.x)).toBe(true)
  })
})

describe('createBoardProjection — the overlay CSS transform', () => {
  // The overlay is authored in board coordinates and carried into register by
  // `perspective(P) rotateX(θ)`. This test applies that transform BY THE CSS
  // SPEC's matrix semantics (rotate, then perspective divide, about the
  // element centre) and asserts it lands every point exactly where project()
  // does — the registration the whole hit-layer design rests on.
  it('maps board points to the same screen pixels as project()', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG)
    const m = /perspective\(([\d.]+)px\) rotateX\(([-\d.]+)deg\)/.exec(p.overlayStyle.transform)
    expect(m).not.toBeNull()
    const P = Number(m![1])
    const theta = (Number(m![2]) * Math.PI) / 180

    const side = 2 * p.extent
    const s = Math.min(W / side, H / side)

    for (const board of [
      cellToPoint({ ring: 0, slot: 0 }, S),
      cellToPoint({ ring: 9, slot: 4 }, S),
      cellToPoint({ ring: 6, slot: 12 }, S),
      cellToPoint({ ring: 14, slot: 0 }, S),
    ]) {
      // The overlay svg maps board → element pixels by the meet fit (centre
      // at the element centre, scale s), then the CSS transform applies about
      // the centre: rotateX (CSS y down, z toward viewer), then perspective.
      const ex = board.x * s
      const ey = board.y * s
      const ry = ey * Math.cos(theta) // z=0 → y' = y·cosθ
      const rz = ey * Math.sin(theta) // z' = y·sinθ
      const wdiv = 1 - rz / P
      const cssX = W / 2 + ex / wdiv
      const cssY = H / 2 + ry / wdiv

      const gl = p.project(board)
      expect(cssX).toBeCloseTo(gl.x, 5)
      expect(cssY).toBeCloseTo(gl.y, 5)
    }
  })
})

describe('boardToWorld', () => {
  it('flips y exactly once and nothing else', () => {
    expect(boardToWorld({ x: 12, y: -7 })).toEqual({ x: 12, y: 7 })
  })
})

// The reachable camera domain: both ends of the zoom clamp, unit zoom, and an
// off-centre pan target. Under the port's FIXED camera the two published
// camera expressions (project/unproject and the overlay's CSS transform) agreed
// by construction — they were tuned once, at one camera. This change is the
// first thing that moves the camera at all, so agreement across pan × zoom is
// a property with a gate rather than a consequence of there being one camera.
const CAMERAS: { name: string; camera: BoardCamera }[] = [
  { name: 'the default framing', camera: DEFAULT_CAMERA },
  { name: `the zoom floor (${ZOOM_MIN}x)`, camera: { zoom: ZOOM_MIN, target: { x: 0, y: 0 } } },
  { name: `the zoom ceiling (${ZOOM_MAX}x)`, camera: { zoom: ZOOM_MAX, target: { x: 0, y: 0 } } },
  { name: 'an off-centre pan target', camera: { zoom: 1, target: { x: 140, y: -95 } } },
  { name: 'pan and zoom together', camera: { zoom: 3.25, target: { x: -210, y: 60 } } },
]

const PROBE_CELLS = [
  { ring: 0, slot: 0 },
  { ring: 4, slot: 7 },
  { ring: 9, slot: 4 },
  { ring: 14, slot: 0 },
]

describe('createBoardProjection — picking under pan and zoom', () => {
  it.each(CAMERAS)('round-trips project→unproject at $name', ({ camera }) => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG, camera)
    for (const cell of PROBE_CELLS) {
      const board = cellToPoint(cell, S)
      const round = p.unproject(p.project(board))
      expect(round.x).toBeCloseTo(board.x, 5)
      expect(round.y).toBeCloseTo(board.y, 5)
    }
  })

  it.each(CAMERAS)('resolves a bare-cell click to the containing cell at $name', ({ camera }) => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG, camera)
    for (const cell of PROBE_CELLS) {
      const screen = p.project(cellToPoint(cell, S))
      expect(pointToCell(p.unproject(screen), S)).toEqual(cell)
    }
  })

  it('keeps the pan target at the container centre', () => {
    const camera = { zoom: 2, target: { x: 140, y: -95 } }
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG, camera)
    const screen = p.project(camera.target)
    expect(screen.x).toBeCloseTo(W / 2, 5)
    expect(screen.y).toBeCloseTo(H / 2, 5)
  })

  it('resolves a click outside the lattice to a point outside the rim', () => {
    // The far corner of the container at the zoom floor is well off the board;
    // the stage's picking path distinguishes it by radius against the rim.
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG, { zoom: ZOOM_MIN, target: { x: 0, y: 0 } })
    const corner = p.unproject({ x: 2, y: H - 2 })
    expect(Math.hypot(corner.x, corner.y)).toBeGreaterThan(p.extent)
  })

  it('clamps a camera it is handed out of range rather than projecting from it', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG, { zoom: 99, target: { x: 9_000, y: 0 } })
    expect(p.boardCamera.zoom).toBe(ZOOM_MAX)
    expect(Math.hypot(p.boardCamera.target.x, p.boardCamera.target.y)).toBeCloseTo(16 * 34, 6)
  })

  it('re-derives worldPerPixel with zoom, not only on resize', () => {
    const fit = createBoardProjection(16, W, H, BOARD_TILT_DEG)
    const zoomed = createBoardProjection(16, W, H, BOARD_TILT_DEG, { zoom: 4, target: { x: 0, y: 0 } })
    expect(zoomed.camera.worldPerPixel).toBeCloseTo(fit.camera.worldPerPixel / 4, 9)
    expect(zoomed.camera.dist).toBeCloseTo(fit.camera.dist / 4, 9)
  })

  it('hands the canvas its pan target in GL world space (y flipped exactly once)', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG, { zoom: 1, target: { x: 40, y: -25 } })
    expect(p.camera.target).toEqual({ x: 40, y: 25 })
  })
})

describe('createBoardProjection — the two camera expressions agree across pan × zoom', () => {
  // The gate for the port's canvas/overlay registration surviving a moving
  // camera: glyph hit targets ride the CSS transform while tile picking rides
  // project(), so if these two ever disagree, picking silently breaks for
  // everything drawn. No GL context needed.
  it.each(CAMERAS)('maps board points to the same screen pixels at $name', ({ camera }) => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG, camera)
    const m =
      /perspective\(([\d.]+)px\) rotateX\((-?[\d.]+)deg\) scale\(([\d.]+)\) translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
        p.overlayStyle.transform,
      )
    expect(m).not.toBeNull()
    const P = Number(m![1])
    const theta = (Number(m![2]) * Math.PI) / 180
    const zoom = Number(m![3])
    const tx = Number(m![4])
    const ty = Number(m![5])

    const side = 2 * p.extent
    const fitScale = Math.min(W, H) / side

    for (const cell of PROBE_CELLS) {
      const board = cellToPoint(cell, S)
      // Applied right-to-left, by the CSS spec's matrix semantics: translate,
      // then scale, then rotateX about the element centre, then the
      // perspective divide.
      const ex = (board.x * fitScale + tx) * zoom
      const ey = (board.y * fitScale + ty) * zoom
      const ry = ey * Math.cos(theta)
      const rz = ey * Math.sin(theta)
      const wdiv = 1 - rz / P
      const cssX = W / 2 + ex / wdiv
      const cssY = H / 2 + ry / wdiv

      const gl = p.project(board)
      // Sub-hundredth-of-a-pixel: the residual is the transform STRING's own
      // rounding (the pan translate is emitted at 3 decimals and then
      // multiplied by zoom), not a disagreement between the two expressions.
      expect(cssX).toBeCloseTo(gl.x, 2)
      expect(cssY).toBeCloseTo(gl.y, 2)
    }
  })
})
