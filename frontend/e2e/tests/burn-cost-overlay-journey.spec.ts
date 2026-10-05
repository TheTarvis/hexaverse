import { test, expect, type BrowserContext, type Page, type Request } from '@playwright/test'
import sharp from 'sharp'
import { resolveE2EConfig } from '../config/env'
import { captureInteriors, selectBody, wakeNewCorp, type ServedInterior } from '../helpers/space-view'

/**
 * The burn-cost-overlay journey — openspec change `add-burn-cost-overlay`
 * (link 2a-iv of `docs/plans/system-hud/chain.md`, task 6.2), archive gate
 * (`docs/testing-tiers.md` tier 4). Written against the UI built at `261dc7e`
 * (`Gauge.tsx`, `VitalsStrip.tsx`, `SystemSpaceView.tsx`), NOT run at the time
 * of writing. The pre-run record is `docs/handoffs/add-burn-cost-overlay-journey.md`.
 *
 * WHAT THE OVERLAY IS, as this spec finds it: the fuel gauge
 * (`[data-testid="fuel-gauge"]`) carries `data-gauge-cost-state`
 * (affordable | unaffordable) only while a current quote is drawn, one
 * `[data-gauge-cost-extent]` band child, and (unaffordable only) one
 * `[data-gauge-cost-mark]` child. Every assertion window is keyed on THAT
 * gauge. Where the gauge is compared with the panel's served affordability
 * flag (`preview-affordable[data-affordable]`), both are read in ONE
 * `page.evaluate` (`window.__readOverlay`, installed by an init script), so
 * they are the same quote and a refresh cannot land between the reads.
 *
 * THE LEGS (each ends PASSED / UNTESTED / FAILED; a summary block prints them
 * and a closing test asserts the three MUST-PASS legs):
 *   no-selection                     MUST PASS  filled gauge, no overlay
 *   overlay-equals-panel-flag        MUST PASS  gauge state == the panel's flag, same quote
 *   clear-withdraws                  MUST PASS  deselect: state attribute and band gone
 *   replace-selection                logged     the previous target's cost is never shown
 *   commit-withdraws-at-acceptance   logged     costs one burn; doubles as probe round 1
 *   width-floor-1280x720             logged     cells inside the viewport, overlay drawn
 *   paint-light / paint-dark         logged     RULING 14 / "Both extents can be read on one rail"
 *   extent-past-fill                 UNTESTED unless a probed quote exceeds the fuel aboard
 *   unaffordable-overlay-and-mark    UNTESTED unless the bounded probe arranges one
 *                                    (RULING 14; tier 1 tasks 1.4, 2.1, 2.2 are the cover)
 *
 * SIZING (from `docs/handoffs/clear-burn-preview-on-commit-journey.md` and
 * `fix-burn-order-geometry-refusals-journey.md`): home-system flights are
 * 19-22 s of world time, 3.8-4.4 s wall at scale 5; a gate flight about 5.4 s;
 * a select-plus-quote round trip is well under 1 s. No leg waits a 10 s preview
 * interval. NO TIMEOUT IS RAISED: the 60 s per-test budget in
 * `frontend/playwright.config.ts` holds, so the journey is four ordered tests
 * over one corporation provisioned ONCE in `beforeAll`, serial. Legs record
 * their own FAILED outcome instead of throwing, so one red leg does not skip
 * the rest (a thrown failure in serial mode would); the closing test fails the
 * run, listing every FAILED and every MUST-PASS leg that was not PASSED.
 *
 * FIXTURE HAZARDS (filed, not asserted on): `defect-spawn-system-single-body`,
 * `defect-scan-journey-spawn-in-gate-range`, `defect-slice-sell-price-changed-409`,
 * `defect-post-dock-burn-cost-drift`. Targets are chosen from what the system
 * SERVES; quote first, then choose.
 */
const cfg = resolveE2EConfig()

const VIEWPORT = { width: 1280, height: 720 }
const MAX_FEATURE_CANDIDATES = 6
const MAX_GATE_CANDIDATES = 2
/** A probe stops starting new candidates when the test has used this much of its 60 s. */
const PROBE_BUDGET_MS = 32_000
/** The commit leg waits for an arrival no longer than this (wall). */
const MAX_FLIGHT_WALL_MS = 15_000
/** Two device pixels: the spec's floor for a paint comparison. */
const MIN_EXTENT_DEVICE_PX = 2

// ---------------------------------------------------------------------------
// Shared fixture: ONE corporation for the whole file (test.beforeAll).
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

interface OverlaySnap {
  t: number
  gaugeState: string | null
  costState: string | null
  hasBand: boolean
  hasMark: boolean
  bandPct: number | null
  fillPct: number
  panelAffordable: string | null
  stale: number
  noQuote: number
  previewFuel: number | null
  fuelAboard: number | null
  capacity: number | null
  selection: string | null
}

type OverlayWindow = Window & {
  __readOverlay?: () => OverlaySnap
  __ovl?: OverlaySnap[]
  __ovlTimer?: number
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
interface PreviewAnswer {
  at: number
  bodyId: string | null
  status: number
  fuelCostTons: number | null
  affordable: boolean | null
  flightWorldMs: number | null
}
interface OrderAnswer {
  at: number
  status: number
}
interface FleetsRead {
  startAt: number
  endAt: number | null
  scale: number | null
}

const PREVIEW_URL = /\/v1\/fleets\/[^/]+\/orders\/preview$/
const ORDER_URL = /\/v1\/fleets\/[^/]+\/orders$/
const FLEETS_URL = /\/v1\/fleets$/

let context: BrowserContext
let page: Page
let homeSystemId = ''
let fleetId = ''
let home: ServedInterior
const consoleBuffer: JourneyConsoleEntry[] = []
let consoleCursor = 0
const httpErrors: HttpError[] = []
let httpCursor = 0
const previewAnswers: PreviewAnswer[] = []
const orderAnswers: OrderAnswer[] = []
const fleetReads: FleetsRead[] = []

let snapIndex = 0

/** Per scheme: was the arrangement actually sampled (pixels), not merely seen in the DOM? */
const sampled = {
  pastFill: { light: false, dark: false },
  mark: { light: false, dark: false },
}
let unaffordableDomOk = false

// ---------------------------------------------------------------------------
// Leg accounting (the predecessors' runLeg idiom: PASSED / UNTESTED / FAILED)
// ---------------------------------------------------------------------------

const LEG_NAMES = [
  'no-selection',
  'overlay-equals-panel-flag',
  'clear-withdraws',
  'replace-selection',
  'commit-withdraws-at-acceptance',
  'width-floor-1280x720',
  'paint-light',
  'paint-dark',
  'extent-past-fill',
  'unaffordable-overlay-and-mark',
] as const
type LegName = (typeof LEG_NAMES)[number]
const MUST_PASS: LegName[] = ['no-selection', 'overlay-equals-panel-flag', 'clear-withdraws']
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
// Overlay reader (one evaluate = one quote) and sampler
// ---------------------------------------------------------------------------

async function snap(): Promise<OverlaySnap> {
  return page.evaluate(() => (window as unknown as OverlayWindow).__readOverlay!())
}

function fmt(i: number, s: OverlaySnap): string {
  return (
    `snap#${i} sel=${s.selection} gauge=${s.gaugeState} costState=${s.costState} band=${s.bandPct} fill=${s.fillPct} ` +
    `mark=${s.hasMark} panelFlag=${s.panelAffordable} stale=${s.stale} noQuote=${s.noQuote} ` +
    `fuelAboard=${s.fuelAboard} capacity=${s.capacity} quotedCost=${s.previewFuel}`
  )
}

/** Logs a snapshot with a fresh index BEFORE anything asserts on it. */
function logSnap(label: string, s: OverlaySnap): number {
  const i = ++snapIndex
  console.log(`[journey-overlay] ${label}: ${fmt(i, s)}`)
  return i
}

const overlayDrawn = (s: OverlaySnap) => s.costState !== null || s.hasBand || s.hasMark

/**
 * Invariants that hold for ANY single snapshot (one quote): the gauge state is
 * the panel's flag; the band is the quote's cost on the gauge's scale; the mark
 * exists exactly when unaffordable; a stale or missing quote draws nothing; the
 * fill is never no-data (a fuel-less read would withdraw the overlay for the
 * wrong reason). Returns violations; empty = holds.
 */
function violations(s: OverlaySnap): string[] {
  const v: string[] = []
  if (s.gaugeState === null) v.push('fuel-gauge not in the DOM')
  if (s.gaugeState === 'no-data') v.push('fuel gauge reads no-data (fixture or product: the overlay is withheld on no-data by design)')
  const drawn = overlayDrawn(s)
  if (s.stale > 0 || s.noQuote > 0) {
    if (drawn) v.push(`overlay drawn while the panel reports stale=${s.stale} noQuote=${s.noQuote}`)
    return v
  }
  if (s.panelAffordable === null) {
    if (drawn) v.push('overlay drawn with no quote in the panel')
    return v
  }
  if (!drawn) {
    v.push(`a current quote (panel flag ${s.panelAffordable}) with no overlay on the gauge`)
    return v
  }
  const want = s.panelAffordable === 'true' ? 'affordable' : 'unaffordable'
  if (s.costState !== want) v.push(`gauge state ${s.costState} != panel flag ${s.panelAffordable} (want ${want})`)
  if (!s.hasBand) v.push('state attribute without a band')
  if (s.hasMark !== (want === 'unaffordable')) v.push(`mark present=${s.hasMark} for ${want}`)
  if (s.previewFuel !== null && s.capacity !== null && s.capacity > 0 && s.bandPct !== null) {
    const wantPct = Math.min((s.previewFuel / s.capacity) * 100, 100)
    if (Math.abs(s.bandPct - wantPct) > 0.1) {
      v.push(`band ${s.bandPct}% != quoted cost ${s.previewFuel} t on capacity ${s.capacity} t (${wantPct.toFixed(3)}%)`)
    }
  }
  return v
}

/**
 * G1/G4 (QA second pass): the gauge against the WIRE, not only against the panel's copy.
 * The panel's quote is the view's own copy of one recorded preview answer, so the gauge's state
 * and band must equal what THAT answer served (`affordable`, `fuelCostTons`). An always-affordable
 * gauge, or a gauge/panel pair that are both wrong, fails here. The capacity must be readable:
 * a null capacity is a violation, never a silent skip of the band-scale check.
 */
function wireViolations(id: string, s: OverlaySnap, answerFrom: number): string[] {
  const v: string[] = []
  const capacity = s.capacity
  if (capacity === null || !(capacity > 0)) {
    v.push(`capacity not readable from hold-capacity-total data-raw (${capacity}): the band-scale check cannot be made`)
  }
  const answers = previewAnswers
    .slice(answerFrom)
    .filter((a) => a.bodyId === id && a.status === 200 && a.fuelCostTons !== null && a.affordable !== null)
  const match = answers.find(
    (a) => s.previewFuel !== null && Math.abs(a.fuelCostTons! - s.previewFuel) <= 1e-9 * Math.max(1, Math.abs(a.fuelCostTons!)),
  )
  if (!match) {
    v.push(
      `the panel's quote ${s.previewFuel} t matches none of the ${answers.length} wire answer(s) for ${id}: ` +
        JSON.stringify(answers.map((a) => [a.fuelCostTons, a.affordable])),
    )
    return v
  }
  const want = match.affordable ? 'affordable' : 'unaffordable'
  if (s.costState !== want) v.push(`gauge state ${s.costState} != WIRE affordable=${match.affordable} (want ${want}) for quoted ${match.fuelCostTons} t`)
  if (s.hasMark !== (want === 'unaffordable')) v.push(`mark present=${s.hasMark} but the WIRE says ${want}`)
  if (capacity !== null && capacity > 0) {
    const wantPct = Math.min((match.fuelCostTons! / capacity) * 100, 100)
    if (s.bandPct === null || Math.abs(s.bandPct - wantPct) > 0.1) {
      v.push(`band ${s.bandPct}% != WIRE cost ${match.fuelCostTons} t on capacity ${capacity} t (${wantPct.toFixed(3)}%)`)
    }
  }
  return v
}

/** The wire body is parsed asynchronously; wait (bounded) until it has been for this selection. */
async function waitWireParsed(id: string, answerFrom: number): Promise<void> {
  await expect
    .poll(() => previewAnswers.slice(answerFrom).some((a) => a.bodyId === id && a.status === 200 && a.fuelCostTons !== null), {
      timeout: 3_000,
      message: `no parsed wire answer for ${id}`,
    })
    .toBe(true)
}

async function startSampler(): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as OverlayWindow
    if (w.__ovlTimer) window.clearInterval(w.__ovlTimer)
    w.__ovl = []
    w.__ovlTimer = window.setInterval(() => {
      w.__ovl!.push(w.__readOverlay!())
    }, 25)
  })
}

async function stopSampler(): Promise<OverlaySnap[]> {
  return page.evaluate(() => {
    const w = window as unknown as OverlayWindow
    if (w.__ovlTimer) window.clearInterval(w.__ovlTimer)
    w.__ovlTimer = undefined
    return w.__ovl ?? []
  })
}

async function settleFrames(): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

/** Polls until the panel shows a current (non-stale) quote for `id`; returns the last snapshot read. */
async function waitQuote(id: string, timeoutMs: number): Promise<{ s: OverlaySnap; current: boolean }> {
  let last = await snap()
  try {
    await expect
      .poll(
        async () => {
          last = await snap()
          return (
            last.selection === id &&
            last.panelAffordable !== null &&
            last.stale === 0 &&
            last.noQuote === 0 &&
            last.previewFuel !== null
          )
        },
        { timeout: timeoutMs, intervals: [50, 100, 250] },
      )
      .toBe(true)
    return { s: last, current: true }
  } catch {
    return { s: last, current: false }
  }
}

async function activateBody(id: string): Promise<'offscreen' | 'on-screen'> {
  const offscreen = page.getByTestId(`offscreen-${id}`)
  const hit = page.getByTestId(`body-hit-${id}`)
  if (await offscreen.count()) {
    await offscreen.first().click()
    return 'offscreen'
  }
  await hit.first().focus()
  await hit.first().press('Enter')
  return 'on-screen'
}

// ---------------------------------------------------------------------------
// The probe table: quote first, then choose from what the system serves
// ---------------------------------------------------------------------------

interface ProbeEntry {
  id: string
  kind: string
  onScreen: boolean
  current: boolean
  snap: OverlaySnap
  snapIdx: number
  flightWorldMs: number | null
  /** index into previewAnswers when this target's selection began: the wire answers for it are at or after this. */
  answerFrom: number
}
const probe: ProbeEntry[] = []

function latestAnswer(id: string): PreviewAnswer | undefined {
  return [...previewAnswers].reverse().find((a) => a.bodyId === id && a.status === 200)
}

async function probeTargets(
  label: string,
  candidates: { id: string; kind: string }[],
  t0: number,
  budgetMs: number,
): Promise<ProbeEntry[]> {
  const out: ProbeEntry[] = []
  for (const c of candidates) {
    if (Date.now() - t0 > budgetMs) {
      console.log(`[journey-probe] ${label}: budget spent (${Date.now() - t0} ms of test), stopping before ${c.id}`)
      break
    }
    const answerFrom = previewAnswers.length
    try {
      await selectBody(page, c.id)
    } catch (e) {
      console.log(`[journey-probe] ${label}: ${c.id} (${c.kind}) NOT SELECTABLE - ${firstLine(e)}`)
      continue
    }
    const onScreen =
      (await page.getByTestId(`body-hit-${c.id}`).count()) > 0 && (await page.getByTestId(`offscreen-${c.id}`).count()) === 0
    const { s, current } = await waitQuote(c.id, 5_000)
    const idx = logSnap(`${label} ${c.id} (${c.kind}) ${current ? 'quoted' : 'MISSED QUOTE'}`, s)
    out.push({
      id: c.id,
      kind: c.kind,
      onScreen,
      current,
      snap: s,
      snapIdx: idx,
      flightWorldMs: latestAnswer(c.id)?.flightWorldMs ?? null,
      answerFrom,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Paint sampling (pixels from a screenshot, never computed styles)
// ---------------------------------------------------------------------------

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}
interface Geometry {
  dpr: number
  iw: number
  rail: Rect
  fills: Rect[]
  band: Rect | null
  mark: Rect | null
  darkMatches: boolean
}
type Rgb = [number, number, number]
interface PaintResult {
  scheme: 'light' | 'dark'
  targetId: string
  bandDevPx: number
  points: { fillUncovered: Rgb | null; extent: Rgb; rail: Rgb | null; pastFill: Rgb | null; mark: Rgb | null }
  notes: string[]
}

async function readGeometry(): Promise<Geometry | null> {
  return page.evaluate(() => {
    const g = document.querySelector('[data-testid="fuel-gauge"]')
    if (!g) return null
    const r = (el: Element) => {
      const b = el.getBoundingClientRect()
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }
    }
    const band = g.querySelector('[data-gauge-cost-extent]')
    const mark = g.querySelector('[data-gauge-cost-mark]')
    const fills = Array.from(g.children).filter((c) => c !== band && c !== mark)
    return {
      dpr: window.devicePixelRatio,
      iw: window.innerWidth,
      rail: r(g),
      fills: fills.map(r),
      band: band ? r(band) : null,
      mark: mark ? r(mark) : null,
      darkMatches: window.matchMedia('(prefers-color-scheme: dark)').matches,
    }
  })
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
const same = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]

/**
 * Samples one scheme on the CURRENT selection. Returns `{ untested }` when the
 * arrangement cannot be sampled (extent under 2 device px, scheme emulation did
 * not take, geometry moved under the screenshot).
 */
async function samplePaint(
  scheme: 'light' | 'dark',
  targetId: string,
): Promise<PaintResult | { untested: string }> {
  await page.emulateMedia({ colorScheme: scheme })
  await settleFrames()
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await readGeometry()
    if (!before) return { untested: 'no fuel gauge in the DOM' }
    if ((scheme === 'dark') !== before.darkMatches) {
      return { untested: `colour-scheme emulation did not take: prefers-color-scheme dark=${before.darkMatches} while ${scheme} was asked` }
    }
    if (!before.band) return { untested: 'no extent drawn on the gauge at sample time' }
    if (before.fills.length === 0) return { untested: 'no fill drawn on the gauge (nothing fuelled)' }
    const shot = await page.screenshot({ type: 'png' })
    const after = await readGeometry()
    const moved =
      !after ||
      !after.band ||
      Math.abs(after.band.width - before.band.width) > 0.01 ||
      Math.abs(after.band.left - before.band.left) > 0.01 ||
      Math.abs(after.rail.top - before.rail.top) > 0.01
    if (moved) {
      console.log(`[journey-paint] ${scheme} ${targetId}: geometry moved under the screenshot (attempt ${attempt + 1})`)
      continue
    }
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
    const sx = info.width / before.iw
    const sy = info.height / VIEWPORT.height
    const px = (x: number, y: number): Rgb => {
      const ix = Math.min(info.width - 1, Math.max(0, Math.floor(x * sx)))
      const iy = Math.min(info.height - 1, Math.max(0, Math.floor(y * sy)))
      const o = (iy * info.width + ix) * info.channels
      return [data[o]!, data[o + 1]!, data[o + 2]!]
    }
    const { rail, band, mark } = before
    const fill = before.fills[0]!
    const bandDevPx = band.width * sx
    const notes: string[] = [`dpr=${before.dpr} scaleX=${sx} bandDevPx=${bandDevPx.toFixed(2)}`]
    if (bandDevPx < MIN_EXTENT_DEVICE_PX) {
      return { untested: `the extent is ${bandDevPx.toFixed(2)} device px long, under ${MIN_EXTENT_DEVICE_PX}` }
    }
    const railCy = (rail.top + rail.bottom) / 2
    const bandCy = (band.top + band.bottom) / 2
    const bandMid = band.left + band.width / 2
    const eps = 2 / sx

    // The fill's part the extent does not cover.
    let fillUncovered: Rgb | null = null
    if (fill.right > band.right + eps) {
      fillUncovered = px((band.right + fill.right) / 2, railCy)
      notes.push('fill sample: centre of the full-height fill part past the extent')
    } else if (fill.width >= 6) {
      fillUncovered = px(fill.left + fill.width / 2, (rail.top + band.top) / 2)
      notes.push('fill sample: the strip of fill above the extent')
    } else {
      notes.push(`fill sample skipped: fill is ${fill.width.toFixed(2)} css px, inside the rail's rounded end`)
    }
    // The rail covered by neither.
    const reach = Math.max(fill.right, band.right)
    const rail0: Rgb | null = rail.right - reach >= eps ? px((reach + rail.right) / 2, railCy) : null
    if (!rail0) notes.push('rail sample skipped: fewer than 2 device px of bare rail')
    const pastFill: Rgb | null = band.right > fill.right + eps ? px((fill.right + band.right) / 2, bandCy) : null
    return {
      scheme,
      targetId,
      bandDevPx,
      points: {
        fillUncovered,
        extent: px(bandMid, bandCy),
        rail: rail0,
        pastFill,
        mark: mark ? px((mark.left + mark.right) / 2, (mark.top + mark.bottom) / 2) : null,
      },
      notes,
    }
  }
  return { untested: 'the gauge geometry kept moving under the screenshot (the quote refreshed three times)' }
}

/** Logs every sample and ratio, then asserts exact sRGB inequality pairwise. Ratios are recorded, never gated. */
function assertPaint(r: PaintResult): { fullTriple: boolean } {
  const p = r.points
  const name = (k: string, v: Rgb | null) => `${k}=${v ? `rgb(${v.join(',')})` : 'n/a'}`
  console.log(
    `[journey-paint] ${r.scheme} ${r.targetId}: ${name('fill', p.fillUncovered)} ${name('extent', p.extent)} ${name('rail', p.rail)} ` +
      `${name('pastFill', p.pastFill)} ${name('mark', p.mark)} :: ${r.notes.join('; ')}`,
  )
  const pairs: [string, Rgb | null, string, Rgb | null][] = [
    ['fill', p.fillUncovered, 'extent', p.extent],
    ['fill', p.fillUncovered, 'rail', p.rail],
    ['extent', p.extent, 'rail', p.rail],
    ['pastFill', p.pastFill, 'rail', p.rail],
    ['mark', p.mark, 'extent', p.extent],
    ['mark', p.mark, 'fill', p.fillUncovered],
  ]
  for (const [an, a, bn, b] of pairs) {
    if (a && b) console.log(`[journey-paint] ${r.scheme} ${r.targetId}: contrast ${an} vs ${bn} = ${contrast(a, b).toFixed(2)}:1 (recorded, not gated)`)
  }
  for (const [an, a, bn, b] of pairs) {
    if (!a || !b) continue
    expect(
      same(a, b),
      `${r.scheme} scheme, target ${r.targetId}: ${an} rgb(${a.join(',')}) and ${bn} rgb(${b.join(',')}) are the same sRGB value, ` +
        'so the two ends cannot be told apart on the rail',
    ).toBe(false)
  }
  return { fullTriple: p.fillUncovered !== null && p.rail !== null }
}

// ---------------------------------------------------------------------------
// Layout helpers (as vitals-strip-journey.spec.ts reads them)
// ---------------------------------------------------------------------------

interface Box {
  x: number
  y: number
  width: number
  height: number
}
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
function insideViewport(b: Box): boolean {
  return b.x >= 0 && b.y >= 0 && b.x + b.width <= VIEWPORT.width && b.y + b.height <= VIEWPORT.height
}
async function boxOf(testId: string): Promise<Box> {
  const el = page.getByTestId(testId).first()
  await expect(el, `${testId} must be visible to measure its box`).toBeVisible({ timeout: 10_000 })
  const b = await el.boundingBox()
  expect(b, `${testId} produced no bounding box`).not.toBeNull()
  return b!
}

// ---------------------------------------------------------------------------
// Wire capture
// ---------------------------------------------------------------------------

function bodyIdOf(req: Request): string | null {
  try {
    return (req.postDataJSON() as { bodyId?: string } | null)?.bodyId ?? null
  } catch {
    return null
  }
}

function recordWire(p: Page): void {
  const readByRequest = new Map<Request, FleetsRead>()
  p.on('request', (req) => {
    const path = new URL(req.url()).pathname
    if (req.method() === 'GET' && FLEETS_URL.test(path) && req.url().includes('mine=true')) {
      const read: FleetsRead = { startAt: Date.now(), endAt: null, scale: null }
      fleetReads.push(read)
      readByRequest.set(req, read)
    }
  })
  p.on('response', (res) => {
    const req = res.request()
    const url = new URL(res.url())
    const path = url.pathname
    const now = Date.now()
    // Every 4xx/5xx on /v1/ is captured WITH its body: the e2e backend log holds no response bodies.
    if (path.startsWith('/v1/') && res.status() >= 400) {
      const entry: HttpError = { method: req.method(), url: `${path}${url.search}`, status: res.status(), body: '(unread)' }
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
    if (req.method() === 'POST' && PREVIEW_URL.test(path)) {
      const a: PreviewAnswer = {
        at: now,
        bodyId: bodyIdOf(req),
        status: res.status(),
        fuelCostTons: null,
        affordable: null,
        flightWorldMs: null,
      }
      previewAnswers.push(a)
      if (res.ok()) {
        void res
          .json()
          .then((b: { fuelCostTons?: number; affordable?: boolean; departMs?: number; arriveMs?: number }) => {
            if (typeof b.fuelCostTons === 'number') a.fuelCostTons = b.fuelCostTons
            if (typeof b.affordable === 'boolean') a.affordable = b.affordable
            if (typeof b.departMs === 'number' && typeof b.arriveMs === 'number') a.flightWorldMs = b.arriveMs - b.departMs
          })
          .catch(() => undefined)
      }
    } else if (req.method() === 'POST' && ORDER_URL.test(path)) {
      orderAnswers.push({ at: now, status: res.status() })
    } else if (req.method() === 'GET' && readByRequest.has(req)) {
      const read = readByRequest.get(req)!
      void res
        .json()
        .then((b: { scale?: number }) => {
          read.scale = typeof b.scale === 'number' ? b.scale : null
        })
        .catch(() => undefined)
        .finally(() => {
          read.endAt = Date.now()
        })
    }
  })
}

/**
 * G2/G3: an arrangement leg ends PASSED only when its pixels were sampled in BOTH schemes (and no
 * assertion failed); a DOM-only sighting is UNTESTED. Called after test 2 and again after round 2.
 */
function finalizeArrangements(): void {
  const setIf = (name: LegName, status: 'PASSED' | 'UNTESTED', note: string) => {
    if (legs.get(name)!.status === 'FAILED') return
    legs.set(name, { status, note })
    console.log(`[journey-leg] ${name}: ${status}${note ? ` - ${note}` : ''}`)
  }
  const both = (k: 'pastFill' | 'mark') => sampled[k].light && sampled[k].dark
  const flags = (k: 'pastFill' | 'mark') => `light=${sampled[k].light} dark=${sampled[k].dark}`
  if (legs.get('paint-light')!.status === 'FAILED' || legs.get('paint-dark')!.status === 'FAILED') {
    legs.set('extent-past-fill', { status: 'FAILED', note: 'a paint assertion failed (see the paint legs)' })
  } else if (both('pastFill')) {
    setIf('extent-past-fill', 'PASSED', 'pixel inequality asserted past the fill vs the rail in both schemes')
  } else {
    setIf(
      'extent-past-fill',
      'UNTESTED',
      `not sampled in both schemes (${flags('pastFill')}); costs are a small fraction of the fuel aboard; tier 1 tasks 1.1 and 2.1 hold the geometry`,
    )
  }
  if (unaffordableDomOk && both('mark')) {
    setIf('unaffordable-overlay-and-mark', 'PASSED', 'DOM asserted against the wire and the mark pixel sampled in both schemes')
  } else if (unaffordableDomOk) {
    setIf(
      'unaffordable-overlay-and-mark',
      'UNTESTED',
      `an unaffordable overlay was seen and its DOM asserted, but the mark's pixel was not sampled in both schemes (${flags('mark')}); tier 1 tasks 1.4, 2.2 cover the classes`,
    )
  } else if (legs.get('unaffordable-overlay-and-mark')!.status === 'NOT REACHED') {
    // left for the end of test 3, after the second probe
  }
}

// ---------------------------------------------------------------------------
// Fixture, console capture, hard update-depth assertion
// ---------------------------------------------------------------------------

test.describe('the burn-cost overlay - quote, read, clear, replace, lay out, paint, commit', () => {
  if (cfg.env !== 'local') {
    console.log(`[journey-SKIPPED] *** THIS WHOLE FILE IS SKIPPED (env=${cfg.env}, not local): NO LEG RAN, NO EVIDENCE WAS PRODUCED. A green run here proves nothing. ***`)
  }
  test.skip(cfg.env !== 'local', 'drives the auth emulator (local only)')

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: VIEWPORT,
      baseURL: cfg.baseURL,
      ignoreHTTPSErrors: true,
    })
    // Hide the Next.js dev-overlay host; install the one-evaluate overlay reader.
    await context.addInitScript(() => {
      const inject = () => {
        const style = document.createElement('style')
        style.textContent = 'nextjs-portal { display: none !important }'
        document.head.appendChild(style)
      }
      if (document.head) inject()
      else document.addEventListener('DOMContentLoaded', inject)

      const w = window as unknown as OverlayWindow
      w.__readOverlay = () => {
        const q = (id: string) => document.querySelector(`[data-testid="${id}"]`)
        const raw = (id: string) => {
          const el = q(id)
          const v = el?.getAttribute('data-raw') ?? el?.querySelector('[data-raw]')?.getAttribute('data-raw')
          return v == null || v === '' ? null : Number(v)
        }
        const g = q('fuel-gauge')
        const band = g ? g.querySelector('[data-gauge-cost-extent]') : null
        const mark = g ? g.querySelector('[data-gauge-cost-mark]') : null
        let fillPct = 0
        if (g) {
          for (const c of Array.from(g.children)) {
            if (c === band || c === mark) continue
            fillPct += parseFloat((c as HTMLElement).style.width) || 0
          }
        }
        return {
          t: Date.now(),
          gaugeState: g?.getAttribute('data-gauge-state') ?? null,
          costState: g?.getAttribute('data-gauge-cost-state') ?? null,
          hasBand: !!band,
          hasMark: !!mark,
          bandPct: band ? parseFloat((band as HTMLElement).style.width) : null,
          fillPct,
          panelAffordable: q('preview-affordable')?.getAttribute('data-affordable') ?? null,
          stale: document.querySelectorAll('[data-testid="preview-stale"]').length,
          noQuote: document.querySelectorAll('[data-testid="preview-no-quote"]').length,
          previewFuel: raw('preview-fuel'),
          fuelAboard: raw('vitals-fuel-tons'),
          capacity: raw('hold-capacity-total'),
          selection: q('space-canvas-region')?.getAttribute('data-selection') ?? null,
        }
      }
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
    await page.emulateMedia({ colorScheme: 'light' })

    const interiors = captureInteriors(page)
    const woken = await wakeNewCorp(page, 'E2E Overlay', 'overlay')
    homeSystemId = woken.homeSystemId
    fleetId = woken.fleetId
    home = await interiors.get(homeSystemId)
    console.log(
      `[journey-fixture] home ${homeSystemId}, fleet ${fleetId}, ${home.features?.length ?? 0} feature(s), ${home.laneGates?.length ?? 0} gate(s)`,
    )
  })

  test.afterAll(async () => {
    await context?.close()
  })

  /**
   * The update-depth diagnostic is a HARD assertion (the predecessors'
   * `[journey-console]` capture): with an overlay drawn this is the only guard
   * for a render loop that needs a quote. The buffer is cumulative across the
   * file's tests (one page); each test examines only what arrived since the last.
   */
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
  // 1. No selection; a quote reads the panel's flag; clearing withdraws
  // =========================================================================
  test('1: no selection draws nothing; a quoted target draws an overlay equal to the panel flag; clearing withdraws it', async () => {
    const t0 = Date.now()

    await runLeg('no-selection', async () => {
      let s = await snap()
      await expect
        .poll(
          async () => {
            s = await snap()
            return s.gaugeState
          },
          { timeout: 10_000, message: 'the fuel gauge never read filled on a fresh spawn' },
        )
        .toBe('filled')
      const i = logSnap('no selection', s)
      const ctx = `snap#${i}: ${fmt(i, s)}`
      expect(s.selection, `GIVEN: nothing selected (${ctx})`).toBe('')
      expect(s.costState, `no data-gauge-cost-state with no selection (${ctx})`).toBeNull()
      expect(s.hasBand, `no extent with no selection (${ctx})`).toBe(false)
      expect(s.hasMark, `no mark with no selection (${ctx})`).toBe(false)
      expect(s.fillPct, `the fill is drawn with no selection (${ctx})`).toBeGreaterThan(0)
      expect(s.panelAffordable, `no quote in the panel with no selection (${ctx})`).toBeNull()
    })

    // Probe: quote first, then choose. Features first, then gates; bounded.
    const candidates: { id: string; kind: string }[] = []
    const seen = new Set<string>()
    for (const f of (home.features ?? []).filter((x) => x.type !== 'star').slice(0, MAX_FEATURE_CANDIDATES)) {
      if (!seen.has(f.id)) {
        seen.add(f.id)
        candidates.push({ id: f.id, kind: f.type })
      }
    }
    for (const g of (home.laneGates ?? []).slice(0, MAX_GATE_CANDIDATES)) {
      if (g.id && !seen.has(g.id)) {
        seen.add(g.id)
        candidates.push({ id: g.id, kind: 'lane-gate' })
      }
    }
    console.log(`[journey-probe] round 1: ${candidates.length} candidate(s): ${candidates.map((c) => `${c.id}(${c.kind})`).join(', ')}`)
    probe.length = 0
    probe.push(...(await probeTargets('round 1', candidates, t0, PROBE_BUDGET_MS)))
    const quoted = probe.filter((p) => p.current)
    console.log(
      `[journey-probe] round 1: ${quoted.length} quoted of ${probe.length} tried; flags: ` +
        `${quoted.map((p) => `${p.id}=${p.snap.panelAffordable}`).join(' ') || 'none'}`,
    )

    await runLeg('overlay-equals-panel-flag', async () => {
      expect(
        quoted.length,
        `FIXTURE: none of ${probe.length} tried target(s) produced a current quote; the overlay cannot be read. ` +
          `Missed: ${probe.map((p) => `${p.id}@snap#${p.snapIdx}`).join(' ')}`,
      ).toBeGreaterThanOrEqual(1)
      for (const p of quoted) {
        const v = violations(p.snap)
        expect(
          v,
          `target ${p.id} (${p.kind}), snap#${p.snapIdx}: ${fmt(p.snapIdx, p.snap)}. Gauge and panel were read in one evaluate, so they are one quote.`,
        ).toEqual([])
        expect(p.snap.costState, `target ${p.id}: the overlay is drawn for a current quote`).not.toBeNull()
        await waitWireParsed(p.id, p.answerFrom)
        expect(
          wireViolations(p.id, p.snap, p.answerFrom),
          `target ${p.id} (${p.kind}), snap#${p.snapIdx}: ${fmt(p.snapIdx, p.snap)}; gauge against the recorded WIRE answer`,
        ).toEqual([])
      }
    })

    await runLeg('clear-withdraws', async () => {
      const entry = quoted.find((p) => p.onScreen) ?? quoted[0]
      if (!entry) return { untested: 'no target produced a quote, so there was no overlay to clear' }
      await selectBody(page, entry.id)
      const q = await waitQuote(entry.id, 6_000)
      const i = logSnap(`clear: before, ${entry.id}`, q.s)
      expect(q.current, `GIVEN: a current quote for ${entry.id} before clearing (snap#${i}: ${fmt(i, q.s)})`).toBe(true)
      expect(q.s.costState, `GIVEN: overlay drawn before clearing (snap#${i})`).not.toBeNull()
      // Re-picking the selected target toggles it off (space-selection.toggleSelection).
      const how = await activateBody(entry.id)
      const region = page.getByTestId('space-canvas-region')
      try {
        await expect(region).toHaveAttribute('data-selection', '', { timeout: 6_000 })
      } catch (e) {
        if (how === 'offscreen') return { untested: `the off-screen affordance for ${entry.id} did not toggle the selection off: ${firstLine(e)}` }
        throw e
      }
      let s = await snap()
      await expect
        .poll(
          async () => {
            s = await snap()
            return s.costState === null && !s.hasBand && !s.hasMark
          },
          { timeout: 5_000, message: 'the overlay was not withdrawn after the selection was cleared' },
        )
        .toBe(true)
      const j = logSnap(`clear: after, ${entry.id}`, s)
      expect(s.gaugeState, `the fill stays drawn after clearing (snap#${j}: ${fmt(j, s)})`).toBe('filled')
      expect(s.selection, `selection is empty after clearing (snap#${j})`).toBe('')
    })
  })

  // =========================================================================
  // 2. Replace the selection; width floor with an overlay; paint in both schemes
  // =========================================================================
  test('2: replacing the selection never shows the previous cost; the strip fits 1280x720 with an overlay; both extents read on one rail in both schemes', async () => {
    const t0 = Date.now()
    const quoted = probe.filter((p) => p.current)

    await runLeg('replace-selection', async () => {
      const x = quoted[0]
      const y = quoted.find((p) => p.id !== x?.id)
      if (!x || !y) return { untested: `needs two quoted targets, probe round 1 found ${quoted.length}` }
      await selectBody(page, x.id)
      const qx = await waitQuote(x.id, 6_000)
      const ix = logSnap(`replace: X=${x.id} before`, qx.s)
      expect(qx.current, `GIVEN: X=${x.id} quoted (snap#${ix}: ${fmt(ix, qx.s)})`).toBe(true)
      const xPct = qx.s.bandPct
      await startSampler()
      await selectBody(page, y.id)
      const qy = await waitQuote(y.id, 6_000)
      await settleFrames()
      const samples = (await stopSampler()).filter((s) => s.selection === y.id)
      const iy = logSnap(`replace: Y=${y.id} after`, qy.s)
      expect(qy.current, `Y=${y.id} was never quoted after the replace (snap#${iy}: ${fmt(iy, qy.s)})`).toBe(true)
      const yPct = qy.s.bandPct
      // Log the distinct sampled states, indexed, before asserting.
      let lastKey = ''
      const idx: number[] = []
      for (const s of samples) {
        const key = `${s.costState}|${s.bandPct}|${s.panelAffordable}|${s.previewFuel}|${s.stale}`
        if (key === lastKey) continue
        lastKey = key
        idx.push(logSnap('replace: sampled while Y selected', s))
      }
      const bad: string[] = []
      samples.forEach((s) => {
        for (const m of violations(s)) bad.push(`${m} :: ${fmt(0, s)}`)
        if (
          xPct !== null && yPct !== null && s.bandPct !== null &&
          Math.abs(xPct - yPct) >= 1 && Math.abs(s.bandPct - xPct) < 0.3 && Math.abs(s.bandPct - yPct) >= 0.3
        ) {
          bad.push(`the previous target's extent (${xPct}%) was drawn while Y=${y.id} was selected :: ${fmt(0, s)}`)
        }
      })
      console.log(
        `[journey-replace] X ${x.id} band ${xPct}% ; Y ${y.id} band ${yPct}% ; ${samples.length} sample(s) while Y selected, ${idx.length} distinct state(s) logged`,
      )
      expect(bad, 'snapshots (25 ms sampler, gauge and panel read together) that broke the replace rule').toEqual([])
      expect(samples.length, 'the sampler saw no snapshot with Y selected').toBeGreaterThan(0)
    })

    await runLeg('width-floor-1280x720', async () => {
      const entry = quoted[0]
      if (!entry) return { untested: 'no quoted target to draw an overlay with' }
      expect(page.viewportSize(), 'the floor is 1280x720').toEqual(VIEWPORT)
      await selectBody(page, entry.id)
      const q = await waitQuote(entry.id, 6_000)
      const i = logSnap(`floor: ${entry.id}`, q.s)
      expect(q.current && q.s.hasBand, `GIVEN: an overlay drawn at the floor (snap#${i}: ${fmt(i, q.s)})`).toBe(true)
      const cellIds = ['vitals-fleet-cell', 'vitals-fuel-cell', 'vitals-hold-cell', 'vitals-credits-cell', 'vitals-clock-cell']
      const surfaceIds = ['space-fleet-panel', 'preview-panel', 'space-camera-controls', 'floating-nav']
      const surfaces: [string, Box][] = []
      for (const id of surfaceIds) {
        if ((await page.getByTestId(id).count()) === 0) {
          console.log(`[journey-floor] surface ${id} not in the DOM; skipped`)
          continue
        }
        surfaces.push([id, await boxOf(id)])
      }
      for (const [name, b] of surfaces) expect(insideViewport(b), `${name} stays inside 1280x720`).toBe(true)
      for (const id of cellIds) {
        const b = await boxOf(id)
        expect(insideViewport(b), `${id} fully inside 1280x720 with the overlay drawn (${JSON.stringify(b)})`).toBe(true)
        for (const [name, sb] of surfaces) expect(overlaps(b, sb), `${id} must not be overlapped by ${name}`).toBe(false)
      }
      const geo = await readGeometry()
      expect(geo?.band, 'the extent has a box').toBeTruthy()
      const fuelCell = await boxOf('vitals-fuel-cell')
      const g = geo!
      const tol = 0.75
      expect(g.band!.left, 'the extent starts at the rail start').toBeGreaterThanOrEqual(g.rail.left - tol)
      expect(g.band!.right, 'the extent stays inside the rail').toBeLessThanOrEqual(g.rail.right + tol)
      expect(g.rail.right, 'the rail stays inside the fuel cell').toBeLessThanOrEqual(fuelCell.x + fuelCell.width + tol)
      expect(g.rail.left, 'the rail stays inside the fuel cell').toBeGreaterThanOrEqual(fuelCell.x - tol)
      console.log(`[journey-floor] rail ${JSON.stringify(g.rail)} band ${JSON.stringify(g.band)} fuel cell ${JSON.stringify(fuelCell)}`)
    })

    // ---- paint ----
    const arrangedFromProbe = {
      pastFill: quoted.find((p) => p.snap.hasBand && p.snap.bandPct !== null && p.snap.bandPct > p.snap.fillPct + 5),
      unaffordable: quoted.find((p) => p.snap.panelAffordable === 'false'),
    }
    // Targets: the longest extent, the shortest that is still wide enough, then any arrangement entry.
    const withBand = quoted.filter((p) => p.snap.bandPct !== null).sort((a, b) => b.snap.bandPct! - a.snap.bandPct!)
    const paintTargets: ProbeEntry[] = []
    for (const p of [withBand[0], withBand[withBand.length - 1], arrangedFromProbe.pastFill, arrangedFromProbe.unaffordable]) {
      if (p && !paintTargets.some((t) => t.id === p.id)) paintTargets.push(p)
    }
    console.log(
      `[journey-paint] targets: ${paintTargets.map((p) => `${p.id}(band ${p.snap.bandPct}%, fill ${p.snap.fillPct}%, flag ${p.snap.panelAffordable})`).join('; ') || 'none'}; ` +
        `past-fill arranged=${!!arrangedFromProbe.pastFill} unaffordable arranged=${!!arrangedFromProbe.unaffordable}`,
    )
    const paintLeg = (scheme: 'light' | 'dark', order: ProbeEntry[]) => async (): Promise<{ untested: string } | void> => {
      if (paintTargets.length === 0) return { untested: 'no quoted target to paint' }
      const notes: string[] = []
      let full = 0
      let budgetHit = false
      for (const t of order) {
        if (Date.now() - t0 > 52_000) {
          budgetHit = true
          notes.push(`BUDGET EXHAUSTED before ${t.id}: the shared 60 s test budget ran out`)
          console.log(`[journey-paint] ${scheme}: BUDGET EXHAUSTED before ${t.id} (the shared 60 s test budget), NOT a sampling or product outcome`)
          break
        }
        await selectBody(page, t.id)
        const q = await waitQuote(t.id, 5_000)
        const i = logSnap(`paint ${scheme}: ${t.id}`, q.s)
        if (!q.current) {
          notes.push(`${t.id}: no current quote (snap#${i})`)
          continue
        }
        const r = await samplePaint(scheme, t.id)
        if ('untested' in r) {
          notes.push(`${t.id}: ${r.untested}`)
          console.log(`[journey-paint] ${scheme} ${t.id}: UNTESTED sample - ${r.untested}`)
          continue
        }
        const { fullTriple } = assertPaint(r)
        if (fullTriple) full++
        if (r.points.pastFill) sampled.pastFill[scheme] = true
        if (r.points.mark) sampled.mark[scheme] = true
      }
      if (full === 0) return { untested: `${budgetHit ? 'BUDGET EXHAUSTED (shared test budget) - ' : ''}no target gave all three samples in the ${scheme} scheme: ${notes.join(' ; ') || 'none sampled'}` }
      if (notes.length) console.log(`[journey-paint] ${scheme}: partial notes: ${notes.join(' ; ')}`)
    }
    await runLeg('paint-light', paintLeg('light', paintTargets))
    await runLeg('paint-dark', paintLeg('dark', [...paintTargets].reverse()))
    await page.emulateMedia({ colorScheme: 'light' })

    finalizeArrangements()

    if (arrangedFromProbe.unaffordable) {
      await runLeg('unaffordable-overlay-and-mark', async () => {
        const t = arrangedFromProbe.unaffordable!
        const from = previewAnswers.length
        await selectBody(page, t.id)
        const q = await waitQuote(t.id, 5_000)
        const i = logSnap(`unaffordable: ${t.id}`, q.s)
        expect(q.current, `GIVEN: a current unaffordable quote for ${t.id} (snap#${i}: ${fmt(i, q.s)})`).toBe(true)
        expect(violations(q.s), `snap#${i}: ${fmt(i, q.s)}`).toEqual([])
        await waitWireParsed(t.id, from)
        expect(wireViolations(t.id, q.s, from), `snap#${i}: ${fmt(i, q.s)} against the WIRE`).toEqual([])
        expect(q.s.costState, 'unaffordable overlay').toBe('unaffordable')
        expect(q.s.hasMark, 'the unaffordable overlay carries its mark').toBe(true)
        unaffordableDomOk = true
      })
    }
    finalizeArrangements()
  })

  // =========================================================================
  // 3. Commit withdraws at acceptance; probe round 2 for an unaffordable overlay
  // =========================================================================
  test('3: a committed order withdraws the overlay from acceptance; a bounded second probe looks for an unaffordable overlay', async () => {
    const t0 = Date.now()
    const quoted = probe.filter((p) => p.current && p.snap.panelAffordable === 'true')
    const scale = fleetReads.find((r) => r.scale != null)?.scale ?? Number(process.env.E2E_WORLD_TIME_SCALE ?? '5')
    const wallMs = (p: ProbeEntry) => (p.flightWorldMs === null ? Number.POSITIVE_INFINITY : p.flightWorldMs / scale)
    let committed = false

    await runLeg('commit-withdraws-at-acceptance', async () => {
      // The costliest affordable quote whose flight fits the arrival wait: the one most likely to show up in the next probe.
      const choice = [...quoted]
        .filter((p) => wallMs(p) <= MAX_FLIGHT_WALL_MS)
        .sort((a, b) => (b.snap.previewFuel ?? 0) - (a.snap.previewFuel ?? 0))[0]
      if (!choice) return { untested: `no affordable quoted target with a flight under ${MAX_FLIGHT_WALL_MS} ms wall (scale ${scale}) was probed` }
      await selectBody(page, choice.id)
      const q = await waitQuote(choice.id, 6_000)
      const i = logSnap(`commit: before, ${choice.id}`, q.s)
      expect(q.current, `GIVEN: ${choice.id} quoted before the commit (snap#${i}: ${fmt(i, q.s)})`).toBe(true)
      expect(q.s.costState, `GIVEN: overlay drawn before the commit (snap#${i})`).not.toBeNull()
      console.log(`[journey-commit] ${choice.id}: flight ${choice.flightWorldMs} world ms = ${Math.round(wallMs(choice))} wall ms at scale ${scale}`)

      await startSampler()
      const ordersBefore = orderAnswers.length
      await page.getByTestId('burn-button').click()
      let got = false
      await expect
        .poll(() => (got = orderAnswers.length > ordersBefore), { timeout: 15_000, message: 'Burn sent no order answer within 15 s' })
        .toBe(true)
      expect(got).toBe(true)
      const accepted = orderAnswers[ordersBefore]!
      expect(accepted.status, `the order was not accepted: HTTP ${accepted.status}; the body is in the [journey-http] lines`).toBeLessThan(300)
      committed = true

      let read: FleetsRead | undefined
      await expect
        .poll(
          () => {
            read = fleetReads.find((r) => r.startAt >= accepted.at && r.endAt !== null)
            return read !== undefined
          },
          { timeout: 15_000, message: 'no own-fleets read completed after the acceptance' },
        )
        .toBe(true)
      const readEnd = read!.endAt!
      await expect
        .poll(
          () =>
            page.evaluate(
              (t) => ((window as unknown as OverlayWindow).__ovl ?? []).filter((s) => s.t > t + 50).length,
              readEnd,
            ),
          { timeout: 5_000, message: 'no sampler snapshot after the first own-fleets read' },
        )
        .toBeGreaterThan(0)
      const all = await stopSampler()
      // Log the distinct sampled states relative to the acceptance, indexed, before asserting.
      let lastKey = ''
      for (const s of all) {
        const key = `${s.costState}|${s.hasBand}|${s.hasMark}|${s.gaugeState}|${s.panelAffordable}`
        if (key === lastKey) continue
        lastKey = key
        const n = logSnap(`commit: +${s.t - accepted.at} ms from acceptance (read ended +${readEnd - accepted.at} ms)`, s)
        void n
      }
      const early = all.filter((s) => s.t >= accepted.at && s.t < accepted.at + 100 && overlayDrawn(s)).length
      console.log(
        `[journey-commit] OBSERVATION: ${early} snapshot(s) within 100 ms of the node-side acceptance still showed the overlay ` +
          '(the browser receives the answer before node reports it; not asserted)',
      )
      const win = all.filter((s) => s.t >= accepted.at + 100 && s.t <= readEnd + 250)
      expect(win.length, 'the sampler saw no snapshot in the acceptance-to-first-read window').toBeGreaterThan(0)
      expect(win.filter((s) => s.t > readEnd).length, 'no snapshot after the first read: the leg would pass vacuously').toBeGreaterThan(0)
      const broken = win.filter((s) => overlayDrawn(s) || s.gaugeState === 'no-data' || s.gaugeState === null)
      expect(
        broken.map((s) => ({ ...s, t: s.t - accepted.at })),
        'snapshots (gauge-keyed) in [acceptance+100 ms, first own-fleets read end+250 ms] that drew an overlay or lost the fill',
      ).toEqual([])
    })

    // Wait for the arrival (bounded, never raised), then a bounded second probe.
    let round2Quoted: ProbeEntry[] = []
    if (committed) {
      const row = page.getByTestId(`fleet-row-${fleetId}`)
      let arrived = true
      try {
        await expect(row, 'the roster row stops reading under way').not.toContainText(/under way/i, { timeout: MAX_FLIGHT_WALL_MS + 3_000 })
      } catch (e) {
        arrived = false
        console.log(`[journey-probe] round 2 skipped: the fleet had not arrived in time (${firstLine(e)})`)
      }
      if (arrived && Date.now() - t0 < 40_000) {
        const s0 = await snap()
        logSnap('arrived: overlay observation (not asserted)', s0)
        const again = probe.map((p) => ({ id: p.id, kind: p.kind })).slice(0, 5)
        const round2 = await probeTargets('round 2', again, t0, 46_000)
        round2Quoted = round2.filter((p) => p.current)
        console.log(
          `[journey-probe] round 2: ${round2.filter((p) => p.current).length} quoted of ${round2.length}; ` +
            `flags: ${round2.filter((p) => p.current).map((p) => `${p.id}=${p.snap.panelAffordable}`).join(' ') || 'none'}`,
        )
      }
    }

    // Round 2 feeds the arrangement legs (G2, G3): any round-2 quote whose extent runs past the fill, or that
    // is unaffordable, is asserted against the wire and its pixels sampled in BOTH schemes.
    const extra = round2Quoted.filter(
      (p) => p.snap.panelAffordable === 'false' || (p.snap.bandPct !== null && p.snap.bandPct > p.snap.fillPct + 5),
    )
    for (const u of extra.slice(0, 2)) {
      const isUnaff = u.snap.panelAffordable === 'false'
      const isPast = u.snap.bandPct !== null && u.snap.bandPct > u.snap.fillPct + 5
      if (Date.now() - t0 > 54_000) {
        console.log(`[journey-paint] round 2 ${u.id}: BUDGET EXHAUSTED (shared 60 s test budget) before its pixels were sampled`)
        break
      }
      try {
        const from = u.answerFrom
        await selectBody(page, u.id)
        const q = await waitQuote(u.id, 5_000)
        const i = logSnap(`round 2 arrangement: ${u.id} (unaffordable=${isUnaff} past-fill=${isPast})`, q.s)
        expect(q.current, `GIVEN: a current quote for ${u.id} (snap#${i}: ${fmt(i, q.s)})`).toBe(true)
        expect(violations(q.s), `snap#${i}: ${fmt(i, q.s)}`).toEqual([])
        await waitWireParsed(u.id, from)
        expect(wireViolations(u.id, q.s, from), `snap#${i}: ${fmt(i, q.s)} against the WIRE`).toEqual([])
        if (isUnaff) {
          expect(q.s.costState).toBe('unaffordable')
          expect(q.s.hasMark, 'the unaffordable overlay carries its mark').toBe(true)
          unaffordableDomOk = true
        }
        for (const scheme of ['light', 'dark'] as const) {
          const r = await samplePaint(scheme, u.id)
          if ('untested' in r) {
            console.log(`[journey-paint] round 2 ${scheme} ${u.id}: UNTESTED sample - ${r.untested}`)
            continue
          }
          assertPaint(r)
          if (r.points.pastFill) sampled.pastFill[scheme] = true
          if (r.points.mark) sampled.mark[scheme] = true
        }
      } catch (e) {
        if (isUnaff) legs.set('unaffordable-overlay-and-mark', { status: 'FAILED', note: firstLine(e) })
        if (isPast) legs.set('extent-past-fill', { status: 'FAILED', note: firstLine(e) })
        console.log(`[journey-leg] round 2 arrangement ${u.id}: FAILED - ${firstLine(e)}`)
      }
    }
    await page.emulateMedia({ colorScheme: 'light' })
    finalizeArrangements()
    if (legs.get('unaffordable-overlay-and-mark')!.status === 'NOT REACHED') {
      legs.set('unaffordable-overlay-and-mark', {
        status: 'UNTESTED',
        note:
          'the bounded probe (round 1 before the commit, round 2 after the arrival, two rounds, under about 15 s of budget left) arranged no ' +
          'unaffordable quote: starting fuel is 100 t and observed costs are a small fraction of it. Tier 1 is the cover: tasks 2.1, 2.2 and 1.4.',
      })
      console.log(`[journey-leg] unaffordable-overlay-and-mark: UNTESTED - ${legs.get('unaffordable-overlay-and-mark')!.note}`)
    }
  })

  // =========================================================================
  // 4. The summary and the closing assertion
  // =========================================================================
  test('4: the must-pass legs passed and no leg failed', async () => {
    console.log('[journey-summary] ===== leg outcomes =====')
    for (const n of LEG_NAMES) {
      const o = legs.get(n)!
      console.log(`[journey-summary] ${n}${MUST_PASS.includes(n) ? ' (MUST PASS)' : ''}: ${o.status}${o.note ? ` - ${o.note}` : ''}`)
    }
    console.log('[journey-summary] ========================')
    const failed = LEG_NAMES.filter((n) => legs.get(n)!.status === 'FAILED').map((n) => `${n}: ${legs.get(n)!.note}`)
    expect(failed, 'legs that FAILED (each message is the first assertion that broke; the leg logs above carry the snapshots)').toEqual([])
    for (const n of MUST_PASS) {
      expect(
        legs.get(n)!.status,
        `must-PASS leg ${n} is ${legs.get(n)!.status} (${legs.get(n)!.note}). No selection -> no overlay with the gauge filled; ` +
          'a selected target -> an overlay whose state equals the panel flag for the same quote; clearing -> the overlay gone.',
      ).toBe('PASSED')
    }
  })
})
