import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'

/**
 * Refuel commit, wire to click — openspec change add-fuel-as-cargo,
 * tasks.md 8.4–8.7 (board-view ADDED "Refuel Offer on the Docked Fleet" /
 * "Refuel Commit" / "Refuel Control Guards Against Double-Submit"; MODIFIED
 * "Credit Balance Readout"; fleet-roster ADDED "The Roster Row Shows Held
 * Fuel and an Estimated Range").
 *
 * WRITTEN, NOT EXECUTED — per this SDET's brief: Playwright boots its own
 * isolated stack and must never run concurrently with the backend
 * emulator's own test suite (shared emulator project). This file is the RED
 * handoff's Playwright half; run it in CI or a dedicated local slot via:
 *
 *   bash scripts/dev/with-test-emulators.sh \
 *     'cd frontend && npx playwright test refuel-commit.spec.ts --reporter=line'
 *
 * WHY THIS EXISTS ALONGSIDE THE VITEST SUITES: `SystemBoardView.test.tsx`
 * mocks `useRefuel`/`useStation`/`useMarketBoard` entirely — it can prove
 * the CLIENT wiring is correct given a station/price/roster it invents, but
 * it cannot prove the server actually SERVES a `fuelPricePerTon` the
 * preview reads, or that a real double-click against a REAL in-flight
 * mutation only ever reaches the server once. `hooks/use-refuel.test.tsx`
 * proves the double-submit MECHANISM against a mocked transport. Neither
 * can fail if the seam between server and client breaks (a served price
 * field renamed, a real network round-trip's timing differing from a
 * synchronous mock). This spec closes that seam, on the actual wire,
 * against the actual (test-stack) backend.
 *
 * PRECONDITION THIS SPEC DEPENDS ON, NOT YET LANDED (corporation-spawn
 * ADDED "Spawn Asset Healing" — the starting-fuel grant, tasks.md 5.1/5.2):
 * a fresh corporation must spawn holding enough fuel to reach its home
 * station under `DerivedAccelCeiling` (the documented spawn-time carve-out
 * from this change's floor-pricing rule). Until that lands, this journey's
 * OWN burn-to-home-station leg will itself be unaffordable and the spec
 * will fail long before it reaches the refuel assertions — that is a
 * legitimate, expected red for a different reason than the ones commented
 * inline below, not a flaw in this spec.
 *
 * data-testid / wire contract THIS SDET ASSUMES (see this SDET's coverage
 * table / handoff report for the full cross-reference to each Vitest
 * suite's own contract note):
 *   - `refuel-section`, `refuel-tons-input`, `refuel-cost-preview`,
 *     `refuel-button` (RefuelSection.tsx, new).
 *   - `fleet-fuel-{id}`, `fleet-range-{id}` (FleetRoster.tsx).
 *   - `balance-value`, `balance-refuel-cost` (BalanceReadout.tsx).
 *   - `POST /v1/fleets/:fleetId/refuel` with body `{ tons, operationKey }`.
 *   - the fleet read (`GET /v1/fleets?mine=true` or `GET /v1/fleets/:id`)
 *     serves `roster.fuelPricePerTon`.
 */
const cfg = resolveE2EConfig()

test.use({ storageState: { cookies: [], origins: [] } })

// Mirrors jump-commit.spec.ts's own generous, wall-clock-driven timeout
// note: the test stack runs the world at real-time scale, and this journey
// burns all the way to the home station under its own power.
test.setTimeout(600_000)

async function clickGlyph(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).dispatchEvent('click')
}

test.describe('refuel commit — wire to click, double-submit guard', () => {
  test('a docked fleet refuels for the server-served price, and a rapid double-click still settles exactly once', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    // 1. Sign up and wake onto the home board — spawn's starting-fuel grant
    //    (corporation-spawn ADDED "Spawn Asset Healing") is what makes the
    //    very next step possible at all.
    const email = `e2e+refuel-${Date.now()}@hexaverse.test`
    const password = 'e2ePassword123!'
    await page.goto('/login?signUp=true')
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-password').fill(password)
    await page.getByTestId('login-confirm-password').fill(password)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('wake-up-flow')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('wake-name-input').fill('E2E Refueler')
    await page.getByTestId('wake-submit').click()
    await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 20_000 })
    await expect(page.getByTestId('board-overlay')).toBeVisible({ timeout: 15_000 })

    const roster = page.getByTestId('fleet-roster')
    await expect(roster).toBeVisible({ timeout: 15_000 })
    const rows = roster.locator('[data-testid^="fleet-row-"]')
    await expect(rows).toHaveCount(1, { timeout: 15_000 })
    const fleetId = (await rows.first().getAttribute('data-testid'))!.replace('fleet-row-', '')

    // The roster shows a held-fuel/range readout from the very first read
    // (fleet-roster ADDED "The Roster Row Shows Held Fuel and an Estimated
    // Range") — a fresh, un-spent starting grant, so both figures are
    // strictly positive before anything is burned.
    await expect(page.getByTestId(`fleet-fuel-${fleetId}`)).toBeVisible()
    await expect(page.getByTestId(`fleet-range-${fleetId}`)).toBeVisible()

    // 2. Burn to the home station and dock — the same "under way" guard
    //    slice.spec.ts/jump-commit.spec.ts use, so a swallowed click can't
    //    silently pass by waiting only on the eventual docked state.
    //
    // SDET NOTE (post-handoff test revision — cause: provably misread the
    // production wire, adjudicated 2026-09-02): this used to look for
    // `[data-station="true"]`, an attribute that BoardOverlay.tsx never
    // emits (no such marker exists on any feature glyph), so the "fall back
    // to any feature glyph" branch always fired — silently picking whatever
    // feature happened to draw first (a belt, in practice), never the
    // station. The journey then genuinely docked at that body, so
    // `stationQuotes` stayed null server-side (SystemBoardView.tsx's
    // `dockedAtStation` correctly compares `attachedTo` to the station's own
    // `featureId`) and `refuel-section` correctly never rendered — a fixture
    // defect, not a production gap: the gate itself is proven by
    // FactsPanel.test.tsx's "offers refuel whenever docked at a station"
    // unit test. Fixed to target the station via the accessible name
    // BoardOverlay.tsx already serves for every glyph (`aria-label={f.type}
    // {f.id}`) rather than an attribute nothing writes.
    const stationGlyph = page.getByRole('button', { name: /^station\b/ })
    await expect(
      stationGlyph,
      'the home system should carry exactly one station-typed feature glyph',
    ).toHaveCount(1)
    const targetTestId = (await stationGlyph.getAttribute('data-testid'))!
    await clickGlyph(page, targetTestId)
    await page.getByTestId(`fleet-cmd-burn-${fleetId}`).click()
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText(/under way/i, {
      timeout: 15_000,
    })
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText('Docked', {
      timeout: 300_000,
    })

    // 3. Scenario: Refuel is offered while docked at a station.
    await expect(page.getByTestId('refuel-section')).toBeVisible({ timeout: 15_000 })

    // Scenario: Fleet Read Serves the Configured Fuel Price, Never
    // Duplicated Client-Side — the preview must move when the tonnage does,
    // by whatever price the server actually served (no fixed expectation on
    // the number itself, since this SDET does not know the tuned
    // `FuelParams.PricePerTon`; the ASSERTION is that it reacts, proving a
    // real served value drives it rather than a frozen placeholder).
    const before = await page.getByTestId('refuel-cost-preview').textContent()
    await page.getByTestId('refuel-tons-input').fill('1')
    const oneTon = await page.getByTestId('refuel-cost-preview').textContent()
    await page.getByTestId('refuel-tons-input').fill('2')
    const twoTons = await page.getByTestId('refuel-cost-preview').textContent()
    expect(twoTons, 'doubling the tonnage must change the previewed cost').not.toBe(oneTon)
    expect(before).not.toBe(undefined)

    // 4. Scenario: A double-click yields exactly one refuel — asserted on
    //    the WIRE (the only place this guarantee actually matters), not on
    //    the resulting UI state alone, which could look identical whether
    //    one or two requests were sent if the server itself deduped.
    const refuelRequests: { operationKey?: string }[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/v1\/fleets\/[^/]+\/refuel$/.test(req.url())) {
        try {
          refuelRequests.push(req.postDataJSON() as { operationKey?: string })
        } catch {
          refuelRequests.push({})
        }
      }
    })

    await page.getByTestId('refuel-tons-input').fill('1')
    const refuelButton = page.getByTestId('refuel-button')
    // Two rapid clicks, deliberately not awaited independently — the guard
    // under test is exactly "can a fast double-click reach the network
    // twice", so serializing the clicks with an `await` between them would
    // defeat the point.
    await Promise.all([refuelButton.click(), refuelButton.click()])

    await expect(page.getByTestId('balance-refuel-cost')).toBeVisible({ timeout: 15_000 })

    expect(
      refuelRequests.length,
      `expected exactly one /refuel request from a rapid double-click, got ${refuelRequests.length}: ` +
        JSON.stringify(refuelRequests),
    ).toBe(1)

    // 5. Scenario: A fresh attempt after a completed refuel is a second,
    //    independent refuel, minting a NEW operation key.
    const firstKey = refuelRequests[0]?.operationKey
    await page.getByTestId('refuel-tons-input').fill('1')
    await refuelButton.click()
    await expect.poll(() => refuelRequests.length, { timeout: 15_000 }).toBe(2)
    const secondKey = refuelRequests[1]?.operationKey
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBeTruthy()
    expect(secondKey).not.toBe(firstKey)
  })
})
