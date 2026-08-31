import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'

/**
 * The vertical slice (migrate-fleet-to-continuous-burns tasks.md 8, Half B) —
 * one journey through the surviving slice verbs, on a fresh account:
 *
 *   sign up → wake on the home board (every feature already unfogged —
 *   system-interior's interim read, no scan needed to see a lode) →
 *   select a mineable body → BURN + dock, commanded from the roster panel →
 *   MINE (hold fills at the eta) → reload (the cargo PERSISTED — a fresh
 *   Firestore read, not client cache) → mine again (the ledger accumulates).
 *
 * REWRITTEN wholesale from the pre-migration
 * "scan → move → mine → persisted → mine again → depart" journey. Cause: the
 * spec changed underneath every remaining step —
 *   - `scan` is DELETED (observation-fog-and-scan REMOVED "Running Scan Echo
 *     Disc"/"Scan Resolution Mints the Reveal") — but its old JOB (reveal
 *     the lodes) is subsumed by system-interior's ADDED "Interior Reads Are
 *     Fully Disclosed, A Deliberate Interim" (tasks.md 7.7): every feature —
 *     resources included — now ships unfogged to any authenticated
 *     requester, from the very first board load. No wait, no reveal step.
 *   - `move` is no longer a board verb at all — it is `burn`, commanded from
 *     the roster panel (fleet-roster ADDED "The Roster Row Is the Fleet
 *     Command Surface"; board-view Decision 12), naming the board's CURRENT
 *     SELECTION (a clicked feature) as the target.
 *   - `depart` (a lane jump) has **NO REACHABLE PATH in this state of the
 *     chain** and is NOT exercised — see the dedicated note at the bottom of
 *     this file before the final assertions. This is reported, not silently
 *     dropped.
 *
 * data-testid contract this spec assumes (the dev implements to it):
 *   - `feature-glyph-{id}` / `[data-mineable]` — SURVIVES unchanged (board
 *     still draws features; only the fleet layer is gone).
 *   - `fleet-roster`, `fleet-row-{fleetId}` — SURVIVES.
 *   - `fleet-cmd-burn-{fleetId}` — commits a burn order to the board's
 *     CURRENTLY SELECTED feature (the acting/sole fleet). No separate
 *     "move-button"/target-picker exists any more — selecting the feature
 *     IS naming the target (board-view Decision 12: "Targets are named by
 *     body id from the interior read, not by picking a tile").
 *   - `mine-section`, `mine-tons-input`, `mine-button`, `mine-countdown`,
 *     `hold-readout`, `hold-capacity` — SURVIVE unchanged (board-view KEPT
 *     "Mine Offer/ETA/Commit"; tasks.md 8.7).
 *   - `gate-glyph-*` — SURVIVES, but is expected to be ABSENT for a fresh
 *     corp (see the bottom note): no lane is charted, so the interior read
 *     ships zero lane gates.
 *
 * Wall-clock note (design.md Risks): the test stack runs the world at scale 1
 * (no WORLD_TIME_SCALE in .env.test), so every eta here is real seconds:
 * mining 1s/ton, as before. The burn's own duration is no longer
 * `2.5s/cell` (that was lattice-board `msPerTile`, deleted by this change,
 * design.md Decision 18) — it is now solved from continuous distance and the
 * fleet's configured acceleration (space.SolveBurn). The exact figure is not
 * pinned by this spec (a production tuning constant, not a scenario this
 * change's spec names); the timeout below is left deliberately generous
 * rather than guessed tight.
 *
 * Interaction note: glyphs animate every frame (orbits glide), so
 * Playwright's stability check never passes on them — all board clicks go
 * through page.mouse/dispatchEvent as before. Lodes are picked off the
 * RENDERED board (data-mineable), not a parallel API read.
 *
 * Local-only: drives the auth emulator's signup path, like new-user.spec.ts.
 */
const cfg = resolveE2EConfig()

// Fresh account — do not restore the shared logged-in session.
test.use({ storageState: { cookies: [], origins: [] } })

// The journey rides real world-time etas (a burn to the nearest lode + two
// mine runs). No lane leg is ridden any more (depart is unreachable — see
// below), so this is shorter than the pre-migration budget, but the burn
// duration is untuned as of this writing (see the wall-clock note above) —
// left generous rather than guessed tight.
test.setTimeout(300_000)

// Clicks a board glyph by dispatching the click event straight to its button.
// Orbiting glyphs animate every frame, so Playwright's stability check never
// passes and locator.click() would spin forever; raw mouse coordinates are no
// better, because moons draw ABOVE their parent body with a small offset, so
// a coordinate click at a planet's centre can land on the moon riding it.
// dispatchEvent needs neither stability nor hit-testing and always reaches
// the intended glyph.
async function clickGlyph(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).dispatchEvent('click')
}

// Reads the used-tons figure off the hold readout ("12 / 200t" → 12).
async function holdUsed(page: Page): Promise<number> {
  const text = await page.getByTestId('hold-capacity').innerText()
  return Number(text.split('/')[0].trim())
}

test.describe('the vertical slice', () => {
  test('wake → mine → persisted → mine again (no scan, no reachable depart)', async ({ page }) => {
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
    await expect(page.getByTestId('board-overlay')).toBeVisible({ timeout: 15_000 })

    // The hull carries an empty hold from spawn (the roster block on the read).
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 15_000 })
    expect(await holdUsed(page)).toBe(0)

    // 2. NO SCAN — system-interior's unfogged interim read (tasks.md 7.7)
    //    ships every feature, resources included, from the very first board
    //    load. The lode is already there; nothing to trigger, nothing to
    //    wait on.
    const lodes = page.locator('[data-testid^="feature-glyph-"][data-mineable]')
    await expect(
      lodes.first(),
      'the home system interior should already show at least one mineable lode, unfogged',
    ).toBeVisible({ timeout: 15_000 })

    // 3. SELECT the nearest revealed lode (nearest by screen distance from
    //    the roster's sole hull — the board itself draws no fleet mark to
    //    measure from any more, design.md Decision 12, so this reads the
    //    roster row's presence as "the fleet exists" and just picks the
    //    nearest lode to the board's centre, where a fresh spawn's hull
    //    parks).
    //
    //    Moons are excluded: the generator marks them mineable (they carry
    //    resources) but gives them no orbit and a core-cell footprint, so
    //    the server solve (space.BuildCurve's endpoint-clearance guard)
    //    rejects them as a burn target — a moon can't be docked or mined.
    //    Known product gap, unchanged by this migration; surfaced to
    //    Travis previously (2026-08-25).
    const roster = page.getByTestId('fleet-roster')
    await expect(roster).toBeVisible({ timeout: 15_000 })
    const rows = roster.locator('[data-testid^="fleet-row-"]')
    await expect(rows).toHaveCount(1, { timeout: 15_000 })
    const fleetId = (await rows.first().getAttribute('data-testid'))!.replace('fleet-row-', '')

    const boardCenter = { x: 0, y: 0 }
    let lodeId = ''
    let best = Number.POSITIVE_INFINITY
    for (const glyph of await lodes.all()) {
      const id = (await glyph.getAttribute('data-testid'))!.replace('feature-glyph-', '')
      if (id.startsWith('feat-moon-')) continue
      const box = await glyph.boundingBox()
      if (!box) continue
      const d = Math.hypot(box.x - boardCenter.x, box.y - boardCenter.y)
      if (d < best) {
        best = d
        lodeId = id
      }
    }
    expect(lodeId, 'a nearest non-moon lode should have been picked').not.toBe('')
    await clickGlyph(page, `feature-glyph-${lodeId}`)

    // 4. BURN, commanded from the roster row (fleet-roster ADDED "The
    //    Roster Row Is the Fleet Command Surface") — no board "move-button"
    //    exists any more. Burn is always offered, so no precondition check
    //    is needed before clicking it.
    await page.getByTestId(`fleet-cmd-burn-${fleetId}`).click()
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText('Docked', { timeout: 180_000 })

    // 5. MINE a minimum-size run (5t at 0.001 t/ms = 5s) and watch the hold
    //    fill at the eta — no navigation, the refetch rules land it. The
    //    offer anchors to the docked state on the fleet card ("Mine Offer on
    //    the Docked Fleet") — no board click involved.
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect(page.getByTestId('mine-countdown')).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() => holdUsed(page), { timeout: 45_000, message: 'the hold fills at the run’s eta' })
      .toBe(5)

    // 6. PERSISTED: reload — the hold readout re-derives from a fresh
    //    Firestore read (the same read a returning fleet would issue).
    await page.reload()
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 15_000 })
    expect(await holdUsed(page)).toBe(5)

    // 7. Mine AGAIN — the lode's ledger and the hold both accumulate
    //    (exactly-once deltas: 5 + 5, never 5 or 15). The offer is already
    //    back on the fleet card (still docked, channel free again).
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect
      .poll(() => holdUsed(page), { timeout: 45_000, message: 'the second run accumulates' })
      .toBe(10)

    // 8. DEPART HAS NO SUCCESSOR HERE — reported, not silently dropped.
    //
    //    A lane jump requires the fleet to be `attachedTo` a lane-gate body
    //    whose lane the corporation has CHARTED (fleet-movement ADDED "Lane
    //    Jump From a Docked Gate"). Charting a lane happens exactly two
    //    ways in the current tree: (1) as a byproduct of actually crossing
    //    it (fleet-movement "Jump Arrival Parks Near the Destination Gate,
    //    Unmasked" — `via: traveled`), which is circular — you cannot jump
    //    an uncharted lane to chart it; or (2) scanning, which this change
    //    deletes outright with no replacement (observation-fog-and-scan
    //    REMOVED "Running Scan Echo Disc"/"Scan Resolution Mints the
    //    Reveal") — link 5 (replace-observation-with-sightings) is where a
    //    successor sensor verb lands. Spawn itself charts home only, zero
    //    lanes (corporation-spawn, unaffected by this change). And the
    //    interior read's lane-gate list is STILL charted-tier-filtered
    //    post-migration (`system/handler.go`'s `chartedGates` survives
    //    section 7's audit as system-interior's one remaining fog
    //    dependency) — so an uncharted gate is not merely un-jumpable, it
    //    is invisible.
    //
    //    Net effect: between this change and link 5 landing, there is no
    //    player-driven path to a first charted lane, so `depart` cannot be
    //    exercised end-to-end by ANY account, fresh or old. This matches
    //    design.md's own recorded risk ("This makes the game visually
    //    unplayable for links 4 through 7") and is not this test's bug to
    //    paper over.
    //
    //    What IS asserted here, honestly, is the current interim state: a
    //    fresh corp's board shows no lane gate at all.
    await expect(page.locator('[data-testid^="gate-glyph-"]')).toHaveCount(0)
  })
})
