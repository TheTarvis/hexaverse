#!/usr/bin/env node
// Run from the repository root: node harness/utilities/render-hud-thumbnails.mjs
// Uses existing Vite/Playwright installations and game art; no application server needed.
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const frontend = path.join(root, 'frontend')
const requireFrontend = createRequire(path.join(frontend, 'package.json'))
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href)
const { chromium } = requireFrontend('@playwright/test')
const output = path.join(frontend, 'components/hud/thumbnails')
const server = await createServer({
  configFile: false,
  root: frontend,
  resolve: { alias: { '@': frontend }, dedupe: ['three'] },
  // Freeze the Three module graph before loading a GLB. Mid-capture dependency
  // discovery can replace constructors while an older loader is still active.
  optimizeDeps: {
    noDiscovery: true,
    include: ['react', 'three', 'three/webgpu', 'three/tsl', 'three/addons/loaders/GLTFLoader.js', 'three/addons/utils/BufferGeometryUtils.js'],
  },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'hud-thumbnail-page',
    configureServer(server) {
      server.middlewares.use('/__hud-thumbnail-renderer', (_req, res) => {
        res.setHeader('Content-Type', 'text/html')
        res.end(`<!doctype html><html><body style="margin:0"><canvas style="display:block;width:128px;height:128px"></canvas>
          <script type="module">
            import { renderHudThumbnail } from '/components/hud/thumbnail-source.ts';
            window.renderHudThumbnail = async kind => {
              window.disposeHudThumbnail?.();
              window.disposeHudThumbnail = await renderHudThumbnail(kind, document.querySelector('canvas'));
            };
          </script></body></html>`)
      })
    },
  }],
})

let browser
try {
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Thumbnail server has no TCP address')
  browser = await chromium.launch()
  await mkdir(output, { recursive: true })
  for (const kind of ['fleet', 'station', 'rocky', 'resource-site', 'star', 'gas_giant', 'ice', 'moon']) {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 })
    page.on('pageerror', error => console.error(error))
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()) })
    try {
      await page.goto(`http://127.0.0.1:${address.port}/__hud-thumbnail-renderer`)
      await page.waitForFunction(() => typeof window.renderHudThumbnail === 'function')
      await page.evaluate(kind => window.renderHudThumbnail(kind), kind)
      await page.locator('canvas').screenshot({ path: path.join(output, `${kind}.png`), omitBackground: true })
      await page.evaluate(() => window.disposeHudThumbnail?.())
      console.log(`Rendered ${kind}.png (128px source for 32px HUD display)`)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser?.close()
  await server.close()
}
