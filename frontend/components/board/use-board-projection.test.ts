import { describe, it, expect } from 'vitest'
import { hexToPixel, pixelToHex, fitViewBox, hexesWithinRadius } from '@/lib/hex/pixel'
import { boardToWorld, createBoardProjection, BOARD_TILT_DEG } from './use-board-projection'

const W = 1200
const H = 900

describe('createBoardProjection — the point mappings', () => {
  it('project→unproject round-trips board points at the production tilt', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG)
    for (const hex of [
      { q: 0, r: 0 },
      { q: 8, r: -3 },
      { q: -10, r: 4 },
      { q: 0, r: 16 },
    ]) {
      const board = hexToPixel(hex.q, hex.r)
      const round = p.unproject(p.project(board))
      expect(round.x).toBeCloseTo(board.x, 6)
      expect(round.y).toBeCloseTo(board.y, 6)
    }
  })

  it('unproject → pixelToHex picks the clicked tile (the canvas click path)', () => {
    const p = createBoardProjection(16, W, H, BOARD_TILT_DEG)
    const target = { q: 5, r: -2 }
    const screen = p.project(hexToPixel(target.q, target.r))
    expect(pixelToHex(p.unproject(screen))).toEqual(target)
  })

  it('matches the SVG "meet" mapping exactly at tilt 0', () => {
    // At tilt 0 the map is the plain preserveAspectRatio=xMidYMid-meet fit —
    // the register the wipe comparator proved.
    const p = createBoardProjection(16, W, H, 0)
    const vb = fitViewBox(hexesWithinRadius(16))
    const s = Math.min(W / vb.w, H / vb.h)
    const board = hexToPixel(7, 3)
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
    const vb = fitViewBox(hexesWithinRadius(16))
    const visibleH = W / H > vb.w / vb.h ? vb.h : (vb.w * H) / W
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

    const vb = p.viewBox
    const s = Math.min(W / vb.w, H / vb.h)

    for (const board of [hexToPixel(0, 0), hexToPixel(9, -4), hexToPixel(-6, 12), hexToPixel(14, 0)]) {
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
