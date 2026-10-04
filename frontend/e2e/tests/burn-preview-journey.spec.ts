import { test, expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'
import {
  captureInteriors,
  mineableBodyId,
  selectBody,
  stationFeatureId,
  wakeNewCorp,
  type ServedInterior,
} from '../helpers/space-view'

/**
 * The burn-preview journey — openspec change `lift-burn-preview-to-view`
 * (implemented at `3802b92`), archive gate (`docs/testing-tiers.md` tier 4).
 * Written after every task was checked, against the UI that exists.
 *
 * THE WALK — QA's five steps ("Journey: steps that corroborate or close
 * real-wire rows", `lift-burn-preview-to-view-qa.md`) in the order the
 * impl contract §8 fixes:
 *
 *   1. Select a lode; the four quote figures carry `data-raw`.     (row 1)
 *   2. >= 25 s wall, BEFORE any burn: consecutive `orders/preview`
 *      POSTs spaced no closer than the interval minus slack, at least
 *      two after the first.                                       (rows 4, 5)
 *   3. Burn; re-target to the station mid-burn; the quote renders. (row 2)
 *   4. Docked; station selected -> figures still render. Then select
 *      the OWN HOST (the lode): over >= 2 intervals zero preview POSTs, zero
 *      `orders/preview` responses >= 500, no figures, Burn enabled. (rows 14, 28)
 *   5. Select the station; mine 5 t: figures go, `mine-countdown`
 *      visible, Burn disabled, `burn-uncapped-label` absent, zero preview
 *      POSTs until the countdown hides; figures return within two
 *      intervals afterwards.                                      (rows 7, 8, 29)
 *
 * SCALE. The e2e stack is warped (`WORLD_TIME_SCALE=5`, cheap lanes —
 * `backend-stack.ts`). Preview cadence is WALL time (`PREVIEW_REFRESH_MS`, a
 * React Query `refetchInterval`), so the warp does not move it; it shortens
 * flights and mine runs. This journey proves behaviour at scale 5 only.
 *
 * DELIBERATE OMISSIONS (do not "fix" these):
 *   - F5/J1: at a mine's ETA the restoring request may be refused once
 *     (`ErrPreviewChannelHeld`). Nothing here asserts that `preview-no-quote`
 *     never appears, nor a 4xx-free console, across that moment.
 *   - J2: the "no 5xx" assertion is scoped to step 4's own-host window only.
 *   - `defect-post-dock-burn-cost-drift`: no capped commit is ever made right
 *     after a dock; the only burn after the first is none at all.
 *   - `defect-spawn-system-single-body`: a spawn that draws no mineable lode
 *     fails the journey in step 1 with a message naming the FIXTURE
 *     PRECONDITION, rather than timing out later.
 *   - J3: a first selection that produces two POSTs fails step 2's spacing
 *     assertion; it is reported as a finding, never tolerated.
 */
const cfg = resolveE2EConfig()

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 720 },
})

// Hang budget, valid at any scale: a >= 25 s wall leg, one burn, a >= 22 s
// own-host window, one mine and two restoring intervals.
test.setTimeout(900_000)

const PREVIEW_INTERVAL_MS = 10_000
/** Wall-clock slack on a React Query refetchInterval (timer + render). */
const SLACK_MS = 2_000

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

interface PreviewPost {
  /** Wall-clock ms at which the request left the page. */
  at: number
  url: string
}
interface PreviewResponse {
  /** Wall-clock ms at which the response was observed. */
  at: number
  status: number
}

const PREVIEW_URL = /\/v1\/fleets\/[^/]+\/orders\/preview$/

/** Timestamped capture of every `orders/preview` POST and its response status. */
function recordPreviews(page: Page): { posts: PreviewPost[]; responses: PreviewResponse[] } {
  const posts: PreviewPost[] = []
  const responses: PreviewResponse[] = []
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !PREVIEW_URL.test(new URL(req.url()).pathname)) return
    posts.push({ at: Date.now(), url: req.url() })
  })
  page.on('response', (res) => {
    const req = res.request()
    if (req.method() !== 'POST' || !PREVIEW_URL.test(new URL(res.url()).pathname)) return
    responses.push({ at: Date.now(), status: res.status() })
  })
  return { posts, responses }
}

/** The four quote figures, each by `data-raw` — never by copy. */
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

const FIGURE_IDS = ['preview-arrival', 'preview-deltav', 'preview-fuel', 'preview-fuel-ceiling'] as const

/** Prefers a lode confirmed off-screen (farther = a longer burn to re-target within). */
async function pickLode(page: Page, interior: ServedInterior, stationId: string): Promise<string | null> {
  for (const f of interior.features ?? []) {
    if (f.type === 'star' || f.id === stationId || f.id.startsWith('feat-moon-')) continue
    if ((f.resources ?? []).length === 0) continue
    if ((await page.getByTestId(`offscreen-${f.id}`).count()) > 0) return f.id
  }
  return mineableBodyId(interior, stationId)
}

test.describe('the burn preview — quote, cadence, re-target, own-host withhold, mine withhold', () => {
  test('quotes a selection once per interval, re-targets mid-burn, withholds at the own host and under a mine, and restores', async ({
    page,
  }) => {
    test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

    const interiors = captureInteriors(page)
    const { posts, responses } = recordPreviews(page)

    const { homeSystemId, fleetId } = await wakeNewCorp(page, 'E2E BurnPreview', 'burnpreview')
    const row = page.getByTestId(`fleet-row-${fleetId}`)

    const home = await interiors.get(homeSystemId)
    const stationId = stationFeatureId(home)
    expect(
      stationId,
      `home ${homeSystemId} served no station body — every spawn home is provisioned with one (stations M11)`,
    ).toBeTruthy()
    const lodeId = await pickLode(page, home, stationId!)
    expect(
      lodeId,
      'FIXTURE PRECONDITION: the random spawn drew a system with no mineable lode besides the station ' +
        `(home ${homeSystemId}; cf. defect-spawn-system-single-body). Steps 1-5 all need a lode to select, ` +
        'dock at and mine; this is not a burn-preview finding.',
    ).toBeTruthy()

    // -----------------------------------------------------------------
    // Step 1 — select a lode, read the quote. Fresh spawn: unattached
    // park, no mine, selection is not a host -> a quote IS requested.
    // -----------------------------------------------------------------
    await selectBody(page, lodeId!)
    await expect(page.getByTestId('preview-panel')).toBeVisible({ timeout: 30_000 })
    await expectQuoteFigures(page, 'step 1: a lode selected on a fresh spawn')
    await expect(page.getByTestId('preview-arrival')).toHaveAttribute('data-unit', 'world-ms-span-in')
    await expect(page.getByTestId('preview-deltav')).toHaveAttribute('data-unit', 'delta-v')
    await expect(page.getByTestId('preview-fuel')).toHaveAttribute('data-unit', 'tons')
    await expect(page.getByTestId('preview-fuel-ceiling')).toHaveAttribute('data-unit', 'tons')

    // -----------------------------------------------------------------
    // Step 2 — cadence, BEFORE any burn (nothing else re-keys the query).
    // >= 25 s wall since the first POST; at least two POSTs follow it.
    // -----------------------------------------------------------------
    expect(posts.length, 'step 1 produced no orders/preview POST').toBeGreaterThan(0)
    const first = posts[0]!
    await expect
      .poll(() => Date.now() - first.at >= 25_000 && posts.length >= 3, {
        timeout: 60_000,
        intervals: [500],
        message: 'fewer than two preview POSTs followed the first within the cadence window',
      })
      .toBe(true)
    const cadencePosts = posts.slice()
    for (let i = 1; i < cadencePosts.length; i++) {
      const gap = cadencePosts[i]!.at - cadencePosts[i - 1]!.at
      expect(
        gap,
        `preview POST #${i + 1} followed #${i} after ${gap} ms; spacing must be >= ${
          PREVIEW_INTERVAL_MS - SLACK_MS
        } ms (a gap near 0 on the FIRST pair is J3: a first selection producing two POSTs under dev StrictMode — a finding, not a tolerance)`,
      ).toBeGreaterThanOrEqual(PREVIEW_INTERVAL_MS - SLACK_MS)
    }
    // One per interval: no more than one request per interval-and-slack over the span.
    const span = cadencePosts[cadencePosts.length - 1]!.at - cadencePosts[0]!.at
    expect(
      cadencePosts.length - 1,
      `${cadencePosts.length} POSTs over ${span} ms is more than one per ${PREVIEW_INTERVAL_MS} ms interval`,
    ).toBeLessThanOrEqual(Math.floor((span + SLACK_MS) / (PREVIEW_INTERVAL_MS - SLACK_MS)))

    // -----------------------------------------------------------------
    // Step 3 — burn; the moment the row reads under way, re-target to the
    // station. The quote renders mid-burn (a burning fleet previewed).
    // -----------------------------------------------------------------
    await page.getByTestId('burn-button').click()
    await expect(row, 'the burn must actually be under way').toContainText(/under way/i, { timeout: 30_000 })
    const postsBeforeRetarget = posts.length
    const responsesBeforeRetarget = responses.length
    await selectBody(page, stationId!)
    const underWayAtRetarget = /under way/i.test((await row.textContent()) ?? '')
    expect(
      underWayAtRetarget,
      'FIXTURE PRECONDITION: the burn to the lode finished before the station selection landed, so ' +
        '"re-target mid-burn" is unreachable on this spawn/scale (scale-5 flight too short); not a preview finding.',
    ).toBe(true)
    await expect
      .poll(() => posts.length, {
        timeout: 20_000,
        message: 'selecting a new target mid-burn sent no orders/preview request',
      })
      .toBeGreaterThan(postsBeforeRetarget)
    await expect
      .poll(() => responses.length, { timeout: 20_000, message: 'the re-target request got no response' })
      .toBeGreaterThan(responsesBeforeRetarget)
    await expectQuoteFigures(page, 'step 3: re-target to the station mid-burn')

    // -----------------------------------------------------------------
    // Step 4 — docked at the lode. Station still selected: figures still
    // render (docked, OTHER target). Then select the own host.
    // -----------------------------------------------------------------
    await expect(row).toContainText(/docked/i, { timeout: 600_000 })
    await expectQuoteFigures(page, 'step 4: docked at the lode, the station (another body) selected')

    await selectBody(page, lodeId!)
    const hostWindowStart = Date.now()
    const postsAtHostSelect = posts.length
    const responsesAtHostSelect = responses.length
    for (const id of FIGURE_IDS) {
      await expect(page.getByTestId(id), `step 4: ${id} must not render for the own host`).toHaveCount(0, {
        timeout: 20_000,
      })
    }
    await expect(page.getByTestId('burn-button'), 'Burn stays enabled at the own host').toBeEnabled()
    // >= 2 intervals of wall time, as a condition (not a sleep).
    await expect
      .poll(() => Date.now() - hostWindowStart >= 2 * PREVIEW_INTERVAL_MS + SLACK_MS, {
        timeout: 60_000,
        intervals: [500],
      })
      .toBe(true)
    const hostPosts = posts.slice(postsAtHostSelect).filter((p) => p.at >= hostWindowStart)
    expect(
      hostPosts.map((p) => p.at - hostWindowStart),
      'step 4: orders/preview POSTs (ms after selection) while the own host is selected and docked',
    ).toEqual([])
    const hostResponses = responses.slice(responsesAtHostSelect)
    const server5xx = hostResponses.filter((r) => r.status >= 500)
    expect(server5xx, 'step 4 (J2, scoped to this window): orders/preview responses >= 500').toEqual([])
    for (const id of FIGURE_IDS) {
      await expect(page.getByTestId(id)).toHaveCount(0)
    }
    await expect(page.getByTestId('burn-button')).toBeEnabled()

    // -----------------------------------------------------------------
    // Step 5 — station selected again -> figures; mine 5 t -> figures go.
    // -----------------------------------------------------------------
    await selectBody(page, stationId!)
    await expectQuoteFigures(page, 'step 5: station selected again, docked at the lode')

    await expect(page.getByTestId('mine-section')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('mine-tons-input').fill('5')
    await page.getByTestId('mine-button').click()
    await expect(page.getByTestId('mine-countdown')).toBeVisible({ timeout: 20_000 })

    // One atomic DOM snapshot per tick. The mine-withheld window is keyed on
    // the COMMAND SURFACE's own state (Burn disabled under the mine) — the one
    // value the spec binds to the preview flag ("as the view last read it",
    // RULING 22). `mine-countdown` is the fleet panel's own derivation
    // (`running ?? committedEta`, FleetActionsPanel.tsx:148-150), so it can
    // appear before the view's running-mine read lands; that overlap is
    // OBSERVED and logged, never asserted to be zero. Runs until the countdown hides.
    interface MineSnapshot {
      i: number
      t: number
      countdown: boolean
      burnDisabled: boolean
      uncappedLabel: number
      figures: number
    }
    const snapshot = (): Promise<Omit<MineSnapshot, 'i' | 't'>> =>
      page.evaluate((figureIds) => {
        const q = (id: string) => document.querySelectorAll(`[data-testid="${id}"]`)
        const burn = document.querySelector('[data-testid="burn-button"]') as HTMLButtonElement | null
        return {
          countdown: q('mine-countdown').length > 0,
          burnDisabled: !!burn && burn.disabled,
          uncappedLabel: q('burn-uncapped-label').length,
          figures: figureIds.reduce((n, id) => n + q(id).length, 0),
        }
      }, [...FIGURE_IDS])

    const mineWindowStart = Date.now()
    const snaps: MineSnapshot[] = []
    let mineWindowEnd = mineWindowStart
    const deadline = mineWindowStart + 600_000
    for (;;) {
      const t = Date.now()
      const s: MineSnapshot = { i: snaps.length, t, ...(await snapshot()) }
      const seenCountdown = snaps.some((x) => x.countdown)
      if (!s.countdown && seenCountdown) {
        mineWindowEnd = t
        break
      }
      snaps.push(s)
      if (Date.now() > deadline) throw new Error('the mine countdown never hid within 600 s')
      await page.waitForTimeout(50)
    }
    const withCountdown = snaps.filter((s) => s.countdown)
    const firstCountdown = withCountdown[0]
    for (const s of snaps) {
      console.log(
        `[journey-step5] #${s.i} +${s.t - mineWindowStart}ms countdown=${s.countdown} burnDisabled=${s.burnDisabled} figures=${s.figures} uncappedLabel=${s.uncappedLabel}`,
      )
    }
    expect(
      firstCountdown,
      'FIXTURE PRECONDITION: the mine run ended before any snapshot saw its countdown, so the mine-withhold window is unobservable at this scale',
    ).toBeTruthy()
    // The mine-withheld window: every snapshot in which Burn is disabled under the mine.
    const withheld = snaps.filter((s) => s.countdown && s.burnDisabled)
    const firstWithheld = withheld[0]
    // Not vacuous: the window must be observed, and within the test's own
    // expect timeout (20 s) of the countdown first showing. The view's
    // running-mine read is a single local GET, issued on the commit's
    // invalidation; every comparable read in this spec lands well inside 20 s.
    expect(
      firstWithheld,
      'FIXTURE PRECONDITION / PRODUCT: no snapshot ever showed Burn disabled under the mine before the countdown hid, so the mine-withheld window was never observed',
    ).toBeTruthy()
    expect(
      firstWithheld!.t - firstCountdown!.t,
      'step 5: ms from the countdown first showing to Burn becoming mine-disabled (bound: the 20 s expect timeout)',
    ).toBeLessThanOrEqual(20_000)

    // OBSERVATION (not an assertion of zero): the countdown shows from the fleet
    // panel's local committedEta before the view's read lands.
    const overlap = snaps.filter((s) => s.countdown && !s.burnDisabled && s.i < firstWithheld!.i)
    const overlapWithFigures = overlap.filter((s) => s.figures > 0)
    console.log(
      `[journey-step5] OBSERVATION: ${overlap.length} snapshot(s) showed the countdown with Burn still enabled before the window opened ` +
        `(${overlapWithFigures.length} of them with figures); overlap lasted ${firstWithheld!.t - firstCountdown!.t} ms ` +
        `(first countdown +${firstCountdown!.t - mineWindowStart}ms, first mine-disabled snapshot +${firstWithheld!.t - mineWindowStart}ms); ` +
        `${withheld.length} withheld snapshot(s) in total`,
    )
    await test.info().attach('step5-snapshots.json', {
      body: JSON.stringify(snaps, null, 1),
      contentType: 'application/json',
    })

    // THE binding assertions: in EVERY snapshot where Burn is disabled under the mine.
    expect(
      withheld.filter((s) => s.figures > 0).map((s) => s.i),
      `step 5: of ${withheld.length} mine-withheld snapshots (Burn disabled), indices that still rendered quote figures`,
    ).toEqual([])
    expect(
      withheld.filter((s) => s.uncappedLabel > 0).map((s) => s.i),
      'step 5: mine-withheld snapshots showing burn-uncapped-label',
    ).toEqual([])
    // Zero preview POSTs from the first withheld snapshot to the mine's end.
    // The end is trimmed by 300 ms because the restoring request is issued in
    // the same commit that hides the countdown, and this loop observes the
    // hide up to a tick later.
    const minePosts = posts.filter((p) => p.at >= firstWithheld!.t && p.at < mineWindowEnd - 300)
    expect(
      minePosts.map((p) => p.at - firstWithheld!.t),
      'step 5: orders/preview POSTs (ms after the first mine-withheld snapshot) while the mine ran',
    ).toEqual([])

    // After the countdown: figures return within two intervals (J1 — the
    // first restoring request may be refused once; deliberately NOT asserting
    // preview-no-quote never appears).
    await expectQuoteFigures(
      page,
      'step 5: after the mine ended (within two intervals of the countdown hiding)',
      2 * PREVIEW_INTERVAL_MS + 5_000,
    )
    console.log(`[journey-step5] OBSERVATION: figures returned ${Date.now() - mineWindowEnd} ms after the countdown hid`)
  })
})
