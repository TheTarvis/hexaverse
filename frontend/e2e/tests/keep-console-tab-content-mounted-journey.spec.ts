import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  burnToSelectionAndDock,
  captureInteriors,
  selectBody,
  selectFirstBodyMatching,
  stationFeatureId,
  wakeNewCorp,
  type ServedInterior,
} from '../helpers/space-view'
import {
  captureCorporationId,
  captureScanTargets,
  commitScan,
  seedSightingFixture,
  type ServedScanTarget,
} from '../helpers/scan-fixtures'

/**
 * The keep-console-tab-content-mounted journey - openspec change
 * `keep-console-tab-content-mounted` (link 2b-i-b of `docs/plans/system-hud/chain.md`,
 * task 5.2), archive gate (`docs/testing-tiers.md` tier 4). Written against the UI
 * built at `41ae157`, NOT run by its author. The contract is
 * `docs/handoffs/keep-console-tab-content-mounted-impl-contract.md` section 5.
 *
 * WHAT IT PROVES THAT NO TIER-1 TEST CAN: the log's content stays the SAME DOM NODE
 * across a collapse and re-expansion (a request count cannot show it inside the
 * 60 s stale time), the app stylesheet does not defeat `hidden`, the dock's `window`
 * Escape listener yields to the fleet menu in production (React root = `document`),
 * a real pointer press on the dock is not a pick (`SystemSpaceView.console-dock-
 * escape.test.tsx` 2.6 cannot fail at tier 1), and the settle re-read happens on the
 * wire with the dock collapsed.
 *
 * FIXTURE: one corporation, provisioned ONCE (`test.beforeAll`). 51 sighting
 * records under a systemId that is NOT the home system (distinct action/target ids,
 * `asOf` 1_000..1_050, far below the live world time, so the settled sweep's record
 * later sorts first and the server's 50-record page leaves a second page), plus ONE
 * record in the home system at `asOf` 1 (the highlight leg's; it sorts last, so it
 * lands on page two). Total seeded: 52. Then a reload, so the log's first read at
 * view open sees them. NO ROUTE IS INSTALLED in `beforeAll`: the ghost feed's read is
 * left to work (leg 4 needs a drawn ghost); leg 8 installs its own predicate.
 *
 * LEGS (stable names for QA at 5.3; each ends PASSED / UNTESTED / FAILED / OBSERVED;
 * `[journey-leg] <name>: <outcome>`). Legs record their own FAILED outcome instead
 * of throwing so one red leg does not skip the rest of a serial file; a closing test
 * fails the run on any FAILED and on any must-PASS leg that is not PASSED.
 *
 * SIZING (`docs/handoffs/add-console-dock-journey.md`, run 2): world scale 5; a
 * home-system flight is 3.8-4.4 s wall, `scan-journey` clean sweep 22.1 s whole, the
 * predecessor's longest test 5.0 s and its reload test 2.8 s. Only leg 9 waits on
 * the simulation (dock <= 15 s, sweep <= 25 s, expansion <= 5 s, of its test's 60).
 * NO TIMEOUT IS RAISED and there is no `test.setTimeout`.
 *
 * OBSERVATION ONLY, never asserted (RULING 6, RULING 8): the panel's scroll offset
 * across a collapse; Escape with a native select's popup open; Escape with focus in
 * a toast; the wall time of seeding the 52 records.
 */
const cfg = resolveE2EConfig()

const VIEWPORT = { width: 1280, height: 720 }
/** The server pages the pile at 50 (`backend/sightings/model.go:26`). */
const PAGE_SIZE = 50
const OTHER_SYSTEM_RECORDS = 51
const SEEDED_TOTAL = OTHER_SYSTEM_RECORDS + 1
/** Leg 9: the contract's wall budgets (docs/handoffs/...-impl-contract.md 5.4/5.5). */
const DOCK_BUDGET_MS = 15_000
const SWEEP_BUDGET_MS = 25_000
/** World scale of the e2e stack (`frontend/e2e/setup/backend-stack.ts`). */
const WORLD_SCALE = 5
const SETTLE_CUSHION_MS = 3_000

test.describe.configure({ mode: 'serial' })

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
/** One observed wire event, in the order the browser reported it. */
interface WireEvent {
  seq: number
  at: number
  kind: 'pile-request' | 'pile-answered' | 'interior-response' | 'running-response' | 'scan-post-response'
  url: string
  status?: number
  /** running-response only: did the body carry a running scan action? */
  hasScan?: Promise<boolean>
}

let context: BrowserContext
let page: Page
let homeSystemId = ''
let fleetId = ''
let home: ServedInterior
let homeRecordId = ''
let otherSystemId = ''
const consoleBuffer: JourneyConsoleEntry[] = []
let consoleCursor = 0
const httpErrors: HttpError[] = []
let httpCursor = 0
const wire: WireEvent[] = []
let wireSeq = 0
let scanTargets: Map<string, ServedScanTarget[]>
/** Scroll offsets across leg 2's collapse (leg 3 logs them). */
let scrollBefore: string | null = null
let scrollAfter: string | null = null
let logTagged = false
/** Set once a sweep commit was ACCEPTED: from then on settle-reread-collapsed is must-PASS (J1). */
let sweepCommitted = false

// ---------------------------------------------------------------------------
// Leg accounting
// ---------------------------------------------------------------------------

const LEG_NAMES = [
  'expand-load-more',
  'escape-same-node',
  'scroll-offset',
  'highlight-survives',
  'menu-open-escape',
  'press-on-dock-not-a-pick',
  'escape-from-camera-control',
  'failed-while-collapsed',
  'settle-reread-collapsed',
  'warm-return',
  'select-popup-escape',
  'toast-escape',
  'other-system',
] as const
type LegName = (typeof LEG_NAMES)[number]
const MUST_PASS: LegName[] = [
  'expand-load-more',
  'escape-same-node',
  'menu-open-escape',
  'press-on-dock-not-a-pick',
  'escape-from-camera-control',
  'failed-while-collapsed',
]
interface LegOutcome {
  status: 'PASSED' | 'UNTESTED' | 'FAILED' | 'OBSERVED' | 'NOT REACHED'
  note: string
}
const legs = new Map<LegName, LegOutcome>(LEG_NAMES.map((n) => [n, { status: 'NOT REACHED', note: 'the walk never got there' }]))

function firstLine(e: unknown): string {
  return String((e as Error)?.message ?? e).split('\n').slice(0, 6).join(' | ').slice(0, 900)
}

/** `observation: true` legs end OBSERVED (nothing to fail); an `untested` return ends UNTESTED. */
async function runLeg(name: LegName, fn: () => Promise<{ untested: string } | void>, observation = false): Promise<void> {
  try {
    const r = await fn()
    if (r && 'untested' in r) {
      legs.set(name, { status: 'UNTESTED', note: r.untested })
      console.log(`[journey-leg] ${name}: UNTESTED - ${r.untested}`)
    } else {
      legs.set(name, { status: observation ? 'OBSERVED' : 'PASSED', note: '' })
      console.log(`[journey-leg] ${name}: ${observation ? 'OBSERVED' : 'PASSED'}`)
    }
  } catch (e) {
    if (observation) {
      legs.set(name, { status: 'OBSERVED', note: `observation itself errored (never a failure): ${firstLine(e)}` })
      console.log(`[journey-leg] ${name}: OBSERVED - the observation errored, which is not a failure: ${firstLine(e)}`)
      return
    }
    legs.set(name, { status: 'FAILED', note: firstLine(e) })
    console.log(`[journey-leg] ${name}: FAILED - ${firstLine(e)}`)
  }
}

// ---------------------------------------------------------------------------
// Logging before judging, wire capture
// ---------------------------------------------------------------------------

/** Names the subject of the next assertion so a red names what it judged. */
async function logSubject(label: string, loc: Locator): Promise<void> {
  const count = await loc.count()
  let ident = '(none)'
  if (count > 0) {
    ident = await loc
      .first()
      .evaluate((el) => {
        const t = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
        return `testid=${el.getAttribute('data-testid') ?? '-'} tag=${el.tagName.toLowerCase()} hidden=${(el as HTMLElement).hidden} text="${t}"`
      })
      .catch((e) => `(unreadable: ${firstLine(e)})`)
  }
  console.log(`[journey-subject] ${label}: count=${count} first: ${ident}`)
}

/** Requests before the beforeAll reload (the wake's own pre-seed read) are not this journey's to count. */
let epochSeq = 0
function pileRequests(): WireEvent[] {
  return wire.filter((e) => e.kind === 'pile-request' && e.seq > epochSeq)
}
/** ANSWERED unfiltered reads: robust to a dev-mode request that is aborted and re-issued (J7), and still one per real read. */
function pileAnswered(): WireEvent[] {
  return wire.filter((e) => e.kind === 'pile-answered' && e.seq > epochSeq)
}
function pileCount(): number {
  return pileAnswered().length
}
function logPile(label: string): number {
  const reqs = pileRequests()
  const ans = pileAnswered()
  console.log(
    `[journey-wire] ${label}: ${ans.length} ANSWERED unfiltered GET /v1/sightings (counted): ${ans.map((r) => `#${r.seq} ${r.status} ${r.url}`).join(' ; ') || '(none)'}; ${reqs.length} issued: ${reqs.map((r) => `#${r.seq} ${r.url}`).join(' ; ') || '(none)'}`,
  )
  return ans.length
}
/** Waits (frames, never a sleep) until `read()` has been equal on 15 consecutive samples; returns it (J4, J7). */
async function stableCount(read: () => number, label: string): Promise<number> {
  let last = read()
  let same = 0
  for (let i = 0; i < 400 && same < 15; i++) {
    await flushFrames()
    const now = read()
    same = now === last ? same + 1 : 0
    last = now
  }
  console.log(`[journey-wire] ${label}: count settled at ${last} (${same >= 15 ? 'stable' : 'NOT stable after 400 samples'})`)
  return last
}
const actingIds = async (): Promise<string> =>
  (await page.getByTestId('fleet-roster').locator('[data-active="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? '?'))).join(',')
/** Two animation frames: whatever a state change was going to issue has been issued. Not a sleep. */
async function flushFrames(): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
}

function installWireCapture(p: Page): void {
  p.on('request', (req) => {
    if (req.method() !== 'GET') return
    const u = new URL(req.url())
    if (!u.pathname.endsWith('/v1/sightings') || u.searchParams.get('systemId') !== null) return
    wire.push({ seq: ++wireSeq, at: Date.now(), kind: 'pile-request', url: `${u.pathname}${u.search}` })
  })
  p.on('response', (res) => {
    const req = res.request()
    const u = new URL(res.url())
    if (u.pathname.startsWith('/v1/') && res.status() >= 400) {
      const entry: HttpError = { method: req.method(), url: `${u.pathname}${u.search}`, status: res.status(), body: '(unread)' }
      httpErrors.push(entry)
      void res
        .text()
        .then((t) => {
          entry.body = t.slice(0, 600)
        })
        .catch(() => {
          entry.body = '(body unreadable)'
        })
    }
    if (req.method() === 'GET' && u.pathname.endsWith('/v1/sightings') && u.searchParams.get('systemId') === null) {
      wire.push({ seq: ++wireSeq, at: Date.now(), kind: 'pile-answered', url: `${u.pathname}${u.search}`, status: res.status() })
    }
    if (req.method() === 'GET' && homeSystemId && u.pathname === `/v1/systems/${homeSystemId}`) {
      wire.push({ seq: ++wireSeq, at: Date.now(), kind: 'interior-response', url: u.pathname, status: res.status() })
    }
    if (req.method() === 'GET' && fleetId && u.pathname === '/v1/actions' && u.searchParams.get('actor') === fleetId && u.searchParams.get('status') === 'running') {
      const hasScan = res
        .json()
        .then((b: { actions?: { type?: string }[] }) => (b.actions ?? []).some((a) => a.type === 'scan'))
        .catch(() => true)
      wire.push({ seq: ++wireSeq, at: Date.now(), kind: 'running-response', url: `${u.pathname}${u.search}`, status: res.status(), hasScan })
    }
    if (req.method() === 'POST' && fleetId && u.pathname === `/v1/fleets/${fleetId}/scan`) {
      wire.push({ seq: ++wireSeq, at: Date.now(), kind: 'scan-post-response', url: u.pathname, status: res.status() })
    }
  })
}

// ---------------------------------------------------------------------------
// Dock driving, always through the real controls
// ---------------------------------------------------------------------------

async function expandDock(): Promise<void> {
  if (await page.getByTestId('console-dock-open').isVisible()) {
    await page.getByTestId('console-dock-open').click()
  }
  await expect(page.getByTestId('console-dock-collapse')).toBeVisible({ timeout: 10_000 })
}
async function collapseDock(): Promise<void> {
  if (await page.getByTestId('console-dock-collapse').isVisible()) {
    await page.getByTestId('console-dock-collapse').click()
  }
  await expect(page.getByTestId('console-dock-open')).toBeVisible({ timeout: 10_000 })
}
const rowsLoc = () => page.locator('[data-testid^="sighting-row-"]')
const selection = () => page.getByTestId('space-canvas-region').getAttribute('data-selection')

async function waitForViewReady(): Promise<void> {
  await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('space-loading')).toBeHidden({ timeout: 60_000 })
  await expect(page.getByTestId('console-dock-open')).toBeVisible({ timeout: 20_000 })
}

// ---------------------------------------------------------------------------
// Fixture, console capture, hard update-depth assertion
// ---------------------------------------------------------------------------

test.describe('the console dock keeps the Log tab mounted - read at open, same node across a collapse, Escape, not a pick, settle re-read', () => {
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
    installWireCapture(page)

    const interiors = captureInteriors(page)
    const corpBox = captureCorporationId(page)
    scanTargets = captureScanTargets(page)
    const woken = await wakeNewCorp(page, 'E2E Console Mounted', 'console-mounted')
    homeSystemId = woken.homeSystemId
    fleetId = woken.fleetId
    home = await interiors.get(homeSystemId)
    await expect.poll(() => corpBox.id, { timeout: 30_000, message: 'no corporation id was captured off POST /v1/corporations' }).not.toBeNull()
    const corpId = corpBox.id!

    // 51 records under a system that is NOT home (no ghost can be drawn for them), plus one in the home system.
    const stamp = Date.now()
    otherSystemId = `e2e-other-system-${stamp}`
    const hostId = home.features?.find((f) => f.type !== 'star')?.id ?? home.features![0]!.id
    const seedStart = Date.now()
    const BATCH = 10
    for (let from = 0; from < OTHER_SYSTEM_RECORDS; from += BATCH) {
      const batch: Promise<string>[] = []
      for (let i = from; i < Math.min(from + BATCH, OTHER_SYSTEM_RECORDS); i++) {
        batch.push(
          seedSightingFixture({
            corporationId: corpId,
            actionId: `e2e-mounted-action-${stamp}-${i}`,
            targetId: `e2e-mounted-target-${stamp}-${i}`,
            systemId: otherSystemId,
            hostId: `e2e-mounted-host-${i}`,
            asOf: 1_000 + i,
            position: { X: 8 + i, Y: 0, Z: 4 },
            velocity: { X: 0, Y: 0, Z: 0.2 },
            hullCount: 1,
            hullTypes: ['scout'],
          }),
        )
      }
      await Promise.all(batch)
    }
    homeRecordId = await seedSightingFixture({
      corporationId: corpId,
      actionId: `e2e-mounted-home-action-${stamp}`,
      targetId: `e2e-mounted-home-target-${stamp}`,
      systemId: homeSystemId,
      hostId,
      asOf: 1,
      position: { X: 8, Y: 0, Z: 4 },
      velocity: { X: 0, Y: 0, Z: 0.2 },
      hullCount: 1,
      hullTypes: ['scout'],
    })
    const seedMs = Date.now() - seedStart
    console.log(
      `[journey-budget] seed: ${seedMs} ms for ${SEEDED_TOTAL} records (10 parallel PATCHes per batch) - ${seedMs > 30_000 ? 'THREATENS the beforeAll 60 s budget (no timeout was raised)' : 'does not threaten the beforeAll 60 s budget'}`,
    )

    console.log(`[journey-ran] keep-console-tab-content-mounted: fixture provisioned (env=${cfg.env}); legs follow, then a [journey-summary] block and a closing [journey-ran ... ALL legs accounted] line`)
    const reloadMark = pileCount()
    epochSeq = wireSeq
    await page.reload()
    await waitForViewReady()
    console.log(
      `[journey-fixture] home ${homeSystemId}, fleet ${fleetId}, corp ${corpId}, other system ${otherSystemId}, home record ${homeRecordId}, unfiltered requests before the reload ${reloadMark}`,
    )
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
  // 1. The log reads at view open, collapsed; expand, load more, stay mounted across a collapse
  // =========================================================================
  test('1: collapsed at open the log has read once; expand, load more; Escape and re-expand keep the same node, the same pages and the no-mark statement', async () => {
    await runLeg('expand-load-more', async () => {
      await expect(page.getByTestId('console-dock-open'), 'the dock opens collapsed after the reload').toBeVisible({ timeout: 20_000 })
      // The rows are attached (hidden) before any expansion: the log read at view open.
      await logSubject('log rows attached while the dock is collapsed (expect the first page, 50)', rowsLoc())
      await expect(rowsLoc(), 'the first page (50 rows) is in the DOM before any expansion: the log read at view open').toHaveCount(PAGE_SIZE, { timeout: 20_000 })
      await expect(page.getByTestId('sighting-log'), 'the log is not shown while the dock is collapsed').toBeHidden()
      await stableCount(pileCount, 'after the reload, dock collapsed')
      const n = logPile('after the reload, dock collapsed')
      expect(n, 'exactly one unfiltered GET /v1/sightings was ANSWERED after the reload, with the dock never expanded').toBe(1)

      await page.getByTestId('console-dock-open').click()
      await expect(page.getByTestId('console-dock-collapse')).toBeVisible({ timeout: 10_000 })
      await flushFrames()
      const afterExpand = logPile('after the first expansion')
      expect(afterExpand, 'the first expansion issued no unfiltered request').toBe(1)
      await expect(page.getByTestId('console-panel-log').getByTestId('sighting-log')).toBeVisible()
      await expect(rowsLoc(), 'the first page is listed (50 rows)').toHaveCount(PAGE_SIZE)

      const more = page.getByTestId('sighting-log-load-more')
      await logSubject('load-more control', more)
      await expect(more, 'a second page exists (the server pages at 50)').toBeVisible()
      await more.click()
      await expect(rowsLoc(), `after load more every seeded record is listed (${SEEDED_TOTAL})`).toHaveCount(SEEDED_TOTAL, { timeout: 15_000 })
      logPile('after load more')

      await page.getByTestId('sighting-log').evaluate((el) => {
        ;(el as unknown as { __journeyLogNode: boolean }).__journeyLogNode = true
      })
      logTagged = true
    })

    await runLeg('escape-same-node', async () => {
      await expandDock()
      const log = page.getByTestId('sighting-log')
      if (!logTagged) {
        console.log('[journey-leg-data] escape-same-node: leg 1 did not tag the node; tagging now (identity is still judged across the collapse below)')
        await log.evaluate((el) => {
          ;(el as unknown as { __journeyLogNode: boolean }).__journeyLogNode = true
        })
      }
      await expect(rowsLoc(), 'every seeded record is listed before the collapse').toHaveCount(SEEDED_TOTAL)

      // The first row is an other-system record: no ghost can be drawn for it.
      const row = rowsLoc().first()
      await logSubject('first row (an other-system record), about to be selected', row)
      const rowTestId = await row.getAttribute('data-testid')
      await row.click()
      await expect(row, 'selecting a row with no ghost shows its no-mark statement').toContainText('This record has no mark in the open system.')
      await expect(row).toBeFocused()

      // Leg 3's observation: the panel's scroll offset across this collapse.
      const panel = page.getByTestId('console-panel-log')
      await panel.evaluate((el) => {
        el.scrollTop = 240
      })
      scrollBefore = await panel.evaluate((el) => `scrollTop=${el.scrollTop} scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight}`)

      const before = await stableCount(pileCount, 'before the Escape')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('console-dock-region'), 'Escape with focus in the panel collapsed the dock').toBeHidden({ timeout: 10_000 })
      await expect(page.getByTestId('console-dock-open'), 'focus moved to the Console control').toBeFocused()
      await logSubject('log after the Escape (expect count 1, hidden)', log)
      await expect(log, 'the log element is still attached while collapsed').toHaveCount(1)
      await expect(log, 'the log is hidden while collapsed').toBeHidden()
      const display = await page.getByTestId('console-dock-region').evaluate((el) => getComputedStyle(el).display)
      console.log(`[journey-leg-data] escape-same-node: region computed display while collapsed = ${display} (the app stylesheet must not defeat hidden)`)
      expect(display, 'the stylesheet does not defeat the hidden attribute on the log region').toBe('none')

      await page.getByTestId('console-dock-open').click()
      await expect(page.getByTestId('console-dock-collapse')).toBeVisible({ timeout: 10_000 })
      await flushFrames()
      scrollAfter = await panel.evaluate((el) => `scrollTop=${el.scrollTop} scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight}`)
      await logSubject('log after the re-expansion', log)
      const sameNode = await log.evaluate((el) => (el as unknown as { __journeyLogNode?: boolean }).__journeyLogNode === true)
      console.log(`[journey-leg-data] escape-same-node: tagged node survived the collapse and re-expansion: ${sameNode}`)
      expect(sameNode, 'the log element is the SAME DOM NODE after the collapse (it carries the property set before it)').toBe(true)
      await expect(rowsLoc(), 'the same pages are listed after the re-expansion (50 + the page loaded by load more)').toHaveCount(SEEDED_TOTAL)
      await logSubject(`row ${rowTestId} after the re-expansion`, page.getByTestId(rowTestId!))
      await expect(
        page.getByTestId(rowTestId!),
        "the selected row's no-mark statement (the log's only local state) survived the collapse",
      ).toContainText('This record has no mark in the open system.')
      await stableCount(pileCount, 'after Escape and re-expansion')
      const after = logPile('after Escape and re-expansion')
      expect(after, `no unfiltered request between the Escape and the end of the leg (was ${before})`).toBe(before)
    })

    await runLeg(
      'scroll-offset',
      async () => {
        console.log(`[journey-observation] scroll-offset: before the collapse ${scrollBefore}; after the re-expansion ${scrollAfter} (RULING 8: logged, never asserted)`)
      },
      true,
    )

    await runLeg('highlight-survives', async () => {
      await expandDock()
      const mark = page.getByTestId(`sighting-mark-${homeRecordId}`)
      try {
        await mark.waitFor({ state: 'attached', timeout: 5_000 })
      } catch {
        return {
          untested: `no ghost mark sighting-mark-${homeRecordId} is drawn for the seeded home-system record (docs/handoffs/defect-seeded-sighting-ghost-not-drawn.md); tier-1 cover is 1.2`,
        }
      }
      const row = page.getByTestId(`sighting-row-${homeRecordId}`)
      await logSubject('the home-system record row (page two), about to be activated', row)
      await row.click()
      await expect(row, 'precondition: activating the row of a drawn ghost highlights it').toHaveAttribute('data-highlighted', 'true')
      await collapseDock()
      await expandDock()
      await logSubject('the same row after collapse and re-expansion', row)
      await expect(row, "the selected row's highlight survives a collapse and re-expand").toHaveAttribute('data-highlighted', 'true')
    })
  })

  // =========================================================================
  // 2. Escape with the menu open; a press on the dock is not a pick; Escape from a camera control
  // =========================================================================
  test('2: the fleet menu takes the first Escape; a pointer press on the dock picks nothing; Escape from a camera control keeps focus there', async () => {
    await runLeg('menu-open-escape', async () => {
      await expandDock()
      const chevron = page.getByTestId('vitals-fleet-chevron')
      await chevron.click()
      const menu = page.getByTestId('vitals-fleet-menu')
      await logSubject('fleet menu, opened by the chevron', menu)
      await expect(menu, "the fleet cell's menu is open").toBeVisible({ timeout: 10_000 })
      await page.keyboard.press('Escape')
      await flushFrames()
      await expect(menu, 'the first Escape closed the menu').toHaveCount(0)
      await expect(chevron, 'focus returned to the chevron').toBeFocused()
      await flushFrames()
      await expect(page.getByTestId('console-dock-region'), 'the dock stayed expanded under the first Escape (the menu handler won)').toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('console-dock-region'), 'the second Escape collapsed the dock').toBeHidden({ timeout: 10_000 })
      await expect(page.getByTestId('console-dock-open')).toBeVisible()
    })

    await runLeg('press-on-dock-not-a-pick', async () => {
      await collapseDock()
      const bodyId =
        home.features.find((f) => f.type !== 'star' && f.type !== 'station')?.id ?? home.features.find((f) => f.type !== 'star')?.id
      expect(bodyId, 'the served home interior carries a body other than the star').toBeTruthy()
      console.log(`[journey-subject] press-on-dock: selecting body ${bodyId}`)
      await selectBody(page, bodyId!)
      const selected = await selection()
      const acting = await actingIds()
      console.log(`[journey-leg-data] press-on-dock: data-selection after the pick = ${JSON.stringify(selected)}; acting fleet row(s) data-active=true: ${JSON.stringify(acting)}`)
      expect(acting, 'precondition: the roster marks an acting fleet').not.toBe('')
      const unchanged = async (what: string) => {
        await flushFrames()
        expect(await selection(), `${what} left the selection unchanged`).toBe(selected)
        expect(await actingIds(), `${what} left the acting fleet unchanged`).toBe(acting)
      }
      expect(selected, 'precondition: a body is selected before the presses').toBe(bodyId)

      await page.getByTestId('console-dock-open').click()
      await expect(page.getByTestId('console-dock-collapse')).toBeVisible({ timeout: 10_000 })
      await unchanged('pressing the Console control')

      // A real pointer press at a point, after naming what is under it.
      const pressAt = async (label: string, x: number, y: number) => {
        const hit = await page.evaluate(
          ([px, py]) => {
            const el = document.elementFromPoint(px!, py!)
            return el ? `${el.tagName.toLowerCase()} testid=${el.getAttribute('data-testid') ?? '-'} role=${el.getAttribute('role') ?? '-'}` : 'nothing'
          },
          [x, y],
        )
        console.log(`[journey-subject] press-on-dock: ${label} at ${Math.round(x)},${Math.round(y)} lands on ${hit}`)
        await page.mouse.click(x, y)
      }

      const region = page.getByTestId('console-dock-region')
      const tabBarBox = await region.locator(':scope > div').first().boundingBox()
      expect(tabBarBox, 'the tab bar row has a box').not.toBeNull()
      await pressAt('the tab bar empty area', tabBarBox!.x + tabBarBox!.width / 2, tabBarBox!.y + tabBarBox!.height / 2)
      await unchanged('a press on the tab bar')

      // The panel's empty area: the first point along the panel's mid-line that is not a control.
      const panelBox = await page.getByTestId('console-panel-log').boundingBox()
      expect(panelBox, 'the panel has a box').not.toBeNull()
      const py = panelBox!.y + panelBox!.height / 2
      const px = await page.evaluate(
        ([x0, w, y]) => {
          for (let dx = w! - 4; dx > 0; dx -= 6) {
            const el = document.elementFromPoint(x0! + dx, y!)
            if (el && el.closest('[data-testid="console-panel-log"]') && !el.closest('button, a, input, select')) return x0! + dx
          }
          return null
        },
        [panelBox!.x, panelBox!.width, py],
      )
      console.log(`[journey-leg-data] press-on-dock: panel empty-area x = ${px}`)
      expect(px, 'a point inside the panel that is not a control was found').not.toBeNull()
      await pressAt('the panel empty area', px!, py)
      await unchanged('a press on the panel')
      await expect(page.getByTestId('console-dock-region'), 'the presses so far collapsed nothing').toBeVisible()

      // Every remaining dock part, pressed with the body still selected; the collapse control last.
      const parts: [string, Locator][] = [
        ['the Log tab', page.getByTestId('console-tab-log')],
        ['the log Refresh control', page.getByRole('button', { name: 'Refresh sighting log' })],
        ['a log row', rowsLoc().first()],
        ['Load more', page.getByTestId('sighting-log-load-more')],
        ['the collapse control', page.getByTestId('console-dock-collapse')],
      ]
      for (const [name, loc] of parts) {
        await logSubject(`press-on-dock: about to press ${name}`, loc)
        if ((await loc.count()) === 0) {
          console.log(`[journey-leg-data] press-on-dock: ${name} is not on the view (all pages are loaded), nothing to press`)
          continue
        }
        await loc.first().click()
        await unchanged(`pressing ${name}`)
      }
    })

    await runLeg('escape-from-camera-control', async () => {
      await expandDock()
      const control = page.getByTestId('space-camera-controls').locator('button').first()
      await logSubject('first real control in space-camera-controls', control)
      await expect(control, 'the camera cluster carries a button').toHaveCount(1)
      await control.focus()
      await expect(control, 'precondition: the camera control holds focus').toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('console-dock-region'), 'Escape with focus on a camera control collapsed the dock').toBeHidden({ timeout: 10_000 })
      await expect(control, 'focus stayed on the camera control').toBeFocused()
    })
  })

  // =========================================================================
  // 3. A failed unfiltered read, collapsed, then expanded
  // =========================================================================
  test('3: the unfiltered read fails while the dock is collapsed; expanding shows the failed state, not empty and not loading', async () => {
    await runLeg('failed-while-collapsed', async () => {
      let forced = 0
      const unfilteredOnly = (url: URL) => url.pathname.endsWith('/v1/sightings') && url.searchParams.get('systemId') === null
      const body = '{"error":"forced by e2e (keep-console-tab-content-mounted)"}'
      await page.route(
        unfilteredOnly,
        (route) => {
          forced++
          console.log(`[journey-http] forced 500 #${forced} on ${route.request().url()} body=${body}`)
          return route.fulfill({ status: 500, contentType: 'application/json', body })
        },
      )
      try {
        await page.reload()
        await waitForViewReady()
        await expect.poll(() => forced, { timeout: 20_000, message: 'the unfiltered read was never issued (and so never failed) at view open' }).toBeGreaterThan(0)
        const forcedBefore = await stableCount(() => forced, 'forced failures before the expansion')
        await expect(page.getByTestId('console-dock-open'), 'the dock is collapsed').toBeVisible()
        await page.getByTestId('console-dock-open').click()
        await expect(page.getByTestId('console-dock-collapse')).toBeVisible({ timeout: 10_000 })
        const panel = page.getByTestId('console-panel-log')
        await logSubject('the failed state in the panel', panel.getByTestId('sighting-log-error'))
        await expect(panel.getByTestId('sighting-log-error'), 'the log shows its failed state').toBeVisible({ timeout: 10_000 })
        await expect(panel.getByTestId('sighting-log-error').getByRole('button', { name: 'Retry' }), 'the failed state carries its Retry').toBeVisible()
        await expect(panel.getByTestId('sighting-log-empty'), 'a failed read is not rendered as empty').toHaveCount(0)
        await expect(panel.getByText('Reading the pile…'), 'a failed read is not rendered as loading').toHaveCount(0)
        await stableCount(() => forced, 'forced failures after the expansion')
        console.log(`[journey-wire] failed-while-collapsed: forced failures before the expansion ${forcedBefore}, after ${forced}`)
        expect(forced, 'the expansion issued no further unfiltered read after the failure (an errored query is stale at once, so a remounting build would re-read)').toBe(forcedBefore)
      } finally {
        await page.unroute(unfilteredOnly).catch(() => undefined)
        try {
          await page.reload()
          await waitForViewReady()
        } catch (e) {
          console.log(`[journey-leg-data] failed-while-collapsed: the restoring reload failed: ${firstLine(e)}`)
        }
      }
    })
  })

  // =========================================================================
  // 4. The settle re-read, with the dock collapsed throughout
  // =========================================================================
  test('4: a sweep settles with the dock collapsed; the unfiltered pile is read again, the clean-sweep row is listed with zero requests caused by the expansion', async () => {
    await runLeg('settle-reread-collapsed', async () => {
      await collapseDock()
      const stationId = stationFeatureId(home)
      if (!stationId) {
        return { untested: 'the served home interior has no station feature to dock at (random-spawn family: defect-space-journey-instant-station-burn.md, defect-scan-journey-spawn-in-gate-range.md)' }
      }
      try {
        await selectFirstBodyMatching(page, stationId)
        await burnToSelectionAndDock(page, fleetId, DOCK_BUDGET_MS)
      } catch (e) {
        return { untested: `the fleet could not be docked at the home station within ${DOCK_BUDGET_MS} ms (${firstLine(e)})` }
      }
      try {
        await expect(page.getByTestId('scan-control')).toBeVisible({ timeout: 10_000 })
        await expect.poll(() => (scanTargets.get(fleetId) ?? []).length, { timeout: 15_000 }).toBeGreaterThan(0)
      } catch {
        return { untested: 'no scan target is served in range for the docked fleet (random-spawn family)' }
      }
      const targets = scanTargets.get(fleetId)!
      const nearest = targets.reduce((a, b) => (b.durationMs < a.durationMs ? b : a))
      const wallMs = Math.ceil(nearest.durationMs / WORLD_SCALE) + SETTLE_CUSHION_MS
      console.log(`[journey-leg-data] settle-reread-collapsed: nearest target ${nearest.hostId} durationMs ${nearest.durationMs} -> wall wait ${wallMs} ms (cap ${SWEEP_BUDGET_MS})`)
      if (wallMs > SWEEP_BUDGET_MS) {
        return { untested: `the nearest target's sweep needs ${wallMs} ms of wall time, over the ${SWEEP_BUDGET_MS} ms budget` }
      }
      await page.getByTestId('scan-control').scrollIntoViewIfNeeded({ timeout: 5_000 })
      const seqBeforeCommit = wireSeq
      try {
        await commitScan(page, nearest.hostId)
        await expect(page.getByTestId('scan-countdown')).toBeVisible({ timeout: 10_000 })
      } catch (e) {
        const posts = wire.filter((x) => x.seq > seqBeforeCommit && x.kind === 'scan-post-response')
        await flushFrames()
        return {
          untested: `the sweep commit was not accepted (${firstLine(e)}); scan POST responses: ${JSON.stringify(posts.map((p) => p.status))}; any 4xx body is in [journey-http] (printed by afterEach)`,
        }
      }
      // From here the commit WAS accepted: a missing report or a missing re-read is a FAILURE, never UNTESTED (J1).
      sweepCommitted = true
      const commitAt = Date.now()
      console.log(`[journey-leg-data] settle-reread-collapsed: commit ACCEPTED (countdown shown); the leg is must-PASS from here`)
      await expect(page.getByTestId('scan-report'), `a committed sweep's report appears within ${wallMs} ms of wall time`).toBeVisible({ timeout: wallMs })
      const reportAt = Date.now()
      await flushFrames()
      await expect(page.getByTestId('console-dock-open'), 'the dock was kept collapsed through the sweep').toBeVisible()
      const reportText = ((await page.getByTestId('scan-report').textContent()) ?? '').slice(0, 160)
      console.log(`[journey-subject] settle-reread-collapsed: report text ${JSON.stringify(reportText)}`)

      // The exit is DECIDED AND LOGGED for the record. The assertion below is a LIVENESS witness on the wire
      // (J3): a post-commit unfiltered read was answered while the dock was collapsed and never expanded.
      // EXACT ORDER (the read follows the settling interior read) is tier 1's: 1.10, 1.11, 1.12.
      const etaAt = commitAt + Math.ceil(nearest.durationMs / WORLD_SCALE)
      const afterCommit = wire.filter((e) => e.seq > seqBeforeCommit)
      const postSeq = afterCommit.find((e) => e.kind === 'scan-post-response')?.seq ?? seqBeforeCommit
      const runningNoScan: WireEvent[] = []
      for (const e of afterCommit.filter((x) => x.kind === 'running-response')) {
        if (!(await e.hasScan)) runningNoScan.push(e)
      }
      const earlyCandidate = runningNoScan.find((e) => e.seq > postSeq && e.at < etaAt - 1_500)
      const exit: 'early-settle' | 'eta' = earlyCandidate ? 'early-settle' : 'eta'
      console.log(
        `[journey-leg-data] settle-reread-collapsed: SETTLE EXIT = ${exit} (for the record; order is not asserted here). scan POST response #${postSeq}; commit->report ${reportAt - commitAt} ms, eta estimate ${etaAt - commitAt} ms; no-scan running-status responses after the POST: ${runningNoScan.filter((e) => e.seq > postSeq).map((e) => `#${e.seq}@+${e.at - commitAt}ms`).join(',') || '(none)'}; interior responses after the commit: ${afterCommit.filter((e) => e.kind === 'interior-response').map((e) => `#${e.seq}@+${e.at - commitAt}ms`).join(',') || '(none)'}`,
      )
      logPile('after the report appeared, dock still collapsed')
      await expect
        .poll(() => pileAnswered().some((r) => r.seq > postSeq), {
          timeout: 5_000,
          message: `no unfiltered GET /v1/sightings was answered after the scan POST response #${postSeq} (settle exit ${exit}) while the dock was collapsed; answered: ${pileAnswered().map((r) => `#${r.seq}`).join(',') || '(none)'}`,
        })
        .toBe(true)
      await stableCount(pileCount, 'before the expansion')

      // Expand by the Console control (not the report's link): the row is listed, no request is caused.
      await expect(page.getByTestId('console-dock-open')).toBeVisible()
      const before = logPile('immediately before the expansion')
      await page.getByTestId('console-dock-open').click()
      await expect(page.getByTestId('console-dock-collapse')).toBeVisible({ timeout: 5_000 })
      const first = rowsLoc().first()
      await logSubject('first log row after the expansion (expect the swept host, clean sweep)', first)
      await expect(first, 'the first row names the swept host').toContainText(nearest.hostId, { timeout: 5_000 })
      await expect(first, 'the first row carries the clean-sweep marker').toContainText(/clean/i)
      await stableCount(pileCount, 'after the expansion')
      const after = logPile('after the expansion')
      expect(after, 'the expansion caused no unfiltered request').toBe(before)
    })
  })

  // =========================================================================
  // 5. Warm return, observation-only Escapes, the other system
  // =========================================================================
  test('5: a client-side return from the galaxy route; Escape with a select popup or in a toast is logged; another system is untested by design', async () => {
    await runLeg('warm-return', async () => {
      await collapseDock().catch(() => undefined)
      const mark = wireSeq
      await page.getByTestId('nav-home').click()
      await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 })
      const rows = page.getByTestId('fleet-roster').locator('[data-testid^="fleet-row-"]')
      await expect(rows.first(), 'the galaxy roster lists the owned fleet').toBeVisible({ timeout: 30_000 })
      await rows.first().click()
      const enter = page.getByTestId('enter-system-button')
      await expect(enter, 'a selected system offers the drill-in control').toBeVisible({ timeout: 20_000 })
      const arrived = page.waitForURL(`**/systems/${homeSystemId}`, { timeout: 20_000 })
      await enter.click()
      await arrived
      await waitForViewReady()
      await flushFrames()
      const interior = wire.filter((e) => e.seq > mark && e.kind === 'interior-response')
      const piles = wire.filter((e) => e.seq > mark && e.kind === 'pile-request')
      console.log(
        `[journey-leg-data] warm-return: since leaving, interior responses ${interior.map((e) => `#${e.seq}`).join(',') || '(none)'}; unfiltered requests ${piles.map((e) => `#${e.seq} ${e.url}`).join(' ; ') || '(none)'}`,
      )
      if (interior.length === 0) {
        return { untested: 'no interior request was issued on the return (inside the 60 s stale time, as expected); the warm-cache latch is tier 1: 1.13, 1.14, 1.15 over the real interior hook' }
      }
      const firstInterior = interior[0]!
      const early = piles.filter((p) => p.seq < firstInterior.seq)
      expect(early, `no unfiltered read preceded the interior re-read's response #${firstInterior.seq}`).toEqual([])
    })

    await runLeg(
      'select-popup-escape',
      async () => {
        await expandDock()
        const select = page.getByTestId('scan-target-select')
        const present = await select.count()
        console.log(`[journey-subject] select-popup-escape: scan-target-select count=${present}`)
        if (present === 0) {
          console.log('[journey-observation] select-popup-escape: no native select is on the view in this state; nothing to observe')
          return
        }
        await select.focus()
        await page.keyboard.press('Alt+ArrowDown')
        await page.keyboard.press('Escape')
        const expanded = await page.getByTestId('console-dock-collapse').isVisible()
        console.log(`[journey-observation] select-popup-escape: after Escape with the select focused and (attempted) popup open, the dock is ${expanded ? 'still expanded' : 'collapsed'} (RULING 6: logged, never asserted)`)
      },
      true,
    )

    await runLeg(
      'toast-escape',
      async () => {
        const toasts = await page.locator('[data-sonner-toast]').count()
        console.log(`[journey-observation] toast-escape: ${toasts} toast(s) on the view; ${toasts === 0 ? 'none to focus, so nothing was observed' : 'a toast was present'} (RULING 6: logged, never asserted)`)
        if (toasts > 0) {
          await page.locator('[data-sonner-toast]').first().focus()
          const wasExpanded = await page.getByTestId('console-dock-collapse').isVisible()
          await page.keyboard.press('Escape')
          const isExpanded = await page.getByTestId('console-dock-collapse').isVisible()
          console.log(`[journey-observation] toast-escape: dock expanded before ${wasExpanded}, after Escape ${isExpanded}`)
        }
      },
      true,
    )

    await runLeg('other-system', async () => {
      return {
        untested:
          'UNTESTED by design: no player path reaches another system for a one-hull corporation without a jump (the same reason as console-dock-journey other-system-collapsed); tier-1 cover is the keyed remount in 2b-i',
      }
    })
  })

  // =========================================================================
  // 6. The summary and the closing assertion
  // =========================================================================
  test('6: the must-pass legs passed and no leg failed', async () => {
    console.log('[journey-summary] ===== leg outcomes =====')
    for (const n of LEG_NAMES) {
      const o = legs.get(n)!
      console.log(`[journey-summary] ${n}${MUST_PASS.includes(n) ? ' (MUST PASS)' : ''}: ${o.status}${o.note ? ` - ${o.note}` : ''}`)
    }
    console.log('[journey-summary] ========================')
    const failed = LEG_NAMES.filter((n) => legs.get(n)!.status === 'FAILED').map((n) => `${n}: ${legs.get(n)!.note}`)
    expect(failed, 'legs that FAILED (each message is the first assertion that broke; the [journey-subject] / [journey-wire] lines above name what it judged)').toEqual([])
    for (const n of MUST_PASS) {
      expect(legs.get(n)!.status, `must-PASS leg ${n} is ${legs.get(n)!.status} (${legs.get(n)!.note})`).toBe('PASSED')
    }
    if (sweepCommitted) {
      expect(legs.get('settle-reread-collapsed')!.status, `a sweep commit was accepted, so settle-reread-collapsed is must-PASS (${legs.get('settle-reread-collapsed')!.note})`).toBe('PASSED')
    }
    console.log(`[journey-ran] keep-console-tab-content-mounted: ALL ${LEG_NAMES.length} legs accounted for; must-PASS legs PASSED; settle leg must-PASS-when-reached: ${sweepCommitted ? 'reached and PASSED' : 'not reached (UNTESTED by draw)'}`)
  })
})
