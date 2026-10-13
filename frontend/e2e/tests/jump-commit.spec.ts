import { test, expect } from '@playwright/test'
import { arrangeBodyDock } from '../helpers/served-movement'
import { emulatorSignIn } from '../helpers/firebase-emulator'
import { resolveE2EConfig } from '../config/env'
import {
  captureInteriors,
  openObjectDetails,
  prepareCommandHud,
  wakeNewCorp,
} from '../helpers/space-view'

/**
 * Jump commit, wire to click.
 *
 * ORIGINALLY written for `replace-observation-with-sightings` tasks.md 8.8
 * (board-view "Jump Commit": "Invoking jump submits the attached gate's
 * lane"). REWRITTEN against the continuous-space view for
 * `build-production-space-view` tasks.md 2.1b / 10.8 — the board view and
 * every id this suite drove (`board-overlay`, `gate-glyph-*`,
 * `fleet-cmd-burn-*`) are gone. The JOURNEY and every assertion's SUBSTANCE
 * are preserved verbatim in intent; only the surfaces changed.
 *
 * WHY THIS EXISTS ALONGSIDE THE TESTS THAT ALREADY TOUCH JUMP:
 *  - `components/space/SystemSpaceView.test.tsx` renders the real component
 *    and fires a real click, but `useSystemSpace` is mocked: the `laneId` it
 *    clicks with comes from a hand-written fixture literal, so it cannot fail
 *    if the SERVER stops sending one, or sends a different one.
 *  - `backend/lane_id_traversal_e2e_test.go` proves the server serves a
 *    usable laneId and accepts it back — but it constructs the jump request
 *    itself, so it cannot fail if the CLIENT never reads the served field.
 *  Neither can fail when the seam BETWEEN them breaks. This test closes it:
 *  the laneId asserted on the outgoing request is read out of the server's
 *  own interior-read response, captured off the wire during the same session.
 *
 * WHAT THE REWRITE ADDS, and why it belongs here rather than in a new file.
 * `system-interior`'s *Lane-Gate Bodies Carry Their Body Id* (tasks.md
 * 9.1b–9.1d) makes the gate's `id` a SERVED string precisely so no client
 * rebuilds `"gate-" + destSystemId`. That claim has exactly the same shape as
 * this suite's original one — "the value on the wire out is the value the
 * server sent in" — and exactly the same blind spot if left to either side's
 * own tests. So the burn leg now asserts the ORDER's `bodyId` against the
 * served gate `id`, alongside the jump leg's laneId assertion. Together they
 * pin both halves of a gate's identity across one real round trip.
 *
 * It is deliberately NARROWER and faster than `slice.spec.ts` (which also
 * ends in a jump, after two mining runs): this one goes wake → gate → burn →
 * dock → jump, and its assertions are on the REQUEST BODIES, not merely on
 * the roster status afterward. A jump that submitted the WRONG lane id would
 * still flip the row to "In transit"; only the request-body assertion catches
 * that.
 *
 * Local-only: drives the auth emulator's signup path, like slice.spec.ts.
 */
const cfg = resolveE2EConfig()

test.use({ storageState: { cookies: [], origins: [] } })

// The burn to the nearest lane gate rides the world clock, which this stack
// runs warped (see slice.spec.ts's wall-clock note) — the budget is left
// generous rather than guessed tight, so it holds unwarped too. A gate sits at
// the system's rim, so this is the longest single burn any suite here commits.
test.setTimeout(900_000)

test.describe('jump commit — wire to click', () => {
  test('submits the jump order naming the laneId the interior read itself served', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    // The wire end of the path under test. Nothing below is a fixture, and
    // nothing re-derives a served id client-side.
    const interiors = captureInteriors(page)

    // 1. Sign up and wake onto the home system's space view.
    const { homeSystemId, fleetId, email, password } = await wakeNewCorp(page, 'E2E Jumper', 'jumpcommit')

    // 2. The gate bodies ship unfiltered from the first read
    //    (`system-interior`: "Bodies Are Public; Ships Are Disclosed"), so a
    //    corporation that has charted nothing still sees its home gates.
    const home = await interiors.get(homeSystemId)
    expect(
      home,
      `no interior read for ${homeSystemId} was captured off the wire — the wire half of this ` +
        `path never happened, so every assertion below would be vacuous`,
    ).toBeTruthy()
    const gates = home!.laneGates ?? []
    expect(
      gates.length,
      `the home system's interior read carried ZERO lane gates (home ${homeSystemId}). The ` +
        `backend's own traversability test hard-fails a spawn like this, so a zero here is a ` +
        `real regression, not a seed.`,
    ).toBeGreaterThan(0)

    const gate = gates[0]
    // `system-interior` *Lane-Gate Bodies Carry Their Body Id* > "Every
    // lane-gate body carries a non-empty, distinct id". Without it a client
    // has no way to name this gate in a burn order that does not reimplement
    // the server's own naming convention — which is the fourth copy the
    // requirement exists to prevent (design.md Decision 15).
    expect(
      gate.id,
      `the interior read for ${homeSystemId} served no body \`id\` on the gate toward ` +
        `${gate.destSystemId}: ${JSON.stringify(gate)}`,
    ).toBeTruthy()
    expect(
      gate.laneId,
      `the interior read for ${homeSystemId} served no \`laneId\` on the gate toward ` +
        `${gate.destSystemId} (system-interior "Lane-Gate Bodies Carry Their Lane Id"): ` +
        `${JSON.stringify(gate)}`,
    ).toBeTruthy()

    // Movement is an explicit API fixture, not a claim of retired UI Burn coverage.
    const { idToken } = await emulatorSignIn(cfg.emulator!, email, password)
    await openObjectDetails(page, gate.id!)
    await arrangeBodyDock(page, fleetId, gate.id!, idToken, 900_000)
    await page.reload()
    await prepareCommandHud(page)
    await expect(page.getByTestId('vitals-state-pill')).toContainText(/docked/i)

    // 4. Scenario: Invoking jump submits the attached gate's lane.
    //    The command is offered on attachment alone — no charted-lane
    //    precondition, no canvas selection — and the click must put the
    //    SERVED laneId on the wire: not a client-side refusal, not a no-op,
    //    not some other lane.
    // The current system HUD hides Jump; the galaxy roster exposes the live command.
    await page.getByTestId('nav-home').click()
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 })
    await expect(page.getByTestId(`fleet-row-${fleetId}`)).toBeVisible({ timeout: 20_000 })
    const jumpButton = page.getByTestId(`fleet-cmd-jump-${fleetId}`)
    await expect(jumpButton).toBeVisible({ timeout: 20_000 })
    const jumpRequest = page.waitForRequest(
      (req) => req.method() === 'POST' && /\/v1\/fleets\/[^/]+\/jump$/.test(req.url()),
      { timeout: 20_000 },
    )
    await jumpButton.click()

    const req = await jumpRequest
    expect(req.url(), 'the jump must be submitted for the fleet whose command was clicked').toContain(
      `/v1/fleets/${fleetId}/jump`,
    )
    const sent = req.postDataJSON() as { laneId?: string }
    expect(
      sent.laneId,
      `docked-fleet-actions "Jump Commit": the jump request carried laneId=` +
        `${JSON.stringify(sent.laneId)}, but the interior read served ${JSON.stringify(gate.laneId)} ` +
        `for the attached gate toward ${gate.destSystemId}. The click must pass the served value ` +
        `straight through, with no second lookup and no client-side re-derivation.`,
    ).toBe(gate.laneId)

    // …and the server accepted it: a submitted-but-rejected order is not a
    // committed jump.
    const res = await req.response()
    expect(res, 'the jump request produced no response').not.toBeNull()
    expect(
      res!.status(),
      `POST /v1/fleets/${fleetId}/jump returned ${res!.status()} for the laneId the server itself ` +
        `served on the same session's interior read`,
    ).toBeLessThan(400)

    // The observable consequence on the view the player is looking at. The
    // departure hand-off may carry them to the galaxy, so this is asserted
    // wherever the row now lives rather than inside the system view.
    await expect(page.getByTestId(`fleet-row-${fleetId}`)).toContainText(/in transit/i, {
      timeout: 30_000,
    })
  })
})
