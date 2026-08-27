import { test, expect, type Page } from '@playwright/test'
import { createBoardProjection, BOARD_TILT_DEG } from '../../components/board/use-board-projection'
import { DRAG_THRESHOLD_PX, WHEEL_NOTCH_DELTA_Y, WHEEL_ZOOM_BASE } from '../../components/board/board-camera'
import { RADIAL_UNIT } from '../../lib/board'
import { seededSystemId } from '../helpers/seeded-world'

/**
 * Board camera (migrate-renderer-to-polar-board, `### Requirement: Board
 * Camera Pan and Zoom` and friends) — the properties that only exist once the
 * camera can actually move.
 *
 * The load-bearing one is picking-after-pan/zoom. `useBoardProjection`
 * publishes the camera twice — `project`/`unproject` for tile picking, the
 * overlay's CSS 3D transform for glyph hit targets — and under the port's
 * fixed camera those two agreed by construction. These tests are what says
 * they still agree once the camera is somewhere else.
 *
 * Camera moves here are driven from the KEYBOARD wherever a later assertion
 * needs to know where the camera ended up: arrow/zoom presses land exactly one
 * radial unit and one wheel notch, so the expected screen position can be
 * derived through the same pure factory the board renders with rather than
 * read back out of the thing under test.
 */

const BOARD_RADIUS = 16

// The camera after `panAndZoom()` below: two arrow presses right, one zoom-in.
const PANNED = {
  zoom: Math.pow(WHEEL_ZOOM_BASE, -WHEEL_NOTCH_DELTA_Y),
  target: { x: 2 * RADIAL_UNIT, y: 0 },
}

async function openBoard(page: Page) {
  await page.goto(`/systems/${seededSystemId(0)}`)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
  await expect(page.getByTestId('board-overlay')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/charting the system/i)).toBeHidden({ timeout: 15_000 })
  const box = await page.getByTestId('board-stage').boundingBox()
  expect(box).not.toBeNull()
  return box!
}

// Focus a camera control, then drive the camera by key. Focusing a control is
// itself part of the contract — the controls hold the board's first tab stops.
async function panAndZoom(page: Page) {
  await page.getByTestId('camera-zoom-in').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('+')
}

// The drawn centre of whichever feature glyph sits nearest the middle of the
// board region — the one least likely to be under a floating panel.
async function centralGlyph(page: Page, box: { x: number; y: number; width: number; height: number }) {
  await expect(page.locator('[data-testid^="feature-glyph-"]').first()).toBeVisible({ timeout: 15_000 })
  const boxes = await page.locator('[data-testid^="feature-glyph-"]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }),
  )
  expect(boxes.length).toBeGreaterThan(0)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return boxes.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0]!
}

// A screen point that is BOTH off the lattice and actually on the board — the
// two halves the outside-the-lattice assertion needs and neither of which is
// safe to assume.
//
// Off the lattice is not the same as "far from the centre": the board's viewBox
// is a square around the disc and the container fits it with `meet`, so on a
// landscape container the only genuinely-off-lattice region is the left/right
// margin — the top and bottom edges are still inside the rim. And the board
// region is not empty: the roster column, FactsPanel, the dev BoardTuning
// panel, and this change's own camera controls all float over its edges, and a
// click that lands on one of those is not a board click at all.
//
// So: enumerate candidates, keep the ones the projection says are outside the
// rim (the same `(radius + 0.5) * RADIAL_UNIT` test BoardStage's own picking
// path uses), and let the page say which of those the board would actually
// receive.
async function offLatticePoint(
  page: Page,
  projection: { unproject(p: { x: number; y: number }): { x: number; y: number } },
  box: { x: number; y: number; width: number; height: number },
) {
  const rim = (BOARD_RADIUS + 0.5) * RADIAL_UNIT
  const candidates: { x: number; y: number }[] = []
  for (let fx = 0.02; fx <= 0.98; fx += 0.02) {
    for (let fy = 0.1; fy <= 0.9; fy += 0.05) {
      const p = { x: box.width * fx, y: box.height * fy }
      const b = projection.unproject(p)
      if (Math.hypot(b.x, b.y) > rim) candidates.push(p)
    }
  }
  expect(candidates.length, 'some part of the board region is off the lattice').toBeGreaterThan(0)

  const hit = await page.evaluate(
    ({ pts, origin }) => {
      for (const p of pts) {
        const el = document.elementFromPoint(origin.x + p.x, origin.y + p.y)
        if (!el) continue
        if (!el.closest('[data-testid="board-stage"]')) continue
        // A glyph hit shape or a camera control would swallow it.
        if (el.closest('[data-board-camera-control]')) continue
        if (el.closest('[data-testid^="feature-glyph-"], [data-testid^="fleet-glyph-"], [data-testid^="gate-glyph-"]')) continue
        return p
      }
      return null
    },
    { pts: candidates, origin: { x: box.x, y: box.y } },
  )
  expect(hit, 'an off-lattice point the board itself would receive').not.toBeNull()
  return { x: box.x + hit!.x, y: box.y + hit!.y }
}

function overlayCamera(transform: string): { zoom: number; tx: number; ty: number } {
  const m = /scale\((-?[\d.]+)\) translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(transform)
  if (!m) throw new Error(`no camera in overlay transform: ${transform}`)
  return { zoom: Number(m[1]), tx: Number(m[2]), ty: Number(m[3]) }
}

async function readCamera(page: Page) {
  const transform = await page.getByTestId('board-overlay').evaluate((el) => (el as SVGElement).style.transform)
  return overlayCamera(transform)
}

test.describe('board camera', () => {
  test('a pointer drag pans the board, and does not change the selection', async ({ page }) => {
    const box = await openBoard(page)
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await expect(page.getByTestId('selection-prompt')).toBeVisible()
    const before = await readCamera(page)

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 60, cy + 20, { steps: 6 })
    await page.mouse.up()

    const after = await readCamera(page)
    expect(after.tx).not.toBe(before.tx)
    // A pan is not a click: the selection is exactly where it was.
    await expect(page.getByTestId('selection-prompt')).toBeVisible()
  })

  test('a drag that BEGINS over a mark still pans, and leaves the selection alone', async ({ page }) => {
    const box = await openBoard(page)
    const from = await centralGlyph(page, box)
    const before = await readCamera(page)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 70, from.y + 30, { steps: 6 })
    await page.mouse.up()

    // The dead-zone regression this change's bind-at-the-stage decision
    // exists to prevent: a canvas-bound listener would have seen none of this.
    expect((await readCamera(page)).tx).not.toBe(before.tx)
    await expect(page.getByTestId('selection-prompt')).toBeVisible()
    expect(box.width).toBeGreaterThan(0)
  })

  test('a press-release under the movement threshold still selects the mark under it', async ({ page }) => {
    const box = await openBoard(page)
    const from = await centralGlyph(page, box)

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + (DRAG_THRESHOLD_PX - 1), from.y)
    await page.mouse.up()

    await expect(page.getByTestId('selection-prompt')).toBeHidden()
  })

  test('a wheel gesture zooms — including one that lands on a mark', async ({ page }) => {
    const box = await openBoard(page)
    const before = await readCamera(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -400)
    const zoomedIn = await readCamera(page)
    expect(zoomedIn.zoom).toBeGreaterThan(before.zoom)

    const mark = await centralGlyph(page, box)
    await page.mouse.move(mark.x, mark.y)
    await page.mouse.wheel(0, -400)
    expect((await readCamera(page)).zoom).toBeGreaterThan(zoomedIn.zoom)
  })

  test('zoom holds at both ends of its clamp', async ({ page }) => {
    const box = await openBoard(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -1200)
    expect((await readCamera(page)).zoom).toBeCloseTo(6, 3)
    for (let i = 0; i < 16; i++) await page.mouse.wheel(0, 1200)
    expect((await readCamera(page)).zoom).toBeCloseTo(0.25, 3)
  })

  test('picking still resolves after a pan and zoom — mark, bare cell, and outside the lattice', async ({ page }) => {
    const box = await openBoard(page)
    await panAndZoom(page)

    // The camera is exactly where the keyboard put it.
    const cam = await readCamera(page)
    expect(cam.zoom).toBeCloseTo(PANNED.zoom, 4)

    const projection = createBoardProjection(BOARD_RADIUS, box.width, box.height, BOARD_TILT_DEG, PANNED)

    // 1. A bare cell: a point on the seam between two ring-1 slots, no body's
    //    centre, projected through the moved camera.
    const seam = (30 * Math.PI) / 180
    const bare = projection.project({ x: Math.cos(seam) * RADIAL_UNIT, y: Math.sin(seam) * RADIAL_UNIT })
    await page.mouse.click(box.x + bare.x, box.y + bare.y)
    await expect(page.getByTestId('selection')).toContainText('Ring')

    // 2. A mark, clicked at its DRAWN position — the glyph's real box, which
    //    rides the overlay's camera-matched transform. The most CENTRAL glyph
    //    is chosen deliberately: the roster/market column and FactsPanel float
    //    over the board's edges, and an occluded glyph would fail this on
    //    layout rather than on the picking property under test.
    const centre = await centralGlyph(page, box)
    await page.mouse.click(centre.x, centre.y)
    // The selection moved off the bare cell and onto the body.
    await expect(page.getByTestId('selection')).not.toContainText('Ring')
    await expect(page.getByTestId('selection-prompt')).toBeHidden()

    // 3. Outside the lattice clears the selection.
    const outside = await offLatticePoint(page, projection, box)
    await page.mouse.click(outside.x, outside.y)
    await expect(page.getByTestId('selection-prompt')).toBeVisible()
  })

  test('the camera is keyboard-operable, and reports hitting a clamp', async ({ page }) => {
    await openBoard(page)
    const before = await readCamera(page)

    await page.getByTestId('camera-zoom-in').focus()
    await page.keyboard.press('ArrowRight')
    const panned = await readCamera(page)
    expect(panned.tx).not.toBe(before.tx)
    // Nowhere near a clamp: no at-limit state.
    await expect(page.getByTestId('board-stage')).not.toHaveAttribute('data-camera-at-limit', /.*/)

    await page.keyboard.press('+')
    expect((await readCamera(page)).zoom).toBeGreaterThan(panned.zoom)

    // Drive the zoom to its ceiling and press again — the at-limit state is
    // observable in the DOM, not only in the pixels.
    for (let i = 0; i < 20; i++) await page.keyboard.press('+')
    await expect(page.getByTestId('board-stage')).toHaveAttribute('data-camera-at-limit', 'zoom-max')
    await expect(page.getByTestId('camera-limit-status')).toContainText(/zoomed in/i)
  })

  test('the recenter control restores the default framing without touching the selection', async ({ page }) => {
    const box = await openBoard(page)
    const mark = await centralGlyph(page, box)
    await page.mouse.click(mark.x, mark.y)
    await expect(page.getByTestId('selection-prompt')).toBeHidden()

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -600)
    await page.getByTestId('camera-zoom-in').focus()
    await page.keyboard.press('ArrowRight')
    expect((await readCamera(page)).zoom).toBeGreaterThan(1)

    await page.getByTestId('camera-recenter').click()
    expect(await readCamera(page)).toEqual({ zoom: 1, tx: 0, ty: 0 })
    // Activating a camera control is not a board click.
    await expect(page.getByTestId('selection-prompt')).toBeHidden()
  })

  test('the recenter control is activatable from the keyboard', async ({ page }) => {
    const box = await openBoard(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -600)
    expect((await readCamera(page)).zoom).toBeGreaterThan(1)

    await page.getByTestId('camera-recenter').focus()
    await page.keyboard.press('Enter')
    expect(await readCamera(page)).toEqual({ zoom: 1, tx: 0, ty: 0 })
  })

  test('the camera survives a selection change and resets on a systemId change', async ({ page }) => {
    const box = await openBoard(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -600)
    const zoomed = await readCamera(page)

    // A selection change must not snatch the view back.
    const mark = await centralGlyph(page, box)
    await page.mouse.click(mark.x, mark.y)
    await expect(page.getByTestId('selection-prompt')).toBeHidden()
    expect(await readCamera(page)).toEqual(zoomed)

    // A new board is a new view. NOTE: page.goto is a full navigation, which
    // remounts as well as changing the systemId — it smoke-checks the outcome,
    // not the mechanism. The mechanism (an effect on systemId inside the hook,
    // NOT a key={systemId} remount that would tear down the WebGL context on
    // every system-to-system move) is gated in
    // components/board/use-board-gestures.test.tsx, which rerenders the SAME
    // BoardStage instance with a new systemId.
    await page.goto(`/systems/${seededSystemId(1)}`)
    await expect(page.getByTestId('board-overlay')).toBeVisible({ timeout: 15_000 })
    expect(await readCamera(page)).toEqual({ zoom: 1, tx: 0, ty: 0 })
  })
})

test.describe('board camera — touch', () => {
  // The reachable half of touch input. Multi-touch pinch needs raw CDP touch
  // dispatch and is asserted at the pure-reducer level instead; single-finger
  // tap and drag are the half that exercises the DOM event plumbing
  // (`touchstart`'s preventDefault() vs. the synthesized `click`) no reducer
  // test can see.
  test.use({ hasTouch: true })

  test('a stationary tap on a mark selects it', async ({ page }) => {
    const box = await openBoard(page)
    const mark = await centralGlyph(page, box)
    await page.touchscreen.tap(mark.x, mark.y)
    await expect(page.getByTestId('selection-prompt')).toBeHidden()
  })

  test('a single-finger drag past the threshold pans without changing the selection', async ({ page }) => {
    const box = await openBoard(page)
    await expect(page.getByTestId('selection-prompt')).toBeVisible()
    const before = await readCamera(page)

    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    // page.touchscreen has no drag; dispatch the pointer stream a touch
    // produces, which is what the stage's listeners actually consume.
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 80, from.y, { steps: 8 })
    await page.mouse.up()

    expect((await readCamera(page)).tx).not.toBe(before.tx)
    await expect(page.getByTestId('selection-prompt')).toBeVisible()
  })
})
