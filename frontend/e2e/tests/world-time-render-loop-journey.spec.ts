import { test, expect, type Page } from '@playwright/test'

/**
 * The `fix-world-time-render-loop` journey — openspec change
 * `fix-world-time-render-loop`, tasks.md 5.3a, archive gate
 * (`docs/testing-tiers.md` tier 4). Written now, against the UI the
 * implementation commit `3dc56da` actually built — never in the red phase.
 *
 * SCOPE. This spec covers exactly task 5.3a's gap, not the whole change.
 * `SystemSpaceView`'s own cross-system-navigation-while-animating claim and
 * its update-depth diagnostic are `add-vitals-strip`'s journey
 * (`vitals-strip-journey.spec.ts`, tasks.md 5.3, `--repeat-each 20`) — a
 * SEPARATE, already-written spec this file does not duplicate or replace.
 * What THIS file proves is the two `galaxy-view` ADDED scenarios QA's
 * acceptance matrix left `BLOCKED` (`fix-world-time-render-loop-qa.md`,
 * rows #17/#18), because design.md Decision 5 states plainly why no unit
 * test can: `GalaxyView.test.tsx` mocks `next/navigation`, and "a mocked
 * router never enters React's scheduler and cannot be starved" — only a
 * real browser, with a real router and a real animating canvas, proves a
 * navigation actually arrives instead of merely being requested.
 *
 *   - *Scenario: A drill-in issued while the view animates arrives*
 *     (`specs/galaxy-view/spec.md`) — "Enter system" on a selected node
 *     commits `router.push('/systems/:id')`; THEN the browser arrives at
 *     that route within 20 seconds.
 *   - *Scenario: A roster burn redirect from the galaxy view commits while
 *     the graph animates* — the roster's "Burn" command on this view never
 *     commits an order (`GalaxyView.tsx`'s `handleBurn`: a toast plus
 *     `router.push('/systems/:id')`, because a burn target can only be
 *     chosen from inside a system's own space view); THEN the browser
 *     arrives at that fleet's system route within 20 seconds.
 *
 * WHY THE SHARED (ALREADY-WOKEN) SESSION IS ENOUGH, NO FRESH SIGNUP. Every
 * other journey in this suite (`wakeNewCorp`) signs up fresh because it needs
 * to prove something about the WAKE flow or wants an isolated hull to mutate
 * (burn, mine, sell). Neither scenario here needs either: `handleBurn` is
 * read-only navigation — it never calls a mutation, so it cannot corrupt the
 * shared account's fleet state for a spec that runs after this one — and the
 * drill-in leg only needs A system to exist and A fleet to belong to it,
 * both of which `auth.setup.ts` already guarantees for the shared,
 * once-woken session every spec in this suite restores
 * (`playwright.config.ts`'s `storageState: STORAGE_STATE`). Reusing it is
 * the fixture-sharing the role's own rules ask for: no fresh provisioning
 * where a read-only walk doesn't need one (`renderer-availability.spec.ts`
 * and `smoke.spec.ts` already establish this pattern for the galaxy view).
 *
 * WHY NO EXPLICIT "WAIT FOR ANIMATION" STEP. The galaxy's renderer
 * (`react-force-graph-3d`) runs its own `requestAnimationFrame` loop
 * unconditionally from the moment `<GalaxyGraph>` mounts for as long as the
 * render guard reports `'live'` — nothing in this walk ever suspends it
 * (`GalaxyView.tsx`'s `guard.status`). So "the view is mounted and
 * animating" holds for the whole of every real-browser wait this spec
 * already performs (the canvas mount wait, the roster read, the click
 * round trips) — an extra synchronization sleep would prove nothing an
 * ordinary web-first `expect(...).toBeVisible()` wait doesn't already
 * imply, and this suite's determinism rules forbid `waitForTimeout` used as
 * one.
 *
 * WHY THE 20-SECOND `waitForURL` BUDGET IS NOT A CHOICE. Both scenarios'
 * THEN clauses name it verbatim ("arrives... within 20 seconds"), quoting
 * `defect-cross-system-chevron-nav-stall.md`'s own measured ceiling
 * (design.md's ADDED requirement, `specs/galaxy-view/spec.md`) — "not to be
 * relaxed". Never raised here either.
 *
 * THE CONSOLE ASSERTION. `[journey-console]` capture is the same mechanism
 * `vitals-strip-journey.spec.ts` established (RULING 45.1,
 * `add-vitals-strip-rulings.md`) for `SystemSpaceView`'s own update-depth
 * grep; there is no shared helper to import (it has never been extracted),
 * so the pattern is duplicated here rather than invented differently.
 * Unlike that spec's purely observational capture, this file's delegation
 * requires an actual assertion: zero `Maximum update depth` lines across
 * the whole galaxy-view walk (SDET-added — the coverage table records no
 * discrete galaxy-view scenario for this diagnostic; `SystemSpaceView`'s
 * own instance of it is `system-space-view`'s *The animating view raises no
 * update-depth diagnostic*, covered separately by 5.3's `--repeat-each 20`
 * run).
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
})

test.afterEach(() => {
  console.log(
    `[journey-console] ${journeyConsoleBuffer.length} browser console error/warning/pageerror entr${
      journeyConsoleBuffer.length === 1 ? 'y' : 'ies'
    } captured this run`,
  )
  for (const entry of journeyConsoleBuffer) {
    console.log(`[journey-console] ${entry.kind} at ${entry.url}: ${entry.text}`)
  }
})

interface FleetListEnvelope {
  fleets: Array<{ id: string; systemId: string }>
}

/**
 * Waits for the next `GET /v1/fleets` response — the own-fleets read every
 * mount of the galaxy view issues (`useMyFleets`) — and returns its parsed
 * body. This is the wire source of truth for a fleet's `systemId`; nothing
 * here reconstructs one from a testid or a route the view has not navigated
 * to yet (the same discipline `helpers/space-view.ts`'s `captureInteriors`
 * documents for interior reads). MUST be called before the navigation that
 * triggers the fetch, so the listener is registered before the request
 * fires.
 */
function waitForFleetList(page: Page): Promise<FleetListEnvelope> {
  return page
    .waitForResponse(
      (res) => new URL(res.url()).pathname === '/v1/fleets' && res.request().method() === 'GET' && res.ok(),
      { timeout: 20_000 },
    )
    .then((res) => res.json() as Promise<FleetListEnvelope>)
}

/** Loads the galaxy view fresh and waits for its animating canvas + roster. */
async function loadAnimatingGalaxyView(page: Page): Promise<FleetListEnvelope> {
  const fleetList = waitForFleetList(page)
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
  await expect(page.getByTestId('galaxy-view')).toBeVisible({ timeout: 20_000 })
  // The canvas element itself, not just the wrapping testid — a real,
  // running `react-force-graph-3d` renderer, the same wait
  // `renderer-availability.spec.ts` uses (its own hardening note: the
  // wrapper testid can appear a beat before FG3D's canvas child does).
  await page.waitForSelector('[data-testid="galaxy-graph"] canvas', { timeout: 20_000 })
  await expect(page.getByTestId('fleet-roster')).toBeVisible({ timeout: 20_000 })
  return fleetList
}

test.describe('the galaxy view — navigations survive the frame loop', () => {
  test('a drill-in and a roster burn redirect both arrive while the graph animates', async ({ page }) => {
    // -----------------------------------------------------------------
    // Leg 1 — the drill-in. Select an owned fleet's home system via the
    // roster row (never the 3D canvas — picking a force-graph node through
    // Playwright is exactly the kind of orbiting-target flake
    // `helpers/space-view.ts`'s `selectBody` already documents avoiding for
    // the space view's own marks; the roster row is a real, stable DOM
    // affordance for "show me this system" that this view itself exposes),
    // then invoke "Enter system".
    // -----------------------------------------------------------------
    const fleetList1 = await loadAnimatingGalaxyView(page)

    const rows1 = page.getByTestId('fleet-roster').locator('[data-testid^="fleet-row-"]')
    await expect(rows1.first(), 'the shared woken session must have at least one owned fleet').toBeVisible({
      timeout: 20_000,
    })
    const fleetId1 = (await rows1.first().getAttribute('data-testid'))!.replace('fleet-row-', '')
    const fleet1 = (await fleetList1).fleets.find((f) => f.id === fleetId1)
    expect(fleet1, `GET /v1/fleets served no entry for ${fleetId1}`).toBeTruthy()
    const homeSystemId = fleet1!.systemId

    await test.step('Scenario: A drill-in issued while the view animates arrives', async () => {
      // Row click -> handleShowFleet: selects the fleet's system and glides
      // the camera to it (no navigation) — sets up the Inspector's
      // "Enter system" affordance without touching the canvas.
      await rows1.first().click()
      await expect(rows1.first()).toHaveAttribute('data-active', 'true')
      const enterButton = page.getByTestId('enter-system-button')
      await expect(enterButton, 'a selected system must offer the drill-in control').toBeVisible({
        timeout: 20_000,
      })

      // The 20s ceiling is the requirement's own stated budget
      // (`specs/galaxy-view/spec.md`), not a suite default — never raised.
      const drillInNav = page.waitForURL(`**/systems/${homeSystemId}`, { timeout: 20_000 })
      await enterButton.click()
      await drillInNav

      // Arrival, not merely a matched URL: the destination view actually
      // mounted.
      expect(new URL(page.url()).pathname).toBe(`/systems/${homeSystemId}`)
      await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })
    })

    // -----------------------------------------------------------------
    // Leg 2 — the roster burn redirect. Reload the galaxy view fresh (a new
    // mount, a newly-animating canvas, task 5.3a's own "while the graph
    // animates" condition) and invoke the roster's "Burn" command directly
    // — no selection needed, `rosterCommandVisibility` offers it
    // unconditionally (`components/fleet/roster-commands.ts`). This never
    // commits an order: `GalaxyView.tsx`'s `handleBurn` only toasts and
    // redirects, so the fleet's own state (and therefore the URL this
    // redirect targets) is unaffected by leg 1 having run first.
    // -----------------------------------------------------------------
    const fleetList2 = await loadAnimatingGalaxyView(page)

    const rows2 = page.getByTestId('fleet-roster').locator('[data-testid^="fleet-row-"]')
    await expect(rows2.first()).toBeVisible({ timeout: 20_000 })
    const fleetId2 = (await rows2.first().getAttribute('data-testid'))!.replace('fleet-row-', '')
    const fleet2 = (await fleetList2).fleets.find((f) => f.id === fleetId2)
    expect(fleet2, `GET /v1/fleets served no entry for ${fleetId2}`).toBeTruthy()
    const fleetSystemId = fleet2!.systemId

    await test.step('Scenario: A roster burn redirect from the galaxy view commits while the graph animates', async () => {
      const burnButton = page.getByTestId(`fleet-cmd-burn-${fleetId2}`)
      await expect(burnButton, "the roster's Burn command must be offered with no prior selection").toBeVisible({
        timeout: 20_000,
      })

      const burnNav = page.waitForURL(`**/systems/${fleetSystemId}`, { timeout: 20_000 })
      await burnButton.click()
      await burnNav

      expect(new URL(page.url()).pathname).toBe(`/systems/${fleetSystemId}`)
      await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })
    })

    // -----------------------------------------------------------------
    // Cross-cutting: no React "Maximum update depth exceeded" diagnostic
    // anywhere across either leg's animating walk (SDET-added; see file
    // header for why this is not a named spec scenario here).
    // -----------------------------------------------------------------
    const updateDepthLines = journeyConsoleBuffer.filter((e) => /maximum update depth/i.test(e.text))
    expect(
      updateDepthLines,
      `React update-depth diagnostic(s) captured during the galaxy-view walk: ${JSON.stringify(
        updateDepthLines,
        null,
        2,
      )}`,
    ).toEqual([])
  })
})
