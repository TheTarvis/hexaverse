import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('preserves the accepted 624c4ff title and close geometry with shared typography', () => {
  const css = readFileSync('components/hud/hud-card-shell.module.css', 'utf8')
  const original = readFileSync('components/hud/__fixtures__/original-card-chrome.css', 'utf8')
  const start = css.indexOf('.title {')
  const tokenizedOriginal = original.replace(
    /  font-family:.*\n  font-size:.*\n  font-weight:.*\n  line-height:.*\n  letter-spacing:.*\n/,
    '  font: var(--hud-chrome-font);\n  letter-spacing: var(--hud-label-tracking);\n',
  ).replace('  min-height: 0;\n  padding: 4px;', '  min-width: 0;\n  min-height: 0;\n  padding: 4px;').replace(
    /\.shell \.close:hover \{[^}]+\}\n\n\.shell \.close:focus-visible \{[^}]+\}\n\n/,
    '', // Shared HudControls now owns hover and focus; retain the accepted glyph and box.
  )
  expect(css.slice(start, css.indexOf('.body {', start)).trim()).toBe(tokenizedOriginal.trim())
  expect(css).not.toContain('.mobileHeader')
})
