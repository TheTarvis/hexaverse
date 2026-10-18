// Real local Storybook controls: no auth, identity, uploads or game API calls.
const { chromium, webkit } = require('../../frontend/node_modules/playwright')
const assert = require('node:assert/strict')
const origin = process.env.QA_STORY_ORIGIN || 'http://127.0.0.1:20203'
async function read(page) {
 return page.locator('input,select,textarea').evaluateAll(fields => fields.filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => {
  const s = getComputedStyle(e), r = e.getBoundingClientRect(), transforms = []
  for (let n = e; n; n = n.parentElement) { const a = getComputedStyle(n); if (a.transform !== 'none' || a.scale !== 'none' || a.zoom !== '1') transforms.push({ transform: a.transform, scale: a.scale, zoom: a.zoom }) }
  return { label: e.getAttribute('aria-label'), font: parseFloat(s.fontSize), placeholderFont: parseFloat(getComputedStyle(e, '::placeholder').fontSize), focused: e === document.activeElement, disabled: e.disabled, invalid: e.getAttribute('aria-invalid'), ratio: r.width / e.offsetWidth, transforms }
 }))
}
async function run(type, options, name) {
 const browser = await type.launch({ headless: true, ...options })
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage()
  await page.goto(origin + '/iframe.html?id=forms-mobile-input-sizing--all-states&viewMode=story')
  await page.getByLabel('Invalid field', { exact: true }).waitFor()
  for (const size of [{ width: 320, height: 667 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
   await page.setViewportSize(size)
   const fields = await read(page); assert.equal(fields.length, 17)
   for (const field of fields) { assert.ok(field.font >= 16, JSON.stringify(field)); assert.ok(field.ratio >= .99, JSON.stringify(field)) }
   assert.equal(fields.find(f => f.label === 'Invalid field').invalid, 'true'); assert.equal(fields.find(f => f.label === 'Disabled field').disabled, true)
   for (const label of ['text', 'search', 'email', 'password', 'number', 'tel', 'url', 'date', 'datetime-local', 'month', 'time', 'week', 'Invalid field', 'Read-only field', 'Draft message', 'Resource']) {
    const field = page.getByLabel(label, { exact: true }); await field.focus()
    const computed = (await read(page)).find(f => f.label === label); assert.ok(computed.focused && computed.font >= 16 && computed.ratio >= .99, JSON.stringify(computed))
   }
   await page.getByRole('button', { name: 'Open naming dialog', exact: true }).click()
   const dialog = page.getByLabel('Portalled name', { exact: true }); await dialog.waitFor()
   // Wait for the existing entrance animation to settle; no form has autofocus.
   await page.waitForTimeout(150); await page.getByLabel('Portalled name', { exact: true }).focus()
   const portalled = (await read(page)).find(f => f.label === 'Portalled name'); assert.ok(portalled.font >= 16 && portalled.ratio >= .99, JSON.stringify(portalled))
   await page.screenshot({ path: '/tmp/hexaverse-ios-' + name.toLowerCase() + '-portalled-' + size.width + '.png' })
   await page.getByRole('button', { name: 'Close naming dialog', exact: true }).click(); await dialog.waitFor({ state: 'hidden' })
   console.log(name, 'mobile shared control rest/focus/invalid/disabled/readonly/placeholder/dialog PASS', size.width, JSON.stringify(fields))
  }
  await context.close()
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false }), p = await desktop.newPage()
  await p.goto(origin + '/iframe.html?id=forms-mobile-input-sizing--all-states&viewMode=story'); await p.getByLabel('Invalid field', { exact: true }).waitFor()
  for (const field of await read(p)) assert.equal(field.font, 14, 'Original desktop control typography: ' + JSON.stringify(field))
  console.log(name, 'desktop original14px typography PASS; native iOS automatic zoom/keyboard not simulated')
  await desktop.close()
 } finally { await browser.close() }
}
;(async () => { await run(chromium, {}, 'Chromium'); await run(webkit, { executablePath: '/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh' }, 'WebKit') })().catch(e => { console.error(e); process.exitCode = 1 })
