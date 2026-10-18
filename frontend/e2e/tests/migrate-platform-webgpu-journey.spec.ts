import { showObjects } from '../helpers/space-view'
import { test, expect, type Page, type Locator, type TestInfo } from '@playwright/test'
import { seededSystemId } from '../helpers/seeded-world'
import type { WireGalaxy } from '../../lib/types/galaxy'
import type { SystemSpace } from '../../lib/types/system-space'

// One migration journey, partitioned into bounded legs on the shared auth/data
// fixture. Browser-only injections never enter production code or configuration.
// Chromium on macOS otherwise selects SwiftShader, whose WebGPU canvas
// presentation is black even for a raw clear pass. Use the real Metal adapter.
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] } })
const systemId = seededSystemId(0)
const world: SystemSpace = {
  systemId, extent: 150, character: 'calm', starClass: 'G', worldTime: 0, scale: 1,
  features: [
    { id: 'gpu-star', type: 'star', size: 5, space: { X: 0, Y: 0, Z: 0 } },
    { id: 'gpu-rock', type: 'rocky', size: 2, space: { X: 20, Y: 0, Z: 0 }, orbitElements: { parentId: 'gpu-star', radius: 24, periodMs: 10000, phase: 0, inclination: 0, node: 0 } },
    { id: 'gpu-gas', type: 'gas_giant', size: 3, space: { X: -28, Y: 0, Z: 8 } },
    { id: 'gpu-station', type: 'station', size: 1, space: { X: 10, Y: 0, Z: -20 } },
  ], laneGates: [], contacts: [],
}
const galaxy: WireGalaxy = {
  id: 'gpu-visual-galaxy', seed: 42, bounds: { x: [-90, 90], y: [-60, 60], z: [-30, 30] }, worldTime: 0,
  systems: [
    { id: 'gpu-center', name: 'GPU center', coords: { x: 0, y: 0, z: 0 }, region: 'normal', tier: 'explored', skeleton: { starClass: 'G', bodies: [] } },
    { id: 'gpu-left', name: 'GPU left', coords: { x: -75, y: -25, z: 0 }, region: 'star_rich', tier: 'surveyed', skeleton: { starClass: 'O', bodies: [] } },
    { id: 'gpu-right', name: 'GPU right', coords: { x: 75, y: 25, z: 0 }, region: 'dead', tier: 'rumored', skeleton: { starClass: 'M', bodies: [] } },
  ],
  lanes: [{ id: 'gpu-ordinary', aId: 'gpu-left', bId: 'gpu-center' }, { id: 'gpu-bridge', aId: 'gpu-center', bId: 'gpu-right', bridge: true }],
}
type Backend = 'webgpu' | 'webgl2'
type BrowserDevice = { destroy(): void; lost: Promise<{ reason: string; message: string }> }
type BrowserAdapter = { info?: { vendor?: string; architecture?: string; device?: string; description?: string; isFallbackAdapter?: boolean }; requestDevice(options?: unknown): Promise<BrowserDevice> }
type BrowserGPU = { requestAdapter(options?: unknown): Promise<BrowserAdapter | null> }
type BrowserEvidence = { devices: BrowserDevice[]; adapters: unknown[]; canvasDevices: WeakMap<HTMLCanvasElement, BrowserDevice>; injectedLoss: WeakSet<BrowserDevice>; block: boolean }

async function configure(page: Page, backend: Backend, blocked = false) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript(({ backend, blocked }) => {
    const state: BrowserEvidence = { devices: [], adapters: [], canvasDevices: new WeakMap(), injectedLoss: new WeakSet(), block: blocked }
    Object.assign(window, { __webgpuJourney: state })
    const contextType = (window as unknown as { GPUCanvasContext?: { prototype: { canvas: HTMLCanvasElement; configure(configuration: { device: BrowserDevice }): void } } }).GPUCanvasContext
    if (contextType) {
      const configure = contextType.prototype.configure
      contextType.prototype.configure = function (configuration) {
        configure.call(this, configuration)
        state.canvasDevices.set(this.canvas, configuration.device)
      }
    }
    const originalContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof originalContext>) {
      if (state.block && /^(webgl2?|experimental-webgl)$/.test(args[0])) return null
      return originalContext.apply(this, args)
    } as typeof originalContext
    const gpu = (navigator as Navigator & { gpu?: BrowserGPU }).gpu
    if (backend === 'webgl2') Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined })
    else if (gpu) {
      const requestAdapter = gpu.requestAdapter.bind(gpu)
      gpu.requestAdapter = async options => {
        if (state.block) return null
        const adapter = await requestAdapter(options)
        if (adapter) {
          state.adapters.push(adapter.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter } : {})
          const requestDevice = adapter.requestDevice.bind(adapter)
          adapter.requestDevice = async descriptor => {
            const device = await requestDevice(descriptor)
            // Three correctly ignores deliberate destroy during cleanup. The
            // fixture destroys a real live device but translates ONLY this
            // marked injection to unexpected loss before Three subscribes.
            const lost = device.lost.then(info => state.injectedLoss.has(device) ? { reason: 'unknown', message: 'Injected unexpected native device loss' } : info)
            Object.defineProperty(device, 'lost', { configurable: true, value: lost })
            state.devices.push(device)
            return device
          }
        }
        return adapter
      }
    }
  }, { backend, blocked })
}
async function ready(canvas: Locator, backend: Backend) {
  await expect(canvas).toHaveAttribute('data-renderer-ready', 'true')
  await expect(canvas).toHaveAttribute('data-renderer-backend', backend)
}
async function frames(page: Page, count = 12) {
  await page.evaluate(count => new Promise<void>(resolve => {
    const next = () => { if (--count <= 0) resolve(); else requestAnimationFrame(next) }
    requestAnimationFrame(next)
  }), count)
}
async function capture(page: Page, canvas: Locator, info: TestInfo, name: string) {
  const screenshot = await canvas.screenshot()
  await info.attach(name, { body: screenshot, contentType: 'image/png' })
  const colors = await page.evaluate(async encoded => {
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const sample = new OffscreenCanvas(128, 128), context = sample.getContext('2d')!
    context.drawImage(image, 0, 0, 128, 128)
    const data = context.getImageData(0, 0, 128, 128).data
    const colors = new Set<number>()
    for (let i = 0; i < data.length; i += 4) colors.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!)
    image.close(); return colors.size
  }, screenshot.toString('base64'))
  expect(colors, `${name} must contain a rendered scene, not a flat blank canvas`).toBeGreaterThan(40)
  return screenshot
}
async function sustainedGrid(page: Page, canvas: Locator, info: TestInfo, backend: Backend) {
  // A ready flag cannot detect a later render pass dropping the stencil-masked
  // grid. Sample presented cyan line pixels away from the HUD over later frames.
  for (const frame of [1, 2]) {
    await frames(page, 12)
    const screenshot = await canvas.screenshot()
    await info.attach(`${backend}-sustained-grid-${frame}.png`, { body: screenshot, contentType: 'image/png' })
    const pixels = await page.evaluate(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const sample = new OffscreenCanvas(image.width, image.height), context = sample.getContext('2d')!
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, image.width, image.height)
      let count = 0
      for (let y = Math.floor(image.height * .15); y < image.height * .85; y++) {
        for (let x = Math.floor(image.width * .46); x < image.width * .96; x++) {
          const i = (y * image.width + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
          if (r < 30 && g >= 35 && g < 90 && b >= 45 && b < 110 && g - r >= 18 && b - g >= 5) count++
        }
      }
      image.close(); return count
    }, screenshot.toString('base64'))
    expect(pixels, `${backend} ecliptic hex grid remains visible in later pass ${frame}`).toBeGreaterThan(100)
  }
}
async function lose(page: Page, canvas: Locator, backend: Backend) {
  if (backend === 'webgpu') await canvas.evaluate(element => {
    const state = (window as unknown as { __webgpuJourney: BrowserEvidence }).__webgpuJourney
    const device = state.canvasDevices.get(element as HTMLCanvasElement)
    if (!device) throw new Error('BLOCKED: selected canvas has no configured native device')
    state.injectedLoss.add(device)
    device.destroy()
  })
  else await canvas.evaluate(element => {
    const extension = (element as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('BLOCKED: compatibility loss extension unavailable')
    extension.loseContext()
  })
}
const consoleEvidence = new WeakMap<Page, string[]>()
test.afterEach(async ({ page }, info) => {
  await info.attach('renderer-console.txt', { body: (consoleEvidence.get(page) ?? []).join('\n'), contentType: 'text/plain' })
})
function errors(page: Page) {
  const entries: string[] = []
  consoleEvidence.set(page, entries)
  const failures: string[] = []
  page.on('pageerror', error => { failures.push(error.message); entries.push(`pageerror: ${error.message}`) })
  page.on('console', message => {
    entries.push(`${message.type()}: ${message.text()}`)
    if (/shader error|VALIDATE_STATUS|maximum update depth|uncaptured.*error|validation error/i.test(message.text())) failures.push(message.text())
  })
  return failures
}

for (const backend of ['webgpu', 'webgl2'] as const) {
  test(`WebGPU migration journey — ${backend} system, animated shared star, preview input and live loss recovery`, async ({ page }, info) => {
    await configure(page, backend)
    const failures = errors(page)
    let servedWorld = world
    await page.route(url => url.pathname === `/v1/systems/${systemId}`, route => route.fulfill({ json: servedWorld }))
    await page.route(url => url.pathname === '/v1/fleets', route => route.fulfill({ json: { fleets: [], worldTime: 0, scale: 1 } }))
    await page.goto(`/systems/${systemId}`)
    const canvas = page.getByTestId('space-canvas'), region = page.getByTestId('space-canvas-region')
    if (backend === 'webgpu') expect(await page.evaluate(() => 'gpu' in navigator && !!navigator.gpu), 'BLOCKED: browser exposes no native WebGPU API').toBe(true)
    await ready(canvas, backend)
    await info.attach(`${backend}-adapters.json`, { body: JSON.stringify(await page.evaluate(() => (window as unknown as { __webgpuJourney: BrowserEvidence }).__webgpuJourney.adapters)), contentType: 'application/json' })
    await capture(page, canvas, info, `${backend}-system-initial.png`)
    await sustainedGrid(page, canvas, info, backend)
    await showObjects(page)
    await page.getByTestId('index-gpu-star').click()
    const details = page.getByRole('complementary', { name: 'Details for gpu-star' })
    const surface = details.getByTestId('spacecraft-preview-surface'), preview = surface.locator('canvas')
    await expect(surface).toHaveAccessibleName('3D preview of gpu-star')
    await ready(preview, backend)
    const box = await surface.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(180); expect(box!.height).toBeLessThanOrEqual(220)
    expect(await preview.evaluate(element => Math.max((element as HTMLCanvasElement).width, (element as HTMLCanvasElement).height))).toBeLessThanOrEqual(384)
    const first = await capture(page, preview, info, `${backend}-warm-plasma-a.png`)
    await frames(page, 18)
    const second = await capture(page, preview, info, `${backend}-warm-plasma-b.png`)
    expect(second.equals(first), 'fixed-camera stellar field must visibly evolve').toBe(false)
    await info.attach(`${backend}-map-and-nav-star.png`, { body: await page.screenshot(), contentType: 'image/png' })
    // The preview canvas is transparent over a translucent HUD and the main
    // map keeps moving. Isolate its rendered pixels from that unrelated motion.
    await preview.evaluate(element => { (element as HTMLCanvasElement).style.backgroundColor = '#000' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await frames(page, 3)
    let frozen = await preview.screenshot()
    const settleComparisons: boolean[] = []
    // Media change stops new submissions; allow the already submitted frame to
    // reach the compositor, then still demand exact stability over later RAFs.
    await expect.poll(async () => {
      const next = await preview.screenshot(), settled = next.equals(frozen)
      frozen = next
      settleComparisons.push(settled)
      return settled
    }, { message: 'reduced-motion in-flight presentation settles', timeout: 3000 }).toBe(true)
    await info.attach(`${backend}-reduced-motion-settle.json`, { body: JSON.stringify(settleComparisons), contentType: 'application/json' })
    await info.attach(`${backend}-reduced-motion-settled.png`, { body: frozen, contentType: 'image/png' })
    await frames(page, 8)
    expect((await preview.screenshot()).equals(frozen), 'reduced motion freezes surface and corona').toBe(true)
    const cameraBefore = await region.getAttribute('data-camera')
    await surface.focus(); await surface.press('ArrowRight'); await surface.press('ArrowUp')
    expect((await preview.screenshot()).equals(frozen)).toBe(false)
    await expect(region).toHaveAttribute('data-camera', cameraBefore!)
    await expect(region).toHaveAttribute('data-selection', 'gpu-star')
    await surface.press('Home'); await surface.press('Tab')
    await expect(details.getByRole('button', { name: 'Reset view' })).toBeFocused()
    await expect(page.getByTestId('index-focus')).toBeEnabled()
    await page.getByTestId('details-back').click()
    await expect(surface).toHaveCount(0)
    await page.getByTestId('index-gpu-station').click()
    const station = page.getByRole('complementary', { name: 'Details for gpu-station' })
    await ready(station.locator('canvas'), backend)
    await capture(page, station.locator('canvas'), info, `${backend}-station-preview.png`)
    await lose(page, station.locator('canvas'), backend)
    await expect(station.getByRole('status')).toHaveText('Model preview interrupted.')
    await ready(canvas, backend)
    await expect(page.getByTestId('renderer-interrupted')).toHaveCount(0)
    await station.getByRole('button', { name: 'Retry preview' }).click()
    await ready(station.locator('canvas'), backend)
    await expect(station.getByRole('status')).toHaveText('')
    await capture(page, station.locator('canvas'), info, `${backend}-preview-independent-recovery.png`)
    await page.getByTestId('details-back').click()
    const rock = page.getByTestId('body-hit-gpu-rock')
    await rock.focus(); await rock.press('Enter')
    const styleBefore = await rock.getAttribute('style')
    await lose(page, canvas, backend)
    await expect(page.getByTestId('renderer-interrupted')).toBeVisible()
    await expect(region).toHaveAttribute('data-selection', 'gpu-rock')
    await expect(page.getByRole('button', { name: /^Objects(?: \(hidden\))?$/ })).toBeEnabled()
    await frames(page, 12)
    await page.getByTestId('renderer-retry').click()
    await ready(canvas, backend)
    await expect(page.getByTestId('renderer-interrupted')).toHaveCount(0)
    await expect(region).toHaveAttribute('data-selection', 'gpu-rock')
    await expect.poll(() => rock.getAttribute('style')).not.toBe(styleBefore)
    await capture(page, canvas, info, `${backend}-system-recovered-current-world.png`)
    await page.getByRole('button', { name: 'Recenter', exact: true }).click()
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await page.getByRole('button', { name: "Select the point at the camera's centre", exact: true }).click()
    await expect(page.getByTestId('point-selection-mark')).toBeAttached()
    // Reuse the served fixture, changing only disclosed spectral class. Images
    // preserve the visual warm/cool/fallback obligation beyond unit tint values.
    for (const spectralClass of ['O', 'unknown']) {
      servedWorld = { ...world, starClass: spectralClass }
      await page.reload(); await ready(canvas, backend)
      await showObjects(page)
      await page.getByTestId('index-gpu-star').click(); await ready(preview, backend)
      await capture(page, preview, info, `${backend}-stellar-class-${spectralClass}.png`)
    }
    // A failed local model still has an interactive fallback; a later mount
    // fetches the available asset and clears fallback copy within this budget.
    const assetURL = '**/models/space/orbital-station.glb'
    await page.route(assetURL, route => route.fulfill({ status: 404, body: 'Asset unavailable' }))
    await page.reload(); await ready(canvas, backend)
    await showObjects(page)
    await page.getByTestId('index-gpu-station').click()
    await ready(station.locator('canvas'), backend)
    await expect(station.getByRole('status')).toHaveText('Simplified model preview.')
    await capture(page, station.locator('canvas'), info, `${backend}-asset-fallback.png`)
    await page.unroute(assetURL)
    await page.reload(); await ready(canvas, backend)
    await showObjects(page)
    await page.getByTestId('index-gpu-station').click()
    await ready(station.locator('canvas'), backend)
    await expect(station.getByRole('status')).toHaveText('')
    await capture(page, station.locator('canvas'), info, `${backend}-asset-successful-reopen.png`)
    expect(failures).toEqual([])
  })

  test(`WebGPU migration journey — ${backend} galaxy initial failure, retry, camera and device recovery`, async ({ page }, info) => {
    await configure(page, backend, true)
    await page.route(url => url.pathname === '/v1/galaxy', route => route.fulfill({ json: galaxy }))
    const failures = errors(page)
    await page.goto('/')
    await expect(page.getByTestId('renderer-unsupported')).toBeVisible()
    await expect(page.getByTestId('galaxy-view')).toBeVisible()
    await expect(page.getByTestId('inspector')).toBeVisible()
    await page.evaluate(() => { (window as unknown as { __webgpuJourney: BrowserEvidence }).__webgpuJourney.block = false })
    await page.getByTestId('renderer-retry').click()
    const canvas = page.getByTestId('galaxy-graph').locator('canvas')
    await ready(canvas, backend)
    await capture(page, canvas, info, `${backend}-galaxy-initial-unavailable-retry.png`)
    const hoverBox = await canvas.boundingBox()
    await page.mouse.move(hoverBox!.x + hoverBox!.width / 2, hoverBox!.y + hoverBox!.height / 2)
    await expect(page.getByTestId('galaxy-graph').getByText('GPU center', { exact: true })).toBeVisible()
    await info.attach(`${backend}-galaxy-bridge-hover.png`, { body: await page.screenshot(), contentType: 'image/png' })
    await page.getByTestId('galaxy-recenter').click()
    const box = await canvas.boundingBox()
    await page.mouse.move(box!.x + box!.width * 0.55, box!.y + box!.height * 0.6)
    await page.mouse.down(); await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.65, { steps: 3 }); await page.mouse.up()
    await page.mouse.wheel(0, -100)
    await lose(page, canvas, backend)
    await expect(page.getByTestId('renderer-interrupted')).toBeVisible()
    await expect(page.getByTestId('inspector')).toBeVisible()
    await page.getByTestId('renderer-retry').click()
    await ready(canvas, backend)
    await capture(page, canvas, info, `${backend}-galaxy-recovered.png`)
    expect(failures).toEqual([])
  })

  test(`WebGPU migration journey — ${backend} Intel and continuous-space spikes render and navigate`, async ({ page }, info) => {
    await configure(page, backend)
    const failures = errors(page)
    for (const [route, id] of [['/spike/intel', 'intel-gl-stage'], ['/spike/space-3d', 'space-gl-stage']] as const) {
      await page.goto(route)
      const canvas = page.getByTestId(id).locator('canvas')
      await ready(canvas, backend)
      await capture(page, canvas, info, `${backend}-${id}.png`)
      const box = await canvas.boundingBox()
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
      await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 45, box!.y + box!.height / 2 + 20, { steps: 3 }); await page.mouse.up()
      await page.mouse.wheel(0, -100)
      await capture(page, canvas, info, `${backend}-${id}-camera.png`)
    }
    await page.goto('/')
    await ready(page.getByTestId('galaxy-graph').locator('canvas'), backend)
    expect(failures).toEqual([])
  })
}
