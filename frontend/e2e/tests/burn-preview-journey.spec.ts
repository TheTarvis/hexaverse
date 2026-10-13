import { test, expect } from '@playwright/test'
import { captureInteriors, openObjectDetails, wakeNewCorp } from '../helpers/space-view'

// Current HUD reconciliation: the legacy Course/Burn/Cut/Stop controls are
// intentionally retired. Command validation/commit contracts remain in unit and
// backend tests, mapped in docs/handoffs/current-hud-test-reconciliation.md.
test.use({ storageState: { cookies: [], origins: [] } })

test('current Objects selection can be inspected and plotted while the retired Course remains hidden', async ({ page }) => {
  const interiors = captureInteriors(page)
  const { homeSystemId } = await wakeNewCorp(page, 'HUD objects', 'hud-preview')
  const world = await interiors.get(homeSystemId)
  const targets = world.features.filter(feature => feature.type !== 'star').slice(0, 2)
  expect(targets.length).toBe(2)
  for (const target of targets) {
    const details = await openObjectDetails(page, target.id)
    await expect(details).toContainText(target.id)
    await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', target.id)
    await details.getByRole('button', { name: 'Plot course ↗' }).click({ timeout: 10_000 })
    await expect(page.getByTestId('system-index-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', target.id)
    await expect(page.getByTestId('preview-panel')).toBeHidden()
    await expect(page.getByTestId('burn-button')).toBeHidden()
  }
})
