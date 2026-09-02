import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'

/**
 * Jump commit, wire to click — openspec change
 * replace-observation-with-sightings, tasks.md 8.8:
 *
 *   "End-to-end frontend test covering the full wire-to-click path task 4.11
 *    wires: read a materialized system's interior, take the served `laneId` off
 *    an attached lane-gate body, and invoke the jump command with it —
 *    asserting the jump order is actually submitted (not a no-op or a
 *    client-side refusal), closing the gap a per-scenario unit test on either
 *    half alone would miss."
 *
 * (board-view: "Jump Commit" — "Invoking jump submits the attached gate's
 * lane".)
 *
 * WHY THIS EXISTS ALONGSIDE THE TESTS THAT ALREADY TOUCH JUMP:
 *  - `components/board/SystemBoardView.test.tsx` renders the real component and
 *    fires a real click, but `useSystemBoard` is mocked: the `laneId` it clicks
 *    with comes from a hand-written fixture literal, so it cannot fail if the
 *    SERVER stops sending one, or sends a different one.
 *  - `backend/lane_id_traversal_e2e_test.go` proves the server serves a usable
 *    laneId and accepts it back — but it constructs the jump request itself, so
 *    it cannot fail if the CLIENT never reads the served field.
 *  Neither can fail when the seam BETWEEN them breaks. This test closes it: the
 *  laneId asserted on the outgoing request is read out of the server's own
 *  interior-read response, captured off the wire during the same session.
 *
 * It is deliberately NARROWER and faster than `slice.spec.ts` (which also ends
 * in a jump, after two mining runs): this one goes wake → gate → burn → dock →
 * jump, and its assertion is on the REQUEST BODY, not merely on the roster
 * status afterward. A jump that submitted the WRONG lane id would still flip the
 * row to "In transit"; only the request-body assertion catches that.
 *
 * Local-only: drives the auth emulator's signup path, like slice.spec.ts.
 */
const cfg = resolveE2EConfig()

test.use({ storageState: { cookies: [], origins: [] } })

// The burn to the nearest lane gate rides the real world clock at scale 1
// (see slice.spec.ts's wall-clock note) — left generous rather than guessed
// tight.
test.setTimeout(600_000)

// Orbiting glyphs animate every frame, so Playwright's stability check never
// settles on them; dispatchEvent needs neither stability nor hit-testing.
async function clickGlyph(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).dispatchEvent('click')
}

interface ServedGate {
  destSystemId: string
  laneId?: string
}

test.describe('jump commit — wire to click', () => {
  test('submits the jump order naming the laneId the interior read itself served', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    // Every lane gate the SERVER served, per system, captured straight off the
    // wire. This is the "wire" end of the path under test — nothing here is a
    // fixture, and nothing re-derives the id client-side.
    const servedGates = new Map<string, ServedGate[]>()
    page.on('response', async (res) => {
      const url = new URL(res.url())
      const m = /^\/v1\/systems\/([^/]+)$/.exec(url.pathname)
      if (!m || res.request().method() !== 'GET' || !res.ok()) return
      try {
        const body = (await res.json()) as { laneGates?: ServedGate[] }
        if (Array.isArray(body.laneGates)) servedGates.set(m[1], body.laneGates)
      } catch {
        // A non-JSON or already-consumed body is not this test's concern; the
        // assertions below fail loudly if nothing was ever captured.
      }
    })

    // 1. Sign up and wake onto the home board.
    const email = `e2e+jumpcommit-${Date.now()}@hexaverse.test`
    const password = 'e2ePassword123!'
    await page.goto('/login?signUp=true')
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-password').fill(password)
    await page.getByTestId('login-confirm-password').fill(password)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('wake-up-flow')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('wake-name-input').fill('E2E Jumper')
    await page.getByTestId('wake-submit').click()
    await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 20_000 })
    await expect(page.getByTestId('board-overlay')).toBeVisible({ timeout: 15_000 })

    const homeSystemId = new URL(page.url()).pathname.split('/').pop()!
    expect(homeSystemId, 'the wake flow should land on a system route').toBeTruthy()

    const roster = page.getByTestId('fleet-roster')
    await expect(roster).toBeVisible({ timeout: 15_000 })
    const rows = roster.locator('[data-testid^="fleet-row-"]')
    await expect(rows).toHaveCount(1, { timeout: 15_000 })
    const fleetId = (await rows.first().getAttribute('data-testid'))!.replace('fleet-row-', '')

    // 2. The gate bodies are on the board unfiltered from the first load
    //    (system-interior "Bodies Are Public; Ships Are Disclosed"). Pick the
    //    nearest one and remember WHICH gate, so the served laneId asserted
    //    below is that same gate's.
    const gates = page.locator('[data-testid^="gate-glyph-"]')
    await expect(
      gates.first(),
      'a fresh corporation’s home board should show at least one lane-gate body',
    ).toBeVisible({ timeout: 15_000 })

    let gateDestId = ''
    let best = Number.POSITIVE_INFINITY
    for (const glyph of await gates.all()) {
      const id = (await glyph.getAttribute('data-testid'))!.replace('gate-glyph-', '')
      const box = await glyph.boundingBox()
      if (!box) continue
      const d = Math.hypot(box.x, box.y)
      if (d < best) {
        best = d
        gateDestId = id
      }
    }
    expect(gateDestId, 'a nearest lane-gate body should have been picked').not.toBe('')

    // The served laneId for THAT gate — read from the captured interior
    // response, never re-derived here. This is the value the click must carry.
    const homeGates = servedGates.get(homeSystemId) ?? []
    expect(
      homeGates.length,
      `no interior read for ${homeSystemId} was captured off the wire, or it carried no laneGates — ` +
        `the wire half of this path never happened, so the assertions below would be vacuous`,
    ).toBeGreaterThan(0)
    const servedLaneId = homeGates.find((g) => g.destSystemId === gateDestId)?.laneId
    expect(
      servedLaneId,
      `the interior read for ${homeSystemId} served no laneId on the gate toward ${gateDestId} ` +
        `(system-interior "Lane-Gate Bodies Carry Their Lane Id"): served gates were ` +
        `${JSON.stringify(homeGates)}`,
    ).toBeTruthy()

    // 3. Burn to that gate and dock. "Under way" first: the fleet is already
    //    parked at spawn, so waiting only for a docked state could pass on a
    //    click that was silently swallowed (slice.spec.ts's own false-positive
    //    guard, same reasoning).
    await clickGlyph(page, `gate-glyph-${gateDestId}`)
    await page.getByTestId(`fleet-cmd-burn-${fleetId}`).click()
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText(/under way/i, {
      timeout: 15_000,
    })
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText('Docked', {
      timeout: 300_000,
    })

    // 4. Scenario: Invoking jump submits the attached gate's lane.
    //    The jump command is offered on attachment alone, and the click must
    //    put the SERVED laneId on the wire — not a client-side refusal, not a
    //    no-op, not some other lane.
    await expect(page.getByTestId(`fleet-cmd-jump-${fleetId}`)).toBeVisible({ timeout: 15_000 })
    const jumpRequest = page.waitForRequest(
      (req) => req.method() === 'POST' && /\/v1\/fleets\/[^/]+\/jump$/.test(req.url()),
      { timeout: 15_000 },
    )
    await page.getByTestId(`fleet-cmd-jump-${fleetId}`).click()

    const req = await jumpRequest
    expect(req.url(), 'the jump must be submitted for the fleet whose row was clicked').toContain(
      `/v1/fleets/${fleetId}/jump`,
    )
    const sent = req.postDataJSON() as { laneId?: string }
    expect(
      sent.laneId,
      `board-view "Jump Commit": the jump request carried laneId=${JSON.stringify(sent.laneId)}, ` +
        `but the interior read served ${JSON.stringify(servedLaneId)} for the attached gate toward ` +
        `${gateDestId}. The click must pass the served value straight through, with no second lookup ` +
        `and no client-side re-derivation.`,
    ).toBe(servedLaneId)

    // …and the server accepted it: a submitted-but-rejected order is not a
    // committed jump.
    const res = await req.response()
    expect(res, 'the jump request produced no response').not.toBeNull()
    expect(
      res!.status(),
      `POST /v1/fleets/${fleetId}/jump returned ${res!.status()} for the laneId the server itself ` +
        `served on the same session's interior read`,
    ).toBeLessThan(400)

    // The observable consequence on the board the player is looking at.
    await expect(roster.getByTestId(`fleet-row-${fleetId}`)).toContainText(/in transit/i, {
      timeout: 15_000,
    })
  })
})
