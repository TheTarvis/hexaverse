import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  burnToSelectionAndDock,
  captureInteriors,
  digits,
  holdKindTons,
  selectBody,
  stationFeatureId,
  wakeNewCorp,
  type ServedGate,
} from '../helpers/space-view'

/**
 * The vitals-strip journey — openspec change `add-vitals-strip` (link 2a of
 * `docs/plans/system-hud/chain.md`), archive gate (`docs/testing-tiers.md`
 * tier 4). Written now, against the UI the implementation commit `b6e83a1`
 * actually built — never in the red phase (red-phase Playwright written
 * blind was half of this repo's e2e reds).
 *
 * THE WALK, verbatim from RULING 9's "Consequence for this link's journey"
 * (`add-vitals-strip-rulings.md`) plus QA's two BLOCKED rows:
 *
 *   1. Dock at a station and read all five strip cells.
 *   2. Switch the acting fleet via the chevron — same-system, then
 *      cross-system.
 *   3. Commit a burn and watch the pill flip to the under-way state and
 *      COUNT DOWN (assert it moves, not that it holds one value).
 *   4. The 1280×720 viewport check with the command column, the camera
 *      cluster, and `sightings-unavailable` (with its retry affordance) all
 *      present at once — QA's two BLOCKED rows under *The Strip Is
 *      Laptop-First and Never Overflows the View*.
 *
 * WHY ONE FLEET IS ENOUGH FOR THE CHEVRON'S "CROSS-SYSTEM" LEG. Nothing in
 * this build mints a second hull for a corporation — `SeedFleet`'s only
 * production call site is `corporations.Spawn` (grepped before writing this
 * file). `system-console`'s own spec anticipates exactly this shape:
 * *A sole owned fleet leaves the chevron's menu with one entry* — "choosing
 * it changes nothing". The CROSS-system leg does not need a second fleet
 * either: the chevron lists `ownedFleets` UNFILTERED by the open system
 * (impl contract §7.2), so navigating the browser directly to a system the
 * fleet is NOT in, then choosing that fleet from the menu, is the real
 * *Choosing a fleet in another system navigates there* path — no fixture,
 * no second corporation, just the browser sitting somewhere the fleet isn't.
 *
 * WHY THE BURN TARGET IS THE HOME GATE, NOT A MINEABLE BODY. A lane gate
 * sits at the system's rim (`jump-commit.spec.ts`'s own established
 * rationale), which is both a real, longer burn — giving the "moves, not
 * holds" countdown assertion real margin before the fleet docks and the
 * `vitals-pill-eta` figure disappears — and lets this leg double as live
 * coverage of *A burn toward a lane gate names the gate's destination
 * system*, a system-console pill scenario this suite would otherwise leave
 * to vitest's mocked derivation alone.
 *
 * WHY `/v1/sightings` IS ROUTE-INTERCEPTED RATHER THAN LEFT TO CHANCE. The
 * viewport scenario *No other floating surface covers a strip cell* needs
 * `sightings-unavailable` on screen at the same instant as the command
 * column and the camera cluster — three floating surfaces at once, per QA's
 * BLOCKED rows. `ghostFeed.isError` (`SystemSpaceView.tsx`) is the only
 * lever, and it is a real network failure, not a hand-built DOM fixture:
 * `page.route` returns a real 500 to a real fetch, and the real
 * `useSightings`/React Query stack decides `isError` on its own (500s are
 * excluded from `lib/query-client.ts`'s retry policy, so this resolves
 * within one round trip).
 *
 * KNOWN RESIDUE THIS RUN MAY HIT (read before treating any red as a new
 * defect): `defect-station-order-500.md` — an intermittent (~2%) bodyless
 * 500 on a burn ordered TO A STATION, which this journey's first leg does.
 * `defect-post-sale-departure-burn-409s.md` and
 * `defect-burn-cancels-running-mine.md` do not apply here — this journey
 * never sells and never mines, the two preconditions both defects need.
 */
const cfg = resolveE2EConfig()

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 720 },
})

// One full-length burn to the home station (the 500-defect's own site,
// budgeted like `refuel-commit.spec.ts`/`slice.spec.ts`), plus a
// deliberately-not-awaited-to-completion burn to the rim gate, a route
// intercept, and a reload. Generous, not tight: a hang budget that holds at any
// scale, including an unwarped E2E_WORLD_TIME_SCALE=1 run. The stack itself
// runs the world warped (`backend-stack.ts`).
test.setTimeout(900_000)

/**
 * RULING 45.1 (add-vitals-strip rulings) — the third gate run CAPTURES the
 * console instead of inferring what the Next.js dev-overlay's "2 Issues"
 * badge counted. Registered per-test in `beforeEach` below and printed at the
 * end of the journey, pass or fail, in `afterEach`, prefixed
 * `[journey-console]` so it is greppable in the run log. Purely
 * observational: no assertion here, and nothing about the journey's own
 * expectations changes.
 */
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

  // RULING 45.3 — belt-and-braces for the one-run budget: hide the dev
  // overlay's host element test-side, independent of the `ENV=test` config
  // gate (RULING 44), via an init script so it survives every navigation in
  // this spec. This cannot hide anything from the record above — the
  // console/pageerror capture just above is wired independently of the
  // overlay's DOM.
  await page.addInitScript(() => {
    // RULING 48 — `addInitScript` runs before the document element exists,
    // so `document.head`/`document.documentElement` are both `null` at this
    // point; inject immediately when a parent is already there, otherwise
    // wait for `DOMContentLoaded`. Same one-line style, same purpose.
    const inject = () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal { display: none !important }'
      document.head.appendChild(style)
    }
    if (document.head) {
      inject()
    } else {
      document.addEventListener('DOMContentLoaded', inject)
    }
  })
})

/**
 * FULL-AUTO RULING 3 (`fix-world-time-render-loop-rulings.md`) — the update-depth
 * diagnostic is a HARD assertion, not an observation: `system-space-view`'s
 * *The animating view raises no update-depth diagnostic* (THEN "no update-depth
 * or nested-update diagnostic is written to the browser console") and task 5.3's
 * acceptance ("zero `Maximum update depth` lines in `[journey-console]`"). Same
 * pattern as `vitest`'s own guard in `SystemSpaceView.render-loop.test.tsx`
 * (`/Maximum update depth|nested update/i`). SDET-added to this spec before the
 * gate run. It lives in `afterEach` so it holds even when an earlier step failed
 * first, and prints the count on every run so the figure across `--repeat-each`
 * repeats is greppable: `[journey-console] update-depth lines: N`.
 */
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

/**
 * Prefers a served gate CONFIRMED off-screen at the default framing — same
 * technique as `jump-commit.spec.ts`/`scan-lane-transit-fizzle.spec.ts`'s
 * `pickFarGate`: farther means a longer burn, long enough to read the
 * countdown twice before the fleet docks and `vitals-pill-eta` disappears.
 * Falls back to `gates[0]` if none is confirmed off-screen.
 */
async function pickFarGate(page: Page, gates: ServedGate[]): Promise<ServedGate> {
  for (const g of gates) {
    if (!g.id) continue
    if ((await page.getByTestId(`offscreen-${g.id}`).count()) > 0) return g
  }
  return gates[0]!
}

/** A rectangle in CSS px, as Playwright's `boundingBox()` returns it. */
interface Box {
  x: number
  y: number
  width: number
  height: number
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function insideViewport(box: Box, width: number, height: number): boolean {
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height
}

async function box(page: Page, testId: string): Promise<Box> {
  const el = page.getByTestId(testId).first()
  await expect(el, `${testId} must be visible to measure its box`).toBeVisible({ timeout: 20_000 })
  const b = await el.boundingBox()
  expect(b, `${testId} produced no bounding box (display:none or detached)`).not.toBeNull()
  return b!
}

/**
 * SDET-added for *No other floating surface covers a strip cell* — THEN "every
 * such surface remains fully visible and ... activatable itself". For each
 * interactive descendant of the surface that lies inside both the surface and
 * the viewport, the topmost element at its centre point must be that control
 * (or part of it), i.e. a pointer would actually reach it. A surface with no
 * interactive descendant has nothing to activate beyond being visible and
 * uncovered, which the viewport and overlap assertions already prove.
 */
async function activatableControls(
  page: Page,
  testId: string,
): Promise<{ checked: number; blocked: string[] }> {
  return page.getByTestId(testId).first().evaluate((surface) => {
    const sel =
      'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
    const blocked: string[] = []
    let checked = 0
    for (const el of Array.from(surface.querySelectorAll(sel))) {
      let r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      // add-console-dock (QA M3): a control the surface scrolls out of sight (the command
      // column is a scrolling surface since the dock moved its foot) is scrolled into view
      // WITHIN its surface before it is hit-tested; what is asserted is unchanged.
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const sr = surface.getBoundingClientRect()
      r = el.getBoundingClientRect()
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) continue
      if (cx < sr.x || cx > sr.x + sr.width || cy < sr.y || cy > sr.y + sr.height) continue
      checked++
      const hit = document.elementFromPoint(cx, cy)
      if (!hit || !(el.contains(hit) || hit.contains(el))) {
        const label = el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.tagName
        const by = hit ? (hit.getAttribute('data-testid') ?? hit.tagName) : 'nothing'
        blocked.push(`${label} (covered by ${by})`)
      }
    }
    return { checked, blocked }
  })
}

test.describe('the vitals strip — dock, switch, burn, and never overflow the view', () => {
  test('reads all five cells docked, switches the acting fleet both ways, counts down a burn, and clears every floating surface at 1280×720', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)

    // 1. Sign up and wake onto the home system.
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E Vitals', 'vitals')

    const home = await interiors.get(homeSystemId)
    expect(home, `no interior read for ${homeSystemId} was captured off the wire`).toBeTruthy()

    const stationId = stationFeatureId(home!)
    expect(
      stationId,
      `home ${homeSystemId} served no body of type "station" — every spawn home is ` +
        `provisioned with exactly one (stations M11), so a miss here is a regression`,
    ).toBeTruthy()

    const gates = home!.laneGates ?? []
    expect(gates.length, 'the home system interior served no lane-gate body').toBeGreaterThan(0)
    const gate = await pickFarGate(page, gates)
    expect(gate.id, `the gate toward ${gate.destSystemId} was served with no body id`).toBeTruthy()

    // The strip is ALWAYS present, before anything else happens
    // (`system-console` R1) — asserted once, at the earliest possible point.
    await expect(page.getByTestId('vitals-strip')).toBeVisible({ timeout: 20_000 })

    // -----------------------------------------------------------------
    // Step 1 — dock at a station, read all five strip cells.
    // -----------------------------------------------------------------

    await selectBody(page, stationId!)
    await burnToSelectionAndDock(page, fleetId, 600_000)

    // Scenario: A docked fleet at a feature names its type and served id.
    await expect(page.getByTestId('vitals-state-pill'), 'the pill must read the docked state').toContainText(
      /docked/i,
      { timeout: 20_000 },
    )
    await expect(page.getByTestId('vitals-state-pill')).toContainText(new RegExp(stationId!), {
      timeout: 20_000,
    })

    // Cell 1 — fleet identity. Plain text, never a `<Figure>` (an id is not
    // a figure) — the served fleet id, verbatim.
    await expect(page.getByTestId('vitals-fleet-id')).toHaveText(fleetId)

    // Cell 2 — fuel with range, both through `data-raw`/`data-unit`, never
    // rendered copy.
    const fuelEl = page.getByTestId('vitals-fuel-tons')
    const fuelTons = await digits(page, 'vitals-fuel-tons')
    expect(Number.isFinite(fuelTons) && fuelTons >= 0, 'held fuel must be a finite, non-negative tonnage').toBe(
      true,
    )
    expect(await fuelEl.getAttribute('data-unit')).toBe('tons')
    const rangeVal = await digits(page, 'vitals-fuel-range')
    expect(Number.isFinite(rangeVal), 'estimated range must be a finite figure').toBe(true)
    expect(await page.getByTestId('vitals-fuel-range').getAttribute('data-unit')).toBe('range')
    // Scenario: The gauge's no-data state is DOM-distinguishable from a
    // sub-pixel fill — a freshly-fuelled hull reads `filled`, never `no-data`.
    expect(await page.getByTestId('fuel-gauge').getAttribute('data-gauge-state')).toBe('filled')

    // Cell 3 — the kind-segmented hold. `fuel` is an ordinary cargo kind
    // (impl contract §5.4), so a fresh, unmined hull already segments it —
    // no mining run is needed to prove the segmentation is legible.
    const usedRaw = await digits(page, 'hold-capacity-used')
    const totalRaw = await digits(page, 'hold-capacity-total')
    const freeRaw = await digits(page, 'hold-free')
    expect(Number.isFinite(usedRaw) && Number.isFinite(totalRaw) && Number.isFinite(freeRaw)).toBe(true)
    expect(usedRaw + freeRaw, 'used + free must equal the served capacity').toBeCloseTo(totalRaw, 6)
    const fuelHoldTons = await holdKindTons(page, 'fuel')
    expect(fuelHoldTons, 'the fuel kind must appear as its own segmented hold row').toBeGreaterThan(0)
    expect(await page.getByTestId('hold-gauge').getAttribute('data-gauge-state')).toBe('filled')

    // Cell 4 — credits, through `balance-value`/`balance-figure`.
    expect(await page.getByTestId('balance-value').getAttribute('data-available')).toBe('true')
    const creditsRaw = await digits(page, 'balance-value')
    expect(Number.isFinite(creditsRaw), 'the credit balance must be a finite figure').toBe(true)
    expect(await page.getByTestId('balance-figure').getAttribute('data-unit')).toBe('credits')

    // Cell 5 — the world clock.
    const clockRaw = await digits(page, 'vitals-clock-stamp')
    expect(Number.isFinite(clockRaw), 'the world clock must be a finite instant once anything has been served').toBe(
      true,
    )
    expect(await page.getByTestId('vitals-clock-stamp').getAttribute('data-unit')).toBe('world-ms-instant')

    // -----------------------------------------------------------------
    // Step 2a — the chevron, same-system case (`system-console`: *Choosing
    // a fleet in this system sets it acting* / *A sole owned fleet leaves
    // the chevron's menu with one entry*).
    // -----------------------------------------------------------------

    await page.getByTestId('vitals-fleet-chevron').click()
    const menu = page.getByTestId('vitals-fleet-menu')
    await expect(menu).toBeVisible({ timeout: 10_000 })
    await expect(menu).toHaveAttribute('role', 'menu')
    const menuItems = menu.locator('[role="menuitem"]')
    await expect(menuItems, 'a sole owned fleet leaves the menu with exactly one entry').toHaveCount(1)
    await expect(page.getByTestId(`vitals-fleet-menu-item-${fleetId}`)).toBeVisible()

    await page.getByTestId(`vitals-fleet-menu-item-${fleetId}`).click()

    // No navigation, and it remains acting.
    await expect(menu).toBeHidden({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe(`/systems/${homeSystemId}`)
    await expect(page.getByTestId('vitals-fleet-id')).toHaveText(fleetId)
    await expect(page.getByTestId('vitals-state-pill')).toContainText(/docked/i)

    // -----------------------------------------------------------------
    // Step 2b — the chevron, cross-system case (`system-console`: *Choosing
    // a fleet in another system navigates there*). Navigate the browser
    // straight to a system the fleet is NOT in — the fleet stays home, so
    // the chevron's one entry now names an elsewhere fleet.
    // -----------------------------------------------------------------

    await page.goto(`/systems/${gate.destSystemId}`)
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('space-canvas-region')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('space-loading')).toBeHidden({ timeout: 60_000 })
    await expect(page.getByTestId('vitals-strip')).toBeVisible({ timeout: 20_000 })

    // Scenario: The chevron survives the no-acting-fleet state.
    await expect(
      page.getByTestId('vitals-fleet-id'),
      'no owned fleet is present in this foreign system, so identity reads absent',
    ).toHaveText('—')

    await page.getByTestId('vitals-fleet-chevron').click()
    await expect(page.getByTestId('vitals-fleet-menu')).toBeVisible({ timeout: 10_000 })
    const elsewhereItem = page.getByTestId(`vitals-fleet-menu-item-${fleetId}`)
    await expect(elsewhereItem, 'the menu still lists every owned fleet, regardless of system').toBeVisible()
    // Scenario: A menu entry names its fleet's system before it navigates.
    const entryText = (await elsewhereItem.textContent()) ?? ''
    expect(entryText, "the entry must name the fleet's own served id").toContain(fleetId)

    const crossNav = page.waitForURL(`**/systems/${homeSystemId}`, { timeout: 20_000 })
    await elsewhereItem.click()
    await crossNav

    expect(new URL(page.url()).pathname).toBe(`/systems/${homeSystemId}`)
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('vitals-strip')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('vitals-fleet-id')).toHaveText(fleetId)
    // The navigation itself changed nothing about the fleet's own state.
    await expect(page.getByTestId('vitals-state-pill')).toContainText(/docked/i)

    // -----------------------------------------------------------------
    // Step 3 — commit a burn, watch the pill flip to under way, and watch
    // the countdown MOVE (`system-console`: *The countdown advances
    // between reads*) — not merely that it holds one value.
    // -----------------------------------------------------------------

    await selectBody(page, gate.id!)
    await expect(page.getByTestId('gate-facts')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('preview-panel')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('burn-button').click()

    // Scenario: A burn toward a lane gate names the gate's destination
    // system.
    await expect(page.getByTestId('vitals-state-pill'), 'the pill must flip to the under-way state').toContainText(
      /under way/i,
      { timeout: 30_000 },
    )
    await expect(page.getByTestId('vitals-fuel-draining'), 'a burning fleet drains fuel').toBeVisible({
      timeout: 10_000,
    })

    const etaEl = page.getByTestId('vitals-pill-eta')
    await expect(etaEl).toBeVisible({ timeout: 10_000 })
    const firstEta = await digits(page, 'vitals-pill-eta')
    expect(Number.isFinite(firstEta), 'the countdown must be a finite world-ms span').toBe(true)

    await expect
      .poll(
        async () => {
          // The fleet may dock before the poll catches a second reading on a
          // very short burn; treat "no [data-raw] because the pill left the
          // under-way state" as "still waiting", not as a hard failure — the
          // FIRST successful decreasing read is what proves the requirement.
          const stillBurning = await page.getByTestId('vitals-pill-eta').count()
          if (stillBurning === 0) return firstEta
          return digits(page, 'vitals-pill-eta')
        },
        {
          timeout: 60_000,
          intervals: [250],
          message: 'the pill countdown never decreased between reads while the fleet was burning',
        },
      )
      .toBeLessThan(firstEta)

    // -----------------------------------------------------------------
    // Step 4 — the 1280×720 viewport check, every floating surface present
    // at once (QA's two BLOCKED rows under *The Strip Is Laptop-First and
    // Never Overflows the View*).
    // -----------------------------------------------------------------

    await page.route('**/v1/sightings**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced by e2e"}' }),
    )
    await page.reload()
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('space-canvas-region')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('space-loading')).toBeHidden({ timeout: 60_000 })
    await expect(page.getByTestId('vitals-strip')).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByTestId('sightings-unavailable'),
      "the ghost layer's own read must have failed and surfaced its own error, independent of every other surface",
    ).toBeVisible({ timeout: 20_000 })

    const retryButton = page.getByTestId('sightings-unavailable').getByRole('button', { name: 'Retry' })
    await expect(retryButton, 'the retry affordance must remain visible and activatable').toBeVisible()
    await expect(retryButton).toBeEnabled()

    // The three relocated/floating surfaces. `space-fleet-panel` and
    // `preview-panel` are the command column's own two panels (contract §9);
    // both always mount, fleet-selected or not.
    const commandColumnA = await box(page, 'space-fleet-panel')
    const commandColumnB = await box(page, 'preview-panel')
    const cameraCluster = await box(page, 'space-camera-controls')
    const sightingsBox = await box(page, 'sightings-unavailable')
    // RULING 46 (add-vitals-strip rulings) — `FloatingNav` is mounted
    // app-wide by `frontend/components/layout-wrapper.tsx:108` for every
    // authenticated route; it is the surface that failed this gate's run 1.
    // Re-read for add-console-dock (task 3.4), dock COLLAPSED (this leg never
    // expands it): the nav and the sightings-unavailable card now take their
    // 72 px foot from `CONSOLE_DOCK_LANE_LEFT_CENTER` (3.5rem + 1rem), the
    // same 72 px as the old `bottom-[4.5rem]`; the camera cluster moved up to
    // 100 px; the command column's foot moved to 140 px (564 px tall at this
    // viewport) and carries `space-command-column`. This leg measures the
    // column's two panels, the cluster, the card and the nav, never the
    // column's own box, so no assertion below depends on a moved edge and none
    // was edited. The collapsed dock's own geometry is the dock journey's.
    const floatingNav = await box(page, 'floating-nav')

    const floatingSurfaces: [string, Box][] = [
      ['space-fleet-panel', commandColumnA],
      ['preview-panel', commandColumnB],
      ['space-camera-controls', cameraCluster],
      ['sightings-unavailable', sightingsBox],
      ['floating-nav', floatingNav],
    ]

    // Scenario: No other floating surface covers a strip cell — "every such
    // surface remains fully visible" itself, at this viewport.
    for (const [name, b] of floatingSurfaces) {
      expect(insideViewport(b, 1280, 720), `${name} must itself stay inside the 1280×720 viewport`).toBe(true)
    }

    // ... and "activatable itself": every control inside each surface is
    // reachable by a pointer, not covered by another surface or a strip cell.
    for (const [name] of floatingSurfaces) {
      const { checked, blocked } = await activatableControls(page, name)
      console.log(`[journey-viewport] ${name}: ${checked} interactive control(s) hit-tested`)
      expect(blocked, `${name} has control(s) a pointer cannot reach`).toEqual([])
    }

    const cellTestIds = [
      'vitals-fleet-cell',
      'vitals-fuel-cell',
      'vitals-hold-cell',
      'vitals-credits-cell',
      'vitals-clock-cell',
    ]

    for (const cellId of cellTestIds) {
      const cellBox = await box(page, cellId)

      // Scenario: Every cell is inside the viewport at 1280×720 — "rendered,
      // non-empty" in this post-reload, all-surfaces-present state.
      const cellText = ((await page.getByTestId(cellId).first().textContent()) ?? '').trim()
      expect(cellText.length, `${cellId} must render non-empty content at 1280×720`).toBeGreaterThan(0)

      // Scenario: Every cell is inside the viewport at 1280×720.
      expect(insideViewport(cellBox, 1280, 720), `${cellId} must be fully inside the 1280×720 viewport`).toBe(
        true,
      )

      // Scenario: No other floating surface covers a strip cell.
      for (const [name, surfaceBox] of floatingSurfaces) {
        expect(overlaps(cellBox, surfaceBox), `${cellId} must not be overlapped by ${name}`).toBe(false)
      }
    }
  })
})
