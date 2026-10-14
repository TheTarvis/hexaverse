import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { seededSystemId } from '../helpers/seeded-world'
import type { SystemSpace } from '../../lib/types/system-space'
import type { Fleet, FleetList } from '../../lib/types/fleet'

// Enable the test browser's native adapter; backend readiness is still checked.
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] } })

// Fixed disclosed wire data on the real authenticated route. Matching captures
// use the same viewport, gestures, zero world clock and reduced-motion state.
const systemId = seededSystemId(0)
const position = { X: 12, Y: 0, Z: 22 }
const fleet: Fleet = {
  id: 'art-own-fleet', corporationId: 'art-corporation', systemId, own: true,
  worldTime: 0, scale: 0, position,
  state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: position } },
  roster: { ships: [{ class: 'hauler' }], cargo: { fuel: 100 }, cargoCapacity: 200, freeHold: 100, miningRate: 0, estimatedRange: 500, stranded: false, fuelPricePerTon: 10 },
}
const fleets: FleetList = { fleets: [fleet], worldTime: 0, scale: 0 }
const fixture: SystemSpace = {
  systemId, extent: 180, character: 'calm', starClass: 'G', worldTime: 0, scale: 0,
  features: [
    { id: 'art-star', type: 'star', size: 3, space: { X: -18, Y: 0, Z: -15 } },
    { id: 'art-rocky', type: 'rocky', size: 3, space: { X: -5, Y: 0, Z: 5 } },
    { id: 'art-rocky-green', type: 'rocky', size: 2.8, space: { X: -28, Y: 0, Z: 20 } },
    { id: 'art-rocky-rust-2', type: 'rocky', size: 2.7, space: { X: 23, Y: 0, Z: -16 } },
    { id: 'art-gas', type: 'gas_giant', size: 4, space: { X: 30, Y: 0, Z: 3 } },
    { id: 'art-gas-blue-0', type: 'gas_giant', size: 3.5, space: { X: -36, Y: 0, Z: -2 } },
    { id: 'art-ice', type: 'ice', size: 2.8, space: { X: 0, Y: 0, Z: -25 } },
    { id: 'art-belt', type: 'belt', size: 0.8, space: { X: -15, Y: 0, Z: 28 }, orbitElements: { parentId: 'art-star', radius: 43, periodMs: 100000, phase: 0, inclination: 0.06, node: 0 } },
    { id: 'art-station', type: 'station', size: 1.5, space: { X: 20, Y: 0, Z: 18 } },
  ],
  laneGates: [], contacts: [],
}

for (const backend of ['webgpu', 'webgl2'] as const) {
  test(`Scenario: ${backend} scene art survives matched views, picking and crowded camera gestures`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    if (backend === 'webgl2') await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }))
    const errors: string[] = [], diagnostics: string[] = []
    page.on('response', response => { if (response.status() >= 400) diagnostics.push(`${response.status()} ${new URL(response.url()).pathname}`) })
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text())
      if (/THREE\.WebGLProgram|shader error|VALIDATE_STATUS|maximum update depth/i.test(message.text())) errors.push(message.text())
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let current = fixture
    await page.route(url => url.pathname === `/v1/systems/${systemId}`, route => route.fulfill({ json: current }))
    await page.route(url => url.pathname === '/v1/fleets', route => route.fulfill({ json: fleets }))
    await page.route(url => url.pathname === `/v1/fleets/${fleet.id}`, route => route.fulfill({ json: fleet }))
    await page.route(url => url.pathname === `/v1/fleets/${fleet.id}/scan-targets`, route => route.fulfill({ json: { targets: [], worldTime: 0 } }))
    await page.route(url => url.pathname === '/v1/actions', route => route.fulfill({ json: { actions: [] } }))
    await page.route(url => url.pathname === `/v1/fleets/${fleet.id}/orders/preview`, route => route.fulfill({ json: { controlPoints: [position, fixture.features[1]!.space], departMs: 0, arriveMs: 10000, deltaV: 1, fuelCostTons: 1, affordable: true, strandingWarning: false } }))
    const canvas = page.getByTestId('space-canvas')
    const region = page.getByTestId('space-canvas-region')
    const orbit = page.getByRole('group', { name: 'Orbit the camera with arrow keys; hold Shift and press arrow keys to pan', exact: true })
    const ready = async () => {
      await expect(canvas).toHaveAttribute('data-renderer-backend', backend)
      await expect(canvas).toHaveAttribute('data-renderer-ready', 'true')
      await expect(page.getByTestId('space-loading')).toBeHidden()
      await expect(page.getByTestId('fleet-mark-art-own-fleet')).toBeAttached()
      await expect(page.getByTestId('body-hit-art-station')).toBeAttached()
    }
    const metrics: Record<string, unknown> = { diagnostics }
    const capture = async (name: string) => {
      // Await actual frames after camera/asset work before the review capture.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      const filename = `${backend}-${name}.png`
      const file = testInfo.outputPath(filename)
      await page.screenshot({ path: file })
      await testInfo.attach(filename, { path: file, contentType: 'image/png' })
      const directory = process.env.SCENE_ART_CAPTURE_DIR
      if (directory) { fs.mkdirSync(directory, { recursive: true }); fs.copyFileSync(file, path.join(directory, filename)) }
      metrics[name] = { camera: await region.getAttribute('data-camera'), backend: await canvas.getAttribute('data-renderer-backend') }
    }
    const sampleScheduling = async () => page.evaluate(async () => {
      const intervals: number[] = []
      await new Promise<void>(resolve => {
        let previous = performance.now()
        const tick = (now: number) => { intervals.push(now - previous); previous = now; if (intervals.length < 120) requestAnimationFrame(tick); else resolve() }
        requestAnimationFrame(tick)
      })
      const sorted = [...intervals.slice(1)].sort((a, b) => a - b)
      return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)], framesOver50Ms: sorted.filter(value => value > 50).length, sampledFrames: sorted.length }
    })
    await page.goto(`/systems/${systemId}`)
    if (backend === 'webgpu') {
      const adapterAvailable = await page.evaluate(async () => {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
        return !!(await gpu?.requestAdapter())
      })
      test.skip(!adapterAvailable, 'This browser has no native WebGPU adapter; fallback is verified separately')
    }
    await ready()
    // Models load asynchronously after the first renderer frame; requests finish
    // before matched captures so fallback geometry does not race the art review.
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Recenter', exact: true }).click()
    await capture('01-normal-high')
    metrics.normalScheduling = await sampleScheduling()
    await orbit.focus()
    for (let i = 0; i < 10; i++) await orbit.press('ArrowDown')
    await capture('02-normal-low')
    const rocky = page.getByTestId('body-hit-art-rocky')
    await rocky.focus(); await rocky.press('Enter')
    await expect(rocky).toHaveAttribute('aria-pressed', 'true')
    await capture('03-selected-low')
    const annotation = page.getByTestId('space-annotation-art-rocky')
    await expect(annotation).toBeVisible()
    await expect(annotation).toHaveAttribute('data-priority', '2')
    await expect(annotation).toContainText('rocky')
    const labelBeforeOrbit = await annotation.getAttribute('style')
    await orbit.focus()
    for (let i = 0; i < 6; i++) await orbit.press('ArrowRight')
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await capture('04-close-low')
    await expect(annotation).toBeVisible()
    await expect(annotation).not.toHaveAttribute('style', labelBeforeOrbit!)
    await orbit.focus()
    for (let i = 0; i < 14; i++) await orbit.press('ArrowUp')
    await capture('05-close-high')
    await page.getByRole('button', { name: 'Recenter', exact: true }).click()
    await rocky.focus(); await rocky.press('Enter')
    await expect(rocky).toHaveAttribute('aria-pressed', 'false')
    const rockyHit = await rocky.boundingBox()
    await page.mouse.click(rockyHit!.x + rockyHit!.width / 2, rockyHit!.y + rockyHit!.height / 2)
    await expect(rocky).toHaveAttribute('aria-pressed', 'true')
    // Chromium's trusted touch dispatch exercises the same real canvas hit
    // path without changing the baseline viewport or desktop camera fixture.
    const stationHit = await page.getByTestId('body-hit-art-station').boundingBox()
    const touch = await page.context().newCDPSession(page)
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stationHit!.x + stationHit!.width / 2, y: stationHit!.y + stationHit!.height / 2 }] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false })
    await touch.detach()
    await expect(region).toHaveAttribute('data-selection', 'art-station')
    metrics.pointerAndTouchSelection = 'passed'
    await orbit.focus()
    await orbit.press('Shift+ArrowRight')
    await page.getByRole('button', { name: "Select the point at the camera's centre", exact: true }).click()
    await expect(page.getByTestId('point-selection-mark')).toBeAttached()
    current = { ...fixture, features: [...fixture.features, ...Array.from({ length: 72 }, (_, i) => ({ id: `crowded-${i}`, type: ['rocky', 'ice', 'gas_giant'][i % 3]!, size: 0.8 + (i % 4) * 0.3, space: { X: (i % 12 - 5.5) * 7, Y: (i % 3 - 1) * 2, Z: (Math.floor(i / 12) - 2.5) * 11 } }))] }
    await page.reload(); await ready(); await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Recenter', exact: true }).click()
    await capture('06-crowded')
    const annotations = await page.locator('[data-testid^="space-annotation-"]').evaluateAll(elements => elements.filter(element => getComputedStyle(element).visibility === 'visible').map(element => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }))
    expect(annotations.length).toBeGreaterThan(0)
    expect(annotations.length).toBeLessThan(current.features.length / 2)
    for (let i = 0; i < annotations.length; i++) for (let j = i + 1; j < annotations.length; j++) {
      const a = annotations[i]!, b = annotations[j]!
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false)
    }
    metrics.crowdedScheduling = await sampleScheduling()
    const previous = await region.getAttribute('data-camera')
    await orbit.focus(); await orbit.press('ArrowRight'); await orbit.press('Shift+ArrowLeft')
    await expect(region).not.toHaveAttribute('data-camera', previous!)
    await expect(canvas).toHaveAttribute('data-renderer-ready', 'true')
    await page.goto('/')
    await expect(canvas).toHaveCount(0)
    await page.goto(`/systems/${systemId}`)
    await ready()
    metrics.sceneRemount = 'passed'
    const output = JSON.stringify(metrics, null, 2)
    await testInfo.attach(`${backend}-metrics.json`, { body: Buffer.from(output), contentType: 'application/json' })
    if (process.env.SCENE_ART_CAPTURE_DIR) fs.writeFileSync(path.join(process.env.SCENE_ART_CAPTURE_DIR, `${backend}-metrics.json`), output)
    expect(errors).toEqual([])
  })
}
