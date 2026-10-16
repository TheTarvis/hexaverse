/** Build static Storybook for the gateway prefix. Does not run a server or tunnel. */
import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOptions, previewEnvironment } from './frontend.mjs'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../frontend')
export const storybookOutput = resolve(frontendDir, '.storybook/phone-preview-static')

/** Check real manager/iframe HTML references after building, without browser/network access. */
export async function auditStorybookOutput(directory = storybookOutput) {
  const references = new Set()
  for (const name of ['index.html', 'iframe.html']) {
    const source = await readFile(resolve(directory, name), 'utf8')
    for (const match of source.matchAll(/<(?:script|link|img|iframe)\b[^>]*?\b(?:src|href)=["']([^"']+)["']|url\(["']?([^\s)'";]+)["']?\)/g)) {
      const reference = match[1] ?? match[2]
      if (/^(https?:|data:|#)/.test(reference)) continue
      const url = new URL(reference, `https://preview.invalid/storybook/${name}`)
      if (!url.pathname.startsWith('/storybook/')) throw new Error(`${name} escapes Storybook prefix: ${url.pathname}`)
      const path = resolve(directory, decodeURIComponent(url.pathname.slice('/storybook/'.length)))
      if (relative(directory, path).startsWith('..') || !(await stat(path)).isFile()) throw new Error(`${name} asset is unavailable: ${url.pathname}`)
      references.add(url.pathname)
    }
  }
  const index = JSON.parse(await readFile(resolve(directory, 'index.json'), 'utf8'))
  if (!index.entries?.['hud-object-thumbnails--feature-comparison'] || !index.entries?.['graphics-world-gate--feature-lineup-close']) throw new Error('Expected HUD/world review stories missing from static index.')
  return [...references].sort()
}

async function main() {
  // Reuse project validation, but this utility builds only; no start/deploy action.
  const options = parseOptions(['build', ...process.argv.slice(2)])
  const child = spawn(process.execPath, [resolve(frontendDir, 'node_modules/storybook/bin/index.cjs'), 'build', '--output-dir', storybookOutput, '--disable-telemetry'], {
    cwd: frontendDir,
    env: { ...previewEnvironment(options.projectId), PHONE_PREVIEW_STORYBOOK: 'true', STORYBOOK_DISABLE_TELEMETRY: '1' },
    stdio: 'inherit',
  })
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', code => accept(code ?? 1)) })
  if (code !== 0) { process.exitCode = code; return }
  const references = await auditStorybookOutput()
  console.log(`Static Storybook ready: ${references.length} manager/iframe asset references verified under /storybook/. Browser review remains required.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
