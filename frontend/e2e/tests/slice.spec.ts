import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  burnToSelectionAndDock,
  captureInteriors,
  digits,
  holdKindTons,
  mineableBodyId,
  selectBody,
  stationFeatureId,
  wakeNewCorp,
} from '../helpers/space-view'

/**
 * The vertical slice — one journey through the economic loop, on a fresh
 * account:
 *
 *   sign up → wake on the home system in continuous space (every body already
 *   disclosed — `system-interior`'s fully-disclosed interim read, no scan
 *   needed to see a lode) → select a mineable body → BURN + dock → MINE (the
 *   hold fills at the eta) → reload (the cargo PERSISTED — a fresh Firestore
 *   read, not client cache) → mine again (the ledger accumulates) → burn to
 *   the home station → SELL (the credit balance rises) → select a lane-gate
 *   body → BURN + dock to it → JUMP.
 *
 * REWRITTEN for `build-production-space-view` tasks.md 2.1b / 10.8. Cause:
 * task 2.1 replaces `/systems/:systemId` outright, and every id this suite
 * drove — `board-overlay`, `feature-glyph-*[data-mineable]`, `gate-glyph-*`,
 * `fleet-cmd-burn-*`, `mine-kind-*` — belonged to the board view that
 * section 10 deletes. THE ECONOMIC SLICE IS PRESERVED IN FULL, and one leg
 * is ADDED: the sale. `docked-fleet-actions` now owns sell alongside mine and
 * refuel, and a "mine → sell" slice that never sells proves half a loop.
 *
 * THREE SUBSTANTIVE CARRY-OVERS, each of which was learned the hard way and
 * none of which the rewrite drops:
 *
 *  1. THE MINED-KIND BASELINE, not the aggregate hold. Fuel shares the same
 *     cargo pool and every burn spends some, so `startingHold + 5` cannot
 *     hold: the pool shrank from fuel burn and grew from mining in between.
 *     Every mining assertion below reads the MINED KIND'S OWN row.
 *     (Post-handoff revision adjudicated 2026-09-02 on the board-era file;
 *     the reasoning survives the port unchanged.)
 *  2. THE "UNDER WAY" FALSE-POSITIVE GUARD before every docked assertion.
 *     The fleet is already `Docked` when each burn leg begins, so waiting
 *     only on the eventual docked state would pass even if the burn click
 *     were silently swallowed — which is exactly the defect (`handleBurn`
 *     refusing a gate selection with "Select a body to target first") that
 *     this suite's gate leg was written to catch. `burnToSelectionAndDock`
 *     carries the guard.
 *  3. MOONS EXCLUDED as mine targets. The generator marks them mineable but
 *     the server's own burn solve rejects them as a target, so a moon can be
 *     neither docked at nor mined. Known product gap, surfaced to Travis
 *     2026-08-25, unchanged by this migration. `mineableBodyId` skips them.
 *
 * WHAT CHANGED IN KIND, and why it is stronger. Targets are no longer picked
 * by measuring rendered glyph positions; they are picked from the SERVED
 * interior read. A screen-distance heuristic silently picked whatever drew
 * first when its attribute filter missed (see refuel-commit.spec.ts's own
 * note on exactly that failure), and it could not tell a station from a belt.
 * Reading the server's own `type`/`resources` cannot.
 *
 * Wall-clock note (design.md Risks): every eta here is world time, and the
 * stack this suite boots runs the simulation clock WARPED — `backend-stack.ts`
 * sets WORLD_TIME_SCALE (and a cheaper lane) so the suite does not wait out a
 * burn in real time. Durations still come out of production code unchanged (a
 * burn is solved from continuous distance and the fleet's acceleration,
 * `space.SolveBurn`; mining is 1s/ton of world time) — only the wall clock they
 * are spent against shrinks. The timeouts below are deliberately generous
 * rather than guessed tight: they are hang budgets, not expected waits, and
 * they hold at any scale including an unwarped E2E_WORLD_TIME_SCALE=1 run.
 *
 * Local-only: drives the auth emulator's signup path, like new-user.spec.ts.
 */
const cfg = resolveE2EConfig()

test.use({ storageState: { cookies: [], origins: [] } })

// Two burns across the system, two mining runs, a sale, a rim-gate burn and a
// jump commit — all on the real world clock.
test.setTimeout(1_800_000)

test.describe('the vertical slice', () => {
  test('wake → mine → persisted → mine again → sell → fly to a gate → jump', async ({ page }) => {
    test.skip(cfg.env !== 'local', 'slice journey drives the auth emulator (local only)')

    const interiors = captureInteriors(page)

    // 1. Sign up and wake onto the home system's space view.
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E Prospector', 'slice')

    // The hull's hold is NOT empty from spawn: `add-fuel-as-cargo` grants
    // starting fuel, and fuel occupies the same cargo pool as mined ore
    // (`fleet-movement`: "Fleet Cargo Pool"). Captured, not hard-coded — the
    // grant's size is a tuning constant this suite has no business pinning.
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 20_000 })
    expect(
      await digits(page, 'hold-capacity-used'),
      'a freshly spawned hull should hold its starting-fuel grant, not an empty hold',
    ).toBeGreaterThan(0)

    // 2. NO SCAN — `system-interior`'s fully-disclosed interim read ships
    //    every body, resources included, from the very first read. The lode
    //    is already there; nothing to trigger, nothing to wait on.
    const home = await interiors.get(homeSystemId)
    expect(
      home,
      `no interior read for ${homeSystemId} was captured off the wire — this journey's every ` +
        `target is chosen from it, so nothing below would mean anything`,
    ).toBeTruthy()
    const stationId = stationFeatureId(home!)
    const lodeId = mineableBodyId(home!, stationId ?? undefined)
    expect(
      lodeId,
      `the home system's interior read carried no mineable non-star, non-station, non-moon body ` +
        `(home ${homeSystemId})`,
    ).toBeTruthy()

    // 3. SELECT the lode and BURN to it. Selecting the body IS naming the
    //    target (design.md Decision 12: "targets are named by body id from
    //    the interior read, not by picking a tile").
    await selectBody(page, lodeId!)
    await burnToSelectionAndDock(page, fleetId, 600_000)

    // 4. MINE a minimum-size run and watch the MINED RESOURCE — not the
    //    aggregate hold — fill at the eta. See carry-over 1 in the header.
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 20_000 })
    const mineKind = await page.getByTestId('mine-kind-select').inputValue()
    expect(mineKind, 'the mine picker offered no resource kind').toBeTruthy()
    const before = await holdKindTons(page, mineKind)

    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect(page.getByTestId('mine-countdown')).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(() => holdKindTons(page, mineKind), {
        timeout: 90_000,
        message: 'the mined resource fills at the run’s eta, with no user action',
      })
      .toBe(before + 5)

    // 5. PERSISTED: reload — the hold readout re-derives from a fresh
    //    Firestore read (the same read a returning player would issue), not
    //    from anything still in this tab's memory.
    //
    //    POLLED, not a single synchronous read, since `add-vitals-strip`
    //    (openspec-team gate, 2026-09-09): `hold-readout` now lives in the
    //    ALWAYS-PRESENT vitals strip (`system-console` R1), not inside
    //    `FleetActionsPanel`'s old `if (!fleet) return …` gate — so its
    //    visibility is no longer proof the post-reload fleet read has
    //    landed, only that the strip has mounted. Impl contract §3.3
    //    promised this testid's NAME and DOM SHAPE would survive unedited,
    //    and they did; it never promised the testid's MOUNT TIMING would.
    //    The assertion is unchanged in substance — the tons must still
    //    reach `before + 5`, and a wrong implementation still fails it.
    await page.reload()
    await expect(page.getByTestId('hold-readout')).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(() => holdKindTons(page, mineKind), {
        timeout: 30_000,
        message: 'the persisted hold must reflect the resolved mine on a fresh Firestore read',
      })
      .toBe(before + 5)

    // 6. Mine AGAIN — the lode's ledger and the mined resource both
    //    accumulate (exactly-once deltas: 5 + 5, never 5 or 15).
    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect
      .poll(() => holdKindTons(page, mineKind), {
        timeout: 90_000,
        message: 'the second run accumulates rather than replacing or double-counting',
      })
      .toBe(before + 10)

    // 7. SELL at the home station — the half of the economic loop the
    //    board-era slice never reached (`docked-fleet-actions`: *Sell
    //    Commit*, "the fleet's cargo and the requester's credit balance both
    //    reflect the sale's effect without a page navigation").
    expect(stationId, `the home system's interior read carried no station body`).toBeTruthy()
    await selectBody(page, stationId!)
    await burnToSelectionAndDock(page, fleetId, 600_000)

    await expect(page.getByTestId('sell-section')).toBeVisible({ timeout: 20_000 })
    const balanceBefore = await digits(page, 'balance-value')
    expect(
      Number.isFinite(balanceBefore),
      'the credit balance readout shows no number — `docked-fleet-actions` *Credit Balance ' +
        'Readout*: "the requester\'s current credit balance is shown"',
    ).toBe(true)
    const heldBefore = await holdKindTons(page, mineKind)

    await page.getByTestId('sell-tons-input').fill('5')
    await expect(page.getByTestId('sell-proceeds-preview')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('sell-button').click()

    await expect
      .poll(() => digits(page, 'balance-value'), { timeout: 30_000 })
      .toBeGreaterThan(balanceBefore)
    await expect
      .poll(() => holdKindTons(page, mineKind), { timeout: 30_000 })
      .toBe(heldBefore - 5)

    // 8. DEPART — select a lane-gate body by its SERVED id (never a
    //    client-rebuilt "gate-"+dest), burn to it with the SAME command and
    //    the SAME click as any other body (`system-space-view`: *Burn Command
    //    Targets Any Selected Body, Lane Gate, or Point Uniformly* — "no
    //    gate-specific refusal copy exists"), then JUMP.
    //
    //    Every home system has at least one lane-gate body: the backend's own
    //    traversability e2e hard-fails a spawn whose home interior carries
    //    zero. That is a structural guarantee, not a lucky seed.
    const gates = (await interiors.get(homeSystemId)).laneGates ?? []
    expect(gates.length, 'the home system interior served no lane-gate body').toBeGreaterThan(0)
    const gate = gates[0]
    expect(gate.id, `the gate toward ${gate.destSystemId} was served with no body id`).toBeTruthy()

    await selectBody(page, gate.id!)
    await burnToSelectionAndDock(page, fleetId, 900_000)

    // JUMP — offered the instant the fleet is attached to the gate, no
    // charted-lane precondition, commits naming the attached gate's laneId
    // straight off the already-open interior read.
    const jump = page.getByTestId(`fleet-cmd-jump-${fleetId}`)
    await expect(jump).toBeVisible({ timeout: 20_000 })
    await jump.click()

    // The jump committed. A fleet's `systemId` does not flip until the jump
    // RESOLVES (design.md Decision 10), so lane-transit state — not an
    // arrival — is the honest success signal for a COMMIT; the arrival leg is
    // covered, time-skipped, by the backend's own e2e.
    await expect(page.getByTestId(`fleet-row-${fleetId}`)).toContainText(/in transit/i, {
      timeout: 30_000,
    })
  })
})
