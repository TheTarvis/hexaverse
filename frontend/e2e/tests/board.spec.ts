import { test, expect } from '@playwright/test'
import {
  createBoardProjection,
  BOARD_TILT_DEG,
} from '../../components/board/use-board-projection'
import { fitViewBox, hexesWithinRadius } from '../../lib/hex/pixel'

/**
 * Board view (spec #0007) — drilling into a system renders its fogged interior
 * on the WebGL board. Relies on the live galaxy the backend auto-seeds on boot
 * for emulator runs (galaxy.SeedDevGalaxy): `sys-0` always exists, so the
 * interior read materializes and the board renders.
 *
 * Renderer-agnostic rule: every assertion here is on observable behaviour —
 * selection state, FactsPanel readouts — never renderer node structure. The
 * one deliberate exception is the render-health check, which exists precisely
 * because everything else would pass against a canvas drawing nothing.
 *
 * Fog note: a fresh test user has no corporation coverage yet, so every
 * feature comes back in the astronomical band — but `radius` is always
 * present, which is all this first render needs.
 */

// The seeded system's board radius (backend system params BoardRadius). The
// viewBox assertion below fails loudly if this drifts from the real interior.
const BOARD_RADIUS = 16

test.describe('system board', () => {
  test('drilling into a system renders its board and tiles take a click', async ({ page }) => {
    await page.goto('/systems/sys-0')

    // Auth-gated route: the restored session should keep us off /login.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    // The container mounts, then the board renders from the seeded interior
    // read (past the "Charting the system…" state).
    await expect(page.getByTestId('system-board-view')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('hex-board')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('hex-lattice')).toBeVisible()

    // Render health (independent of picking/overlay math): the canvas
    // actually drew something. Every other assertion resolves through
    // project/unproject or FactsPanel and would pass against a black canvas;
    // this one cannot. Also the observable for "first frame produced" — the
    // loading placeholder must be gone once frames are flowing.
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-testid="board-canvas"]') as
        | (HTMLCanvasElement & { __boardRenderHealth?: () => { calls: number; triangles: number; frames: number } })
        | null
      const health = canvas?.__boardRenderHealth?.()
      return !!health && health.calls > 0 && health.triangles > 0
    }, { timeout: 15_000 })
    await expect(page.getByText(/charting the system/i)).toBeHidden()

    // Tile click via the canvas: no per-tile DOM node exists, so compute a
    // screen point through the SAME pinned camera the board renders with
    // (createBoardProjection is the pure seam) and click the canvas there.
    // The point is a hex-corner neighbourhood of the core cell: inside the
    // lattice, but ≥ a full glyph hit radius from every hex centre, so no
    // feature hit shape can swallow the click.
    const viewBoxAttr = await page.getByTestId('hex-board').getAttribute('viewBox')
    const vb = fitViewBox(hexesWithinRadius(BOARD_RADIUS))
    expect(viewBoxAttr).toBe(`${vb.x} ${vb.y} ${vb.w} ${vb.h}`)

    const stageBox = await page.getByTestId('board-stage').boundingBox()
    expect(stageBox).not.toBeNull()
    const projection = createBoardProjection(BOARD_RADIUS, stageBox!.width, stageBox!.height, BOARD_TILT_DEG)
    const cornerOfCore = { x: 28.6, y: -16.5 } // near a vertex of hex (0,0)
    const screenPt = projection.project(cornerOfCore)
    await page.mouse.click(stageBox!.x + screenPt.x, stageBox!.y + screenPt.y)
    await expect(page.getByTestId('selection')).toContainText('Tile')

    // The facts panel reflects the read (star class + radius/body facts).
    await expect(page.getByTestId('facts-panel')).toContainText('system')
  })
})
