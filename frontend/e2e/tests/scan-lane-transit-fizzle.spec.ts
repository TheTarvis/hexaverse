import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  burnToSelectionAndDock,
  captureInteriors,
  selectBody,
  wakeNewCorp,
  type ServedGate,
} from '../helpers/space-view'
import { captureScanTargets, openScanControlAndPickFarthestTarget } from '../helpers/scan-fixtures'
import { emulatorSignIn } from '../helpers/firebase-emulator'

/**
 * Prefers a served gate CONFIRMED off-screen at the default framing —
 * mirroring `jump-commit.spec.ts`'s own established rationale ("a gate sits
 * at a characteristic radius along its bearing... so at any framing showing
 * the inner system it is off screen"), which is a real proxy for "far
 * enough that the burn to it takes long enough to observe `Under way`
 * before it docks". Test-dispute adjudicated 2026-09-03: `gates[0]` alone
 * (this file's original pick) is not WRONG — `jump-commit.spec.ts` picks it
 * identically and is not reported flaky — but this leg's own failed run
 * showed a burn short enough to settle before `burnToSelectionAndDock`'s
 * own "must observe Under way" guard could sample it, the same species as
 * the recorded spawn/station-order lottery. Falls back to `gates[0]`
 * unchanged if NO served gate is off-screen, so this can never leave the
 * arrangement with no gate at all.
 */
async function pickFarGate(page: Page, gates: ServedGate[]): Promise<ServedGate> {
  for (const g of gates) {
    if (!g.id) continue
    if ((await page.getByTestId(`offscreen-${g.id}`).count()) > 0) return g
  }
  return gates[0]!
}

/**
 * Scenario: A lane-transit fizzle — openspec change
 * `add-scan-and-sightings-surface`, tasks.md 10.5.
 *
 * `outOfRange` and `occluded` are NOT arrangeable against the real stack
 * (link8b-impl-contract.md §4.2: a sweep's max duration is ~4.9s and
 * pulse-reach is at most ~2.5s after commit — no player-path motion covers
 * a meaningful fraction of the 48-unit focused-scan range in that window).
 * The only fizzle a real browser gesture can arrange deterministically is
 * `laneTransit`/`leftSystem`, via the sequence the contract specifies:
 *
 *   1. Fly to a lane gate and dock (burnToSelectionAndDock already does
 *      this leg identically to `jump-commit.spec.ts`).
 *   2. Open the scan control and commit a sweep against the FARTHEST served
 *      target (largest durationMs) — REVISED 2026-09-03 (test-dispute
 *      adjudicated: a genuine arrangement defect, not a spec misread). Run
 *      7's own failures are the finding: the ATTACHED GATE itself sits at
 *      distance ~0, which carries the MINIMUM served duration (~3s per
 *      Decision) — this leg's own former "wait for scan-countdown" step
 *      (dropped below) ate enough of that ~3s window that the view's own
 *      ETA-scheduled refetch settled the sweep BEFORE the jump ever landed,
 *      at the ORIGIN system: attempt 1 never reached the galaxy view at
 *      all, and attempt 3's report read "the sweep filed records" instead
 *      of a fizzle. The farthest served target buys the most margin (up to
 *      ~4.9s) against that race. The fleet is DOCKED the entire time this
 *      pick is read and committed, with no observation window in between
 *      (unlike `scan-journey.spec.ts`'s own long docked leg, where several
 *      real seconds of OTHER activity separate a served read from its
 *      commit and a boundary target can drift out of range in between) —
 *      select and commit happen back-to-back, in the same synchronous step.
 *   3. STOP RACING THE JUMP AGAINST THE SWEEP — REVISED A THIRD TIME
 *      2026-09-03 (test-dispute adjudicated: a genuine arrangement defect,
 *      not a spec misread). Run 9's finding, under full-suite load: even a
 *      raw API jump POST can itself take 4-9s server-side (destination
 *      materialization) — longer than the sweep's own served duration
 *      (~3-4.9s) — so no wall-clock guard, however the jump is submitted,
 *      can reliably win this race. The fix is to stop needing to: the
 *      sweep does not resolve on its own — it resolves only when a READ
 *      folds it after its own ETA (`action-dispatch`'s ResolveActive), and
 *      the ONLY reads that do that here are the space view's own scheduled
 *      interior refetch and baseline poll. The galaxy roster's `listMine`
 *      folds due BURNS only and calls no ResolveActive. So: commit the
 *      scan through the UI, then IMMEDIATELY leave the space view
 *      (`page.goto('/')`, the galaxy view) — nothing is left open to fold
 *      this sweep early, however long the jump itself takes to land.
 *      Commit the jump via the API at leisure, then assert the arrangement
 *      DIRECTLY — `GET /v1/actions?actor=<id>&status=running` shows the
 *      scan still running the moment the jump's own response lands — rather
 *      than inferring it from timestamps.
 *   4. Let the sweep's ETA pass while the fleet is in transit or has
 *      already arrived.
 *
 * The report must show `laneTransit` OR `leftSystem` copy (which one fires
 * depends on whether the sweep is folded before or after the jump settles
 * — both are correct), never the generic unmapped-reason fallback, and no
 * record may be filed.
 */
const cfg = resolveE2EConfig()

test.use({ storageState: { cookies: [], origins: [] } })
// The stack this suite boots runs the simulation clock warped and lane travel
// cheap (see `backend-stack.ts`), so the jump this spec waits out costs seconds
// of wall clock, not the ~6 minutes it costs at prod pacing. The budget below is
// sized to catch a HANG, not to accommodate the wait.
test.setTimeout(300_000)

test.describe('a lane-transit fizzle reports its own copy and files no record', () => {
  test('committing a sweep against the attached gate, then jumping immediately, fizzles as laneTransit/leftSystem', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)
    const scanTargetsByFleet = captureScanTargets(page)

    const { homeSystemId, fleetId, email, password } = await wakeNewCorp(
      page,
      'E2E Lane-Transit Fizzle',
      'scan-fizzle',
    )

    const home = await interiors.get(homeSystemId)
    expect(home, `no interior read for ${homeSystemId} was captured`).toBeTruthy()
    const gates = home!.laneGates ?? []
    expect(gates.length, 'the home system served zero lane gates').toBeGreaterThan(0)
    const gate = await pickFarGate(page, gates)
    expect(gate.id, 'the served gate carries no body id').toBeTruthy()

    // 1. Fly to the gate and dock.
    await selectBody(page, gate.id!)
    await burnToSelectionAndDock(page, fleetId, 900_000)

    // 2. Open the scan control and pick the FARTHEST served target — see
    //    the file-level comment above for why this replaced the attached
    //    gate itself. (The jump command's own UI reachability no longer
    //    matters here — see step 3 — since the jump is committed via the
    //    API, not clicked.)
    await expect(page.getByTestId('scan-control')).toBeVisible({ timeout: 20_000 })
    const target = await openScanControlAndPickFarthestTarget(page, fleetId, scanTargetsByFleet)

    const scanRequest = page.waitForRequest(
      (req) => req.method() === 'POST' && /\/v1\/fleets\/[^/]+\/scan$/.test(req.url()),
      { timeout: 20_000 },
    )
    await page.getByTestId('scan-target-select').selectOption(target.hostId)
    await page.getByTestId('scan-commit-button').click()
    const scanReq = await scanRequest
    const scanRes = await scanReq.response()
    expect(scanRes?.status(), 'the scan commit itself must succeed for this leg to mean anything').toBeLessThan(400)

    // 3. Leave the space view IMMEDIATELY — see the file-level comment for
    //    why this, not a timing guard, is what makes the arrangement
    //    reliable: the sweep only resolves when a READ folds it past its
    //    own ETA, and the space view is the only page that schedules such
    //    a read (its own interior refetch / baseline poll). The galaxy
    //    view's roster reads fold due burns only, never a scan. Leaving
    //    BEFORE the jump is even committed means nothing is left open to
    //    fold this sweep early, however long the jump commit itself takes.
    await page.goto('/')
    await expect(page.getByTestId('galaxy-view')).toBeVisible({ timeout: 30_000 })

    // 4. Commit the jump via the API — at leisure, no race to win anymore.
    expect(gate.laneId, 'the served gate carries no laneId to jump by').toBeTruthy()
    const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
    const jumpRes = await page.request.post(`${cfg.apiURL}/v1/fleets/${fleetId}/jump`, {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { laneId: gate.laneId },
    })
    expect(
      jumpRes.ok(),
      `POST /v1/fleets/${fleetId}/jump failed: ${jumpRes.status()} ${await jumpRes.text()}`,
    ).toBe(true)

    // 5. The arrangement's own real requirement, asserted DIRECTLY rather
    //    than inferred from wall-clock timestamps (test-dispute adjudicated
    //    2026-09-03: a raw API jump POST can itself take 4-9s server-side
    //    under full-suite load, so no timing guard is reliable at all): the
    //    scan action must still be RUNNING the instant the jump's own
    //    response lands. Without leaving the space view in step 3, this
    //    read could itself fold the sweep and always pass vacuously; from
    //    the galaxy view, nothing has folded it but this GET's own read of
    //    the action itself, which does not resolve anything.
    const runningRes = await page.request.get(
      `${cfg.apiURL}/v1/actions?actor=${encodeURIComponent(fleetId)}&status=running`,
      { headers: { Authorization: `Bearer ${idToken}` } },
    )
    expect(
      runningRes.ok(),
      `GET /v1/actions?actor=${fleetId}&status=running failed: ${runningRes.status()} ${await runningRes.text()}`,
    ).toBe(true)
    const runningBody = (await runningRes.json()) as { actions?: { type?: string; status?: string }[] }
    expect(
      (runningBody.actions ?? []).some((a) => a.type === 'scan' && a.status === 'running'),
      'arrangement missed the window: the scan was no longer running the instant the jump landed, so this ' +
        'run cannot prove a mid-sweep fizzle',
    ).toBe(true)

    // 5b. Force a fresh fleets read — ADDED 2026-09-04 (this round's finding:
    //    a genuine arrangement defect, not a spec misread; test-dispute
    //    self-adjudicated per this round's remit — see the report). Step 6's
    //    ORIGINAL comment here claimed navigating to the galaxy view in step
    //    3 was enough for its `FleetRoster` to observe the jump, with "no
    //    further navigation needed" — that premise is false, and not for the
    //    reason it guarded against (a jumping fleet dropped from the roster's
    //    list). The jump above was committed via a RAW API call, which never
    //    touches the React Query cache. The galaxy view's `useMyFleets`
    //    (`hooks/use-fleets.ts`) fetched ONCE, on mount in step 3 — BEFORE
    //    the jump existed — and nothing was ever going to refetch it: the
    //    query client's default `staleTime` is 60s
    //    (`lib/query-client.ts`), `refetchOnWindowFocus` is off, `useMyFleets`
    //    sets no `refetchInterval`, and the galaxy view subscribes to no SSE
    //    channel at all (only `SystemSpaceView.tsx`, the space view, does).
    //    So the roster was rendering the pre-jump snapshot (`Docked`, no
    //    `fleet.jump`) forever — `remainingMs` stays `undefined`
    //    (`roster-status.ts`), so `FleetRoster.tsx`'s `fleet-row-eta-*`
    //    testid never renders at all. That is the "element(s) not found"
    //    this leg failed with twice, at the full 900s budget, not a slow
    //    countdown. A reload gives `useMyFleets` its first read of the
    //    post-jump fleet; from there the roster's own client-side world
    //    clock (`lib/client-clock`, extrapolating off the wall clock at the
    //    scale the read itself served) carries the ETA down to "now" on its
    //    own, with no further read
    //    needed — this is the same forced-refetch technique
    //    `scan-journey.spec.ts` already uses for an out-of-band state change.
    await page.reload()
    await expect(page.getByTestId('galaxy-view')).toBeVisible({ timeout: 30_000 })

    // 6. Wait for the jump to land. A due JUMP is settled ONLY by
    //    `GET /v1/fleets/:id` (`fleet.Get` -> `resolveDue`); `ListForCorp`
    //    (the roster's own `listMine`, the only read any frontend code path
    //    calls here) settles due BURNS only. So the roster row NEVER stops
    //    reading "In transit" on its own — outside the ~15-minute liveness
    //    sweep, a jump never lands in the UI at all (a real product gap,
    //    recorded for Travis). Arrange around it: wait for the roster's own
    //    ETA countdown — computed client-side off `fleet.jump.arriveMs`,
    //    independent of resolution — to actually reach zero, then settle the
    //    jump directly with the exact read `fleet.Get` performs on any other
    //    trigger (an authenticated `GET /v1/fleets/:id`), and assert ITS
    //    response, not the roster's, shows the fleet arrived.
    // A `data-raw <= 0` check on the served remaining span, never the due
    // form's copy (`figure-formatting`, openspec change
    // `add-figure-formatting`, task 10.2): the due form is presentation
    // (RULING 21's literal "now"), and asserting that string would let a
    // future copy change silently regress this wait to its own timeout.
    await expect
      .poll(
        async () =>
          Number(await page.getByTestId(`fleet-row-eta-${fleetId}`).getAttribute('data-raw')),
        {
          // Generous against the warped stack's own jump (seconds), small
          // enough that a jump that never lands fails this run in a minute
          // rather than a quarter of an hour.
          timeout: 120_000,
          message:
            "the jump's own ETA must actually count down to zero before forcing settlement means anything",
        },
      )
      .toBeLessThanOrEqual(0)

    const settleRes = await page.request.get(`${cfg.apiURL}/v1/fleets/${fleetId}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    expect(
      settleRes.ok(),
      `GET /v1/fleets/${fleetId} (forcing the due jump to settle) failed: ${settleRes.status()} ${await settleRes.text()}`,
    ).toBe(true)
    const settled = (await settleRes.json()) as { systemId?: string; jump?: unknown }
    expect(
      settled.jump,
      'the jump must have actually resolved (fleet.jump cleared) for this leg to mean anything',
    ).toBeFalsy()
    expect(
      settled.systemId,
      `the jump must have landed the fleet in ${gate.destSystemId}, not wherever it actually settled`,
    ).toBe(gate.destSystemId)

    // 7. Enter the destination system directly (the served gate's own
    //    `destSystemId`, never reconstructed) and select the fleet as
    //    acting — a fresh spawn's only fleet, but made explicit rather than
    //    relied upon.
    await page.goto(`/systems/${gate.destSystemId}`)
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(`fleet-row-${fleetId}`).click()

    // 8. The settled sweep's report: laneTransit or leftSystem copy —
    //    whichever fires depends on whether the sweep was folded before or
    //    after the jump settled — never the generic unmapped-reason
    //    fallback.
    await expect(page.getByTestId('scan-report')).toBeVisible({ timeout: 60_000 })
    const reportText = ((await page.getByTestId('scan-report').textContent()) ?? '').toLowerCase()
    expect(
      reportText,
      `report text was ${JSON.stringify(reportText)} — want laneTransit or leftSystem copy, ` +
        `never the generic unmapped-reason fallback`,
    ).toMatch(/transit|left the system|no longer in/)
    expect(reportText).not.toMatch(/returned nothing/) // the GENERIC_SWEEP_RESULT fallback, per lib/scan-copy.ts

    // No record was filed: a fizzle mints nothing at all, so the log has no
    // target-naming record for this sweep — this fresh corp's pile stays
    // entirely empty.
    await page.getByTestId('sighting-log-open').click()
    await expect(page.getByTestId('sighting-log')).toBeVisible({ timeout: 10_000 })
    const rows = page.locator('[data-testid^="sighting-row-"]')
    await expect(rows).toHaveCount(0)
  })
})
