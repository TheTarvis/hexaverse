import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { emulatorSignIn } from '../helpers/firebase-emulator'

/**
 * New-user first activities (specs #0009 spawn, #0006 fog, #0007 board) — the
 * common "wake up and take your first steps" path:
 *
 *   sign up → name your lineage → wake DIRECTLY onto your home system's hex
 *   board, with your hull on station → and only home's lanes are charted.
 *
 * Spawn drops the player straight onto the #0007 board (the board is where you
 * act; the galaxy is a click away from there), not the galaxy view.
 *
 * Unlike the other specs, this one drives a FRESH signup, so it opts out of the
 * shared logged-in storageState and creates its own account each run. The spawn
 * home system is chosen by an account-seeded RNG on a per-signup-random Firebase
 * UID, so we never hard-code a system: we read home from the URL we land on and
 * assert relative to it. (The galaxy itself is deterministic — StartAreaSeed,
 * ids sys-0…sys-N — but which one is *home* is not.)
 *
 * Local-only: it exercises the auth emulator's signup REST path. dev/prod runs
 * use the shared pre-provisioned account and skip this.
 */
const cfg = resolveE2EConfig()

// Fresh account — do not restore the shared logged-in session.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('new user first activities', () => {
  // Spec: 0009/S6
  test('signs up, wakes directly onto the home board with a fleet', async ({ page }) => {
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

    // 3. Land DIRECTLY on the home system's hex board (#0009 → #0007) — no galaxy
    //    stop. Read home from the URL we land on (spawn is per-account random).
    await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 20_000 })
    const homeId = new URL(page.url()).pathname.split('/').pop()!
    await expect(page.getByTestId('system-board-view')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('hex-board')).toBeVisible({ timeout: 15_000 })

    // 4. The hull is on station in home (the "no fleet" fix): a fleet glyph draws.
    await expect(
      page.getByTestId('fleet-glyphs').locator('[data-testid^="fleet-glyph-"]').first(),
    ).toBeVisible({ timeout: 15_000 })

    // 5. Lane fog (#0006): the galaxy read ships only CHARTED lanes — every lane
    //    is incident to an Explored system. For a fresh spawn that's home only,
    //    so no lane in the payload may connect two non-home systems.
    const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
    const galaxyRes = await page.request.get(`${cfg.apiURL}/v1/galaxy`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    expect(galaxyRes.ok()).toBeTruthy()
    const galaxy = (await galaxyRes.json()) as { lanes: Array<{ aId: string; bId: string }> }
    for (const lane of galaxy.lanes) {
      expect(
        lane.aId === homeId || lane.bId === homeId,
        `lane ${lane.aId}↔${lane.bId} is not incident to home ${homeId} — fog leak`,
      ).toBeTruthy()
    }
  })
})
