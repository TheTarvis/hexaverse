import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'

/**
 * The vertical slice (add-mine-ui; vision steps 1-6) — one journey through
 * every slice verb, on a fresh account:
 *
 *   sign up → wake on the home board → SCAN (reveals lodes, charts lanes) →
 *   MOVE + dock at a mineable body → MINE (hold fills at the eta) → reload
 *   (the cargo PERSISTED — a fresh Firestore read, not client cache) → mine
 *   again (the ledger accumulates) → DEPART through a charted gate (the
 *   hand-off to the galaxy view, roster reads the trip).
 *
 * Wall-clock note (design.md Risks): the test stack runs the world at scale 1
 * (no WORLD_TIME_SCALE in .env.test — the client's useWorldTime assumes 1), so
 * every eta here is real seconds: scan 15s, burn 2.5s/hex, mining 1s/ton. The
 * journey stays bounded by picking the NEAREST revealed lode and minimum-size
 * runs. The full return trip is NOT ridden: a single lane leg is 104-300s at
 * this scale, so persistence is proven by the reload instead (the same fresh
 * Firestore read a returning fleet would issue).
 *
 * Interaction note: glyphs animate every frame (orbits glide), so Playwright's
 * stability check never passes on them — all board clicks go through
 * page.mouse at bounding-box coordinates. Lodes are picked off the RENDERED
 * board (data-mineable, the browser's own fogged read), not a parallel API
 * read, so the test can never disagree with what the player sees.
 *
 * Local-only: drives the auth emulator's signup path, like new-user.spec.ts.
 */
const cfg = resolveE2EConfig()

// Fresh account — do not restore the shared logged-in session.
test.use({ storageState: { cookies: [], origins: [] } })

// The journey rides real world-time etas (scan 15s + burn + two mine runs).
test.setTimeout(240_000)

// Clicks a board glyph via raw mouse coordinates at its centre — orbiting
// glyphs animate every frame, so Playwright's stability check never passes
// and locator.click() would spin forever.
async function clickGlyph(page: Page, testId: string): Promise<void> {
  const box = (await page.getByTestId(testId).boundingBox())!
  expect(box, `glyph ${testId} should be on screen`).toBeTruthy()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// Reads the used-tons figure off the hold readout ("12 / 200t" → 12).
async function holdUsed(page: Page): Promise<number> {
  const text = await page.getByTestId('hold-capacity').innerText()
  return Number(text.split('/')[0].trim())
}

test.describe('the vertical slice', () => {
  test('scan → move → mine → persisted → mine again → depart', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'slice journey drives the auth emulator (local only)')

    const email = `e2e+slice-${Date.now()}@hexaverse.test`
    const password = 'e2ePassword123!'

    // 1. Sign up and wake onto the home board (#0009 → #0007).
    await page.goto('/login?signUp=true')
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-password').fill(password)
    await page.getByTestId('login-confirm-password').fill(password)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('wake-up-flow')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('wake-name-input').fill('E2E Prospector')
    await page.getByTestId('wake-submit').click()
    await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 20_000 })
    await expect(page.getByTestId('hex-board')).toBeVisible({ timeout: 15_000 })

    // The hull carries an empty hold from spawn (the roster block on the read).
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 15_000 })
    expect(await holdUsed(page)).toBe(0)

    // 2. SCAN home — the taught first verb: reveals the lodes and charts the
    //    system's lanes (#0006). Resolution lands via the eta refetch; revealed
    //    lodes surface as data-mineable glyphs on the refreshed board.
    await page.getByTestId('scan-button').click()
    await expect(page.getByTestId('scan-countdown')).toBeVisible({ timeout: 10_000 })
    const lodes = page.locator('[data-testid^="feature-glyph-"][data-mineable]')
    await expect(
      lodes.first(),
      'the scanned home system should reveal at least one lode',
    ).toBeVisible({ timeout: 60_000 })

    // 3. MOVE: intercept + dock at the nearest revealed lode (nearest by
    //    screen distance from the fleet glyph — burn cost is 2.5s/hex, so
    //    nearest keeps this the longest single wait of the journey).
    const fleetBox = (await page
      .locator('[data-testid^="fleet-glyph-"]')
      .first()
      .boundingBox())!
    let lodeId = ''
    let best = Number.POSITIVE_INFINITY
    for (const glyph of await lodes.all()) {
      const box = await glyph.boundingBox()
      if (!box) continue
      const d = Math.hypot(box.x - fleetBox.x, box.y - fleetBox.y)
      if (d < best) {
        best = d
        lodeId = (await glyph.getAttribute('data-testid'))!.replace('feature-glyph-', '')
      }
    }
    expect(lodeId, 'a nearest lode should have been picked').not.toBe('')

    await clickGlyph(page, `feature-glyph-${lodeId}`)
    await page.getByTestId('move-button').click()
    await expect(page.getByTestId('active-fleet')).toContainText('docked', { timeout: 120_000 })

    // 4. MINE a minimum-size run (5t at 0.001 t/ms = 5s) and watch the hold
    //    fill at the eta — no navigation, the refetch rules land it. The offer
    //    anchors to the docked state on the fleet card ("Mine Offer on the
    //    Docked Fleet") — no board click involved.
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect(page.getByTestId('mine-countdown')).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() => holdUsed(page), { timeout: 45_000, message: 'the hold fills at the run’s eta' })
      .toBe(5)

    // 5. PERSISTED: reload — the hold readout re-derives from a fresh
    //    Firestore read (the same read a returning fleet would issue).
    await page.reload()
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 15_000 })
    expect(await holdUsed(page)).toBe(5)

    // 6. Mine AGAIN — the lode's ledger and the hold both accumulate
    //    (exactly-once deltas: 5 + 5, never 5 or 15). The offer is already
    //    back on the fleet card (still docked, channel free again).
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect
      .poll(() => holdUsed(page), { timeout: 45_000, message: 'the second run accumulates' })
      .toBe(10)

    // 7. DEPART through a charted gate (scan charted the system's lanes) — the
    //    board hands off to the galaxy view and the roster reads the trip.
    //    The lane leg itself is 104s+ at scale 1, so the arrival is not
    //    awaited — commitment and hand-off are the slice beat.
    const gate = page.locator('[data-testid^="gate-glyph-"]').first()
    await expect(gate).toBeVisible({ timeout: 15_000 })
    const gateId = (await gate.getAttribute('data-testid'))!
    await clickGlyph(page, gateId)
    await expect(page.getByTestId('depart-button')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('depart-button').click()
    await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 90_000 })
    const roster = page.getByTestId('fleet-roster')
    await expect(roster).toBeVisible({ timeout: 15_000 })
    await expect(roster).toContainText(/Departing|In transit/, { timeout: 30_000 })
  })
})
