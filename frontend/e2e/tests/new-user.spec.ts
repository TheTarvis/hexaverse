import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { emulatorSignIn } from '../helpers/firebase-emulator'

/**
 * New-user first activities (#0009 spawn, `system-interior`'s disclosed
 * interim read, `system-space-view`) — the common "wake up and take your
 * first steps" path:
 *
 *   sign up → name your lineage → wake DIRECTLY onto your home system's
 *   SPACE VIEW, with your hull on station AND commandable → and only home is
 *   charted (still zero lanes — see below).
 *
 * REWRITTEN for `build-production-space-view` tasks.md 2.1b / 10.8. Cause:
 * task 2.1 replaces `/systems/:systemId`'s view outright, so
 * `system-board-view` and `board-overlay` — the two ids step 3 asserted on —
 * no longer exist. Every assertion's SUBSTANCE is preserved; two are
 * strengthened, both for the same reason: the lattice board was mounted the
 * moment its data arrived, while the space view holds a placeholder until its
 * renderer has produced a first frame (`system-space-view`: "Loading persists
 * through first frame after data arrives"). "The view is up" therefore now
 * means "a frame was drawn and the placeholder is gone", not merely "a
 * container exists" — which is what a new player actually experiences, and
 * what a mounted-but-black canvas would fail.
 *
 * data-testid contract this spec assumes:
 *   - `space-view` — the view container (replaces `system-board-view`)
 *   - `space-canvas-region` — the rendering region (replaces `board-overlay`)
 *   - `space-loading` — the placeholder that must GIVE WAY
 *   - `fleet-roster` / `fleet-row-{fleetId}` — unchanged
 *   - `burn-button` — the burn commit, now on the command panel rather than
 *     the roster row (`system-space-view`: *Burn Command Targets Any Selected
 *     Body, Lane Gate, or Point Uniformly*). "Commandable" is proven through
 *     it: a freshly spawned, parked hull must reach a commit control.
 *
 * Unlike the other specs, this one drives a FRESH signup, so it opts out of
 * the shared logged-in storageState and creates its own account each run. The
 * spawn home system is chosen by an account-seeded RNG on a
 * per-signup-random Firebase UID, so we never hard-code a system: we read
 * home from the URL we land on and assert relative to it.
 *
 * Local-only: it exercises the auth emulator's signup REST path. dev/prod
 * runs use the shared pre-provisioned account and skip this.
 */
const cfg = resolveE2EConfig()

// Fresh account — do not restore the shared logged-in session.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('new user first activities', () => {
  // Spec: 0009/S6
  test('signs up, wakes directly onto the home system in continuous space with a commandable fleet', async ({
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
    // The retired lattice leaves nothing behind on the route it used to own.
    await expect(page.getByTestId('board-overlay')).toHaveCount(0)
    await expect(page.getByTestId('system-board-view')).toHaveCount(0)

    // 4. The hull is on station in home and COMMANDABLE. A fresh spawn has
    //    exactly one hull, so exactly one row is expected.
    const roster = page.getByTestId('fleet-roster')
    await expect(roster).toBeVisible({ timeout: 20_000 })
    const rows = roster.locator('[data-testid^="fleet-row-"]')
    await expect(rows).toHaveCount(1, { timeout: 20_000 })

    // "Commandable" now means the player can reach a commit control for that
    // hull. Burn lives on the command panel and is present from the first
    // frame — disabled until something is selected, which is the offer, not
    // its absence.
    await expect(page.getByTestId('burn-button')).toBeVisible({ timeout: 20_000 })
    // The docked-fleet panel is mounted alongside it, anchored to the hull's
    // own served state rather than to any selection.
    await expect(page.getByTestId('space-fleet-panel')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 20_000 })

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
