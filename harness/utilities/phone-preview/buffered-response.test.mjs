import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { createPreviewGateway } from './gateway.mjs'

test('interrupted live HTML/JSON yields complete HTTP 502, records redacted diagnostics, then recovers', async () => {
  let interrupted = true
  const records = []
  const frontend = http.createServer((request, response) => {
    const json = request.url === '/index.json'
    response.setHeader('content-type', json ? 'application/json' : 'text/html')
    if (interrupted) {
      response.setHeader('content-length', '1000')
      response.write(json ? '{"partial":' : '<html><head>')
      setTimeout(() => response.destroy(), 5)
    } else response.end(json ? '{"entries":{}}' : '<html><head></head><body>Recovered</body></html>')
  })
  frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening')
  const gateway = createPreviewGateway({ previewOrigin: 'https://preview.example', liveProject: 'demo-project',
    frontendPort: frontend.address().port, liveStorybookPort: frontend.address().port,
    expiresAt: new Date(Date.now() + 60000).toISOString(), onTransportError: record => records.push(record) })
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening')
  try {
    for (const path of ['/login', '/storybook/iframe.html', '/storybook/index.json']) {
      interrupted = true
      const response = await fetch(`http://127.0.0.1:${gateway.address().port}${path}`)
      assert.equal(response.status, 502)
      assert.equal(await response.text(), 'Preview upstream unavailable')
      interrupted = false
      const healthy = await fetch(`http://127.0.0.1:${gateway.address().port}${path}`)
      assert.equal(healthy.status, 200); await healthy.text()
    }
    assert.equal(records.length, 3)
    assert.ok(records.every(record => record.event === 'upstream_truncated' && record.status === 502 && record.receivedBytes > 0))
    assert.deepEqual(records.map(record => record.pathname), ['/login', '/storybook/:asset', '/storybook/:asset'])
    assert.ok(records.every(record => !('headers' in record) && !('url' in record)))
  } finally {
    gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve))
    frontend.closeAllConnections(); await new Promise(resolve => frontend.close(resolve))
  }
})
