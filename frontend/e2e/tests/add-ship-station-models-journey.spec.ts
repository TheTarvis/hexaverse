import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { seededSystemId } from '../helpers/seeded-world'
import type { SystemSpace } from '../../lib/types/system-space'
import type { Fleet, FleetList } from '../../lib/types/fleet'

// One static, served-wire fixture on the actual authenticated system route.
// Only reads/preview quotes are intercepted; no game mutation or showcase route.
const systemId = seededSystemId(0)
const fleetId = 'art-own-fleet'
const inspectedFleetId = 'art-inspected-fleet'
const stationId = 'art-orbital-station'
const position = { X: -3, Y: 0, Z: 1 }
const fleet: Fleet = {
  id: fleetId, corporationId: 'art-corporation', systemId, own: true,
  worldTime: 0, scale: 0, position,
  state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: position } },
  roster: { ships: [{ class: 'hauler' }], cargo: { fuel: 100 }, cargoCapacity: 200, freeHold: 100, miningRate: 0, estimatedRange: 500, stranded: false, fuelPricePerTon: 10 },
}
const inspectedPosition = { X: 7, Y: 0, Z: 5 }
const inspectedFleet: Fleet = { ...fleet, id: inspectedFleetId, position: inspectedPosition, state: { ...fleet.state!, Park: { ...fleet.state!.Park!, Point: inspectedPosition } } }
const fleets: FleetList = { fleets: [fleet, inspectedFleet,
  { ...fleet, id: 'art-remote-fleet', systemId: 'sys_99_99' },
  { ...fleet, id: 'art-transit-fleet', jump: { laneId: 'art-lane', destSystemId: 'sys_99_99', departMs: 0, arriveMs: 999999 } },
], worldTime: 0, scale: 0 }
const fixture: SystemSpace = {
  systemId, extent: 100, character: 'calm', starClass: 'G', worldTime: 0, scale: 0,
  features: [
    { id: 'art-star', type: 'star', size: 2.4, space: { X: -12, Y: 0, Z: -15 } },
    { id: stationId, type: 'station', size: 1, space: { X: 3, Y: 0, Z: 0 } },
    { id: 'art-planet', type: 'gas_giant', size: 1.7, space: { X: 11, Y: 0, Z: -9 } },
  ],
  laneGates: [], contacts: [{ position: { X: 0, Y: 0, Z: -6 }, velocity: { X: 1, Y: 0, Z: 0 }, emitting: true, scanning: true }],
}

// Screenshots document actual GPU output for visual review; assertions alone
// cannot certify art quality. Renderer/controller races are covered in Vitest.
test('Scenario: local models and isolated previews survive interaction, failure and reopening', async ({ page }, testInfo) => {
  const errors: string[] = [], mutations: string[] = [], modelRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (/THREE\.WebGLProgram|shader error|VALIDATE_STATUS|maximum update depth/i.test(message.text())) errors.push(message.text())
  })
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/models/space/')) modelRequests.push(url.pathname)
    if (request.method() !== 'GET' && /\/v1\/(fleets|actions)\//.test(url.pathname) && !url.pathname.endsWith('/preview')) mutations.push(url.pathname)
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(url => url.pathname === `/v1/systems/${systemId}`, route => route.fulfill({ json: fixture }))
  await page.route(url => url.pathname === '/v1/fleets', route => route.fulfill({ json: fleets }))
  await page.route(url => fleets.fleets.some(item => url.pathname === `/v1/fleets/${item.id}`), route => route.fulfill({ json: fleets.fleets.find(item => new URL(route.request().url()).pathname === `/v1/fleets/${item.id}`) }))
  await page.route(url => fleets.fleets.some(item => url.pathname === `/v1/fleets/${item.id}/scan-targets`), route => route.fulfill({ json: { targets: [], worldTime: 0 } }))
  await page.route(url => url.pathname === '/v1/actions', route => route.fulfill({ json: { actions: [] } }))
  await page.route(url => fleets.fleets.some(item => url.pathname === `/v1/fleets/${item.id}/orders/preview`), route => route.fulfill({ json: { controlPoints: [position, { X: 3, Y: 0, Z: 0 }], departMs: 0, arriveMs: 10000, deltaV: 1, fuelCostTons: 1, affordable: true, strandingWarning: false } }))
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  let stationFailure = false
  await page.route('**/models/space/*.glb', async route => {
    await held
    const filename = path.basename(new URL(route.request().url()).pathname)
    if (stationFailure && filename === 'orbital-station.glb') { await route.fulfill({ status: 404, body: 'Asset unavailable' }); return }
    await route.fulfill({ contentType: 'model/gltf-binary', body: fs.readFileSync(path.join(process.cwd(), 'public/models/space', filename)) })
  })
  const capture = async (name: string) => {
    const file = testInfo.outputPath(name)
    await page.screenshot({ path: file })
    await testInfo.attach(name, { path: file, contentType: 'image/png' })
  }
  const region = page.getByTestId('space-canvas-region')
  const canvas = page.getByTestId('space-canvas')
  const stationHit = page.getByTestId(`body-hit-${stationId}`)
  const acting = page.getByTestId(`fleet-mark-${fleetId}`)
  const stationDetails = page.getByRole('complementary', { name: `Details for ${stationId}` })
  const preview = stationDetails.getByTestId('spacecraft-preview-surface')
  async function openStationDetails() {
    const toggle = page.getByTestId('system-index-toggle')
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
    const stationRow = page.getByTestId(`index-${stationId}`)
    await expect(stationRow).toBeVisible({ timeout: 10_000 })
    await stationRow.focus({ timeout: 10_000 })
    await stationRow.press('Enter', { timeout: 10_000 })
    await expect(preview).toBeVisible()
  }

  await page.goto(`/systems/${systemId}`)
  await expect(canvas).toBeVisible()
  await expect(page.getByTestId('space-loading')).toBeHidden()
  await expect(page.getByTestId('renderer-unsupported')).toHaveCount(0)
  await expect(acting).toHaveAttribute('data-acting', 'true')
  await expect(page.locator('[data-testid^="contact-mark-"]')).toHaveCount(1)
  await stationHit.focus(); await stationHit.press('Enter')
  await expect(region).toHaveAttribute('data-selection', stationId)
  await openStationDetails()
  await expect(stationDetails.getByRole('status')).toHaveText(/Loading model preview/i)
  await expect(stationDetails.getByRole('button', { name: /Focus art-orbital-station/ })).toBeEnabled()
  const box = await preview.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(180); expect(box?.height).toBeLessThanOrEqual(220)
  await capture('01-pending-interactive-fallback.png')
  release()
  await expect(stationDetails.getByRole('status')).toHaveText('')
  await capture('02-station-map-and-detail.png')
  const initialPreview = await preview.locator('canvas').screenshot()
  // Canvas screenshots include overlaid panels, so compare authoritative map
  // state rather than composited pixels for preview input isolation.
  const stableCamera = await region.getAttribute('data-camera')
  await preview.focus(); await preview.press('ArrowRight'); await preview.press('ArrowUp')
  const keyboardPose = await preview.locator('canvas').screenshot()
  expect(keyboardPose.equals(initialPreview)).toBe(false)
  await expect(region).toHaveAttribute('data-camera', stableCamera!)
  await expect(region).toHaveAttribute('data-selection', stationId)
  await expect(acting).toHaveAttribute('data-acting', 'true')
  await preview.press('Home')
  // Controller tests pin exact reset quaternion; browser proves the control
  // changes the rendered pose without brittle pixel-identity across focus.
  expect((await preview.locator('canvas').screenshot()).equals(keyboardPose)).toBe(false)
  const drag = await preview.boundingBox()
  await page.mouse.move(drag!.x + drag!.width / 2, drag!.y + drag!.height / 2)
  await page.mouse.down(); await page.mouse.move(drag!.x + drag!.width / 2 + 40, drag!.y + drag!.height / 2 + 15, { steps: 3 }); await page.mouse.up()
  const draggedPose = await preview.locator('canvas').screenshot()
  expect(draggedPose.equals(initialPreview)).toBe(false)
  await stationDetails.getByRole('button', { name: 'Reset view' }).click()
  expect((await preview.locator('canvas').screenshot()).equals(draggedPose)).toBe(false)
  await expect(region).toHaveAttribute('data-camera', stableCamera!)
  await expect(region).toHaveAttribute('data-selection', stationId)
  await expect(acting).toHaveAttribute('data-acting', 'true')
  await page.getByTestId('details-back').click()
  await expect(page.getByTestId('spacecraft-preview-surface')).toHaveCount(0)
  await page.getByTestId('system-index-toggle').click()

  // Exercise hit testing AFTER camera changes, not only in default framing.
  const orbit = page.getByRole('group', { name: 'Orbit the camera with arrow keys; hold Shift and press arrow keys to pan', exact: true })
  const beforeOrbit = await stationHit.getAttribute('style')
  await orbit.focus(); await orbit.press('ArrowRight')
  await expect.poll(() => stationHit.getAttribute('style')).not.toBe(beforeOrbit)
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await stationHit.focus(); await stationHit.press('Enter') // clear current selection
  await expect(region).not.toHaveAttribute('data-selection', stationId)
  const target = await stationHit.boundingBox()
  await page.mouse.click(target!.x + target!.width / 2, target!.y + target!.height / 2)
  await expect(region).toHaveAttribute('data-selection', stationId)
  await stationHit.focus(); await stationHit.press('Enter')
  await expect(region).not.toHaveAttribute('data-selection', stationId)
  await stationHit.press('Enter')
  await expect(region).toHaveAttribute('data-selection', stationId)
  await expect(acting).toHaveAttribute('data-acting', 'true')

  // Inspect B while A acts and the station remains the gameplay target.
  await page.getByTestId('system-index-toggle').click()
  await expect(page.getByTestId('system-index-toggle')).toContainText('Objects · 5')
  await expect(page.getByTestId('index-fleet-art-remote-fleet')).toHaveCount(0)
  await expect(page.getByTestId('index-fleet-art-transit-fleet')).toHaveCount(0)
  const fleetRow = page.getByTestId(`index-fleet-${inspectedFleetId}`)
  await fleetRow.focus(); await fleetRow.press('Enter')
  const fleetDetails = page.getByRole('complementary', { name: `Details for ${inspectedFleetId}` })
  const objectPreview = fleetDetails.getByTestId('spacecraft-preview-surface')
  await expect(objectPreview).toBeVisible(); await expect(fleetDetails.getByRole('status')).toHaveText('')
  await expect(acting).toHaveAttribute('data-acting', 'true')
  await expect(page.getByTestId(`fleet-mark-${inspectedFleetId}`)).toHaveAttribute('data-acting', 'false')
  await expect(region).toHaveAttribute('data-selection', stationId)
  await expect(fleetDetails.getByTestId('details-plot')).toHaveCount(0)
  const beforeInspect = await region.getAttribute('data-camera')
  await objectPreview.focus(); await objectPreview.press('ArrowLeft')
  await expect(region).toHaveAttribute('data-camera', beforeInspect!)
  await objectPreview.press('Escape')
  await expect(fleetDetails).toHaveCount(0); await expect(fleetRow).toBeFocused()
  await page.getByTestId('system-index-toggle').click()
  // Now ACTUALLY activate B using its map affordance; target remains the station.
  const secondMark = page.getByTestId(`fleet-mark-${inspectedFleetId}`)
  await secondMark.focus(); await secondMark.press('Enter')
  await expect(secondMark).toHaveAttribute('data-acting', 'true')
  await expect(acting).toHaveAttribute('data-acting', 'false')
  await expect(region).toHaveAttribute('data-selection', stationId)
  // Restore A through the same real activation path for the chevron leg.
  await acting.focus(); await acting.press('Enter')
  await expect(acting).toHaveAttribute('data-acting', 'true')

  const chevron = page.getByTestId('vitals-fleet-chevron')
  await chevron.focus(); await chevron.press('Enter')
  const inspectCurrent = page.getByRole('menuitem', { name: `Inspect current fleet ${fleetId}`, exact: true })
  await inspectCurrent.focus(); await inspectCurrent.press('Enter')
  const inspector = page.getByRole('region', { name: `Fleet ${fleetId} details` })
  await expect(inspector).toBeVisible()
  await expect(inspector.getByRole('button', { name: 'Close fleet details' })).toBeFocused()
  await expect(inspector.getByRole('status')).toHaveText('')
  const shipPreview = inspector.getByTestId('spacecraft-preview-surface')
  await shipPreview.focus(); await shipPreview.press('ArrowLeft')
  await expect(region).toHaveAttribute('data-selection', stationId)
  await expect(acting).toHaveAttribute('data-acting', 'true')
  await shipPreview.press('Escape')
  await expect(inspector).toHaveCount(0); await expect(chevron).toBeFocused()
  await expect(page.getByTestId('spacecraft-preview-surface')).toHaveCount(0)

  // Lose the MAP context and use the existing Retry, without a page reload.
  await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('Browser cannot exercise map context loss')
    extension.loseContext()
  })
  await expect(page.getByTestId('renderer-interrupted')).toBeVisible()
  await page.getByTestId('renderer-retry').click()
  await expect(page.getByTestId('renderer-interrupted')).toHaveCount(0)
  await expect(page.getByTestId('renderer-unsupported')).toHaveCount(0)
  await expect(acting).toHaveAttribute('data-acting', 'true')
  await expect(stationHit).toBeVisible()
  await expect(region).toHaveAttribute('data-selection', stationId)

  stationFailure = true
  await page.reload()
  await expect(canvas).toBeVisible(); await expect(page.getByTestId('space-loading')).toBeHidden()
  await openStationDetails()
  await expect(stationDetails.getByRole('status')).toHaveText(/Simplified model preview/i)
  await expect(page.getByTestId('renderer-unsupported')).toHaveCount(0)
  await expect(stationDetails.getByRole('button', { name: /Focus art-orbital-station/ })).toBeEnabled()
  await capture('06-local-asset-failure-fallback.png')
  // Lose only the preview's real context; the system canvas remains independent.
  await preview.locator('canvas').evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')
    if (!gl?.getExtension('WEBGL_lose_context')) throw new Error('Browser cannot exercise preview context loss')
    gl.getExtension('WEBGL_lose_context')!.loseContext()
  })
  await expect(stationDetails.getByRole('status')).toHaveText(/interrupted/i)
  await expect(canvas).toBeVisible(); await expect(page.getByTestId('renderer-unsupported')).toHaveCount(0)
  await expect(page.getByTestId('details-back')).toBeEnabled()
  stationFailure = false
  await page.reload(); await expect(page.getByTestId('space-loading')).toBeHidden(); await openStationDetails()
  await expect(stationDetails.getByRole('status')).toHaveText('')
  await capture('07-successful-reopen.png')
  expect(modelRequests).toContain('/models/space/utility-ship.glb')
  expect(modelRequests).toContain('/models/space/orbital-station.glb')
  expect(mutations).toEqual([])
  expect(errors).toEqual([])
})
