import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  captureInteriors,
  mineableBodyId,
  openObjectDetails,
  pickAnyOnScreenBodyByPointer,
  prepareCommandHud,
  stationFeatureId,
  wakeNewCorp,
} from '../helpers/space-view'

/**
 * Current player-facing space journey: spawn, pointer pick, inspect Objects,
 * plot a course, and inspect a disclosed gate through the Objects list.
 *
 * The HUD currently hides Burn, Cut drive, Stop, and off-screen reach. This
 * file therefore no longer claims the former burn/mine/sell/refuel/jump UI
 * chain is playable. Command logic remains covered below the browser; other
 * observation journeys arrange movement explicitly through the real backend.
 * No API command is substituted for a player's command in this journey.
 */
const cfg = resolveE2EConfig()
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('the continuous-space view through the current HUD', () => {
  test('spawn, select a rendered body, inspect Objects and plot a course', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')
    const interiors = captureInteriors(page)
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E Journey', 'journey')
    await expect(page.getByTestId('renderer-unsupported')).toHaveCount(0)
    await expect(page.getByTestId('renderer-interrupted')).toHaveCount(0)
    await expect(page.locator('[data-testid^="body-hit-feat-"]').first()).toBeAttached()
    await expect(page.getByTestId('vitals-fleet-id')).toHaveText(fleetId)
    await expect(page.getByTestId('vitals-state-pill')).toContainText(/docked at station/i)

    // Keep real pointer picking coverage independently of the Objects list.
    await pickAnyOnScreenBodyByPointer(page)
    const home = await interiors.get(homeSystemId)
    const stationId = stationFeatureId(home)
    expect(stationId, 'a spawn home must disclose its station').toBeTruthy()
    const lodeId = mineableBodyId(home, stationId ?? undefined)
    expect(lodeId, 'the served home must disclose a mineable body').toBeTruthy()

    const details = await openObjectDetails(page, lodeId!)
    await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', lodeId!)
    await expect(details).toContainText(lodeId!)
    await expect(details.getByTestId('index-focus')).toBeEnabled()
    await details.getByTestId('index-focus').click()
    await expect(details.getByTestId('details-plot')).toBeEnabled()
    await details.getByTestId('details-plot').click()
    await expect(page.getByTestId('system-index-search')).toBeHidden()
    await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', lodeId!)
    await expect(page.getByTestId('burn-button'), 'Plot course currently does not expose a burn commit').toBeHidden()
    await expect(page.getByTestId('fleet-flight-controls')).toBeHidden()
    await expect(page.getByTestId('vitals-state-pill'), 'plotting alone does not move the hull').toContainText(/docked at station/i)

    const station = await openObjectDetails(page, stationId!)
    await expect(station).toContainText(stationId!)
    await expect(page.getByTestId('hold-readout')).toBeVisible()
    await expect(page.getByTestId('balance-readout')).toBeVisible()

    const gate = home.laneGates.find(candidate => candidate.id)
    expect(gate, 'the served home must disclose a lane gate').toBeTruthy()
    const gateDetails = await openObjectDetails(page, gate!.id!)
    await expect(gateDetails).toContainText(gate!.id!)
    await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', gate!.id!)
    await expect(gateDetails.getByTestId('index-focus')).toBeEnabled()
    await gateDetails.getByTestId('index-focus').click()
    await prepareCommandHud(page)
    await expect(page.getByTestId('vitals-fleet-id')).toHaveText(fleetId)
  })
})
