import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('preserves the accepted 624c4ff title and close geometry with shared typography', () => {
  const css = readFileSync('components/hud/hud-card-shell.module.css', 'utf8')
  const original = readFileSync('components/hud/__fixtures__/original-card-chrome.css', 'utf8')
  const start = css.indexOf('.title {')
  const tokenizedOriginal = original.replace(
    /  font-family:.*\n  font-size:.*\n  font-weight:.*\n  line-height:.*\n  letter-spacing:.*\n/,
    '  font: var(--hud-chrome-font);\n  letter-spacing: var(--hud-label-tracking);\n',
  )
  expect(css.slice(start, css.indexOf('.body {', start)).trim()).toBe(tokenizedOriginal.trim())
  expect(css).not.toContain('.mobileHeader')
})
