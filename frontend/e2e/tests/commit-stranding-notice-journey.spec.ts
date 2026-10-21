import { test, expect } from '@playwright/test'
import { captureInteriors, openObjectDetails, wakeNewCorp } from '../helpers/space-view'

// Current HUD reconciliation: the legacy Course/Burn/Cut/Stop controls are
// intentionally retired. Command validation/commit contracts remain in unit and
// backend tests, mapped in docs/handoffs/current-hud-test-reconciliation.md.
test.use({ storageState: { cookies: [], origins: [] } })

test('inspecting and plotting does not submit an order or invent a committed stranding notice', async ({ page }) => {
  const interiors = captureInteriors(page)
  const commits: string[] = []
  page.on('request', request => { if (request.method() === 'POST' && /\/orders$/.test(new URL(request.url()).pathname)) commits.push(request.url()) })
  const { homeSystemId } = await wakeNewCorp(page, 'HUD no commit', 'hud-no-commit')
  const world = await interiors.get(homeSystemId)
  const target = world.features.find(feature => feature.type !== 'star' && feature.type !== 'station')!
  expect(target).toBeTruthy()
  const details = await openObjectDetails(page, target.id)
  await details.getByTestId('details-plot').click({ timeout: 10_000 })
  await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', target.id)
  await expect(page.getByTestId('burn-button')).toBeHidden()
  await expect(page.getByTestId('fleet-flight-controls')).toHaveCount(0)
  await expect(page.getByText('This burn will strand your fleet.', { exact: true })).toHaveCount(0)
  expect(commits).toEqual([])
})
