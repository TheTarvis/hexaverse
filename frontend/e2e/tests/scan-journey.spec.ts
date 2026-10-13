import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  captureInteriors,
  capturePosts,
  prepareCommandHud,
  openObjectDetails,
  wakeNewCorp,
} from '../helpers/space-view'
import { emulatorSignIn } from '../helpers/firebase-emulator'
import { arrangePointPark, commitServedBurn } from '../helpers/served-movement'
import type { Fleet } from '../../lib/types/fleet'
import {
  captureCorporationId,
  captureScanTargets,
  commitScan,
  openScanControlAndPickNearestTarget,
  seedSightingFixture,
} from '../helpers/scan-fixtures'

/**
 * The focused-scan journey — openspec change `add-scan-and-sightings-
 * surface`, tasks.md 10.2a, 10.2b, 10.2c, 10.3, 10.4, 10.6, 10.7.
 *
 * ONE long journey, per this repo's own established convention
 * (`space-journey.spec.ts`), because every leg after 10.2a shares its
 * spawn and its committed sweep's ETA window — repeating the spawn per leg
 * would multiply this suite's wall-clock cost for no additional coverage.
 *
 * WHAT THIS JOURNEY CANNOT PROVE ON ITS OWN, and why 10.2b/10.2c exist:
 * 3.12 excludes the scanning fleet from its own sweep's minted set, so a
 * FRESH corporation's own journey — the only kind this suite can arrange —
 * mints a CLEAN-SWEEP record, never a target-naming one. There is
 * therefore no live path to a ghost mark here; 10.2b seeds one directly
 * into the emulator at the exact digest-derived path 2.1 produces, and
 * 10.7 reuses that same seeded fixture to prove the mount-path ordering
 * without inventing a second one.
 */
const cfg = resolveE2EConfig()

async function openScanTab(page: Page): Promise<void> {
  if (await page.getByTestId('console-dock-open').isVisible()) {
    await page.getByTestId('console-dock-open').click()
  }
  await page.getByTestId('console-tab-scan').click()
  await expect(page.getByTestId('scan-control')).toBeVisible()
}

// Spawn is now station-docked. Arrange an actual free-space park through
// production orders, then require the server's real target list to be empty.
// No mock scan response, Firestore mutation, or client kinematics is involved.
async function parkOutsideScanRange(
  page: Page,
  fleetId: string,
  email: string,
  password: string,
): Promise<void> {
  const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
  const headers = { Authorization: `Bearer ${idToken}` }
  const fleetURL = `${cfg.apiURL}/v1/fleets/${fleetId}`
  const initialRead = await page.request.get(fleetURL, { headers })
  expect(initialRead.ok()).toBe(true)
  const initial = (await initialRead.json()) as Fleet
  await arrangePointPark(page, fleetId, { ...initial.position, Y: initial.position.Y + 2_000 }, idToken)
  const targets = await page.request.get(`${fleetURL}/scan-targets`, { headers })
  expect(targets.ok()).toBe(true)
  expect((await targets.json()).targets, 'the off-plane point must have no eligible scan hosts').toHaveLength(0)
  await page.reload()
  await prepareCommandHud(page)
}

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(1_800_000)

test.describe('the focused-scan journey, end to end through the space view', () => {
  test('commit a sweep against the served target, watch it settle, see the log row — a clean sweep', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)
    const scanTargetsByFleet = captureScanTargets(page)
    const scanPosts = capturePosts<{ hostId: string }>(page, /\/scan$/)
    const corpBox = captureCorporationId(page)

    // ------------------------------------------------------------ 1. spawn
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E Scanner', 'scan-journey')
    await expect
      .poll(() => corpBox.id, { timeout: 30_000, message: 'no corporation id was captured off POST /v1/corporations' })
      .not.toBeNull()
    const corpId = corpBox.id!

    // Current spawn already attaches the fleet to the home station.
    const home = await interiors.get(homeSystemId)
    const stationId = home.features.find((f) => f.type === 'station')?.id
    expect(stationId, 'the home system must serve its station').toBeTruthy()
    await expect(page.getByTestId('vitals-fleet-cell')).toContainText(/docked/i)
    await openScanTab(page)

    // ------------------------------------------------- 2. read the served
    //    target list — the served list IS the fixture (link8b-impl-
    //    contract.md §4.1). Opening the scan control triggers the read.
    //
    //    REVISED 2026-09-03 (test-dispute adjudicated: a genuine arrangement
    //    defect, not a spec misread). This fleet is DOCKED for the entire
    //    leg below (all three picks: this one, the double-submit leg, and
    //    the cancel leg) — "farthest" hands back a range-boundary host that
    //    can (and, in a live run, did) drift out of focused-scan range
    //    between the served-list read and the commit, which the control
    //    correctly rejects ("That host is out of sensor range."), hanging
    //    every retry to this suite's own 30-minute timeout. The attached
    //    host — the NEAREST served target, by construction the smallest
    //    `durationMs` — sits at distance zero and never drifts.
    await expect(page.getByTestId('scan-control')).toBeVisible({ timeout: 20_000 })
    const chosen = await openScanControlAndPickNearestTarget(page, fleetId, scanTargetsByFleet)

    // ---------------------------------------------------- 3. commit + watch
    await commitScan(page, chosen.hostId)
    expect(scanPosts.some((b) => b.hostId === chosen.hostId), 'the commit named the served host id').toBe(true)
    await expect(page.getByTestId('scan-countdown')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scan-commit-button')).toHaveCount(0)

    // ---------------------------------------------------- 4. let it settle
    // The countdown clears and a report lands with NO navigation and NO
    // reload — the self-scheduled settle refetch, then inbox+pile in order.
    await expect(page.getByTestId('scan-report')).toBeVisible({
      timeout: Math.ceil(chosen.durationMs / 1) + 60_000,
    })
    const reportText = (await page.getByTestId('scan-report').textContent()) ?? ''
    // REVISED 2026-09-03 (test-dispute adjudicated: a spec misreading, not a
    // production defect). system-space-view "A Settled Sweep Reports Its
    // Outcome...": "A sweep that minted records SHALL be reported as having
    // filed them" — a clean-sweep record IS a minted record (no served
    // reasonCode), so the correct report copy is the FILED-records
    // statement, not a "clean/nothing" one. 3.12 excludes the scanner from
    // its own minted set, so this ordinary journey mints a CLEAN-SWEEP
    // record rather than a target-naming one — that distinction belongs to
    // the LOG ROW below, never to the report's own filed-vs-fizzled text.
    expect(reportText.toLowerCase()).toMatch(/filed/)

    // The report lives in the Scan tab. Its link switches to Log and
    // transfers focus while the mounted log contains the settled record.
    await expect(page.getByTestId('console-tab-scan')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('sighting-log')).toBeHidden()
    await page.getByTestId('scan-report').getByRole('button', { name: /open the sighting log/i }).click()
    // The report link activates Log and transfers focus to its tab.
    await expect(page.getByTestId('console-dock-collapse'), 'the report link expanded the dock').toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByTestId('console-tab-log')).toHaveAttribute('aria-selected', 'true')
    // "The report's link to the log moves focus to the Log tab"
    await expect(page.getByTestId('console-tab-log'), 'the report link moved focus to the Log tab').toBeFocused()
    await expect(page.getByTestId('console-panel-log').getByTestId('sighting-log')).toBeVisible({ timeout: 10_000 })
    const rows = page.locator('[data-testid^="sighting-row-"]')
    await expect(rows.first(), 'the settled sweep\'s record is in the log').toHaveCount(1, { timeout: 10_000 })
    await expect(rows.first()).toContainText(chosen.hostId)
    await expect(
      rows.first(),
      'the settled sweep minted a CLEAN-SWEEP record (3.12 excludes the scanner from its own minted set) — ' +
        'the log row must carry the clean-sweep marker',
    ).toContainText(/clean/i)

    // REVISED 2026-09-03 (orchestrator-stopped run: the SDET's own bug, not
    // a production defect or a spec misread). The old
    // `.getByRole('button', { name: /close|dismiss/i }).click().catch(() =>
    // {})` matched nothing and silently swallowed the failure, leaving the
    // log OPEN over `scan-control` and hanging the next pick's
    // `scrollIntoViewIfNeeded()`. REVISED add-console-dock (3.2): the floating
    // log and its `sighting-log-open` toggle are gone; the close affordance is
    // the dock's collapse control. Assert the collapse actually happened
    // (log hidden, "Console" control back) rather than assuming the click
    // did anything, and sighting-log's "Closing the log returns to the view
    // intact" (the space view stays mounted, the same acting fleet stays
    // selected).
    await page.getByTestId('console-dock-collapse').click()
    await expect(page.getByTestId('sighting-log')).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId('console-dock-open'), 'collapsing returns the dock to the strip alone').toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByTestId('vitals-fleet-id'),
      'sighting-log "Closing the log returns to the view intact": the same acting fleet must still be selected',
    ).toHaveText(fleetId)

    // ------------------------------------------- 6. double-submit (10.3)
    // A REAL double-click, counting POSTs to /scan on the wire — the leg
    // `use-refuel.test.tsx`'s hand-held harness could not have caught.
    await openScanTab(page)
    scanPosts.length = 0
    // Still docked (see the comment on `chosen` above) — nearest, not farthest.
    const secondTarget = await openScanControlAndPickNearestTarget(page, fleetId, scanTargetsByFleet)
    await page.getByTestId('scan-target-select').selectOption(secondTarget.hostId)
    await page.getByTestId('scan-commit-button').dblclick()
    await expect
      .poll(() => scanPosts.length, { timeout: 10_000, message: 'no /scan POST observed after the double-click' })
      .toBeGreaterThan(0)
    expect(scanPosts.length, 'a double-click must submit exactly one sweep').toBe(1)

    // Let the second sweep settle and clear before the cancel leg.
    await expect(page.getByTestId('scan-report')).toBeVisible({
      timeout: Math.ceil(secondTarget.durationMs) + 60_000,
    })

    // ---------------------------------------------------- 7. cancel (10.4)
    await page.getByTestId('scan-report-dismiss').click()
    // Still docked — nearest, not farthest.
    const thirdTarget = await openScanControlAndPickNearestTarget(page, fleetId, scanTargetsByFleet)
    await page.getByTestId('scan-target-select').selectOption(thirdTarget.hostId)
    await page.getByTestId('scan-commit-button').click()
    await expect(page.getByTestId('scan-cancel')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('scan-cancel').click()
    await expect(page.getByTestId('scan-target-select'), 'cancel returns the target list').toBeVisible({
      timeout: 10_000,
    })
    // A new sweep can be committed immediately.
    await page.getByTestId('scan-target-select').selectOption(thirdTarget.hostId)
    scanPosts.length = 0
    await page.getByTestId('scan-commit-button').click()
    await expect
      .poll(() => scanPosts.length, { timeout: 10_000 })
      .toBeGreaterThan(0)
    await expect(page.getByTestId('scan-countdown')).toBeVisible({ timeout: 10_000 })
    // Let this last sweep settle so it does not race the canvas-unavailable
    // leg below.
    await expect(page.getByTestId('scan-report')).toBeVisible({
      timeout: Math.ceil(thirdTarget.durationMs) + 60_000,
    })
    await page.getByTestId('scan-report-dismiss').click()

    // Block both renderer candidates in the next document. An evaluate
    // patch before reload alone would be lost with the old document.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('scan-block-renderer') !== 'true') return
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined })
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
        return Reflect.apply(original, this, [type, ...args])
      } as typeof original
    })
    await page.evaluate(() => sessionStorage.setItem('scan-block-renderer', 'true'))
    await page.reload()
    await prepareCommandHud(page)
    await expect(page.getByTestId('renderer-unsupported').filter({ hasText: 'system' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('console-dock-open')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('console-dock-region')).toBeHidden()
    await openScanTab(page)
    await expect(page.getByTestId('scan-target-select')).toContainText(stationId!)
    await page.evaluate(() => sessionStorage.removeItem('scan-block-renderer'))

    // ------------------------------------------------- 9. mount-path (10.7)
    // Seed a target-naming fixture (10.2b/10.2c) — the ordinary journey
    // above mints only clean sweeps — then navigate away and back, asserting
    // BOTH the seeded ghost and the settled report land on FIRST RENDER,
    // with no second read.
    //
    // Reuses `home` captured in step 1b (the same interior read, off the
    // same map) rather than re-declaring it — both sites name the identical
    // `interiors.get(homeSystemId)` value.
    const seededHostId = home!.features.find((f) => f.type !== 'star')?.id ?? home!.features[0]!.id
    const seededActionId = 'e2e-fixture-action-' + Date.now()
    const seededTargetId = 'e2e-fixture-target-' + Date.now()
    const seededRecordId = await seedSightingFixture({
      corporationId: corpId,
      actionId: seededActionId,
      targetId: seededTargetId,
      systemId: homeSystemId,
      hostId: seededHostId,
      asOf: 1,
      position: { X: 12.5, Y: 0, Z: -3.25 },
      velocity: { X: 0.1, Y: 0, Z: 0 },
      hullCount: 2,
      hullTypes: ['frigate', 'frigate'],
    })

    await page.goto('/')
    await page.goto(`/systems/${homeSystemId}`)
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
    await prepareCommandHud(page)
    await expect(page.getByTestId(`sighting-mark-${seededRecordId}`), 'the seeded ghost is drawn on first render').toBeVisible({
      timeout: 20_000,
    })
    // The log is behind the dock (collapsed on this fresh mount): open it
    // through the "Console" control, written here, not in a helper.
    await expect(page.getByTestId('console-dock-open'), 'a fresh mount shows the dock collapsed').toBeVisible({
      timeout: 10_000,
    })
    await page.getByTestId('console-dock-open').click()
    await page.getByTestId('console-tab-log').click()
    await expect(page.getByTestId('console-tab-log')).toBeFocused({ timeout: 10_000 })
    await expect(page.getByTestId(`sighting-row-${seededRecordId}`), 'the seeded record is in the log on mount').toBeVisible(
      { timeout: 20_000 },
    )

    // "A reload shows the dock collapsed" (add-console-dock 3.2): expanded
    // here, a reload comes back collapsed — the toggle-reload leg of old.
    await page.reload()
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
    await prepareCommandHud(page)
    await expect(page.getByTestId('console-dock-open'), 'a reload shows the dock collapsed').toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByTestId('console-dock-region')).toBeHidden()
    await expect(page.getByTestId('sighting-log')).toBeHidden()
  })

  // 10.2b — the ghost leg, isolated: a seeded target-naming fixture renders
  // as a ghost and cross-highlights with its log row, in both directions.
  test('a seeded target-naming sighting renders as a ghost and cross-highlights with its log row', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)
    const corpBox = captureCorporationId(page)
    const { homeSystemId } = await wakeNewCorp(page, 'E2E Ghost Reader', 'scan-ghost')
    await expect.poll(() => corpBox.id, { timeout: 30_000 }).not.toBeNull()
    const corpId = corpBox.id!

    const home = await interiors.get(homeSystemId)
    expect(home).toBeTruthy()
    const hostId = home.features.find((feature) => feature.type !== 'star')!.id

    const actionId = 'e2e-ghost-action-' + Date.now()
    const targetId = 'e2e-ghost-target-' + Date.now()
    const recordId = await seedSightingFixture({
      corporationId: corpId,
      actionId,
      targetId,
      systemId: homeSystemId,
      hostId,
      asOf: 1,
      position: { X: 8, Y: 0, Z: 4 },
      velocity: { X: 0, Y: 0, Z: 0.2 },
      hullCount: 1,
      hullTypes: ['scout'],
    })

    await page.reload()
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
    await prepareCommandHud(page)
    const ghost = page.getByTestId(`sighting-mark-${recordId}`)
    await expect(ghost).toBeVisible({ timeout: 20_000 })

    // add-console-dock (3.2). The dock is collapsed (every mount), and the
    // ghost is activated FIRST, before any click on a log row: a row click
    // sets the same highlighted id as the ghost does, so the other order would
    // make ghost activation vacuous.
    // "Activating a ghost while the dock is collapsed highlights the ghost and
    // leaves the dock collapsed".
    await expect(page.getByTestId('console-dock-open'), 'precondition: the dock is collapsed').toBeVisible({
      timeout: 10_000,
    })
    await ghost.click()
    await expect(ghost).toHaveAttribute('data-highlighted', 'true')
    await expect(page.getByTestId('console-dock-open'), 'a ghost activation leaves the dock collapsed').toBeVisible()
    await expect(page.getByTestId('console-dock-region')).toBeHidden()

    // "The row for an activated ghost is highlighted when the tab is next
    // shown": expand through the "Console" control, then read the row.
    await page.getByTestId('console-dock-open').click()
    await page.getByTestId('console-tab-log').click()
    const row = page.getByTestId(`sighting-row-${recordId}`)
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row, 'the activated ghost\'s row is highlighted when the tab is shown').toHaveAttribute(
      'data-highlighted',
      'true',
    )

    // The row -> ghost direction ("Selecting a row highlights its ghost",
    // re-homed by this change), made non-vacuous: a RELOAD clears the highlight
    // (and collapses the dock), so the ghost starts unhighlighted; then a row
    // click must be what highlights it.
    await page.reload()
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
    await prepareCommandHud(page)
    await expect(ghost).toBeVisible({ timeout: 20_000 })
    await expect(
      ghost,
      'precondition: after the reload no ghost is highlighted, so the row click below is what does it',
    ).not.toHaveAttribute('data-highlighted', 'true')
    await expect(page.getByTestId('console-dock-open'), 'precondition: the reload collapsed the dock').toBeVisible({
      timeout: 10_000,
    })
    await page.getByTestId('console-dock-open').click()
    await page.getByTestId('console-tab-log').click()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row, 'precondition: the row is not highlighted before it is clicked').not.toHaveAttribute(
      'data-highlighted',
      'true',
    )
    await row.click()
    await expect(ghost, 'a row click highlights the stage ghost for that record').toHaveAttribute(
      'data-highlighted',
      'true',
      { timeout: 10_000 },
    )
  })

  // The current HUD intentionally retires the visible Burn/fleet command
  // panel. This checks its replacement inspection surface and the independent
  // Scan tab; movement execution remains covered at unit/backend level.
  test('station inspection and Plot course preserve the independent Scan tab while legacy commands stay hidden', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')
    const interiors = captureInteriors(page)
    const { homeSystemId } = await wakeNewCorp(page, 'E2E Scan-Beside-Panel', 'scan-beside-panel')
    const home = await interiors.get(homeSystemId)
    const stationId = home.features.find((f) => f.type === 'station')?.id
    expect(stationId, 'the home system must serve a station').toBeTruthy()
    const details = await openObjectDetails(page, stationId!)
    await expect(details).toContainText(stationId!)
    await page.getByTestId('details-plot').click()
    await expect(page.getByTestId('system-index-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('preview-panel')).toBeHidden()
    await expect(page.getByTestId('burn-button')).toBeHidden()
    await expect(page.getByTestId('space-fleet-panel')).toBeHidden()
    await openScanTab(page)
    await expect(page.getByTestId('scan-target-select')).toContainText(stationId!)
  })

  // Task 10.2d (link8b-adversary-r8, ruling F5) — the mid-burn leg the
  // original journey could not pin: 10.2a docks the fleet BEFORE opening the
  // scan control, which arranges around the reported defect rather than
  // reproducing it. This leg opens the control WHILE the fleet is still
  // under way, observes the legitimate empty state, and then asserts —
  // with NO user action of any kind — that the served list picks up the
  // docked host once the burn lands.
  test('opening the scan control mid-burn shows "no host in range"; the docked host appears with no user action once the burn lands', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)
    const scanTargetsByFleet = captureScanTargets(page)
    const { homeSystemId, fleetId, email, password } = await wakeNewCorp(page, 'E2E Scan-Mid-Burn', 'scan-mid-burn')

    const home = await interiors.get(homeSystemId)
    expect(home, `no interior read for ${homeSystemId} was captured`).toBeTruthy()
    const stationId = home!.features.find((f) => f.type === 'station')?.id
    expect(stationId, 'this freshly generated home system served no station feature').toBeTruthy()

    await parkOutsideScanRange(page, fleetId, email, password)
    scanTargetsByFleet.delete(fleetId)
    // A fresh document mounts ScanControl and reads the actual free-space
    // targets. This establishes the empty precondition before a return burn.
    await page.reload()
    await prepareCommandHud(page)
    await openScanTab(page)
    await expect.poll(() => scanTargetsByFleet.has(fleetId), { timeout: 30_000 }).toBe(true)
    expect(scanTargetsByFleet.get(fleetId)).toHaveLength(0)
    await expect(page.getByText('No host is in range to sweep.')).toBeVisible()
    await page.getByTestId('console-dock-collapse').click()

    // API movement is fixture setup only: this leg proves Scan refresh,
    // not the retired Burn control. The low commanded acceleration leaves
    // time to mount the real mid-burn empty state before approaching the host.
    const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
    await commitServedBurn(page, fleetId, { bodyId: stationId, accel: 1 }, idToken)
    scanTargetsByFleet.delete(fleetId)
    await page.reload()
    await prepareCommandHud(page)
    const row = page.getByTestId('vitals-fleet-cell')
    await expect(row).toContainText(/under way/i, { timeout: 30_000 })
    await openScanTab(page)
    await expect.poll(() => scanTargetsByFleet.has(fleetId), { timeout: 30_000 }).toBe(true)
    expect(scanTargetsByFleet.get(fleetId), 'the real mid-burn target set must be empty').toHaveLength(0)
    // The mounted control has an actual empty response while movement is
    // active. From this assertion onward, no navigation or user action.
    await expect(page.getByTestId('scan-control')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('No host is in range to sweep.')).toBeVisible({ timeout: 5_000 })

    // Let the burn land — no further page interaction of any kind.
    await expect(row).toContainText(/docked/i, { timeout: 600_000 })

    // THEN, with no user action: the served list picks up the docked host.
    await expect
      .poll(
        () => (scanTargetsByFleet.get(fleetId) ?? []).some((t) => t.hostId === stationId),
        {
          timeout: 30_000,
          message: `the docked station ${stationId} never appeared in the served scan-target set after the burn landed`,
        },
      )
      .toBe(true)
    await expect(page.getByTestId('scan-target-select')).toContainText(stationId!, { timeout: 10_000 })
  })
})
