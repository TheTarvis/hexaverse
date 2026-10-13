import { test, expect } from '@playwright/test'
import { seededSystemId } from '../helpers/seeded-world'
import type { SystemSpace } from '../../lib/types/system-space'

// One isolated wire fixture, no database mutation and no production showcase.
// Real authenticated route, real camera controls, real picking and WebGL scene.
// Screenshots are review artifacts: test success alone is NOT art acceptance.
const systemId = seededSystemId(0)
const fixture: SystemSpace = {
  systemId, extent: 300, character: 'calm', starClass: 'G', worldTime: 0, scale: 0,
  features: [
    { id: 'art-star', type: 'star', size: 5, space: { X: 0, Y: 0, Z: 0 } },
    { id: 'art-rocky', type: 'rocky', size: 3, space: { X: -24, Y: 0, Z: 8 } },
    { id: 'art-gas', type: 'gas_giant', size: 5, space: { X: 28, Y: 0, Z: -12 } },
    { id: 'art-ice', type: 'ice', size: 2, space: { X: 4, Y: 0, Z: 40 } },
  ],
  laneGates: [], contacts: [],
}

test('Scenario: scene art survives selection, camera changes and remount with real WebGL', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/THREE\.WebGLProgram|shader error|VALIDATE_STATUS|maximum update depth/i.test(message.text())) errors.push(message.text())
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route((url) => url.pathname === `/v1/systems/${systemId}`, (route) => route.fulfill({ json: fixture }))
  await page.goto(`/systems/${systemId}`)
  const canvas = page.getByTestId('space-canvas')
  await expect(canvas).toBeVisible()
  await expect(page.getByTestId('renderer-unsupported')).toHaveCount(0)
  await expect(page.getByTestId('body-hit-art-rocky')).toBeAttached()
  await testInfo.attach('scene-default.png', { body: await page.screenshot(), contentType: 'image/png' })

  const rocky = page.getByTestId('body-hit-art-rocky')
  await rocky.focus()
  await rocky.press('Enter')
  await expect(rocky).toHaveAttribute('aria-pressed', 'true')
  await testInfo.attach('scene-rocky-selected.png', { body: await page.screenshot(), contentType: 'image/png' })

  const initialPosition = await rocky.getAttribute('style')
  const orbit = page.getByRole('group', { name: 'Orbit the camera with arrow keys; hold Shift and press arrow keys to pan', exact: true })
  await orbit.focus()
  await orbit.press('ArrowRight')
  await expect.poll(() => rocky.getAttribute('style')).not.toBe(initialPosition)
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await testInfo.attach('scene-close.png', { body: await page.screenshot(), contentType: 'image/png' })
  for (let i = 0; i < 18; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await testInfo.attach('scene-far.png', { body: await page.screenshot(), contentType: 'image/png' })
  await expect(rocky).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Recenter', exact: true }).click()
  await orbit.focus()
  await orbit.press('Shift+ArrowRight')
  await page.getByRole('button', { name: "Select the point at the camera's centre", exact: true }).click()
  await expect(page.getByTestId('point-selection-mark')).toBeAttached()
  await page.reload()
  await expect(canvas).toBeVisible()
  await expect(page.getByTestId('body-hit-art-rocky')).toBeAttached()
  await expect(page.getByTestId('body-hit-art-gas')).toBeAttached()
  await testInfo.attach('scene-remount.png', { body: await page.screenshot(), contentType: 'image/png' })
  expect(errors).toEqual([])
})
