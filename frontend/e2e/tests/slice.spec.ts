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
 *   Firestore read, not client cache) → mine again (the ledger accumulates)
 *   → select the home system's nearest lane-gate body → BURN + dock to it
 *   (board-view "Burn Command Targets a Selected Lane-Gate Body Like Any
 *   Other Body") → JUMP, commanded from the roster panel (board-view "Jump
 *   Commit").
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
 *   - `depart` (a lane jump) previously had **NO REACHABLE PATH** in this
 *     journey (see git history for the prior note, dated against
 *     migrate-fleet-to-continuous-burns): the interior read's lane-gate list
 *     was still charted-tier-filtered, and charting a lane was circular
 *     (only jumping or the now-deleted scan verb charted one). Both premises
 *     are now FALSE, closed by replace-observation-with-sightings §1 (task
 *     1.3 deletes `chartedGates` — "every lane-gate body ships unfiltered to
 *     every authenticated requester," system-interior "Bodies Are Public;
 *     Ships Are Disclosed") and tasks.md 4.10-4.13 (the roster's jump
 *     command is gated by attachment alone, and both the board- and
 *     galaxy-tier jump commands resolve a `laneId` with no charted-lane
 *     dependency at all). `depart` is exercised below as the journey's
 *     final leg — this is the section's own acceptance criterion (see the
 *     SDET handoff report's "player-path e2e" verdict).
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
 *   - `gate-glyph-*` — SURVIVES, and is now expected PRESENT even for a
 *     fresh corp with nothing charted: every lane-gate body on a
 *     materialized system's board ships unfiltered (system-interior "Bodies
 *     Are Public; Ships Are Disclosed"), so the home system's own lane
 *     gates are visible from the very first board load, same as any other
 *     body.
 *   - `fleet-cmd-jump-{fleetId}` — the roster's jump command, offered once
 *     the fleet is `attachedTo` a lane-gate body (fleet-roster "The Roster
 *     Row Is the Fleet Command Surface, Jump Gated by Attachment Alone").
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

// The journey rides real world-time etas (a burn to the nearest lode, two
// mine runs, a second burn to the nearest lane gate, and a jump commit) —
// every leg's duration is untuned as of this writing (see the wall-clock
// note above) — left generous rather than guessed tight.
test.setTimeout(600_000)

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

// Reads the used-tons figure off the hold readout ("12 / 200t" → 12). Total
// hold occupancy is a MOVING TARGET once fuel shares the cargo pool
// (add-fuel-as-cargo: fuel occupies the same `roster.cargo` map a mined
// resource does, and every burn spends some) — this is still the right way
// to prove SOMETHING occupies the hold (the starting-fuel-grant sanity check
// below), but it must never anchor a "mined N more tons" assertion, because a
// burn between the baseline read and the mine commit changes the total for a
// reason that has nothing to do with mining. See `holdKindTons` for that.
async function holdUsed(page: Page): Promise<number> {
  const text = await page.getByTestId('hold-capacity').innerText()
  return Number(text.split('/')[0].trim())
}

// Reads ONE resource kind's own tons off the hold readout's per-kind row
// (`hold-{kind}`, e.g. "metals ... 5t"). The row only renders once that
// kind's tons are > 0 (FactsPanel.tsx's `entries` filter), so a kind with
// nothing mined yet legitimately reads 0 rather than failing.
async function holdKindTons(page: Page, kind: string): Promise<number> {
  const row = page.getByTestId(`hold-${kind}`)
  if ((await row.count()) === 0) return 0
  const text = await row.innerText()
  const match = text.match(/([\d.]+)\s*t\b/)
  return match ? Number(match[1]) : 0
}

// The kind MineSection has pre-selected (the docked lode's richest resource,
// `mine-kind-{kind}` with `aria-pressed="true"`) — read off the DOM rather
// than assumed, so this spec proves the mined tonnage against whichever kind
// the panel actually committed, not a guess.
async function selectedMineKind(page: Page): Promise<string> {
  const pressed = page.locator('[data-testid^="mine-kind-"][aria-pressed="true"]')
  const testId = (await pressed.first().getAttribute('data-testid'))!
  return testId.replace('mine-kind-', '')
}

test.describe('the vertical slice', () => {
  test('wake → mine → persisted → mine again → fly to a gate → jump', async ({ page }) => {
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

    // The hull's hold is NOT empty from spawn any more: add-fuel-as-cargo
    // (tasks.md 5) grants starting fuel at spawn, and fuel occupies the
    // same cargo pool as mined ore (fleet-movement "Fleet Cargo Pool").
    // Capture the served baseline (fleet.FuelParams.StartingFuelTons —
    // 100 by default) rather than hard-coding it, so the mining deltas
    // this journey actually exists to prove (below) stay pinned exactly
    // without this spec also re-pinning a tuning constant that isn't its
    // concern.
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 15_000 })
    const startingHold = await holdUsed(page)
    expect(
      startingHold,
      'a freshly spawned hull should hold its starting-fuel grant, not an empty hold',
    ).toBeGreaterThan(0)

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

    // 5. MINE a minimum-size run (5t at 0.001 t/ms = 5s) and watch the MINED
    //    RESOURCE — not the aggregate hold — fill at the eta. Total hold
    //    occupancy is not a valid baseline any more (add-fuel-as-cargo: this
    //    same journey's own burn to the lode already spent fuel out of the
    //    same cargo pool, so `startingHold + 5` cannot hold — the pool
    //    shrank from fuel burn and grew from mining in between, and this
    //    spec has no business pinning the burn's fuel cost). What THIS
    //    slice proves is the mined tonnage itself arriving and persisting —
    //    so it is asserted directly on the mined kind's own hold row.
    //    SDET NOTE (post-handoff test revision — cause: provably misread the
    //    spec, adjudicated 2026-09-02): the prior assertion read
    //    `holdUsed(page)` (aggregate) against `startingHold + 5`, which
    //    assumed hold only grows; fuel consumption by the leg-1 burn falsified
    //    that assumption. Fixed to assert the mined kind's own tonnage.
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 10_000 })
    const mineKind = await selectedMineKind(page)
    const mineKindBefore = await holdKindTons(page, mineKind)
    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect(page.getByTestId('mine-countdown')).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() => holdKindTons(page, mineKind), {
        timeout: 45_000,
        message: 'the mined resource fills at the run’s eta',
      })
      .toBe(mineKindBefore + 5)

    // 6. PERSISTED: reload — the hold readout re-derives from a fresh
    //    Firestore read (the same read a returning fleet would issue).
    await page.reload()
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 15_000 })
    expect(await holdKindTons(page, mineKind)).toBe(mineKindBefore + 5)

    // 7. Mine AGAIN — the lode's ledger and the mined resource both
    //    accumulate (exactly-once deltas: 5 + 5, never 5 or 15). The offer is
    //    already back on the fleet card (still docked, channel free again).
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect
      .poll(() => holdKindTons(page, mineKind), {
        timeout: 45_000,
        message: 'the second run accumulates',
      })
      .toBe(mineKindBefore + 10)

    // 8. DEPART — select the home system's nearest lane-gate body, BURN +
    //    dock to it (board-view "Burn Command Targets a Selected Lane-Gate
    //    Body Like Any Other Body" — replace-observation-with-sightings
    //    tasks.md 4.12 closes the ONLY remaining client wiring gap in this
    //    leg: `handleBurn` used to refuse this exact click with "Select a
    //    body to target first", because a gate's selection is
    //    `{kind:'gate'}`, not `{kind:'feature'}`), then JUMP (fleet-roster
    //    "The Roster Row Is the Fleet Command Surface, Jump Gated by
    //    Attachment Alone" + board-view "Jump Commit" — tasks.md 4.10/4.11,
    //    both already landed, offer and wire the command entirely from THIS
    //    board's own `board.laneGates` read; no galaxy-tier fix is needed
    //    for this leg of the journey). This is the section's own
    //    acceptance criterion (see the SDET handoff report's "player-path
    //    e2e" verdict), not a bonus assertion.
    //
    //    Every home system has at least one lane-gate body — the backend's
    //    own end-to-end traversability test (tasks.md 1.6,
    //    backend/traversability_e2e_test.go) hard-fails a spawn whose home
    //    system's interior read carries zero lane gates, so this is a
    //    structural guarantee, not a lucky seed. And since §1 (task 1.3)
    //    deleted `chartedGates`, that gate is visible from the very first
    //    board load, unfiltered by charted knowledge (system-interior
    //    "Bodies Are Public; Ships Are Disclosed") — closing the OTHER half
    //    of the old blocker this section's predecessor note described
    //    (an uncharted gate used to be not merely un-jumpable, but
    //    invisible).
    const gates = page.locator('[data-testid^="gate-glyph-"]')
    await expect(
      gates.first(),
      'the home system interior should show at least one lane-gate body, unfiltered by charted knowledge',
    ).toBeVisible({ timeout: 15_000 })

    let gateDestId = ''
    best = Number.POSITIVE_INFINITY
    for (const glyph of await gates.all()) {
      const id = (await glyph.getAttribute('data-testid'))!.replace('gate-glyph-', '')
      const box = await glyph.boundingBox()
      if (!box) continue
      const d = Math.hypot(box.x - boardCenter.x, box.y - boardCenter.y)
      if (d < best) {
        best = d
        gateDestId = id
      }
    }
    expect(gateDestId, 'a nearest lane-gate body should have been picked').not.toBe('')
    await clickGlyph(page, `gate-glyph-${gateDestId}`)

    // Burn toward the SELECTED gate body — the exact same roster command,
    // the exact same click, as burning toward the lode above (board-view
    // "No gate-specific refusal copy exists": no separate affordance, no
    // distinct refusal). This is the click that used to be silently
    // swallowed by the "Select a body to target first" refusal.
    //
    // FALSE-POSITIVE GUARD (why this waits for "Under way" FIRST): the
    // fleet is ALREADY showing "Docked" here — still attached to the LODE
    // from step 7 — so asserting "Docked" alone, without first observing a
    // transition AWAY from it, would pass trivially even if this burn click
    // were silently swallowed (the pre-4.12 refusal never calls
    // order.mutate at all, so `attachedTo` would just stay pointed at the
    // lode the whole time and this assertion would never actually catch
    // that). A burn commit clears `attachedTo` immediately
    // (roster-status.ts's own comment: "the backend clears at burn commit,
    // sets only at resolve") and reads "Under way" while it runs — that
    // transition is the genuine proof an order was actually submitted
    // toward the gate, not a no-op.
    await page.getByTestId(`fleet-cmd-burn-${fleetId}`).click()
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText(/under way/i, { timeout: 15_000 })
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText('Docked', { timeout: 240_000 })

    // JUMP — offered the instant the fleet is attached to the gate, no
    // charted-lane precondition (fleet-roster "Jump Gated by Attachment
    // Alone"); commits naming the attached gate's laneId, sourced straight
    // off the already-open interior read, no second read (board-view "Jump
    // Commit").
    await expect(page.getByTestId(`fleet-cmd-jump-${fleetId}`)).toBeVisible({ timeout: 10_000 })
    await page.getByTestId(`fleet-cmd-jump-${fleetId}`).click()

    // The jump committed — this board's own roster row for the SAME fleet
    // reflects lane-transit state ("In transit", roster-status.ts) rather
    // than staying docked. This is the honest, minimal success signal: a
    // fleet's `systemId` does not flip until the jump RESOLVES (design.md
    // Decision 10), so navigating away is not expected here, and asserting
    // a resolved arrival would mean waiting out the lane's full crossing
    // time on the real wall clock for no additional coverage of this
    // section's own scope (jump COMMIT, not jump resolution — already
    // covered end-to-end, with a time-skipped arrival, by
    // backend/traversability_e2e_test.go).
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText(/in transit/i, { timeout: 15_000 })
  })
})
