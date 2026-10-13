import { test, expect } from '@playwright/test'
import { captureInteriors, openObjectDetails, selectBody, wakeNewCorp } from '../helpers/space-view'

// Current HUD reconciliation: the legacy Course/Burn/Cut/Stop controls are
// intentionally retired. Command validation/commit contracts remain in unit and
// backend tests, mapped in docs/handoffs/current-hud-test-reconciliation.md.
test.use({ storageState: { cookies: [], origins: [] } })

test('current map selection persists through Objects inspect and Plot course without committing', async ({ page }) => {
  const interiors = captureInteriors(page)
  const { homeSystemId } = await wakeNewCorp(page, 'HUD selection', 'hud-selection')
  const world = await interiors.get(homeSystemId)
  const targets = world.features.filter(feature => feature.type !== 'star').slice(0, 2)
  expect(targets.length).toBe(2)
  for (const target of targets) {
    await selectBody(page, target.id)
    const details = await openObjectDetails(page, target.id)
    await details.getByTestId('details-plot').click({ timeout: 10_000 })
    await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', target.id)
    await expect(page.getByTestId('burn-button')).toBeHidden()
  }
})
