import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('preserves the accepted 624c4ff title and close visual rules verbatim', () => {
  const css = readFileSync('components/hud/hud-card-shell.module.css', 'utf8')
  const original = readFileSync('components/hud/__fixtures__/original-card-chrome.css', 'utf8')
  const start = css.indexOf('.title {')
  expect(css.slice(start, css.indexOf('.body {', start)).trim()).toBe(original.trim())
  expect(css).not.toContain('.mobileHeader')
})
