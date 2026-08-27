import { test, expect } from '@playwright/test'
import {
  createBoardProjection,
  BOARD_TILT_DEG,
} from '../../components/board/use-board-projection'
import { fitViewBox, RADIAL_UNIT } from '../../lib/board'
import { seededSystemId } from '../helpers/seeded-world'

/**
 * Board view (spec #0007) — drilling into a system renders its fogged interior
 * on the WebGL board. Relies on the live galaxy the backend auto-seeds on boot
 * for emulator runs (galaxy.SeedDevGalaxy). Since the endless-galaxy change a
 * system id IS its field coordinate, so the id is read from the committed
 * start-area asset (same seed and params as the dev seed) rather than
 * hard-coded — see e2e/helpers/seeded-world.ts.
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
    await page.goto(`/systems/${seededSystemId(0)}`)

    // Auth-gated route: the restored session should keep us off /login.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    // The container mounts, then the board renders from the seeded interior
    // read (past the "Charting the system…" state).
    await expect(page.getByTestId('system-board-view')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('board-overlay')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('board-lattice')).toBeVisible()

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

    // Cell click via the canvas: no per-cell DOM node exists, so compute a
    // screen point through the SAME pinned camera the board renders with
    // (createBoardProjection is the pure seam) and click the canvas there.
    // The point sits between two ring-1 slot centres: inside the lattice, but
    // ≥ a full glyph hit radius from every cell centre, so no feature hit shape
    // can swallow the click.
    const viewBoxAttr = await page.getByTestId('board-overlay').getAttribute('viewBox')
    expect(viewBoxAttr).toBe(fitViewBox(BOARD_RADIUS))

    const stageBox = await page.getByTestId('board-stage').boundingBox()
    expect(stageBox).not.toBeNull()
    const projection = createBoardProjection(BOARD_RADIUS, stageBox!.width, stageBox!.height, BOARD_TILT_DEG)
    // Ring 1 carries 6 slots (every 60°); 30° is the seam between slot 0 and
    // slot 1, one radial unit out — a bare-cell point that is no body's centre.
    const seam = (30 * Math.PI) / 180
    const bareCell = { x: Math.cos(seam) * RADIAL_UNIT, y: Math.sin(seam) * RADIAL_UNIT }
    const screenPt = projection.project(bareCell)
    await page.mouse.click(stageBox!.x + screenPt.x, stageBox!.y + screenPt.y)
    await expect(page.getByTestId('selection')).toContainText('Ring')

    // The facts panel reflects the read (star class + radius/body facts).
    await expect(page.getByTestId('facts-panel')).toContainText('system')
  })
})
