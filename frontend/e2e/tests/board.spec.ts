import { test, expect } from '@playwright/test'

/**
 * Board view (spec #0007) — drilling into a system renders its fogged interior
 * as an SVG hex board. Relies on the live galaxy the backend auto-seeds on boot
 * for emulator runs (galaxy.SeedDevGalaxy): `sys-0` always exists, so the
 * interior read materializes and the lattice renders.
 *
 * Fog note: a fresh test user has no corporation coverage yet, so every feature
 * comes back in the astronomical band — but `radius` is always present, which is
 * all this first render needs.
 */
test.describe('system board', () => {
  test('drilling into a system renders its hex board', async ({ page }) => {
    await page.goto('/systems/sys-0')

    // Auth-gated route: the restored session should keep us off /login.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    // The container mounts, then the real board renders from the seeded interior
    // read (past the "Charting the system…" state).
    await expect(page.getByTestId('system-board-view')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('hex-board')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('hex-lattice')).toBeVisible()

    // The lattice produced real, selectable tiles. Deliberately ANY tile, not a
    // pinned coordinate: the property under test is "the board rendered tiles and
    // they take a click", and the observable is the resulting tile selection in
    // the facts panel — which stays true of a renderer with no per-tile DOM node.
    const tile = page.locator('[data-testid^="hex-tile-"]').first()
    await expect(tile).toBeVisible()
    await tile.click()
    await expect(page.getByTestId('selection')).toContainText('Tile')

    // The facts panel reflects the read (star class + radius/body facts).
    await expect(page.getByTestId('facts-panel')).toContainText('system')
  })
})
