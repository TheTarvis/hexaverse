import { test, expect } from '@playwright/test'
import { seededSystemId } from '../helpers/seeded-world'

// Compatibility restoration remains automatic, while the migration journey
// separately proves native device loss and explicit retry. Force the real
// compatibility backend so a native adapter cannot bypass these loss fixtures.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined })
  })
})

test.describe('renderer availability', () => {
  test('a rendering context that cannot be created shows the named unsupported state, with the intel panel usable and no page error', async ({
    page,
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    // Force every WebGL context request to fail, from before any app script
    // runs — simulates "no WebGL2 support" for the whole page load,
    // including react-force-graph-3d's own internal construction.
    await page.addInitScript(() => {
      const proto = window.HTMLCanvasElement.prototype
      const original = proto.getContext
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(proto as any).getContext = function (
        this: HTMLCanvasElement,
        contextId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...args: any[]
      ) {
        if (contextId === 'webgl' || contextId === 'webgl2') return null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any).apply(this, [contextId, ...args])
      }
    })

    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    // Scenario: Context creation failure shows a named unsupported state.
    const notice = page.getByTestId('renderer-unsupported')
    await expect(notice).toBeVisible({ timeout: 15_000 })
    await expect(notice).toContainText(/browser|graphics hardware|webgl|gpu/i)
    // No candidate published a first frame; the owner remains mounted for retry.
    await expect(page.getByTestId('galaxy-graph').locator('canvas[data-renderer-ready="true"]')).toHaveCount(0)

    // Scenario: Surrounding galaxy affordances remain usable.
    await expect(page.getByTestId('intel-panel')).toBeVisible()

    // Scenario: Context creation failure shows a named unsupported state —
    // "no uncaught error is thrown".
    expect(pageErrors).toEqual([])
  })

  test('a real context loss shows the interrupted state; restoring it recovers rendering without a page navigation', async ({
    page,
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByTestId('galaxy-graph')).toBeVisible({ timeout: 15_000 })

    // Hardening note (QA, post-SHIP): `next dev` (Fast Refresh) means the
    // `galaxy-graph` testid can become visible a beat before FG3D's
    // dynamically-imported <canvas> child actually mounts inside it —
    // querying for the canvas immediately after the testid appeared was an
    // intermittent `Cannot read properties of null (reading 'getContext')`
    // crash, not an app defect. Wait for the canvas element itself.
    await expect(page.getByTestId('galaxy-graph').locator('canvas')).toHaveAttribute('data-renderer-ready', 'true', { timeout: 15_000 })
    const urlBeforeLoss = page.url()

    // Hardening note (QA, post-SHIP): under this sandbox's headless
    // Chromium/SwiftShader, `loseContext()` and `restoreContext()` issued as
    // TWO separate `page.evaluate()` round trips fail deterministically
    // (0/5) even though the app's guard/DOM behave identically to the
    // passing case — QA isolated the discriminator to "same JS execution
    // turn" (a CDP/SwiftShader harness constraint, not `preventDefault()`,
    // which QA also ruled out). A single `page.evaluate()` that performs
    // lose → wait-for-interrupted → restore → wait-for-recovery entirely in
    // page-context JS passes 5/5. On real GPU hardware this constraint may
    // not exist — a future reader is free to split it back into two
    // `page.evaluate()` calls (or an explicit CDP round trip) and confirm.
    //
    // What still gets genuinely asserted, not weakened: the canvas-stays-
    // attached property (`canvasStillAttached`/`sameCanvasNode`, captured
    // WHILE interrupted, inside the same page-context run) and the
    // no-navigation property (`page.url()`, checked from Playwright's side
    // — a real navigation would be observable here regardless of how the
    // in-page script is split).
    const result = await page.evaluate(async () => {
      const waitUntil = (predicate: () => boolean, timeoutMs: number): Promise<boolean> =>
        new Promise((resolve) => {
          const start = performance.now()
          const tick = () => {
            if (predicate()) return resolve(true)
            if (performance.now() - start > timeoutMs) return resolve(false)
            requestAnimationFrame(tick)
          }
          tick()
        })

      const canvas = document.querySelector('[data-testid="galaxy-graph"] canvas') as HTMLCanvasElement | null
      if (!canvas) return { ok: false as const, reason: 'no-canvas' }
      const ctx = canvas.getContext('webgl2') as WebGL2RenderingContext | null
      if (!ctx) return { ok: false as const, reason: 'no-context' }
      const loseExt = ctx.getExtension('WEBGL_lose_context')
      if (!loseExt) return { ok: false as const, reason: 'no-lose-context-extension' }

      loseExt.loseContext()
      const sawInterrupted = await waitUntil(
        () => !!document.querySelector('[data-testid="renderer-interrupted"]'),
        10_000,
      )

      // Captured WHILE interrupted — the property the original MAJOR defect
      // (canvas torn out of the document the instant a loss fired) broke.
      const canvasStillAttached = document.body.contains(canvas)
      const sameCanvasNode =
        document.querySelector('[data-testid="galaxy-graph"] canvas') === canvas

      loseExt.restoreContext()
      const recovered = await waitUntil(
        () => !document.querySelector('[data-testid="renderer-interrupted"]') &&
          !!document.querySelector('canvas[data-renderer-ready="true"]'),
        10_000,
      )

      const freshCanvas = document.querySelector('canvas[data-renderer-ready="true"]') !== canvas
      return { ok: true as const, sawInterrupted, canvasStillAttached, sameCanvasNode, recovered, freshCanvas }
    })

    expect(result.ok, `page.evaluate reported: ${JSON.stringify(result)}`).toBe(true)
    if (!result.ok) throw new Error('unreachable — asserted above')

    // Scenario: Context loss shows an interrupted state without an
    // uncaught error.
    expect(result.sawInterrupted).toBe(true)
    // Scenario: Retrying releases the prior attempt's resources first /
    // the canvas-persistence property the QA MAJOR defect broke.
    expect(result.canvasStillAttached).toBe(true)
    expect(result.sameCanvasNode).toBe(true)
    // Scenario: A restored context resumes without navigation.
    expect(result.recovered).toBe(true)
    expect(result.freshCanvas).toBe(true)

    // Re-confirm from Playwright's own side too (belt-and-suspenders, and
    // the one check that must be independent of the in-page script: a real
    // navigation is observable here regardless of how lose/restore were
    // split).
    await expect(page.getByTestId('renderer-interrupted')).not.toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('galaxy-graph')).toBeVisible({ timeout: 15_000 })
    expect(page.url()).toBe(urlBeforeLoss)

    expect(pageErrors).toEqual([])
  })
})

/**
 * The space view's own guard, on its own real canvas.
 *
 * Reached through the seeded world with the shared logged-in session — no
 * signup, so these run wherever the shared account exists, exactly as the
 * galaxy tests above do.
 */
test.describe('renderer availability — the system space view', () => {
  test('a rendering context that cannot be created shows the named unsupported state, with the fleet panel usable and no page error', async ({
    page,
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    // Force every WebGL context request to fail from before any app script
    // runs — "no WebGL2 support" for the whole page load, including three's
    // own internal construction.
    await page.addInitScript(() => {
      const proto = window.HTMLCanvasElement.prototype
      const original = proto.getContext
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(proto as any).getContext = function (
        this: HTMLCanvasElement,
        contextId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...args: any[]
      ) {
        if (contextId === 'webgl' || contextId === 'webgl2') return null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any).apply(this, [contextId, ...args])
      }
    })

    await page.goto(`/systems/${seededSystemId(0)}`)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByTestId('space-view')).toBeVisible({ timeout: 20_000 })

    // Scenario: An unsupported rendering context is named as such
    // (`system-space-view`: *Renderer Unavailability Is an Explicit State*).
    const notice = page.getByTestId('renderer-unsupported')
    await expect(notice).toBeVisible({ timeout: 20_000 })
    await expect(notice).toContainText(/browser|graphics hardware|webgl|gpu/i)
    // Named for THIS surface, not the retired board — the notice tells the
    // player which part of the game is unavailable.
    await expect(notice).toHaveAttribute('data-surface', 'space')

    // Scenario: An unsupported rendering context takes precedence over the
    // loading placeholder — a player must never be left watching a spinner
    // for a frame that can never arrive.
    await expect(page.getByTestId('space-loading')).toHaveCount(0)

    // Scenario: The fleet panel and roster stay usable without a canvas.
    // Every command anchored to the fleet's own served state is reachable;
    // only the ones that need a canvas SELECTION are withdrawn.
    await expect(page.getByTestId('vitals-strip')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /Switch acting fleet/ }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem').first()).toBeEnabled()
    await page.getByTestId('vitals-fleet-chevron').press('Escape')

    // Scenario: ...with no uncaught error thrown.
    expect(pageErrors).toEqual([])
  })

  test('a real context loss shows the interrupted state on the space view; restoring it recovers rendering without a page navigation', async ({
    page,
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto(`/systems/${seededSystemId(0)}`)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByTestId('space-canvas')).toBeVisible({ timeout: 20_000 })
    // The renderer actually came up before we take it away — losing a context
    // that never existed proves nothing.
    await expect(page.getByTestId('space-loading')).toBeHidden({ timeout: 60_000 })
    await expect(page.getByTestId('space-canvas')).toHaveAttribute('data-renderer-ready', 'true')
    const urlBeforeLoss = page.url()

    // Lose and restore in ONE page-context turn. See the galaxy test above
    // for why: under this sandbox's headless Chromium/SwiftShader, splitting
    // them across two `page.evaluate()` round trips fails deterministically
    // for harness reasons unrelated to the app's behaviour. The two
    // properties that must be independent of that choice — the canvas staying
    // attached, and no navigation — are still captured honestly (the first
    // WHILE interrupted, inside the same run; the second from Playwright's
    // own side afterwards).
    const result = await page.evaluate(async () => {
      const waitUntil = (predicate: () => boolean, timeoutMs: number): Promise<boolean> =>
        new Promise((resolve) => {
          const start = performance.now()
          const tick = () => {
            if (predicate()) return resolve(true)
            if (performance.now() - start > timeoutMs) return resolve(false)
            requestAnimationFrame(tick)
          }
          tick()
        })

      const canvas = document.querySelector('[data-testid="space-canvas"]') as HTMLCanvasElement | null
      if (!canvas) return { ok: false as const, reason: 'no-canvas' }
      const ctx = canvas.getContext('webgl2') as WebGL2RenderingContext | null
      if (!ctx) return { ok: false as const, reason: 'no-context' }
      const loseExt = ctx.getExtension('WEBGL_lose_context')
      if (!loseExt) return { ok: false as const, reason: 'no-lose-context-extension' }

      loseExt.loseContext()
      const sawInterrupted = await waitUntil(
        () => !!document.querySelector('[data-testid="renderer-interrupted"]'),
        10_000,
      )

      // Captured WHILE interrupted — the property the galaxy view's own MAJOR
      // defect broke (the canvas torn out of the document the instant a loss
      // fired, so nothing was left to restore into).
      const canvasStillAttached = document.body.contains(canvas)
      const sameCanvasNode = document.querySelector('[data-testid="space-canvas"]') === canvas

      loseExt.restoreContext()
      const recovered = await waitUntil(
        () => !document.querySelector('[data-testid="renderer-interrupted"]') &&
          !!document.querySelector('canvas[data-renderer-ready="true"]'),
        10_000,
      )

      const freshCanvas = document.querySelector('canvas[data-renderer-ready="true"]') !== canvas
      return { ok: true as const, sawInterrupted, canvasStillAttached, sameCanvasNode, recovered, freshCanvas }
    })

    expect(result.ok, `page.evaluate reported: ${JSON.stringify(result)}`).toBe(true)
    if (!result.ok) throw new Error('unreachable — asserted above')

    // Scenario: A lost rendering context is an explicit interrupted state.
    expect(result.sawInterrupted).toBe(true)
    expect(result.canvasStillAttached).toBe(true)
    expect(result.sameCanvasNode).toBe(true)
    // Scenario: A restored context resumes rendering without navigation.
    expect(result.recovered).toBe(true)
    expect(result.freshCanvas).toBe(true)

    await expect(page.getByTestId('renderer-interrupted')).not.toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('space-canvas')).toBeVisible({ timeout: 20_000 })
    expect(page.url()).toBe(urlBeforeLoss)

    expect(pageErrors).toEqual([])
  })
})
