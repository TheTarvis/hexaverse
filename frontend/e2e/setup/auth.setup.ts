/**
 * Auth setup project. Runs once before the suite; produces a reusable
 * storageState (including IndexedDB, where the Firebase JS SDK keeps its
 * session — plain cookie/localStorage state is NOT enough for Firebase).
 *
 * local: ensure the test user exists in the auth emulator, then log in via the
 * real login UI. dev/prod: log in with the dedicated test account.
 */
import { test as setup, expect } from '@playwright/test'
import { resolveE2EConfig, STORAGE_STATE, vercelBypassQuery } from '../config/env'
import { ensureEmulatorUser } from '../helpers/firebase-emulator'

const cfg = resolveE2EConfig()

setup('authenticate', async ({ page }) => {
  if (cfg.emulator) {
    await ensureEmulatorUser(cfg.emulator, cfg.user.email, cfg.user.password)
  }

  // First navigation carries the Vercel bypass as query params so Vercel sets its
  // origin-scoped bypass cookie (no-op string locally). Every later request — same
  // page and, via storageState, every dependent spec — then rides that cookie, so
  // no bypass header leaks onto cross-origin calls like Firebase auth.
  await page.goto(`/login${vercelBypassQuery()}`)
  await page.getByTestId('login-email').fill(cfg.user.email)
  await page.getByTestId('login-password').fill(cfg.user.password)
  await page.getByTestId('login-submit').click()

  // Successful login redirects to the home page. Allow generous time for the
  // first-load account bootstrap.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 })
  await expect(page).not.toHaveURL(/\/login/)

  // Wake the account (#0009). A fresh account has no Corporation, so the wake-up
  // flow gates the whole app; drive it once here so the saved session is a woken
  // player — the corp persists server-side, so every dependent spec that restores
  // this session already has a corp and reaches the galaxy/board. (If a prior run
  // already woke this account, the galaxy shows straight away and we skip it.)
  await expect(
    page.getByTestId('wake-up-flow').or(page.getByTestId('galaxy-view')),
  ).toBeVisible({ timeout: 30_000 })
  if (await page.getByTestId('wake-up-flow').isVisible()) {
    await page.getByTestId('wake-name-input').fill('E2E Lineage')
    await page.getByTestId('wake-submit').click()
    await expect(page.getByTestId('galaxy-view')).toBeVisible({ timeout: 30_000 })
  }

  await page.context().storageState({ path: STORAGE_STATE, indexedDB: true })
})
