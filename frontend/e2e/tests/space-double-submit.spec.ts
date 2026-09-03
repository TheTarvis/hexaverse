import { test, expect, type Locator, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import type { ServedInterior } from '../helpers/space-view'
import {
  bodyIdsMatching,
  captureInteriors,
  digits,
  holdKindTons,
  mineableBodyId,
  selectBody,
  selectFirstBodyMatching,
  stationFeatureId,
} from '../helpers/space-view'

/**
 * RED-PHASE SUITE — openspec change `build-production-space-view`,
 * tasks.md 8.5. Covers, at BROWSER LEVEL and only at browser level:
 *
 *   `docked-fleet-actions`
 *     - "Two activations in one tick submit one sale and mint one key"
 *     - "A double-click yields exactly one sale"
 *     - "Two activations in one tick submit one mine run"
 *     - "A double-click yields exactly one mine run"
 *     - "Two activations in one tick submit one refuel and mint one key"
 *     - "A double-click yields exactly one refuel"
 *     - "A fresh attempt after a completed sale is a second, independent sale"
 *   `system-space-view`
 *     - "Two activations in one tick submit one burn order"
 *     - "A double-click yields exactly one burn order"
 *     - "A double-click yields exactly one jump order"
 *     - "The guard releases when the request settles or fails"
 *
 * WHY THIS MUST NOT BE A UNIT TEST — read before "simplifying" it.
 *
 * `hooks/use-refuel.test.tsx` asserted this exact guarantee and PASSED
 * against a handler with no guard at all: its harness held the mutation
 * promise open by hand and waited for the disabled state BETWEEN the two
 * clicks, stepping around the render race that was the entire defect. The
 * Playwright equivalent failed 4/4, never once passing. `commitSell` has the
 * same hole today and no such e2e, which is the only reason it is not also
 * red — a CONFIRMED production defect (proposal, "Fix a confirmed production
 * defect against an already-live requirement"): two clicks in one tick each
 * mint their OWN operation key, so server-side idempotency-by-key
 * structurally cannot dedup them. A double charge on this economy's first
 * credit sink.
 *
 * So every activation pair below is fired by ONE synchronous DOM callback:
 *
 *     await button.evaluate((el: HTMLElement) => { el.click(); el.click() })
 *
 * That is a single task on the main thread. There is no `await` between the
 * two activations, no render cycle, and no Playwright actionability re-check
 * — which `Promise.all([btn.click(), btn.click()])` still permits. Do NOT
 * relax it to two separate `click()` calls: a render-dependent guard passes
 * that shape and ships the defect.
 *
 * ASSERTED ON THE WIRE, not on the resulting UI. The UI would look identical
 * whether one or two requests were sent if the server happened to dedup — and
 * for sell it demonstrably does not, because each attempt mints its own key.
 *
 * data-testid / wire contract this spec assumes (see the SDET coverage table
 * for the paired Vitest suites):
 *   - space-view, space-canvas-region, fleet-roster, fleet-row-<id>
 *   - body-hit-<bodyId>, offscreen-<bodyId>, burn-button
 *   - fleet-cmd-jump-<id>, fleet-cmd-burn-<id>
 *   - mine-section / mine-tons-input / mine-button
 *   - sell-section / sell-tons-input / sell-button
 *   - refuel-section / refuel-tons-input / refuel-button
 *   - POST /v1/fleets/:id/orders, /mine, /sell, /refuel, /jump
 */

const cfg = resolveE2EConfig()

test.use({ storageState: { cookies: [], origins: [] } })
// The test stack runs the world at real-time scale and this journey burns
// under its own power; mirrors jump-commit.spec.ts's own note.
test.setTimeout(900_000)

interface Recorded {
  url: string
  body: Record<string, unknown>
}

function recordPosts(page: Page, pattern: RegExp): Recorded[] {
  const seen: Recorded[] = []
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !pattern.test(req.url())) return
    let body: Record<string, unknown> = {}
    try {
      body = (req.postDataJSON() ?? {}) as Record<string, unknown>
    } catch {
      body = {}
    }
    seen.push({ url: req.url(), body })
  })
  return seen
}

/**
 * TWO ACTIVATIONS, ONE TICK. The whole point of this file.
 */
async function doubleActivateInOneTick(locator: Locator): Promise<void> {
  await expect(locator).toBeEnabled()
  await locator.evaluate((el: HTMLElement) => {
    el.click()
    el.click()
  })
}

async function signUpAndWake(page: Page, tag: string): Promise<string> {
  const email = `e2e+${tag}-${Date.now()}@hexaverse.test`
  const password = 'e2ePassword123!'
  await page.goto('/login?signUp=true')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-confirm-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('wake-up-flow')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('wake-name-input').fill(`E2E ${tag}`)
  await page.getByTestId('wake-submit').click()
  // 60s — see `wakeNewCorp` in ../helpers/space-view.ts for why.
  await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 60_000 })
  await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })

  const rows = page.getByTestId('fleet-roster').locator('[data-testid^="fleet-row-"]')
  await expect(rows).toHaveCount(1, { timeout: 15_000 })
  return (await rows.first().getAttribute('data-testid'))!.replace('fleet-row-', '')
}

/**
 * Burn the acting fleet to the first body matching `prefix` and wait for it to
 * dock there.
 *
 * Selection goes through the shared `selectBody` helper: an off-screen mark is
 * reached through its own affordance (never a hand-set camera position), and
 * an on-screen one through its keyboard hit target. See that helper for why a
 * `click()` cannot be used against a scene that animates every frame — the
 * failure that used to strand this suite here. The one real pointer pick in
 * the e2e suite lives in `space-journey.spec.ts`; the double-submit guards
 * asserted below are about the COMMAND controls, which are ordinary buttons
 * and are still clicked as such.
 */
async function burnToBodyAndDock(page: Page, fleetId: string, prefix: string): Promise<void> {
  await selectFirstBodyMatching(page, prefix)
  await page.getByTestId('burn-button').click()
  const row = page.getByTestId(`fleet-row-${fleetId}`)
  await expect(row).toContainText(/under way/i, { timeout: 20_000 })
  await expect(row).toContainText(/docked/i, { timeout: 600_000 })
}

/**
 * The smallest mine run the server accepts (`mine.defaultMinRunTons`, 5t).
 *
 * SDET, 2026-09-03: these tests asked for 1 ton, which `mine`'s
 * MinRunTons floor rejects outright — the command toasted "That command could
 * not be completed" and `mine-countdown` never appeared. The defect was
 * invisible until the selection helper started working, because the suite
 * never reached the mine control before. It is a TEST defect, not a
 * production one: the floor is a named, deliberate bound (Decision #18), and
 * a run below it SHOULD be refused.
 */
const MIN_RUN_TONS = '5'

/**
 * Burn to a body the SERVED interior read says actually carries ore, and dock.
 */
async function burnToMineableBodyAndDock(
  page: Page,
  fleetId: string,
  interiors: Map<string, ServedInterior>,
): Promise<void> {
  const homeId = new URL(page.url()).pathname.split('/').pop()!
  const home = interiors.get(homeId)
  expect(home, `no interior read for ${homeId} was captured off the wire`).toBeTruthy()
  const lodeId = mineableBodyId(home!, stationFeatureId(home!) ?? undefined)
  expect(lodeId, `the home system's interior read carried no mineable body (home ${homeId})`).toBeTruthy()
  await selectBody(page, lodeId!)
  await page.getByTestId('burn-button').click()
  const row = page.getByTestId(`fleet-row-${fleetId}`)
  await expect(row).toContainText(/under way/i, { timeout: 20_000 })
  await expect(row).toContainText(/docked/i, { timeout: 600_000 })
}

test.describe('space view — synchronous double-submit guards', () => {
  test('Scenario: Two activations in one tick submit one burn order', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')
    const orders = recordPosts(page, /\/v1\/fleets\/[^/]+\/orders$/)
    const fleetId = await signUpAndWake(page, 'burnguard')

    // Any body will do; the guard is about the control, not the target. Two
    // are captured because the release check below needs a genuinely NEW
    // command, and an order to the body the fleet is already docked at is not
    // reliably one.
    const bodyIds = await bodyIdsMatching(page, 'feat-body-')
    expect(bodyIds.length, 'a generated system carries several ordinary bodies').toBeGreaterThan(1)
    await selectBody(page, bodyIds[0])
    await expect(page.getByTestId('burn-button')).toBeEnabled()

    await doubleActivateInOneTick(page.getByTestId('burn-button'))

    await expect(page.getByTestId(`fleet-row-${fleetId}`)).toContainText(/under way/i, {
      timeout: 20_000,
    })
    expect(
      orders.length,
      `expected exactly one /orders request from two same-tick activations, got ${orders.length}: ${JSON.stringify(orders.map((o) => o.body))}`,
    ).toBe(1)

    // Scenario: The guard releases when the request settles or fails — a
    // later, genuinely new command goes through.
    await expect(page.getByTestId(`fleet-row-${fleetId}`)).toContainText(/docked/i, { timeout: 600_000 })
    await selectBody(page, bodyIds[1])
    await page.getByTestId('burn-button').click()
    await expect.poll(() => orders.length, { timeout: 20_000 }).toBe(2)
  })

  test('Scenario: Two activations in one tick submit one mine run', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')
    const mines = recordPosts(page, /\/v1\/fleets\/[^/]+\/mine$/)
    const interiors = captureInteriors(page)
    const fleetId = await signUpAndWake(page, 'mineguard')

    // Dock at a resource-bearing body — the mine offer is anchored to the
    // fleet's docked state, never to a selection — and take that body off the
    // SERVED interior read rather than off whichever mark happens to be drawn
    // first. Which of a generated system's bodies carries ore is a property of
    // the seed, and a run against a barren one fails for a reason that has
    // nothing to do with the double-submit guard under test.
    await burnToMineableBodyAndDock(page, fleetId, interiors)

    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('mine-tons-input').fill(MIN_RUN_TONS)
    await doubleActivateInOneTick(page.getByTestId('mine-button'))

    await expect(page.getByTestId('mine-countdown')).toBeVisible({ timeout: 20_000 })
    expect(
      mines.length,
      `expected exactly one /mine request, got ${mines.length}: ${JSON.stringify(mines.map((m) => m.body))}`,
    ).toBe(1)
  })

  test('Scenario: Two activations in one tick submit one sale and mint one key', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')
    // THE CONFIRMED DEFECT. `commitSell` mints `newOperationKey()` and calls
    // `sell.mutate(...)` unconditionally; the only protection is
    // `disabled={!committable}` driven by an async React-Query pending flip.
    const sales = recordPosts(page, /\/v1\/fleets\/[^/]+\/sell$/)
    const interiors = captureInteriors(page)
    const fleetId = await signUpAndWake(page, 'sellguard')

    // Mine something, then dock at the home station and sell it.
    await burnToMineableBodyAndDock(page, fleetId, interiors)
    await page.getByTestId('mine-tons-input').fill(MIN_RUN_TONS)
    const mineKind = await page.getByTestId('mine-kind-select').inputValue()
    await page.getByTestId('mine-button').click()
    // The run must be seen to START before it can be waited out: `toBeHidden`
    // is satisfied by an element that does not exist yet, so waiting only on
    // it returns the instant the click is dispatched and the fleet leaves for
    // the station with an empty hold — which is how this test came to click a
    // permanently disabled Sell button.
    await expect(page.getByTestId('mine-countdown')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('mine-countdown')).toBeHidden({ timeout: 600_000 })
    // POLLED, not read once: the hold fills on the eta-scheduled refetch that
    // follows the run's completion, so the tonnage lands a moment after the
    // countdown disappears (`slice.spec.ts` polls the same readout for the
    // same reason).
    await expect
      .poll(() => holdKindTons(page, mineKind), {
        timeout: 60_000,
        message: 'there is nothing to sell unless the mine run actually delivered',
      })
      .toBeGreaterThan(0)

    await burnToBodyAndDock(page, fleetId, 'feat-station')
    await expect(page.getByTestId('sell-section')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('sell-tons-input').fill('1')
    const balanceBeforeSale = await digits(page, 'balance-value')

    await doubleActivateInOneTick(page.getByTestId('sell-button'))

    await expect.poll(() => sales.length, { timeout: 20_000 }).toBeGreaterThan(0)
    expect(
      sales.length,
      `expected exactly one /sell request, got ${sales.length}: ${JSON.stringify(sales.map((s) => s.body))}`,
    ).toBe(1)

    // ...carrying EXACTLY ONE operation key. The second activation must mint
    // none at all: two independently-minted keys defeat server-side
    // idempotency STRUCTURALLY rather than merely racing it.
    const keys = sales.map((s) => s.body.operationKey)
    expect(keys.filter(Boolean)).toHaveLength(1)

    // Scenario: A fresh attempt after a completed sale is a second,
    // independent sale — a NEW key.
    //
    // "AFTER A COMPLETED SALE" is load-bearing, and the wait below is what
    // makes it true. `sales.length > 0` proves only that the request LEFT the
    // browser; the guard is still held until the mutation settles, and a
    // second activation inside that window is SUPPOSED to be swallowed — that
    // is the guard doing its job, not the release failing. The credited
    // balance is the first observable proof the sale completed. (Measured:
    // clicking straight after the request was seen loses the second sale
    // every time, and reads as a production defect when it is a missing wait.)
    await expect
      .poll(() => digits(page, 'balance-value'), { timeout: 30_000 })
      .toBeGreaterThan(balanceBeforeSale)

    await page.getByTestId('sell-tons-input').fill('1')
    await page.getByTestId('sell-button').click()
    await expect.poll(() => sales.length, { timeout: 20_000 }).toBe(2)
    expect(sales[1].body.operationKey).toBeTruthy()
    expect(sales[1].body.operationKey).not.toBe(sales[0].body.operationKey)
  })

  test('Scenario: Two activations in one tick submit one refuel and mint one key', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')
    // The refuel twin was fixed in 41e3c46 with a hand-rolled ref; task 8.4
    // migrates it onto the shared hook, and THIS is the regression that
    // proves the migration did not lose the guard.
    const refuels = recordPosts(page, /\/v1\/fleets\/[^/]+\/refuel$/)
    const fleetId = await signUpAndWake(page, 'refuelguard')

    await burnToBodyAndDock(page, fleetId, 'feat-station')
    await expect(page.getByTestId('refuel-section')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('refuel-tons-input').fill('1')

    await doubleActivateInOneTick(page.getByTestId('refuel-button'))

    await expect.poll(() => refuels.length, { timeout: 20_000 }).toBeGreaterThan(0)
    expect(
      refuels.length,
      `expected exactly one /refuel request, got ${refuels.length}: ${JSON.stringify(refuels.map((r) => r.body))}`,
    ).toBe(1)
    expect(refuels.map((r) => r.body.operationKey).filter(Boolean)).toHaveLength(1)
  })

  test('Scenario: A double-click yields exactly one jump order', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')
    const jumps = recordPosts(page, /\/v1\/fleets\/[^/]+\/jump$/)
    const interiors = captureInteriors(page)
    const fleetId = await signUpAndWake(page, 'jumpguard')

    // Reach a lane gate by the id the interior read SERVED, and let
    // `selectBody` take whichever affordance exists. A rim gate is normally
    // off screen at the default framing, but not always — a seed whose gates
    // all sit inside the first frame renders no off-screen affordance at all,
    // and a suite that waited for one failed there for a reason that has
    // nothing to do with the jump guard under test. (The off-screen
    // affordance is exercised deliberately by `space-journey.spec.ts`, which
    // is where tasks.md 11.2 requires it.)
    const homeId = new URL(page.url()).pathname.split('/').pop()!
    const gate = (interiors.get(homeId)?.laneGates ?? [])[0]
    expect(gate?.id, `the interior read for ${homeId} served no lane-gate body id`).toBeTruthy()
    await selectBody(page, gate.id!)
    await expect(page.getByTestId('gate-facts')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('burn-button').click()
    const row = page.getByTestId(`fleet-row-${fleetId}`)
    await expect(row).toContainText(/under way/i, { timeout: 20_000 })
    await expect(row).toContainText(/docked/i, { timeout: 900_000 })

    await doubleActivateInOneTick(page.getByTestId(`fleet-cmd-jump-${fleetId}`))

    await expect.poll(() => jumps.length, { timeout: 20_000 }).toBeGreaterThan(0)
    expect(
      jumps.length,
      `expected exactly one /jump request, got ${jumps.length}: ${JSON.stringify(jumps.map((j) => j.body))}`,
    ).toBe(1)
    expect(jumps[0].body.laneId, 'the lane id comes from the fleet\'s own read').toBeTruthy()
  })
})
