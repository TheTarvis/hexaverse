import { test, expect } from '@playwright/test'
import { captureInteriors, digits, openObjectDetails, wakeNewCorp } from '../helpers/space-view'

// Course-panel and UI-commit assertions moved to their existing unit/backend
// contracts; the current HUD still presents the server's cost on the fuel gauge.
test.use({ storageState: { cookies: [], origins: [] } })
test('current fuel overlay follows the served quote, selection clearing and viewport without a visible Course card', async ({ page }, info) => {
  const interiors = captureInteriors(page)
  const quotes = new Map<string, { fuelCostTons: number; affordable: boolean }>()
  page.on('response', response => {
    if (!response.ok() || !/\/orders\/preview$/.test(new URL(response.url()).pathname)) return
    const request = response.request().postDataJSON() as { target?: { bodyId?: string }; bodyId?: string }
    const id = request.target?.bodyId ?? request.bodyId
    if (id) void response.json().then(quote => quotes.set(id, quote))
  })
  const { homeSystemId } = await wakeNewCorp(page, 'HUD fuel overlay', 'hud-overlay')
  const gauge = page.getByTestId('fuel-gauge')
  await expect(gauge).not.toHaveAttribute('data-gauge-cost-state')
  const world = await interiors.get(homeSystemId)
  const target = world.features.find(feature => feature.type !== 'star' && feature.type !== 'station' && feature.type !== 'moon')!
  expect(target).toBeTruthy()
  const details = await openObjectDetails(page, target.id)
  await details.getByTestId('details-plot').click({ timeout: 10_000 })
  await expect.poll(() => quotes.get(target.id), { timeout: 20_000 }).toBeTruthy()
  await expect.poll(async () => {
    const quote = quotes.get(target.id)!
    return await gauge.getAttribute('data-gauge-cost-state') === (quote.affordable ? 'affordable' : 'unaffordable')
  }).toBe(true)
  const capacity = await digits(page, 'hold-capacity-total')
  const extent = gauge.locator('[data-gauge-cost-extent]')
  await expect(extent).toBeVisible()
  const width = await extent.evaluate(element => parseFloat((element as HTMLElement).style.width))
  expect(width).toBeCloseTo(Math.min(100, quotes.get(target.id)!.fuelCostTons / capacity * 100), 1)
  await expect(page.getByTestId('preview-panel')).toBeHidden()
  await page.setViewportSize({ width: 1280, height: 720 })
  const box = await page.getByTestId('vitals-strip').boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(1280)
  await info.attach('current-fuel-overlay.png', { body: await page.screenshot(), contentType: 'image/png' })
  await openObjectDetails(page, target.id)
  // Clicking an already-selected map mark clears selection through its keyboard path.
  const mark = page.getByTestId(`body-hit-${target.id}`)
  await page.getByRole('button', { name: 'Hide Objects', exact: true }).click()
  await mark.focus(); await mark.press('Enter')
  await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', '')
  await expect(gauge).not.toHaveAttribute('data-gauge-cost-state')
})
