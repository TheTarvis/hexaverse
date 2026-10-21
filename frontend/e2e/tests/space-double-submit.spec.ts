import { arrangeBodyDock } from '../helpers/served-movement'
import { emulatorSignIn } from '../helpers/firebase-emulator'
import { test, expect, type Locator, type Page, type Request } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import type { InteriorCapture } from '../helpers/space-view'
import {
  bodyIdsMatching,
  captureInteriors,
  digits,
  holdKindTons,
  mineableBodyId,
  openObjectDetails,
  prepareCommandHud,
  wakeNewCorp,
  selectFirstBodyMatching,
  stationFeatureId,
} from '../helpers/space-view'

// Current HUD: Burn is intentionally hidden; its guard remains unit/backend
// coverage. This browser file asserts that absence and retains real visible
// mine/sale/refuel/jump guards. API docking is setup only, never UI Burn proof.
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
// This journey burns under its own power; mirrors jump-commit.spec.ts's own
// note. The stack runs the world warped (`backend-stack.ts`), so this is a hang
// budget, not the expected wait — it still holds unwarped.
test.setTimeout(900_000)

interface Recorded {
  url: string
  body: Record<string, unknown>
  /**
   * How the request settled: an HTTP status, `null` for a request that never
   * produced a readable response (transport failure, or a page closed
   * mid-flight), or `undefined` while it is still in flight. `undefined` is
   * the "not landed yet" sentinel every status assertion polls through — it
   * is never read as a failure.
   */
  status: number | null | undefined
}

/**
 * Record every matching POST **at send time**, and fill in how it settled.
 *
 * openspec change `fix-mutation-retry-on-4xx`, tasks.md 1.3. Read the whole
 * comment before touching this function; three of its properties are
 * load-bearing and each has already been got wrong once.
 *
 * 1. ENTRIES ARE PUSHED ON `request`, NOT `requestfinished`. This file's count
 *    assertions exist to catch a second request THE INSTANT IT LEAVES THE
 *    BROWSER. `requestfinished` fires only after the response body downloads,
 *    which turns the poll-then-read `toBe(1)` checks into a race — and it never
 *    fires at all for a transport-layer failure, which is exactly the class
 *    this change preserves as the one surviving automatic resend.
 * 2. `requestfailed` MUTATES the already-recorded entry; it never pushes.
 *    Playwright fires `request` and THEN one of `requestfinished` /
 *    `requestfailed`, so a second push would count one lost POST twice — a
 *    phantom doubling, in the file whose entire purpose is telling a real
 *    doubling from a phantom one.
 * 3. `req.response()` is `.catch`ed. It rejects when the page or context
 *    closes while a matched POST is still outstanding, and an unhandled
 *    rejection is reported by the runner as an unexplained test-level error.
 */
function recordPosts(page: Page, pattern: RegExp): Recorded[] {
  const seen: Recorded[] = []
  const entryOf = new Map<Request, Recorded>()

  page.on('request', (req) => {
    if (req.method() !== 'POST' || !pattern.test(req.url())) return
    let body: Record<string, unknown> = {}
    try {
      body = (req.postDataJSON() ?? {}) as Record<string, unknown>
    } catch {
      body = {}
    }
    const entry: Recorded = { url: req.url(), body, status: undefined }
    entryOf.set(req, entry)
    seen.push(entry)
    void req
      .response()
      .then((res) => {
        // `res` is null when no response was ever received; that is the same
        // "not 2xx" outcome as a transport failure, so it records `null`
        // rather than leaving the entry pending forever.
        entry.status = res ? res.status() : null
      })
      .catch(() => {
        entry.status = null
      })
  })

  page.on('requestfailed', (req) => {
    const entry = entryOf.get(req)
    // Mutate, never push — see property 2 above.
    if (entry) entry.status = null
  })

  return seen
}

/**
 * Every request recorded so far settled with a `2xx`.
 *
 * openspec change `fix-mutation-retry-on-4xx`, tasks.md 1.3b. A bare count
 * assertion cannot tell a REFUSED command from a successful one, so a `409`
 * answered to an automatic client retry reads as a phantom extra user request
 * instead of the doubling it actually is. `null` (no response read) is not
 * `2xx`; `undefined` (still in flight) is polled through, not failed.
 *
 * This is ADDITIVE to the count expectations, which stay exactly as they are —
 * including the two deliberate `toBe(2)` guard-release checks. Never relax or
 * scope down this assertion to get a green gate: if it goes red, the command
 * genuinely failed, and RULING 51 says record it and report it.
 */
async function expectAllSettled2xx(seen: Recorded[], what: string): Promise<void> {
  await expect
    .poll(
      () =>
        seen
          .filter((e) => !(typeof e.status === 'number' && e.status >= 200 && e.status < 300))
          .map((e) => `${e.status === undefined ? 'in-flight' : e.status} ${new URL(e.url).pathname}`),
      {
        timeout: 20_000,
        message: `every ${what} request recorded so far must settle 2xx (null = no response read, in-flight = never settled)`,
      },
    )
    .toEqual([])
}

/**
 * TWO ACTIVATIONS, ONE TICK. The whole point of this file.
 */
async function doubleActivateInOneTick(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible({ timeout: 10_000 })
  await expect(locator).toBeEnabled()
  await locator.evaluate((el: HTMLElement) => {
    el.click()
    el.click()
  })
}

const fixtureTokens = new WeakMap<Page, string>()
async function signUpAndWake(page: Page, tag: string): Promise<string> {
  const corp = await wakeNewCorp(page, `E2E ${tag}`, tag)
  const { idToken } = await emulatorSignIn(cfg.emulator!, corp.email, corp.password)
  fixtureTokens.set(page, idToken)
  return corp.fleetId
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
  const bodyId = await selectFirstBodyMatching(page, prefix)
  const token = fixtureTokens.get(page)!
  const read = await page.request.get(`${cfg.apiURL}/v1/fleets/${fleetId}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(read.ok()).toBe(true)
  const current = await read.json() as { attachedTo?: string }
  if (current.attachedTo !== bodyId) await arrangeBodyDock(page, fleetId, bodyId, token)
  await page.reload(); await prepareCommandHud(page)
  if (prefix === 'feat-station') await openObjectDetails(page, bodyId)
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
  interiors: InteriorCapture,
): Promise<void> {
  const homeId = new URL(page.url()).pathname.split('/').pop()!
  const home = await interiors.get(homeId)
  expect(home, `no interior read for ${homeId} was captured off the wire`).toBeTruthy()
  const lodeId = mineableBodyId(home!, stationFeatureId(home!) ?? undefined)
  expect(lodeId, `the home system's interior read carried no mineable body (home ${homeId})`).toBeTruthy()
  await arrangeBodyDock(page, fleetId, lodeId!, fixtureTokens.get(page)!)
  await page.reload(); await prepareCommandHud(page)
}

test.describe('space view — synchronous double-submit guards', () => {
  test('Current HUD does not offer the retired burn submit control', async ({ page }) => {
    const orders = recordPosts(page, /\/v1\/fleets\/[^/]+\/orders$/)
    await signUpAndWake(page, 'retired-burn')
    const bodies = await bodyIdsMatching(page, 'feat-body-')
    expect(bodies.length).toBeGreaterThan(0)
    const details = await openObjectDetails(page, bodies[0])
    await details.getByTestId('details-plot').click({ timeout: 10_000 })
    await expect(page.getByTestId('burn-button')).toBeHidden()
    expect(orders).toEqual([])
    // Same-tick travel guards remain in SystemSpaceView.burn-preview.test.tsx and
    // use-submit-guard.test.tsx; no claim of a current UI Burn path.
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
    await expectAllSettled2xx(mines, '/mine')
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
    await expectAllSettled2xx(sales, '/sell')

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
    // Two sales, both of which the server actually accepted. `toBe(2)` is
    // deliberate here — a second, genuinely new user command — and stays.
    await expectAllSettled2xx(sales, '/sell')
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
    await expectAllSettled2xx(refuels, '/refuel')
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
    const gate = ((await interiors.get(homeId)).laneGates ?? [])[0]
    expect(gate?.id, `the interior read for ${homeId} served no lane-gate body id`).toBeTruthy()
    await arrangeBodyDock(page, fleetId, gate.id!, fixtureTokens.get(page)!, 900_000)
    await page.reload(); await prepareCommandHud(page)

    // The current system HUD hides Jump; the galaxy roster exposes the live command.
    await page.getByTestId('nav-home').click()
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 })
    await expect(page.getByTestId(`fleet-row-${fleetId}`)).toBeVisible({ timeout: 20_000 })
    await doubleActivateInOneTick(page.getByTestId(`fleet-cmd-jump-${fleetId}`))

    await expect.poll(() => jumps.length, { timeout: 20_000 }).toBeGreaterThan(0)
    expect(
      jumps.length,
      `expected exactly one /jump request, got ${jumps.length}: ${JSON.stringify(jumps.map((j) => j.body))}`,
    ).toBe(1)
    await expectAllSettled2xx(jumps, '/jump')
    expect(jumps[0].body.laneId, 'the lane id comes from the fleet\'s own read').toBeTruthy()
  })
})
