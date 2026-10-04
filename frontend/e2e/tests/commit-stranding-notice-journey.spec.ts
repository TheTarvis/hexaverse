import { test, expect } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { captureInteriors, selectBody, stationFeatureId, wakeNewCorp } from '../helpers/space-view'

/**
 * The commit-stranding-notice journey — openspec change
 * `surface-commit-stranding-warning` (task 6.3), archive gate
 * (`docs/testing-tiers.md` tier 4). Written after tasks 1-4 were checked,
 * against the UI that exists. NOT run at the time of writing.
 *
 * THE WALK (QA's "BLOCKED rows and the journey assertion that closes each",
 * `surface-commit-stranding-warning-qa.md`), keyed on the COMMAND PANEL
 * (`preview-panel`, which holds the Burn control and the notice), never on the
 * roster row:
 *
 *   1. Wake a corp; select the home STATION; commit a burn to it. The burn's
 *      own destination is a station, so by the backend's own rule
 *      (`evaluateStrandingWarning`: "a burn whose own destination is a station
 *      or lane gate carries no stranding warning") the commit is DETERMINISTICALLY
 *      non-stranding on every spawn.                       (QA row 1)
 *        - the real POST /v1/fleets/:id/orders response is accepted and its
 *          parsed body has NO `strandingWarning` key (omitted, not false);
 *        - `commit-stranding-notice` has count 0 in the command panel and on
 *          the page;
 *        - the success toast shows once, no warning toast shows.
 *   2. Burn under way: cut the drive from the fleet panel. The command panel
 *      still carries no notice and the Burn control is still enabled; the
 *      fleet's roster row reads Drifting (a corroboration that the cut landed,
 *      not the key).                                       (QA row 1, last clause)
 *   3. The `[journey-console]` update-depth check is a hard afterEach assertion.
 *                                                          (QA row 3)
 *
 * UNTESTED AT TIER 4 — THE STRANDING LEG (QA row 2). Not written, and recorded
 * here and in the handoff as UNTESTED, never as passing: notice visible with
 * exactly one warning toast; still visible after the first post-commit own-fleets
 * read (the real-wire instants-equality assumption); removed on cut drive with
 * no second toast; absent after reload while `fleet-stranded-<id>` shows on the
 * roster row. Why no deterministic fixture exists with what already exists:
 *   - the warning fires only when the fuel left AFTER the commit's debit cannot
 *     afford a floor-priced burn to any station or lane gate in the system
 *     (backend/fleet/service.go `evaluateStrandingWarning`); a burn whose
 *     destination is itself a station/gate never warns, and a resulting park at
 *     a station's standoff counts as reachable;
 *   - a fresh spawn holds the configured starting fuel (100 t,
 *     fleet/fuel_params.go) and fuel is not a market commodity, so play cannot
 *     lower it to a chosen level (no sell, no dump); only burning spends it;
 *   - the cost of any burn, and the floor-priced reach back to a station, are
 *     functions of the randomly-drawn system's geometry
 *     (`defect-spawn-system-single-body`), so no assertion can assume that some
 *     body on a fresh spawn strands, and a loop that burns until one does is
 *     unbounded in wall time and may never find one;
 *   - arranging it through the API would need a fuel-setting seed route or a
 *     fixture generator, which this change may not add.
 * A discovery loop that skips when nothing strands would pass vacuously, which
 * is worse than recording the gap. The leg stays closed at tier 1 on a mocked
 * wire (SystemSpaceView.stranding-notice.test.tsx 3.1-3.20) only.
 *
 * PRE-FLIGHT (by code reading): a fresh spawn is NOT docked at the station.
 * `fleet.SeedFleet` places the hull as a point park (`ParkPoint`) at a
 * continuous home position outside the star clearance, never attached to a
 * body, so the station burn is a real, non-zero-length order (the same
 * "fresh spawn: unattached park" the burn-preview journey relies on). The one
 * known way this commit can be refused is the filed intermittent
 * defect-station-order-500; the failure message names it.
 *
 * SCALE. The e2e stack is warped (`WORLD_TIME_SCALE=5`); every wait below is a
 * polled condition on served state and no assertion timeout is raised.
 */
const cfg = resolveE2EConfig()

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 720 },
})

test.setTimeout(300_000)

interface JourneyConsoleEntry {
  kind: 'pageerror' | 'console-error' | 'console-warning'
  text: string
  url: string
}

let journeyConsoleBuffer: JourneyConsoleEntry[] = []

test.beforeEach(async ({ page }) => {
  journeyConsoleBuffer = []
  page.on('pageerror', (err) => {
    journeyConsoleBuffer.push({ kind: 'pageerror', text: err.message, url: page.url() })
  })
  page.on('console', (msg) => {
    const type = msg.type()
    if (type !== 'error' && type !== 'warning') return
    journeyConsoleBuffer.push({
      kind: type === 'error' ? 'console-error' : 'console-warning',
      text: msg.text(),
      url: page.url(),
    })
  })
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal { display: none !important }'
      document.head.appendChild(style)
    }
    if (document.head) inject()
    else document.addEventListener('DOMContentLoaded', inject)
  })
})

const UPDATE_DEPTH = /maximum update depth|nested update/i

test.afterEach(() => {
  console.log(
    `[journey-console] ${journeyConsoleBuffer.length} browser console error/warning/pageerror entr${
      journeyConsoleBuffer.length === 1 ? 'y' : 'ies'
    } captured this run`,
  )
  for (const entry of journeyConsoleBuffer) {
    console.log(`[journey-console] ${entry.kind} at ${entry.url}: ${entry.text}`)
  }
  const updateDepthLines = journeyConsoleBuffer.filter((e) => UPDATE_DEPTH.test(e.text))
  console.log(`[journey-console] update-depth lines: ${updateDepthLines.length}`)
  expect(
    updateDepthLines,
    `React update-depth / nested-update diagnostic(s) captured in the browser console: ${JSON.stringify(
      updateDepthLines,
      null,
      2,
    )}`,
  ).toEqual([])
})

const ORDER_URL = /\/v1\/fleets\/[^/]+\/orders$/

// The warning toast's literal copy (SpaceCommandPanel's COMMIT_STRANDING_TOAST_COPY);
// asserted as text here so a typo in the shipped constant cannot pass.
const WARNING_TOAST = 'This course leaves the fleet unable to reach a station or lane gate.'

test.describe('the commit stranding notice — a non-stranding commit on the real wire', () => {
  test('a burn to the home station omits the stranding field, shows no notice or warning toast, and cutting the drive leaves the command surface clean', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E StrandNotice', 'strandnotice')
    const row = page.getByTestId(`fleet-row-${fleetId}`)
    const panel = page.getByTestId('preview-panel')
    const toasts = page.locator('[data-sonner-toast]')

    const home = await interiors.get(homeSystemId)
    const stationId = stationFeatureId(home)
    expect(
      stationId,
      `home ${homeSystemId} served no station body — every spawn home is provisioned with one (stations M11)`,
    ).toBeTruthy()

    // -----------------------------------------------------------------
    // Step 1 — commit a burn to the station; observe the REAL response.
    // -----------------------------------------------------------------
    await selectBody(page, stationId!)
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('burn-button')).toBeEnabled({ timeout: 30_000 })
    await expect(
      panel.getByTestId('commit-stranding-notice'),
      'GIVEN: no notice in the command panel before any commit',
    ).toHaveCount(0)

    const orderResponse = page.waitForResponse(
      (res) => res.request().method() === 'POST' && ORDER_URL.test(new URL(res.url()).pathname),
    )
    await page.getByTestId('burn-button').click()
    const res = await orderResponse
    expect(
      res.ok(),
      `the order commit was not accepted: HTTP ${res.status()}. A bodyless 500 here with the backend log ` +
        '"endpoint at or inside the star-clearance radius" is the filed, OPEN defect-station-order-500 ' +
        '(~2% of station-targeted orders, arrival-phase dependent), not a finding of this change.',
    ).toBe(true)
    const body = (await res.json()) as Record<string, unknown>
    console.log(`[journey-step1] order response keys: ${Object.keys(body).sort().join(',')}`)
    expect(
      'strandingWarning' in body,
      'the real wire omits `strandingWarning` on a non-stranding commit (omitted, not sent false)',
    ).toBe(false)

    await expect(row, 'the burn must actually be under way').toContainText(/under way/i, { timeout: 30_000 })
    await expect(
      toasts.filter({ hasText: /Burn committed/ }),
      'the success feedback shows exactly once',
    ).toHaveCount(1)
    await expect(
      toasts.filter({ hasText: WARNING_TOAST }),
      'no advisory warning toast on a non-stranding commit',
    ).toHaveCount(0)
    await expect(panel.getByTestId('commit-stranding-notice'), 'no notice in the command panel').toHaveCount(0)
    await expect(page.getByTestId('commit-stranding-notice'), 'no notice anywhere on the page').toHaveCount(0)

    // -----------------------------------------------------------------
    // Step 2 — cut the drive; the command surface reflects it: still no
    // notice, Burn still available, no warning toast raised by the cut.
    // The roster row's Drifting reading corroborates that the cut landed.
    // -----------------------------------------------------------------
    const cut = page.getByTestId(`fleet-cmd-cut-drive-${fleetId}`)
    await expect(cut).toBeVisible({ timeout: 20_000 })
    await cut.click()
    await expect(row, 'the cut landed: the fleet reads Drifting').toContainText(/drifting/i, { timeout: 30_000 })
    await expect(panel.getByTestId('commit-stranding-notice')).toHaveCount(0)
    await expect(page.getByTestId('burn-button'), 'Burn stays available on the command panel').toBeEnabled()
    await expect(toasts.filter({ hasText: WARNING_TOAST })).toHaveCount(0)
  })
})
