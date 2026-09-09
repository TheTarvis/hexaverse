import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  burnToSelectionAndDock,
  captureInteriors,
  digits,
  selectBody,
  stationFeatureId,
  wakeNewCorp,
} from '../helpers/space-view'

/**
 * Refuel commit, wire to click, plus the double-submit guard.
 *
 * ORIGINALLY written for `add-fuel-as-cargo` tasks.md 8.4–8.7. REWRITTEN
 * against the continuous-space view for `build-production-space-view`
 * tasks.md 2.1b / 10.8 (`docked-fleet-actions`: *Refuel Offer on the Docked
 * Fleet*, *Refuel Commit*, *Refuel Control Guards Against Double-Submit*;
 * *Credit Balance Readout*).
 *
 * THE ASSERTION THIS FILE EXISTS FOR IS PRESERVED EXACTLY. The double-click
 * reproduction below failed 4/4 against a real production defect: it is
 * asserted on the WIRE (how many POSTs left the browser), not on the
 * resulting UI, because a UI that deduped visually while sending twice looks
 * identical — and because a server that deduped by operation key would hide
 * a client that sent two. Nothing about that changed in the rewrite; only
 * the surfaces it drives did.
 *
 * WHY THIS EXISTS ALONGSIDE THE VITEST SUITES: `FleetActionsPanel.test.tsx`
 * mocks `useRefuel` entirely — it can prove the CLIENT wiring is correct
 * given a station/price/roster it invents, but it cannot prove the server
 * actually SERVES a `roster.fuelPricePerTon` the preview reads, or that a
 * real double-click against a REAL in-flight mutation only ever reaches the
 * server once. `hooks/use-submit-guard.test.tsx` proves the guard MECHANISM
 * against a synchronous fake. Neither can fail if the seam between server and
 * client breaks (a served price field renamed, a real round trip's timing
 * differing from a synchronous mock). This spec closes that seam, on the
 * actual wire, against the actual (test-stack) backend.
 *
 * ONE ASSERTION MOVED, and why it is not a weakening. The board-era file
 * ended on `balance-refuel-cost`, a testid that lived on
 * `components/board/BalanceReadout.tsx` and dies with `components/board/`
 * (tasks.md 10.1). Its substance — "the refuel's cost is visible to the
 * player without navigation" — is asserted here on the two figures the
 * `docked-fleet-actions` scenarios actually name: held fuel RISES and the
 * credit balance FALLS (*The balance visibly updates when a refuel
 * resolves*). Those are strictly harder to fake than a cost label.
 */
const cfg = resolveE2EConfig()

test.use({ storageState: { cookies: [], origins: [] } })

// The test stack runs the world at real-time scale and this journey burns all
// the way to the home station under its own power.
test.setTimeout(900_000)

test.describe('refuel commit — wire to click, double-submit guard', () => {
  test('a docked fleet refuels for the server-served price, and a rapid double-click still settles exactly once', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)

    // 1. Sign up and wake onto the home system — spawn's starting-fuel grant
    //    (corporation-spawn ADDED "Spawn Asset Healing") is what makes the
    //    very next step possible at all.
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E Refueler', 'refuel')

    // The roster shows a held-fuel/range readout from the very first read
    // (fleet-roster ADDED "The Roster Row Shows Held Fuel and an Estimated
    // Range") — a fresh, un-spent starting grant, so both are present before
    // anything is burned.
    await expect(page.getByTestId(`fleet-fuel-${fleetId}`)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId(`fleet-range-${fleetId}`)).toBeVisible()

    // 2. Burn to the home station and dock.
    //
    //    SDET NOTE, carried forward from the board-era file because the
    //    lesson survives the rewrite: this leg once selected the station by
    //    an attribute (`[data-station="true"]`) that the overlay never
    //    emitted, so a fallback branch silently docked at whatever body drew
    //    first — usually a belt — and `refuel-section` correctly never
    //    appeared. A fixture defect that read as a production gap. The
    //    station is therefore identified here from the SERVED interior read's
    //    own `type: "station"`, never from a rendered attribute and never
    //    from a guessed id.
    const home = await interiors.get(homeSystemId)
    expect(home, `no interior read for ${homeSystemId} was captured off the wire`).toBeTruthy()
    const stationId = stationFeatureId(home!)
    expect(
      stationId,
      `the home system's interior read carried no body of type "station" (home ${homeSystemId}): ` +
        `every spawn home is provisioned with exactly one (stations M11), so a miss here is a ` +
        `regression, not a seed`,
    ).toBeTruthy()

    await selectBody(page, stationId!)
    await burnToSelectionAndDock(page, fleetId, 600_000)

    // 3. Scenario: Refuel is offered while docked at a station.
    await expect(page.getByTestId('refuel-section')).toBeVisible({ timeout: 20_000 })

    // Scenario: Fleet Read Serves the Configured Fuel Price, Never Duplicated
    // Client-Side — the preview must move when the tonnage does, by whatever
    // price the server actually served. No fixed expectation on the number
    // itself (this SDET does not know the tuned `FuelParams.PricePerTon`);
    // the assertion is that it REACTS, proving a real served value drives it
    // rather than a frozen placeholder.
    await page.getByTestId('refuel-tons-input').fill('1')
    const oneTon = await page.getByTestId('refuel-cost-preview').textContent()
    await page.getByTestId('refuel-tons-input').fill('2')
    const twoTons = await page.getByTestId('refuel-cost-preview').textContent()
    expect(oneTon, 'the cost preview rendered nothing at all').toBeTruthy()
    expect(twoTons, 'doubling the tonnage must change the previewed cost').not.toBe(oneTon)

    // 4. Scenario: A double-click yields exactly one refuel — asserted on the
    //    WIRE, the only place this guarantee actually matters. THE
    //    REPRODUCTION: this failed 4/4 against a real defect.
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

    const fuelBefore = await digits(page, 'hold-fuel')
    const balanceBefore = await digits(page, 'balance-value')
    expect(
      Number.isFinite(balanceBefore),
      'the credit balance readout shows no number — `docked-fleet-actions` *Credit Balance ' +
        'Readout*: "the requester\'s current credit balance is shown"',
    ).toBe(true)

    await page.getByTestId('refuel-tons-input').fill('1')
    const refuelButton = page.getByTestId('refuel-button')
    // Two rapid clicks, deliberately NOT awaited independently — the guard
    // under test is exactly "can a fast double-click reach the network
    // twice", so serializing them with an `await` between would defeat the
    // point.
    await Promise.all([refuelButton.click(), refuelButton.click()])

    // Scenario: The balance visibly updates when a refuel resolves; and
    // Scenario: A refuel updates held fuel, estimated range, and the balance
    // without navigation.
    await expect.poll(() => digits(page, 'hold-fuel'), { timeout: 30_000 }).toBeGreaterThan(fuelBefore)
    await expect
      .poll(() => digits(page, 'balance-value'), { timeout: 30_000 })
      .toBeLessThan(balanceBefore)

    expect(
      refuelRequests.length,
      `expected exactly one /refuel request from a rapid double-click, got ` +
        `${refuelRequests.length}: ${JSON.stringify(refuelRequests)}`,
    ).toBe(1)

    // 5. Scenario: A fresh attempt after a completed refuel is a second,
    //    independent refuel, minting a NEW operation key.
    const firstKey = refuelRequests[0]?.operationKey
    await page.getByTestId('refuel-tons-input').fill('1')
    await refuelButton.click()
    await expect.poll(() => refuelRequests.length, { timeout: 20_000 }).toBe(2)
    const secondKey = refuelRequests[1]?.operationKey
    expect(firstKey, 'a refuel must carry a client-minted operation key').toBeTruthy()
    expect(secondKey).toBeTruthy()
    expect(secondKey, 'a second attempt must not reuse the first attempt\'s key').not.toBe(firstKey)
  })
})
