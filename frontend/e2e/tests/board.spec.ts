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

    // The container mounts, then the real SVG board + its star-centre tile render
    // from the seeded interior read (past the "Charting the system…" state).
    await expect(page.getByTestId('system-board-view')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('hex-board')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('hex-lattice')).toBeVisible()
    await expect(page.getByTestId('hex-tile-0,0')).toBeVisible()

    // The facts panel reflects the read (star class + radius/body facts).
    await expect(page.getByTestId('facts-panel')).toContainText('system')
  })
})
