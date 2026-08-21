import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { ensureEmulatorUser, emulatorSignIn } from '../helpers/firebase-emulator'

/**
 * Bug reproduction (found 2026-08-12): a wake that fails with 503 "no spawn
 * site available" strands a half-created corporation.
 *
 * Mechanism (backend/corporations/service.go): Spawn commits the corp doc +
 * account pointer in one transaction FIRST, then runs site selection inside
 * ensureSpawnAssets. When selectSpawnSite returns ErrNoSpawnSite the handler
 * 503s — but the corp already exists, with no fleet and no fog. On the next
 * page load GET /v1/corporations/me returns that zombie corp (it never heals),
 * so the wake gate flips and the player lands in the game with no hull and no
 * way to act. Site selection is deterministic per account, so a heal-on-read
 * would fail the same way: while sites are exhausted, the ONLY correct outcome
 * for this account is to remain corpless on the wake screen.
 *
 * The failure is real at small scale: the local/e2e stack seeds the start-area
 * galaxy (~28 systems, backend/galaxy/seed.go), each successful wake claims
 * its home system as explored, and MinSpawnDistance=3 excludes every mineable
 * system within 2 lane-hops of claimed space — so a couple dozen wakes
 * genuinely exhaust the frontier.
 *
 * ORDERING CONSTRAINT: this spec permanently exhausts the run's shared world —
 * after it, NO account can wake. It must run after every other spec. The
 * filename sorts last alphabetically among e2e/tests/*.spec.ts, which with
 * playwright.config.ts's workers:1 + fullyParallel:false guarantees that. If
 * you add a spec that sorts after "spawn-…" and needs to wake a corp, revisit.
 *
 * Local-only: drives the auth emulator and depends on the seeded start-area
 * galaxy's size — dev/prod worlds must never be exhausted by a test.
 */
const cfg = resolveE2EConfig()

// Fresh accounts throughout — do not restore the shared logged-in session.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('spawn-site exhaustion', () => {
  test('a failed wake (503 no-spawn-site) leaves the account corpless and retryable', async ({
    page,
    request,
  }) => {
    test.skip(cfg.env !== 'local', 'exhausts the seeded start-area galaxy (local only)')
    // ~28 API wakes plus a UI signup can brush the 60s default.
    test.setTimeout(180_000)

    const password = 'e2ePassword123!'
    const run = Date.now()

    // 1. Exhaust the frontier via the API. Bound: each successful wake claims
    //    ≥1 previously-unclaimed system, and the start-area galaxy has ~28, so
    //    a 503 MUST occur within the cap — if it doesn't, the seeded world or
    //    spawn criteria changed and this repro needs re-basing.
    let exhausted = false
    let wakes = 0
    for (let i = 0; i < 40; i++) {
      const email = `e2e+exhaust-${run}-${i}@hexaverse.test`
      await ensureEmulatorUser(cfg.emulator!, email, password)
      const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
      // Provision the internal account (firebase-uid → x-uid mapping) the way
      // the app does on signup — without it the wake 403s (no actor).
      const acct = await request.post(`${cfg.apiURL}/v1/accounts`, {
        headers: { Authorization: `Bearer ${idToken}` },
        data: {},
      })
      expect(acct.ok(), `account provisioning ${i} failed with ${acct.status()}`).toBeTruthy()
      const res = await request.post(`${cfg.apiURL}/v1/corporations`, {
        headers: { Authorization: `Bearer ${idToken}` },
        data: { name: `Exhaust ${i}` },
      })
      if (res.status() === 503) {
        exhausted = true
        break
      }
      expect(res.ok(), `wake ${i} failed unexpectedly with ${res.status()}`).toBeTruthy()
      wakes++
    }
    expect(
      exhausted,
      `expected spawn-site exhaustion within 40 wakes of the ~28-system start-area galaxy (got ${wakes} successful wakes)`,
    ).toBeTruthy()

    // 2. The user-facing path: a brand-new player signs up through the real UI
    //    and tries to wake into the exhausted world. The wake fails, the error
    //    surfaces, and the flow stays mounted for retry. (This half passes
    //    today — it pins the error surface the screenshot shows.)
    const email = `e2e+exhaust-${run}-ui@hexaverse.test`
    await page.goto('/login?signUp=true')
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-password').fill(password)
    await page.getByTestId('login-confirm-password').fill(password)
    await page.getByTestId('login-submit').click()

    await expect(page.getByTestId('wake-up-flow')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('wake-name-input').fill('Stranded Lineage')
    await page.getByTestId('wake-submit').click()

    await expect(page.getByText('no spawn site available')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('wake-up-flow')).toBeVisible()

    // 3. THE BUG. A wake that failed must leave the account corpless — the
    //    session bootstrap should gate this player right back into the wake-up
    //    flow, not into the game.
    //
    //    Today: Spawn already committed the corp before site selection failed,
    //    so GET /me returns a fleetless zombie corp…
    const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
    const me = await request.get(`${cfg.apiURL}/v1/corporations/me`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    expect(
      me.status(),
      'an account whose wake 503d must not own a corporation (got a half-created corp: no fleet, no fog)',
    ).toBe(404)

    //    …and a page refresh drops the player into the game with no hull and
    //    no way to act, instead of back onto the wake screen.
    await page.reload()
    await expect(
      page.getByTestId('wake-up-flow'),
      'after a failed wake, a refresh must return to the wake-up flow — not enter the game on a half-created corp',
    ).toBeVisible({ timeout: 15_000 })
  })
})
