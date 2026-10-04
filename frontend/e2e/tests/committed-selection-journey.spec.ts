import { test, expect, type Page, type Request } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import { captureInteriors, selectBody, stationFeatureId, wakeNewCorp } from '../helpers/space-view'

/**
 * The committed-selection journey — openspec change
 * `clear-burn-preview-on-commit` (task 7.3), archive gate
 * (`docs/testing-tiers.md` tier 4). Revised in the gate's batched round
 * (RULING 17) after the first run failed a 50 s flight precondition the stack
 * cannot meet: the spawn home offers about 4.4 s of wall flight at world
 * scale 5. NOT run at the time of writing.
 *
 * THE DESIGN: the legs scale to the flight actually available, decided from
 * the quote BEFORE committing. Every selectable target (bodies, moons, belts,
 * the station AND the served lane gates) is quoted; the longest flight is the
 * committed target. A quote that never answers is recorded as exactly that
 * (a missed quote), distinct from "the system is compact".
 *
 * THE LEGS (each ends PASSED or UNTESTED; a final summary block prints them):
 *   keyboard-focus        commit by Enter on a focused Burn, focus is not the
 *                         statement, Tab lands in the command column, not <body>.
 *   committed-render-hold the six quote elements gone, the statement with the
 *                         exact copy, Burn disabled and described by it, no
 *                         uncapped label; sampled in-page every 25 ms from the
 *                         first statement THROUGH the first own-fleets read
 *                         answered after the acceptance, with >= 1 snapshot
 *                         after it; the read reports the burn; the commit
 *                         response's burn instants are printed beside the read's.
 *   one-order-no-preview  exactly one order POST; no preview POST for the
 *                         committed body between the acceptance and the end of
 *                         that order.
 *   second-activation     a second activation of Burn sends no order.
 *   zero-preview-2-intervals  task 7.3's two-interval window; attempted only
 *                         when the flight is >= two intervals + margin of wall
 *                         time, otherwise UNTESTED (covered at tier 1 by view
 *                         tests 3.1 and 3.4).
 *   another-target-and-back  another target quoted (figures, Burn enabled, no
 *                         statement); the committed body re-selected returns
 *                         the statement with no preview request.
 *   cut-the-drive         statement gone, Burn enabled, a preview request for
 *                         the kept selection at that transition.
 *   arrive-and-dock       statement gone, figures absent, no preview request
 *                         across one interval.
 *
 * ORDERING. Commit 1 runs the first four legs (cheap, back to back), then, from
 * the flight still remaining: another-target-and-back if it fits; the cut on
 * commit 1 only if the flight can hold it after that; otherwise commit 1 is let
 * arrive (arrive-and-dock) and the cut-the-drive leg is taken on a SECOND commit
 * where it is the FIRST thing done after the acceptance. If the cut was taken on
 * commit 1, the second commit is the one that arrives.
 *
 * UNTESTED vs FAILED. A leg whose wait cannot be satisfied because the order
 * has ENDED (the roster row no longer reads "under way", read as UI evidence at
 * the moment of failure) is a fixture/timing outcome: logged UNTESTED with the
 * reason and the run continues. The same failure while the row still reads
 * "under way" is the product showing the wrong thing and FAILS.
 *
 * THE CLOSING ASSERTION. The legs that close QA's two BLOCKED rows
 * (keyboard-focus, committed-render-hold) must be PASSED; a run that reaches
 * neither proves nothing about this change and fails.
 *
 * LOGGED, NOT ASSERTED: `commit-drift-notice` and `commit-stranding-notice`
 * after each real commit and what follows the cut. UNTESTED by design: the
 * stranding-notice leg (no deterministic fixture on the real wire) and the
 * optional reload leg (a reload ends the committed state, RULING 4).
 *
 * SCALE: the e2e stack is warped (`WORLD_TIME_SCALE=5`); preview cadence is
 * WALL time (`PREVIEW_REFRESH_MS`). No timeout is raised to make a leg pass.
 */
const cfg = resolveE2EConfig()

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 720 },
})

test.setTimeout(900_000)

const PREVIEW_INTERVAL_MS = 10_000
const SLACK_MS = 2_000
/** A flight must hold: the statement, one own-fleets read, and a snapshot after it. */
const MIN_HOLD_FLIGHT_WALL_MS = 2_000
/** Flight (wall) the another-target-and-back leg needs: select, quote, re-select. */
const ANOTHER_TARGET_NEEDS_MS = 2_500
/** Flight (wall) the cut leg needs: the cut button, the round trip, the transition. */
const CUT_NEEDS_MS = 2_500
/** The two-interval window needs two intervals plus this margin of wall flight. */
const TWO_INTERVAL_MARGIN_MS = 3_000
const MAX_CANDIDATES = 24

const SELECTION_COMMITTED_STATEMENT =
  'A burn order is committed to this target, so Burn is unavailable for it. Select another target to change course.'

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

// ---------------------------------------------------------------------------
// Wire recorders
// ---------------------------------------------------------------------------

const PREVIEW_URL = /\/v1\/fleets\/[^/]+\/orders\/preview$/
const ORDER_URL = /\/v1\/fleets\/[^/]+\/orders$/
const FLEETS_URL = /\/v1\/fleets$/

interface Burn {
  DepartMs?: number
  ArriveMs?: number
}
interface WireFleet {
  id?: string
  state?: { Mode?: string; Burn?: Burn | null }
}

interface PreviewPost {
  at: number
  bodyId: string | null
}
interface PreviewAnswer {
  at: number
  bodyId: string | null
  status: number
  flightWorldMs: number | null
}
interface OrderPost {
  at: number
}
interface OrderAnswer {
  at: number
  status: number
  body: WireFleet | null
}
interface FleetsRead {
  startAt: number
  endAt: number | null
  scale: number | null
  fleets: WireFleet[] | null
}

function bodyIdOf(req: Request): string | null {
  try {
    const b = req.postDataJSON() as { bodyId?: string } | null
    return b?.bodyId ?? null
  } catch {
    return null
  }
}

function recordWire(page: Page) {
  const previewPosts: PreviewPost[] = []
  const previewAnswers: PreviewAnswer[] = []
  const orderPosts: OrderPost[] = []
  const orderAnswers: OrderAnswer[] = []
  const reads: FleetsRead[] = []
  const readByRequest = new Map<Request, FleetsRead>()

  page.on('request', (req) => {
    const path = new URL(req.url()).pathname
    const now = Date.now()
    if (req.method() === 'POST' && PREVIEW_URL.test(path)) {
      previewPosts.push({ at: now, bodyId: bodyIdOf(req) })
    } else if (req.method() === 'POST' && ORDER_URL.test(path)) {
      orderPosts.push({ at: now })
    } else if (req.method() === 'GET' && FLEETS_URL.test(path) && req.url().includes('mine=true')) {
      const read: FleetsRead = { startAt: now, endAt: null, scale: null, fleets: null }
      reads.push(read)
      readByRequest.set(req, read)
    }
  })
  page.on('response', (res) => {
    const req = res.request()
    const path = new URL(res.url()).pathname
    const now = Date.now()
    if (req.method() === 'POST' && PREVIEW_URL.test(path)) {
      const answer: PreviewAnswer = { at: now, bodyId: bodyIdOf(req), status: res.status(), flightWorldMs: null }
      previewAnswers.push(answer)
      if (res.ok()) {
        void res
          .json()
          .then((b: { departMs?: number; arriveMs?: number }) => {
            if (typeof b.departMs === 'number' && typeof b.arriveMs === 'number') {
              answer.flightWorldMs = b.arriveMs - b.departMs
            }
          })
          .catch(() => undefined)
      }
    } else if (req.method() === 'POST' && ORDER_URL.test(path)) {
      const answer: OrderAnswer = { at: now, status: res.status(), body: null }
      orderAnswers.push(answer)
      void res
        .json()
        .then((b: WireFleet) => {
          answer.body = b
        })
        .catch(() => undefined)
    } else if (req.method() === 'GET' && readByRequest.has(req)) {
      const read = readByRequest.get(req)!
      void res
        .json()
        .then((b: { fleets?: WireFleet[]; scale?: number }) => {
          read.fleets = b.fleets ?? []
          read.scale = typeof b.scale === 'number' ? b.scale : null
        })
        .catch(() => undefined)
        .finally(() => {
          read.endAt = Date.now()
        })
    }
  })
  return { previewPosts, previewAnswers, orderPosts, orderAnswers, reads }
}

// ---------------------------------------------------------------------------
// DOM snapshots, taken inside the page
// ---------------------------------------------------------------------------

const FIGURE_IDS = [
  'preview-arrival',
  'preview-deltav',
  'preview-fuel',
  'preview-fuel-ceiling',
  'preview-affordable',
  'preview-stranding',
] as const

interface Snap {
  t: number
  statement: number
  statementText: string | null
  statementId: string | null
  burnDisabled: boolean
  burnDescribedBy: string | null
  uncapped: number
  figures: number
  noQuote: number
  stale: number
}

/** Starts a 25 ms in-page sampler, so a window is not at the mercy of a node-side round trip. */
async function startRecorder(page: Page): Promise<void> {
  await page.evaluate((figureIds) => {
    const w = window as unknown as { __snaps?: unknown[]; __snapTimer?: number }
    if (w.__snapTimer) window.clearInterval(w.__snapTimer)
    w.__snaps = []
    const count = (id: string) => document.querySelectorAll(`[data-testid="${id}"]`).length
    w.__snapTimer = window.setInterval(() => {
      const st = document.querySelector('[data-testid="selection-committed-statement"]')
      const burn = document.querySelector('[data-testid="burn-button"]') as HTMLButtonElement | null
      w.__snaps!.push({
        t: Date.now(),
        statement: count('selection-committed-statement'),
        statementText: st?.textContent ?? null,
        statementId: st?.id ?? null,
        burnDisabled: !!burn && burn.disabled,
        burnDescribedBy: burn?.getAttribute('aria-describedby') ?? null,
        uncapped: count('burn-uncapped-label'),
        figures: figureIds.reduce((n, id) => n + count(id), 0),
        noQuote: count('preview-no-quote'),
        stale: count('preview-stale'),
      })
    }, 25)
  }, [...FIGURE_IDS])
}

async function stopRecorder(page: Page): Promise<Snap[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __snaps?: unknown[]; __snapTimer?: number }
    if (w.__snapTimer) window.clearInterval(w.__snapTimer)
    w.__snapTimer = undefined
    return (w.__snaps ?? []) as never
  }) as Promise<Snap[]>
}

async function expectQuoteFigures(page: Page, why: string, timeout = 30_000): Promise<void> {
  const raw = /-?\d+(\.\d+)?/
  await expect(page.getByTestId('preview-arrival'), `${why}: preview-arrival`).toHaveAttribute('data-raw', raw, {
    timeout,
  })
  await expect(page.getByTestId('preview-deltav'), `${why}: preview-deltav`).toHaveAttribute('data-raw', raw)
  await expect(page.getByTestId('preview-fuel'), `${why}: preview-fuel`).toHaveAttribute('data-raw', raw)
  await expect(page.getByTestId('preview-fuel-ceiling'), `${why}: preview-fuel-ceiling`).toHaveAttribute(
    'data-raw',
    raw,
  )
}

async function expectNoQuoteElements(page: Page, why: string, timeout = 20_000): Promise<void> {
  for (const id of FIGURE_IDS) {
    await expect(page.getByTestId(id), `${why}: ${id} must not render`).toHaveCount(0, { timeout })
  }
}

/** A polled wall-time window, never a sleep. */
async function waitWallMs(ms: number, message: string): Promise<void> {
  const start = Date.now()
  await expect.poll(() => Date.now() - start >= ms, { timeout: ms + 30_000, intervals: [250], message }).toBe(true)
}

/** Two animation frames: every React commit and event already queued has landed. */
async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

const LEG_NAMES = [
  'keyboard-focus',
  'committed-render-hold',
  'one-order-no-preview',
  'second-activation',
  'zero-preview-2-intervals',
  'another-target-and-back',
  'cut-the-drive',
  'arrive-and-dock',
] as const
type LegName = (typeof LEG_NAMES)[number]
type LegOutcome = { status: 'PASSED' | 'UNTESTED' | 'FAILED' | 'NOT REACHED'; note: string }

interface Target {
  id: string
  kind: string
}
interface Quote extends Target {
  status: number
  flightWorldMs: number
}

function firstLine(e: unknown): string {
  return String((e as Error)?.message ?? e).split('\n')[0]!.slice(0, 300)
}

/** Polled boolean condition; never a sleep. */
async function pollUntil(cond: () => boolean | Promise<boolean>, timeoutMs: number, message: string): Promise<boolean> {
  try {
    await expect.poll(async () => cond(), { timeout: timeoutMs, intervals: [50, 100, 250], message }).toBe(true)
    return true
  } catch {
    return false
  }
}

test.describe('the committed selection — quote, commit, hold, release, re-commit, arrive', () => {
  test('a committed burn withholds its own quote and Burn for that target until the order ends, and nothing else', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)
    const wire = recordWire(page)
    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E Committed', 'committed')
    const row = page.getByTestId(`fleet-row-${fleetId}`)
    const panel = page.getByTestId('preview-panel')
    const burn = page.getByTestId('burn-button')
    const statement = page.getByTestId('selection-committed-statement')
    const cutButton = page.getByTestId(`fleet-cmd-cut-drive-${fleetId}`)

    const legs = new Map<LegName, LegOutcome>(LEG_NAMES.map((n) => [n, { status: 'NOT REACHED', note: 'the walk never got there' }]))
    const markPassed = (n: LegName, note = '') => legs.set(n, { status: 'PASSED', note })
    const markUntested = (n: LegName, note: string) => {
      legs.set(n, { status: 'UNTESTED', note })
      console.log(`[journey-leg] ${n}: UNTESTED — ${note}`)
    }
    /** UI evidence that the order is over: the roster row no longer reads "under way". */
    const orderEnded = async () => !/under way/i.test((await row.textContent()) ?? '')
    /**
     * Runs a leg. A throw while the order has ended is a fixture/timing outcome
     * (UNTESTED, continue); a throw while the row still reads "under way" is the
     * product showing the wrong thing (FAILED, rethrown).
     */
    async function runLeg(name: LegName, fn: () => Promise<{ untested: string } | void>): Promise<void> {
      try {
        const r = await fn()
        if (r && 'untested' in r) markUntested(name, r.untested)
        else markPassed(name)
      } catch (e) {
        if (await orderEnded()) {
          markUntested(name, `the order ended before this leg could complete (fixture/timing, not a finding): ${firstLine(e)}`)
        } else {
          legs.set(name, { status: 'FAILED', note: firstLine(e) })
          throw e
        }
      }
    }

    try {
      const home = await interiors.get(homeSystemId)
      const stationId = stationFeatureId(home)

      // -----------------------------------------------------------------
      // Step 0 — quote EVERY selectable target: bodies, moons, belts, the
      // station and the served lane gates. A missed quote is a recorded fact.
      // -----------------------------------------------------------------
      const targets: Target[] = []
      const seen = new Set<string>()
      for (const f of home.features ?? []) {
        if (f.type === 'star' || seen.has(f.id)) continue
        seen.add(f.id)
        targets.push({ id: f.id, kind: f.type })
      }
      for (const g of home.laneGates ?? []) {
        if (!g.id || seen.has(g.id)) continue
        seen.add(g.id)
        targets.push({ id: g.id, kind: 'lane-gate' })
      }
      const candidates = targets.slice(0, MAX_CANDIDATES)
      console.log(`[journey-step0] ${candidates.length} selectable target(s) offered: ${candidates.map((t) => `${t.id}(${t.kind})`).join(', ')}`)

      const quotes: Quote[] = []
      const missed: string[] = []
      for (const t of candidates) {
        const before = wire.previewAnswers.length
        try {
          await selectBody(page, t.id)
        } catch (e) {
          missed.push(`${t.id}: could not be selected (${firstLine(e)})`)
          console.log(`[journey-step0] ${t.id} (${t.kind}): NOT SELECTABLE — ${firstLine(e)}`)
          continue
        }
        const answered = await pollUntil(
          () => wire.previewAnswers.slice(before).some((a) => a.bodyId === t.id && (a.status !== 200 || a.flightWorldMs !== null)),
          8_000,
          `no preview answer for ${t.id}`,
        )
        const a = wire.previewAnswers.slice(before).find((x) => x.bodyId === t.id)
        if (!answered || !a) {
          missed.push(`${t.id}: MISSED QUOTE (selected, no preview answer within 8 s)`)
          console.log(`[journey-step0] ${t.id} (${t.kind}): MISSED QUOTE — no preview answer within 8 s`)
          continue
        }
        console.log(`[journey-step0] ${t.id} (${t.kind}): status ${a.status} flight ${a.flightWorldMs ?? 'n/a'} world ms`)
        if (a.status === 200 && a.flightWorldMs !== null) quotes.push({ ...t, status: a.status, flightWorldMs: a.flightWorldMs })
        else missed.push(`${t.id}: answered HTTP ${a.status} with no flight`)
      }
      expect(
        quotes.length,
        `FIXTURE PRECONDITION (quotes never answered, NOT "system too compact"): of ${candidates.length} selectable target(s) in ` +
          `${homeSystemId}, none produced a quote. Missed: ${missed.join(' | ')}`,
      ).toBeGreaterThanOrEqual(1)
      if (missed.length > 0) console.log(`[journey-step0] recorded missed/non-quoting targets: ${missed.join(' | ')}`)

      const scale = wire.reads.find((r) => r.scale != null)?.scale ?? Number(process.env.E2E_WORLD_TIME_SCALE ?? '5')
      const ranked = [...quotes].sort((a, b) => b.flightWorldMs - a.flightWorldMs)
      const far = ranked[0]!
      const farId = far.id
      const other = ranked.length > 1 ? ranked[ranked.length - 1]! : null
      const otherId = other?.id ?? null
      const farWallMs = far.flightWorldMs / scale
      console.log(
        `[journey-step0] committed target ${farId} (${far.kind}): ${far.flightWorldMs} world ms = ${Math.round(farWallMs)} wall ms at scale ${scale}; ` +
          `another target ${otherId ?? 'NONE'}; station ${stationId}; ${quotes.length} quoted of ${candidates.length}`,
      )
      expect(
        farWallMs,
        `FIXTURE PRECONDITION: the longest quoted flight in ${homeSystemId} is ${Math.round(farWallMs)} wall ms at scale ${scale} ` +
          `(${quotes.length} quoted target(s), ${missed.length} missed), shorter than the ${MIN_HOLD_FLIGHT_WALL_MS} ms the statement, ` +
          'one own-fleets read and a post-read snapshot need. The two QA-closing legs cannot run on this fixture.',
      ).toBeGreaterThanOrEqual(MIN_HOLD_FLIGHT_WALL_MS)

      let expectedEnd = 0
      const burnWallMs = (body: WireFleet | null, fallbackWorldMs: number): number => {
        const b = body?.state?.Burn
        const span = b && typeof b.DepartMs === 'number' && typeof b.ArriveMs === 'number' ? b.ArriveMs - b.DepartMs : fallbackWorldMs
        return span / scale
      }
      const remaining = () => expectedEnd - Date.now()

      // -----------------------------------------------------------------
      // Step 1 — select the committed target; read the quote's own elements.
      // -----------------------------------------------------------------
      await selectBody(page, farId)
      await expect(panel).toBeVisible({ timeout: 30_000 })
      await expectQuoteFigures(page, 'step 1: the target selected on a fresh spawn', 15_000)
      await expect(page.getByTestId('preview-arrival')).toHaveAttribute('data-unit', 'world-ms-span-in')
      await expect(page.getByTestId('preview-deltav')).toHaveAttribute('data-unit', 'delta-v')
      await expect(page.getByTestId('preview-fuel')).toHaveAttribute('data-unit', 'tons')
      await expect(page.getByTestId('preview-fuel-ceiling')).toHaveAttribute('data-unit', 'tons')
      await expect(statement, 'GIVEN: no committed statement before any commit').toHaveCount(0)
      await expect(burn).toBeEnabled()

      // -----------------------------------------------------------------
      // Commit 1, from the KEYBOARD, sampler running across the acceptance and
      // the first own-fleets read after it.
      // -----------------------------------------------------------------
      await burn.focus()
      expect(
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-testid')),
        'GIVEN: Burn holds keyboard focus before it is activated',
      ).toBe('burn-button')
      await startRecorder(page)
      const ordersBefore = wire.orderAnswers.length
      await burn.press('Enter')
      const answeredOrder = await pollUntil(() => wire.orderAnswers.length > ordersBefore, 15_000, 'Enter on Burn sent no order')
      expect(answeredOrder, 'Enter on Burn sent no order answer within 15 s').toBe(true)
      const accepted = wire.orderAnswers[ordersBefore]!
      expect(
        accepted.status,
        `the order commit was not accepted: HTTP ${accepted.status}. (A bodyless 500 naming "star-clearance" is the filed ` +
          'defect-station-order-500, not a finding of this change.)',
      ).toBeLessThan(300)
      await pollUntil(() => accepted.body !== null, 2_000, 'order body parse')
      expectedEnd = accepted.at + burnWallMs(accepted.body, far.flightWorldMs)
      const orderWallMs = expectedEnd - accepted.at
      console.log(`[journey-commit1] accepted; flight ${Math.round(orderWallMs)} wall ms; expected natural end at +${Math.round(orderWallMs)} ms`)

      const statementSeen = await pollUntil(async () => (await statement.count()) === 1, 10_000, 'statement after acceptance')
      const c1Live = statementSeen
      if (!statementSeen) {
        if (await orderEnded()) {
          for (const n of ['keyboard-focus', 'committed-render-hold', 'one-order-no-preview', 'second-activation'] as const) {
            markUntested(n, 'the order ended before the committed statement was ever observed (fixture/timing, not a finding)')
          }
        } else {
          legs.set('committed-render-hold', { status: 'FAILED', note: 'no statement after acceptance while the row reads under way' })
          expect(statementSeen, 'the committed statement never showed after an accepted order while the roster row reads "under way"').toBe(true)
        }
      }

      const focusInfo = () =>
        page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null
          const col = document.querySelector('[data-testid="preview-panel"]')?.parentElement ?? null
          const b = document.querySelector('[data-testid="burn-button"]') as HTMLButtonElement | null
          return {
            tag: a?.tagName ?? null,
            testId: a?.getAttribute('data-testid') ?? null,
            isBody: a === document.body,
            isStatement: a?.getAttribute('data-testid') === 'selection-committed-statement',
            insideColumn: !!a && !!col && col !== a && col.contains(a),
            burnDisabled: !!b && b.disabled,
            statementPresent: !!document.querySelector('[data-testid="selection-committed-statement"]'),
          }
        })

      let lastCommittedSnapAt = accepted.at
      if (c1Live) {
        // ---------------- keyboard-focus ----------------
        await runLeg('keyboard-focus', async () => {
          const afterAccept = await focusInfo()
          console.log(`[journey-keyboard] after acceptance: ${JSON.stringify(afterAccept)}`)
          if (!afterAccept.burnDisabled || !afterAccept.statementPresent) {
            return { untested: 'Burn was already enabled / the statement gone when focus was read: the order had ended' }
          }
          expect(afterAccept.isStatement, 'the acceptance moved focus to the statement (it must not)').toBe(false)
          await page.keyboard.press('Tab')
          const afterTab = await focusInfo()
          console.log(`[journey-keyboard] after Tab: ${JSON.stringify(afterTab)}`)
          expect(
            afterTab.isBody,
            'KEYBOARD LEG: after Tab the focused element is the document body: focus was lost to the start of the document when ' +
              'Burn became natively disabled (design.md Decision 15; fallback is aria-disabled for this state, a gate-time finding).',
          ).toBe(false)
          expect(
            afterTab.insideColumn,
            `KEYBOARD LEG: after Tab the focused element (${afterTab.tag} ${afterTab.testId}) is not inside the command column.`,
          ).toBe(true)
          expect(afterTab.isStatement, 'Tab landed on the statement').toBe(false)
        })

        // ---------------- committed-render-hold ----------------
        let snapsAll: Snap[] = []
        let firstRead: FleetsRead | null = null
        await runLeg('committed-render-hold', async () => {
          const gotRead = await pollUntil(
            () => wire.reads.some((r) => r.startAt >= accepted.at && r.endAt !== null),
            15_000,
            'no own-fleets read completed after the acceptance',
          )
          expect(
            gotRead,
            'no own-fleets read completed after the acceptance within 15 s (the invalidation and the baseline poll both missing)',
          ).toBe(true)
          firstRead = wire.reads.find((r) => r.startAt >= accepted.at && r.endAt !== null)!
          const readEnd = firstRead.endAt!
          await expect
            .poll(
              () =>
                page.evaluate(
                  (t) => ((window as unknown as { __snaps?: { t: number }[] }).__snaps ?? []).filter((s) => s.t > t).length,
                  readEnd,
                ),
              { timeout: 5_000, message: 'no sampler snapshot after the first own-fleets read answered' },
            )
            .toBeGreaterThan(0)
          snapsAll = await stopRecorder(page)
          const firstStatementIdx = snapsAll.findIndex((s) => s.statement > 0)
          expect(firstStatementIdx, 'the sampler never saw the committed statement').toBeGreaterThanOrEqual(0)
          // Up to a short tail after the read: what the walk must hold is the render THROUGH the read,
          // not whatever a later natural end of the order does to it.
          const windowSnaps = snapsAll.slice(firstStatementIdx).filter((s) => s.t >= accepted.at && s.t <= readEnd + 250)
          expect(
            windowSnaps.filter((s) => s.t > readEnd).length,
            'the sampler saw no snapshot within 250 ms after the first own-fleets read answered; the holding leg would pass vacuously',
          ).toBeGreaterThan(0)
          console.log(
            `[journey-step3] ${windowSnaps.length} snapshot(s) from the first statement; first own-fleets read after the acceptance: ` +
              `start +${firstRead.startAt - accepted.at}ms, end +${readEnd - accepted.at}ms; ` +
              `${windowSnaps.filter((s) => s.t > readEnd).length} snapshot(s) after it`,
          )
          for (const [i, s] of windowSnaps.entries()) {
            console.log(
              `[journey-step3] #${i} +${s.t - accepted.at}ms statement=${s.statement} burnDisabled=${s.burnDisabled} figures=${s.figures} uncapped=${s.uncapped} noQuote=${s.noQuote} stale=${s.stale}`,
            )
          }
          const readBurn = firstRead.fleets?.find((f) => f.id === fleetId)?.state?.Burn ?? null
          const orderBurn = accepted.body?.state?.Burn ?? null
          const instants =
            `commit response ${JSON.stringify([orderBurn?.DepartMs, orderBurn?.ArriveMs])} vs first read ` +
            `${JSON.stringify([readBurn?.DepartMs, readBurn?.ArriveMs])}`
          console.log(`[journey-step3] burn instants (first real-backend observation of the equality): ${instants}`)
          const broken = windowSnaps.filter(
            (s) =>
              !(
                s.statement === 1 &&
                s.statementText === SELECTION_COMMITTED_STATEMENT &&
                s.burnDisabled &&
                s.burnDescribedBy !== null &&
                s.burnDescribedBy === s.statementId &&
                s.figures === 0 &&
                s.uncapped === 0 &&
                s.noQuote === 0 &&
                s.stale === 0
              ),
          )
          expect(
            broken.map((s) => ({ ...s, t: s.t - accepted.at })),
            'the committed render did not hold from the first statement through the first own-fleets read after the acceptance ' +
              '(snapshots that broke it). If the quote returned after that one round trip, this is the first real-backend ' +
              `observation that the commit response's burn instants differ from the read's (design.md Risks; contract §12) ` +
              `and it is the FINDING: ${instants}`,
          ).toEqual([])
          expect(
            readBurn,
            `the first own-fleets read after the acceptance does not report the committed burn (${instants}); the order is not running on the wire`,
          ).not.toBeNull()
          lastCommittedSnapAt = [...windowSnaps].reverse().find((s) => s.statement > 0)?.t ?? accepted.at
          // The committed render, keyed on the command panel (the live DOM, once more).
          if (!(await orderEnded())) {
            await expect(statement).toHaveText(SELECTION_COMMITTED_STATEMENT, { timeout: 2_000 })
            await expect(burn).toBeDisabled({ timeout: 2_000 })
            await expect(burn).toHaveAttribute('aria-describedby', (await statement.getAttribute('id'))!, { timeout: 2_000 })
            await expectNoQuoteElements(page, 'committed', 2_000)
            await expect(page.getByTestId('burn-uncapped-label'), 'no uncapped label under a committed selection').toHaveCount(0, {
              timeout: 2_000,
            })
          }
          console.log(
            `[journey-step3] OBSERVATION: commit-drift-notice count ${await page.getByTestId('commit-drift-notice').count()}, ` +
              `commit-stranding-notice count ${await page.getByTestId('commit-stranding-notice').count()} (logged, not asserted)`,
          )
        })
        if (legs.get('committed-render-hold')!.status !== 'PASSED') await stopRecorder(page).catch(() => undefined)

        // ---------------- one-order-no-preview ----------------
        await runLeg('one-order-no-preview', async () => {
          expect(wire.orderPosts.length, 'exactly one order POST so far').toBe(1)
          expect(
            wire.previewPosts.filter((p) => p.bodyId === farId && p.at >= accepted.at && p.at <= lastCommittedSnapAt).map((p) => p.at - accepted.at),
            'orders/preview POSTs (ms after the acceptance) for the committed selection while the statement showed',
          ).toEqual([])
        })

        // ---------------- second-activation ----------------
        await runLeg('second-activation', async () => {
          const outcome = await page.evaluate(() => {
            const st = document.querySelector('[data-testid="selection-committed-statement"]')
            const b = document.querySelector('[data-testid="burn-button"]') as HTMLButtonElement | null
            if (!st || !b) return 'no-statement'
            b.click()
            return 'clicked'
          })
          if (outcome === 'no-statement') return { untested: 'the statement was gone when the second activation was due: the order had ended' }
          await settleFrames(page)
          expect(wire.orderPosts.length, 'a second activation of Burn sent an order request').toBe(1)
        })

        // ---------------- zero-preview-2-intervals ----------------
        if (orderWallMs >= 2 * PREVIEW_INTERVAL_MS + TWO_INTERVAL_MARGIN_MS) {
          await runLeg('zero-preview-2-intervals', async () => {
            await waitWallMs(Math.max(0, accepted.at + 2 * PREVIEW_INTERVAL_MS + SLACK_MS - Date.now()), 'two preview intervals of wall time')
            expect(
              wire.previewPosts.filter((p) => p.bodyId === farId && p.at >= accepted.at).map((p) => p.at - accepted.at),
              'orders/preview POSTs (ms after the acceptance) for the committed selection across two refresh intervals',
            ).toEqual([])
            await expect(row, 'the burn must still be under way at the end of the window').toContainText(/under way/i, { timeout: 2_000 })
            await expect(statement, 'the statement still holds after two intervals').toHaveCount(1, { timeout: 2_000 })
          })
        } else {
          markUntested(
            'zero-preview-2-intervals',
            `UNTESTED at tier 4 — flight ${Math.round(orderWallMs)} ms; covered at tier 1 by view tests 3.1 and 3.4 (RULING 17)`,
          )
        }
      }

      // -----------------------------------------------------------------
      // What commit 1 can still hold decides the order of the remaining legs.
      // -----------------------------------------------------------------
      const anotherTargetAndBack = async () => {
        if (otherId === null) return { untested: 'only one target produced a quote: no other target to select' }
        const postsBeforeOther = wire.previewPosts.length
        await selectBody(page, otherId)
        const sent = await pollUntil(
          () => wire.previewPosts.slice(postsBeforeOther).some((p) => p.bodyId === otherId),
          6_000,
          'no preview request for the other target',
        )
        expect(sent, 'selecting another target sent no preview request for it').toBe(true)
        await expectQuoteFigures(page, 'another target selected during the committed burn', 6_000)
        await expect(burn, 'Burn is available for the other target').toBeEnabled({ timeout: 3_000 })
        await expect(statement, 'no statement for the other target').toHaveCount(0, { timeout: 3_000 })
        await selectBody(page, farId)
        const reselectAt = Date.now()
        await expect(statement, 're-selecting the committed body returns the statement').toHaveCount(1, { timeout: 5_000 })
        await expect(burn).toBeDisabled({ timeout: 3_000 })
        await expectNoQuoteElements(page, 'committed body re-selected', 3_000)
        await settleFrames(page)
        await waitWallMs(600, 'a short window for a request that must not come')
        expect(
          wire.previewPosts.filter((p) => p.bodyId === farId && p.at >= reselectAt).map((p) => p.at - reselectAt),
          're-selecting the committed body sent a preview request',
        ).toEqual([])
        expect(wire.orderPosts.length, 'still exactly one order POST').toBe(1)
      }

      /** The cut, as the first thing after an acceptance; `kept` is the selection that stays. */
      const cutTheDrive = async (kept: string, acceptedAt: number) => {
        await expect(cutButton, 'the cut button for a running burn').toBeVisible({ timeout: 5_000 })
        const cutAt = Date.now()
        await cutButton.click()
        await expect(statement, 'cutting the drive removes the statement').toHaveCount(0, { timeout: 15_000 })
        await expect(burn, 'Burn is available after the cut').toBeEnabled({ timeout: 5_000 })
        const sent = await pollUntil(
          () => wire.previewPosts.filter((p) => p.bodyId === kept && p.at >= cutAt).length > 0,
          PREVIEW_INTERVAL_MS + 5_000,
          'no preview request for the kept selection after the cut',
        )
        expect(sent, 'no preview request for the kept selection within an interval of the statement ending').toBe(true)
        expect(
          wire.previewPosts.filter((p) => p.bodyId === kept && p.at >= acceptedAt && p.at < cutAt).map((p) => p.at - acceptedAt),
          'preview POSTs for the committed selection between the acceptance and the cut',
        ).toEqual([])
        await expect(row, 'corroboration: the cut landed').toContainText(/drifting/i, { timeout: 15_000 })
        console.log(
          `[journey-cut] OBSERVATION after the cut: figures=${await page.getByTestId('preview-arrival').count()} ` +
            `no-quote=${await page.getByTestId('preview-no-quote').count()} uncapped-label=${await page.getByTestId('burn-uncapped-label').count()} ` +
            `stale=${await page.getByTestId('preview-stale').count()}; commit-drift-notice=${await page.getByTestId('commit-drift-notice').count()} ` +
            `commit-stranding-notice=${await page.getByTestId('commit-stranding-notice').count()} (logged, not asserted)`,
        )
      }

      const arriveAndDock = async (targetId: string) => {
        await expect(statement, 'the statement is gone at arrival').toHaveCount(0, { timeout: 60_000 })
        await expect(row, 'the roster row no longer reads under way').not.toContainText(/under way/i, { timeout: 10_000 })
        const dockedAt = Date.now()
        console.log(`[journey-arrive] row reads: ${JSON.stringify(((await row.textContent()) ?? '').trim().slice(0, 200))}; docked=${/docked/i.test((await row.textContent()) ?? '')}`)
        await expectNoQuoteElements(page, 'at the end of the order', 3_000)
        await waitWallMs(PREVIEW_INTERVAL_MS + SLACK_MS, 'one preview interval of wall time at the arrival')
        expect(
          wire.previewPosts.filter((p) => p.bodyId === targetId && p.at >= dockedAt).map((p) => p.at - dockedAt),
          'orders/preview POSTs for the arrived-at selection across one interval',
        ).toEqual([])
        await expectNoQuoteElements(page, 'after one interval at the arrival', 1_000)
        console.log(
          `[journey-arrive] OBSERVATION: burn enabled=${await burn.isEnabled()} uncapped-label=${await page.getByTestId('burn-uncapped-label').count()} ` +
            `no-quote=${await page.getByTestId('preview-no-quote').count()}`,
        )
      }

      /** Commit 2: returns the acceptance, or null when it cannot be made. */
      const commitAgain = async (label: string) => {
        const before = wire.orderAnswers.length
        await burn.click()
        const got = await pollUntil(() => wire.orderAnswers.length > before, 15_000, `${label}: no order answer`)
        expect(got, `${label}: the commit sent no order answer within 15 s`).toBe(true)
        const a = wire.orderAnswers[before]!
        expect(a.status, `${label}: the commit was not accepted: HTTP ${a.status}`).toBeLessThan(300)
        await pollUntil(() => a.body !== null, 2_000, 'order body parse')
        await expect(statement, `${label}: the statement shows for the commit`).toHaveCount(1, { timeout: 10_000 })
        console.log(
          `[journey-commit] ${label}: commit-drift-notice=${await page.getByTestId('commit-drift-notice').count()} ` +
            `commit-stranding-notice=${await page.getByTestId('commit-stranding-notice').count()} (logged, not asserted)`,
        )
        return a
      }

      let cutDone = false
      let anotherDone = false
      let arriveDone = false

      if (c1Live && !(await orderEnded())) {
        const r = remaining()
        console.log(`[journey-plan] after the hold legs ${Math.round(r)} ms of flight remain (another-target needs ${ANOTHER_TARGET_NEEDS_MS}, cut needs ${CUT_NEEDS_MS})`)
        if (r >= ANOTHER_TARGET_NEEDS_MS) {
          await runLeg('another-target-and-back', anotherTargetAndBack)
          anotherDone = true
        } else {
          markUntested(
            'another-target-and-back',
            `${Math.round(r)} ms of flight remained after the hold legs, below the ${ANOTHER_TARGET_NEEDS_MS} ms the leg needs; covered at tier 1`,
          )
        }
        if (anotherDone && remaining() >= CUT_NEEDS_MS && !(await orderEnded())) {
          await runLeg('cut-the-drive', async () => cutTheDrive(farId, accepted.at))
          cutDone = true
        } else if (!anotherDone && r >= CUT_NEEDS_MS && !(await orderEnded())) {
          // The flight cannot hold the other-target leg but can hold the cut.
          await runLeg('cut-the-drive', async () => cutTheDrive(farId, accepted.at))
          cutDone = true
        }
      }

      if (legs.get('another-target-and-back')!.status === 'NOT REACHED') {
        markUntested('another-target-and-back', 'the order had ended (or was never observed running) before this leg was due; covered at tier 1')
      }

      if (!cutDone) {
        // Let commit 1 arrive (the order's end); the cut is then taken on commit 2.
        if (c1Live) {
          await runLeg('arrive-and-dock', async () => arriveAndDock(farId))
          arriveDone = true
        }
        if (otherId === null) {
          markUntested('cut-the-drive', 'only one target produced a quote: no second target to commit to after the first arrival')
        } else {
          await selectBody(page, otherId)
          await expectQuoteFigures(page, 'commit 2: the other target quoted from the arrival point', 15_000)
          await expect(burn).toBeEnabled({ timeout: 5_000 })
          const second = await commitAgain('commit 2 (cut first)')
          expectedEnd = second.at + burnWallMs(second.body, other!.flightWorldMs)
          await runLeg('cut-the-drive', async () => cutTheDrive(otherId, second.at))
        }
      } else if (!arriveDone) {
        // The cut was taken on commit 1; commit 2, to the kept selection, is the one that arrives.
        await expect(burn, 'Burn is available for the kept selection after the cut').toBeEnabled({ timeout: 10_000 })
        const second = await commitAgain('commit 2 (arrives)')
        expectedEnd = second.at + burnWallMs(second.body, far.flightWorldMs)
        await runLeg('arrive-and-dock', async () => arriveAndDock(farId))
        arriveDone = true
      }
    } finally {
      console.log('[journey-summary] ===== leg outcomes =====')
      for (const n of LEG_NAMES) {
        const o = legs.get(n)!
        console.log(`[journey-summary] ${n}: ${o.status}${o.note ? ` — ${o.note}` : ''}`)
      }
      console.log('[journey-summary] ========================')
    }

    expect(
      legs.get('keyboard-focus')!.status,
      `QA BLOCKED row #21 (keyboard focus) is not closed by this run: leg keyboard-focus is ${legs.get('keyboard-focus')!.status} ` +
        `(${legs.get('keyboard-focus')!.note}). A run that reaches neither closing leg proves nothing about this change.`,
    ).toBe('PASSED')
    expect(
      legs.get('committed-render-hold')!.status,
      `QA BLOCKED clause (the hold across the first post-acceptance read, burn-instants equality on the real wire) is not closed: ` +
        `leg committed-render-hold is ${legs.get('committed-render-hold')!.status} (${legs.get('committed-render-hold')!.note}).`,
    ).toBe('PASSED')
  })
})
