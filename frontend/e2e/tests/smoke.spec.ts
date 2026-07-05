import { test, expect } from '@playwright/test'

/**
 * Tier 1 smoke — proves the harness end to end: the seeded auth session
 * (storageState) restores a logged-in Firebase user and reaches the app shell.
 */
test.describe('smoke', () => {
  test('authenticated session lands on the home page', async ({ page }) => {
    await page.goto('/')
    // Not bounced back to login → the restored session is valid.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    // The app shell rendered (LayoutWrapper only renders it for a loaded account).
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({
      timeout: 15_000,
    })
  })
})
