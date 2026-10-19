import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { createLiveStorybook, storybookClientMessage } from './live-storybook.mjs'
import { createPreviewGateway } from './gateway.mjs'

const origin = 'https://preview.example'
test('module graph admits referenced browser modules, confines imports and blocks filesystem/control escapes', () => {
  const live = createLiveStorybook({ port: 20203, origin, expired: () => false })
  assert.equal(live.route('GET', '/storybook/components/Fixture.tsx'), null)
  const source = 'import "/@vite/client"; import "./components/Fixture.tsx"; const regex = /"\\/bad"/;'
  const transformed = live.transform(Buffer.from(source), '/entry.js', 'text/javascript')
  assert.match(transformed, /"\/storybook\/@vite\/client"/)
  assert.ok(transformed.includes('const regex = /"\\/bad"/'))
  assert.equal(live.route('GET', '/storybook/components/Fixture.tsx?t=1').path, '/components/Fixture.tsx?t=1')
  for (const target of ['/storybook/components/Other.tsx', '/storybook/@fs/etc/passwd', '/storybook/@fs/Users/travis/.ssh/config',
    '/storybook/.env.local', '/storybook/__open-in-editor', '/storybook/__nextjs_launch-editor', '/storybook/components/Fixture.tsx?raw',
    '/storybook/components/%2e%2e/secrets.json', '/storybook/components/../secrets.json', '/storybook/components/%252e%252e/secrets.json']) {
    assert.equal(live.route('GET', target), null, target)
  }
  assert.equal(live.route('POST', '/storybook/iframe.html'), null)
  const html = live.transform(Buffer.from('<head><script type="module" src="/@vite/client"></script></head>'), '/iframe.html', 'text/html')
  assert.match(html, /\/storybook\/@vite\/client/)
  assert.match(html, /\/storybook\/__hmr/)
})

test('server channel permits only sanitized read-only follower initialization', () => {
  const message = { type: 'UNIVERSAL_STORE:storybook/status', from: 'client123', args: [{ event: { type: '__EXISTING_STATE_REQUEST', command: 'discard' }, eventInfo: { actor: { id: 'actor123', type: 'FOLLOWER', environment: 'MANAGER' } } }] }
  const accepted = storybookClientMessage(JSON.stringify(message), 'manager')
  assert.ok(accepted); assert.ok(!accepted.includes('discard'))
  assert.equal(storybookClientMessage(JSON.stringify(message), 'preview'), null)
  message.args[0].event.type = 'UPDATE_STATE'
  assert.equal(storybookClientMessage(JSON.stringify(message), 'manager'), null)
  for (const type of ['openInEditor', 'runTests', 'requestWhatsNewData', 'UNIVERSAL_STORE:custom'])
    assert.equal(storybookClientMessage(JSON.stringify({ type, from: 'client123', args: [] }), 'manager'), null)
})

test('gateway confines live Storybook and expires open update sockets while leaving upstream running', async () => {
  const received = [], frontend = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html'); response.end('<html><head></head><body>Live fixture</body></html>')
  })
  const ws = new WebSocket.Server({ server: frontend })
  ws.on('connection', client => { client.send(JSON.stringify({ type: 'connected' })); client.on('message', data => received.push(JSON.parse(data.toString()))) })
  frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening')
  const gateway = createPreviewGateway({ previewOrigin: origin, liveProject: 'demo-project', liveStorybookPort: frontend.address().port, expiresAt: new Date(Date.now() + 1500).toISOString() })
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening')
  const url = `http://127.0.0.1:${gateway.address().port}`
  let client
  try {
    assert.equal((await fetch(url + '/storybook/')).status, 200)
    for (const route of ['/storybook/@fs/etc/passwd', '/storybook/__open-in-editor', '/@vite/client', '/storybook/.env']) assert.equal((await fetch(url + route)).status, 404)
    client = new WebSocket(url.replace('http:', 'ws:') + '/storybook/storybook-server-channel?token=fixture&page=manager', { origin })
    const message = once(client, 'message'); await once(client, 'open'); await message
    client.send(JSON.stringify({ type: 'runTests', from: 'client', args: [] }))
    client.send(JSON.stringify({ type: 'channelCreated', from: 'client', args: [] }))
    await once(client, 'close')
    assert.deepEqual(received, [{ type: 'channelCreated', from: 'client', args: [] }])
    assert.equal(gateway.listening, false); assert.equal(frontend.listening, true)
  } finally {
    client?.terminate(); gateway.closeAllConnections(); gateway.close()
    for (const client of ws.clients) client.terminate()
    await new Promise(resolve => ws.close(resolve)); await new Promise(resolve => frontend.close(resolve))
  }
})
