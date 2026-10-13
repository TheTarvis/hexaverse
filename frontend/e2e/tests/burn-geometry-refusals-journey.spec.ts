import { test, expect } from '@playwright/test'
import { captureInteriors, openObjectDetails, wakeNewCorp } from '../helpers/space-view'

// Current HUD reconciliation: the legacy Course/Burn/Cut/Stop controls are
// intentionally retired. Command validation/commit contracts remain in unit and
// backend tests, mapped in docs/handoffs/current-hud-test-reconciliation.md.
test.use({ storageState: { cookies: [], origins: [] } })

test('current HUD inspects the served star without offering a retired burn action', async ({ page }) => {
  const interiors = captureInteriors(page)
  const { homeSystemId } = await wakeNewCorp(page, 'HUD geometry', 'hud-geometry')
  const world = await interiors.get(homeSystemId)
  const star = world.features.find(feature => feature.type === 'star')
  expect(star, 'the served system includes its star').toBeTruthy()
  const details = await openObjectDetails(page, star!.id)
  await expect(details).toContainText(star!.id)
  await expect(details.getByTestId('index-focus')).toBeEnabled()
  await expect(details.getByTestId('details-plot')).toHaveCount(0)
  await expect(page.getByTestId('burn-button')).toBeHidden()
  await expect(page.getByTestId('preview-panel')).toBeHidden()
})
