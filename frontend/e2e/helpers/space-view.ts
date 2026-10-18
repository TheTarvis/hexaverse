import { expect, type Locator, type Page, type Response } from '@playwright/test'

/**
 * Shared drivers for the continuous-space system view
 * (`components/space/SystemSpaceView`), used by every e2e suite rewritten
 * off the retired board view under openspec change
 * `build-production-space-view`, tasks.md 2.1b / 10.8.
 *
 * WHY A HELPER AND NOT FIVE COPIES. Five suites shared one board-view contract
 * (`board-overlay`, `feature-glyph-*`, `gate-glyph-*`, `fleet-cmd-burn-*`)
 * and five copies of the wake-up flow. The test ids changed; the journeys
 * did not. Keeping the drivers in one place means the NEXT view change edits
 * one file, and — more importantly here — means every suite selects bodies
 * the same way: off the SERVED interior read, never off a client-side
 * reconstruction of an id.
 *
 * THE ONE RULE THIS FILE ENFORCES. `system-interior`'s *Lane-Gate Bodies
 * Carry Their Body Id* (tasks.md 9.1b–9.1d) makes the gate's `id` a served
 * string. No helper here builds `"gate-" + destSystemId`: `captureInterior`
 * records what the server actually sent, and every selector is keyed on
 * that. A suite that rebuilt the convention would keep passing after the
 * server changed it — which is the whole failure mode the served id exists
 * to prevent.
 */

/** A lane-gate body exactly as the interior read serves it. */
export interface ServedGate {
  /** The gate body's own id — served (9.1b), never reconstructed here. */
  id?: string
  destSystemId: string
  laneId?: string
}

export interface ServedResource {
  kind: string
  richness: number
}

export interface ServedFeature {
  id: string
  type: string
  resources?: ServedResource[]
}

export interface ServedInterior {
  systemId: string
  features: ServedFeature[]
  laneGates: ServedGate[]
}

/** What `InteriorCapture.get` waits (bounded) for a system's interior read. */
const DEFAULT_INTERIOR_TIMEOUT_MS = 20_000

/**
 * The read side of `captureInteriors`. `get` is a BOUNDED POLL, not a single
 * synchronous map read — see the fix note on `captureInteriors` for why a
 * single read is unsound against a response captured off an event listener.
 */
export interface InteriorCapture {
  /**
   * Resolves once `GET /v1/systems/:systemId`'s body has been captured AND
   * parsed, polling up to `timeoutMs` (default 20s). Throws — it never
   * silently returns `undefined` — and the thrown message SAYS WHICH of the
   * two distinct failures happened: the response was never observed at all,
   * or it was observed (a response object arrived) but its body did not
   * finish parsing inside the budget. Collapsing those two into one "missing"
   * outcome is exactly the bug this replaces.
   */
  get(systemId: string, timeoutMs?: number): Promise<ServedInterior>
}

/**
 * Records every `GET /v1/systems/:id` body this session receives, keyed by
 * system id. This is the "wire" end of every wire-to-click assertion below:
 * nothing in these suites is a fixture, and nothing re-derives a served id.
 *
 * Call before the first navigation.
 *
 * FIX (2026-09-09, second consecutive archive gate this helper stalled).
 * The prior shape returned a plain `Map` and populated it from inside a
 * DETACHED `page.on('response', async (res) => { await res.json() ... })`
 * handler: the listener callback runs as its own floating promise, and nothing
 * connected its completion to a caller's later, SYNCHRONOUS `interiors.get(id)`
 * read. A response genuinely served (200, in well under a second) could still
 * lose that race against a caller who read the map a couple of seconds later,
 * because "a couple of seconds" was never a guarantee the parse had finished —
 * only usually enough. The failure then read as "interior never captured",
 * which is false: it was captured, just not yet parsed at the instant of the
 * synchronous read. The old code could not even tell the two cases apart.
 *
 * This version fixes both problems:
 *
 *   1. The parse is anchored to the response object itself
 *      (`res.body()`, the raw bytes), started synchronously at event-fire
 *      time — same as before — but the CONSUMER now waits on it too, via a
 *      bounded poll (`get`, below), instead of taking one synchronous
 *      snapshot of a map that may not have been written yet.
 *   2. `servedAt` is written synchronously, at event-fire time, BEFORE the
 *      body is parsed — so a poll that times out can distinguish "no
 *      response was ever observed for this system id" (nothing in
 *      `servedAt`) from "a response arrived but parsing it did not finish in
 *      time" (`servedAt` has it, `parsed` does not), and say which in the
 *      thrown error rather than reporting one generic "never captured".
 */
export function captureInteriors(page: Page): InteriorCapture {
  const parsed = new Map<string, ServedInterior>()
  const servedAt = new Map<string, number>()

  page.on('response', (res) => {
    const url = new URL(res.url())
    const m = /^\/v1\/systems\/([^/]+)$/.exec(url.pathname)
    if (!m || res.request().method() !== 'GET' || !res.ok()) return
    const systemId = m[1]
    // Synchronous, at event-fire time: this is what lets `get`'s bounded
    // poll (below) tell "never served" from "served, still parsing" even
    // while the parse below is still in flight.
    servedAt.set(systemId, Date.now())
    // Anchored to THIS event's own response — its raw bytes via `res.body()`
    // — rather than a detached `await res.json()` a synchronous read could
    // race past. The consumer no longer takes a single synchronous snapshot;
    // it polls (see `get`), so this promise settling late is tolerated, not
    // silently missed.
    void res
      .body()
      .then((buf) => {
        const body = JSON.parse(buf.toString('utf-8')) as ServedInterior
        if (Array.isArray(body.features) || Array.isArray(body.laneGates)) {
          parsed.set(systemId, body)
        }
      })
      .catch(() => {
        // A non-JSON or unreadable body is not a suite's concern; `get`'s
        // poll below times out and reports "served, not parsed" rather than
        // hanging on a body that will never arrive.
      })
  })

  return {
    async get(systemId: string, timeoutMs = DEFAULT_INTERIOR_TIMEOUT_MS): Promise<ServedInterior> {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const hit = parsed.get(systemId)
        if (hit) return hit
        if (Date.now() >= deadline) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      if (servedAt.has(systemId)) {
        throw new Error(
          `captureInteriors: GET /v1/systems/${systemId} WAS served (response observed at ` +
            `${new Date(servedAt.get(systemId)!).toISOString()}) but its body did not finish ` +
            `parsing within ${timeoutMs}ms — a parse race, not a missing read.`,
        )
      }
      throw new Error(
        `captureInteriors: GET /v1/systems/${systemId} was never served within ${timeoutMs}ms — ` +
          `no matching response was observed at all.`,
      )
    },
  }
}

/** Records the JSON body of every POST matching `pathPattern`. */
export function capturePosts<T>(page: Page, pathPattern: RegExp): T[] {
  const bodies: T[] = []
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !pathPattern.test(req.url())) return
    try {
      bodies.push(req.postDataJSON() as T)
    } catch {
      bodies.push({} as T)
    }
  })
  return bodies
}

export interface WokenCorp {
  email: string
  password: string
  homeSystemId: string
  fleetId: string
}

/**
 * Signs up a brand-new account, names the lineage, and waits for the space
 * view's FIRST RENDERED FRAME on the home system — the state every journey
 * below starts from.
 *
 * The first-frame wait is not decoration: the loading placeholder holds
 * through it by design (`system-space-view`: "Loading persists through first
 * frame after data arrives"), so a suite that clicked as soon as the route
 * settled would be clicking at a placeholder.
 */
export async function wakeNewCorp(page: Page, name: string, tag: string, options: { keepGuide?: boolean } = {}): Promise<WokenCorp> {
  const email = `e2e+${tag}-${Date.now()}@hexaverse.test`
  const password = 'e2ePassword123!'

  await page.goto('/login?signUp=true')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-confirm-password').fill(password)
  await page.getByTestId('login-submit').click()

  await expect(page.getByTestId('wake-up-flow')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('wake-name-input').fill(name)
  await page.getByTestId('wake-submit').click()
  // 60s, not 20s: spawn is a multi-domain write (corp + pointer txn, hull,
  // fog, station, opening grant) and on a cold test backend the FIRST spawn of
  // a run routinely takes longer than 20s. Three suites lost runs to that
  // budget while asserting nothing about latency. Widening a wait for a state
  // that always eventually arrives removes flake without weakening anything;
  // the assertion is still "the wake lands on a system route".
  await page.waitForURL(/\/systems\/[^/]+$/, { timeout: 60_000 })

  const homeSystemId = new URL(page.url()).pathname.split('/').pop()!
  await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('space-canvas-region')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('space-loading')).toBeHidden({ timeout: 60_000 })

  if (!options.keepGuide) await prepareCommandHud(page)
  const chooser = page.getByTestId('vitals-fleet-chevron')
  await expect(chooser).toBeVisible()
  await chooser.click()
  const items = page.locator('[data-testid^="vitals-fleet-menu-item-"]')
  await expect(items, 'a fresh spawn has exactly one hull').toHaveCount(1)
  const fleetId = (await items.first().getAttribute('data-testid'))!.replace('vitals-fleet-menu-item-', '')
  await chooser.press('Escape')
  await expect(page.getByTestId('vitals-fleet-id')).toHaveText(fleetId)

  return { email, password, homeSystemId, fleetId }
}

/** Open the existing Objects card; there is no inner list disclosure. */
export async function showObjects(page: Page): Promise<void> {
  const panel = page.locator('section[data-panel="objects"]')
  if (!await panel.isVisible()) await page.getByRole('button', { name: /^Objects(?: \(hidden\))?$/ }).click()
  await expect(panel).toBeVisible({ timeout: 10_000 })
}

/** Leave the optional tutorial and close the outer Objects card. */
export async function prepareCommandHud(page: Page): Promise<void> {
  const dismiss = page.getByTestId('dismiss-guide')
  if (await dismiss.isVisible()) await dismiss.click()
  const close = page.getByRole('button', { name: /^(Hide Objects|Close Objects panel)$/ })
  if (await close.isVisible()) await close.click()
}

/** Open current disclosed details through the always-visible search/list. */
export async function openObjectDetails(page: Page, bodyId: string): Promise<Locator> {
  await showObjects(page)
  const reviewBack = page.getByTestId('compact-travel-card').getByRole('button', { name: 'Back', exact: true })
  if (await reviewBack.isVisible()) await reviewBack.click()
  const details = page.getByRole('complementary', { name: `Details for ${bodyId}`, exact: true })
  if (!await details.isVisible()) {
    const back = page.getByTestId('details-back')
    if (await back.isVisible()) await back.click()
    await page.getByTestId('system-index-search').fill('')
    const row = page.getByTestId(`index-${bodyId}`)
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.click({ timeout: 10_000 })
  }
  await expect(details).toBeVisible()
  return details
}

/**
 * Selects a body by its SERVED id, whether it is on screen or reachable only
 * through the off-screen affordance.
 *
 * Both paths are legitimate player paths (`system-space-view`: *Off-Screen
 * Marks Are Reachable*), and which one applies depends on the seed's
 * geometry — a lane gate at a system's rim is essentially never on screen at
 * the default framing, while an inner planet essentially always is. A suite
 * that only handled the on-screen case would be seed-dependent and flake.
 *
 * HOW THE ON-SCREEN CASE ACTIVATES, and why it is not a click (SDET, 2026-09-03).
 * Two earlier strategies both failed against a scene that animates every
 * frame, and neither failure was a production defect:
 *
 *   - `locator.click()` never got past Playwright's actionability check. A
 *     mark orbits its parent on every animation frame, so the element is
 *     never "stable" (observed: 708 and 674 consecutive position samples with
 *     no two alike), and on the rare frame it settled, a sibling mark drawn
 *     over it intercepted the pointer event.
 *   - `dispatchEvent('click')` needs neither, but selects nothing: the
 *     picking seam resolves a pick from pointerdown + pointerup on the region
 *     (`SpaceStage.tsx`'s `handlePointerDown`/`finishGesture`), and the
 *     `body-hit-*` element carries no `onClick` at all — it is the KEYBOARD
 *     hit target, activated by Enter or Space
 *     (`SpaceStage.interaction.test.tsx`: *Enter/Space selects the focused
 *     body or gate*).
 *
 * So the on-screen path focuses the hit target and presses Enter. That is not
 * a workaround: it is the player path `system-space-view`'s *Body, Lane-Gate,
 * and Point Selection Is Keyboard-Operable* specifies, it needs no stability
 * and no hit-testing, and the requirement itself demands the result be
 * "identical to a pointer click" — so every assertion downstream of a
 * selection is asserting the same thing either way. `selectBodyByPointer`
 * below keeps a genuine pointer gesture in the e2e suite so that identity is
 * not merely assumed.
 */
export async function selectBody(page: Page, bodyId: string): Promise<void> {
  const hit = page.getByTestId(`body-hit-${bodyId}`)
  const offscreen = page.getByTestId(`offscreen-${bodyId}`)
  await expect
    .poll(async () => (await hit.count()) + (await offscreen.count()), {
      timeout: 30_000,
      message: `neither an on-screen hit target nor an off-screen affordance exists for ${bodyId}`,
    })
    .toBeGreaterThan(0)

  // IDEMPOTENT, and it has to be: selection TOGGLES
  // (`space-selection.toggleSelection`), so activating a mark that is already
  // selected DESELECTS it. A journey that picks a body and then asks for the
  // same body by id — which happens whenever the first pickable mark and the
  // first mineable body are the same feature — would otherwise clear its own
  // selection and read as "nothing got selected".
  if ((await page.getByTestId('space-canvas-region').getAttribute('data-selection')) === bodyId) {
    await expectSelectionLanded(page, bodyId)
    return
  }

  if (await offscreen.isVisible()) {
    await offscreen.first().click({ timeout: 10_000 })
  } else if (!await hit.isVisible()) {
    await openObjectDetails(page, bodyId)
  } else {
    await hit.first().focus()
    await hit.first().press('Enter')
  }
  await expectSelectionLanded(page, bodyId)
}

/**
 * Selects an on-screen body by a REAL pointer gesture through the production
 * picking seam — pointerdown then pointerup on the mark's hit target — rather
 * than by the keyboard.
 *
 * WHY THIS EXISTS. With `selectBody` on the keyboard path, pointer picking
 * would otherwise be exercised only below the browser: in
 * `components/space/space-selection.test.ts` (the pure `resolvePick`) and in
 * `components/space/SpaceStage.interaction.test.tsx` (jsdom `fireEvent`
 * pointerdown/pointerup against the real component). Those cover the picking
 * REQUIREMENT thoroughly, but neither can see the browser-level wiring: that
 * the hit target really sits under the drawn mark in a real layout, that the
 * region really receives the bubbled pointerdown, and that the host's
 * pointerup listener is really bound. One e2e pointer selection covers that
 * seam; re-testing pick geometry through the browser would not.
 *
 * The events are DISPATCHED rather than driven through `page.mouse` on
 * purpose: a real mouse press needs the mark to still be under the recorded
 * coordinates when the press lands, which an orbiting body is not. Dispatch
 * still goes through `handlePointerDown` -> `bodyIdUnder(e.target)` ->
 * `finishGesture` — the production path — with no synthetic selection API.
 */
export async function selectBodyByPointer(page: Page, bodyId: string): Promise<void> {
  const hit = page.getByTestId(`body-hit-${bodyId}`)
  await expect(hit, `${bodyId} must be drawn to be picked by pointer`).toHaveCount(1, {
    timeout: 30_000,
  })
  const region = page.getByTestId('space-canvas-region')
  const press = { pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0 }

  // RETRIED, and never blindly repeated. `SpaceStage.handlePointerDown` drops
  // the press outright while the renderer reports itself unavailable
  // (`if (!available || isControl(e.target)) return`), which is still briefly
  // true just after the loading placeholder clears — a gesture fired in that
  // window selects nothing and there is no event to wait on. A second gesture
  // on an ALREADY-selected mark would toggle it back off (`toggleSelection`),
  // so the press is re-fired only while the view's own `data-selection` says
  // the mark is not selected. Verified against the live view: a dispatched
  // pointerdown/pointerup pair on a hit target selects exactly that body.
  await expect
    .poll(
      async () => {
        const current = await region.getAttribute('data-selection')
        if (current === bodyId) return current
        await hit.dispatchEvent('pointerdown', { ...press, buttons: 1 })
        await hit.dispatchEvent('pointerup', { ...press, buttons: 0 })
        return await region.getAttribute('data-selection')
      },
      {
        timeout: 30_000,
        message: `a pointer press on ${bodyId}'s hit target did not select it`,
      },
    )
    .toBe(bodyId)
  await expectSelectionLanded(page, bodyId)
}

/**
 * Picks, by a real pointer gesture, the first body mark that is CURRENTLY ON
 * SCREEN — i.e. one for which the view offers no off-screen affordance — and
 * asserts the view's own selection state names exactly that body.
 *
 * Returns the id it picked. This is the suite's one browser-level proof that
 * pointer picking reaches the right entity; see `selectBodyByPointer`.
 */
export async function pickAnyOnScreenBodyByPointer(page: Page): Promise<string> {
  let bodyId = ''
  await expect
    .poll(
      async () => {
        const marks = await page.locator('[data-testid^="body-hit-feat-"]').all()
        for (const mark of marks) {
          const id = await mark.getAttribute('data-body-id')
          if (!id) continue
          if ((await page.getByTestId(`offscreen-${id}`).count()) > 0) continue
          bodyId = id
          return true
        }
        return false
      },
      {
        timeout: 30_000,
        message:
          'the default framing must put at least one pickable body on screen — a view whose every mark is ' +
          'off-screen at first paint is a defect, not a test-harness problem',
      },
    )
    .toBe(true)

  // `selectBodyByPointer` asserts the view's own `data-selection` names this
  // body — not merely that something got selected.
  await selectBodyByPointer(page, bodyId)
  return bodyId
}

/**
 * Selects the first mark whose test id starts with `body-hit-<prefix>`,
 * reading the body id the server served off the element's own
 * `data-body-id` rather than parsing the test id.
 *
 * For suites that want "any ore body" or "the station" without having
 * captured the interior read.
 */
export async function selectFirstBodyMatching(page: Page, prefix: string): Promise<string> {
  const mark = page.locator(`[data-testid^="body-hit-${prefix}"]`).first()
  const offscreen = page.locator(`[data-testid^="offscreen-${prefix}"]`).first()
  await expect
    .poll(async () => (await mark.count()) + (await offscreen.count()), {
      timeout: 30_000,
      message: `no mark or off-screen affordance matching ${prefix}`,
    })
    .toBeGreaterThan(0)

  if (await mark.count()) {
    const bodyId = (await mark.getAttribute('data-body-id'))!
    await selectBody(page, bodyId)
    return bodyId
  }
  const testId = (await offscreen.getAttribute('data-testid'))!
  const bodyId = testId.replace('offscreen-', '')
  await selectBody(page, bodyId)
  return bodyId
}

/**
 * The SERVED body ids of every mark whose test id starts with
 * `body-hit-<prefix>`, in the view's own draw order.
 *
 * Read off each element's `data-body-id`, never parsed out of the test id, so
 * a suite cannot accidentally reconstruct an id the server owns.
 */
export async function bodyIdsMatching(page: Page, prefix: string): Promise<string[]> {
  const marks = page.locator(`[data-testid^="body-hit-${prefix}"]`)
  await expect(marks.first(), `no mark matching ${prefix}`).toBeAttached({ timeout: 30_000 })
  const ids: string[] = []
  for (const mark of await marks.all()) {
    const id = await mark.getAttribute('data-body-id')
    if (id) ids.push(id)
  }
  return ids
}

/** Selection is observable on the map; the retired Course facts remain hidden. */
async function expectSelectionLanded(page: Page, bodyId: string): Promise<void> {
  await expect(page.getByTestId('space-canvas-region')).toHaveAttribute('data-selection', bodyId, { timeout: 10_000 })
}

/**
 * Commits a burn toward the current selection and waits out the flight.
 *
 * The `Under way` wait is a FALSE-POSITIVE GUARD, carried over verbatim in
 * intent from every board-era suite: the fleet is usually already `Docked`
 * when this is called, so waiting only on the eventual docked state would
 * pass even if the burn click were silently swallowed. A burn commit clears
 * `attachedTo` immediately and the row reads `Under way` while it runs —
 * that transition is the only proof an order was actually submitted.
 */
export async function burnToSelectionAndDock(
  page: Page,
  fleetId: string,
  flightTimeoutMs = 600_000,
): Promise<void> {
  await expect(page.getByTestId('vitals-fleet-id')).toHaveText(fleetId)
  const row = page.getByTestId('vitals-strip').getByTestId('vitals-state-pill')
  await expect(page.getByTestId('burn-button'), 'UI burn commitment requires a visible current HUD action; retired Course is not clickable').toBeVisible({ timeout: 10_000 })
  // Log-only attribution of a refused order (never asserts, never awaited): a refused
  // POST .../orders prints its status and body BEFORE the `under way` guard below runs.
  const logRefusedOrder = (response: Response): void => {
    const request = response.request()
    if (request.method() !== 'POST' || !/\/orders(\?|$)/.test(response.url())) return
    if (response.status() < 400) return
    void response
      .text()
      .then((body) =>
        console.log(`[journey-http] ${response.status()} POST ${response.url()} burnToSelectionAndDock body=${body}`),
      )
      .catch((err: unknown) =>
        console.log(`[journey-http] ${response.status()} POST ${response.url()} burnToSelectionAndDock body unreadable: ${String(err)}`),
      )
  }
  page.on('response', logRefusedOrder)
  await page.getByTestId('burn-button').click()
  await expect(row, 'the burn must actually be under way, not merely end docked').toContainText(
    /under way/i,
    { timeout: 30_000 },
  ).finally(() => page.off('response', logRefusedOrder))
  await expect(row).toContainText(/docked/i, { timeout: flightTimeoutMs })
}

/**
 * The raw served value behind a figure (`figure-formatting`, openspec change
 * `add-figure-formatting`, contract §8). Reads `data-raw` off the element
 * itself when the testid names the figure directly (case a); otherwise
 * resolves the ONE `<Figure>` nested inside it (case b/c's wrapper). Neither
 * case is left to the caller to disambiguate — 0 or more than 1 nested
 * figure is a hard, named failure rather than a silent wrong answer, because
 * `hold-capacity`-shaped wrappers hold TWO figures and a caller reading the
 * aggregate would otherwise get whichever the DOM happened to return first.
 *
 * Never parses rendered text: the thin space, the `₡` glyph and the `T+`
 * prefix are all irrelevant here.
 */
export async function digits(page: Page, testId: string): Promise<number> {
  const el = page.getByTestId(testId)
  const ownRaw = await el.getAttribute('data-raw')
  if (ownRaw !== null) return Number(ownRaw)

  const nested = el.locator('[data-raw]')
  const count = await nested.count()
  if (count === 1) {
    const raw = await nested.getAttribute('data-raw')
    return Number(raw)
  }
  if (count === 0) {
    throw new Error(
      `digits(page, '${testId}'): no [data-raw] on or inside this element — the figure moved; ` +
        'name the derived testid the caller actually wants.',
    )
  }
  throw new Error(
    `digits(page, '${testId}'): ${count} [data-raw] elements inside this element — a composite; ` +
      'name which figure you mean by its own derived testid.',
  )
}

/**
 * One resource kind's own tonnage off the hold readout's per-kind row
 * (`hold-{kind}` wraps the kind label and its own `hold-{kind}-tons`
 * figure). A kind with nothing aboard renders no row at all, which
 * legitimately reads 0 rather than failing.
 *
 * Never use the AGGREGATE (`hold-capacity`) to prove a mining delta: fuel
 * shares the same cargo pool and every burn spends some, so the total moves
 * for reasons that have nothing to do with mining.
 */
export async function holdKindTons(page: Page, kind: string): Promise<number> {
  const row: Locator = page.getByTestId(`hold-${kind}`)
  if ((await row.count()) === 0) return 0
  return digits(page, `hold-${kind}`)
}

/**
 * The served id of a mineable, non-star, non-station, non-moon body in the
 * given system's captured interior read.
 *
 * Moons are excluded deliberately: the generator marks them mineable (they
 * carry resources) but the server's own burn solve rejects them as a target
 * (`space.BuildCurve`'s endpoint-clearance guard), so a moon can be neither
 * docked at nor mined. Known product gap, surfaced to Travis 2026-08-25 and
 * unchanged by this migration.
 */
export function mineableBodyId(interior: ServedInterior, stationFeatureId?: string): string | null {
  for (const f of interior.features ?? []) {
    if (f.type === 'star' || f.id === stationFeatureId) continue
    if (f.id.startsWith('feat-moon-')) continue
    if ((f.resources ?? []).length === 0) continue
    return f.id
  }
  return null
}

/** The station body in a captured interior read, by served type. */
export function stationFeatureId(interior: ServedInterior): string | null {
  return (interior.features ?? []).find((f) => f.type === 'station')?.id ?? null
}
