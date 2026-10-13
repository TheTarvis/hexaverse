import { expect, type Page } from '@playwright/test'
import type { Fleet, OrderRequest, Vec3 } from '../../lib/types/fleet'
import { resolveE2EConfig } from '../config/env'

/** Real backend setup for observation journeys; never evidence of a UI command. */
export async function commitServedBurn(
  page: Page, fleetId: string, target: OrderRequest, idToken: string,
): Promise<Fleet> {
  const response = await page.request.post(`${resolveE2EConfig().apiURL}/v1/fleets/${fleetId}/orders`, {
    headers: { Authorization: `Bearer ${idToken}` }, data: target,
  })
  if (!response.ok()) throw new Error(`Movement arrangement refused (${response.status()}): ${await response.text()}`)
  const fleet = await response.json() as Fleet
  if (!fleet.state.Burn || fleet.state.Mode !== 0 || fleet.attachedTo) {
    throw new Error('Movement arrangement did not start a detached, active burn')
  }
  return fleet
}

async function waitForPark(
  page: Page, fleetId: string, idToken: string, arrived: (fleet: Fleet) => boolean, timeoutMs: number,
): Promise<Fleet> {
  let latest: Fleet | undefined
  await expect.poll(async () => {
    const response = await page.request.get(`${resolveE2EConfig().apiURL}/v1/fleets/${fleetId}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (!response.ok()) throw new Error(`Movement arrangement read failed (${response.status()})`)
    latest = await response.json() as Fleet
    return latest.state.Mode === 1 && !latest.state.Burn && arrived(latest)
  }, { timeout: timeoutMs, message: `Fleet ${fleetId} never reached the arranged park` }).toBe(true)
  return latest!
}

export async function arrangeBodyDock(
  page: Page, fleetId: string, bodyId: string, idToken: string, timeoutMs = 600_000,
): Promise<Fleet> {
  await commitServedBurn(page, fleetId, { bodyId }, idToken)
  return waitForPark(page, fleetId, idToken, fleet => fleet.attachedTo === bodyId, timeoutMs)
}

export async function arrangePointPark(
  page: Page, fleetId: string, point: Vec3, idToken: string, timeoutMs = 600_000,
): Promise<Fleet> {
  await commitServedBurn(page, fleetId, { point }, idToken)
  return waitForPark(page, fleetId, idToken, fleet => !fleet.attachedTo && fleet.state.Park?.Kind === 2, timeoutMs)
}
