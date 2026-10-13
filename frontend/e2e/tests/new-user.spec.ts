import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { emulatorSignIn } from '../helpers/firebase-emulator'
import { prepareCommandHud } from '../helpers/space-view'

/** Fresh signup through the real UI: rendered home, station-docked hull,
 * visible fleet chooser and inventory, and home-only lane disclosure.
 * The current HUD hides Burn; this journey no longer claims UI commandability.
 */
const cfg = resolveE2EConfig()

// Fresh account — do not restore the shared logged-in session.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('new user first activities', () => {
  // Spec: 0009/S6
  test('signs up, wakes directly onto the home system in continuous space with a station-docked fleet and the current HUD', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'new-user signup drives the auth emulator (local only)')

    const email = `e2e+new-${Date.now()}@hexaverse.test`
    const password = 'e2ePassword123!'

    // 1. Sign up through the real UI (the signup path a brand-new player takes).
    await page.goto('/login?signUp=true')
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-password').fill(password)
    await page.getByTestId('login-confirm-password').fill(password)
    await page.getByTestId('login-submit').click()

    // 2. A corpless account gates into the wake-up flow (#0009): name → spawn.
    await expect(page.getByTestId('wake-up-flow')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('wake-name-input').fill('E2E Newcomer')
    await page.getByTestId('wake-submit').click()

    // 3. Land DIRECTLY on the home system's space view — no galaxy stop. Read
    //    home from the URL we land on (spawn is per-account random).
    await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 20_000 })
    const homeId = new URL(page.url()).pathname.split('/').pop()!
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('space-canvas-region')).toBeVisible({ timeout: 20_000 })

    // The first thing a new player sees must be a SYSTEM, not a placeholder
    // and not a black rectangle. The placeholder holds until a frame lands, so
    // its disappearance is the honest "the renderer came up" signal.
    await expect(page.getByTestId('space-loading')).toBeHidden({ timeout: 60_000 })
    await expect(page.getByTestId('renderer-unsupported')).toHaveCount(0)
    await expect(page.getByTestId('renderer-interrupted')).toHaveCount(0)
    // …and there is something in it: at least one body reached the scene.
    await expect(page.locator('[data-testid^="body-hit-"]').first()).toBeAttached({
      timeout: 30_000,
    })

    // 4. Dismiss the startup guide through its real control and inspect the
    // current fleet through the persistent strip and fleet chooser.
    await prepareCommandHud(page)
    await expect(page.getByTestId('vitals-fleet-id')).toBeVisible()
    await expect(page.getByTestId('vitals-state-pill')).toContainText(/docked at station/i)
    await page.getByTestId('vitals-fleet-chevron').click()
    const rows = page.locator('[data-testid^="vitals-fleet-menu-item-"]')
    await expect(rows).toHaveCount(1)
    const fleetId = (await rows.first().getAttribute('data-testid'))!.replace('vitals-fleet-menu-item-', '')
    await rows.first().click()
    await expect(page.getByTestId('vitals-fleet-id')).toHaveText(fleetId)
    await expect(page.getByTestId('hold-readout')).toBeVisible()
    await expect(page.getByTestId('system-index-toggle')).toBeVisible()
    await expect(page.getByTestId('burn-button'), 'the current HUD does not expose a burn commit').toBeHidden()

    // 5. Lane fog (`fleet-movement`/`corporation-spawn`: spawn charts home
    //    only, no lanes). A fresh corp's galaxy read ships every node and ZERO
    //    lanes. Asserted against the API directly — this is a claim about
    //    server state, and routing it through the UI would only prove what the
    //    UI chose to draw.
    //    Spec: 0006/S6
    const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
    const galaxyRes = await page.request.get(`${cfg.apiURL}/v1/galaxy`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    expect(galaxyRes.ok()).toBeTruthy()
    const galaxy = (await galaxyRes.json()) as { lanes: Array<{ aId: string; bId: string }> }
    expect(
      galaxy.lanes ?? [],
      `a fresh spawn charted ${galaxy.lanes?.length ?? 0} lanes — it should know no roads (home ${homeId})`,
    ).toHaveLength(0)
  })
})
