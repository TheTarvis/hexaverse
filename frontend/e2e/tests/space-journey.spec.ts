import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'

/**
 * RED-PHASE SUITE — openspec change `build-production-space-view`,
 * tasks.md 11.2; the proposal's EXIT CRITERION:
 *
 *   "A human can spawn, see their home system rendered in continuous space,
 *    burn to a body, dock, mine, sell, refuel, fly to a lane gate, and jump —
 *    entirely through the new view — proven by a Playwright journey against
 *    the real stack."
 *
 * The proposal is explicit that a green unit/component suite and an
 * end-to-end test through the real router are NOT, by themselves, evidence of
 * this: link 5's record shows a green suite surviving four consecutive states
 * in which a human player was stuck. This file is the only artefact in this
 * change that can falsify "a human can do this".
 *
 * TWO CONSTRAINTS THE TASK LIST FIXES, both honoured below:
 *   - the gate step SHALL exercise the OFF-SCREEN AFFORDANCE, not a hand-set
 *     camera position (tasks.md 11.2). A gate sits at a characteristic radius
 *     along its bearing toward the far endpoint, so at any framing showing the
 *     inner system it is off screen; panning blind until one happens to enter
 *     the viewport is not a path a player can be expected to find.
 *   - every leg goes through the SPACE VIEW's own surfaces. No API call is
 *     made by the test, and no lattice test id appears anywhere in it.
 *
 * WHAT WOULD MAKE THIS VACUOUS, and how each is closed:
 *   - Waiting only on the eventual docked state would pass even if the burn
 *     command were swallowed and the fleet arrived by some other means. Every
 *     burn leg therefore asserts the intermediate "under way" state first,
 *     the same guard `slice.spec.ts` and `jump-commit.spec.ts` already use.
 *   - Asserting "the panel is visible" would pass against a panel that
 *     rendered without working. Each verb therefore asserts a CHANGE IN
 *     SERVED STATE it caused: the hold fills, the balance rises, the fuel
 *     readout rises, the system id in the URL changes.
 *   - Reading the balance once would pass against a static readout. The sale
 *     leg captures it before and requires a strict increase.
 */

const cfg = resolveE2EConfig()

test.use({ storageState: { cookies: [], origins: [] } })
// The world runs at real-time scale on the test stack and this journey burns
// across a whole system under its own power, twice, plus a lane crossing.
test.setTimeout(1_800_000)

async function digits(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? ''
  const m = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : NaN
}

test.describe('the continuous-space slice, end to end through the new view', () => {
  test('spawn -> see the system -> burn -> dock -> mine -> sell -> refuel -> gate -> jump', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    // ---------------------------------------------------------- 1. spawn
    const email = `e2e+journey-${Date.now()}@hexaverse.test`
    const password = 'e2ePassword123!'
    await page.goto('/login?signUp=true')
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-password').fill(password)
    await page.getByTestId('login-confirm-password').fill(password)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('wake-up-flow')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('wake-name-input').fill('E2E Journey')
    await page.getByTestId('wake-submit').click()
    await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 20_000 })

    // --------------------------------- 2. see the home system, in R3 space
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('space-canvas-region')).toBeVisible({ timeout: 20_000 })
    // The loading placeholder gives way to a real first frame.
    await expect(page.getByTestId('space-loading')).toBeHidden({ timeout: 30_000 })
    // The renderer came up: neither unavailable state is showing.
    await expect(page.getByTestId('renderer-unsupported')).toHaveCount(0)
    await expect(page.getByTestId('renderer-interrupted')).toHaveCount(0)
    // The scene actually has bodies in it, and no lattice remains.
    await expect(page.locator('[data-testid^="body-hit-feat-"]').first()).toBeAttached({
      timeout: 20_000,
    })
    await expect(page.getByTestId('board-overlay')).toHaveCount(0)
    await expect(page.getByTestId('board-lattice')).toHaveCount(0)

    const rows = page.getByTestId('fleet-roster').locator('[data-testid^="fleet-row-"]')
    await expect(rows).toHaveCount(1, { timeout: 15_000 })
    const fleetId = (await rows.first().getAttribute('data-testid'))!.replace('fleet-row-', '')
    const row = page.getByTestId(`fleet-row-${fleetId}`)

    // ------------------------------------------- 3. burn to a body, dock
    const oreBody = page.locator('[data-testid^="body-hit-feat-body-"]').first()
    await expect(oreBody).toBeAttached({ timeout: 20_000 })
    await oreBody.click()
    // The preview quotes the order BEFORE it is committed, and the ceiling
    // the player agrees to is displayed alongside the point cost.
    await expect(page.getByTestId('preview-panel')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('preview-fuel')).toBeVisible()
    await expect(page.getByTestId('preview-fuel-ceiling')).toBeVisible()
    await page.getByTestId('burn-button').click()
    await expect(row, 'the burn must actually be under way, not merely end docked').toContainText(
      /under way/i,
      { timeout: 20_000 },
    )
    await expect(row).toContainText(/docked/i, { timeout: 600_000 })

    // ---------------------------------------------------------- 4. mine
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 20_000 })
    const metalsBefore = (await page.getByTestId('hold-readout').textContent()) ?? ''
    await page.getByTestId('mine-tons-input').fill('1')
    await page.getByTestId('mine-button').click()
    await expect(page.getByTestId('mine-countdown')).toBeVisible({ timeout: 20_000 })
    // The run resolves without user action (the ETA self-scheduled refetch)
    // and the hold VISIBLY fills.
    await expect(page.getByTestId('mine-countdown')).toBeHidden({ timeout: 600_000 })
    await expect
      .poll(async () => (await page.getByTestId('hold-readout').textContent()) ?? '', {
        timeout: 60_000,
      })
      .not.toBe(metalsBefore)

    // ----------------------------------- 5. burn to the home station, sell
    const station = page.locator('[data-testid^="body-hit-feat-station"]').first()
    await expect(station, 'the home system carries exactly one station body').toHaveCount(1)
    if (await station.isVisible()) {
      await station.click()
    } else {
      await page.locator('[data-testid^="offscreen-feat-station"]').first().click()
    }
    await page.getByTestId('burn-button').click()
    await expect(row).toContainText(/under way/i, { timeout: 20_000 })
    await expect(row).toContainText(/docked/i, { timeout: 600_000 })

    await expect(page.getByTestId('sell-section')).toBeVisible({ timeout: 20_000 })
    const balanceBefore = await digits(page, 'balance-value')
    await page.getByTestId('sell-tons-input').fill('1')
    await expect(page.getByTestId('sell-proceeds-preview')).toBeVisible()
    await page.getByTestId('sell-button').click()
    await expect
      .poll(() => digits(page, 'balance-value'), { timeout: 30_000 })
      .toBeGreaterThan(balanceBefore)

    // -------------------------------------------------------- 6. refuel
    await expect(page.getByTestId('refuel-section')).toBeVisible({ timeout: 20_000 })
    const fuelBefore = await digits(page, 'hold-fuel')
    const balanceAfterSale = await digits(page, 'balance-value')
    await page.getByTestId('refuel-tons-input').fill('1')
    await expect(page.getByTestId('refuel-cost-preview')).toBeVisible()
    await page.getByTestId('refuel-button').click()
    await expect.poll(() => digits(page, 'hold-fuel'), { timeout: 30_000 }).toBeGreaterThan(fuelBefore)
    await expect
      .poll(() => digits(page, 'balance-value'), { timeout: 30_000 })
      .toBeLessThan(balanceAfterSale)

    // ----------------- 7. fly to a lane gate — via the OFF-SCREEN affordance
    const gateAffordance = page.locator('[data-testid^="offscreen-gate-"]').first()
    await expect(
      gateAffordance,
      'a gate is normally off screen; reaching one is the last step of the exit criterion',
    ).toBeVisible({ timeout: 20_000 })
    const gateTestId = (await gateAffordance.getAttribute('data-testid'))!
    await gateAffordance.click()
    // The affordance reframed so the mark is inside the viewport, and the
    // selected gate presents its destination system.
    await expect(page.getByTestId('gate-facts')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('preview-panel')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('burn-button').click()
    await expect(row).toContainText(/under way/i, { timeout: 20_000 })
    await expect(row).toContainText(/docked/i, { timeout: 900_000 })

    // ---------------------------------------------------------- 8. jump
    const jumpBtn = page.getByTestId(`fleet-cmd-jump-${fleetId}`)
    await expect(
      jumpBtn,
      'attachment alone gates jump — no charted-lane filter, no canvas selection',
    ).toBeEnabled({ timeout: 20_000 })
    const originUrl = page.url()
    await jumpBtn.click()

    // The departure hand-off follows the ACTING fleet onto the lane crawl.
    await page.waitForURL(/\/$|\/systems\/[^/]+$/, { timeout: 60_000 })

    // ...and the fleet eventually arrives in the DESTINATION system, which is
    // not the one it left. `gateTestId` names the destination.
    const destSystemId = gateTestId.replace('offscreen-gate-', '')
    await page.goto(`/systems/${destSystemId}`)
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId(`fleet-row-${fleetId}`)).toBeVisible({ timeout: 900_000 })
    expect(page.url()).not.toBe(originUrl)
  })
})
