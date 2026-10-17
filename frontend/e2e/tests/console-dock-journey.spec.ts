import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { captureInteriors, wakeNewCorp, type ServedInterior } from '../helpers/space-view'
import { captureCorporationId, captureScanTargets, commitScan, seedSightingFixture } from '../helpers/scan-fixtures'

/**
 * The console-dock journey — openspec change `add-console-dock` (link 2b-i of
 * `docs/plans/system-hud/chain.md`, task 5.2), archive gate
 * (`docs/testing-tiers.md` tier 4). Written against the UI built at `e5e9eff`
 * (`ConsoleDock.tsx`, `SystemSpaceView.tsx`, `console-dock-layout.ts`), NOT run
 * by its author. The contract is `docs/handoffs/add-console-dock-impl-contract.md`
 * section 9.3; the record is `docs/handoffs/add-console-dock-integrity.md`.
 *
 * THE FLOATING SURFACES (the five the spec's geometry requirement names):
 * the Objects browser (measured by `live-object-browser`),
 * the sightings-unavailable card, the camera cluster, `FloatingNav` and the
 * "Console" control. Transient toasts, hover fact cards and the off-screen
 * reach chips are not covered.
 *
 * FIXTURE: one corporation, provisioned ONCE (`test.beforeAll`), three
 * sighting records seeded into its pile, then a reload so the log's first read
 * sees them. The system-filtered sightings read (`GET /v1/sightings?systemId=`)
 * is failed by a route PREDICATE for the whole file, so the card is up for both
 * geometry legs; the log's own read carries no `systemId` and keeps working.
 * Those forced 500s appear in `[journey-http]` and the console capture and are
 * expected. No ghost is drawn in this journey as a result: the ghost-first
 * activation (adversary r1 m5) is `scan-journey.spec.ts`'s (task 3.2).
 *
 * LEGS (each ends PASSED / UNTESTED / FAILED; `[journey-leg] <name>: <outcome>`
 * prints with its figures; a closing test fails the run on any FAILED and on any
 * must-PASS leg that is not PASSED). Legs record their own FAILED outcome instead
 * of throwing so one red leg does not skip the rest of a serial file.
 *
 * SIZING (`docs/handoffs/add-burn-cost-overlay-journey.md`): world scale 5. Only
 * leg 13 waits on the simulation (a focused sweep on the nearest served target,
 * budgeted at 25 s of its test's 60). No leg waits for a burn. NO TIMEOUT IS
 * RAISED and there is no `test.setTimeout`.
 *
 * keep-console-tab-content-mounted (3.6), header note only: this file's fixture
 * still holds (a reload gives a cold cache, and the route predicate fails only
 * the system-filtered read, sparing the unfiltered one the log now makes at view
 * open); its Tab walks skip a hidden log (collapsed content is `hidden`, not in
 * the tab order); and leg 13's deferred assertion (whether the settled sweep's
 * record is listed) belongs to `keep-console-tab-content-mounted`'s journey
 * (5.2), not upgraded here: one journey spec per change.
 *
 * ADVERSARY NOTES THAT BIND THIS FILE: r1 B1: leg 13 asserts only that the dock
 * is expanded, the Log tab selected and focused and the log shown; whether the
 * settled sweep's new record is listed is LOGGED, never asserted
 * (`keep-console-tab-content-mounted`'s). r2-M1: containment AND all surfaces,
 * the card induced by failing only the system-filtered read, its Retry
 * hit-tested.
 */
const cfg = resolveE2EConfig()

const VIEWPORT = { width: 1280, height: 720 }
/** The Tab walks stop here: a bounded walk never loops over the page forever. */
const MAX_TABS = 90
/** Leg 13's whole wall budget (the contract's 25 s of the test's 60 s). */
const SWEEP_BUDGET_MS = 25_000
/** World scale of the e2e stack (`frontend/e2e/setup/backend-stack.ts`). */
const WORLD_SCALE = 5
/** The settle reads and the 400 ms cushion on top of the flight. */
const SETTLE_CUSHION_MS = 3_000

test.describe.configure({ mode: 'serial' })

interface Box {
  x: number
  y: number
  width: number
  height: number
}
interface JourneyConsoleEntry {
  kind: 'pageerror' | 'console-error' | 'console-warning'
  text: string
  url: string
}
interface HttpError {
  method: string
  url: string
  status: number
  body: string
}

let context: BrowserContext
let page: Page
let homeSystemId = ''
let fleetId = ''
let home: ServedInterior
const consoleBuffer: JourneyConsoleEntry[] = []
let consoleCursor = 0
const httpErrors: HttpError[] = []
let httpCursor = 0
let seededRecordIds: string[] = []
const scanTargetsByFleet: { map: ReturnType<typeof captureScanTargets> | null } = { map: null }
/** Leg 5's two halves: the collapsed control's box (leg 1) and the expanded controls' failures (leg 7). */
let openBoxCollapsed: Box | null = null
const targets24ExpandedFailures: string[] = []
/** Set only once leg 7 has actually measured the Log tab AND the collapse control expanded. */
let measuredExpanded = false

// ---------------------------------------------------------------------------
// Leg accounting (PASSED / UNTESTED / FAILED), stable names for QA
// ---------------------------------------------------------------------------

const LEG_NAMES = [
  'opens-collapsed',
  'hidden-beats-flex',
  'strip-row-56',
  'geometry-collapsed',
  'targets-24',
  'tab-walk-collapsed',
  'expand-collapse-keyboard',
  'reload-collapsed',
  'log-panel-origin',
  'scroll-leg',
  'geometry-expanded',
  'tab-walk-expanded',
  'report-link',
  'galaxy-nav-72',
  'return-collapsed',
  'other-system-collapsed',
] as const
type LegName = (typeof LEG_NAMES)[number]
/** Legs allowed to end UNTESTED (the fixture may not be able to arrange them). */
const MAY_BE_UNTESTED: LegName[] = ['report-link', 'other-system-collapsed']
const MUST_PASS: LegName[] = LEG_NAMES.filter((n) => !MAY_BE_UNTESTED.includes(n))
interface LegOutcome {
  status: 'PASSED' | 'UNTESTED' | 'FAILED' | 'NOT REACHED'
  note: string
}
const legs = new Map<LegName, LegOutcome>(
  LEG_NAMES.map((n) => [n, { status: 'NOT REACHED', note: 'the walk never got there' }]),
)

function firstLine(e: unknown): string {
  return String((e as Error)?.message ?? e).split('\n').slice(0, 6).join(' | ').slice(0, 900)
}

async function runLeg(name: LegName, fn: () => Promise<{ untested: string } | void>): Promise<void> {
  try {
    const r = await fn()
    if (r && 'untested' in r) {
      legs.set(name, { status: 'UNTESTED', note: r.untested })
      console.log(`[journey-leg] ${name}: UNTESTED - ${r.untested}`)
    } else {
      legs.set(name, { status: 'PASSED', note: '' })
      console.log(`[journey-leg] ${name}: PASSED`)
    }
  } catch (e) {
    legs.set(name, { status: 'FAILED', note: firstLine(e) })
    console.log(`[journey-leg] ${name}: FAILED - ${firstLine(e)}`)
  }
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
function insideViewport(b: Box): boolean {
  return b.x >= 0 && b.y >= 0 && b.x + b.width <= VIEWPORT.width && b.y + b.height <= VIEWPORT.height
}
function inside(inner: Box, outer: Box, tol = 0.5): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.width <= outer.x + outer.width + tol &&
    inner.y + inner.height <= outer.y + outer.height + tol
  )
}
const r1 = (n: number) => Math.round(n * 10) / 10
function fmtBox(b: Box): string {
  return `x ${r1(b.x)} y ${r1(b.y)} w ${r1(b.width)} h ${r1(b.height)} (foot ${r1(VIEWPORT.height - (b.y + b.height))} above the viewport foot)`
}

/** Measures `testId`'s box and LOGS it before the caller asserts on it. */
async function measure(label: string, target: string | Locator): Promise<Box> {
  const el = typeof target === 'string' ? page.getByTestId(target).first() : target
  await expect(el, `${label} must be visible to measure its box`).toBeVisible({ timeout: 10_000 })
  const b = await el.boundingBox()
  expect(b, `${label} produced no bounding box`).not.toBeNull()
  console.log(`[journey-rect] ${label}: ${fmtBox(b!)}`)
  return b!
}

async function rootHeightProperty(): Promise<string> {
  return page.evaluate(() => document.documentElement.style.getPropertyValue('--console-dock-height'))
}

const CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
/** A surface carrying more controls than this is a finding, not something to truncate silently. */
const MAX_CONTROLS = 80

/**
 * Every interactive control a `surface` carries - the surface ROOT itself when it
 * is one (the lone "Console" button) and every descendant - each scrolled into view
 * within the surface (`scrollIntoViewIfNeeded`) and then hit-tested at its centre:
 * `elementFromPoint` must return the control or one of ITS descendants (never an
 * ancestor: an ancestor under a `pointer-events: none` control would pass). Callers
 * assert `checked >= 1` so a surface whose controls were all skipped cannot pass
 * vacuously. Returns how many were checked, how many zero-size/hidden ones were
 * not (logged by callers), and the ones a pointer cannot reach.
 */
async function hitTestControls(
  surface: Locator,
  label: string,
): Promise<{ checked: number; ignored: number; blocked: string[] }> {
  const descendants = surface.locator(CONTROL_SELECTOR)
  // A root that cannot itself receive pointer events (`pointer-events: none`, e.g. the camera
  // cluster's wrapper, whose four children carry `pointer-events-auto`) can never be its own
  // hit target, so it is not a control; its descendants are still each hit-tested.
  const rootIsControl = await surface.evaluate(
    (node, sel) => node.matches(sel) && getComputedStyle(node).pointerEvents !== 'none',
    CONTROL_SELECTOR,
  )
  const nDesc = await descendants.count()
  const total = nDesc + (rootIsControl ? 1 : 0)
  expect(total, `${label} carries ${total} controls: more than the ${MAX_CONTROLS} this leg hit-tests (raise it deliberately, never truncate silently)`).toBeLessThanOrEqual(MAX_CONTROLS)
  const blocked: string[] = []
  let checked = 0
  let ignored = 0
  for (let i = 0; i < total; i++) {
    const el = rootIsControl && i === 0 ? surface : descendants.nth(rootIsControl ? i - 1 : i)
    const visible = await el.evaluate((node) => {
      const r = node.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden'
    })
    if (!visible) {
      ignored++
      continue
    }
    await el.scrollIntoViewIfNeeded({ timeout: 5_000 })
    const res = await el.evaluate((node, surfaceSel) => {
      const surf = node.closest(surfaceSel) as Element | null
      const r = node.getBoundingClientRect()
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const name = node.getAttribute('data-testid') ?? node.getAttribute('aria-label') ?? node.textContent?.trim() ?? node.tagName
      const ident = `testid=${node.getAttribute('data-testid') ?? '-'} tag=${node.tagName.toLowerCase()} name="${node.getAttribute('aria-label') ?? node.textContent?.trim().slice(0, 40) ?? ''}" rect=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`
      if (!surf) return { name, ident, skipped: 'not inside its surface', hit: '' }
      const sr = surf.getBoundingClientRect()
      if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) {
        return { name, ident, skipped: 'centre outside the viewport', hit: '', cx, cy }
      }
      if (cx < sr.x || cx > sr.x + sr.width || cy < sr.y || cy > sr.y + sr.height) {
        return { name, ident, skipped: 'centre outside the surface after scrolling', hit: '', cx, cy }
      }
      const hit = document.elementFromPoint(cx, cy)
      const ok = !!hit && node.contains(hit)
      return {
        name,
        ident,
        skipped: '',
        ok,
        hit: hit ? (hit.getAttribute('data-testid') ?? hit.tagName) : 'nothing',
        cx,
        cy,
      }
    }, `[data-testid="${label}"]`)
    if (res.skipped) {
      // A control whose centre cannot lie inside the surface after scrolling is a finding:
      // it is reported as blocked, not skipped.
      blocked.push(`${res.name} [${res.ident}] (${res.skipped})`)
      continue
    }
    checked++
    if (!res.ok) blocked.push(`${res.name} [${res.ident}] (covered by ${res.hit} at ${r1(res.cx!)},${r1(res.cy!)})`)
  }
  return { checked, ignored, blocked }
}

// ---------------------------------------------------------------------------
// Dock state, driven through the real controls (never a helper that hides the open)
// ---------------------------------------------------------------------------

async function expandDock(): Promise<void> {
  if (await page.getByTestId('console-dock-open').isVisible()) {
    await page.getByTestId('console-dock-open').click()
  }
  await expect(page.getByTestId('console-dock-collapse')).toBeVisible({ timeout: 10_000 })
  // Log-focused legs choose Log explicitly; the current dock defaults to Scan.
  await page.getByTestId('console-tab-log').click()
}
async function collapseDock(): Promise<void> {
  if (await page.getByTestId('console-dock-collapse').isVisible()) {
    await page.getByTestId('console-dock-collapse').click()
  }
  await expect(page.getByTestId('console-dock-open')).toBeVisible({ timeout: 10_000 })
}

interface FocusInfo {
  id: string
  camera: boolean
  bodyHit: boolean
}
async function focusInfo(): Promise<FocusInfo> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return { id: '(body)', camera: false, bodyHit: false }
    const own = el.getAttribute('data-testid')
    const id = own ?? el.getAttribute('aria-label') ?? `${el.tagName.toLowerCase()}:${(el.textContent ?? '').trim().slice(0, 24)}`
    return {
      id,
      camera: !!el.closest('[data-space-camera-control]'),
      bodyHit: (own ?? '').startsWith('body-hit-'),
    }
  })
}

/** The focused element's computed outline: a rendered focus indicator is one that is not `none` and at least 2 px wide. */
async function expectFocusOutline(label: string): Promise<void> {
  const o = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    const cs = getComputedStyle(el)
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }
  })
  console.log(`[journey-leg-data] focus-outline: ${label}: ${JSON.stringify(o)}`)
  expect(o, `${label}: something must hold keyboard focus`).not.toBeNull()
  expect(o!.style, `${label}: the focused control paints an outline (computed outline-style is not none)`).not.toBe('none')
  expect(o!.width, `${label}: the focus outline is at least 2 px wide`).toBeGreaterThanOrEqual(2)
}

/** Puts the sequential-focus starting point at the very start of the document. */
async function focusDocumentStart(): Promise<void> {
  await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.tabIndex = -1
    document.body.prepend(probe)
    probe.focus()
    probe.remove()
  })
}

/** Tab from the document start until `stop` says so or the bound is spent. */
async function tabWalk(stop: (f: FocusInfo) => boolean): Promise<{ sequence: string[]; stoppedOn: FocusInfo | null }> {
  await focusDocumentStart()
  const sequence: string[] = []
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab')
    const f = await focusInfo()
    sequence.push(f.id)
    if (stop(f)) return { sequence, stoppedOn: f }
  }
  return { sequence, stoppedOn: null }
}

// ---------------------------------------------------------------------------
// Wire capture: every 4xx/5xx on /v1/ WITH its body (the e2e backend log holds no bodies)
// ---------------------------------------------------------------------------

function recordWire(p: Page): void {
  p.on('response', (res) => {
    const req = res.request()
    const url = new URL(res.url())
    if (!url.pathname.startsWith('/v1/') || res.status() < 400) return
    const entry: HttpError = { method: req.method(), url: `${url.pathname}${url.search}`, status: res.status(), body: '(unread)' }
    httpErrors.push(entry)
    void res
      .text()
      .then((t) => {
        entry.body = t.slice(0, 600)
      })
      .catch(() => {
        entry.body = '(body unreadable)'
      })
  })
}

// ---------------------------------------------------------------------------
// Fixture, console capture, hard update-depth assertion
// ---------------------------------------------------------------------------

test.describe('the console dock - open collapsed, expand, read the log, lay out, keyboard, navigate', () => {
  if (cfg.env !== 'local') {
    console.log(
      `[journey-SKIPPED] *** THIS WHOLE FILE IS SKIPPED (env=${cfg.env}, not local): NO LEG RAN, NO EVIDENCE WAS PRODUCED. A green run here proves nothing. ***`,
    )
  }
  test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: VIEWPORT,
      baseURL: cfg.baseURL,
      ignoreHTTPSErrors: true,
    })
    // Hide the Next.js dev-overlay host (it would sit over the dock's corner).
    await context.addInitScript(() => {
      const inject = () => {
        const style = document.createElement('style')
        style.textContent = 'nextjs-portal { display: none !important }'
        document.head.appendChild(style)
      }
      if (document.head) inject()
      else document.addEventListener('DOMContentLoaded', inject)
    })
    page = await context.newPage()
    page.on('pageerror', (err) => {
      consoleBuffer.push({ kind: 'pageerror', text: err.message, url: page.url() })
    })
    page.on('console', (msg) => {
      const type = msg.type()
      if (type !== 'error' && type !== 'warning') return
      consoleBuffer.push({ kind: type === 'error' ? 'console-error' : 'console-warning', text: msg.text(), url: page.url() })
    })
    recordWire(page)

    const interiors = captureInteriors(page)
    const corpBox = captureCorporationId(page)
    scanTargetsByFleet.map = captureScanTargets(page)
    const woken = await wakeNewCorp(page, 'E2E Console Dock', 'console-dock')
    homeSystemId = woken.homeSystemId
    fleetId = woken.fleetId
    home = await interiors.get(homeSystemId)
    await expect.poll(() => corpBox.id, { timeout: 30_000, message: 'no corporation id was captured off POST /v1/corporations' }).not.toBeNull()
    const corpId = corpBox.id!

    // Three records for the log (distinct action/target ids, the home system, a host of it).
    const hostId = home.features?.find((f) => f.type !== 'star')?.id ?? home.features![0]!.id
    const stamp = Date.now()
    seededRecordIds = []
    for (let i = 0; i < 3; i++) {
      seededRecordIds.push(
        await seedSightingFixture({
          corporationId: corpId,
          actionId: `e2e-console-action-${stamp}-${i}`,
          targetId: `e2e-console-target-${stamp}-${i}`,
          systemId: homeSystemId,
          hostId,
          asOf: 1 + i,
          position: { X: 8 + i, Y: 0, Z: 4 },
          velocity: { X: 0, Y: 0, Z: 0.2 },
          hullCount: 1,
          hullTypes: ['scout'],
        }),
      )
    }

    // Fail ONLY the system-filtered sightings read (the ghost feed): a predicate on
    // the systemId query parameter, never the glob `**/v1/sightings**` (the log's read
    // carries no systemId and must keep working). Installed before the reload; stays.
    await page.route(
      (url) => url.pathname.endsWith('/v1/sightings') && url.searchParams.get('systemId') !== null,
      (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced by e2e (console-dock)"}' }),
    )
    await page.reload()
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('space-loading')).toBeHidden({ timeout: 60_000 })
    console.log(`[journey-fixture] home ${homeSystemId}, fleet ${fleetId}, corp ${corpId}, records ${seededRecordIds.join(', ')}`)
  })

  test.afterAll(async () => {
    await context?.close()
  })

  /** The update-depth diagnostic is a HARD assertion (the predecessors' `[journey-console]` capture). */
  const UPDATE_DEPTH = /maximum update depth|nested update/i
  test.afterEach(async ({}, testInfo) => {
    const mine = consoleBuffer.slice(consoleCursor)
    consoleCursor = consoleBuffer.length
    console.log(
      `[journey-console] ${mine.length} browser console error/warning/pageerror entr${mine.length === 1 ? 'y' : 'ies'} captured in "${testInfo.title}"`,
    )
    for (const entry of mine) console.log(`[journey-console] ${entry.kind} at ${entry.url}: ${entry.text}`)
    const depth = mine.filter((e) => UPDATE_DEPTH.test(e.text))
    console.log(`[journey-console] update-depth lines: ${depth.length}`)
    const errs = httpErrors.slice(httpCursor)
    httpCursor = httpErrors.length
    for (const e of errs) console.log(`[journey-http] ${e.status} ${e.method} ${e.url} body=${e.body}`)
    console.log(`[journey-budget] "${testInfo.title}": ${Math.round(testInfo.duration)} ms of the 60000 ms per-test budget`)
    expect(
      depth,
      `React update-depth / nested-update diagnostic(s) captured in the browser console: ${JSON.stringify(depth, null, 2)}`,
    ).toEqual([])
  })

  // =========================================================================
  // 1. Collapsed: opens collapsed, [hidden] beats flex, strip row, geometry, target size
  // =========================================================================
  test('1: the view opens collapsed; hidden hides the flex wrapper; the strip is 56 px; every floating surface clears the dock', async () => {
    await runLeg('opens-collapsed', async () => {
      await expect(page.getByTestId('vitals-strip')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('console-dock-open')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('console-dock-region')).not.toBeVisible()
      await expect(page.getByTestId('console-tab-log')).not.toBeVisible()
      await expect(page.getByTestId('console-panel-log')).not.toBeVisible()
      console.log(`[journey-leg-data] opens-collapsed: root --console-dock-height = ${JSON.stringify(await rootHeightProperty())}`)
    })

    await runLeg('hidden-beats-flex', async () => {
      const region = page.getByTestId('console-dock-region')
      const state = await region.evaluate((el) => ({
        hasFlexClass: el.classList.contains('flex'),
        display: getComputedStyle(el).display,
        hiddenAttr: el.hasAttribute('hidden'),
      }))
      console.log(`[journey-leg-data] hidden-beats-flex: ${JSON.stringify(state)}`)
      expect(state.hasFlexClass, 'the region wrapper carries the flex class (the arrangement D-1 is about)').toBe(true)
      expect(state.hiddenAttr, 'collapsed: the region carries the hidden attribute').toBe(true)
      expect(state.display, '[hidden] must beat the flex class in the real stylesheet').toBe('none')
    })

    await runLeg('strip-row-56', async () => {
      const strip = await measure('vitals-strip (collapsed)', 'vitals-strip')
      expect(strip.height, 'the strip is 56 CSS px tall collapsed').toBeCloseTo(56, 0)
    })

    await runLeg('geometry-collapsed', async () => {
      // The card is induced by failing the system-filtered read only; it appears after
      // the query's retries are spent (the vitals journey allowed 20 s).
      await expect(
        page.getByTestId('sightings-unavailable'),
        'the card must be up: the system-filtered sightings read is failed by the route predicate',
      ).toBeVisible({ timeout: 25_000 })
      await expect(page.getByTestId('space-camera-controls')).toHaveCount(0)
      const surfaces: [string, Box][] = [
        ['live-object-browser', await measure('live-object-browser (collapsed)', 'live-object-browser')],
        ['sightings-unavailable', await measure('sightings-unavailable (collapsed)', 'sightings-unavailable')],
        ['floating-nav', await measure('floating-nav (collapsed)', 'floating-nav')],
        ['console-dock-open', await measure('console-dock-open (collapsed)', 'console-dock-open')],
      ]
      const strip = await measure('vitals-strip (collapsed, geometry)', 'vitals-strip')
      for (const [name, b] of surfaces) {
        expect(insideViewport(b), `${name} lies wholly inside 1280x720 with the dock collapsed`).toBe(true)
        expect(overlaps(b, strip), `${name} must not overlap the strip`).toBe(false)
      }
      for (let i = 0; i < surfaces.length; i++) {
        for (let j = i + 1; j < surfaces.length; j++) {
          expect(overlaps(surfaces[i]![1], surfaces[j]![1]), `${surfaces[i]![0]} must not overlap ${surfaces[j]![0]} (dock collapsed)`).toBe(false)
        }
      }
      const nav = surfaces.find(([name]) => name === 'floating-nav')![1]
      console.log(`[journey-leg-data] geometry-collapsed: nav foot ${r1(VIEWPORT.height - (nav.y + nav.height))} px above the viewport foot`)
      // Every control in each surface, hit-tested at its centre after scrolling within its surface.
      for (const [name] of surfaces) {
        const { checked, ignored, blocked } = await hitTestControls(page.getByTestId(name).first(), name)
        console.log(`[journey-leg-data] geometry-collapsed: ${name}: ${checked} control(s) hit-tested, ${ignored} zero-size/hidden ignored, ${blocked.length} blocked`)
        for (const b of blocked) console.log(`[journey-leg-data] geometry-collapsed: BLOCKED ${name}: ${b}`)
        expect(checked, `${name} must have at least one control actually hit-tested (a surface whose controls were all skipped passes nothing)`).toBeGreaterThanOrEqual(1)
        expect(blocked, `${name} has control(s) a pointer cannot reach (dock collapsed)`).toEqual([])
      }
      // The card's Retry specifically (r2-M1): present, and hit-tested by the loop above.
      const retry = page.getByTestId('sightings-unavailable').getByRole('button', { name: 'Retry' })
      await expect(retry, 'the card carries its Retry control').toBeVisible()
      const rb = await measure('card Retry (collapsed)', retry)
      const hit = await retry.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return !!h && el.contains(h)
      })
      expect(hit, `the card's Retry is hit-testable at its centre (${fmtBox(rb)})`).toBe(true)
    })

    await runLeg('targets-24', async () => {
      const b = await measure('console-dock-open (targets-24, collapsed)', 'console-dock-open')
      openBoxCollapsed = b
      expect(b.width, 'the "Console" control is at least 24 CSS px wide').toBeGreaterThanOrEqual(24)
      expect(b.height, 'the "Console" control is at least 24 CSS px tall').toBeGreaterThanOrEqual(24)
      // The Log tab and the collapse control are measured expanded, in leg 7; test 7's
      // closing test folds that half back into this leg's outcome.
    })
  })

  // =========================================================================
  // 2. Keyboard: collapsed Tab walk; Enter/Space; focus; sizes expanded
  // =========================================================================
  test('2: the Console control is reachable by Tab; Enter and Space operate both controls; the expanded dock is 220 px', async () => {
    await runLeg('tab-walk-collapsed', async () => {
      await collapseDock()
      await page.getByTestId('vitals-fleet-chevron').focus()
      await page.keyboard.press('Tab')
      const next = await focusInfo()
      console.log(`[journey-leg-data] tab-walk-collapsed: after the chevron, Tab -> ${next.id}`)
      expect(next.id, 'Tab from the strip chevron reaches the "Console" control').toBe('console-dock-open')
      const walk = await tabWalk(() => false)
      console.log(`[journey-leg-data] tab-walk-collapsed: bounded walk from the document start (${walk.sequence.length} stops): ${walk.sequence.join(' > ')}`)
      expect(walk.sequence, 'a collapsed dock never exposes the Log tab to Tab').not.toContain('console-tab-log')
      expect(walk.sequence, 'a collapsed dock never exposes the collapse control to Tab').not.toContain('console-dock-collapse')
    })

    await runLeg('expand-collapse-keyboard', async () => {
      await collapseDock()
      const open = page.getByTestId('console-dock-open')
      const collapse = page.getByTestId('console-dock-collapse')
      const tab = page.getByTestId('console-tab-log')

      // Enter on the "Console" control.
      await open.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('console-dock-region')).toBeVisible({ timeout: 10_000 })
      const scanTab = page.getByTestId('console-tab-scan')
      await expect(scanTab, 'first expansion focuses the default Scan tab').toBeFocused()
      await expect(scanTab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('console-panel-log')).toBeHidden()
      await expectFocusOutline('Scan tab, focused by keyboard expansion')
      await page.keyboard.press('ArrowRight')
      await expect(tab, 'ArrowRight selects and focuses Log').toBeFocused()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expectFocusOutline('Log tab, selected by keyboard')
      const dock = await measure('console-dock (expanded)', 'console-dock')
      expect(dock.height, 'the expanded dock is 220 CSS px tall (strip top to the viewport foot)').toBeCloseTo(220, 0)
      expect(dock.width, 'the expanded dock is the full 1280 px wide').toBeCloseTo(1280, 0)
      expect(r1(dock.y + dock.height), 'the dock ends at the viewport foot').toBeCloseTo(VIEWPORT.height, 0)
      const strip = await measure('vitals-strip (expanded)', 'vitals-strip')
      expect(strip.height, 'the strip is 56 CSS px tall expanded too').toBeCloseTo(56, 0)
      // "from the top of the strip's row": the dock's top IS the strip's top, and the tab bar
      // and the panel lie beneath the strip's row, inside the dock.
      expect(Math.abs(dock.y - strip.y), `the dock's top (${r1(dock.y)}) is the strip's top (${r1(strip.y)})`).toBeLessThanOrEqual(1)
      const region = await measure('console-dock-region (expanded)', 'console-dock-region')
      const tabBox = await measure('console-tab-log (expanded)', 'console-tab-log')
      const panelBox = await measure('console-panel-log (expanded)', 'console-panel-log')
      expect(region.y, 'the region (tab bar and panel) begins at or below the strip row\'s foot').toBeGreaterThanOrEqual(strip.y + strip.height - 0.5)
      expect(tabBox.y, 'the tab bar lies beneath the strip row').toBeGreaterThanOrEqual(strip.y + strip.height - 0.5)
      expect(panelBox.y, 'the panel lies beneath the strip row').toBeGreaterThanOrEqual(strip.y + strip.height - 0.5)
      expect(inside(tabBox, dock), 'the tab bar lies inside the dock').toBe(true)
      expect(inside(panelBox, dock), 'the panel lies inside the dock').toBe(true)
      console.log(`[journey-leg-data] expand-collapse-keyboard: root --console-dock-height = ${JSON.stringify(await rootHeightProperty())}`)

      // The Log tab and the collapse control meet the 24 px minimum (targets-24's other half;
      // failures are recorded here and folded into that leg by the closing test).
      for (const id of ['console-tab-scan', 'console-tab-log', 'console-dock-collapse']) {
        const tb = await measure(`${id} (expanded, targets-24)`, id)
        if (tb.width < 24 || tb.height < 24) targets24ExpandedFailures.push(`${id} is ${r1(tb.width)}x${r1(tb.height)}`)
      }
      measuredExpanded = true
      console.log(`[journey-leg-data] targets-24: collapsed "Console" ${openBoxCollapsed ? fmtBox(openBoxCollapsed) : '(not measured)'}`)

      // Tab from the Log tab reaches the collapse control: its focus indicator is rendered too.
      await page.keyboard.press('Tab')
      await expect(collapse, 'Tab from the Log tab reaches the collapse control').toBeFocused()
      await expectFocusOutline('collapse control, focused by Tab')

      // Space on the collapse control.
      await page.keyboard.press('Space')
      await expect(open, 'Space on the collapse control collapses the dock').toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('console-dock-region')).not.toBeVisible()
      await expect(open, 'collapsing with focus on the collapse control moves focus to the "Console" control').toBeFocused()
      await expectFocusOutline('"Console" control, focused after a keyboard collapse')

      // Space on the "Console" control, Enter on the collapse control.
      await page.keyboard.press('Space')
      await expect(collapse).toBeVisible({ timeout: 10_000 })
      await expect(tab, 'reopening by Space remembers and focuses the selected Log tab').toBeFocused()
      await collapse.focus()
      await page.keyboard.press('Enter')
      await expect(open, 'Enter on the collapse control collapses the dock').toBeVisible({ timeout: 10_000 })
      await expect(open).toBeFocused()
    })
  })

  // =========================================================================
  // 3. Reload, the log's first row and its scroll
  // =========================================================================
  test('3: a reload shows the dock collapsed; the log panel opens at its origin and scrolls to its last row', async () => {
    await runLeg('reload-collapsed', async () => {
      await expandDock()
      await page.reload()
      await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('console-dock-open'), 'a reload shows the dock collapsed').toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('console-dock-region')).not.toBeVisible()
    })

    await runLeg('log-panel-origin', async () => {
      await expandDock()
      const panel = page.getByTestId('console-panel-log')
      await expect(page.locator('[data-testid^="sighting-row-"]').first(), 'the seeded records are listed').toBeVisible({ timeout: 20_000 })
      await panel.evaluate((el) => {
        el.scrollTop = 0
      })
      const panelBox = await measure('console-panel-log', panel)
      const refresh = await measure('Refresh sighting log', page.getByRole('button', { name: 'Refresh sighting log' }))
      const firstRow = await measure('first sighting row', page.locator('[data-testid^="sighting-row-"]').first())
      const rowCount = await page.locator('[data-testid^="sighting-row-"]').count()
      console.log(`[journey-leg-data] log-panel-origin: ${rowCount} row(s) listed`)
      expect(inside(refresh, panelBox), 'the refresh control lies wholly inside the Log panel at its scroll origin').toBe(true)
      expect(inside(firstRow, panelBox), 'the first row lies wholly inside the Log panel at its scroll origin').toBe(true)
    })

    await runLeg('scroll-leg', async () => {
      const panel = page.getByTestId('console-panel-log')
      const rows = page.locator('[data-testid^="sighting-row-"]')
      const rowCount = await rows.count()
      expect(rowCount, 'the three seeded records are listed (the fixture of this leg)').toBeGreaterThanOrEqual(3)
      const dims = await panel.evaluate((el) => {
        el.scrollTop = el.scrollHeight
        return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop }
      })
      console.log(`[journey-leg-data] scroll-leg: ${JSON.stringify(dims)}`)
      // The precondition: the content really is taller than the panel and the panel really scrolled,
      // otherwise "the last row is inside the panel" is trivially true.
      expect(dims.scrollHeight, 'the panel content is taller than the panel area (the scroll leg\'s precondition)').toBeGreaterThan(dims.clientHeight)
      expect(dims.scrollTop, 'the panel scrolled (scrollTop > 0)').toBeGreaterThan(0)
      const footerAfterLastRow = await panel.evaluate((el) => {
        const sel = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'
        const rowEls = Array.from(el.querySelectorAll('[data-testid^="sighting-row-"]'))
        const last = rowEls[rowEls.length - 1]
        if (!last) return ['(no row)']
        return Array.from(el.querySelectorAll(sel))
          .filter((f) => !last.contains(f) && !!(last.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING))
          .map((f) => f.getAttribute('data-testid') ?? f.getAttribute('aria-label') ?? f.tagName)
      })
      expect(footerAfterLastRow, 'nothing focusable follows the last row in the panel (no footer, no load-more at 3 records)').toEqual([])
      const last = await measure('last sighting row (panel scrolled to its end)', rows.last())
      const panelBox = await measure('console-panel-log (scrolled)', panel)
      expect(insideViewport(last), 'the last row lies wholly inside the viewport at the end of the scroll').toBe(true)
      expect(inside(last, panelBox), 'the last row lies wholly inside the panel at the end of the scroll').toBe(true)
      const dock = await measure('console-dock (after scroll)', 'console-dock')
      expect(dock.height, 'the dock is still 220 CSS px tall with the rows scrolled').toBeCloseTo(220, 0)
    })
  })

  // =========================================================================
  // 4. Geometry and the Tab walk with the dock expanded
  // =========================================================================
  test('4: expanded, every surface clears the dock and the strip; the camera controls precede the hit targets in Tab order', async () => {
    await runLeg('geometry-expanded', async () => {
      await expandDock()
      await expect(
        page.getByTestId('sightings-unavailable'),
        'the card must be up (the route predicate is still installed)',
      ).toBeVisible({ timeout: 25_000 })
      await expect(page.getByTestId('space-camera-controls')).toHaveCount(0)
      const surfaces: [string, Box][] = [
        ['live-object-browser', await measure('live-object-browser (expanded)', 'live-object-browser')],
        ['sightings-unavailable', await measure('sightings-unavailable (expanded)', 'sightings-unavailable')],
        ['floating-nav', await measure('floating-nav (expanded)', 'floating-nav')],
      ]
      const strip = await measure('vitals-strip (expanded, geometry)', 'vitals-strip')
      const dock = await measure('console-dock (expanded, geometry)', 'console-dock')
      const colClient = await page.getByTestId('live-object-browser').evaluate((el) => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }))
      console.log(`[journey-leg-data] geometry-expanded: Objects browser ${JSON.stringify(colClient)}`)
      for (const [name, b] of surfaces) {
        expect(insideViewport(b), `${name} lies wholly inside 1280x720 with the dock expanded`).toBe(true)
        expect(overlaps(b, strip), `${name} must not overlap the strip`).toBe(false)
        expect(overlaps(b, dock), `${name} must not overlap the dock`).toBe(false)
      }
      for (let i = 0; i < surfaces.length; i++) {
        for (let j = i + 1; j < surfaces.length; j++) {
          expect(overlaps(surfaces[i]![1], surfaces[j]![1]), `${surfaces[i]![0]} must not overlap ${surfaces[j]![0]} (dock expanded)`).toBe(false)
        }
      }
      for (const [name] of surfaces) {
        const { checked, ignored, blocked } = await hitTestControls(page.getByTestId(name).first(), name)
        console.log(`[journey-leg-data] geometry-expanded: ${name}: ${checked} control(s) hit-tested, ${ignored} zero-size/hidden ignored, ${blocked.length} blocked`)
        for (const b of blocked) console.log(`[journey-leg-data] geometry-expanded: BLOCKED ${name}: ${b}`)
        expect(checked, `${name} must have at least one control actually hit-tested (a surface whose controls were all skipped passes nothing)`).toBeGreaterThanOrEqual(1)
        expect(blocked, `${name} has control(s) a pointer cannot reach (dock expanded)`).toEqual([])
      }
      const retry = page.getByTestId('sightings-unavailable').getByRole('button', { name: 'Retry' })
      await expect(retry, 'the card carries its Retry control (expanded)').toBeVisible()
      const rb = await measure('card Retry (expanded)', retry)
      const hit = await retry.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return !!h && el.contains(h)
      })
      expect(hit, `the card's Retry is hit-testable at its centre (${fmtBox(rb)})`).toBe(true)

      // The five strip cells: rendered, non-empty, inside the viewport, overlapped by no surface.
      for (const cellId of ['vitals-fleet-cell', 'vitals-fuel-cell', 'vitals-hold-cell', 'vitals-credits-cell', 'vitals-clock-cell']) {
        const cb = await measure(`${cellId} (expanded)`, cellId)
        const text = ((await page.getByTestId(cellId).first().textContent()) ?? '').trim()
        expect(text.length, `${cellId} renders non-empty content with the dock expanded`).toBeGreaterThan(0)
        expect(insideViewport(cb), `${cellId} lies wholly inside the viewport with the dock expanded`).toBe(true)
        for (const [name, sb] of surfaces) expect(overlaps(cb, sb), `${cellId} must not be overlapped by ${name}`).toBe(false)
      }
    })

    await runLeg('tab-walk-expanded', async () => {
      await expandDock()
      const walk = await tabWalk((f) => f.camera || f.bodyHit)
      console.log(`[journey-leg-data] tab-walk-expanded: walk from the document start (${walk.sequence.length} stops): ${walk.sequence.join(' > ')}`)
      expect(walk.stoppedOn, `neither a camera control nor a hit target was reached in ${MAX_TABS} Tabs`).not.toBeNull()
      expect(walk.stoppedOn!.camera, 'a camera control is focused before any body or lane-gate hit target').toBe(true)

      await page.getByTestId('vitals-fleet-chevron').focus()
      await page.keyboard.press('Tab')
      expect((await focusInfo()).id, 'Tab after the chevron reaches the Log tab').toBe('console-tab-log')
      await page.keyboard.press('Tab')
      expect((await focusInfo()).id, 'Tab after the Log tab reaches the collapse control').toBe('console-dock-collapse')
      await page.keyboard.press('Tab')
      const after = await focusInfo()
      console.log(`[journey-leg-data] tab-walk-expanded: after the collapse control, Tab -> ${after.id}`)
      expect(after.id, "Tab after the collapse control reaches the log's refresh control").toBe('Refresh sighting log')

      // "the log's controls in reading order, each once": walk on until focus leaves the panel and
      // compare to the panel's focusables in DOM order (the first stop above is already the first one).
      const expected = await page.evaluate((sel) => {
        const panel = document.querySelector('[data-testid="console-panel-log"]')!
        const idOf = (el: HTMLElement) =>
          el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? `${el.tagName.toLowerCase()}:${(el.textContent ?? '').trim().slice(0, 24)}`
        return Array.from(panel.querySelectorAll<HTMLElement>(sel))
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !(el as HTMLButtonElement).disabled
          })
          .map(idOf)
      }, CONTROL_SELECTOR)
      console.log(`[journey-leg-data] tab-walk-expanded: the panel's focusables in DOM order: ${expected.join(' > ')}`)
      expect(expected.length, 'the real log carries at least its refresh control').toBeGreaterThanOrEqual(1)
      const seen: string[] = [after.id]
      for (let i = 1; i < expected.length; i++) {
        await page.keyboard.press('Tab')
        seen.push((await focusInfo()).id)
      }
      expect(seen, "Tab walks the log's controls in reading order, each once").toEqual(expected)
      await page.keyboard.press('Tab')
      const leftPanel = await page.evaluate(
        () => !document.querySelector('[data-testid="console-panel-log"]')!.contains(document.activeElement),
      )
      expect(leftPanel, 'one Tab past the last log control leaves the panel (each control was reached exactly once)').toBe(true)
    })
  })

  // =========================================================================
  // 5. The report's link: a settled focused sweep, then the link
  // =========================================================================
  test("5: a settled sweep's report link leaves the dock expanded on the Log tab with focus on it", async () => {
    await runLeg('report-link', async () => {
      await collapseDock()
      await page.getByTestId('console-dock-open').click()
      await page.getByTestId('console-tab-scan').click()
      const map = scanTargetsByFleet.map!
      // The scan control and its served targets (the fixture may not arrange one).
      try {
        await expect(page.getByTestId('scan-control')).toBeVisible({ timeout: 10_000 })
      } catch {
        return { untested: 'the scan control is not on the view (tier 1 cover: task 2.9; tier 4 also: scan-journey 3.2)' }
      }
      await expect.poll(() => map.has(fleetId), { timeout: 10_000 }).toBe(true).catch(() => undefined)
      const targets = map.get(fleetId) ?? []
      if (targets.length === 0) {
        return { untested: 'no scan target served in range for the fresh fleet (tier 1 cover: task 2.9; scan-journey 3.2 drives the link at tier 4)' }
      }
      const nearest = targets.reduce((a, b) => (b.durationMs < a.durationMs ? b : a))
      const wallMs = Math.ceil(nearest.durationMs / WORLD_SCALE) + SETTLE_CUSHION_MS
      console.log(`[journey-leg-data] report-link: nearest target ${nearest.hostId} durationMs ${nearest.durationMs} -> wall wait budget ${wallMs} ms (cap ${SWEEP_BUDGET_MS})`)
      if (wallMs > SWEEP_BUDGET_MS) {
        return { untested: `the nearest target's sweep needs ${wallMs} ms of wall time, over the ${SWEEP_BUDGET_MS} ms budget` }
      }
      await page.getByTestId('scan-control').scrollIntoViewIfNeeded({ timeout: 5_000 })
      try {
        await commitScan(page, nearest.hostId)
        await expect(page.getByTestId('scan-countdown')).toBeVisible({ timeout: 10_000 })
      } catch (e) {
        return { untested: `the sweep could not be committed (${firstLine(e)}); see [journey-http] for any 4xx body` }
      }
      try {
        await expect(page.getByTestId('scan-report')).toBeVisible({ timeout: wallMs })
      } catch {
        return { untested: `the report did not appear within ${wallMs} ms of wall time` }
      }
      const link = page.getByTestId('scan-report').getByRole('button', { name: /open the sighting log/i })
      if ((await link.count()) === 0) {
        const text = ((await page.getByTestId('scan-report').textContent()) ?? '').slice(0, 160)
        return { untested: `the report carries no link to the log (a fizzled or empty sweep): ${JSON.stringify(text)}` }
      }

      // The report is inside Scan now. Its visible link switches to Log and focuses the tab.
      await expect(page.getByTestId('console-tab-scan')).toHaveAttribute('aria-selected', 'true')
      await link.scrollIntoViewIfNeeded({ timeout: 5_000 })
      await link.click()
      await expect(page.getByTestId('console-dock-collapse'), 'the link keeps the dock expanded').toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('console-tab-log')).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('console-tab-log'), 'focus lands on the Log tab').toBeFocused()
      await expect(page.getByTestId('sighting-log'), 'the log is shown').toBeVisible({ timeout: 10_000 })

      // LOGGED, never asserted (adversary r1 B1): whether the settled sweep's record is listed.
      const rowIds = await page.locator('[data-testid^="sighting-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? ''))
      const rowsText = await page.locator('[data-testid^="sighting-row-"]').allTextContents()
      console.log(
        `[journey-leg-data] report-link: ${rowIds.length} row(s) listed after the link (${seededRecordIds.length} seeded); a row names the swept host ${nearest.hostId}: ${rowsText.some((t) => t.includes(nearest.hostId))} (LOGGED, not asserted)`,
      )

      // The link again while the dock is expanded: still expanded, focus back on the tab.
      await page.getByTestId('console-tab-scan').click()
      const link2 = page.getByTestId('scan-report').getByRole('button', { name: /open the sighting log/i })
      if ((await link2.count()) > 0) {
        await link2.scrollIntoViewIfNeeded({ timeout: 5_000 })
        await link2.click()
        await expect(page.getByTestId('console-dock-collapse'), 'the link does not collapse an expanded dock').toBeVisible()
        await expect(page.getByTestId('console-dock-region')).toBeVisible()
        await expect(page.getByTestId('console-tab-log'), 'focus returns to the Log tab').toBeFocused()
      } else {
        return {
          untested:
            'the report no longer carries its link on the second look, so "the link does not collapse an expanded dock" was not driven here (the collapsed half WAS asserted above); tier 1 task 2.9 is the cover for the expanded half',
        }
      }
    })
  })

  // =========================================================================
  // 6. The galaxy route, the return, the other system
  // =========================================================================
  test('6: from an expanded dock the galaxy nav sits 72 px up; coming back by client navigation shows the dock collapsed', async () => {
    await runLeg('galaxy-nav-72', async () => {
      await expandDock()
      console.log(`[journey-leg-data] galaxy-nav-72: before leaving, root --console-dock-height = ${JSON.stringify(await rootHeightProperty())}`)
      // The app's own link: a client-side navigation (never page.goto('/'), which reloads and cannot see a leak).
      await page.getByTestId('nav-home').click()
      await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 })
      const nav = await measure('floating-nav (galaxy route)', 'floating-nav')
      const foot = VIEWPORT.height - (nav.y + nav.height)
      console.log(`[journey-leg-data] galaxy-nav-72: root --console-dock-height on the galaxy route = ${JSON.stringify(await rootHeightProperty())} (expected empty)`)
      expect(foot, "the galaxy route's nav foot is 72 CSS px above the viewport's foot").toBeCloseTo(72, 0)
    })

    await runLeg('return-collapsed', async () => {
      // One route (RULING 22): the roster row selects the system, the inspector's button enters it.
      const rows = page.getByTestId('fleet-roster').locator('[data-testid^="fleet-row-"]')
      await expect(rows.first(), 'the galaxy roster lists the owned fleet').toBeVisible({ timeout: 30_000 })
      await rows.first().click()
      const enter = page.getByTestId('enter-system-button')
      await expect(enter, 'a selected system offers the drill-in control').toBeVisible({ timeout: 20_000 })
      const arrived = page.waitForURL(`**/systems/${homeSystemId}`, { timeout: 20_000 })
      await enter.click()
      await arrived
      await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('console-dock-open'), 'arriving by client navigation shows the dock collapsed').toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('console-dock-region')).not.toBeVisible()
    })

    await runLeg('other-system-collapsed', async () => {
      return {
        untested:
          'no player path reaches another system from this one for a one-hull corporation without a jump: the only system-to-system navigation in the app is picking a roster fleet that sits in another system (SystemSpaceView.selectFleet), and this corporation owns one fleet; arranging a second fleet or a jump here would be a different journey (no router internals are reached). Cover: tier 1 task 2.1 (keyed remount "Navigating to another system and back shows the dock collapsed"); nearest tier-4 evidence is leg 15 return-collapsed (galaxy to system)',
      }
    })
  })

  // =========================================================================
  // 7. The summary and the closing assertion
  // =========================================================================
  test('7: the must-pass legs passed and no leg failed', async () => {
    // Fold leg 7's expanded half into targets-24 (the leg spans both states).
    if (legs.get('targets-24')!.status === 'PASSED') {
      if (!measuredExpanded) {
        legs.set('targets-24', {
          status: 'FAILED',
          note: `the expanded half (Log tab and collapse control) was never measured (leg 7 is ${legs.get('expand-collapse-keyboard')!.status})`,
        })
      } else if (targets24ExpandedFailures.length > 0) {
        legs.set('targets-24', { status: 'FAILED', note: targets24ExpandedFailures.join('; ') })
      }
    }
    console.log('[journey-summary] ===== leg outcomes =====')
    for (const n of LEG_NAMES) {
      const o = legs.get(n)!
      console.log(`[journey-summary] ${n}${MUST_PASS.includes(n) ? ' (MUST PASS)' : ''}: ${o.status}${o.note ? ` - ${o.note}` : ''}`)
    }
    console.log('[journey-summary] ========================')
    const failed = LEG_NAMES.filter((n) => legs.get(n)!.status === 'FAILED').map((n) => `${n}: ${legs.get(n)!.note}`)
    expect(failed, 'legs that FAILED (each message is the first assertion that broke; the leg logs above carry the rectangles)').toEqual([])
    for (const n of MUST_PASS) {
      expect(legs.get(n)!.status, `must-PASS leg ${n} is ${legs.get(n)!.status} (${legs.get(n)!.note})`).toBe('PASSED')
    }
  })
})
