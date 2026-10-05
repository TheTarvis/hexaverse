import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { resolveE2EConfig } from '../config/env'
import { burnToSelectionAndDock, selectFirstBodyMatching, wakeNewCorp } from '../helpers/space-view'

/**
 * JOURNEY — openspec change `fix-burn-order-geometry-refusals` (tier 4, one
 * spec for the change).
 *
 * The slice this change repairs: a freshly woken corporation's burns to and
 * from its own home station used to hit the star-clearance 500 on arrival (the
 * insertion standoff point dipping inside the clearance) and on departure (the
 * fleet's own position, parked in the station's orbit, inside it). Home-site
 * criterion (d) now keeps such systems from being chosen, and any remaining
 * geometry refusal is a typed 409/404 with a reason.
 *
 * Legs, each asserted before the next:
 *   1. wake a new corporation (read-only `wakeNewCorp`);
 *   2. a deterministic served refusal rendered as the pinned player copy: the
 *      camera's default centre is the star, so selecting the point at the
 *      camera centre names a point inside the clearance, which every fleet
 *      outside it is refused for its DESTINATION (a geometric certainty, not a
 *      phase-dependent one — an own-host order is deliberately NOT used);
 *   3. arrival: burn to the home station, assert "Under way", then "Docked";
 *   4. departure: burn from the station's orbit to another body, assert
 *      "Under way" (the order from a parked-at-station origin is accepted),
 *      then "Docked".
 * No retry and no sampling: one corporation, one home, one station.
 *
 * The test backend's log is sliced from the byte offset at the start of this
 * spec to its end (workers = 1, so nothing else writes in between): it must
 * hold zero error-level star-clearance sentinel lines, and the refusal entries
 * it does hold are attached to the test output for the journey record.
 */

const cfg = resolveE2EConfig()
const BACKEND_LOG = path.resolve(__dirname, '../../playwright/.auth/backend.log')

const DESTINATION_LINE = 'That destination is too close to the star to fly to.'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(1_800_000)

function logSize(): number {
  try {
    return fs.statSync(BACKEND_LOG).size
  } catch {
    return 0
  }
}

function logSince(offset: number): string {
  const buf = fs.readFileSync(BACKEND_LOG)
  return buf.subarray(Math.min(offset, buf.length)).toString('utf8')
}

test.describe('burn geometry refusals — the home-station slice', () => {
  test('wake -> a served refusal reads as player copy -> burn to the home station -> dock -> depart', async ({
    page,
  }, testInfo) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator and reads the local backend log')
    const logStart = logSize()

    // ------------------------------------------------------------ 1. wake
    const corp = await wakeNewCorp(page, 'E2E Geometry Journey', 'geom-refusals')
    const row = page.getByTestId(`fleet-row-${corp.fleetId}`)
    await expect(page.locator('[data-testid^="body-hit-feat-station"]')).toHaveCount(1, { timeout: 30_000 })

    // ----------------------------------- 2. a deterministic served refusal
    await page.getByTestId('select-pan-target-point').click()
    await page.getByTestId('burn-button').click()
    await expect(
      page.getByText(DESTINATION_LINE),
      'a point at the star is refused for its destination and shown as the pinned line, not the raw reason',
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/burn destination is at or inside/)).toHaveCount(0)
    await expect(page.getByText(/fleet:/)).toHaveCount(0)
    await expect(row, 'a refused order leaves the fleet where it was').not.toContainText(/under way/i)

    // ------------------- 3. arrival: burn to the home station and dock
    await selectFirstBodyMatching(page, 'feat-station')
    await burnToSelectionAndDock(page, corp.fleetId)
    await expect(page.getByTestId('sell-section'), 'docked at the station').toBeVisible({ timeout: 20_000 })

    // ----------- 4. departure: burn out of the station's orbit to another body
    await selectFirstBodyMatching(page, 'feat-body-')
    await burnToSelectionAndDock(page, corp.fleetId)

    // ------------------------------------------------- backend log evidence
    const slice = logSince(logStart)
    const lines = slice.split('\n').map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''))
    const refusals = lines.filter((l) => l.includes('fleet: burn solve refusal served'))
    await testInfo.attach('refusal-entries.txt', { body: refusals.join('\n'), contentType: 'text/plain' })
    await testInfo.attach('home.txt', { body: `home=${corp.homeSystemId} fleet=${corp.fleetId}`, contentType: 'text/plain' })
    const clearanceErrors = lines.filter(
      (l) => l.includes('endpoint at or inside the star-clearance radius') && /\bERR\b/.test(l),
    )
    expect(clearanceErrors, 'no error-level star-clearance line may appear in this journey').toEqual([])
    // The one refusal this journey drove is on record, below error level.
    expect(refusals.some((l) => l.includes('destination-inside-clearance'))).toBe(true)
    expect(refusals.every((l) => !/\bERR\b/.test(l))).toBe(true)
  })
})
