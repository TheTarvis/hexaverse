import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { emulatorSignIn } from '../helpers/firebase-emulator'

/**
 * New-user first activities (specs #0009 spawn, #0006/system-interior interim
 * fog, #0007 board) — the common "wake up and take your first steps" path:
 *
 *   sign up → name your lineage → wake DIRECTLY onto your home system's
 *   board, with your hull on station AND commandable from the roster panel →
 *   and only home is charted (still zero lanes — see below).
 *
 * REWRITTEN for migrate-fleet-to-continuous-burns tasks.md 8 (board-view
 * Decision 12: the board draws no fleet layer at all now — command surface
 * moves to the roster panel). Cause: the board-view/fleet-roster spec
 * changed (REMOVED "Board Picking ... fleet clauses" / "Foreign Fleets
 * Render as Contact Marks Only"; ADDED "One Row Per Owned Fleet, Derived
 * From Kinematic State", "The Roster Row Is the Fleet Command Surface").
 *
 * data-testid contract this spec assumes (the dev implements to it):
 *   - `fleet-roster` — the roster panel container (survives, unchanged name)
 *   - `fleet-row-{fleetId}` — one row per owned fleet (survives, unchanged)
 *   - `fleet-cmd-burn-{fleetId}` — the row's always-offered burn command
 *     (fleet-roster ADDED "The Roster Row Is the Fleet Command Surface" —
 *     "burn SHALL be offered regardless of the fleet's current kinematic
 *     state")
 *   - NO `fleet-glyphs`/`fleet-glyph-*` on the board — the fleet layer is
 *     deleted outright (board-view REMOVED "Foreign Fleets Render as Contact
 *     Marks Only"; design.md Decision 12, "the board draws no fleet layer at
 *     all"), so "the hull is on station" is proven through the roster, not
 *     the board.
 *
 * Unlike the other specs, this one drives a FRESH signup, so it opts out of
 * the shared logged-in storageState and creates its own account each run.
 * The spawn home system is chosen by an account-seeded RNG on a
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
  test('signs up, wakes directly onto the home board with a commandable fleet', async ({ page }) => {
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

    // 3. Land DIRECTLY on the home system's board (#0009 → #0007) — no galaxy
    //    stop. Read home from the URL we land on (spawn is per-account random).
    await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 20_000 })
    const homeId = new URL(page.url()).pathname.split('/').pop()!
    await expect(page.getByTestId('system-board-view')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('board-overlay')).toBeVisible({ timeout: 15_000 })

    // 4. The hull is on station in home and commandable — proven through the
    //    ROSTER PANEL (fleet-roster ADDED "One Row Per Owned Fleet"), since
    //    the board itself draws no fleet layer at all after this change
    //    (board-view REMOVED "Foreign Fleets Render as Contact Marks Only";
    //    design.md Decision 12). A fresh spawn has exactly one hull, so
    //    exactly one row is expected.
    const roster = page.getByTestId('fleet-roster')
    await expect(roster).toBeVisible({ timeout: 15_000 })
    const rows = roster.locator('[data-testid^="fleet-row-"]')
    await expect(rows).toHaveCount(1, { timeout: 15_000 })
    const fleetId = (await rows.first().getAttribute('data-testid'))!.replace('fleet-row-', '')
    // "commandable": burn is offered on every row regardless of kinematic
    // state (fleet-roster ADDED "The Roster Row Is the Fleet Command
    // Surface") — a freshly spawned, parked hull must show it.
    await expect(page.getByTestId(`fleet-cmd-burn-${fleetId}`)).toBeVisible({ timeout: 5_000 })

    // 5. Lane fog (fleet-movement/corporation-spawn: spawn charts home only,
    //    no lanes). Pre-migration this comment credited "the first home scan"
    //    as the mechanism that would go on to find the roads; the scan verb
    //    is deleted outright by this change (observation-fog-and-scan
    //    REMOVED "Running Scan Echo Disc"/"Scan Resolution Mints the
    //    Reveal") with no replacement shipping until link 5
    //    (replace-observation-with-sightings) — so a fresh corp's galaxy
    //    read ships every node and ZERO lanes, and there is currently no
    //    player-driven way to chart a first one. The assertion below is
    //    still exactly true; only the "how it gets fixed" is deferred.
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
