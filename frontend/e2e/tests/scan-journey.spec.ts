import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  burnToSelectionAndDock,
  captureInteriors,
  capturePosts,
  selectFirstBodyMatching,
  wakeNewCorp,
} from '../helpers/space-view'
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

    // -------------------------------------------- 1b. dock at the station
    // REVISED 2026-09-03 (test-dispute adjudicated: a genuine arrangement
    // defect, not a spec misread). A freshly spawned fleet sits at an
    // unattached point park with nothing inside focused-scan range — its
    // served target set is legitimately empty there, which is why the
    // clean-sweep leg below needs a docked host to sweep at all. Burning to
    // the home station and docking (reusing `burnToSelectionAndDock`,
    // exactly as this file's own third test already does) BEFORE opening
    // the scan control gives the fleet a host at distance zero — always an
    // eligible target (`focused-scan`'s own self-sweep/belt-member
    // exclusions exploit the identical zero-distance guarantee) — and is
    // what actually produces the M3 clean-sweep record this leg asserts.
    const home = interiors.get(homeSystemId)
    expect(home, `no interior read for ${homeSystemId} was captured off the wire`).toBeTruthy()
    const stationId = home!.features.find((f) => f.type === 'station')?.id
    expect(stationId, 'this freshly generated home system served no station feature').toBeTruthy()
    await selectFirstBodyMatching(page, stationId!)
    await burnToSelectionAndDock(page, fleetId)

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

    // -------------------------------------------------------- 5. the log,
    //    opened via the REPORT's own affordance (system-space-view "A sweep
    //    that minted records reports and links to the log") — not the
    //    standalone `sighting-log-open` control this leg also exercises
    //    later.
    await page.getByTestId('scan-report').getByRole('button', { name: /open the sighting log/i }).click()
    await expect(page.getByTestId('sighting-log')).toBeVisible({ timeout: 10_000 })
    const rows = page.locator('[data-testid^="sighting-row-"]')
    await expect(rows.first(), 'the settled sweep\'s record is in the log').toHaveCount(1, { timeout: 10_000 })
    await expect(rows.first()).toContainText(chosen.hostId)
    await expect(
      rows.first(),
      'the settled sweep minted a CLEAN-SWEEP record (3.12 excludes the scanner from its own minted set) — ' +
        'the log row must carry the clean-sweep marker',
    ).toContainText(/clean/i)

    // REVISED 2026-09-03 (orchestrator-stopped run: the SDET's own bug, not
    // a production defect or a spec misread). `sighting-log` renders no
    // internal close/dismiss button at all (checked against
    // `SightingLog.tsx` / `SystemSpaceView.tsx`) — the ONLY close affordance
    // is the same toggle button as `sighting-log-open`, whose accessible
    // name flips to "Close sighting log" while open. The old
    // `.getByRole('button', { name: /close|dismiss/i }).click().catch(() =>
    // {})` matched nothing inside the drawer, silently swallowed the
    // failure, and left the drawer OPEN — which then sat over
    // `scan-control` and hung the next pick's
    // `scrollIntoViewIfNeeded()` (no explicit timeout) for the rest of this
    // suite's 30-minute budget. Close it via the real toggle instead, and
    // assert sighting-log's own "Closing the log returns to the view
    // intact" (the space view stays mounted, the same acting fleet stays
    // selected) rather than assuming the click did anything.
    await page.getByTestId('sighting-log-open').click()
    await expect(page.getByTestId('sighting-log')).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByTestId(`fleet-row-${fleetId}`),
      'sighting-log "Closing the log returns to the view intact": the same acting fleet must still be selected',
    ).toHaveAttribute('data-active', 'true')

    // ------------------------------------------- 6. double-submit (10.3)
    // A REAL double-click, counting POSTs to /scan on the wire — the leg
    // `use-refuel.test.tsx`'s hand-held harness could not have caught.
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

    // -------------------------------------- 8. canvas-unavailable (10.6)
    // Forcing the renderer's unsupported state is the same technique this
    // repo's own `SpaceStage.renderer.test.tsx` covers at the unit level;
    // here it is enough to confirm the SCAN SURFACE stays usable while the
    // canvas region reports itself unavailable — WebGL context loss is
    // simulated by stripping getContext.
    await page.evaluate(() => {
      const proto = HTMLCanvasElement.prototype as unknown as { getContext: (type: string) => unknown }
      const original = proto.getContext
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(proto as any).getContext = () => null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__restoreGetContext = original
    })
    await page.reload()
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('scan-control')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('sighting-log-open')).toBeVisible({ timeout: 10_000 })

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
    await expect(page.getByTestId(`sighting-mark-${seededRecordId}`), 'the seeded ghost is drawn on first render').toBeVisible({
      timeout: 20_000,
    })
    await page.getByTestId('sighting-log-open').click()
    await expect(page.getByTestId(`sighting-row-${seededRecordId}`), 'the seeded record is in the log on mount').toBeVisible(
      { timeout: 20_000 },
    )
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

    const home = interiors.get(homeSystemId)
    expect(home).toBeTruthy()
    const hostId = await selectFirstBodyMatching(page, 'feat-').catch(() => home!.features[0]!.id)

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
    const ghost = page.getByTestId(`sighting-mark-${recordId}`)
    await expect(ghost).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('sighting-log-open').click()
    const row = page.getByTestId(`sighting-row-${recordId}`)
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Row -> ghost.
    await row.click()
    await expect(ghost).toHaveAttribute('data-highlighted', 'true')

    // Ghost -> row (activated via keyboard, the affordance a ghost mark
    // exposes per its own facts surface).
    await ghost.click()
    await expect(row).toHaveAttribute('data-highlighted', 'true')
  })

  test('the burn to the home station leg still docks normally (regression: scan control mounts beside, not inside, the fleet panel)', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')
    const interiors = captureInteriors(page)
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E Scan-Beside-Panel', 'scan-beside-panel')
    const home = interiors.get(homeSystemId)
    expect(home).toBeTruthy()
    const stationId = home!.features.find((f) => f.type === 'station')?.id
    test.skip(!stationId, 'no station in this freshly generated system')
    await selectFirstBodyMatching(page, stationId!)
    await burnToSelectionAndDock(page, fleetId)
    // The scan control and the docked-fleet-actions panel are BOTH present
    // at once — they are siblings, not nested (system-space-view §1.10).
    await expect(page.getByTestId('scan-control')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('space-fleet-panel')).toBeVisible({ timeout: 10_000 })
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
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E Scan-Mid-Burn', 'scan-mid-burn')

    const home = interiors.get(homeSystemId)
    expect(home, `no interior read for ${homeSystemId} was captured`).toBeTruthy()
    const stationId = home!.features.find((f) => f.type === 'station')?.id
    expect(stationId, 'this freshly generated home system served no station feature').toBeTruthy()

    // Select the station and commit the burn, WITHOUT waiting for it to
    // land — `burnToSelectionAndDock` waits all the way to "Docked", which
    // is exactly the arrangement this leg exists to avoid.
    await selectFirstBodyMatching(page, stationId!)
    await expect(page.getByTestId('preview-panel')).toBeVisible({ timeout: 60_000 })
    await page.getByTestId('burn-button').click()
    const row = page.getByTestId(`fleet-row-${fleetId}`)
    await expect(row, 'the burn must actually be under way before the mid-burn assertion means anything').toContainText(
      /under way/i,
      { timeout: 30_000 },
    )

    // MID-BURN: the scan control is open and legitimately empty — the
    // fleet is travelling, not yet at the station.
    await expect(page.getByTestId('scan-control')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('No host is in range to sweep.')).toBeVisible({ timeout: 20_000 })

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
