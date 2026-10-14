import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { seededSystemId } from '../helpers/seeded-world'
import type { SystemSpace } from '../../lib/types/system-space'

test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] } })

const systemId = seededSystemId(0)
const fixture: SystemSpace = {
  systemId, extent: 180, character: 'calm', starClass: 'G', worldTime: 0, scale: 0,
  features: [
    { id: 'visibility-star', type: 'star', size: 3, space: { X: 0, Y: 0, Z: 0 } },
    { id: 'station-shadow', type: 'station', size: 1.5, space: { X: 14, Y: 0, Z: 22 } },
    { id: 'station-sunlit', type: 'station', size: 1.5, space: { X: -14, Y: 0, Z: -22 } },
  ],
  laneGates: [], contacts: [],
}

for (const backend of ['webgpu', 'webgl2'] as const) {
  test(`${backend}: imported stations remain selectable through normal and closer lighting views`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (/shader error|VALIDATE_STATUS|THREE\.WebGLProgram|maximum update depth/i.test(message.text())) errors.push(message.text())
    })
    if (backend === 'webgl2') await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }))
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
      test.skip(!available, 'No native WebGPU adapter; fallback runs separately')
    }
    const canvas = page.getByTestId('space-canvas')
    await expect(canvas).toHaveAttribute('data-renderer-backend', backend)
    await expect(canvas).toHaveAttribute('data-renderer-ready', 'true')
    await expect(page.getByTestId('space-loading')).toBeHidden()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Recenter', exact: true }).click()
    const camera = page.getByRole('group', { name: 'Orbit the camera with arrow keys; hold Shift and press arrow keys to pan', exact: true })
    const capture = async (name: string) => {
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      const filename = `${backend}-${name}.png`
      const file = testInfo.outputPath(filename)
      await page.screenshot({ path: file })
      await testInfo.attach(filename, { path: file, contentType: 'image/png' })
      if (process.env.STATION_VISIBILITY_CAPTURE_DIR) {
        fs.mkdirSync(process.env.STATION_VISIBILITY_CAPTURE_DIR, { recursive: true })
        fs.copyFileSync(file, path.join(process.env.STATION_VISIBILITY_CAPTURE_DIR, filename))
      }
    }
    await capture('normal-high')
    await camera.focus()
    for (let i = 0; i < 9; i++) await camera.press('ArrowDown')
    await capture('normal-low')
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await capture('close-low')
    const sunlit = page.getByTestId('body-hit-station-sunlit')
    await sunlit.focus(); await sunlit.press('Enter')
    await expect(sunlit).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(canvas).toHaveAttribute('data-renderer-ready', 'true')
    expect(errors).toEqual([])
  })
}
