import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { createPreviewGateway } from './gateway.mjs'
import { injectLiveConfig, liveClientMessage } from './live-frontend.mjs'

const origin = 'https://preview.example'
test('live HMR admits client chunks, never arbitrary module paths or dev commands', () => {
  for (const path of ['static/chunks/app_page.js', 'static/chunks/[turbopack]_client.js'])
    assert.ok(liveClientMessage(JSON.stringify({ type: 'turbopack-subscribe', path })))
  for (const path of ['../.env', 'server/app/page.js', 'static/chunks/../server.js', 'static/chunks/%2e%2e/secret.js'])
    assert.equal(liveClientMessage(JSON.stringify({ type: 'turbopack-subscribe', path })), null)
  assert.equal(liveClientMessage('{broken'), null)
  assert.equal(liveClientMessage(JSON.stringify({ event: 'browser-logs', entries: [] })), null)
  assert.equal(liveClientMessage(JSON.stringify({ event: 'open-in-editor' })), null)
  assert.equal(liveClientMessage(JSON.stringify({ event: 'client-success', secret: 'discard' })), '{"event":"client-success"}')
  assert.match(injectLiveConfig('<html><head></head></html>', origin, 'demo-project'), /hexaverse-phone-preview/)
})

test('live relay preserves allowed HMR, denies other origins/routes, and closes streams at expiry without stopping upstream', async () => {
  const frontend = http.createServer((_req, res) => res.end('<html><head></head><body>live</body></html>'))
  const ws = new WebSocket.Server({ server: frontend })
  const received = []
  ws.on('connection', client => {
    client.send(JSON.stringify({ action: 'turbopack-connected' }))
    client.on('message', data => { received.push(JSON.parse(data.toString())); client.send(data.toString()) })
  })
  frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening')
  const gateway = createPreviewGateway({ previewOrigin: origin, frontendPort: frontend.address().port,
    liveProject: 'demo-project', expiresAt: new Date(Date.now() + 1800).toISOString() })
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening')
  const address = `ws://127.0.0.1:${gateway.address().port}`
  const sockets = []
  try {
    for (const [route, requestOrigin, code] of [['/_next/webpack-hmr', 'https://evil.example', 403], ['/_next/webpack-hmr?x=1', origin, 404], ['/debug', origin, 404]]) {
      const denied = new WebSocket(address + route, { origin: requestOrigin }); sockets.push(denied)
      const [, response] = await once(denied, 'unexpected-response'); assert.equal(response.statusCode, code)
      denied.on('error', () => {}); denied.terminate()
    }
    const client = new WebSocket(address + '/_next/webpack-hmr', { origin }); sockets.push(client)
    const connected = once(client, 'message'); await once(client, 'open')
    assert.match((await connected)[0].toString(), /turbopack-connected/)
    const echoed = once(client, 'message')
    client.send(JSON.stringify({ type: 'turbopack-subscribe', path: 'static/chunks/app.js' }))
    assert.match((await echoed)[0].toString(), /app.js/)
    client.send(JSON.stringify({ type: 'turbopack-subscribe', path: 'server/secret.js' }))
    await once(client, 'close')
    assert.equal(received.length, 1)
    assert.equal(frontend.listening, true)
    assert.equal(gateway.listening, false)
  } finally {
    for (const client of sockets) { client.on('error', () => {}); client.terminate() }
    gateway.closeAllConnections(); gateway.close()
    for (const client of ws.clients) client.terminate()
    await new Promise(resolve => ws.close(resolve))
    await new Promise(resolve => frontend.close(resolve))
  }
})
