import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { seededSystemId } from '../helpers/seeded-world'
import type { SystemSpace } from '../../lib/types/system-space'

test.use({ video: 'on', launchOptions: { args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] } })

const systemId = seededSystemId(0)
// Same palette, four fixed cloud morphologies: fine, broad, wispy, stormy.
const ids = ['cloud-study-182', 'cloud-study-185', 'cloud-study-26', 'cloud-study-2500']
const fixture: SystemSpace = {
  systemId, extent: 180, character: 'calm', starClass: 'G', worldTime: 0, scale: 0,
  features: [
    { id: 'cloud-study-star', type: 'star', size: 2, space: { X: 0, Y: 0, Z: -8 } },
    ...ids.map((id, i) => ({ id, type: 'gas_giant', size: 4, space: { X: i % 2 === 0 ? -24 : 24, Y: 0, Z: i < 2 ? -20 : 20 } })),
  ],
  laneGates: [], contacts: [],
}

for (const backend of ['webgpu', 'webgl2'] as const) {
  test(`${backend}: distinct cloud structures animate and respect reduced motion`, async ({ page }, testInfo) => {
    if (backend === 'webgl2') await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (/shader error|VALIDATE_STATUS|THREE\.WebGLProgram|maximum update depth/i.test(message.text())) errors.push(message.text())
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route(url => url.pathname === `/v1/systems/${systemId}`, route => route.fulfill({ json: fixture }))
    await page.route(url => url.pathname === '/v1/fleets', route => route.fulfill({ json: { fleets: [], worldTime: 0, scale: 0 } }))
    await page.goto(`/systems/${systemId}`)
    if (backend === 'webgpu') {
      const available = await page.evaluate(async () => {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
        return !!(await gpu?.requestAdapter())
      })
      test.skip(!available, 'No native WebGPU adapter; WebGL2 runs separately')
    }
    const canvas = page.getByTestId('space-canvas')
    await expect(canvas).toHaveAttribute('data-renderer-backend', backend)
    await expect(canvas).toHaveAttribute('data-renderer-ready', 'true')
    await expect(page.getByTestId('space-loading')).toBeHidden()
    const capture = async (name: string) => {
      const filename = `${backend}-${name}.png`
      const file = testInfo.outputPath(filename)
      await page.screenshot({ path: file })
      await testInfo.attach(filename, { path: file, contentType: 'image/png' })
      if (process.env.GAS_CLOUD_CAPTURE_DIR) {
        fs.mkdirSync(process.env.GAS_CLOUD_CAPTURE_DIR, { recursive: true })
        fs.copyFileSync(file, path.join(process.env.GAS_CLOUD_CAPTURE_DIR, filename))
      }
    }
    await capture('cloud-families')
    const storm = page.getByTestId(`body-hit-${ids[3]}`)
    await storm.focus(); await storm.press('Enter')
    await expect(storm).toHaveAttribute('aria-pressed', 'true')
    const clip = (await storm.boundingBox())!
    const frozen = await page.screenshot({ clip })
    await page.waitForTimeout(350)
    expect(await page.screenshot({ clip })).toEqual(frozen)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.waitForTimeout(4000)
    expect(await page.screenshot({ clip })).not.toEqual(frozen)
    await capture('cloud-motion')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const paused = await page.screenshot({ clip })
    await page.waitForTimeout(350)
    expect(await page.screenshot({ clip })).toEqual(paused)
    expect(errors).toEqual([])
    const video = page.video()
    await page.close()
    if (video && process.env.GAS_CLOUD_CAPTURE_DIR) await video.saveAs(path.join(process.env.GAS_CLOUD_CAPTURE_DIR, `${backend}-cloud-motion.webm`))
  })
}
